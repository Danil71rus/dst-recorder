import ffmpeg from "fluent-ffmpeg"
import { app, ipcMain, powerSaveBlocker, screen, shell } from "electron"
import { join, dirname } from "path"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs"
import { homedir } from "os"
import { DateTime } from "luxon"
import { execFile } from "child_process"
import FfmpegStatic from "ffmpeg-ffprobe-static"
import {
    FfmpegDevice,
    FfmpegDeviceLists,
    FfmpegDeviceVideo,
    FfmpegSettings,
    getDefaultSettings,
    normalizeSize,
    RecordingStatus,
    StartRecordingResponse,
} from "./deinitions/ffmpeg.ts"
import { ExposedFfmpeg, ExposedWinSelectAria } from "./window/ipc-handlers/definitions/renderer.ts"
import { getWindowAll, getWindowByName, WindowName } from "./window/utils/ipc-controller.ts"
import { getResultScale } from "./window/utils/main.ts"
import { appName } from "./utils/utilsForMain.ts"
import { ensurePermissions, handleCaptureError } from "./permissions.ts"
import { logger } from "./utils/logger.ts"

/**
 * Жизненный цикл записи:
 * idle → starting → recording → stopping → finalizing → idle
 * Любое состояние, кроме idle, считается «занятым»: новая запись не стартует,
 * пока предыдущая не дописана и не финализирована.
 */
type RecorderState = "idle" | "starting" | "recording" | "stopping" | "finalizing"

export interface StopRecordingOptions {
    // показать файл в Finder после сохранения (по умолчанию да)
    reveal?: boolean
}

const DISPLAY_REFRESH_DEBOUNCE_MS = 800
const LIST_DEVICES_TIMEOUT_MS = 15_000
// Если FFmpeg не завершился после 'q' — эскалируем
const STOP_SIGINT_TIMEOUT_MS = 10_000
const STOP_SIGKILL_TIMEOUT_MS = 20_000
const STOP_FORCE_RESET_TIMEOUT_MS = 30_000

const isEven = (n: number) => Number.isInteger(n) && n % 2 === 0

// Агрегатное устройство «микрофон + BlackHole» (см. README): канал 0 — микрофон, канал 2 — системный звук
const AGGREGATE_DEVICE_PREFIX = "Recorder-Input"
const MIC_GAIN = 2.5
const LIMITER_CEILING = 0.95
// Во время записи звук пишется с запасом качества: при финализации он всё равно перекодируется
const AUDIO_BITRATE_LIVE = "256k"
const AUDIO_BITRATE_FINAL = "128k"
// Сдвиг между стартом звука и видео больше этого считаем ошибкой разбора лога и не применяем
const MAX_AV_OFFSET_SECONDS = 5

/**
 * Живая цепочка: сводит звук в стерео (голос и системный звук одинаково в обоих каналах),
 * aresample=async=1 заполняет пропущенные AVFoundation куски по меткам времени, чтобы звук
 * не отставал от видео (FFmpeg #11398), alimiter не даёт усиленному микрофону уйти в клиппинг.
 */
function buildAudioFilters(audio: FfmpegDevice): string[] {
    const isAggregate = audio.name.startsWith(AGGREGATE_DEVICE_PREFIX)
    const mix = isAggregate ? `${MIC_GAIN}*c0+c2` : `${MIC_GAIN}*c0`

    return [
        "aresample=async=1",
        `pan=stereo|c0=${mix}|c1=${mix}`,
        // level=disabled: без этого alimiter сам поднимает громкость до 0 dB
        `alimiter=limit=${LIMITER_CEILING}:level=disabled`,
    ]
}

/**
 * Финализация: adeclick сглаживает щелчки на стыках аудиобуферов. Он тяжёлый, поэтому работает
 * не во время записи, а после неё, и на одном канале — левый и правый всегда одинаковые (см. выше).
 */
const FINALIZE_AUDIO_FILTER = "pan=mono|c0=c0,adeclick,pan=stereo|c0=c0|c1=c0"

/** "  Duration: N/A, start: 51234.567833, bitrate: N/A" → 51234.567833 */
function parseInputStart(line: string): number | null {
    const match = line.match(/Duration:.*\bstart: (-?\d+(?:\.\d+)?)/)
    return match?.[1] ? Number(match[1]) : null
}

function safeUnlink(path: string) {
    try {
        if (existsSync(path)) unlinkSync(path)
    } catch (e) {
        logger.warn("Failed to remove file:", path, e)
    }
}

/** Тот же монитор с тем же физическим разрешением — значит сохранённые crop/offset ещё валидны */
function isSameScreenGeometry(a?: FfmpegDeviceVideo, b?: FfmpegDeviceVideo) {
    return !!a && !!b
        && a.displayId !== undefined
        && a.displayId === b.displayId
        && a.scaleMax?.width === b.scaleMax?.width
        && a.scaleMax?.height === b.scaleMax?.height
}

/** crop/scale/offset чётные, ненулевые и не выходят за физические границы экрана */
function isGeometryValid(settings: FfmpegSettings, video: FfmpegDeviceVideo) {
    const maxW = video.scaleMax?.width || 0
    const maxH = video.scaleMax?.height || 0
    const { crop, offset, scale } = settings
    if (!crop || !offset || !scale) return false

    return crop.w >= 2 && crop.h >= 2 && scale.w >= 2 && scale.h >= 2
        && [crop.w, crop.h, scale.w, scale.h, offset.x, offset.y].every(isEven)
        && offset.x >= 0 && offset.y >= 0
        && offset.x + crop.w <= maxW
        && offset.y + crop.h <= maxH
}

