import { app, Tray, Menu, MenuItemConstructorOptions, nativeImage, shell } from "electron"
import { join } from "path"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { screenRecorder } from "@/recorder/screen-recorder.ts"
import { ExposedWinMain, ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { describeAudio, RecordingStatus, sizeTitleMap } from "@/deinitions/recorder.ts"
import { updatePositionByAria } from "@/window/ipc-handlers/ipc-win-select-aria.ts"
import { appName } from "@/utils/utilsForMain.ts"
import { logger } from "@/utils/logger.ts"
import { RecordingControls } from "@/tray/tray-controls.ts"

const isDarwin = process.platform === "darwin"
// Иконка Windows/Linux: размер значка в области уведомлений
const TRAY_ICON_SIZE = 16

export class TrayManager {
    private static instance: TrayManager
    private tray: Tray | null = null
    // Ключ текущего меню: пересобираем меню только когда оно реально меняется, а не каждую секунду.
    // Иначе открытое меню закрывалось бы само раз в секунду
    private menuKey = ""
    // Запись начата из трея: показываем кнопки паузы и остановки в строке меню (только macOS)
    private isStartedFromTray = false
    private readonly controls = new RecordingControls({
        pause:  () => screenRecorder.pauseRecording(),
        resume: () => screenRecorder.resumeRecording(),
        stop:   () => void screenRecorder.stopRecording(),
    })

    private constructor() {}

    public static getInstance(): TrayManager {
        if (!TrayManager.instance) TrayManager.instance = new TrayManager()
        return TrayManager.instance
    }

    /**
     * macOS: монохромная template-иконка (имя оканчивается на Template, рядом лежит @2x для Retina) —
     * система сама красит её под светлую и тёмную строку меню, как у системных значков.
     * Остальные ОС: цветная иконка приложения.
     */
    private createIcon() {
        const assets = join(app.getAppPath(), "src/assets")
        const size = { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }
        const icon = isDarwin
            ? nativeImage.createFromPath(join(assets, "tray", "trayTemplate.png"))
            : nativeImage.createFromPath(join(assets, "camera.png")).resize(size)

        if (icon.isEmpty()) logger.error(`[Tray] Icon not found in ${assets}`)
        if (isDarwin) icon.setTemplateImage(true)
        return icon
    }

    public createTray(): void {
        try {
            this.tray = new Tray(this.createIcon())
            this.tray.setToolTip(appName)
            this.updateMenu()

            // macOS открывает меню по клику сам (setContextMenu). Windows — только по правому клику, добавляем левый
            if (!isDarwin) this.tray.on("click", () => this.tray?.popUpContextMenu())
        } catch (error) {
            logger.error("[Tray] Error creating tray:", error)
        }
    }

    public updateMenu(status: RecordingStatus = screenRecorder.getRecordingStatus()): void {
        if (!this.tray) return

        if (status.isRecording) {
            const isPaused = Boolean(status.isPaused)
            this.setMenu(`recording:${isPaused}`, () => this.getRecordingMenu(isPaused))
            this.setTitle(status)
            this.updateControls(status)
        } else {
            const { video, audio } = this.describeSettings()
            this.setMenu(`default:${video}:${audio}`, () => this.getDefaultMenu())
            this.setTitle(null)
            this.isStartedFromTray = false
            this.controls.hide()
        }
    }

    private updateControls(status: RecordingStatus) {
        if (!isDarwin || !this.isStartedFromTray) return
        this.controls.show()
        this.controls.update(status)
    }

    private setMenu(key: string, build: () => Menu) {
        if (!this.tray || this.menuKey === key) return
        this.menuKey = key
        this.tray.setContextMenu(build())
    }

    /** Время записи рядом с иконкой (macOS), когда таймер скрыт. На паузе — значок паузы вместо точки */
    private setTitle(status: RecordingStatus | null) {
        if (!this.tray || !isDarwin) return
        const title = status && !this.isTimerVisible()
            ? `${status.isPaused ? "❚❚" : "●"} ${this.getFormattedDuration(status.duration)}`
            : ""
        // monospacedDigit: цифры одной ширины, чтобы значки в строке меню не дёргались каждую секунду
        this.tray.setTitle(title, { fontType: "monospacedDigit" })
    }

    /** Подписи выбранного экрана и звука для меню */
    private describeSettings() {
        const settings = screenRecorder.getSettings()
        const display = screenRecorder.getSelectedDisplay()
        return {
            video: `${display.label} (${sizeTitleMap[settings.defSize]})`,
            audio: describeAudio(settings),
        }
    }

    private getDefaultMenu(): Menu {
        const { video, audio } = this.describeSettings()
        return Menu.buildFromTemplate([
            {
                label: "▶️ Начать запись",
                click: () => void this.startRecording(),
            },
            {
                label:   `Экран: ${video}`,
                enabled: false,
            },
            {
                label:   `Звук: ${audio}`,
                enabled: false,
            },
            { type: "separator" },
            {
                label: "⚙️ Настройки",
                click: () => this.openSettings(),
            },
            {
                label: "⏱️ Таймер",
                click: () => this.openTimer(),
            },
            {
                label: "📐 Область",
                click: () => this.openAria(),
            },
            ...this.getCommonItems(),
        ])
    }

    private getRecordingMenu(isPaused: boolean): Menu {
        return Menu.buildFromTemplate([
            {
                label:   isPaused ? "Запись на паузе" : "Идёт запись",
                enabled: false,
            },
            isPaused
                ? {
                    label: "▶️ Продолжить",
                    click: () => screenRecorder.resumeRecording(),
                }
                : {
                    label: "⏸️ Пауза",
                    click: () => screenRecorder.pauseRecording(),
                },
            {
                label: "⏹️ Остановить запись",
                click: () => void screenRecorder.stopRecording(),
            },
            { type: "separator" },
            {
                label: "⏱️ Таймер",
                click: () => this.openTimer(),
            },
            ...this.getCommonItems(),
        ])
    }

    private getCommonItems(): MenuItemConstructorOptions[] {
        return [
            {
                label: "📂 Открыть папку с записями",
                click: () => this.openRecordingsFolder(),
            },
            { type: "separator" },
            {
                label: "Выход",
                // Остановку записи и ожидание сохранения файла делает обработчик before-quit в main.ts
                click: () => app.quit(),
            },
        ]
    }

    private async startRecording(): Promise<void> {
        // Окна настроек и таймера не должны попасть в запись
        getWindowByName(WindowName.Main)?.hide()
        getWindowByName(WindowName.Timer)?.hide()

        this.isStartedFromTray = true
        const result = await screenRecorder.startRecording()
        if (result.error) {
            this.isStartedFromTray = false
            logger.warn("[Tray] Recording did not start:", result.error)
        }
    }

    private openSettings(): void {
        const mainWindow = getWindowByName(WindowName.Main)
        if (!mainWindow) return
        mainWindow.show()
        mainWindow.webContents.send(ExposedWinMain.SHOW)
    }

    private openTimer(): void {
        getWindowByName(WindowName.Timer)?.show()
        // Время у иконки нужно, только пока таймер скрыт
        this.updateMenu()
    }

    private isTimerVisible() {
        return Boolean(getWindowByName(WindowName.Timer)?.isVisible())
    }

    private openAria(): void {
        const ariaWindow = getWindowByName(WindowName.SelectAria)
        if (!ariaWindow) return

        // Скрываем и показываем заново, чтобы рамка открылась на текущем экране
        ariaWindow.hide()
        getWindowByName(WindowName.Timer)?.hide()

        ariaWindow.show()
        updatePositionByAria(ariaWindow)

        getWindowByName(WindowName.Timer)?.webContents.send(ExposedWinSelectAria.SET_ARIA_ACTIVE, true)
    }

    private openRecordingsFolder(): void {
        const recordingsPath = screenRecorder.getSettings().outputPath
        if (recordingsPath) void shell.openPath(recordingsPath)
    }

    private getFormattedDuration(duration: number): string {
        const minutes = Math.floor(duration / 60)
        const seconds = duration % 60
        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
}

export const trayManager = TrayManager.getInstance()
