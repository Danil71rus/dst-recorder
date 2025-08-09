// Интерфейсы для типизации результата
export interface FfmpegDevice {
    index: number
    name:  string
}

export interface FfmpegDeviceLists {
    video: FfmpegDevice[]
    audio: FfmpegDevice[]
}

export interface FfmpegSettings {
    // куда будет сохранен файл
    outputPath: string
    // fps видео
    fps:        number
    // итоговое разрешение видео: hd, fulHD, 2k, 4k
    scale:      { w: number; h: number }
    // область записи
    crop:       { w: number; h: number }
    // смещение области от начала экрана
    offset:     { x: number; y: number }
    audio?:  FfmpegDevice
    video?:  FfmpegDevice
}

export interface StartRecordingResponse {
    outputPathAndFileName?: string
    error?:                 string
}

export interface RecordingStatus {
    isRecording: boolean
    duration:    number
}

export const getDefaultSettings = (): FfmpegSettings => ({
    outputPath: "",
    fps:        30,
    scale:      { w: 1920, h: 1080 },
    crop:       { w: 1920, h: 1080 },
    offset:     { x: 0, y: 0 },
})
