import { onBeforeUnmount, Ref, ref, watch } from "vue"
import { openMicrophone } from "@/capture/media-devices.ts"
import { MIC_NONE } from "@/deinitions/recorder.ts"

// Шкала индикатора: от −60 dBFS (тишина) до 0 dBFS (перегрузка)
const FLOOR_DB = -60
// Индикатор поднимается сразу, а опускается плавно — как у обычного VU-метра
const DECAY = 0.92

interface AudioLevelOptions {
    deviceId: Ref<string>
    label:    Ref<string>
    // слушать микрофон только когда индикатор виден: открытый микрофон AirPods переводит их в режим гарнитуры
    enabled:  Ref<boolean>
}

/** Уровень сигнала микрофона 0..1 для индикатора рядом с выбором микрофона */
export function useAudioLevel({ deviceId, label, enabled }: AudioLevelOptions) {
    const level = ref(0)
    const isAvailable = ref(true)

    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let frame = 0
    // Защита от гонок: пока открывался прошлый микрофон, пользователь мог выбрать другой
    let generation = 0

    function stop() {
        generation++
        cancelAnimationFrame(frame)
        stream?.getTracks().forEach(track => track.stop())
        void context?.close().catch(() => undefined)
        stream = null
        context = null
        level.value = 0
    }

    async function start() {
        stop()
        if (!enabled.value || deviceId.value === MIC_NONE) return

        const current = generation
        try {
            const opened = await openMicrophone(deviceId.value, label.value)
            if (current !== generation) {
                opened.getTracks().forEach(track => track.stop())
                return
            }
            stream = opened
            context = new AudioContext()
            const analyser = context.createAnalyser()
            analyser.fftSize = 1024
            context.createMediaStreamSource(opened).connect(analyser)
            isAvailable.value = true

            const samples = new Float32Array(analyser.fftSize)
            const tick = () => {
                analyser.getFloatTimeDomainData(samples)
                const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
                const db = peak > 0 ? 20 * Math.log10(peak) : FLOOR_DB
                const value = Math.min(Math.max((db - FLOOR_DB) / -FLOOR_DB, 0), 1)
                level.value = Math.max(value, level.value * DECAY)
                frame = requestAnimationFrame(tick)
            }
            tick()
        } catch (error) {
            if (current !== generation) return
            isAvailable.value = false
            console.warn("[AudioLevel] Cannot open microphone:", error)
        }
    }

    watch([deviceId, enabled], () => void start(), { immediate: true })
    onBeforeUnmount(stop)

    return {
        level,
        isAvailable,
    }
}
