import { app, ipcMain, powerSaveBlocker, shell } from "electron"
import { basename, join } from "path"
import { statSync } from "fs"
import { homedir } from "os"
import {
    AfterRecordingAction,
    CaptureOptions,
    DisplayInfo,
    MIC_NONE,
    Rect,
    RecorderSettings,
    RecordingStatus,
    StartRecordingResponse,
    VideoCodec,
} from "@/deinitions/recorder.ts"
import { ExposedRecorder, ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowAll, getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { getAriaArea } from "@/window/utils/aria-geometry.ts"
import { appName } from "@/utils/utilsForMain.ts"
import { ensurePermissions, handleCaptureError } from "@/permissions.ts"
import { logger } from "@/utils/logger.ts"
import { planCapture } from "@/recorder/capture-plan.ts"
import { captureBridge } from "@/recorder/capture-bridge.ts"
import { findDisplay, getDisplays, isDisplayConnected, watchDisplays } from "@/recorder/displays.ts"
import { RecordingFile } from "@/recorder/recording-file.ts"
import { runCountdown } from "@/recorder/countdown.ts"
import { recordingPreview } from "@/recorder/recording-preview.ts"
import { recentRecordings } from "@/recorder/recent-recordings.ts"
import { SettingsStore, sanitizeSettings } from "@/recorder/settings-store.ts"

/**
 * Жизненный цикл записи: idle → starting → recording ⇄ paused → stopping → idle.
 * Любое состояние, кроме idle, — «занято»: новая запись не стартует, пока предыдущая не сохранена.
 */
type RecorderState = "idle" | "starting" | "recording" | "paused" | "stopping"

export interface StopRecordingOptions {
    // показать файл в Finder после сохранения (по умолчанию да)
    reveal?: boolean
}

// Окно записи не ответило на stop — закрываем файл с тем, что успело прийти
const STOP_TIMEOUT_MS = 20_000

const pad = (value: number) => `${value}`.padStart(2, "0")

/** REC_01-11-2026_14_17_46.mp4 */
function createFileName(date = new Date()) {
    const day = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`
    const time = `${pad(date.getHours())}_${pad(date.getMinutes())}_${pad(date.getSeconds())}`
    return `REC_${day}_${time}.mp4`
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export class ScreenRecorder {
    private static instance: ScreenRecorder
    private state: RecorderState = "idle"
    private readonly store: SettingsStore
    private settings: RecorderSettings

    // Текущая запись
    private file: RecordingFile | null = null
    private activeDisplayId: number | undefined
    private stopRequestedWhileStarting = false
    private revealAfterStop = true
    private stopWaiters: (() => void)[] = []

    // Время записи без пауз
    private recordingStartTime = 0
    private totalPausedTime = 0
    private pauseStartTime = 0
    private statusTimer: ReturnType<typeof setInterval> | null = null

    // Запрет App Nap на время записи: приложение живёт в фоне без окон
    private powerSaveBlockerId: number | null = null

    private constructor() {
        const defaultOutputPath = join(homedir(), "Desktop", appName)
        this.store = new SettingsStore(join(app.getPath("userData"), "dst-settings.json"), defaultOutputPath)
        this.settings = this.store.load()
    }

    public static getInstance(): ScreenRecorder {
        if (!ScreenRecorder.instance) ScreenRecorder.instance = new ScreenRecorder()
        return ScreenRecorder.instance
    }

    public init() {
        captureBridge.init()
        recentRecordings.setFolder(this.settings.outputPath)
        watchDisplays(() => this.onDisplaysChanged())
    }

    // ---------------------------------------------------------------------
    // Настройки и мониторы
    // ---------------------------------------------------------------------

    getSettings(): RecorderSettings {
        return this.settings
    }

    /** Настройки из окон: приводятся к корректному виду, сохраняются и рассылаются всем окнам */
    setSettings(settings?: Partial<RecorderSettings>) {
        if (!settings) return
        const next = sanitizeSettings({ ...this.settings, ...settings }, this.settings.outputPath)
        this.settings = { ...next, outputPath: this.store.ensureOutputDir(next.outputPath) }
        this.store.save(this.settings)
        recentRecordings.setFolder(this.settings.outputPath)
        this.broadcastSettings()
    }

    getDisplays(): DisplayInfo[] {
        return getDisplays()
    }

    /** Монитор из настроек, а если он отключён — основной */
    getSelectedDisplay(): DisplayInfo {
        return findDisplay(this.settings.displayId)
    }

    private broadcastSettings() {
        getWindowAll().forEach((item) => {
            if (item && !item.isDestroyed()) item.webContents.send(ExposedRecorder.UPDATED_SETTINGS, this.settings)
        })
        ipcMain.emit(ExposedRecorder.UPDATED_SETTINGS, null, this.settings)
    }

    private onDisplaysChanged() {
        const recordedDisplayGone = this.isCapturing()
            && this.activeDisplayId !== undefined
            && !isDisplayConnected(this.activeDisplayId)
        if (recordedDisplayGone) {
            logger.warn("[Recorder] Recorded display was disconnected — stopping recording")
            void this.stopRecording()
        }
        // Окна настроек перечитают список мониторов
        this.broadcastSettings()
    }

    // ---------------------------------------------------------------------
    // Состояние
    // ---------------------------------------------------------------------

    public isBusy(): boolean {
        return this.state !== "idle"
    }

    public getIsRecording(): boolean {
        return this.isCapturing()
    }

    private isCapturing() {
        return this.state === "recording" || this.state === "paused"
    }

    getRecordingStatus(): RecordingStatus {
        const isRecording = this.isCapturing()
        return {
            isRecording,
            isPaused: this.state === "paused",
            duration: isRecording ? Math.floor(this.getActiveDurationMs() / 1000) : 0,
        }
    }

    private getActiveDurationMs(): number {
        if (!this.recordingStartTime) return 0
        const now = Date.now()
        const currentPause = this.state === "paused" ? now - this.pauseStartTime : 0
        return Math.max(now - this.recordingStartTime - this.totalPausedTime - currentPause, 0)
    }

    private emitStatus() {
        ipcMain.emit(ExposedRecorder.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }

    // ---------------------------------------------------------------------
    // Запись
    // ---------------------------------------------------------------------

    /** Ошибки возвращаются как { error }, а не через reject: через ipcMain.handle reject стал бы исключением в окне */
    async startRecording(): Promise<StartRecordingResponse> {
        if (this.state !== "idle") {
            const isSaving = this.state === "stopping"
            return { error: isSaving ? "Previous recording is still being saved" : "Recording is already in progress" }
        }

        this.state = "starting"
        this.stopRequestedWhileStarting = false
        this.revealAfterStop = true
        // Миниатюра прошлой записи не должна попасть в новую
        recordingPreview.hide()

        try {
            const settings = this.settings
            const useMicrophone = settings.micDeviceId !== MIC_NONE
            const isPermitted = await ensurePermissions({ microphone: useMicrophone })
            if (!isPermitted) return this.failStart("Permissions required.")
            if (this.stopRequestedWhileStarting) return this.failStart("Recording was cancelled")

            const { display, area } = this.resolveTarget()
            // Отсчёт — до открытия файла и захвата: отмена (Esc, повторное нажатие, «Стоп») не оставляет файла
            const isCountdownDone = await runCountdown(
                settings.countdownSeconds,
                display,
                () => this.stopRequestedWhileStarting,
            )
            if (!isCountdownDone) return this.failStart("Recording was cancelled")

            const plan = planCapture(display, settings.defSize, settings.fps, area, settings)
            const options: CaptureOptions = {
                width:              plan.width,
                height:             plan.height,
                fps:                settings.fps,
                crop:               plan.crop,
                videoBitsPerSecond: plan.videoBitsPerSecond,
                videoCodec:         settings.videoCodec,
                micDeviceId:        settings.micDeviceId,
                micLabel:           settings.micLabel,
                recordSystemAudio:  settings.recordSystemAudio,
            }

            const outputDir = this.store.ensureOutputDir(settings.outputPath)
            this.file = await RecordingFile.open(join(outputDir, createFileName()))
            this.activeDisplayId = display.id
            recentRecordings.setRecordingPath(this.file.path)

            logger.info(`[Recorder] Start: display "${display.label}" (${display.id}), area ${JSON.stringify(area)}, `
                + `output ${plan.outputWidth}×${plan.outputHeight}@${settings.fps}, ${settings.videoCodec}, `
                + `${settings.compression}, up to ${plan.videoBitsPerSecond} bit/s`)
            const onEnded = (reason: string) => this.onCaptureEnded(reason)
            const info = await captureBridge.start(display.id, options, this.file, onEnded)
            logger.info("[Recorder] Capture started:", info)
            if (settings.videoCodec === VideoCodec.Hevc && !info.mimeType.includes("hvc1")) {
                logger.warn("[Recorder] HEVC is not supported by this system — recording in H.264")
            }

            this.state = "recording"
            this.recordingStartTime = Date.now()
            this.totalPausedTime = 0
            this.pauseStartTime = 0
            this.keepAwake()
            this.startStatusTimer()
            this.startForAria()
            this.startBorderHighlight(display)
            this.emitStatus()

            const path = this.file.path
            if (this.stopRequestedWhileStarting) void this.stopRecording()
            return { outputPathAndFileName: path }
        } catch (error) {
            const message = errorMessage(error)
            logger.error("[Recorder] Start failed:", message)
            handleCaptureError(message)
            captureBridge.abort()
            return this.failStart(message)
        }
    }

    /** Монитор и область записи: открытое окно выбора области важнее монитора из настроек */
    private resolveTarget(): { display: DisplayInfo, area: Rect | null } {
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (ariaWin && !ariaWin.isDestroyed() && ariaWin.isVisible()) return getAriaArea(ariaWin)
        return { display: this.getSelectedDisplay(), area: null }
    }

    private async failStart(error: string): Promise<StartRecordingResponse> {
        const file = this.file
        this.file = null
        await file?.close()
        recentRecordings.setRecordingPath(null)
        this.activeDisplayId = undefined
        this.stopRequestedWhileStarting = false
        this.state = "idle"
        this.flushStopWaiters()
        return { error }
    }

    /** Промис завершается, когда файл полностью сохранён */
    stopRecording(options: StopRecordingOptions = {}): Promise<{ error?: string }> {
        if (this.state === "idle") return Promise.resolve({ error: "No recording in progress" })
        if (options.reveal === false) this.revealAfterStop = false

        const done = new Promise<{ error?: string }>((resolve) => {
            this.stopWaiters.push(() => resolve({}))
        })

        if (this.state === "starting") {
            this.stopRequestedWhileStarting = true
        } else if (this.isCapturing()) {
            void this.finishRecording()
        }
        return done
    }

    private async finishRecording() {
        // Длительность и экран — до сброса состояния: они нужны миниатюре после записи
        const durationMs = this.getActiveDurationMs()
        const displayId = this.activeDisplayId
        this.state = "stopping"
        this.stopStatusTimer()
        try {
            await withTimeout(captureBridge.stop(), STOP_TIMEOUT_MS, "Capture window did not stop in time")
        } catch (error) {
            logger.error("[Recorder] Stop error:", errorMessage(error))
            captureBridge.abort()
        }

        const file = this.file
        this.file = null
        const result = await file?.close()
        if (file?.error) logger.error("[Recorder] File was not written completely:", file.error)
        recentRecordings.setRecordingPath(null)

        this.resetAfterRecording()
        if (this.revealAfterStop && file && result?.saved) this.onRecordingSaved(file.path, durationMs, displayId)
        this.flushStopWaiters()
    }

    /** Запись сохранена: в список последних записей трея и, по настройке, миниатюра или Finder */
    private onRecordingSaved(path: string, durationMs: number, displayId?: number) {
        let sizeBytes = 0
        try {
            sizeBytes = statSync(path).size
        } catch (error) {
            logger.warn("[Recorder] Cannot read file size:", error)
        }
        const info = { path, fileName: basename(path), durationMs, sizeBytes, displayId }
        recentRecordings.add(info)

        const action = this.settings.afterRecording
        if (action === AfterRecordingAction.Finder) shell.showItemInFolder(path)
        else if (action === AfterRecordingAction.Preview) void recordingPreview.show(info)
    }

    /** Захват оборвался сам (экран отключён, доступ отозван, сбой окна записи) — сохраняем то, что записано */
    private onCaptureEnded(reason: string) {
        if (this.state === "starting") {
            this.stopRequestedWhileStarting = true
            return
        }
        if (!this.isCapturing()) return
        logger.warn(`[Recorder] Capture ended unexpectedly (${reason}) — saving the file`)
        handleCaptureError(reason)
        void this.stopRecording()
    }

    pauseRecording() {
        if (this.state !== "recording") return { error: "Cannot pause" }
        this.state = "paused"
        this.pauseStartTime = Date.now()
        captureBridge.pause().catch(error => logger.error("[Recorder] Pause failed:", errorMessage(error)))
        this.emitStatus()
        return {}
    }

    resumeRecording() {
        if (this.state !== "paused") return { error: "Cannot resume" }
        this.state = "recording"
        this.totalPausedTime += Date.now() - this.pauseStartTime
        this.pauseStartTime = 0
        captureBridge.resume().catch(error => logger.error("[Recorder] Resume failed:", errorMessage(error)))
        this.emitStatus()
        return {}
    }

    /** Для will-quit: before-quit уже дождался сохранения, здесь — страховка без ожидания */
    public abort() {
        if (this.state === "idle") return
        logger.warn("[Recorder] Abort on quit")
        captureBridge.abort()
        this.file?.destroy()
        this.file = null
        this.releaseAwake()
    }

    /** Сброс области и рамки, когда записи нет (например, закрыли таймер) */
    resetByStop() {
        if (this.state !== "idle") return
        this.stopForAria()
        this.stopBorderHighlight()
        this.emitStatus()
    }

    private resetAfterRecording() {
        this.state = "idle"
        this.activeDisplayId = undefined
        this.recordingStartTime = 0
        this.totalPausedTime = 0
        this.pauseStartTime = 0
        this.releaseAwake()
        this.stopForAria()
        this.stopBorderHighlight()
        this.emitStatus()
    }

    private flushStopWaiters() {
        const waiters = this.stopWaiters
        this.stopWaiters = []
        waiters.forEach(resolve => resolve())
    }

    private startStatusTimer() {
        this.stopStatusTimer()
        this.statusTimer = setInterval(() => this.emitStatus(), 1000)
    }

    private stopStatusTimer() {
        if (!this.statusTimer) return
        clearInterval(this.statusTimer)
        this.statusTimer = null
    }

    private keepAwake() {
        if (this.powerSaveBlockerId === null) this.powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension")
    }

    private releaseAwake() {
        if (this.powerSaveBlockerId === null) return
        powerSaveBlocker.stop(this.powerSaveBlockerId)
        this.powerSaveBlockerId = null
    }

    // ---------------------------------------------------------------------
    // Окна области и рамки
    // ---------------------------------------------------------------------

    private startForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (!ariaWin || ariaWin.isDestroyed() || !ariaWin.isVisible()) return

        ariaWin.setIgnoreMouseEvents(true)
        ariaWin.setMovable(false)
        ariaWin.setResizable(false)

        // Во время записи области управление — из трея (там же идёт время записи)
        const timerWin = getWindowByName(WindowName.Timer)
        if (timerWin && !timerWin.isDestroyed() && timerWin.isVisible()) timerWin.hide()
    }

    private stopForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (ariaWin && !ariaWin.isDestroyed()) {
            ariaWin.setIgnoreMouseEvents(false)
            ariaWin.setMovable(true)
            ariaWin.setResizable(true)
            ariaWin.hide()
        }

        const timerWin = getWindowByName(WindowName.Timer)
        if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send(ExposedWinSelectAria.SET_ARIA_ACTIVE, false)
    }

    private startBorderHighlight(display: DisplayInfo) {
        if (!this.settings.showBorder) return
        const borderWin = getWindowByName(WindowName.Border)
        if (!borderWin || borderWin.isDestroyed()) return

        borderWin.setBounds(display.bounds)
        borderWin.setAlwaysOnTop(true, "screen-saver")
        borderWin.setVisibleOnAllWorkspaces(true)
        borderWin.setIgnoreMouseEvents(true, { forward: true })
        borderWin.showInactive()
    }

    private stopBorderHighlight() {
        const borderWin = getWindowByName(WindowName.Border)
        if (borderWin && !borderWin.isDestroyed()) borderWin.hide()
    }
}

export const screenRecorder = ScreenRecorder.getInstance()
