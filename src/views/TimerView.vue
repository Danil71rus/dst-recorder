<template>
    <div
        class="timer-window flex-column"
        @mousedown="drag.startDrag"
    >
        <div class="timer">
            <div class="flex-row flex-cross-axis-center">
                <dst-svg
                    class="close-icon"
                    name="close-24"
                    @click="close"
                />

                <div class="line" />
            </div>

            <!-- Основной таймер -->
            <div class="timer-display">
                <div
                    v-if="isRecording"
                    :class="{ 'recording-dot': true, 'animate-active': true }"
                />

                <span class="time">{{ formattedTime }}</span>
            </div>

            <div class="line" />

            <dst-button
                :variant="isShowSettings ? ButtonVariant.Light : ButtonVariant.OutlineLight"
                :icon="isShowSettings ? 'angle-up-24' : 'settings-24'"
                @click="toggleSettings"
            />

            <dst-button
                class="open-folder"
                value="Открыть"
                :variant="ButtonVariant.OutlineSecondary"
                @click="openSaveFolder"
            />

            <div class="right">
                <dst-button
                    v-if="isRecording"
                    icon="player-stop-24"
                    @click="stopRecording"
                />

                <dst-button
                    v-else
                    icon="player-play-24"
                    :variant="ButtonVariant.Danger"
                    @click="startRecording"
                />
            </div>
        </div>

        <div
            v-if="isShowSettings"
            class="settings"
        >
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
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import { ExposedFfmpeg, ExposedWinMain, ExposedWinTimer } from "@/window/ipc-handlers/definitions/renderer.ts"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import {
    FfmpegDeviceLists,
    FfmpegSettings,
    getDefaultSettings,
    RecordingStatus,
    Size,
    StartRecordingResponse,
} from "@/deinitions/ffmpeg.ts"
import DstSvg from "@/components/dst-svg.vue"
import { ComboboxDisplayType, type ComboboxItem, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox.ts"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import { getResultScale } from "@/window/utils/main.ts"
import _ from "lodash"
import { dragPosition } from "@/composables/drag-position.ts"

const isShowSettings = ref(false)

// Реактивные переменные состояния
const isRecording = ref(false)
const savePathFile = ref("")
const duration = ref(0)

// Получаем значения из стора
const formattedTime = computed(() => {
    const mins = `${Math.floor(duration.value / 60)}`
    const sec = `${duration.value % 60}`
    return `${mins.padStart(2, "0")}:${sec.padStart(2, "0")}`
})

// Функция для начала записи
async function startRecording() {
    resetParams()
    isRecording.value = true

    const result = await window.ipcRenderer?.invoke<StartRecordingResponse>(ExposedWinTimer.START_FFMPEG_RECORDING)
    if (result?.error) {
        console.error(result.error || "Failed to start recording")
        return
    }
    savePathFile.value = result?.outputPathAndFileName || ""
}

// Обновление состояния записи в трее
window.ipcRenderer?.on(ExposedWinTimer.UPDATED_STATE_TIMER, (_event, status) => {
    const newVal = status as RecordingStatus
    if (newVal?.isRecording) {
        isRecording.value = true
        duration.value = newVal?.duration
    } else {
        resetParams()
    }
})

// Функция для остановки записи
async function stopRecording() {
    await window.ipcRenderer?.invoke(ExposedWinTimer.STOP_FFMPEG_RECORDING)
}

function openSaveFolder() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_SAVE_FOLDER, savePathFile.value)
}

function toggleSettings() {
    isShowSettings.value = !isShowSettings.value
    window.ipcRenderer?.send(ExposedWinTimer.SHOW_SETTINGS, isShowSettings.value)
}

function close() {
    window.ipcRenderer?.send(ExposedWinTimer.HIDE)
}

function resetParams() {
    isRecording.value = false
    duration.value = 0
}


// Проверка доступности Electron API
const deviceList = ref<FfmpegDeviceLists>({
    audio: [],
    video: [],
})
const currentState = ref<FfmpegSettings>(getDefaultSettings())

const drag = dragPosition(ExposedWinTimer.MOVE_TIMER_WINDOW)

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
        save()
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
            save()
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
        if (newAudio?.name) {
            currentState.value.audio = newAudio
            save()
        }
    },
})
const audioList = computed((): ComboboxItem[] => {
    return deviceList.value.audio.map(item => ({
        id:    `${item.index}`,
        title: `${item.name} `,
    }))
})

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
async function updateSettings({ newSettings }: { newSettings?: unknown } = {}) {
    const settings = (newSettings || await window.ipcRenderer?.invoke(ExposedWinMain.GET_SETTINGS)) as FfmpegSettings
    if (settings) currentState.value = settings

    const devices = await window.ipcRenderer?.invoke(ExposedWinMain.GET_DEVICES) as FfmpegDeviceLists
    if (devices?.video?.length || devices?.audio?.length) deviceList.value = devices

    console.log(" deviceList.value: ", deviceList.value)
    console.log(" currentState.value: ", currentState.value)
}
async function save() {
    await window.ipcRenderer?.invoke(ExposedWinTimer.SAVE_SETTINGS, _.cloneDeep(currentState.value))
}

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateSettings())
window.ipcRenderer?.on(
    ExposedFfmpeg.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateSettings({ newSettings }),
)

// Очистка при размонтировании компонента
onBeforeUnmount(() => {
    if (isRecording.value) stopRecording()
})
</script>

<style scoped>
.timer-window {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);

    .timer {
        width: 100%;
        padding: 8px;
        display: flex;
        align-items: center;

        & > *:not(:first-child) {
            margin-left: 16px;
        }

        .line {
            display: block;
            height: 24px;
            color: white;
            margin: 0 8px;
            border-right: 1px solid gray;
        }

        .timer-display {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-right: 36px;

            .recording-dot {
                width: 10px;
                height: 10px;
                background: #ff0000;
                border-radius: 50%;

                &.animate-active {
                    animation: pulse 1s infinite;
                }
            }

            .time {
                color: white;
                font-size: 25px;
                font-weight: bold;
                font-family: 'Courier New', monospace;
            }
        }

        .close-icon {
            color: red;
            width: 28px;
            cursor: pointer;
            transition: all 200ms ease-in-out;

            &:hover {
                width: 35px;
            }
        }

        .right {
            display: flex;
            margin-left: auto;

            & > *:not(:first-child) {
                margin-left: 16px;
            }
        }

        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
            100% { opacity: 1; transform: scale(1); }
        }
    }

    overflow: hidden;

    .settings {
        width: 100%;
        padding: 8px;
        border-top: solid white 1px;
        color: white;
        & > * {
            margin-top: 16px;
        }
    }
}
</style>
