import {
    app,
    BrowserWindow,
    clipboard,
    ClipboardItem,
    ipcMain,
    nativeImage,
    NativeImage,
    screen,
    shell,
} from "electron"
import { join } from "path"
import { pathToFileURL } from "url"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { ExposedRecordingPreview } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { findDisplay } from "@/recorder/displays.ts"
import { logger } from "@/utils/logger.ts"

/**
 * Миниатюра после записи — как у скриншотов macOS: в углу экрана на несколько секунд появляется превью
 * с длительностью и размером файла и кнопками «Открыть», «Скопировать», «В Finder», «Удалить».
 * Файл можно перетащить из миниатюры прямо в Slack, Telegram или письмо.
 */

// Сколько миниатюра висит, если её не трогать; пока курсор над ней — не прячется
const AUTO_HIDE_MS = 10_000
const SCREEN_MARGIN = 16
const THUMBNAIL_SIZE = { width: 640, height: 360 }
const DRAG_ICON_WIDTH = 160

export interface RecordingPreviewPayload {
    info:      RecordingSavedInfo
    // кадр из видео (data URL); null — пока не готов или macOS не смогла его сделать
    thumbnail: string | null
}

class RecordingPreview {
    private current: RecordingSavedInfo | null = null
    private thumbnail: NativeImage | null = null
    private hideTimer: ReturnType<typeof setTimeout> | null = null
    private isHovered = false

    init(previewWindow: BrowserWindow) {
        const onCurrent = (action: (info: RecordingSavedInfo) => void | Promise<void>) => async () => {
            if (!this.current) return
            try {
                await action(this.current)
            } catch (error) {
                logger.error("[Preview] Action failed:", error)
            }
        }

        ipcMain.on(ExposedRecordingPreview.OPEN, onCurrent(async ({ path }) => {
            this.hide()
            await shell.openPath(path)
        }))
        ipcMain.handle(ExposedRecordingPreview.COPY, onCurrent(async ({ path }) => {
            // text/uri-list Electron кладёт в буфер как «скопированный файл»: вставляется в Slack, Telegram, Finder
            await clipboard.write([new ClipboardItem({ "text/uri-list": pathToFileURL(path).href })])
        }))
        ipcMain.on(ExposedRecordingPreview.REVEAL, onCurrent(({ path }) => {
            this.hide()
            shell.showItemInFolder(path)
        }))
        // В Корзину, а не насовсем: случайно удалённую запись можно вернуть
        ipcMain.on(ExposedRecordingPreview.DELETE, onCurrent(async ({ path }) => {
            this.hide()
            await shell.trashItem(path)
            logger.info("[Preview] Moved to Trash:", path)
        }))
        ipcMain.on(ExposedRecordingPreview.CLOSE, () => this.hide())
        ipcMain.on(ExposedRecordingPreview.HOVER, (_event, isHovered: boolean) => {
            this.isHovered = Boolean(isHovered)
            if (this.isHovered) this.clearHideTimer()
            else this.scheduleHide()
        })
        ipcMain.on(ExposedRecordingPreview.START_DRAG, (event) => {
            if (!this.current) return
            event.sender.startDrag({ file: this.current.path, icon: this.getDragIcon() })
        })

        previewWindow.on("hide", () => this.clearHideTimer())
    }

    async show(info: RecordingSavedInfo) {
        const previewWindow = getWindowByName(WindowName.RecordingPreview)
        if (!previewWindow || previewWindow.isDestroyed()) return

        this.current = info
        this.thumbnail = null
        this.isHovered = false

        // В правый нижний угол экрана, который записывался
        const workArea = this.getWorkArea(info.displayId)
        const [width = 0, height = 0] = previewWindow.getSize()
        previewWindow.setPosition(
            Math.round(workArea.x + workArea.width - width - SCREEN_MARGIN),
            Math.round(workArea.y + workArea.height - height - SCREEN_MARGIN),
        )

        this.send({ info, thumbnail: null })
        // showInactive: не отбираем фокус у приложения, в котором работает пользователь
        previewWindow.showInactive()
        this.scheduleHide()

        // Кадр из видео делает Quick Look — это занимает долю секунды, поэтому подставляем его, когда будет готов
        const thumbnail = await nativeImage.createThumbnailFromPath(info.path, THUMBNAIL_SIZE).catch((error) => {
            logger.warn("[Preview] Thumbnail is not available:", error)
            return null
        })
        if (this.current !== info || !thumbnail || thumbnail.isEmpty()) return
        this.thumbnail = thumbnail
        this.send({ info, thumbnail: thumbnail.toDataURL() })
    }

    hide() {
        this.clearHideTimer()
        const previewWindow = getWindowByName(WindowName.RecordingPreview)
        if (previewWindow && !previewWindow.isDestroyed()) previewWindow.hide()
        this.current = null
    }

    private send(payload: RecordingPreviewPayload) {
        getWindowByName(WindowName.RecordingPreview)?.webContents.send(ExposedRecordingPreview.SHOW, payload)
    }

    /** Рабочая область экрана — без строки меню и Dock, чтобы миниатюра их не перекрывала */
    private getWorkArea(displayId?: number) {
        const display = findDisplay(displayId)
        return screen.getAllDisplays().find(item => item.id === display.id)?.workArea ?? display.bounds
    }

    private scheduleHide() {
        this.clearHideTimer()
        if (this.isHovered) return
        this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS)
    }

    private clearHideTimer() {
        if (this.hideTimer) clearTimeout(this.hideTimer)
        this.hideTimer = null
    }

    /** Картинка под курсором при перетаскивании: кадр из видео или иконка приложения */
    private getDragIcon(): NativeImage {
        if (this.thumbnail) return this.thumbnail.resize({ width: DRAG_ICON_WIDTH })
        return nativeImage.createFromPath(join(app.getAppPath(), "src/assets/camera.png")).resize({ width: 64 })
    }
}

export const recordingPreview = new RecordingPreview()
