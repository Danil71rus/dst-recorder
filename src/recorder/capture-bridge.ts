import { desktopCapturer, ipcMain, IpcMainEvent, session } from "electron"
import { CaptureInfo, CaptureOptions, CaptureReply, CaptureResult } from "@/deinitions/recorder.ts"
import { ExposedCapture } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { RecordingFile } from "@/recorder/recording-file.ts"
import { logger } from "@/utils/logger.ts"

/**
 * Связь main с окном записи (src/capture/). Сам захват и кодирование делает Chromium:
 * экран — getDisplayMedia (ScreenCaptureKit), звук компьютера — там же через audio: "loopback"
 * (на macOS 14.2+ это Core Audio Tap, нужен ключ NSAudioCaptureUsageDescription в Info.plist),
 * микрофон — getUserMedia, видео — аппаратный H.264 в MediaRecorder.
 * Main выбирает экран, получает готовые кусочки MP4 и пишет их в файл.
 */

// Последний кусочек MediaRecorder отдаёт сразу после stop(); если он не пришёл за это время — файл закрывается без него
const LAST_CHUNKS_TIMEOUT_MS = 10_000

export class CaptureBridge {
    private static instance: CaptureBridge
    private isInitialized = false
    // Экран для ближайшего запроса getDisplayMedia
    private displayId: number | undefined
    private file: RecordingFile | null = null
    private onEnded: ((reason: string) => void) | null = null
    // Процесс окна записи упал: сессии захвата больше нет, останавливать нечего
    private isSessionLost = false

    private constructor() {}

    public static getInstance(): CaptureBridge {
        if (!CaptureBridge.instance) CaptureBridge.instance = new CaptureBridge()
        return CaptureBridge.instance
    }

    init() {
        if (this.isInitialized) return
        this.isInitialized = true

        // Окно записи не показывает системный выбор экрана: экран и звук компьютера выбирает main
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
            desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
                .then((sources) => {
                    const source = sources.find(item => item.display_id === String(this.displayId))
                    if (!source) {
                        logger.error(`[Capture] Screen source not found for display ${this.displayId}`)
                        callback({})
                        return
                    }
                    logger.info(`[Capture] Screen source: ${source.name} (display ${source.display_id})`)
                    callback(request.audioRequested ? { video: source, audio: "loopback" } : { video: source })
                })
                .catch((error) => {
                    logger.error("[Capture] Failed to get screen sources:", error)
                    callback({})
                })
        })

        ipcMain.on(ExposedCapture.CHUNK, (event, data: Uint8Array) => {
            if (!this.isFromCaptureWindow(event)) return
            if (this.file) this.file.write(data)
            else logger.warn("[Capture] Chunk without an active recording — dropped")
        })

        ipcMain.on(ExposedCapture.ENDED, (event, reason: string) => {
            if (!this.isFromCaptureWindow(event)) return
            this.reportEnded(String(reason))
        })
    }

    reportEnded(reason: string) {
        logger.warn(`[Capture] Capture ended: ${reason}`)
        this.onEnded?.(reason)
    }

    /** Процесс окна записи упал: в файле остаётся то, что уже пришло */
    reportCrash(reason: string) {
        this.isSessionLost = true
        this.reportEnded(reason)
    }

    /** Запускает захват; ошибки (нет доступа, нет устройства) — исключением с текстом от Chromium */
    async start(
        displayId: number,
        options: CaptureOptions,
        file: RecordingFile,
        onEnded: (reason: string) => void,
    ): Promise<CaptureInfo> {
        this.displayId = displayId
        this.file = file
        this.onEnded = onEnded
        this.isSessionLost = false
        try {
            return await this.call<CaptureInfo>(`start(${JSON.stringify(options)})`)
        } catch (error) {
            this.detach()
            throw error
        }
    }

    async pause() {
        await this.call<void>("pause()")
    }

    async resume() {
        await this.call<void>("resume()")
    }

    /** Останавливает захват и ждёт, пока в файл придут все кусочки */
    async stop(): Promise<void> {
        const file = this.file
        if (this.isSessionLost) {
            this.detach()
            return
        }
        try {
            const { chunks } = await this.call<CaptureResult>("stop()")
            if (file && !(await file.waitForChunks(chunks, LAST_CHUNKS_TIMEOUT_MS))) {
                logger.warn(`[Capture] Received ${file.chunksReceived} of ${chunks} chunks — closing without the rest`)
            }
        } finally {
            this.detach()
        }
    }

    /** Остановить без ожидания (выход из приложения, сбой) */
    abort() {
        this.detach()
        this.call("stop()").catch(() => undefined)
    }

    private detach() {
        this.file = null
        this.onEnded = null
        this.displayId = undefined
    }

    private isFromCaptureWindow(event: IpcMainEvent) {
        return event.sender === getWindowByName(WindowName.Capture)?.webContents
    }

    /**
     * Вызов API окна записи. userGesture=true: getDisplayMedia и AudioContext требуют действия пользователя,
     * а окно записи скрыто и кликов не получает
     */
    private async call<T>(expression: string): Promise<T> {
        const captureWindow = getWindowByName(WindowName.Capture)
        if (!captureWindow || captureWindow.isDestroyed()) throw new Error("Capture window is not available")

        const notLoaded = "{ ok: false, error: \"Capture page is not loaded\" }"
        const code = `window.dstCapture ? window.dstCapture.${expression} : ${notLoaded}`
        const reply = await captureWindow.webContents.executeJavaScript(code, true) as CaptureReply<T>
        if (!reply.ok) throw new Error(reply.error)
        return reply.value
    }
}

export const captureBridge = CaptureBridge.getInstance()
