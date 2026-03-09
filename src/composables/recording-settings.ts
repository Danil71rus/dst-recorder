import { computed, ref } from "vue"
import _ from "lodash"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import {
    DEFAULT_SIZE,
    FfmpegDeviceLists,
    FfmpegSettings,
    getDefaultSettings,
    normalizeSize,
    SIZE_PRESETS,
    sizeTitleMap,
} from "@/deinitions/ffmpeg.ts"
import { ExposedWinMain, ExposedWinTimer } from "@/window/ipc-handlers/definitions/renderer"
import { getResultScale } from "@/window/utils/main.ts"

export enum IpcScope {
    Main = "main",
    Timer = "timer",
}

interface UseRecordingSettingsOptions {
    autoSaveOnChange?: boolean
    ipcScope?:         IpcScope.Main | IpcScope.Timer
}

export function useRecordingSettings(options: UseRecordingSettingsOptions = {}) {
    const { autoSaveOnChange = false, ipcScope = IpcScope.Main } = options
    const channels = {
        save: ipcScope === IpcScope.Timer
            ? ExposedWinTimer.SAVE_SETTINGS
            : ExposedWinMain.SAVE_SETTINGS,
    }

    const deviceList = ref<FfmpegDeviceLists>({
        audio: [],
        video: [],
    })
    const currentState = ref<FfmpegSettings>(getDefaultSettings())
    const sizes = computed(() => {
        // Достаем максимальную физическую высоту текущего монитора (если экрана нет, ставим с запасом)
        const maxH = currentState.value.video?.scaleMax?.height || 9999

        return SIZE_PRESETS
            // Оставляем только те пресеты качества, высота которых не превышает матрицу монитора
            .filter(size => normalizeSize(Number(size)) <= maxH)
            .map(size => ({
                id:    size,
                title: sizeTitleMap[size],
            }))
    })

    const sizesCombobox = computed((): ComboboxItem[] => {
        return sizes.value.map(item => ({
            id:    item.id,
            title: item.title,
        }))
    })

    const selectedDefSize = computed({
        get() {
            return `${currentState.value.defSize}`
        },
        set(newSize: string) {
            setSize(newSize)
            tryAutoSave()
        },
    })


    const selectedVideo = computed({
        get() {
            return `${currentState.value.video?.index}`
        },
        set(newIndex: string) {
            const newVideo = deviceList.value.video.find(item => item.index === Number(newIndex))

            if (newVideo?.name) {
                currentState.value.video = newVideo
                setSize()
                tryAutoSave()
            }
        },
    })

    const selectedAudio = computed({
        get() {
            return `${currentState.value.audio?.index}`
        },
        set(newIndex: string) {
            const newAudio = deviceList.value.audio.find(item => item.index === Number(newIndex))

            if (newAudio?.name) {
                currentState.value.audio = newAudio
                tryAutoSave()
            }
        },
    })

    const screensList = computed((): ComboboxItem[] => {
        return deviceList.value.video
            .filter(item => item.isScreen)
            .map(item => {
                const { scale } = getResultScale(item, currentState.value.defSize)

                return {
                    id:       `${item.index}`,
                    title:    `${item.label}`,
                    subtitle: `${scale.w} × ${scale.h}`,
                }
            })
    })


    const audioList = computed((): ComboboxItem[] => {
        return deviceList.value.audio.map(item => ({
            id:    `${item.index}`,
            title: `${item.name} `,
        }))
    })

    const selectedDefSizeName = computed(() => {
        return sizesCombobox.value.find(item => item.id === Number(selectedDefSize.value))?.title
            || sizeTitleMap[DEFAULT_SIZE]
    })

    const selectedVideoName = computed(() => {
        return deviceList.value.video.find(item => item.index === Number(selectedVideo.value))?.label || ""
    })

    const selectedAudioName = computed(() => {
        return deviceList.value.audio.find(item => item.index === Number(selectedAudio.value))?.name || ""
    })

    const showBorder = computed({
        get: () => currentState.value.showBorder ?? false,
        set: (value: boolean) => {
            currentState.value.showBorder = value
            tryAutoSave()
        },
    })

    async function updateSettings({ newSettings }: { newSettings?: unknown } = {}) {
        const settings = (newSettings
            || await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS)) as FfmpegSettings
        if (settings) {
            const defSize = normalizeSize(Number(settings.defSize))
            currentState.value = { ...settings, defSize }
        }

        const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
        if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices

        console.log(" deviceList.value: ", deviceList.value)
        console.log(" currentState.value: ", currentState.value)
    }

    function setSize(size = "") {
        let newSize = normalizeSize(Number(size) || currentState.value.defSize)
        const newVideo = currentState.value.video

        // Если физическая высота монитора меньше выбранного качества - понижаем качество
        const maxH = newVideo?.scaleMax?.height || 9999
        if (newSize > maxH) {
            // Находим максимально доступный пресет для текущего экрана (например, переключит с 4K на 1080p)
            const availableSizes = SIZE_PRESETS.filter(s => normalizeSize(Number(s)) <= maxH)
            newSize = availableSizes.length > 0 ? normalizeSize(Number(availableSizes[0])) : normalizeSize(DEFAULT_SIZE)
        }

        if (newVideo?.name) {
            currentState.value = {
                ...currentState.value,
                ...getResultScale(newVideo, newSize),
                defSize: newSize,
            }
        }
    }

    async function save() {
        await window.ipcRenderer?.invoke(channels.save, _.cloneDeep(currentState.value))
    }

    async function tryAutoSave() {
        if (autoSaveOnChange) await save()
    }

    return {
        deviceList,
        currentState,
        sizes,
        sizesCombobox,
        selectedDefSize,
        selectedVideo,
        selectedAudio,
        screensList,
        audioList,
        selectedDefSizeName,
        selectedVideoName,
        selectedAudioName,
        showBorder,
        setSize,
        save,
        updateSettings,
    }
}
