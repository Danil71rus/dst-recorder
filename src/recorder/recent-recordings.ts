import { app, clipboard, ClipboardItem } from "electron"
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs"
import { join } from "path"
import { pathToFileURL } from "url"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

/**
 * Последние записи — для меню трея: открыть, скопировать или показать файл, не заходя в папку.
 * Список хранится в recent-recordings.json в папке данных приложения; удалённые и перемещённые файлы
 * из него выпадают сами.
 */

const MAX_ITEMS = 5

export interface RecentRecording {
    path:       string
    fileName:   string
    durationMs: number
    sizeBytes:  number
    // когда запись сохранена (ms с 1970 года)
    savedAt:    number
}

/** Файл в буфер обмена как «скопированный файл»: вставляется в Slack, Telegram, Finder */
export async function copyFileToClipboard(path: string) {
    await clipboard.write([new ClipboardItem({ "text/uri-list": pathToFileURL(path).href })])
}

class RecentRecordings {
    private readonly filePath = join(app.getPath("userData"), "recent-recordings.json")
    private items: RecentRecording[] = this.read()
    private listeners: (() => void)[] = []

    /** Записи, файлы которых ещё на месте — от новых к старым */
    list(): RecentRecording[] {
        return this.items.filter(item => existsSync(item.path))
    }

    add(info: RecordingSavedInfo) {
        const item: RecentRecording = {
            path:       info.path,
            fileName:   info.fileName,
            durationMs: info.durationMs,
            sizeBytes:  info.sizeBytes,
            savedAt:    Date.now(),
        }
        this.items = [item, ...this.list().filter(existing => existing.path !== item.path)].slice(0, MAX_ITEMS)
        this.save()
        this.notify()
    }

    /** Файл удалили или переместили из меню — убираем его из списка */
    refresh() {
        const actual = this.list()
        if (actual.length === this.items.length) return
        this.items = actual
        this.save()
        this.notify()
    }

    onChange(listener: () => void) {
        this.listeners.push(listener)
    }

    private notify() {
        this.listeners.forEach(listener => listener())
    }

    private read(): RecentRecording[] {
        try {
            if (!existsSync(this.filePath)) return []
            const parsed = JSON.parse(readFileSync(this.filePath, "utf-8")) as unknown
            if (!Array.isArray(parsed)) return []
            const isRecording = (item: RecentRecording | null): item is RecentRecording => {
                return typeof item?.path === "string" && typeof item?.savedAt === "number"
            }
            return (parsed as (RecentRecording | null)[]).filter(isRecording).slice(0, MAX_ITEMS)
        } catch (error) {
            logger.warn("[Recent] Failed to read the list:", error)
            return []
        }
    }

    private save() {
        const tempPath = `${this.filePath}.tmp`
        try {
            writeFileSync(tempPath, JSON.stringify(this.items, null, 2), "utf-8")
            renameSync(tempPath, this.filePath)
        } catch (error) {
            logger.warn("[Recent] Failed to save the list:", error)
        }
    }
}

export const recentRecordings = new RecentRecordings()
