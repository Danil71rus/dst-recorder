import { FfmpegDeviceVideo, Size } from "../../deinitions/ffmpeg.ts"

export function getResultScale(newVideo: FfmpegDeviceVideo, size = Size.Medium) {
    // console.log("getResultScale: newVideo: ", newVideo)
    const res = {
        w: Math.max(Math.ceil((newVideo.scaleMax?.width || 1) / size), 0),
        h: Math.max(Math.ceil((newVideo.scaleMax?.height || 1) / size), 0),
    }
    // console.log("!!!!!!getResultScale: res: ", res)
    return {
        scale: { ...res },
        crop:  { ...res },
    }
}
