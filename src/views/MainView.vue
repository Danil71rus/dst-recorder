<template>
    <div class="main-view">
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
                    :variant="ButtonVariant.Success"
                    value="Сохранить"
                    @click="onSave"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, toRaw, computed } from 'vue'
import { ExposedWinMain } from "../../electron/ipc-handlers/definitions/renderer"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { FfmpegDeviceLists, FfmpegSettings, getDefaultSettings } from "../../electron/difenition/ffmpeg.ts"
import { sleep } from "@/utils/utils.ts"


// Проверка доступности Electron API
const deviceList = ref<FfmpegDeviceLists>({
    audio: [],
    video: [],
})
const currentState = ref<FfmpegSettings>(getDefaultSettings())

const selectedVideo = computed({
    get() {
        return `${currentState.value.video?.index}`
    },
    set(newIndex: string) {
        const newVideo = deviceList.value.video.find(item => item.index === Number(newIndex))
        if (newVideo?.name) currentState.value.video = newVideo
    }
})
const screensList = computed((): ComboboxItem[] => {
    return deviceList.value.video.map(item => ({
        id:    `${item.index}`,
        title: `${item.name} `,
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

// window.ipcRenderer?.on(ExposedWinMain.GGG, async () => {
//     const settings = await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS) as FfmpegSettings
//     if (settings) currentState.value = settings
//
//     const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
//     if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices
// })

onMounted(async () => {
    console.log("onMounted")
    // Получаем список доступных экранов

    // Добавляем небольшую задержку, чтобы IPC обработчики успели зарегистрироваться
    await sleep(2000)

    const settings = await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS) as FfmpegSettings
    if (settings) currentState.value = settings

    const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
    if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices
})

async function onSave() {
    await window.ipcRenderer?.invoke(ExposedWinMain.SAVE_SETTINGS, toRaw(currentState.value))
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
    text-align: center;
    background: rgba(1, 12, 12, 0.48);
    padding: 3rem;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.16);
    max-width: 500px;
    width: 100%;
    color: #ffffff;

    &>*:not(:first-child) {
        margin-top: 24px;
    }
}

h1 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
    color: #1a202c;
}

p {
    font-size: 1.125rem;
    color: #718096;
    margin-bottom: 2rem;
}
.flex-row {
    display: flex;
    justify-content: flex-start;
}
</style>
