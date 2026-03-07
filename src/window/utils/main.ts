import { DEFAULT_SIZE, FfmpegDeviceVideo, normalizeSize, Size, sizeTitleMap } from "../../deinitions/ffmpeg.ts"

export function getResultScale(newVideo: FfmpegDeviceVideo, size: Size | number = DEFAULT_SIZE) {
    const targetHeight = normalizeSize(Number(size))
    const maxW = newVideo.scaleMax?.width || 0
    const maxH = newVideo.scaleMax?.height || 0

    if (maxW <= 0 || maxH <= 0) {
        return {
            scale: { w: 0, h: 0 },
            crop:  { w: 0, h: 0 },
        }
    }

    const ratio = maxW / maxH
    const h = Math.min(targetHeight, maxH)
    const w = Math.min(Math.round(h * ratio), maxW)

    const res = {
        w: Math.max(w, 1),
        h: Math.max(h, 1),
    }

    return {
        scale:       { ...res },
        crop:        { ...res },
        defSizeName: sizeTitleMap[targetHeight],
    }
}
