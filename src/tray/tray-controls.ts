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
 * macOS ставит каждый новый значок левее всех уже существующих, а если места нет — прячет его.
 * Поэтому значки создаются один раз при запуске, сразу после иконки приложения, и занимают места рядом с ней:
 * [пауза] [стоп] [иконка приложения]. Пока записи нет, они пустые — без картинки значок не занимает места.
 */
export class RecordingControls {
    private stopTray: Tray | null = null
    private pauseTray: Tray | null = null
    private isVisible = false
    private isPaused = false
    private readonly icons = new Map<ControlIcon, NativeImage>()

    constructor(private readonly actions: RecordingControlsActions) {}

    /** Вызывать сразу после создания иконки приложения */
    create() {
        if (this.pauseTray) return

        // Сначала «стоп», потом «пауза»: каждый следующий значок встаёт левее
        this.stopTray = new Tray(nativeImage.createEmpty())
        this.stopTray.on("click", () => {
            if (this.isVisible) this.actions.stop()
        })

        this.pauseTray = new Tray(nativeImage.createEmpty())
        this.pauseTray.on("click", () => {
            if (!this.isVisible) return
            if (this.isPaused) this.actions.resume()
            else this.actions.pause()
        })
    }

    show() {
        if (this.isVisible || !this.pauseTray || !this.stopTray) return
        this.isVisible = true
        this.isPaused = false

        this.stopTray.setImage(this.icon("stop"))
        this.stopTray.setToolTip("Остановить запись")
        this.pauseTray.setImage(this.icon("pause"))
        this.pauseTray.setToolTip("Пауза")
        logger.info("[Tray] Recording controls shown at", this.pauseTray.getBounds(), this.stopTray.getBounds())
    }

    /** Кнопка паузы превращается в «продолжить» и обратно — по состоянию записи, откуда бы ни поставили паузу */
    update(status: RecordingStatus) {
        const isPaused = Boolean(status.isPaused)
        if (!this.isVisible || !this.pauseTray || isPaused === this.isPaused) return
        this.isPaused = isPaused
        this.pauseTray.setImage(this.icon(isPaused ? "play" : "pause"))
        this.pauseTray.setToolTip(isPaused ? "Продолжить запись" : "Пауза")
    }

    hide() {
        if (!this.isVisible) return
        this.isVisible = false
        for (const tray of [this.pauseTray, this.stopTray]) {
            tray?.setImage(nativeImage.createEmpty())
            tray?.setToolTip("")
        }
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
