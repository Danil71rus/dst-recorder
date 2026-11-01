import { CaptureInfo, CaptureOptions, CaptureResult, CaptureSource, MIC_NONE } from "@/deinitions/recorder.ts"
import { AudioMixer } from "./audio-mixer.ts"
import { openMicrophone, RAW_AUDIO } from "./media-devices.ts"
import { VideoCrop } from "./video-crop.ts"

/**
 * Одна запись: экран (+ звук компьютера) из getDisplayMedia, микрофон из getUserMedia,
 * сведение звука в WebAudio и кодирование в MediaRecorder (аппаратный H.264 + AAC в MP4).
 */

// Кусочек файла раз в секунду: фрагментированный MP4 на диске переживает сбой
const CHUNK_INTERVAL_MS = 1000
const AUDIO_BITS_PER_SECOND = 128_000

export interface CaptureSink {
    chunk: (data: Uint8Array) => void
    ended: (reason: string) => void
}

/** Ошибка с указанием источника — по нему main понимает, какое разрешение просить */
class CaptureError extends Error {
    constructor(source: CaptureSource, cause: unknown) {
        const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
        super(`[${source}] ${text}`)
    }
}

/** Уровень H.264 по размеру кадра (в макроблоках 16×16): 4.0 — до 1080p, 5.0 — до 1440p, 5.1 — 4K */
function h264Level(width: number, height: number) {
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
    if (macroblocks <= 8192) return "28"
    if (macroblocks <= 22080) return "32"
    return "33"
}

function pickMimeType(width: number, height: number, hasAudio: boolean): string {
    const audio = hasAudio ? ",mp4a.40.2" : ""
    const candidates = [
        `video/mp4;codecs=avc1.6400${h264Level(width, height)}${audio}`,
        `video/mp4;codecs=avc1${audio}`,
        "video/mp4",
    ]
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType) throw new Error("MP4 recording is not supported by this Chromium build")
    return mimeType
}

export class CaptureSession {
    private readonly streams: MediaStream[] = []
    private mixer: AudioMixer | null = null
    private crop: VideoCrop | null = null
    private recorder: MediaRecorder | null = null
    // Кусочки отправляются строго по порядку
    private sending: Promise<void> = Promise.resolve()
    private chunks = 0
    private isStopping = false

    constructor(private readonly sink: CaptureSink) {}

    async start(options: CaptureOptions): Promise<CaptureInfo> {
        const display = await this.captureDisplay(options)
        const [screenTrack] = display.getVideoTracks()
        if (!screenTrack) throw new CaptureError(CaptureSource.Screen, "No screen video track")
        const [systemTrack] = display.getAudioTracks()
        // Текст и интерфейс: кодировщик бережёт чёткость, а не плавность
        screenTrack.contentHint = "detail"
        screenTrack.addEventListener("ended", () => this.reportEnded(`[${CaptureSource.Screen}] screen capture ended`))

        const microphone = await this.captureMicrophone(options)
        const micTrack = microphone?.getAudioTracks()[0]
        micTrack?.addEventListener("ended", () => {
            this.reportEnded(`[${CaptureSource.Microphone}] microphone disconnected`)
        })

        if (micTrack || systemTrack) {
            this.mixer = new AudioMixer({ microphone: micTrack, system: systemTrack })
            await this.mixer.start()
        }

        if (options.crop) this.crop = new VideoCrop(screenTrack, options.crop)
        const videoTrack = this.crop?.track || screenTrack

        const { width = options.width, height = options.height } = screenTrack.getSettings()
        const outputWidth = options.crop ? Math.round(options.crop.width * width) : width
        const outputHeight = options.crop ? Math.round(options.crop.height * height) : height
        const mimeType = pickMimeType(outputWidth, outputHeight, Boolean(this.mixer))

        const tracks = this.mixer ? [videoTrack, this.mixer.track] : [videoTrack]
        this.recorder = new MediaRecorder(new MediaStream(tracks), {
            mimeType,
            videoBitsPerSecond: options.videoBitsPerSecond,
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
        })
        this.recorder.ondataavailable = event => this.send(event.data)
        this.recorder.onerror = (event) => {
            this.reportEnded(`[recorder] ${String((event as ErrorEvent).error ?? "error")}`)
        }
        this.recorder.start(CHUNK_INTERVAL_MS)

        return {
            mimeType,
            width:          outputWidth,
            height:         outputHeight,
            hasSystemAudio: Boolean(systemTrack),
            micLabel:       micTrack?.label ?? null,
        }
    }

    pause() {
        if (this.recorder?.state === "recording") this.recorder.pause()
    }

    resume() {
        if (this.recorder?.state === "paused") this.recorder.resume()
    }

    /** Останавливает запись и возвращает число отправленных кусочков, когда отправлен последний */
    async stop(): Promise<CaptureResult> {
        this.isStopping = true
        const recorder = this.recorder
        if (recorder && recorder.state !== "inactive") {
            const stopped = new Promise(resolve => recorder.addEventListener("stop", resolve, { once: true }))
            recorder.stop()
            await stopped
        }
        await this.sending
        return { chunks: this.chunks }
    }

    async dispose() {
        this.isStopping = true
        this.crop?.dispose()
        this.streams.forEach(stream => stream.getTracks().forEach(track => track.stop()))
        await this.mixer?.dispose()
        this.recorder = null
    }

    private async captureDisplay(options: CaptureOptions) {
        try {
            const display = await navigator.mediaDevices.getDisplayMedia({
                // Chromium сам масштабирует картинку экрана до запрошенного размера
                video: {
                    width:     { ideal: options.width },
                    height:    { ideal: options.height },
                    frameRate: { ideal: options.fps, max: options.fps },
                },
                // Звук компьютера — стерео и без обработки, предназначенной для голоса
                audio: options.recordSystemAudio ? { ...RAW_AUDIO, channelCount: 2 } : false,
            })
            this.streams.push(display)
            return display
        } catch (error) {
            throw new CaptureError(CaptureSource.Screen, error)
        }
    }

    private async captureMicrophone(options: CaptureOptions) {
        if (options.micDeviceId === MIC_NONE) return null
        try {
            const microphone = await openMicrophone(options.micDeviceId, options.micLabel)
            this.streams.push(microphone)
            return microphone
        } catch (error) {
            throw new CaptureError(CaptureSource.Microphone, error)
        }
    }

    private send(data: Blob) {
        if (!data.size) return
        this.chunks++
        this.sending = this.sending
            .then(async () => this.sink.chunk(new Uint8Array(await data.arrayBuffer())))
            .catch(error => console.error("[Capture] Failed to send chunk:", error))
    }

    private reportEnded(reason: string) {
        if (!this.isStopping) this.sink.ended(reason)
    }
}
