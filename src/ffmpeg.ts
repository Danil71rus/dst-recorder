import ffmpeg from "fluent-ffmpeg"
import { app, ipcMain, screen, shell, systemPreferences } from "electron"
import { join, dirname } from "path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { DateTime } from "luxon"
import { exec } from "child_process"
import FfmpegStatic from "ffmpeg-ffprobe-static"
import {
    FfmpegDevice,
    FfmpegDeviceLists,
    FfmpegSettings,
    getDefaultSettings,
    RecordingStatus,
    StartRecordingResponse,
} from "./deinitions/ffmpeg.ts"
import { ExposedFfmpeg, ExposedWinSelectAria } from "./window/ipc-handlers/definitions/renderer.ts"
import { getWindowAll, getWindowByName, WindowName } from "./window/utils/ipc-controller.ts"
import { getResultScale } from "./window/utils/main.ts"
import { appName, showMessageBoxPermission, checkErrorAndShowMessageBox } from "./utils/utilsForMain.ts"
import { logger } from "./utils/logger.ts"

export class ScreenRecorder {
    private static instance: ScreenRecorder
    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null

    public outputPathAndFileName: string = ""
    // Запись
    public recordingStartTime: number = 0
    public isRecording: boolean = false
    private recordingInterval: NodeJS.Timeout | null = null
    // Пауза
    public isPaused: boolean = false
    public totalPausedTime: number = 0
    private pauseStartTime: number = 0

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

