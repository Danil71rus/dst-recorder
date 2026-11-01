import { MIC_DEFAULT } from "@/deinitions/recorder.ts"

/**
 * Микрофоны глазами Chromium. Используется и окном записи, и окнами настроек (индикатор уровня):
 * у окон одного приложения deviceId совпадают.
 */

export interface MicrophoneInfo {
    deviceId:  string
    label:     string
    isDefault: boolean
}

// Звук без обработки «для звонков»: шумодав и автогромкость портят запись и искажают индикатор
export const RAW_AUDIO: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl:  false,
}

// Служебные записи Chromium, а не отдельные устройства
const ALIAS_DEVICE_IDS = [MIC_DEFAULT, "communications"]

async function enumerateMicrophones() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === "audioinput")
}

/** Список микрофонов. Названия Chromium отдаёт только после разрешения на микрофон — тогда спрашиваем его */
export async function listMicrophones(): Promise<{ devices: MicrophoneInfo[], defaultLabel: string }> {
    let inputs = await enumerateMicrophones()
    if (inputs.length && inputs.every(device => !device.label)) {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
        probe.getTracks().forEach(track => track.stop())
        inputs = await enumerateMicrophones()
    }

    const defaultEntry = inputs.find(device => device.deviceId === MIC_DEFAULT)
    const devices = inputs.filter(device => !ALIAS_DEVICE_IDS.includes(device.deviceId))
    // «По умолчанию — AirPods»: настоящее устройство за записью default совпадает с ним по groupId
    const defaultDevice = devices.find(device => device.groupId === defaultEntry?.groupId)

    return {
        devices:      devices.map(device => ({
            deviceId:  device.deviceId,
            label:     device.label,
            isDefault: device === defaultDevice,
        })),
        defaultLabel: defaultDevice?.label || "",
    }
}

/**
 * deviceId, по которому открывать микрофон. id мог смениться (переподключили USB, сбросили данные Chromium) —
 * тогда ищем по названию, а если устройства нет совсем — берём системный по умолчанию
 */
async function resolveDeviceId(deviceId: string, label: string): Promise<string> {
    if (deviceId === MIC_DEFAULT) return MIC_DEFAULT
    const inputs = await enumerateMicrophones()
    return inputs.find(device => device.deviceId === deviceId)?.deviceId
        || inputs.find(device => label && device.label === label)?.deviceId
        || MIC_DEFAULT
}

export async function openMicrophone(deviceId: string, label: string): Promise<MediaStream> {
    const resolvedId = await resolveDeviceId(deviceId, label)
    return navigator.mediaDevices.getUserMedia({
        audio: { ...RAW_AUDIO, deviceId: { exact: resolvedId } },
    })
}
