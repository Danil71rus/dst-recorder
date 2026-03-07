import { computed, ref } from "vue"
import _ from "lodash"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import { FfmpegDeviceLists, FfmpegSettings, getDefaultSettings, Size } from "@/deinitions/ffmpeg.ts"
import { ExposedWinMain, ExposedWinTimer } from "@/window/ipc-handlers/definitions/renderer"
import { getResultScale } from "@/window/utils/main.ts"

interface UseRecordingSettingsOptions {
    autoSaveOnChange?: boolean
}

export function useRecordingSettings(options: UseRecordingSettingsOptions = {}) {
    const { autoSaveOnChange = false } = options

    const deviceList = ref<FfmpegDeviceLists>({
        audio: [],
        video: [],
    })
    const currentState = ref<FfmpegSettings>(getDefaultSettings())

    const sizes = computed(() => {
        return Object.keys(Size)
            .map(id => {
                const size = Number(Size[id as keyof typeof Size])
                const maxW = currentState.value.video?.scaleMax?.width || 0
                const maxH = currentState.value.video?.scaleMax?.height || 0

                return {
                    id: size,
                    w:  Math.ceil(maxW / size),
                    h:  Math.ceil(maxH / size),
                }
            })
            .filter(item => item.w > 0)
    })

    const sizesCombobox = computed((): ComboboxItem[] => {
        return sizes.value.map(item => ({
            id:    item.id,
            title: `${item.w} * ${item.h}`,
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
        return sizesCombobox.value.find(item => item.id === Number(selectedDefSize.value))?.title || ""
    })

    const selectedVideoName = computed(() => {
        return deviceList.value.video.find(item => item.index === Number(selectedVideo.value))?.label || ""
    })

    const selectedAudioName = computed(() => {
        return deviceList.value.audio.find(item => item.index === Number(selectedAudio.value))?.name || ""
    })

    async function updateSettings({ newSettings }: { newSettings?: unknown } = {}) {
        const settings = (newSettings || await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS)) as FfmpegSettings
        if (settings) currentState.value = settings

        const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
        if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices

        console.log(" deviceList.value: ", deviceList.value)
        console.log(" currentState.value: ", currentState.value)
    }

    function setSize(size = "") {
        const newSize = Number(size) || currentState.value.defSize
        const newVideo = currentState.value.video

        if (newVideo?.name) {
            currentState.value = {
                ...currentState.value,
                ...getResultScale(newVideo, newSize),
                defSize: newSize,
            }
        }
    }

    async function save() {
        await window.ipcRenderer?.invoke(ExposedWinTimer.SAVE_SETTINGS, _.cloneDeep(currentState.value))
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
        setSize,
        save,
        updateSettings,
    }
}
