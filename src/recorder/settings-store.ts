import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { dirname } from "path"
import {
    AfterRecordingAction,
    Compression,
    COUNTDOWN_OPTIONS,
    FPS_OPTIONS,
    getDefaultSettings,
    HotkeySettings,
    MIC_DEFAULT,
    normalizeSize,
    RecorderSettings,
    VideoCodec,
} from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

// Поля старого формата (версия с FFmpeg): из них переносится выбранный монитор
interface LegacySettings {
    video?: { displayId?: number }
}

type StoredSettings = Partial<RecorderSettings> & LegacySettings

// Длиннее ни одно разумное сочетание клавиш не бывает: защита от мусора в файле настроек
const MAX_HOTKEY_LENGTH = 64

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"

function sanitizeHotkeys(value: Partial<HotkeySettings> | undefined, defaults: HotkeySettings): HotkeySettings {
    const pick = (hotkey: unknown, fallback: string) => {
        return isString(hotkey) && hotkey.length <= MAX_HOTKEY_LENGTH ? hotkey : fallback
    }
    return {
        toggleRecording: pick(value?.toggleRecording, defaults.toggleRecording),
        togglePause:     pick(value?.togglePause, defaults.togglePause),
        selectArea:      pick(value?.selectArea, defaults.selectArea),
    }
}

const AFTER_RECORDING_ACTIONS = Object.values(AfterRecordingAction) as string[]
const isAfterRecordingAction = (value: unknown) => isString(value) && AFTER_RECORDING_ACTIONS.includes(value)

/** Значение enum из файла настроек; незнакомое заменяется значением по умолчанию */
function pickEnum<T extends string>(values: Record<string, T>, value: unknown, fallback: T): T {
    return Object.values(values).includes(value as T) ? value as T : fallback
}

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
        fps:               FPS_OPTIONS.includes(Number(value.fps)) ? Number(value.fps) : defaults.fps,
        defSize:           normalizeSize(Number(value.defSize)),
        videoCodec:        pickEnum(VideoCodec, value.videoCodec, defaults.videoCodec),
        compression:       pickEnum(Compression, value.compression, defaults.compression),
        displayId:         isNumber(displayId) ? displayId : undefined,
        micDeviceId:       isString(value.micDeviceId) && value.micDeviceId ? value.micDeviceId : MIC_DEFAULT,
        micLabel:          isString(value.micLabel) ? value.micLabel : "",
        recordSystemAudio: isBoolean(value.recordSystemAudio) ? value.recordSystemAudio : defaults.recordSystemAudio,
        showBorder:        isBoolean(value.showBorder) ? value.showBorder : defaults.showBorder,
        hotkeys:           sanitizeHotkeys(value.hotkeys, defaults.hotkeys),
        countdownSeconds:  COUNTDOWN_OPTIONS.includes(Number(value.countdownSeconds))
            ? Number(value.countdownSeconds)
            : defaults.countdownSeconds,
        afterRecording:    isAfterRecordingAction(value.afterRecording)
            ? value.afterRecording as AfterRecordingAction
            : defaults.afterRecording,
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
