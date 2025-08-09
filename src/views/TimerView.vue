<template>
    <div
        class="timer-window"
        @mousedown="startDrag"
    >
        <div class="flex-row">
            <b-button variant="link" @click="close">❌</b-button>
            <div class="line"/>
        </div>

        <!-- Основной таймер -->
        <div class="timer-display">
            <div :class="{ 'recording-dot': true, 'animate-active': isRecording }" />
            <span class="time">{{ formattedTime }}</span>
        </div>

        <div class="line"/>

        <dst-button
            v-if="isRecording"
            value="Stop"
            :disabled="isSaving"
            @click="stopRecording"
        />
        <dst-button
            v-else
            :variant="ButtonVariant.Danger"
            value="►"
            :disabled="isSaving"
            @click="startRecording"
        />

        <dst-button
            :variant="ButtonVariant.OutlineInfo"
            value="🛠"
            @click="openMainWin"
        />

        <dst-button
            :variant="ButtonVariant.OutlineSecondary"
            value="Открыть"
            @click="openSaveFolder"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { ExposedWinTimer } from "@/ipc-handlers/definitions/renderer.ts"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { RecordingStatus, StartRecordingResponse } from "@/deinitions/ffmpeg.ts"


// Реактивные переменные состояния
const isRecording = ref(false)
const isCompleted = ref(false)
const isSaving = ref(false)
const savePathFile = ref('')

const duration = ref(0)
const recordingTimer = ref<number | null>(null)

// Получаем значения из стора
const formattedTime = computed(() => {
    const mins = `${Math.floor(duration.value / 60)}`
    const sec = `${duration.value % 60}`
    return `${mins.padStart(2, '0')}:${sec.padStart(2, '0')}`
})

// Функция для начала записи
async function startRecording() {
    resetParams()
    isRecording.value = true

    const result = await window.ipcRenderer?.invoke<StartRecordingResponse>(ExposedWinTimer.START_FFMPEG_RECORDING)
    if (result?.error) {
        console.error(result.error || 'Failed to start recording')
        return
    }
    savePathFile.value = result?.outputPathAndFileName || ""
    recordingTimer.value = window.setInterval(async () => {
        const resStatus = await window.ipcRenderer?.invoke<RecordingStatus>(ExposedWinTimer.GET_RECORDING_STATUS)
        if (resStatus?.isRecording) {
            isRecording.value = true
            duration.value = resStatus.duration
        } else {
             resetParams()
        }
    }, 1000)
}

// Функция для остановки записи
async function stopRecording() {
    isSaving.value = true
    await window.ipcRenderer?.invoke(ExposedWinTimer.STOP_FFMPEG_RECORDING)
}

function openSaveFolder() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_SAVE_FOLDER, savePathFile.value)
}

function openMainWin() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_MAIN_WIN)
}

function close() {
    window.ipcRenderer?.send(ExposedWinTimer.HIDE)
}

function resetParams() {
    isRecording.value = false
    isCompleted.value = false
    isSaving.value = false
    duration.value = 0
    if (recordingTimer.value) {
        clearInterval(recordingTimer.value)
        recordingTimer.value = null
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
    window.ipcRenderer?.send(ExposedWinTimer.MOVE_TIMER_WINDOW, {
        x: e.screenX - dragPosition.x,
        y: e.screenY - dragPosition.y
    });
}
function stopDrag() {
    dragPosition = null;
    window.removeEventListener('mousemove', drag);
    window.removeEventListener('mouseup', stopDrag);
}

// Очистка при размонтировании компонента
onBeforeUnmount(() => {
    if (isRecording.value) stopRecording()
    if (recordingTimer.value) clearInterval(recordingTimer.value)
})
</script>

<style scoped>
.timer-window {
    width: 100%;
    background: rgba(0, 0, 0, 0.9);
    padding: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
}

.flex-row {
    display: flex;
    align-items: center;
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

@keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}
</style>
