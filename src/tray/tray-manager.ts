import { app, Tray, Menu, nativeImage, shell } from "electron"
import { join } from "path"
import { getWindowByName, WindowName } from "../window/utils/ipc-controller.ts"
import { screenRecorder } from "../ffmpeg.ts"
import { ExposedWinMain } from "../window/ipc-handlers/definitions/renderer.ts"
import { RecordingStatus } from "@/deinitions/ffmpeg.ts"
import { updatePositionByAria } from "../window/ipc-handlers/ipc-win-select-aria.ts"

export class TrayManager {
    private static instance: TrayManager
    private tray: Tray | null = null
    private isDarwin = process.platform === "darwin"

    private constructor() {}

    public static getInstance(): TrayManager {
        if (!TrayManager.instance) {
            TrayManager.instance = new TrayManager()
        }
        return TrayManager.instance
    }

    private createIcon() {
        const isDev = !app.isPackaged
        const iconFileName = "camera.png"

        // Пытаемся найти иконку в нескольких возможных местах (особенно важно для собранной версии)
        const candidates = isDev
            ? [
                join(process.cwd(), "src/assets", iconFileName),
            ]
            : [
                // 1) Иконка, включённая в asar как src/assets/*
                join(app.getAppPath(), "src/assets", iconFileName),
                // 2) Иконка, собранная в dist/assets (рендер бандл)
                join(app.getAppPath(), "dist/assets", iconFileName),
                // 3) Явные пути через resources (asar/asar.unpacked)
                join(process.resourcesPath, "app.asar", "src/assets", iconFileName),
                join(process.resourcesPath, "app.asar", "dist/assets", iconFileName),
                // 4) Внешние ресурсы (на случай ручного копирования)
                join(process.resourcesPath, "assets", iconFileName),
            ]

        let icon = null as Electron.NativeImage | null
        for (const p of candidates) {
            const img = nativeImage.createFromPath(p)
            if (!img.isEmpty()) {
                icon = img
                break
            }
            console.warn("Tray icon not found at path:", p)
        }

        if (!icon) {
            // Последний шанс: создаём пустую иконку, чтобы не падать
            icon = nativeImage.createEmpty()
        }

        // Для macOS включаем template, чтобы иконка корректно отображалась в меню-баре
        if (this.isDarwin) {
            icon.setTemplateImage(true)
            return icon.resize({ width: 22, height: 22 })
        }
        return icon.resize({ width: 16, height: 16 })
    }

    public createTray(): void {
        try {
            this.tray = new Tray(this.createIcon())
            this.tray.setToolTip("DST Recorder")

            this.updateMenu()

            // На macOS клик по трею обычно показывает меню
            // На других платформах - правый клик
            if (this.isDarwin) {
                this.tray.on("click", () => this.tray?.popUpContextMenu())
                this.tray.on("right-click", () => this.tray?.popUpContextMenu())
            }
        } catch (error) {
            console.error("Error creating tray:", error)
        }
    }

    public updateMenu(status?: RecordingStatus): void {
        if (!this.tray) return

        if (status?.isRecording) {
            this.tray.setContextMenu(this.getRecordingMenu())
            if (this.isDarwin) this.tray?.setTitle(this.getFormattedDuration(status.duration))
        } else {
            this.tray.setContextMenu(this.getDefaultMenu())
            if (this.isDarwin) this.tray?.setTitle("")
        }
    }

    private getDefaultMenu(): Menu {
        const { crop, video, audio } = screenRecorder.getSettings()
        return Menu.buildFromTemplate([
            {
                label: "▶️ Начать запись",
                click: () => this.startRecording(),
            },
            {
                label:   `-Видео: ${video?.label} (${crop.w}*${crop.h})`,
                enabled: false,
            },
            {
                label:   `-Звук:    ${audio?.name}`,
                enabled: false,
            },
            {
                type: "separator",
            },
            {
                label: "⚙️ Настройки",
                click: () => this.openSettings(),
            },
            {
                label: "⏱️ Таймер",
                click: () => this.openTimer(),
            },
            {
                label: "📐Область",
                click: () => this.openAria(),
            },
            {
                label: "📂 Открыть папку с записями",
                click: () => this.openRecordingsFolder(),
            },
            {
                type: "separator",
            },
            {
                label: "Выход",
                click: () => this.quitApp(),
            },
        ])
    }

    private getRecordingMenu(): Menu {
        return Menu.buildFromTemplate([
            {
                label: "⏹️ Остановить запись",
                click: () => this.stopRecording(),
            },
            {
                type: "separator",
            },
            {
                label: "⚙️ Настройки",
                click: () => this.openSettings(),
            },
            {
                label: "⏱️ Таймер",
                click: () => this.openTimer(),
            },
            {
                label: "📂 Открыть папку с записями",
                click: () => this.openRecordingsFolder(),
            },
            {
                type: "separator",
            },
            {
                label: "Выход",
                click: () => this.quitApp(),
            },
        ])
    }

    private async startRecording(): Promise<void> {
        try {
            // Скрываем все окна перед началом записи
            const mainWindow = getWindowByName(WindowName.Main)
            const timerWindow = getWindowByName(WindowName.Timer)

            if (mainWindow?.isVisible()) mainWindow.hide()
            if (timerWindow?.isVisible()) timerWindow.hide()

            // Начинаем запись
            const result = await screenRecorder.startRecording()
            if (result?.error) {
                console.error("Failed to start recording:", result.error)
                return
            }

            // Показываем окно таймера
            // if (timerWindow) timerWindow.show()
        } catch (error) {
            console.error("Error starting recording:", error)
        }
    }

    private async stopRecording(): Promise<void> {
        await screenRecorder.stopRecording()

        // Скрываем окно таймера
        // const timerWindow = getWindowByName(WindowName.Timer)
        // if (timerWindow) timerWindow.hide()
    }

    private openSettings(): void {
        const mainWindow = getWindowByName(WindowName.Main)
        if (mainWindow) {
            mainWindow.show()
            mainWindow.webContents.send(ExposedWinMain.SHOW)
        }
    }

    private openTimer(): void {
        const timerWindow = getWindowByName(WindowName.Timer)
        if (timerWindow) timerWindow.show()
    }

    private openAria(): void {
        const ariaWindow = getWindowByName(WindowName.SelectAria)
        if (ariaWindow) {
            // для переотрытия на нужном экране
            ariaWindow.hide()
            getWindowByName(WindowName.Timer)?.hide()

            ariaWindow.show()
            updatePositionByAria(ariaWindow)
        }
    }

    private openRecordingsFolder(): void {
        const recordingsPath = screenRecorder.getSettings()?.outputPath
        if (recordingsPath) shell.openPath(recordingsPath)
    }

    private quitApp(): void {
        // Если идет запись, сначала останавливаем её
        if (screenRecorder.getIsRecording()) {
            this.stopRecording().then(() => app.quit())
        } else {
            app.quit()
        }
    }

    private getFormattedDuration(duration: number): string {
        const minutes = Math.floor(duration / 60)
        const seconds = duration % 60
        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
}

export const trayManager = TrayManager.getInstance()
