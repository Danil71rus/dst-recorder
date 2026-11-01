import { app, Tray, Menu, MenuItemConstructorOptions, nativeImage, Point, Rectangle, shell } from "electron"
import { join } from "path"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { screenRecorder } from "@/recorder/screen-recorder.ts"
import { ExposedWinMain, ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { describeAudio, HotkeyAction, RecordingStatus, sizeTitleMap } from "@/deinitions/recorder.ts"
import { updatePositionByAria } from "@/window/ipc-handlers/ipc-win-select-aria.ts"
import { appName } from "@/utils/utilsForMain.ts"
import { logger } from "@/utils/logger.ts"
import { getClickTarget, getTrayIcon } from "@/tray/tray-controls.ts"
import { copyFileToClipboard, RecentRecording, recentRecordings } from "@/recorder/recent-recordings.ts"
import { formatDuration, formatFileSize, formatRecordingTime } from "@/utils/format.ts"

const isDarwin = process.platform === "darwin"
// Иконка Windows/Linux: размер значка в области уведомлений
const TRAY_ICON_SIZE = 16

type TrayControls = "none" | "pause" | "play"

export class TrayManager {
    private static instance: TrayManager
    private tray: Tray | null = null
    // Ключ текущего меню: пересобираем меню только когда оно реально меняется, а не каждую секунду.
    // Иначе открытое меню закрывалось бы само раз в секунду
    private menuKey = ""
    private menu: Menu | null = null
    // Запись начата из трея: в иконке появляются кнопки паузы и остановки (только macOS)
    private isStartedFromTray = false
    private controls: TrayControls = "none"

    private constructor() {}

    public static getInstance(): TrayManager {
        if (!TrayManager.instance) TrayManager.instance = new TrayManager()
        return TrayManager.instance
    }

    /**
     * macOS: монохромная template-иконка (с @2x для Retina) — система сама красит её под светлую и тёмную
     * строку меню, как у системных значков. Остальные ОС: цветная иконка приложения.
     */
    private createIcon() {
        if (isDarwin) return getTrayIcon("none")

        const path = join(app.getAppPath(), "src/assets/camera.png")
        const icon = nativeImage.createFromPath(path)
        if (icon.isEmpty()) logger.error(`[Tray] Icon not found: ${path}`)
        return icon.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE })
    }

    public createTray(): void {
        try {
            this.tray = new Tray(this.createIcon())
            this.tray.setToolTip(appName)
            this.updateMenu()
            // Новая запись сохранилась или файл удалили — пересобираем список последних записей
            recentRecordings.onChange(() => this.updateMenu())

            if (isDarwin) {
                // Меню по клику macOS открывает сама (setContextMenu). Пока в иконке кнопки — разбираем клик сами
                this.tray.on("click", (_event, bounds, position) => this.onControlsClick(bounds, position))
                this.tray.on("right-click", () => this.popUpMenuInControlsMode())
            } else {
                // Windows открывает меню только по правому клику — добавляем левый
                this.tray.on("click", () => this.tray?.popUpContextMenu())
            }
        } catch (error) {
            logger.error("[Tray] Error creating tray:", error)
        }
    }

    public updateMenu(status: RecordingStatus = screenRecorder.getRecordingStatus()): void {
        if (!this.tray) return

        if (status.isRecording) {
            const isPaused = Boolean(status.isPaused)
            this.setMenu(`recording:${isPaused}:${this.extraKey()}`, () => this.getRecordingMenu(isPaused))
            this.setTitle(status)
        } else {
            const { video, audio } = this.describeSettings()
            this.setMenu(`default:${video}:${audio}:${this.extraKey()}`, () => this.getDefaultMenu())
            this.setTitle(null)
            this.isStartedFromTray = false
        }
        this.setControls(this.getWantedControls(status))
    }

    private getWantedControls(status: RecordingStatus): TrayControls {
        if (!isDarwin || !this.isStartedFromTray || !status.isRecording) return "none"
        return status.isPaused ? "play" : "pause"
    }

    /** Кнопки в иконке. Пока они есть, меню не привязано к клику: клик по кнопке не должен открывать меню */
    private setControls(controls: TrayControls) {
        if (!this.tray || controls === this.controls) return
        const wasShown = this.controls !== "none"
        this.controls = controls
        this.tray.setImage(getTrayIcon(controls))
        if (wasShown !== (controls !== "none")) this.applyMenu()
    }

    private onControlsClick(bounds: Rectangle, position: Point) {
        if (this.controls === "none") return

        const target = getClickTarget(bounds, position)
        if (target === "pause") {
            if (this.controls === "play") screenRecorder.resumeRecording()
            else screenRecorder.pauseRecording()
        } else if (target === "stop") {
            void screenRecorder.stopRecording()
        } else {
            this.popUpMenuInControlsMode()
        }
    }

    private popUpMenuInControlsMode() {
        if (this.controls !== "none" && this.menu) this.tray?.popUpContextMenu(this.menu)
    }

    private setMenu(key: string, build: () => Menu) {
        if (!this.tray || this.menuKey === key) return
        this.menuKey = key
        this.menu = build()
        this.applyMenu()
    }

    private applyMenu() {
        this.tray?.setContextMenu(this.controls === "none" ? this.menu : null)
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
                ...this.accelerator("toggleRecording"),
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
                    ...this.accelerator("togglePause"),
                    click: () => screenRecorder.resumeRecording(),
                }
                : {
                    label: "⏸️ Пауза",
                    ...this.accelerator("togglePause"),
                    click: () => screenRecorder.pauseRecording(),
                },
            {
                label: "⏹️ Остановить запись",
                ...this.accelerator("toggleRecording"),
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

    /**
     * Сочетание клавиш справа от пункта меню — только подпись: срабатывает глобальное сочетание (hotkeys.ts),
     * поэтому меню его не регистрирует
     */
    private accelerator(action: HotkeyAction): Partial<MenuItemConstructorOptions> {
        const accelerator = screenRecorder.getSettings().hotkeys[action]
        return accelerator ? { accelerator, registerAccelerator: false } : {}
    }

    /** Сочетания клавиш и последние записи: при их изменении меню пересобирается */
    private extraKey() {
        const { toggleRecording, togglePause } = screenRecorder.getSettings().hotkeys
        const recent = recentRecordings.list().map(item => item.path).join("|")
        return `${toggleRecording}|${togglePause}|${recent}`
    }

    /** «Последние записи»: подменю на каждую запись с действиями над файлом */
    private getRecentItems(): MenuItemConstructorOptions[] {
        const recent = recentRecordings.list()
        if (!recent.length) return []

        return [{
            label:   "🕘 Последние записи",
            submenu: recent.map(item => ({
                label:   this.describeRecording(item),
                submenu: this.getRecordingActions(item),
            })),
        }]
    }

    /** «14:17  ·  0:42  ·  12,4 МБ» */
    private describeRecording(item: RecentRecording) {
        const time = formatRecordingTime(item.savedAt)
        return [time, formatDuration(item.durationMs), formatFileSize(item.sizeBytes)].join("  ·  ")
    }

    private getRecordingActions(item: RecentRecording): MenuItemConstructorOptions[] {
        return [
            {
                label:   item.fileName,
                enabled: false,
            },
            {
                label: "Открыть",
                click: () => void shell.openPath(item.path),
            },
            {
                label: "Скопировать файл",
                click: () => {
                    copyFileToClipboard(item.path).catch(error => logger.error("[Tray] Copy failed:", error))
                },
            },
            {
                label: "Показать в Finder",
                click: () => shell.showItemInFolder(item.path),
            },
            { type: "separator" },
            {
                label: "Удалить (в Корзину)",
                click: () => {
                    shell.trashItem(item.path)
                        .catch(error => logger.error("[Tray] Move to Trash failed:", error))
                        .finally(() => recentRecordings.refresh())
                },
            },
        ]
    }

    private getCommonItems(): MenuItemConstructorOptions[] {
        return [
            ...this.getRecentItems(),
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

    /** Старт из трея или по горячей клавише: в иконке появляются кнопки паузы и остановки */
    public async startRecording(): Promise<void> {
        // Окна настроек и таймера не должны попасть в запись
        getWindowByName(WindowName.Main)?.hide()
        getWindowByName(WindowName.Timer)?.hide()

        this.isStartedFromTray = true
        const result = await screenRecorder.startRecording()
        if (result.error) {
            this.isStartedFromTray = false
            logger.warn("[Tray] Recording did not start:", result.error)
            return
        }
        // Не ждём следующего тика статуса: кнопки появляются сразу, как запись началась
        this.updateMenu()
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
