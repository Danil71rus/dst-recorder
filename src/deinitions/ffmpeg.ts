// Интерфейсы для типизации результата
export interface FfmpegDevice {
    index: number
    name:  string
}

export interface FfmpegDeviceVideo extends FfmpegDevice {
    isScreen?:    boolean
    bounds?:      { x: number, y: number, width: number, height: number }
    workArea?:    { x: number, y: number, width: number, height: number }
    scaleFactor?: number
    size?:        { width: number, height: number }
    scaleMax?:    { width: number, height: number }
    label?:       string
}

export interface FfmpegDeviceLists {
    video: FfmpegDeviceVideo[]
    audio: FfmpegDevice[]
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
export function normalizeSize(size?: Size): Size {
    if (size && SIZE_PRESETS.includes(size)) return size
    return DEFAULT_SIZE
}

export interface FfmpegSettings {
    // куда будет сохранен файл
    outputPath:  string
    // fps видео
    fps:         number
    defSize:     Size
    defSizeName: string
    // итоговое разрешение видео: hd, fulHD, 2k, 4k
    scale:       { w: number, h: number }
    // область записи
    crop:        { w: number, h: number }
    // смещение области от начала экрана
    offset:      { x: number, y: number }
    // показывать зеленую рамку при записи
    showBorder?: boolean
    audio?:      FfmpegDevice
    video?:      FfmpegDeviceVideo
}

export interface StartRecordingResponse {
    outputPathAndFileName?: string
    error?:                 string
}

export interface RecordingStatus {
    isRecording: boolean
    isPaused?:   boolean
    duration:    number
}

export const getDefaultSettings = (): FfmpegSettings => ({
    outputPath:  "",
    fps:         30,
    defSize:     DEFAULT_SIZE,
    defSizeName: "",
    scale:       { w: 0, h: 0 },
    crop:        { w: 0, h: 0 },
    offset:      { x: 0, y: 0 },
    showBorder:  false,
})
