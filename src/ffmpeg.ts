import ffmpeg from "fluent-ffmpeg"
import { app, ipcMain, screen, shell, systemPreferences } from "electron"
import { join, dirname } from "path"
import { existsSync, mkdirSync } from "fs"
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
import { ExposedFfmpeg } from "./window/ipc-handlers/definitions/renderer.ts"
import { getWindowAll, getWindowByName, WindowName } from "./window/utils/ipc-controller.ts"
import { getResultScale } from "./window/utils/main.ts"
import { appName, showMessageBoxPermission, checkErrorAndShowMessageBox } from "./utils/utils.ts"

export class ScreenRecorder {
    private static instance: ScreenRecorder
    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null

    public outputPathAndFileName: string = ""
    public recordingStartTime: number = 0
    public isRecording: boolean = false
    private recordingInterval: NodeJS.Timeout | null = null
    public devicesList: FfmpegDeviceLists = {
        video: [],
        audio: [],
    }

    public settings: FfmpegSettings = {
        ...getDefaultSettings(),
        outputPath: join(homedir(), "Desktop", appName),
    }

    public readonly ffmpegBinaryPath: string | null = null

    private constructor() {
        if (!existsSync(this.settings.outputPath)) {
            mkdirSync(this.settings.outputPath, { recursive: true })
        }
        this.ffmpegBinaryPath = this.initializeFfmpegPath()
        if (this.ffmpegBinaryPath) {
            ffmpeg.setFfmpegPath(this.ffmpegBinaryPath)
        } else {
            console.error("CRITICAL: FFmpeg binary not found. Recording will fail.")
        }

    }

    public async asyncInit() {
        const device = await this.getSeparatedDevices()
        console.log("!!!! device: ", device.video)
        const video = device.video.find(item => item.name.startsWith("Capture screen 0")) || device.video[0]
        this.setSettings({
            ...this.settings,
            audio: device.audio.find(item => item.name.startsWith("Recorder-Input")) || device.audio[0],
            video,
            ...getResultScale(video),
        })
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

            console.log("[FFmpeg] Packaged lookup candidates:", candidates)
        } else {
            // Dev-режим — используем путь из модуля
            const devPath = FfmpegStatic.ffmpegPath
            candidates = [devPath].filter(Boolean) as string[]
            console.log("[FFmpeg] Dev path:", devPath)
        }

        for (const p of candidates) {
            try {
                const exists = p && existsSync(p)
                console.log(`[FFmpeg] Checking: ${p} -> ${exists ? "FOUND" : "MISS"}`)
                if (exists) {
                    // На Unix-подобных системах убеждаемся, что бинарь исполняемый
                    try {
                        require("fs").chmodSync(p, 0o755)
                    } catch { /* noop */ }
                    console.log("FFmpeg path successfully set to:", p)
                    return p
                }
            } catch (e) {
                console.warn("[FFmpeg] Error while checking path:", p, e)
            }
        }

