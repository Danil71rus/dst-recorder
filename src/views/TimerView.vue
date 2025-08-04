<template>
    <div
        class="timer-window"
        @mousedown="startDrag"
    >
        <!-- Основной таймер -->
        <div class="timer-display">
            <div class="recording-dot"></div>
            <span class="time">{{ formattedTime }}</span>
        </div>

        <b-button
            v-if="isRecording"
            :disabled="isSaving"
            @click="stopRecording"
        >Stop</b-button>
        <b-button
            v-else
            variant="danger"
            :disabled="isSaving"
            @click="startRecording"
        >►</b-button>

        <b-button
            variant="outline-secondary"
            @click="openSaveFolder"
        >Открыть</b-button>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ExposedRecording } from "../../electron/ipc-handlers/definitions/renderer.ts"
import { sleep } from "@/utils/utils.ts"

// Реактивные переменные состояния
const isRecording = ref(false)
const isCompleted = ref(false)
const isSaving = ref(false)
const savePath = ref('')

const recordingTime = ref(0)
const recordingTimer = ref<number | null>(null)

// Проверка доступности Electron API
const isIpcRenderer = ref(false)

// Переменные для выбора экрана - явно указываем тип
interface Screen {
    id:        number
    name:      string
    isPrimary: boolean
    width:     number
    height:    number
}

const availableScreens = ref<Screen[]>([])
const selectedScreen = ref(0)

const screenOptions = computed(() => {
    return availableScreens.value.map(screen => ({
        value: screen.id,
        text: `${screen.name} (${screen.width}x${screen.height})`
    }))
})

// Получаем значения из стора
const formattedTime = computed(() => {
    const sec = recordingTime.value
    const mins = `${Math.floor(sec / 60)}`
    const secs = `${sec % 60}`
    return `${mins.padStart(2, '0')}:${secs.padStart(2, '0')}`
})

onMounted(async () => {
    isIpcRenderer.value = !!window.ipcRenderer

    // Получаем список доступных экранов
    if (isIpcRenderer.value) {
        // Добавляем небольшую задержку, чтобы IPC обработчики успели зарегистрироваться
        await sleep(1)
        // Получаем путь сохранения
        savePath.value = await window.ipcRenderer.invoke(ExposedRecording.GET_SAVE_PATH)
        const screens = await window.ipcRenderer.invoke(ExposedRecording.GET_AVAILABLE_SCREENS)
        if (screens && Array.isArray(screens)) {
            // Принудительно обновляем массив
            availableScreens.value = [...screens]
            // Ждем следующий тик Vue для обновления DOM
            await nextTick()
            console.log('After nextTick - Screen options:', screenOptions.value)
        } else {
            console.error('Invalid screens response:', screens)
            availableScreens.value = []
        }
    } else {
        console.warn('IPC Renderer not available')
    }
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

    // Получаем путь сохранения
    savePath.value = await window.ipcRenderer.invoke(ExposedRecording.GET_SAVE_PATH)
    console.log('Save path:', savePath.value)

    // Запускаем запись через FFmpeg с выбранным экраном
    const result = await window.ipcRenderer.invoke(ExposedRecording.START_FFMPEG_RECORDING, selectedScreen.value)
    if (result?.error) {
        console.error(result.error || 'Failed to start recording')
        return
    }

    console.log('FFmpeg recording started:', result.outputPath)
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
    const result = await window.ipcRenderer.invoke(ExposedRecording.STOP_FFMPEG_RECORDING)
    if (!result?.error) {
        console.log('Recording saved successfully:', result.outputPath)
        console.log('Duration:', result.duration, 'seconds')
        isCompleted.value = true
    } else {
        throw new Error(result.error || 'Failed to stop recording')
    }
    resetParams()
}

// Функция для открытия папки с записью
function openSaveFolder() {
    if (isIpcRenderer.value) {
        window.ipcRenderer.send(ExposedRecording.OPEN_SAVE_FOLDER, savePath.value)
    }
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

/** Перемещение окна */
let dragPosition: { x: number; y: number } | null = null;
function startDrag(e: MouseEvent) {
    dragPosition = { x: e.clientX, y: e.clientY };
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', stopDrag);
}
function drag(e: MouseEvent) {
    if (!dragPosition) return;
    window.ipcRenderer.send(ExposedRecording.MOVE_TIMER_WINDOW, {
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
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    padding: 16px;
    color: white;

    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
}

.timer-display {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
}

.recording-dot {
    width: 10px;
    height: 10px;
    background: #ff0000;
    border-radius: 50%;
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}

.time {
    font-size: 20px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
}
</style>
