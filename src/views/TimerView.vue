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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ExposedWinTimer } from "@/ipc-handlers/definitions/renderer.ts"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"


// Реактивные переменные состояния
const isRecording = ref(false)
const isCompleted = ref(false)
const isSaving = ref(false)
const savePathFile = ref('')

const recordingTime = ref(0)
const recordingTimer = ref<number | null>(null)

// Проверка доступности Electron API
const isIpcRenderer = ref(false)

// Получаем значения из стора
const formattedTime = computed(() => {
    const sec = recordingTime.value
    const mins = `${Math.floor(sec / 60)}`
    const secs = `${sec % 60}`
    return `${mins.padStart(2, '0')}:${secs.padStart(2, '0')}`
})

onMounted(async () => {
    isIpcRenderer.value = !!window.ipcRenderer
})

// Функция для начала записи
async function startRecording() {
    resetParams()
    isRecording.value = true

    // Проверка доступности API
    if (!isIpcRenderer.value) {
        console.error('Electron API is not available in this context')
        return
    }

    // Запускаем запись через FFmpeg с выбранным экраном
    const result = await window.ipcRenderer?.invoke(ExposedWinTimer.START_FFMPEG_RECORDING) as { outputPathAndFileName?: string; error?: string }
    if (result?.error) {
        console.error(result.error || 'Failed to start recording')
        return
    }

    savePathFile.value = result?.outputPathAndFileName || ""
    console.log('FFmpeg recording started:', result?.outputPathAndFileName)

    // Запускаем таймер отсчета времени
    recordingTimer.value = window.setInterval(() => {
        recordingTime.value += 1
    }, 1000)
}

// Функция для остановки записи
async function stopRecording() {
    isSaving.value = true
    console.log('Stopping FFmpeg recording...')
    // Останавливаем запись через FFmpeg
    await window.ipcRenderer?.invoke(ExposedWinTimer.STOP_FFMPEG_RECORDING)
    resetParams()
}

function openSaveFolder() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_SAVE_FOLDER, savePathFile.value)
}

function openMainWin() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_MAIN_WIN)
}

function resetParams() {
    // Сброс состояния
    isRecording.value = false
    isCompleted.value = false
    isSaving.value = false
    recordingTime.value = 0
    if (recordingTimer.value) {
        clearInterval(recordingTimer.value)
        recordingTimer.value = null
    }
}

function close() {
    window.ipcRenderer?.send(ExposedWinTimer.CLOSE_ALL_WINDOW)
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
    if (isRecording.value) {
        stopRecording()
    }

    if (recordingTimer.value) {
        clearInterval(recordingTimer.value)
    }
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
