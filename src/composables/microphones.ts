import { computed, onBeforeUnmount, onMounted, Ref, ref } from "vue"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import { listMicrophones, MicrophoneInfo } from "@/capture/media-devices.ts"
import { MIC_DEFAULT, MIC_NONE } from "@/deinitions/recorder.ts"

interface MicrophoneSelection {
    micDeviceId: string
    micLabel:    string
}

/**
 * Список микрофонов для выбора в настройках. Обновляется сам при подключении/отключении устройств
 * (AirPods, USB-микрофон).
 */
export function useMicrophones(selection: Ref<MicrophoneSelection>) {
    const devices = ref<MicrophoneInfo[]>([])
    const defaultLabel = ref("")

    async function refresh() {
        try {
            const result = await listMicrophones()
            devices.value = result.devices
            defaultLabel.value = result.defaultLabel
        } catch (error) {
            // Нет доступа к микрофону — в списке останутся «по умолчанию» и «без микрофона»
            console.warn("[Microphones] Failed to list devices:", error)
        }
    }

    onMounted(() => {
        void refresh()
        navigator.mediaDevices.addEventListener("devicechange", refresh)
    })
    onBeforeUnmount(() => navigator.mediaDevices.removeEventListener("devicechange", refresh))

    const micList = computed((): ComboboxItem[] => {
        const { micDeviceId, micLabel } = selection.value
        const items: ComboboxItem[] = [
            {
                id:       MIC_DEFAULT,
                title:    "Микрофон по умолчанию",
                subtitle: defaultLabel.value,
            },
            ...devices.value.map(device => ({
                id:    device.deviceId,
                title: device.label,
            })),
        ]

        // Выбранный микрофон сейчас не подключён: показываем его, чтобы выбор не потерялся
        const isMissing = ![MIC_DEFAULT, MIC_NONE].includes(micDeviceId)
            && !devices.value.some(device => device.deviceId === micDeviceId)
        if (isMissing) {
            items.push({
                id:       micDeviceId,
                title:    micLabel || "Микрофон",
                subtitle: "Не подключён — будет записан микрофон по умолчанию",
            })
        }

        items.push({ id: MIC_NONE, title: "Без микрофона" })
        return items
    })

    /** Название для сохранения вместе с deviceId: по нему микрофон найдётся, если id сменится */
    function labelOf(deviceId: string) {
        if (deviceId === MIC_DEFAULT) return defaultLabel.value
        if (deviceId === MIC_NONE) return ""
        return devices.value.find(device => device.deviceId === deviceId)?.label || selection.value.micLabel
    }

    return {
        micList,
        labelOf,
        refresh,
    }
}
