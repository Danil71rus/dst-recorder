<template>
    <div
        class="timer-window flex-column"
        @mousedown="drag.startDrag"
    >
        <div class="timer">
            <div class="close-icon-wrap">
                <dst-svg
                    class="close-icon"
                    name="close-24"
                    @click="close"
                />
            </div>

            <div class="line" />

            <!-- Основной таймер -->
            <div class="timer-display">
                <div
                    v-if="isRecording"
                    :class="{ 'recording-dot': true, 'animate-active': true }"
                />

                <span class="time">{{ formattedTime }}</span>
            </div>

            <div class="line" />

            <div class="short-settings flex-column">
                <div class="display">
                    {{ `${selectedVideoName} (${selectedDefSizeName})` }}
                </div>

                <div class="audio">
                    {{ selectedAudioName }}
                </div>
            </div>

            <div class="line" />

            <dst-button
                v-if="!isRecording"
                :variant="isShowSettings ? ButtonVariant.Light : ButtonVariant.OutlineLight"
                :icon="isShowSettings ? 'angle-up-24' : 'settings-24'"
                @click="toggleSettings"
            />

            <dst-button
                class="open-folder ml-x4"
                value="Открыть"
                :variant="ButtonVariant.OutlineSecondary"
                @click="openSaveFolder"
            />

            <div class="right">
                <template v-if="isRecording">
                    <dst-button
                        v-if="isPaused"
                        icon="player-play-24"
                        :variant="ButtonVariant.Success"
                        @click="resumeRecording"
                    />

                    <dst-button
                        v-else
                        icon="player-pause-24"
                        :variant="ButtonVariant.OutlineLight"
                        @click="pauseRecording"
                    />

                    <dst-button
                        icon="player-stop-24"
                        @click="stopRecording"
                    />
                </template>

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
                v-if="!isAriaActive"
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

            <dst-switch
                v-model="showBorder"
                label="Подсвечивать рамкой экран при записи"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import {
    ExposedFfmpeg,
    ExposedWinMain,
    ExposedWinSelectAria,
    ExposedWinTimer,
} from "@/window/ipc-handlers/definitions/renderer.ts"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import {
    RecordingStatus,
    StartRecordingResponse,
} from "@/deinitions/ffmpeg.ts"
import DstSvg from "@/components/dst-svg.vue"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox.ts"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstSwitch from "@/components/DstSwitch.vue"
import { dragPosition } from "@/composables/drag-position.ts"
import { IpcScope, useRecordingSettings } from "@/composables/recording-settings"

const isShowSettings = ref(false)
const isAriaActive = ref(false)

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
    toggleSettings(false)
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

function toggleSettings(toSettings?: boolean) {
    isShowSettings.value = toSettings ?? !isShowSettings.value
    window.ipcRenderer?.send(ExposedWinTimer.SHOW_SETTINGS, isShowSettings.value)
}

function close() {
    window.ipcRenderer?.send(ExposedWinTimer.HIDE)
}

function resetParams() {
    isRecording.value = false
    isPaused.value = false
    duration.value = 0
}

const {
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
    updateSettings: updateRecordingSettings,
} = useRecordingSettings({
    autoSaveOnChange: true,
    ipcScope:         IpcScope.Timer,
})

const drag = dragPosition(ExposedWinTimer.MOVE_TIMER_WINDOW)

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateRecordingSettings())
window.ipcRenderer?.on(
    ExposedFfmpeg.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateRecordingSettings({ newSettings }),
)
window.ipcRenderer?.on(ExposedWinSelectAria.SET_ARIA_ACTIVE, (_event, isActive) => {
    isAriaActive.value = Boolean(isActive)
})


const isPaused = ref(false)
async function pauseRecording() {
    await window.ipcRenderer?.invoke(ExposedWinTimer.PAUSE_FFMPEG_RECORDING)
}
async function resumeRecording() {
    await window.ipcRenderer?.invoke(ExposedWinTimer.RESUME_FFMPEG_RECORDING)
}
// Обнови обработчик UPDATED_STATE_TIMER:
window.ipcRenderer?.on(ExposedWinTimer.UPDATED_STATE_TIMER, (_event, status) => {
    const newVal = status as RecordingStatus
    if (newVal?.isRecording) {
        isRecording.value = true
        isPaused.value = Boolean(newVal?.isPaused) // <-- Синхронизируем паузу
        duration.value = newVal?.duration
    } else {
        resetParams()
    }
})

// Очистка при размонтировании компонента
onBeforeUnmount(() => {
    if (isRecording.value) stopRecording()
})
</script>

<style lang="scss" scoped>
@import "@/assets/styles/mixins";

.timer-window {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .timer {
        width: 100%;
        padding: 8px;
        display: flex;
        align-items: center;
        flex-shrink: 0;

        .line {
            display: block;
            height: 24px;
            color: white;
            margin: 0 16px;
            border-right: 1px solid gray;
        }

        .timer-display {
            width: 93px;
            display: flex;
            align-items: center;
            gap: 8px;

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
                margin-left: auto;
                color: white;
                font-size: 25px;
                font-weight: bold;
                font-family: 'Courier New', monospace;
            }
        }

        .close-icon-wrap {
            width: 35px;
            display: flex;
            justify-content: center;
            align-items: center;
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

        .short-settings {
            width: 124px;
            color: white;
            font-size: 9px;

            & > * {
                width: inherit;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }
    }

    .settings {
        width: 100%;
        padding: 8px;
        border-top: solid white 1px;
        color: white;
        flex: 1;
        overflow-y: auto;
        max-height: 300px;

        @include custom-scrollbar(
            $width: 6px,
            $track-bg: rgba(255, 255, 255, 0.1),
            $thumb-bg: rgba(255, 255, 255, 0.3),
            $thumb-bg-hover: rgba(255, 255, 255, 0.5),
            $border-radius: 3px
        );

        & > * {
            margin-top: 16px;
        }
    }
}
</style>