        if (!existsSync(this.settings.outputPath)) {
            mkdirSync(this.settings.outputPath, { recursive: true })
        }
        this.ffmpegBinaryPath = this.initializeFfmpegPath()
        if (this.ffmpegBinaryPath) {
            ffmpeg.setFfmpegPath(this.ffmpegBinaryPath)
        } else {
            logger.error("CRITICAL: FFmpeg binary not found. Recording will fail.")
        }
    }

    private getInitialSettings(): FfmpegSettings {
        const defaultSettings: FfmpegSettings = {
            ...getDefaultSettings(),
            outputPath: join(homedir(), "Desktop", appName),
        }

        const persisted = this.loadSettingsFromFile()
        if (!persisted) return defaultSettings

        return {
            ...defaultSettings,
            ...persisted,
            outputPath: persisted.outputPath || defaultSettings.outputPath,
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
        try {
            const dir = dirname(this.settingsFilePath)
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

            writeFileSync(this.settingsFilePath, JSON.stringify(settings, null, 2), "utf-8")
        } catch (error) {
            logger.warn("Failed to persist settings to file:", error)
        }
    }

    public async asyncInit() {
        const device = await this.updateAndGetDevices()
        console.log("!!!! device: ", device.video)
        const video = device.video.find(item => item.name.startsWith("Capture screen 0")) || device.video[0]
        this.setSettings({
            ...this.settings,
            audio: device.audio.find(item => item.name.startsWith("Recorder-Input")) || device.audio[0],
            video,
            ...getResultScale(video),
        })

        // отслеживать добавление/удаление мониторов
        screen.on("display-added", async () => await this.asyncInit())
        screen.on("display-removed", async () => await this.asyncInit())
    }

    public static getInstance(): ScreenRecorder {
        if (!ScreenRecorder.instance) ScreenRecorder.instance = new ScreenRecorder()
        return ScreenRecorder.instance
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
                        require("fs").chmodSync(p, 0o755)
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

    public updateAndGetDevices(): Promise<FfmpegDeviceLists> {
        // Используем сохраненный путь к ffmpeg, который корректно работает в собранной версии
        const ffmpegPath = this.ffmpegBinaryPath || FfmpegStatic.ffmpegPath
        if (!ffmpegPath) {
            console.error("FFmpeg path not available for getting devices")
            return Promise.resolve({ video: [], audio: [] })
        }

        logger.info("Getting devices with FFmpeg path:", ffmpegPath)
        const command = `"${ffmpegPath}" -f avfoundation -list_devices true -i ""`

        return new Promise((resolve) => {
            exec(command, (error, _stdout, stderr) => {

                // Получаем главный экран (он всегда будет Capture screen 0 в FFmpeg)
                const primaryDisplay = screen.getPrimaryDisplay()
                // Получаем все остальные экраны, исключая главный
                const otherDisplays = screen.getAllDisplays().filter(d => d.id !== primaryDisplay.id)
                // Склеиваем массив: главный экран строго первый (index: 0), остальные за ним
                const orderedDisplays = [primaryDisplay, ...otherDisplays].map((item, index) => ({ ...item, index }))
                console.log("orderedDisplays: ", orderedDisplays)

                if (error && !stderr) {
                    logger.error("Error executing FFmpeg command:", error)
                    resolve({ video: [], audio: [] })
                    return
                }
                if (stderr?.trim()) {
                    logger.info(`[FFmpeg:list_devices] stderr:\n${stderr}`)
                }
                const lines = stderr.split("\n")
                const result: FfmpegDeviceLists = {
                    video: [],
                    audio: [],
                }

                let currentSection: "video" | "audio" | null = null

                for (const line of lines) {
                    // Определяем, в какой секции мы находимся
                    if (line.includes("AVFoundation video devices:")) {
                        currentSection = "video"
                        continue // Переходим к следующей строке
                    } else if (line.includes("AVFoundation audio devices:")) {
                        currentSection = "audio"
                        continue // Переходим к следующей строке
                    }

                    if (!currentSection) continue

                    // Парсим строку с устройством
                    const deviceMatch = line.match(/\[(\d+)\]\s(.*)/)
                    if (deviceMatch && deviceMatch[1] && deviceMatch[2]) {
                        const device: FfmpegDevice = {
                            index: parseInt(deviceMatch[1], 10),
                            name:  deviceMatch[2].trim(),
                        }

                        if (currentSection === "video") {
                            const isScreen = device.name.startsWith("Capture screen")
                            let addParams = {}
                            if (isScreen) {
                                const index = Number(device.name.replace(/\D/g, ""))
                                const displayInfo = orderedDisplays[index]

                                if (displayInfo) {
                                    const { bounds, workArea, scaleFactor, size, label } = displayInfo
                                    addParams = {
                                        bounds, workArea, scaleFactor, size, label,
                                        scaleMax: {
                                            width:  scaleFactor * size.width,
                                            height: scaleFactor * size.height,
                                        },
                                    }
                                }
                            }
                            result.video.push({ ...addParams, ...device, isScreen })
                        } else {
                            result.audio.push(device)
                        }
                    }
                }

                this.devicesList = result
                resolve(result)
            })
        })
    }

    public getDevicesList() {
        return this.devicesList
    }

    startRecording(): Promise<StartRecordingResponse> {
        return new Promise((resolve, reject) => {
            if (this.isRecording) return reject({ error: "Recording is already in progress" })
            if (!this.ffmpegBinaryPath) return reject({ error: "FFmpeg is not available." })

            try {
                if (process.platform !== "darwin") return reject({ error: "This recorder is currently configured for macOS only." })

                const micStatus = systemPreferences.getMediaAccessStatus("microphone")
                const hasMicPermission = micStatus === "granted"
                logger.info(`[TCC] Microphone access status: ${micStatus}`)
                if (!hasMicPermission) {
                    try {
                        systemPreferences.askForMediaAccess("microphone")
                    } catch {}
                    logger.warn("[TCC] Microphone permission required (denied/not-determined)")
                    return reject({ error: "Microphone permission required." })
                }

                const screenStatus = systemPreferences.getMediaAccessStatus("screen")
                const hasScreenPermission = screenStatus === "granted"
                logger.info(`[TCC] Screen Recording access status: ${screenStatus}`)
                if (!hasScreenPermission) {
                    logger.warn("[TCC] Screen Recording permission required (denied/not-determined). Opening System Settings hint.")
                    showMessageBoxPermission()
                    return reject({ error: "Screen Recording permission required." })
                }

                if (!this.settings.audio || !this.settings.video) return reject({ error: "Display with index not found." })


                this.outputPathAndFileName = join(this.settings.outputPath, this.generateShortFilename())

                const outputDir = dirname(this.outputPathAndFileName)
                if (!existsSync(outputDir)) {
                    mkdirSync(outputDir, { recursive: true })
                }

                const videoFilterStr = `crop=${this.settings.crop.w}:${this.settings.crop.h}:${this.settings.offset.x}:${this.settings.offset.y},scale=${this.settings.scale.w}:${this.settings.scale.h}`

                this.ffmpegCommand = ffmpeg()
                    // ---- МАКСИМАЛЬНО ПРОСТАЯ КОМАНДА ----
                    // Один вход для видео, один для УЖЕ синхронизированного аудио
                    .input(`${this.settings.video.index}:${this.settings.audio.index}`)
                    .inputFormat("avfoundation")
                    .inputFPS(this.settings.fps)
                    .inputOptions(["-thread_queue_size", "2048", "-capture_cursor", "1"])
                    .videoFilter([videoFilterStr])
                    // Фильтр для смешивания каналов и увеличения громкости микрофона
                    .audioFilter([
                        // Смешиваем многоканальный звук в стерео.
                        // Канал 0 (микрофон) усиливаем в 2.5 раза.
                        // Канал 2 (системный звук) оставляем как есть.
                        "pan=stereo|c0=2.5*c0|c1=1.0*c2",
                    ])
                    .outputOptions([
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "23",
                        "-pix_fmt", "yuv420p",
                        "-r", `${this.settings.fps}`,
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-y",
                    ])
                    .output(this.outputPathAndFileName)

                this.ffmpegCommand
                    .on("start", (cmd) => {
                        logger.info("FFmpeg started:", cmd)
                        this.isRecording = true
                        this.recordingStartTime = Date.now()
                        this.startTimer()

                        resolve({ outputPathAndFileName: this.outputPathAndFileName })
                    })
                    .on("end", () => {
                        logger.info("Recording finished.")
                        this.resetByStop()
                    })
                    .on("error", (err) => {
                        const msg = err?.message || ""
                        logger.error("FFmpeg error:", msg)

                        checkErrorAndShowMessageBox(msg, this.ffmpegBinaryPath || "")

                        this.resetByStop()
                        reject({ error: msg })
                    })
                    .on("stderr", (line) => {
                        if (!line.includes("frame=")) logger.info(`[FFmpeg] ${line}`)
                    })

                this.ffmpegCommand.run()
            } catch (error) {
                console.error("Start recording error:", error)
                reject({ error: error instanceof Error ? error.message : "Unknown error" })
            }
        })
    }

    stopRecording() {
        if (!this.isRecording || !this.ffmpegCommand) return { error: "No recording in progress" }

        if (this.isPaused) {
            this.ffmpegCommand.kill("SIGCONT")
            this.isPaused = false
        }

        try {
            // Мягко просим FFmpeg остановиться (посылаем 'q' в консоль)
            // @ts-ignore
            this.ffmpegCommand.ffmpegProc.stdin.write("q\n")
        } catch (e) {
            // Если стандартный ввод недоступен, шлем сигнал прерывания
            this.ffmpegCommand?.kill("SIGINT")
        }

        shell.showItemInFolder(this.outputPathAndFileName)
    }

    resetByStop() {
        this.isRecording = false
        this.isPaused = false
        this.recordingStartTime = 0
        this.totalPausedTime = 0
        this.pauseStartTime = 0
        this.ffmpegCommand = null
        this.resetTimer(true)
        this.stopForAria()
    }

    pauseRecording() {
        if (!this.isRecording || this.isPaused || !this.ffmpegCommand) return { error: "Cannot pause" }

        // Отправляем сигнал заморозки процесса
        this.ffmpegCommand.kill("SIGSTOP")
        this.isPaused = true
        this.pauseStartTime = Date.now()

        ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }
    resumeRecording() {
        if (!this.isRecording || !this.isPaused || !this.ffmpegCommand) return { error: "Cannot resume" }

        // Отправляем сигнал пробуждения процесса
        this.ffmpegCommand.kill("SIGCONT")
        this.isPaused = false
        this.totalPausedTime += Date.now() - this.pauseStartTime
        this.pauseStartTime = 0

        ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
    }

    public getIsRecording(): boolean {
        return this.isRecording
    }

    getRecordingStatus(): RecordingStatus {
        const duration = (() => {
            if (!this.isRecording) return 0
            const dateNow = Date.now()
            const currentPause = this.isPaused ? (dateNow - this.pauseStartTime) : 0
            return Math.floor((dateNow - this.recordingStartTime - this.totalPausedTime - currentPause) / 1000)
        })()
        return { isRecording: this.isRecording, isPaused: this.isPaused, duration }
    }

    getSettings() {
        return this.settings
    }

    setSettings(settings?: FfmpegSettings) {
        if (!settings) return
        this.settings = settings
        this.persistSettingsToFile(this.settings)

        getWindowAll()?.forEach(item => {
            item?.webContents.send(ExposedFfmpeg.UPDATED_SETTINGS, settings)
        })
        ipcMain.emit(ExposedFfmpeg.UPDATED_SETTINGS, null, settings)
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
        this.recordingInterval = setInterval(() => {
            ipcMain.emit(ExposedFfmpeg.UPDATED_STATE_TIMER, null, this.getRecordingStatus())
        }, 1000)
    }

    // Если запись области
    startForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)
        if (ariaWin && ariaWin.isVisible()) {
            // Заставляет окно полностью игнорировать все события мыши, "пропуская" клики насквозь к окнам, находящимся под ним
            ariaWin.setIgnoreMouseEvents(true)
            ariaWin.setMovable(false)
        }
    }

    // Если запись области
    stopForAria() {
        const ariaWin = getWindowByName(WindowName.SelectAria)

        // 1. Возвращаем окну выделения нормальное состояние и скрываем его
        if (ariaWin) {
            ariaWin.setIgnoreMouseEvents(false)
            ariaWin.setMovable(true)
            ariaWin.hide()
        }

        // Уведомляем таймер, что режим области выключен
        getWindowByName(WindowName.Timer)?.webContents.send(ExposedWinSelectAria.SET_ARIA_ACTIVE, false)

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

}

export const screenRecorder = ScreenRecorder.getInstance()
