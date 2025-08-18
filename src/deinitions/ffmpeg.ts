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
    Max = 1,
    Medium = 2,
    Min = 4,
}

export interface FfmpegSettings {
    // куда будет сохранен файл
    outputPath: string
    // fps видео
    fps:        number
    defSize:    Size
    // итоговое разрешение видео: hd, fulHD, 2k, 4k
    scale:      { w: number, h: number }
    // область записи
    crop:       { w: number, h: number }
    // смещение области от начала экрана
    offset:     { x: number, y: number }
    audio?:  FfmpegDevice
    video?:  FfmpegDeviceVideo
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
    defSize:    Size.Max,
    scale:      { w: 0, h: 0 },
    crop:       { w: 0, h: 0 },
    offset:     { x: 0, y: 0 },
})
