import { DEFAULT_SIZE, FfmpegDeviceVideo, normalizeSize, Size, sizeTitleMap } from "../../deinitions/ffmpeg.ts"

export function getResultScale(newVideo: FfmpegDeviceVideo, size: Size | number = DEFAULT_SIZE) {
    const targetHeight = normalizeSize(Number(size))
    const maxW = newVideo.scaleMax?.width || 0
    const maxH = newVideo.scaleMax?.height || 0

    if (maxW <= 0 || maxH <= 0) {
        return {
            scale:  { w: 0, h: 0 },
            crop:   { w: 0, h: 0 },
            offset: { x: 0, y: 0 },
        }
    }

    // 1. CROP: берем полные физические размеры экрана и жестко делаем их четными
    const cropW = Math.floor(maxW) & ~1
    const cropH = Math.floor(maxH) & ~1

    // 2. SCALE: вычисляем целевое качество с сохранением пропорций
    const ratio = cropW / cropH
    const h = Math.min(targetHeight, cropH)
    const w = Math.min(Math.round(h * ratio), cropW)

    // Жестко делаем целевой масштаб четным (не меньше 2 пикселей)
    const scaleW = Math.max(Math.floor(w) & ~1, 2)
    const scaleH = Math.max(Math.floor(h) & ~1, 2)

    return {
        scale:       { w: scaleW, h: scaleH },
        crop:        { w: cropW, h: cropH },
        offset:      { x: 0, y: 0 }, // Явно сбрасываем смещение
        defSizeName: sizeTitleMap[targetHeight],
    }
}
