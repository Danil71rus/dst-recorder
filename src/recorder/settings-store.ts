import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { dirname } from "path"
import { getDefaultSettings, MIC_DEFAULT, normalizeSize, RecorderSettings } from "@/deinitions/recorder.ts"
import { logger } from "../utils/logger.ts"

// Поля старого формата (версия с FFmpeg): из них переносится выбранный монитор
interface LegacySettings {
    video?: { displayId?: number }
}

type StoredSettings = Partial<RecorderSettings> & LegacySettings

const MAX_FPS = 60

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"

/**
 * Приводит настройки к актуальному формату: только известные поля и корректные значения.
 * Используется и для файла настроек, и для настроек, пришедших из окон.
 */
export function sanitizeSettings(input: StoredSettings | undefined, defaultOutputPath: string): RecorderSettings {
    const defaults = getDefaultSettings()
    const value = input || {}
    const displayId = value.displayId ?? value.video?.displayId

    return {
        outputPath:        isString(value.outputPath) && value.outputPath ? value.outputPath : defaultOutputPath,
        fps:               isNumber(value.fps) && value.fps > 0 ? Math.min(Math.round(value.fps), MAX_FPS) : defaults.fps,
        defSize:           normalizeSize(Number(value.defSize)),
        displayId:         isNumber(displayId) ? displayId : undefined,
        micDeviceId:       isString(value.micDeviceId) && value.micDeviceId ? value.micDeviceId : MIC_DEFAULT,
        micLabel:          isString(value.micLabel) ? value.micLabel : "",
        recordSystemAudio: isBoolean(value.recordSystemAudio) ? value.recordSystemAudio : defaults.recordSystemAudio,
        showBorder:        isBoolean(value.showBorder) ? value.showBorder : defaults.showBorder,
    }
}

/** Настройки в JSON-файле в папке данных приложения */
export class SettingsStore {
    constructor(
        private readonly filePath: string,
        private readonly defaultOutputPath: string,
    ) {}

    load(): RecorderSettings {
        const settings = sanitizeSettings(this.read(), this.defaultOutputPath)
        return { ...settings, outputPath: this.ensureOutputDir(settings.outputPath) }
    }

    save(settings: RecorderSettings) {
        const tempPath = `${this.filePath}.tmp`
        try {
            mkdirSync(dirname(this.filePath), { recursive: true })
            // Атомарная запись: при падении посреди записи не останется битого JSON
            writeFileSync(tempPath, JSON.stringify(settings, null, 2), "utf-8")
            renameSync(tempPath, this.filePath)
        } catch (error) {
            logger.warn("[Settings] Failed to save:", error)
            try {
                if (existsSync(tempPath)) unlinkSync(tempPath)
            } catch { /* noop */ }
        }
    }

    /** Папка из настроек может быть недоступна (отключённый внешний диск) — откатываемся к стандартной */
    ensureOutputDir(path: string): string {
        try {
            mkdirSync(path, { recursive: true })
            return path
        } catch (error) {
            logger.warn(`[Settings] Output folder is not available: ${path}, fallback: ${this.defaultOutputPath}`)
            logger.warn(error)
            try {
                mkdirSync(this.defaultOutputPath, { recursive: true })
            } catch (e) {
                logger.error("[Settings] Failed to create default output folder:", e)
            }
            return this.defaultOutputPath
        }
    }

    private read(): StoredSettings | undefined {
        try {
            if (!existsSync(this.filePath)) return undefined
            const raw = readFileSync(this.filePath, "utf-8")
            return raw.trim() ? JSON.parse(raw) as StoredSettings : undefined
        } catch (error) {
            logger.warn("[Settings] Failed to read, using defaults:", error)
            return undefined
        }
    }
}