export class ScreenRecorder {
    private static instance: ScreenRecorder
    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null
    private finalizeCommand: ffmpeg.FfmpegCommand | null = null
    private state: RecorderState = "idle"

    public outputPathAndFileName: string = ""
    // Запись
    public recordingStartTime: number = 0
    public isRecording: boolean = false
    private recordingInterval: ReturnType<typeof setTimeout> | null = null
    // Монитор, который сейчас записывается (для реакции на его отключение)
    private activeDisplayId: number | undefined
    // Пауза
    public isPaused: boolean = false
    public totalPausedTime: number = 0
    private pauseStartTime: number = 0
    private pendingTrimDuration: number | null = null
    // Остановка
    private stopRequestedWhileStarting = false
    private stopWaiters: (() => void)[] = []
    private stopTimers: ReturnType<typeof setTimeout>[] = []
    private revealAfterFinalize = true
    // Время старта входов FFmpeg (видео — #0, звук — #1) по часам системы: из них считается
    // сдвиг звука относительно видео, который применяется при финализации
    private inputStartTimes: (number | null)[] = []
    // Запрет App Nap на время записи (см. keepAwake)
    private powerSaveBlockerId: number | null = null

    // Мониторы
    private displayEventsSubscribed = false
    private displayRefreshTimer: ReturnType<typeof setTimeout> | null = null
    private refreshAfterStop = false
    private devicesPromise: Promise<FfmpegDeviceLists> | null = null

    public devicesList: FfmpegDeviceLists = {
        video: [],
        audio: [],
    }

    public settings: FfmpegSettings = {
        ...getDefaultSettings(),
        outputPath: join(homedir(), "Desktop", appName),
    }

    // Текущие настройки сохраняем в
    private readonly settingsFilePath = join(app.getPath("userData"), "dst-settings.json")

    public readonly ffmpegBinaryPath: string | null = null

    private constructor() {
        this.settings = this.getInitialSettings()
        this.ensureOutputDir()

        this.ffmpegBinaryPath = this.initializeFfmpegPath()
        if (this.ffmpegBinaryPath) {
            ffmpeg.setFfmpegPath(this.ffmpegBinaryPath)
        } else {
            logger.error("CRITICAL: FFmpeg binary not found. Recording will fail.")
        }
    }

    public static getInstance(): ScreenRecorder {
        if (!ScreenRecorder.instance) ScreenRecorder.instance = new ScreenRecorder()
        return ScreenRecorder.instance
    }

    // ---------------------------------------------------------------------
    // Настройки
    // ---------------------------------------------------------------------

    private getDefaultOutputPath() {
        return join(homedir(), "Desktop", appName)
    }

    private getInitialSettings(): FfmpegSettings {
        const defaultSettings: FfmpegSettings = {
            ...getDefaultSettings(),
            outputPath: this.getDefaultOutputPath(),
        }

        const persisted = this.loadSettingsFromFile()
        if (!persisted) return defaultSettings

        return {
            ...defaultSettings,
            ...persisted,
            outputPath: persisted.outputPath || defaultSettings.outputPath,
        }
    }

    /** Папка из настроек может быть недоступна (отключённый внешний диск) — не падаем, а откатываемся к дефолтной */
    private ensureOutputDir() {
        try {
            mkdirSync(this.settings.outputPath, { recursive: true })
        } catch (error) {
            const fallback = this.getDefaultOutputPath()
            logger.warn(`Output folder is not available: ${this.settings.outputPath}. Fallback: ${fallback}`, error)
            this.settings = { ...this.settings, outputPath: fallback }
            try {
                mkdirSync(fallback, { recursive: true })
            } catch (e) {
                logger.error("Failed to create default output folder:", e)
            }
        }
    }

    private loadSettingsFromFile(): Partial<FfmpegSettings> | null {
        try {
            if (!existsSync(this.settingsFilePath)) return null

            const raw = readFileSync(this.settingsFilePath, "utf-8")
            if (!raw.trim()) return null

            const parsed = JSON.parse(raw) as Partial<FfmpegSettings>
            logger.info("Settings loaded from file:", this.settingsFilePath)
            return parsed
        } catch (error) {
            logger.warn("Failed to load settings from file:", error)
            return null
        }
    }

    private persistSettingsToFile(settings: FfmpegSettings) {
        const tempPath = `${this.settingsFilePath}.tmp`
        try {
            const dir = dirname(this.settingsFilePath)
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

            // Атомарная запись: при падении посреди записи не останется битого JSON
            writeFileSync(tempPath, JSON.stringify(settings, null, 2), "utf-8")
            renameSync(tempPath, this.settingsFilePath)
        } catch (error) {
            logger.warn("Failed to persist settings to file:", error)
            safeUnlink(tempPath)
        }
    }

    private pickVideo(
        input: FfmpegSettings,
        screens: FfmpegDeviceVideo[],
        wantedDisplayId?: number,
    ): FfmpegDeviceVideo | undefined {
        if (wantedDisplayId !== undefined) {
            const byId = screens.find(v => v.displayId === wantedDisplayId)
            if (byId) return byId
        }
        // Старые настройки без displayId или монитор сменил id: ищем по имени, только если оно уникально
        const label = input.video?.label
        if (label) {
            const byLabel = screens.filter(v => v.label === label)
            if (byLabel.length === 1) return byLabel[0]
        }
        // Основной экран (в AVFoundation он всегда "Capture screen 0"). Камеры сюда не попадают — только экраны
        return screens.find(v => v.name.startsWith("Capture screen 0")) || screens[0]
    }

