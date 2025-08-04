<template>
    <div class="main-view">
        <div class="container">

            <div class="status">
                <div v-if="isRecording" class="recording-indicator">
                    <div class="dot"></div>
                    <span>Recording ({{ recordingTime }}s)</span>
                </div>
                <div v-else-if="isCompleted" class="completed-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>Saved to: {{ savePath }}</span>
                </div>
            </div>

            <div v-show="!isRecording && availableScreens.length > 0" class="screen-selector">
                <label>Select screen to record:</label>
                <select v-model="selectedScreen" class="form-select">
                    <option v-for="screen in screenOptions" :key="screen.value" :value="screen.value">
                        {{ screen.text }}
                    </option>
                </select>
                <small class="text-muted">{{ availableScreens.length }} screen(s) detected</small>
            </div>

            <div class="controls">
                <b-button
                    v-if="isRecording"
                    size="lg"
                    :disabled="isSaving"
                    @click="stopRecording"
                >
                    Stop
                </b-button>

                <b-button
                    v-else
                    size="lg"
                    variant="primary"
                    :disabled="isSaving"
                    @click="startRecording"
                >Start</b-button>

                <b-button
                    v-if="isCompleted"
                    variant="outline-secondary"
                    pill
                    @click="openSaveFolder"
                >
                    Open
                </b-button>
            </div>
        </div>
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
    background: white;
    padding: 3rem;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    max-width: 500px;
    width: 100%;
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

.status {
    margin-bottom: 2rem;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.recording-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #e53e3e;
    font-weight: 600;
}

.recording-indicator .dot {
    width: 12px;
    height: 12px;
    background: #e53e3e;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.5;
        transform: scale(1.1);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}

.completed-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #48bb78;
    font-weight: 600;
}

.completed-indicator svg {
    width: 24px;
    height: 24px;
}

.error-message {
    color: #e53e3e;
    font-size: 0.875rem;
}

.screen-selector {
    margin-bottom: 2rem;
    text-align: left;
}

.screen-selector label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #4a5568;
}

.screen-selector select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 0.375rem;
    font-size: 1rem;
    background-color: white;
    cursor: pointer;
}

.screen-selector select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.screen-selector small {
    display: block;
    margin-top: 0.25rem;
    color: #718096;
}

.controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}

.controls button {
    min-width: 150px;
}
</style>
