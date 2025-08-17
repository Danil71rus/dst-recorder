<template>
    <div
        class="main-view"
        @mousedown="startDrag"
    >
        <div class="container">
            <dst-combobox
                v-model="selectedDefSize"
                :items="sizes"
                :display-type="ComboboxDisplayType.Right"
                :variant="ComboboxStyle.Secondary"
                placeholder="Качество"
                label="Качество"
            />

            <dst-combobox
                v-model="selectedVideo"
                :items="screensList"
                :display-type="ComboboxDisplayType.Right"
                :variant="ComboboxStyle.Secondary"
                placeholder="Экран"
                label="Выбор экрана"
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
import { ref, toRaw, computed } from 'vue'
import { ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { FfmpegDeviceLists, FfmpegSettings, getDefaultSettings, Size } from "../deinitions/ffmpeg.ts"

// Проверка доступности Electron API
const deviceList = ref<FfmpegDeviceLists>({
    audio: [],
    video: [],
})
const currentState = ref<FfmpegSettings>(getDefaultSettings())

const sizeSettings = ref<{ [key: string]: { w: number, h: number } }>({
    [Size.HD]:    { w: 1280, h: 720 },
    [Size.FulHD]: { w: 1920, h: 1080 },
    [Size.QHD]:   { w: 2560, h: 1440 },
    [Size.UHD]:   { w: 3840, h: 2160 }
})
const sizes = computed((): ComboboxItem[] => {
    return Object.entries(sizeSettings.value)
        .filter(([, val]) => !currentState.value.video?.scaleMax?.width || val.w <= currentState.value.video?.scaleMax.width)
        .map(([key]) => ({
            id:       key,
            title:    key,
        }))
})
const selectedDefSize = computed({
    get() {
        return `${currentState.value.defSize}`
    },
    set(newSize: Size) {
        currentState.value.defSize = newSize
        setSize(newSize)
        console.log(toRaw(currentState.value))
    }
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
            console.log(toRaw(currentState.value))
        }
    }
})
const screensList = computed((): ComboboxItem[] => {
    return deviceList.value.video
        .filter(item => item.isScreen)
        .map(item => ({
            id:       `${item.index}`,
            title:    `${item.label}`,
            subtitle: `${item.size?.width || ""} × ${item.size?.height || ""}`
        }))
})

const selectedAudio = computed({
    get() {
        return `${currentState.value.audio?.index}`
    },
    set(newIndex: string) {
        const newAudio = deviceList.value.audio.find(item => item.index === Number(newIndex))
        if (newAudio?.name) currentState.value.audio = newAudio
    }
})
const audioList = computed((): ComboboxItem[] => {
    return deviceList.value.audio.map(item => ({
        id:    `${item.index}`,
        title: `${item.name} `,
    }))
})

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => {
    const settings = await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS) as FfmpegSettings
    if (settings) currentState.value = settings

    const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
    if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices

    console.log(" deviceList.value: ",  deviceList.value)
    console.log(" currentState.value: ",  currentState.value)
})

function setSize(newSize?: Size) {
    const newVideo = deviceList.value.video.find(item => item.index === Number(currentState.value.video?.index))
    const resultSize = newSize || Size.FulHD
    const selSizeSettings = sizeSettings.value?.[resultSize]

    if (newVideo?.name) {
        currentState.value.scale.w = Math.min(selSizeSettings.w, newVideo.scaleMax?.width || 0)
        currentState.value.scale.h = Math.min(selSizeSettings.h, newVideo.scaleMax?.height || 0)

        currentState.value.crop.w = currentState.value.scale.w
        currentState.value.crop.h = currentState.value.scale.h

        currentState.value.defSize = resultSize
    }
}

/** Перемещение окна */
let dragPosition: { x: number; y: number } | null = null;
function startDrag(e: MouseEvent) {
    dragPosition = { x: e.clientX, y: e.clientY };
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', stopDrag);
}
function drag(e: MouseEvent) {
    if (!dragPosition) return;
    window.ipcRenderer?.send(ExposedWinMain.MOVE_MAIN_WINDOW, {
        x: e.screenX - dragPosition.x,
        y: e.screenY - dragPosition.y
    });
}
function stopDrag() {
    dragPosition = null;
    window.removeEventListener('mousemove', drag);
    window.removeEventListener('mouseup', stopDrag);
}

async function onSave() {
    await window.ipcRenderer?.invoke(ExposedWinMain.SAVE_SETTINGS, toRaw(currentState.value))
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
