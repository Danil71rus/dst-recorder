import { Rect } from "@/deinitions/recorder.ts"

/**
 * Вырезает область из видео экрана (режим «Область»). Каждый кадр не копируется: новый VideoFrame
 * ссылается на тот же буфер с другим visibleRect, поэтому обрезка почти ничего не стоит.
 */

// Кадры экрана — NV12/I420: начало и размер области должны быть чётными
const even = (value: number) => Math.floor(value / 2) * 2

/** Область в пикселях кадра; crop задан в долях (0..1), потому что размер кадра выбирает Chromium */
function toVisibleRect(frame: VideoFrame, crop: Rect): DOMRectInit {
    const base = frame.visibleRect || { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight }
    const x = even(crop.x * base.width)
    const y = even(crop.y * base.height)
    return {
        x:      base.x + x,
        y:      base.y + y,
        width:  Math.max(2, even(Math.min(crop.width * base.width, base.width - x))),
        height: Math.max(2, even(Math.min(crop.height * base.height, base.height - y))),
    }
}

export class VideoCrop {
    private readonly generator = new MediaStreamTrackGenerator<VideoFrame>({ kind: "video" })
    private readonly abort = new AbortController()

    constructor(source: MediaStreamTrack, crop: Rect) {
        const processor = new MediaStreamTrackProcessor<VideoFrame>({ track: source })
        const transformer = new TransformStream<VideoFrame, VideoFrame>({
            transform(frame, controller) {
                try {
                    controller.enqueue(new VideoFrame(frame, { visibleRect: toVisibleRect(frame, crop) }))
                } finally {
                    frame.close()
                }
            },
        })

        processor.readable
            .pipeThrough(transformer, { signal: this.abort.signal })
            .pipeTo(this.generator.writable, { signal: this.abort.signal })
            .catch((error) => {
                if (!this.abort.signal.aborted) console.error("[VideoCrop] Pipeline stopped:", error)
            })
    }

    get track(): MediaStreamTrack {
        return this.generator
    }

    dispose() {
        this.abort.abort()
        this.generator.stop()
    }
}