    private pickAudio(input: FfmpegSettings, wantedAudioName?: string): FfmpegDevice | undefined {
        const audios = this.devicesList.audio
        return (wantedAudioName ? audios.find(a => a.name === wantedAudioName) : undefined)
            || audios.find(a => a.name.startsWith(AGGREGATE_DEVICE_PREFIX))
            || audios[0]
            || input.audio
    }

    /**
     * Приводит настройки к актуальному списку устройств.
     * Выбор пользователя хранится в displayId/audioName и не затирается, даже если устройство
     * временно отключено: video/audio получают ближайшую замену, а при возвращении устройства
     * запись снова пойдёт на него. Индексы FFmpeg, bounds и scaleMax всегда берутся из свежего списка.
     */
    private normalizeSettings(input: FfmpegSettings): FfmpegSettings {
        const defSize = normalizeSize(Number(input.defSize))
        const wantedDisplayId = input.displayId ?? input.video?.displayId
        const wantedAudioName = input.audioName ?? input.audio?.name

        const screens = this.devicesList.video.filter(v => v.isScreen && v.scaleMax?.width && v.scaleMax?.height)
        // Список устройств ещё не получен — нормализовать не из чего
        if (!screens.length) return { ...input, defSize, displayId: wantedDisplayId, audioName: wantedAudioName }

        const video = this.pickVideo(input, screens, wantedDisplayId) as FfmpegDeviceVideo
        const audio = this.pickAudio(input, wantedAudioName)

        const keepGeometry = isSameScreenGeometry(input.video, video) && isGeometryValid(input, video)
        const geometry = keepGeometry
            ? { crop: input.crop, offset: input.offset, scale: input.scale, defSizeName: input.defSizeName }
            : { ...getResultScale(video, defSize), offset: { x: 0, y: 0 } }

        if (!keepGeometry && input.video) {
            logger.info(`[Settings] Geometry recalculated for "${video.label}" (${video.name})`)
        }

        return {
            ...input,
            ...geometry,
            defSize,
            displayId: wantedDisplayId ?? video.displayId,
            audioName: wantedAudioName ?? audio?.name,
            video,
            audio,
        }
    }

    getSettings() {
        return this.settings
    }

    setSettings(settings?: FfmpegSettings) {
        if (!settings) return
        this.settings = this.normalizeSettings(settings)
        this.persistSettingsToFile(this.settings)

        getWindowAll()?.forEach(item => {
            if (item && !item.isDestroyed()) item.webContents.send(ExposedFfmpeg.UPDATED_SETTINGS, this.settings)
        })
        ipcMain.emit(ExposedFfmpeg.UPDATED_SETTINGS, null, this.settings)
    }

    // ---------------------------------------------------------------------
    // Устройства и мониторы
    // ---------------------------------------------------------------------

    public async asyncInit() {
        await this.refreshDevices()
        this.subscribeDisplayEvents()
    }

    /** Подписка строго один раз. Раньше подписка жила внутри asyncInit и удваивалась на каждое событие */
    private subscribeDisplayEvents() {
        if (this.displayEventsSubscribed) return
        this.displayEventsSubscribed = true

        screen.on("display-added", () => this.scheduleDisplayRefresh("display-added"))
        screen.on("display-removed", () => this.scheduleDisplayRefresh("display-removed"))
        screen.on("display-metrics-changed", (_event, _display, changedMetrics: string[]) => {
            // workArea меняется от Dock/строки меню — это не влияет на захват
            if (changedMetrics.some(m => m === "bounds" || m === "scaleFactor" || m === "rotation")) {
                this.scheduleDisplayRefresh(`display-metrics-changed: ${changedMetrics.join(",")}`)
            }
        })
    }

    /** При подключении монитора macOS шлёт пачку событий — схлопываем их в одно обновление */
    private scheduleDisplayRefresh(reason: string) {
        logger.info(`[Displays] ${reason}`)
        if (this.displayRefreshTimer) clearTimeout(this.displayRefreshTimer)
        this.displayRefreshTimer = setTimeout(() => {
            this.displayRefreshTimer = null
            void this.onDisplaysChanged()
        }, DISPLAY_REFRESH_DEBOUNCE_MS)
    }

    private async onDisplaysChanged() {
        if (this.state !== "idle") {
            // Во время записи настройки не трогаем — применим после остановки
            this.refreshAfterStop = true

            const recordedDisplayGone = this.state === "recording"
                && this.activeDisplayId !== undefined
                && !screen.getAllDisplays().some(d => d.id === this.activeDisplayId)
            if (recordedDisplayGone) {
                logger.warn("[Displays] Recorded display was disconnected — stopping recording")
                void this.stopRecording()
            }
            return
        }

        await this.refreshDevices()

        // Если открыта рамка области — пересчитываем crop под новую геометрию экранов
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (ariaWin && !ariaWin.isDestroyed() && ariaWin.isVisible()) {
            ipcMain.emit(ExposedWinSelectAria.STOP_MOVE_WINDOW)
        }
    }

