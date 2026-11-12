import { VideoCodec } from "@/deinitions/recorder.ts"

/**
 * MIME-тип записи для MediaRecorder: MP4 с H.264 или HEVC (оба кодирует аппаратно VideoToolbox) и AAC.
 * Общий модуль: окно записи выбирает по нему кодек, окно настроек — показывать ли HEVC.
 */

// Наибольший кадр уровня HEVC 4.x (в пикселях); больше — уровни 5.x
const HEVC_LEVEL_4_MAX_PIXELS = 2_228_224

/** Уровень H.264 по размеру кадра (в макроблоках 16×16): 4.0 — до 1080p, 5.0 — до 1440p, 5.1 — 4K */
function h264Level(width: number, height: number) {
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
    if (macroblocks <= 8192) return "28"
    if (macroblocks <= 22080) return "32"
    return "33"
}

/** Уровень HEVC: 4.0 / 4.1 — до 1080p (30 / 60 кадров), 5.0 / 5.1 — до 4K */
function hevcLevel(width: number, height: number, fps: number) {
    if (width * height <= HEVC_LEVEL_4_MAX_PIXELS) return fps <= 30 ? "L120" : "L123"
    return fps <= 30 ? "L150" : "L153"
}

interface VideoFormat {
    codec:    VideoCodec
    width:    number
    height:   number
    fps:      number
    hasAudio: boolean
}

/** Тег hvc1 (а не hev1) — с ним файл открывают QuickTime и Finder */
function hevcMimeTypes({ width, height, fps }: VideoFormat, audio: string) {
    return [
        `video/mp4;codecs=hvc1.1.6.${hevcLevel(width, height, fps)}.B0${audio}`,
        `video/mp4;codecs=hvc1${audio}`,
    ]
}

/** Если HEVC выбран, но Chromium им не кодирует, запись идёт в H.264 */
export function pickMimeType(format: VideoFormat): string {
    const audio = format.hasAudio ? ",mp4a.40.2" : ""
    const candidates = [
        ...(format.codec === VideoCodec.Hevc ? hevcMimeTypes(format, audio) : []),
        `video/mp4;codecs=avc1.6400${h264Level(format.width, format.height)}${audio}`,
        `video/mp4;codecs=avc1${audio}`,
        "video/mp4",
    ]
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType) throw new Error("MP4 recording is not supported by this Chromium build")
    return mimeType
}

export function isHevcSupported() {
    const format = { codec: VideoCodec.Hevc, width: 1920, height: 1080, fps: 30, hasAudio: true }
    return hevcMimeTypes(format, ",mp4a.40.2").some(type => MediaRecorder.isTypeSupported(type))
}