        console.error("CRITICAL: FFmpeg binary not found. Checked:", candidates)
        return null
    }

    public getSeparatedDevices(): Promise<FfmpegDeviceLists> {
        // Используем сохраненный путь к ffmpeg, который корректно работает в собранной версии
        const ffmpegPath = this.ffmpegBinaryPath || FfmpegStatic.ffmpegPath
        if (!ffmpegPath) {
            console.error("FFmpeg path not available for getting devices")
            return Promise.resolve({ video: [], audio: [] })
        }

        console.log("Getting devices with FFmpeg path:", ffmpegPath)
        const command = `"${ffmpegPath}" -f avfoundation -list_devices true -i ""`

        return new Promise((resolve) => {
            exec(command, (error, _stdout, stderr) => {

                const allDisplays = screen.getAllDisplays()
                    .sort((a, b) => a.bounds.x - b.bounds.x)
                    .map((item, index) => ({ ...item, index }))

                // console.log("allDisplays: ", allDisplays)

                if (error && !stderr) {
                    console.error("Error executing FFmpeg command:", error)
                    resolve({ video: [], audio: [] })
                    return
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
                                const { bounds, workArea, scaleFactor, size, label } = allDisplays?.[index] || {}
                                addParams = {
                                    bounds, workArea, scaleFactor, size, label,
                                    scaleMax: {
                                        width:  scaleFactor * size.width,
                                        height: scaleFactor * size.height,
                                    },
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

    public getCurrentDevicesList() {
        return this.devicesList
    }

    startRecording(): Promise<StartRecordingResponse> {
        return new Promise((resolve, reject) => {
            if (this.isRecording) return reject({ error: "Recording is already in progress" })
            if (!this.ffmpegBinaryPath) return reject({ error: "FFmpeg is not available." })

            try {
                if (process.platform !== "darwin") return reject({ error: "This recorder is currently configured for macOS only." })

                const hasMicPermission = systemPreferences.getMediaAccessStatus("microphone") === "granted"
                if (!hasMicPermission) {
                    systemPreferences.askForMediaAccess("microphone")
                    return reject({ error: "Microphone permission required." })
                }

                const hasScreenPermission = systemPreferences.getMediaAccessStatus("screen") === "granted"
                if (!hasScreenPermission) {
                    showMessageBoxPermission()
                    return reject({ error: "Screen Recording permission required." })
                }

                if (!this.settings.audio || !this.settings.video) return reject({ error: "Display with index not found." })


                this.outputPathAndFileName = join(this.settings.outputPath, this.generateShortFilename())
                this.ffmpegCommand = ffmpeg()
                    // ---- МАКСИМАЛЬНО ПРОСТАЯ КОМАНДА ----
                    // Один вход для видео, один для УЖЕ синхронизированного аудио
                    .input(`${this.settings.video.index}:${this.settings.audio.index}`)
                    .inputFormat("avfoundation")
                    .inputFPS(this.settings.fps)
                    .inputOptions(["-thread_queue_size", "2048", "-capture_cursor", "1"])
                    .videoFilter([
                        `scale=${this.settings.scale.w}:${this.settings.scale.h},crop=${this.settings.crop.w}:${this.settings.crop.h}:${this.settings.offset.x}:${this.settings.offset.y}`,
                    ])
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
                        console.log("FFmpeg started:", cmd)
                        this.isRecording = true
                        this.recordingStartTime = Date.now()
                        this.startTimer()

                        resolve({ outputPathAndFileName: this.outputPathAndFileName })
                    })
                    .on("end", () => {
                        console.log("Recording finished.")
                        this.resetByStop()
                    })
                    .on("error", (err) => {
                        const msg = err?.message || ""
                        console.error("FFmpeg error:", msg)

                        checkErrorAndShowMessageBox(msg, this.ffmpegBinaryPath || "")

                        this.resetByStop()
                        reject({ error: msg })
                    })
                    // .on('stderr', (line) => {
                    //     if (!line.includes('frame=')) console.log('FFmpeg:', line);
                    // })

                this.ffmpegCommand.run()
            } catch (error) {
                console.error("Start recording error:", error)
                reject({ error: error instanceof Error ? error.message : "Unknown error" })
            }
        })
    }

    stopRecording() {
        if (!this.isRecording || !this.ffmpegCommand) return { error: "No recording in progress" }
        try {
            // @ts-ignore
            this.ffmpegCommand.ffmpegProc.stdin.write("q\n")
        } catch (e) {
            this.ffmpegCommand?.kill("SIGINT")
        }
        shell.showItemInFolder(this.outputPathAndFileName)
    }

    resetByStop() {
        this.isRecording = false
        this.recordingStartTime = 0
        this.ffmpegCommand = null
        this.resetTimer(true)
        this.stopForAria()
    }

    public getIsRecording(): boolean {
        return this.isRecording
    }

    getRecordingStatus(): RecordingStatus {
        const duration = this.isRecording ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0
        return { isRecording: this.isRecording, duration }
    }

    getSettings() {
        return this.settings
    }

    setSettings(settings?: FfmpegSettings) {
        if (!settings) return
        this.settings = settings
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
        if (ariaWin && ariaWin.isVisible()) {
            // Заставляет окно полностью игнорировать все события мыши, "пропуская" клики насквозь к окнам, находящимся под ним
            ariaWin.setIgnoreMouseEvents(false)
            ariaWin.setMovable(true)
            ariaWin.hide()
            const scale = this.settings.scale
            this.setSettings({
                ...this.settings,
                crop:   { w: scale.w, h: scale.h },
                offset: { x: 0, y: 0 },
            })
        }
    }

}

export const screenRecorder = ScreenRecorder.getInstance()
