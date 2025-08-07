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
    outputPath: string
    fps:        number
    size:       {
        width:  number
        height: number
    }
    audio?: FfmpegDevice,
    video?: FfmpegDevice,
}

export const getDefaultSettings = (): FfmpegSettings => ({
    outputPath: "",
    fps:        30,
    size:       { width: 1920, height: 1080 },
})
