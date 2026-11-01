/**
 * Сводит микрофон и звук компьютера в одну стереодорожку для MediaRecorder.
 */

// Микшер работает на фиксированной частоте: иначе он подстраивается под устройство вывода
// (AirPods в режиме гарнитуры — 24 кГц) и ужимает до «телефонного» и голос, и звук компьютера
const MIX_SAMPLE_RATE = 48_000
// Голос в записи тише звука компьютера — поднимаем его
const MIC_GAIN = 2

export interface AudioMixerSources {
    microphone?: MediaStreamTrack
    system?:     MediaStreamTrack
}

export class AudioMixer {
    private readonly context = new AudioContext({ sampleRate: MIX_SAMPLE_RATE })
    private readonly destination = this.context.createMediaStreamDestination()

    constructor(sources: AudioMixerSources) {
        this.destination.channelCount = 2

        if (sources.microphone) {
            const gain = this.context.createGain()
            gain.gain.value = MIC_GAIN
            this.connect(sources.microphone).connect(gain).connect(this.destination)
        }
        if (sources.system) this.connect(sources.system).connect(this.destination)
    }

    get track(): MediaStreamTrack {
        const [track] = this.destination.stream.getAudioTracks()
        if (!track) throw new Error("Audio mixer has no output track")
        return track
    }

    get sampleRate() {
        return this.context.sampleRate
    }

    async start() {
        if (this.context.state !== "running") await this.context.resume()
    }

    async dispose() {
        await this.context.close().catch(() => undefined)
    }

    private connect(track: MediaStreamTrack) {
        return this.context.createMediaStreamSource(new MediaStream([track]))
    }
}
