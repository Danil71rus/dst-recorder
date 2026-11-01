import { app, nativeImage, NativeImage, Tray } from "electron"
import { join } from "path"
import { RecordingStatus } from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

type ControlIcon = "pause" | "play" | "stop"

interface RecordingControlsActions {
    pause:  () => void
    resume: () => void
    stop:   () => void
}

/**
 * Кнопки паузы и остановки прямо в строке меню — отдельные значки рядом с иконкой приложения,
 * срабатывают по одному клику, без меню. Показываются только для записи, начатой из трея:
 * при записи из таймера управление остаётся в таймере.
 *
 * macOS ставит каждый новый значок левее предыдущих, поэтому создаём сначала «стоп», потом «паузу»:
 * в строке меню получается [пауза] [стоп] [иконка приложения].
 */
export class RecordingControls {
    private stopTray: Tray | null = null
    private pauseTray: Tray | null = null
    private isPaused = false
    private readonly icons = new Map<ControlIcon, NativeImage>()

    constructor(private readonly actions: RecordingControlsActions) {}

    get isShown() {
        return this.pauseTray !== null
    }

    show() {
        if (this.isShown) return
        this.isPaused = false

        this.stopTray = new Tray(this.icon("stop"))
        this.stopTray.setToolTip("Остановить запись")
        this.stopTray.on("click", () => this.actions.stop())

        this.pauseTray = new Tray(this.icon("pause"))
        this.pauseTray.setToolTip("Пауза")
        this.pauseTray.on("click", () => (this.isPaused ? this.actions.resume() : this.actions.pause()))

        // Если места в строке меню не хватает, macOS прячет новые значки за вырезом камеры — по координатам это видно
        logger.info("[Tray] Recording controls shown at", this.pauseTray.getBounds(), this.stopTray.getBounds())
    }

    /** Кнопка паузы превращается в «продолжить» и обратно — по состоянию записи, откуда бы ни поставили паузу */
    update(status: RecordingStatus) {
        const isPaused = Boolean(status.isPaused)
        if (!this.pauseTray || isPaused === this.isPaused) return
        this.isPaused = isPaused
        this.pauseTray.setImage(this.icon(isPaused ? "play" : "pause"))
        this.pauseTray.setToolTip(isPaused ? "Продолжить запись" : "Пауза")
    }

    hide() {
        this.pauseTray?.destroy()
        this.stopTray?.destroy()
        this.pauseTray = null
        this.stopTray = null
    }

    /** Монохромные template-иконки: macOS красит их под светлую и тёмную строку меню */
    private icon(name: ControlIcon): NativeImage {
        let icon = this.icons.get(name)
        if (!icon) {
            const path = join(app.getAppPath(), "src/assets/tray", `${name}Template.png`)
            icon = nativeImage.createFromPath(path)
            if (icon.isEmpty()) logger.error(`[Tray] Control icon not found: ${path}`)
            icon.setTemplateImage(true)
            this.icons.set(name, icon)
        }
        return icon
    }
}
