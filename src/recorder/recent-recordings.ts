import { app, clipboard, ClipboardItem } from "electron"
import { existsSync, FSWatcher, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync } from "fs"
import { join } from "path"
import { pathToFileURL } from "url"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { readMp4DurationMs } from "@/recorder/mp4-duration.ts"
import { logger } from "@/utils/logger.ts"

/**
 * Последние записи для меню трея — это просто самые свежие видео в папке сохранения.
 * Папка отслеживается: новые, удалённые и перемещённые в Finder файлы сразу отражаются в меню,
 * в том числе записи, сделанные до запуска приложения.
 *
 * Длительность берётся из заголовка файла, а для фрагментированных MP4 (где её в заголовке нет) —
 * из того, что приложение запомнило при сохранении (recent-recordings.json).
 */

const MAX_ITEMS = 5
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm)$/i
// Пока идёт запись, файл меняется каждую секунду, а при удалении нескольких файлов приходит пачка событий
const WATCH_DEBOUNCE_MS = 1000
// Сколько длительностей помнить — с запасом, чтобы хватило на всю папку за долгое время
const MAX_REMEMBERED = 500

export interface RecentRecording {
    path:       string
    fileName:   string
    // null — длительность неизвестна (чужое видео без длительности в заголовке)
    durationMs: number | null
    sizeBytes:  number
    // когда файл последний раз менялся (для записи — когда она закончилась)
    savedAt:    number
}

/** Файл в буфер обмена как «скопированный файл»: вставляется в Slack, Telegram, Finder */
export async function copyFileToClipboard(path: string) {
    await clipboard.write([new ClipboardItem({ "text/uri-list": pathToFileURL(path).href })])
}

class RecentRecordings {
    private readonly durationsPath = join(app.getPath("userData"), "recent-recordings.json")
    // Длительности записей, сделанных приложением: path → ms
    private durations = this.readDurations()
    private folder = ""
    // Файл, который сейчас записывается: в списке его нет, пока запись не закончится
    private recordingPath: string | null = null
    private items: RecentRecording[] = []
    // Длительность из заголовка файла: читаем заново, только если файл изменился
    private headerDurations = new Map<string, { key: string, durationMs: number | null }>()
    private watcher: FSWatcher | null = null
    private refreshTimer: ReturnType<typeof setTimeout> | null = null
    private listeners: (() => void)[] = []

    /** Папка сохранения из настроек. Вызывается при запуске и при смене папки */
    setFolder(folder: string) {
        if (folder === this.folder) return
        this.folder = folder
        this.watch()
        this.refresh()
    }

    setRecordingPath(path: string | null) {
        this.recordingPath = path
        this.refresh()
    }

    /** Самые свежие видео — от новых к старым */
    list(): RecentRecording[] {
        return this.items
    }

    /** Запись сохранена: запоминаем длительность (во фрагментированном MP4 её нет) и обновляем список */
    add(info: RecordingSavedInfo) {
        this.durations.set(info.path, info.durationMs)
        while (this.durations.size > MAX_REMEMBERED) {
            const oldest = this.durations.keys().next().value
            if (oldest === undefined) break
            this.durations.delete(oldest)
        }
        this.saveDurations()
        this.refresh()
    }

    /** Файл переименовали из миниатюры: запомненная длительность переезжает на новое имя */
    rename(oldPath: string, newPath: string) {
        const durationMs = this.durations.get(oldPath)
        if (durationMs !== undefined) {
            this.durations.delete(oldPath)
            this.durations.set(newPath, durationMs)
            this.saveDurations()
        }
        this.refresh()
    }

    /** Перечитать папку; слушатели узнают, только если список изменился */
    refresh() {
        const next = this.scan()
        const signature = (items: RecentRecording[]) => items.map(item => `${item.path}:${item.savedAt}`).join("|")
        if (signature(next) === signature(this.items)) return
        this.items = next
        this.listeners.forEach(listener => listener())
    }

    onChange(listener: () => void) {
        this.listeners.push(listener)
    }

    private scan(): RecentRecording[] {
        if (!this.folder || !existsSync(this.folder)) return []
        try {
            return readdirSync(this.folder, { withFileTypes: true })
                .filter(entry => entry.isFile() && VIDEO_EXTENSIONS.test(entry.name) && !entry.name.startsWith("."))
                .map((entry) => {
                    const path = join(this.folder, entry.name)
                    const { size, mtimeMs } = statSync(path)
                    return { path, fileName: entry.name, sizeBytes: size, savedAt: mtimeMs }
                })
                // Пустые файлы — оборванная запись или файл, который ещё создаётся
                .filter(file => file.sizeBytes > 0 && file.path !== this.recordingPath)
                .sort((a, b) => b.savedAt - a.savedAt)
                .slice(0, MAX_ITEMS)
                .map(file => ({ ...file, durationMs: this.getDuration(file.path, file.sizeBytes, file.savedAt) }))
        } catch (error) {
            logger.warn("[Recent] Failed to read the folder:", error)
            return []
        }
    }

    private getDuration(path: string, sizeBytes: number, savedAt: number): number | null {
        const remembered = this.durations.get(path)
        if (remembered !== undefined) return remembered

        const key = `${sizeBytes}:${savedAt}`
        const cached = this.headerDurations.get(path)
        if (cached?.key === key) return cached.durationMs
        const durationMs = readMp4DurationMs(path, sizeBytes)
        this.headerDurations.set(path, { key, durationMs })
        return durationMs
    }

    private watch() {
        this.watcher?.close()
        this.watcher = null
        if (!this.folder || !existsSync(this.folder)) return
        try {
            this.watcher = watch(this.folder, () => this.scheduleRefresh())
            this.watcher.on("error", (error) => {
                logger.warn(`[Recent] Stopped watching ${this.folder}:`, error)
                this.watcher?.close()
                this.watcher = null
            })
        } catch (error) {
            logger.warn(`[Recent] Cannot watch ${this.folder}:`, error)
        }
    }

    private scheduleRefresh() {
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null
            this.refresh()
        }, WATCH_DEBOUNCE_MS)
    }

    private readDurations(): Map<string, number> {
        try {
            if (!existsSync(this.durationsPath)) return new Map()
            const parsed = JSON.parse(readFileSync(this.durationsPath, "utf-8")) as unknown
            // Прошлый формат файла — массив записей с path и durationMs
            if (Array.isArray(parsed)) {
                const entries = (parsed as { path?: unknown, durationMs?: unknown }[])
                    .filter(item => typeof item?.path === "string" && typeof item?.durationMs === "number")
                    .map(item => [item.path, item.durationMs] as [string, number])
                return new Map(entries)
            }
            if (!parsed || typeof parsed !== "object") return new Map()
            const entries = Object.entries(parsed as Record<string, unknown>)
                .filter((entry): entry is [string, number] => typeof entry[1] === "number")
            return new Map(entries)
        } catch (error) {
            logger.warn("[Recent] Failed to read durations:", error)
            return new Map()
        }
    }

    private saveDurations() {
        const tempPath = `${this.durationsPath}.tmp`
        try {
            writeFileSync(tempPath, JSON.stringify(Object.fromEntries(this.durations), null, 2), "utf-8")
            renameSync(tempPath, this.durationsPath)
        } catch (error) {
            logger.warn("[Recent] Failed to save durations:", error)
        }
    }
}

export const recentRecordings = new RecentRecordings()