    /** Обновить список устройств и привести к нему настройки (только когда не идёт запись) */
    public async refreshDevices(): Promise<FfmpegDeviceLists> {
        const devices = await this.updateAndGetDevices()
        if (this.state === "idle") this.setSettings(this.settings)
        return devices
    }

    public hasDevices() {
        return this.devicesList.video.length > 0 || this.devicesList.audio.length > 0
    }

    public getDevicesList() {
        return this.devicesList
    }

    private initializeFfmpegPath(): string | null {
        const platform = process.platform
        const ffmpegName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg"

        let candidates: string[] = []

        if (app.isPackaged) {
            // Основные кандидаты для прод-сборки
            const staticPath = FfmpegStatic?.ffmpegPath as string | undefined
            const staticUnpacked =
                staticPath && staticPath.includes("app.asar")
                    ? staticPath.replace("app.asar", "app.asar.unpacked")
                    : staticPath

            candidates = [
                // 1) Предпочитаем бинарь внутри Contents/MacOS — тогда TCC чаще относит разрешение к самому приложению
                join(process.resourcesPath, "..", "MacOS", ffmpegName),
                // 2) То же, но через app.getPath('exe') (Contents/MacOS/Dst-Recorder)
                join(dirname(app.getPath("exe")), ffmpegName),
                // 3) extraResources (копируем через scripts/copy-ffmpeg.js)
                join(process.resourcesPath, "bin", ffmpegName),
                // 4) Путь, предоставленный модулем, но с заменой app.asar -> app.asar.unpacked
                staticUnpacked || "",
                // 5) На случай, если бинарь лежит прямо в корне модуля (редко, но проверим)
                join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-ffprobe-static", ffmpegName),
            ].filter(Boolean) as string[]

            logger.info("[FFmpeg] Packaged lookup candidates:", candidates)
        } else {
            // Dev-режим — используем путь из модуля
            const devPath = FfmpegStatic.ffmpegPath
            candidates = [devPath].filter(Boolean) as string[]
            logger.info("[FFmpeg] Dev path:", devPath)
        }

        for (const p of candidates) {
            try {
                const exists = p && existsSync(p)
                logger.info(`[FFmpeg] Checking: ${p} -> ${exists ? "FOUND" : "MISS"}`)
                if (exists) {
                    // На Unix-подобных системах убеждаемся, что бинарь исполняемый
                    try {
                        chmodSync(p, 0o755)
                    } catch { /* noop */ }
                    logger.info("FFmpeg path successfully set to:", p)
                    return p
                }
            } catch (e) {
                logger.warn("[FFmpeg] Error while checking path:", p, e)
            }
        }

        logger.error("CRITICAL: FFmpeg binary not found. Checked:", candidates)
        return null
    }

    /** Одновременные запросы получают один и тот же результат — без пачки параллельных ffmpeg */
    public updateAndGetDevices(): Promise<FfmpegDeviceLists> {
        if (!this.devicesPromise) {
            this.devicesPromise = this.listDevices().finally(() => {
                this.devicesPromise = null
            })
        }
        return this.devicesPromise
    }

