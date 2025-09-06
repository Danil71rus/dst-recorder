<template>
    <div
        class="timer-window"
        @mousedown="startDrag"
    >
        <div class="flex-row">
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
            v-if="isRecording"
            icon="player-stop-24"
            @click="stopRecording"
        />

        <dst-button
            v-else
            :variant="ButtonVariant.Danger"
            icon="player-play-24"
            @click="startRecording"
        />

        <dst-button
            :variant="ButtonVariant.OutlineLight"
            icon="settings-24"
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
import { ref, computed, onBeforeUnmount } from "vue"
import { ExposedWinTimer } from "@/window/ipc-handlers/definitions/renderer.ts"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { RecordingStatus, StartRecordingResponse } from "@/deinitions/ffmpeg.ts"
import DstSvg from "@/components/dst-svg.vue"


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

function openMainWin() {
    window.ipcRenderer?.send(ExposedWinTimer.OPEN_MAIN_WIN)
}

function close() {
    window.ipcRenderer?.send(ExposedWinTimer.HIDE)
}

function resetParams() {
    isRecording.value = false
    duration.value = 0
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
    window.ipcRenderer?.send(ExposedWinTimer.MOVE_TIMER_WINDOW, {
        x: e.screenX - dragPosition.x,
        y: e.screenY - dragPosition.y,
    })
}
function stopDrag() {
    dragPosition = null
    window.removeEventListener("mousemove", drag)
    window.removeEventListener("mouseup", stopDrag)
}

// Очистка при размонтировании компонента
onBeforeUnmount(() => {
    if (isRecording.value) stopRecording()
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

.close-icon {
    color: red;
    width: 35px;
    cursor: pointer;
}

@keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}
</style>
