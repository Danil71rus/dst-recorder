/**
 * Insertable Streams для видео (Chromium): MediaStreamTrackProcessor / MediaStreamTrackGenerator.
 * В стандартной библиотеке TypeScript их нет. https://w3c.github.io/mediacapture-transform/
 */

declare global {
    interface MediaStreamTrackProcessorInit {
        track:          MediaStreamTrack
        maxBufferSize?: number
    }

    class MediaStreamTrackProcessor<T = VideoFrame> {
        constructor(init: MediaStreamTrackProcessorInit)
        readonly readable: ReadableStream<T>
    }

    interface MediaStreamTrackGeneratorInit {
        kind: "audio" | "video"
    }

    class MediaStreamTrackGenerator<T = VideoFrame> extends MediaStreamTrack {
        constructor(init: MediaStreamTrackGeneratorInit)
        readonly writable: WritableStream<T>
    }
}

export {}
