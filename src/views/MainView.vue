<template>
    <div
        class="main-view"
        @mousedown="startDrag"
    >
        <div class="container">
            <dst-combobox
                v-model="selectedVideo"
                :items="screensList"
                :display-type="ComboboxDisplayType.Right"
                :variant="ComboboxStyle.Secondary"
                placeholder="Экран"
                label="Выбор экрана"
            />

            <dst-combobox
                v-model="selectedDefSize"
                :items="sizesCombobox"
                :display-type="ComboboxDisplayType.Right"
                :variant="ComboboxStyle.Secondary"
                placeholder="Качество"
                label="Качество"
            />

            <dst-combobox
                v-model="selectedAudio"
                :items="audioList"
                :display-type="ComboboxDisplayType.Right"
                :variant="ComboboxStyle.Secondary"
                placeholder="Звук"
                label="Выбор звука"
            />

            <hr>

            <div class="flex-row">
                <dst-button
                    value="Сохранить"
                    :variant="ButtonVariant.Success"
                    @click="onSave"
                />

                <dst-button
                    class="ml-x4"
                    value="Закрыть"
                    :variant="ButtonVariant.OutlineSecondary"
                    @click="onClose"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import _ from "lodash"
import { ExposedFfmpeg, ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { FfmpegDeviceLists, FfmpegSettings, getDefaultSettings, Size } from "../deinitions/ffmpeg.ts"
import { getResultScale } from "@/window/utils/main.ts"

// Проверка доступности Electron API
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
    return sizes.value
        .map(item => ({
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

const selectedAudio = computed({
    get() {
        return `${currentState.value.audio?.index}`
    },
    set(newIndex: string) {
        const newAudio = deviceList.value.audio.find(item => item.index === Number(newIndex))
        if (newAudio?.name) currentState.value.audio = newAudio
    },
})
const audioList = computed((): ComboboxItem[] => {
    return deviceList.value.audio.map(item => ({
        id:    `${item.index}`,
        title: `${item.name} `,
    }))
})

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateSettings())
window.ipcRenderer?.on(
    ExposedFfmpeg.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateSettings({ newSettings }),
)

async function updateSettings({ newSettings }: { newSettings?: unknown } = {}) {
    const settings = (newSettings || await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS)) as FfmpegSettings
    if (settings) currentState.value = settings

    const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
    if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices

    console.log(" deviceList.value: ", deviceList.value)
    console.log(" currentState.value: ", currentState.value)
}

function setSize(size = "") {
    const newSize = Number(size) || Size.Max
    const newVideo = currentState.value.video
    if (newVideo?.name) {
        currentState.value = {
            ...currentState.value,
            ...getResultScale(newVideo, newSize),
            defSize: newSize,
        }
    }
}


/** Перемещение окна */
let dragPosition: { x: number, y: number } | null = null
function startDrag(e: MouseEvent) {
    dragPosition = { x: e.clientX, y: e.clientY }
    window.addEventListener("mousemove", drag)
    window.addEventListener("mouseup", stopDrag)
}
function drag(e: MouseEvent) {
    if (!dragPosition) return
    window.ipcRenderer?.send(ExposedWinMain.MOVE_MAIN_WINDOW, {
        x: e.screenX - dragPosition.x,
        y: e.screenY - dragPosition.y,
    })
}
function stopDrag() {
    dragPosition = null
    window.removeEventListener("mousemove", drag)
    window.removeEventListener("mouseup", stopDrag)
}

async function onSave() {
    await window.ipcRenderer?.invoke(ExposedWinMain.SAVE_SETTINGS, _.cloneDeep(currentState.value))
}
function onClose() {
    window.ipcRenderer?.send(ExposedWinMain.HIDE)
}
</script>

<style lang="scss" scoped>
.main-view {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
    background: rgba(1, 12, 12, 0.48);
    padding: 25px;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.16);
    margin: 8px;
    color: #ffffff;

    &>*:not(:first-child) {
        margin-top: 24px;
    }
}
</style>
