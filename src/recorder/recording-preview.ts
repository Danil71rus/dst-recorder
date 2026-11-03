import { app, BrowserWindow, ipcMain, nativeImage, NativeImage, screen, shell } from "electron"
import { existsSync, renameSync } from "fs"
import { basename, dirname, extname, join } from "path"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { ExposedRecordingPreview } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { findDisplay } from "@/recorder/displays.ts"
import { logger } from "@/utils/logger.ts"
import { copyFileToClipboard, recentRecordings } from "@/recorder/recent-recordings.ts"

/**
 * Миниатюра после записи — как у скриншотов macOS: в углу экрана на несколько секунд появляется превью
 * с длительностью и размером файла и кнопками «Открыть», «Скопировать», «В Finder», «Удалить».
 * Файл можно перетащить из миниатюры прямо в Slack, Telegram или письмо, а имя файла — поменять прямо в ней.
 */

// Сколько миниатюра висит, если её не трогать; пока курсор над ней — не прячется
const AUTO_HIDE_MS = 10_000
const SCREEN_MARGIN = 16
const THUMBNAIL_SIZE = { width: 640, height: 360 }
const DRAG_ICON_WIDTH = 160
const MAX_NAME_LENGTH = 200
// Символы, запрещённые в именах файлов macOS и Windows, и управляющие символы
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g

export interface RenameResult {
    info?:  RecordingSavedInfo
    error?: string
}

/** Имя из поля ввода → безопасное имя файла: без запрещённых символов, точек в начале и лишних пробелов */
function sanitizeFileName(name: string): string {
    return name
        .replace(FORBIDDEN_NAME_CHARS, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\.+/, "")
        .slice(0, MAX_NAME_LENGTH)
        .trim()
}

/** Свободный путь: если файл с таким именем уже есть — «Имя 2.mp4», «Имя 3.mp4»… */
function findFreePath(folder: string, baseName: string, extension: string, currentPath: string): string {
    let candidate = join(folder, `${baseName}${extension}`)
    for (let index = 2; existsSync(candidate) && candidate !== currentPath; index++) {
        candidate = join(folder, `${baseName} ${index}${extension}`)
    }
    return candidate
}

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
    // Пока редактируется имя файла, миниатюра не прячется, даже если курсор ушёл
    private isEditing = false
    // Номер показа: кадр из видео, пришедший после закрытия или следующей записи, не должен попасть не туда
    private showToken = 0

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
        ipcMain.handle(ExposedRecordingPreview.COPY, onCurrent(({ path }) => copyFileToClipboard(path)))
        ipcMain.on(ExposedRecordingPreview.REVEAL, onCurrent(({ path }) => {
            this.hide()
            shell.showItemInFolder(path)
        }))
        // В Корзину, а не насовсем: случайно удалённую запись можно вернуть
        ipcMain.on(ExposedRecordingPreview.DELETE, onCurrent(async ({ path }) => {
            this.hide()
            await shell.trashItem(path)
            logger.info("[Preview] Moved to Trash:", path)
            recentRecordings.refresh()
        }))
        ipcMain.on(ExposedRecordingPreview.CLOSE, () => this.hide())
        ipcMain.on(ExposedRecordingPreview.HOVER, (_event, isHovered: boolean) => {
            this.isHovered = Boolean(isHovered)
            this.scheduleHide()
        })
        ipcMain.on(ExposedRecordingPreview.EDITING, (_event, isEditing: boolean) => {
            this.isEditing = Boolean(isEditing)
            // Приложение живёт в строке меню и обычно не активно — без фокуса в поле имени нельзя печатать
            if (this.isEditing) {
                app.focus({ steal: true })
                previewWindow.focus()
            }
            this.scheduleHide()
        })
        ipcMain.handle(ExposedRecordingPreview.RENAME, (_event, name: string) => this.rename(String(name)))
        ipcMain.on(ExposedRecordingPreview.START_DRAG, (event) => {
            if (!this.current) return
            event.sender.startDrag({ file: this.current.path, icon: this.getDragIcon() })
        })

        previewWindow.on("hide", () => this.clearHideTimer())
    }

    async show(info: RecordingSavedInfo) {
        const previewWindow = getWindowByName(WindowName.RecordingPreview)
        if (!previewWindow || previewWindow.isDestroyed()) return

        const token = ++this.showToken
        this.current = info
        this.thumbnail = null
        this.isHovered = false
        this.isEditing = false

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
        // За это время файл могли переименовать — отправляем актуальные данные о нём
        if (token !== this.showToken || !this.current || !thumbnail || thumbnail.isEmpty()) return
        this.thumbnail = thumbnail
        this.send({ info: this.current, thumbnail: thumbnail.toDataURL() })
    }

    hide() {
        this.clearHideTimer()
        const previewWindow = getWindowByName(WindowName.RecordingPreview)
        if (previewWindow && !previewWindow.isDestroyed()) previewWindow.hide()
        this.current = null
        this.showToken++
    }

    private send(payload: RecordingPreviewPayload) {
        getWindowByName(WindowName.RecordingPreview)?.webContents.send(ExposedRecordingPreview.SHOW, payload)
    }

    /** Рабочая область экрана — без строки меню и Dock, чтобы миниатюра их не перекрывала */
    private getWorkArea(displayId?: number) {
        const display = findDisplay(displayId)
        return screen.getAllDisplays().find(item => item.id === display.id)?.workArea ?? display.bounds
    }

    /** Переименовать текущую запись. Расширение и папка не меняются */
    private rename(name: string): RenameResult {
        const current = this.current
        if (!current) return { error: "Запись уже закрыта" }

        const baseName = sanitizeFileName(name)
        if (!baseName) return { error: "Введите имя файла" }

        const extension = extname(current.path)
        const newPath = findFreePath(dirname(current.path), baseName, extension, current.path)
        if (newPath === current.path) return { info: current }

        try {
            renameSync(current.path, newPath)
        } catch (error) {
            logger.error("[Preview] Rename failed:", error)
            return { error: "Не удалось переименовать файл" }
        }

        const info = { ...current, path: newPath, fileName: basename(newPath) }
        this.current = info
        recentRecordings.rename(current.path, newPath)
        logger.info(`[Preview] Renamed ${current.path} → ${newPath}`)
        return { info }
    }

    private scheduleHide() {
        this.clearHideTimer()
        if (this.isHovered || this.isEditing) return
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
