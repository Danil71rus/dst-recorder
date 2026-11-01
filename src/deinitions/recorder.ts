export interface Rect {
    x:      number
    y:      number
    width:  number
    height: number
}

/** Монитор (данные Electron screen) */
export interface DisplayInfo {
    id:          number
    label:       string
    // логические точки, как у окон
    bounds:      Rect
    scaleFactor: number
    // физическое разрешение матрицы
    physical:    { width: number, height: number }
    isPrimary:   boolean
}

export enum Size {
    P720 = 720,
    P1080 = 1080,
    P2K = 1440,
    P4K = 2160,
}

export const DEFAULT_SIZE = Size.P1080
export const SIZE_PRESETS: Size[] = [Size.P4K, Size.P2K, Size.P1080, Size.P720]
export const sizeTitleMap: Record<Size, string> = {
    [Size.P4K]:   "4K",
    [Size.P2K]:   "2K",
    [Size.P1080]: "1080P",
    [Size.P720]:  "720P",
}

export function normalizeSize(size?: number): Size {
    if (size && SIZE_PRESETS.includes(size)) return size
    return DEFAULT_SIZE
}

// Специальные значения выбора микрофона: системный по умолчанию и запись без микрофона
export const MIC_DEFAULT = "default"
export const MIC_NONE = "none"

export interface RecorderSettings {
    // куда сохраняются записи
    outputPath:        string
    fps:               number
    // качество: максимальная высота итогового видео
    defSize:           Size
    // выбранный монитор (id дисплея Electron). Если он отключён — пишется основной
    displayId?:        number
    // микрофон: deviceId Chromium (или MIC_DEFAULT / MIC_NONE) и его название — запасной способ найти устройство
    micDeviceId:       string
    micLabel:          string
    // записывать звук компьютера (YouTube, собеседники в созвоне)
    recordSystemAudio: boolean
    // подсвечивать записываемый экран рамкой
    showBorder:        boolean
}

export const getDefaultSettings = (): RecorderSettings => ({
    outputPath:        "",
    fps:               30,
    defSize:           DEFAULT_SIZE,
    micDeviceId:       MIC_DEFAULT,
    micLabel:          "",
    recordSystemAudio: true,
    showBorder:        false,
})

export interface StartRecordingResponse {
    outputPathAndFileName?: string
    error?:                 string
}

export interface RecordingStatus {
    isRecording: boolean
    isPaused?:   boolean
    duration:    number
}

/** Параметры, с которыми main запускает захват в окне записи (CaptureView) */
export interface CaptureOptions {
    // размер захвата всего экрана; Chromium масштабирует картинку сам
    width:              number
    height:             number
    fps:                number
    // область записи в долях кадра (0..1); null — весь экран
    crop:               Rect | null
    videoBitsPerSecond: number
    micDeviceId:        string
    micLabel:           string
    recordSystemAudio:  boolean
}

/** Что получилось запустить на самом деле */
export interface CaptureInfo {
    mimeType:       string
    width:          number
    height:         number
    hasSystemAudio: boolean
    micLabel:       string | null
}

export interface CaptureResult {
    // сколько кусочков файла отправлено в main — по нему main ждёт, пока запишется всё
    chunks: number
}

/**
 * Ответ окна записи. Ошибки возвращаются значением, а не исключением: исключение из executeJavaScript
 * теряет текст (DOMException не переживает передачу между процессами)
 */
export type CaptureReply<T> = { ok: true, value: T } | { ok: false, error: string }

/** API окна записи, которое main вызывает через webContents.executeJavaScript */
export interface CaptureApi {
    start:  (options: CaptureOptions) => Promise<CaptureReply<CaptureInfo>>
    pause:  () => Promise<CaptureReply<void>>
    resume: () => Promise<CaptureReply<void>>
    stop:   () => Promise<CaptureReply<CaptureResult>>
}

// Откуда пришла ошибка захвата — по этому префиксу main показывает нужную инструкцию по разрешениям
export enum CaptureSource {
    Screen = "screen",
    Microphone = "microphone",
}

/** Короткое описание звука для таймера и трея: «AirPods + звук компьютера» */
export function describeAudio(settings: Pick<RecorderSettings, "micDeviceId" | "micLabel" | "recordSystemAudio">) {
    const mic = {
        [MIC_NONE]:    "",
        [MIC_DEFAULT]: "Микрофон по умолчанию",
    }[settings.micDeviceId] ?? (settings.micLabel || "Микрофон")
    const parts = [mic, settings.recordSystemAudio ? "звук компьютера" : ""].filter(Boolean)
    if (!parts.length) return "Без звука"

    const text = parts.join(" + ")
    return text.charAt(0).toUpperCase() + text.slice(1)
}