    private listDevices(): Promise<FfmpegDeviceLists> {
        // Используем сохраненный путь к ffmpeg, который корректно работает в собранной версии
        const ffmpegPath = this.ffmpegBinaryPath || FfmpegStatic.ffmpegPath
        if (!ffmpegPath) {
            logger.error("FFmpeg path not available for getting devices")
            return Promise.resolve(this.devicesList)
        }

        logger.info("Getting devices with FFmpeg path:", ffmpegPath)

        return new Promise((resolve) => {
            const args = ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]
            execFile(ffmpegPath, args, { timeout: LIST_DEVICES_TIMEOUT_MS }, (error, _stdout, stderr) => {
                // Получаем главный экран (он всегда будет Capture screen 0 в FFmpeg)
                const primaryDisplay = screen.getPrimaryDisplay()
                // Получаем все остальные экраны, исключая главный
                const otherDisplays = screen.getAllDisplays().filter(d => d.id !== primaryDisplay.id)
                // Склеиваем массив: главный экран строго первый (index: 0), остальные за ним
                const orderedDisplays = [primaryDisplay, ...otherDisplays]

                // -list_devices всегда завершается с ошибкой (пустой вход), поэтому ошибка без stderr — реальный сбой
                if (error && !stderr) {
                    logger.error("Error executing FFmpeg list_devices:", error)
                    resolve(this.devicesList)
                    return
                }
                if (stderr?.trim()) {
                    logger.info(`[FFmpeg:list_devices] stderr:\n${stderr}`)
                }

                const result: FfmpegDeviceLists = {
                    video: [],
                    audio: [],
                }

                let currentSection: "video" | "audio" | null = null

                for (const line of stderr.split("\n")) {
                    // Определяем, в какой секции мы находимся
                    if (line.includes("AVFoundation video devices:")) {
                        currentSection = "video"
                        continue
                    } else if (line.includes("AVFoundation audio devices:")) {
                        currentSection = "audio"
                        continue
                    }

                    if (!currentSection) continue

                    // Парсим строку с устройством
                    const deviceMatch = line.match(/\[(\d+)\]\s(.*)/)
                    if (!deviceMatch || !deviceMatch[1] || !deviceMatch[2]) continue

                    const device: FfmpegDevice = {
                        index: parseInt(deviceMatch[1], 10),
                        name:  deviceMatch[2].trim(),
                    }

                    if (currentSection === "audio") {
                        result.audio.push(device)
                        continue
                    }

                    const isScreen = device.name.startsWith("Capture screen")
                    let addParams = {}
                    if (isScreen) {
                        const screenIndex = Number(device.name.replace(/\D/g, ""))
                        const displayInfo = orderedDisplays[screenIndex]

                        if (displayInfo) {
                            const { id, bounds, workArea, scaleFactor, size, label } = displayInfo
                            addParams = {
                                displayId: id,
                                bounds, workArea, scaleFactor, size, label,
                                scaleMax:  {
                                    width:  scaleFactor * size.width,
                                    height: scaleFactor * size.height,
                                },
                            }
                        } else {
                            logger.warn(`[Devices] No Electron display for "${device.name}"`)
                        }
                    }
                    result.video.push({ ...addParams, ...device, isScreen })
                }

                // Временный сбой (пустой ответ) не должен стирать рабочий список устройств
                if (result.video.length || result.audio.length) {
                    this.devicesList = result
                } else {
                    logger.warn("[Devices] Empty device list from FFmpeg, keeping previous list")
                }
                resolve(this.devicesList)
            })
        })
    }

    // ---------------------------------------------------------------------
    // Запись
    // ---------------------------------------------------------------------

    public isBusy(): boolean {
        return this.state !== "idle"
    }

    public getIsRecording(): boolean {
        return this.isRecording
    }

    /** Ошибки возвращаются как { error }, а не через reject: иначе через ipcMain.handle они превращаются в исключение в renderer */
    async startRecording(): Promise<StartRecordingResponse> {
        if (this.state !== "idle") {
            return { error: this.state === "finalizing" ? "Previous recording is still being saved" : "Recording is already in progress" }
        }
        if (!this.ffmpegBinaryPath) return { error: "FFmpeg is not available." }
        if (process.platform !== "darwin") return { error: "This recorder is currently configured for macOS only." }

        // Синхронно занимаем состояние — повторный клик не создаст второй процесс FFmpeg
        this.state = "starting"
        this.stopRequestedWhileStarting = false
        this.revealAfterFinalize = true

        try {
            if (!(await ensurePermissions())) return this.failStart("Permissions required.")

            // Индексы AVFoundation могли сдвинуться (подключили наушники/монитор) — берём свежие
            await this.updateAndGetDevices()
            this.setSettings(this.settings)

            if (this.stopRequestedWhileStarting) return this.failStart("Recording was cancelled")

            const settings = this.settings
            const { video, audio } = settings
            if (!audio || !video?.scaleMax || !isGeometryValid(settings, video)) {
                const { crop, scale, offset } = settings
                logger.error("[Recording] Invalid devices or geometry:", { video, audio, crop, scale, offset })
                return this.failStart("Display or audio device not found.")
            }

            const outputPath = join(settings.outputPath, this.generateShortFilename())
            try {
                mkdirSync(dirname(outputPath), { recursive: true })
            } catch (e) {
                logger.error("Failed to create output folder:", e)
                return this.failStart(`Cannot create output folder: ${dirname(outputPath)}`)
            }
            this.outputPathAndFileName = outputPath

            const videoFilterStr = `crop=${settings.crop.w}:${settings.crop.h}:${settings.offset.x}:${settings.offset.y},scale=${settings.scale.w}:${settings.scale.h}`

            this.inputStartTimes = []
            const command = ffmpeg()
                // Видео и звук — отдельные входы: у каждого свой поток чтения, и захват кадров экрана
                // (~11 МБ каждый) не задерживает чтение звука. В общем входе AVFoundation из-за этого
                // затирал аудиобуферы, и терялось до 13% звука
                .input(`${video.index}:none`)
                .inputFormat("avfoundation")
                .inputFPS(settings.fps)
                .inputOptions(["-thread_queue_size", "2048", "-capture_cursor", "1"])
                .input(`none:${audio.index}`)
                .inputFormat("avfoundation")
                .inputOptions(["-thread_queue_size", "4096"])
                .videoFilter([videoFilterStr])
                .audioFilter(buildAudioFilters(audio))
                .outputOptions([
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    // veryfast даёт файлы в ~4.5 раза меньше ultrafast при том же CRF (ultrafast отключает
                    // CABAC, поиск движения, 8x8 DCT). Для 4K берём superfast, чтобы кодер успевал в реальном времени
                    "-preset", settings.scale.h > 1440 ? "superfast" : "veryfast",
                    "-crf", "23",
                    "-pix_fmt", "yuv420p",
                    "-r", `${settings.fps}`,
                    // Ключевой кадр раз в 10 сек: на экранном контенте короткий GOP заметно раздувает файл
                    "-g", `${settings.fps * 10}`,
                    "-c:a", "aac",
                    "-b:a", AUDIO_BITRATE_LIVE,
                    // Фрагментированный MP4 (фрагмент каждую секунду): файл читается, даже если процесс убит
                    // или приложение упало. После остановки файл перепаковывается в обычный MP4 (см. finalizeFile)
                    "-movflags", "+empty_moov+default_base_moof",
                    "-frag_duration", "1000000",
                    // Без этого FFmpeg держит фрагменты в памяти и при аварии на диске остаётся пустой файл
                    "-flush_packets", "1",
                    "-y",
                ])
                .output(outputPath)

            this.ffmpegCommand = command
            this.activeDisplayId = video.displayId

            return await new Promise<StartRecordingResponse>((resolve) => {
                let started = false

                command
                    .on("start", (cmd) => {
                        if (command !== this.ffmpegCommand) return
                        started = true
                        logger.info("FFmpeg started:", cmd)
                        this.state = "recording"
                        this.isRecording = true
                        this.recordingStartTime = Date.now()
                        this.startTimer()
                        this.keepAwake()
                        resolve({ outputPathAndFileName: outputPath })

                        if (this.stopRequestedWhileStarting) this.requestFfmpegStop()
                    })
                    .on("end", () => {
                        if (command !== this.ffmpegCommand) return
                        logger.info("Recording finished.")
                        void this.onProcessExit(null)
                    })
                    .on("error", (err) => {
                        if (command !== this.ffmpegCommand) return
                        if (!started) {
                            const msg = err?.message || "FFmpeg failed to start"
                            logger.error("FFmpeg failed to start:", msg)
                            handleCaptureError(msg)
                            this.ffmpegCommand = null
                            resolve(this.failStart(msg))
                            return
                        }
                        void this.onProcessExit(err)
                    })
                    .on("stderr", (line) => {
                        if (line.includes("frame=")) return
                        logger.info(`[FFmpeg] ${line}`)
                        // Входы описываются в логе по порядку: «Input #0 …», затем «Duration: …, start: X»
                        const start = parseInputStart(line)
                        if (start !== null) this.inputStartTimes.push(start)
                    })

                // Небольшая задержка, чтобы окна успели скрыться до начала захвата
                setTimeout(() => {
                    if (command === this.ffmpegCommand) command.run()
                }, 100)
            })
        } catch (error) {
            logger.error("Start recording error:", error)
            this.ffmpegCommand = null
            return this.failStart(error instanceof Error ? error.message : "Unknown error")
        }
    }

    /**
     * Приложение живёт в фоне без окон, и macOS усыпляет его (App Nap): таймеры растягиваются,
     * поток чтения звука FFmpeg вместо 10 мс спит ~100 мс, и AVFoundation успевает затереть
     * аудиобуферы — в записи появляются провалы звука. На время записи запрещаем это.
     */
    private keepAwake() {
        if (this.powerSaveBlockerId === null) this.powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension")
    }

    private releaseAwake() {
        if (this.powerSaveBlockerId === null) return
        powerSaveBlocker.stop(this.powerSaveBlockerId)
        this.powerSaveBlockerId = null
    }

    private failStart(error: string): StartRecordingResponse {
        this.releaseAwake()
        this.state = "idle"
        this.activeDisplayId = undefined
        this.stopRequestedWhileStarting = false
        this.flushStopWaiters()
        this.runDeferredRefresh()
        return { error }
    }

    /** Возвращает промис, который завершается после того, как файл дописан и финализирован */
    stopRecording(options: StopRecordingOptions = {}): Promise<{ error?: string }> {
        if (this.state === "idle") return Promise.resolve({ error: "No recording in progress" })
        if (options.reveal === false) this.revealAfterFinalize = false

        const done = new Promise<{ error?: string }>(resolve => {
            this.stopWaiters.push(() => resolve({}))
        })

        if (this.state === "starting") {
            // FFmpeg ещё не запущен — остановим сразу после старта (или старт отменится)
            this.stopRequestedWhileStarting = true
        } else if (this.state === "recording") {
            this.requestFfmpegStop()
        }
        // stopping / finalizing — просто ждём завершения
        return done
    }

    private requestFfmpegStop() {
        const command = this.ffmpegCommand
        if (!command || this.state !== "recording") return
        this.state = "stopping"

        // Реальная длительность без пауз (обрезка нужна только если паузы были)
        this.pendingTrimDuration = (this.totalPausedTime > 0 || this.isPaused) ? this.getActiveDurationSeconds() : null

        if (this.isPaused) {
            command.kill("SIGCONT")
            this.isPaused = false
        }

        try {
            // Мягко просим FFmpeg остановиться (посылаем 'q' в консоль)
            // @ts-expect-error: ffmpegProc не описан в типах fluent-ffmpeg
            command.ffmpegProc.stdin.write("q\n")
        } catch (e) {
            // Если стандартный ввод недоступен, шлем сигнал прерывания
            logger.warn("Failed to send 'q' to FFmpeg, sending SIGINT", e)
            command.kill("SIGINT")
        }

        this.armStopWatchdog(command)
    }

    /** FFmpeg может зависнуть на устройстве (отключили монитор/Bluetooth) — эскалируем до SIGKILL и сбрасываем состояние */
    private armStopWatchdog(command: ffmpeg.FfmpegCommand) {
        this.clearStopWatchdog()
        this.stopTimers.push(
            setTimeout(() => {
                logger.warn("FFmpeg did not exit after 'q' — sending SIGINT")
                command.kill("SIGINT")
            }, STOP_SIGINT_TIMEOUT_MS),
            setTimeout(() => {
                logger.error("FFmpeg did not exit after SIGINT — sending SIGKILL")
                command.kill("SIGKILL")
            }, STOP_SIGKILL_TIMEOUT_MS),
            setTimeout(() => {
                if (command !== this.ffmpegCommand) return
                logger.error("FFmpeg did not report exit — forcing state reset")
                void this.onProcessExit(new Error("FFmpeg stop timeout"))
            }, STOP_FORCE_RESET_TIMEOUT_MS),
        )
    }

    private clearStopWatchdog() {
        this.stopTimers.forEach(t => clearTimeout(t))
        this.stopTimers = []
    }

    /** Единая точка завершения процесса записи: штатная остановка, ошибка или убийство по таймауту */
    private async onProcessExit(err: Error | null) {
        if (this.state === "idle" || this.state === "finalizing") return

        const wasStopping = this.state === "stopping"
        this.clearStopWatchdog()

        if (err) {
            const msg = err.message || ""
            if (wasStopping) {
                // Остановка через SIGINT/SIGKILL даёт ненулевой код выхода — это не ошибка записи
                logger.info("FFmpeg exited during stop:", msg)
            } else {
                logger.error("FFmpeg error during recording:", msg)
                handleCaptureError(msg)
            }
        }

        const filePath = this.outputPathAndFileName
        const trimDuration = this.pendingTrimDuration
            ?? ((this.totalPausedTime > 0 || this.isPaused) ? this.getActiveDurationSeconds() : null)

        // Сразу возвращаем UI в исходное состояние, файл финализируется в фоне
        this.state = "finalizing"
        this.releaseAwake()
        this.ffmpegCommand = null
        this.isRecording = false
        this.isPaused = false
        this.activeDisplayId = undefined
        this.resetTimer(true)
        this.stopForAria()
        this.stopBorderHighlight()

        await this.finalizeFile(filePath, trimDuration, this.getAudioOffsetSeconds())

        this.state = "idle"
        this.recordingStartTime = 0
        this.totalPausedTime = 0
        this.pauseStartTime = 0
        this.pendingTrimDuration = null

        // Показываем файл только когда он полностью готов
        if (this.revealAfterFinalize && filePath && existsSync(filePath)) shell.showItemInFolder(filePath)

        this.flushStopWaiters()
        this.runDeferredRefresh()
    }

    private flushStopWaiters() {
        const waiters = this.stopWaiters
        this.stopWaiters = []
        waiters.forEach(resolve => resolve())
    }

    /** Мониторы менялись во время записи — применяем изменения сейчас */
    private runDeferredRefresh() {
        if (!this.refreshAfterStop) return
        this.refreshAfterStop = false
        void this.onDisplaysChanged()
    }

    /**
     * На сколько секунд звук начался позже видео. FFmpeg сдвигает каждый вход к нулю отдельно,
     * поэтому реальный сдвиг восстанавливаем по времени старта входов из лога
     */
    private getAudioOffsetSeconds(): number {
        const [videoStart, audioStart] = this.inputStartTimes
        if (videoStart == null || audioStart == null) {
            logger.warn("[Finalize] Input start times not found in FFmpeg log — A/V offset not applied")
            return 0
        }
        const offset = audioStart - videoStart
        if (Math.abs(offset) > MAX_AV_OFFSET_SECONDS) {
            logger.warn(`[Finalize] Suspicious A/V offset ${offset.toFixed(3)}s — not applied`)
            return 0
        }
        return offset
    }

    /**
     * Видео перепаковывается из фрагментированного MP4 в обычный (+faststart) без перекодирования,
     * звук перекодируется: сдвигается на audioOffset (синхронизация с видео) и чистится от щелчков.
     * Если были паузы — заодно обрезаем до реальной длительности.
     * При любой ошибке оставляем исходный файл: фрагментированный MP4 тоже воспроизводится.
     */
    private finalizeFile(filePath: string, trimSeconds: number | null, audioOffset: number): Promise<void> {
        return new Promise((resolve) => {
            try {
                if (!filePath || !existsSync(filePath) || statSync(filePath).size === 0) {
                    logger.warn("[Finalize] Nothing to finalize:", filePath)
                    resolve()
                    return
                }
            } catch (e) {
                logger.warn("[Finalize] Cannot stat file:", filePath, e)
                resolve()
                return
            }

            const tempPath = `${filePath.replace(/\.mp4$/i, "")}.finalizing.mp4`
            const options = [
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-af", FINALIZE_AUDIO_FILTER,
                "-c:a", "aac",
                "-b:a", AUDIO_BITRATE_FINAL,
                "-movflags", "+faststart",
            ]
            if (trimSeconds !== null && trimSeconds > 0) options.unshift("-t", trimSeconds.toFixed(3))
            logger.info(`[Finalize] A/V offset: ${audioOffset.toFixed(3)}s`)

            // Один и тот же файл открываем дважды: вход #0 — видео как есть, вход #1 — звук со сдвигом
            const command = ffmpeg()
                .input(filePath)
                .input(filePath)
                .inputOptions(["-itsoffset", audioOffset.toFixed(3)])
                .outputOptions(options)
                .output(tempPath)

            this.finalizeCommand = command
            command
                .on("end", () => {
                    this.finalizeCommand = null
                    try {
                        // rename перезаписывает файл назначения атомарно — отдельный unlink не нужен
                        renameSync(tempPath, filePath)
                        logger.info(`[Finalize] Done${trimSeconds ? ` (trimmed to ${trimSeconds.toFixed(3)}s)` : ""}:`, filePath)
                    } catch (e) {
                        logger.error("[Finalize] Replace error, keeping original file:", e)
                        safeUnlink(tempPath)
                    }
                    resolve()
                })
                .on("error", (err) => {
                    this.finalizeCommand = null
                    logger.error("[Finalize] Error, keeping original (fragmented) file:", err?.message)
                    safeUnlink(tempPath)
                    resolve()
                })
                .run()
        })
    }

    /** Для will-quit: не оставляем процессы FFmpeg сиротами (ffmpeg не завершается сам при закрытии stdin) */
    public forceKill() {
        this.clearStopWatchdog()
        for (const command of [this.ffmpegCommand, this.finalizeCommand]) {
            try {
                command?.kill("SIGKILL")
            } catch { /* noop */ }
        }
    }

    /** Сброс UI области/рамки, когда записи нет (например, закрыли таймер) */
    resetByStop() {
        if (this.state !== "idle") return
        this.resetTimer(true)
        this.stopForAria()
        this.stopBorderHighlight()
    }

    pauseRecording() {
        if (this.state !== "recording" || this.isPaused || !this.ffmpegCommand) return { error: "Cannot pause" }

        // Отправляем сигнал заморозки процесса
        this.ffmpegCommand.kill("SIGSTOP")
        this.isPaused = true
        this.pauseStartTime = Date.now()

        ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }

    resumeRecording() {
        if (this.state !== "recording" || !this.isPaused || !this.ffmpegCommand) return { error: "Cannot resume" }

        // Отправляем сигнал пробуждения процесса
        this.ffmpegCommand.kill("SIGCONT")
        this.isPaused = false
        this.totalPausedTime += Date.now() - this.pauseStartTime
        this.pauseStartTime = 0

        ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }

    private getActiveDurationSeconds(): number {
        if (!this.recordingStartTime) return 0
        const now = Date.now()
        const currentPause = this.isPaused ? (now - this.pauseStartTime) : 0
        return Math.max(now - this.recordingStartTime - this.totalPausedTime - currentPause, 0) / 1000
    }

    getRecordingStatus(): RecordingStatus {
        const duration = this.isRecording ? Math.floor(this.getActiveDurationSeconds()) : 0
        return { isRecording: this.isRecording, isPaused: this.isPaused, duration }
    }

    generateShortFilename(): string {
        return `REC_${DateTime.now().toFormat("dd-MM-yyyy_HH_mm_ss")}.mp4`
    }

    resetTimer(sendStatus?: boolean) {
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval)
            this.recordingInterval = null
        }
        if (sendStatus) ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }

    startTimer() {
        this.resetTimer()
        this.startForAria()
        this.startBorderHighlight()
        this.recordingInterval = setInterval(() => {
            ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
        }, 1000)
    }

    // ---------------------------------------------------------------------
    // Область и рамка
    // ---------------------------------------------------------------------

    // Если запись области
    startForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (ariaWin && !ariaWin.isDestroyed() && ariaWin.isVisible()) {
            // Сначала уведомляем окно о начале записи (скрывает иконку move-96)
            const status: RecordingStatus = { isRecording: true, isPaused: false, duration: 0 }
            ariaWin.webContents.send(ExposedWinSelectAria.UPDATED_STATE_TIMER, status)

            // Заставляет окно полностью игнорировать все события мыши, "пропуская" клики насквозь к окнам, находящимся под ним
            ariaWin.setIgnoreMouseEvents(true)
            ariaWin.setMovable(false)

            // Скрываем окно таймера при старте записи в области
            const timerWin = getWindowByName(WindowName.Timer)
            if (timerWin && !timerWin.isDestroyed() && timerWin.isVisible()) timerWin.hide()
        }
    }

    // Если запись области
    stopForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)

        // 1. Возвращаем окну выделения нормальное состояние и скрываем его
        if (ariaWin && !ariaWin.isDestroyed()) {
            ariaWin.setIgnoreMouseEvents(false)
            ariaWin.setMovable(true)
            ariaWin.hide()
        }

        // Уведомляем таймер, что режим области выключен
        const timerWin = getWindowByName(WindowName.Timer)
        if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send(ExposedWinSelectAria.SET_ARIA_ACTIVE, false)

        // 2. Гарантированно сбрасываем настройки до полного экрана
        if (this.settings.video) {
            // Получаем дефолтные полноэкранные пропорции для текущего монитора и качества
            const fullScreenReset = getResultScale(this.settings.video, this.settings.defSize)
            this.setSettings({
                ...this.settings,
                ...fullScreenReset,
                offset: { x: 0, y: 0 },
            })
        }
    }

    // Показать зеленую рамку при записи
    startBorderHighlight() {
        if (!this.settings.showBorder) return

        const borderWin = getWindowByName(WindowName.Border)
        if (borderWin && !borderWin.isDestroyed() && this.settings.video?.bounds) {
            const { x, y, width, height } = this.settings.video.bounds

            // Устанавливаем размеры и позицию окна
            borderWin.setBounds({ x, y, width, height })

            // Дополнительно устанавливаем окно поверх всех окон
            borderWin.setAlwaysOnTop(true, "screen-saver")
            borderWin.setVisibleOnAllWorkspaces(true)
            // устанавливаем игнорирование событий мыши каждый раз при показе
            borderWin.setIgnoreMouseEvents(true, { forward: true })

            borderWin.show()
        }
    }

    // Скрыть зеленую рамку
    stopBorderHighlight() {
        const borderWin = getWindowByName(WindowName.Border)
        if (borderWin && !borderWin.isDestroyed()) borderWin.hide()
    }
}

export const screenRecorder = ScreenRecorder.getInstance()
