<template>
    <div
        ref="timerRef"
        class="timer-window"
        @mousedown="startDrag"
    >
        <template v-if="isFull">
            <div class="flex-row">
                <b-button variant="link" @click="close">></b-button>
                <div class="line"/>
            </div>

            <!-- Основной таймер -->
            <div class="timer-display">
                <div :class="{ 'recording-dot': true, 'animate-active': isRecording }" />
                <span class="time">{{ formattedTime }}</span>
            </div>

            <div class="line"/>

            <dst-combobox
                v-model="selectedScreen"
                :items="screensList"
                placeholder="Экран"
            />

            <dst-button
                v-if="isRecording"
                value="Stop"
                :disabled="isSaving"
                @click="stopRecording"
            />
            <dst-button
                v-else
                variant="danger"
                value="►"
                :disabled="isSaving"
                @click="startRecording"
            />

            <dst-button
                variant="outline-secondary"
                value="Открыть"
                @click="openSaveFolder"
            />
        </template>

        <dst-button
            v-else
            variant="link"
            value="<"
            @click="show"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { ExposedRecording } from "../../electron/ipc-handlers/definitions/renderer.ts"
import { sleep } from "@/utils/utils.ts"
import DstCombobox, { ComboboxItem } from "@/components/DstCombobox.vue"
import DstButton from "@/components/DstButton.vue"

const isFull = ref(true)
const timerRef = useTemplateRef("timerRef")
const fullW = ref(0)

// Реактивные переменные состояния
const isRecording = ref(false)
const isCompleted = ref(false)
const isSaving = ref(false)
const savePathFile = ref('')

const recordingTime = ref(0)
const recordingTimer = ref<number | null>(null)

// Проверка доступности Electron API
const isIpcRenderer = ref(false)

const selectedScreen = ref<string>('0')
const screensList = ref<ComboboxItem[]>([])

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
        const screens = await window.ipcRenderer.invoke(ExposedRecording.GET_AVAILABLE_SCREENS)
        if (Array.isArray(screens)) {
            screensList.value = screens.map(item => ({
                id:    `${item.id}`,
                title: `${item.name} (${item.width}x${item.height})`,
            }))
            selectedScreen.value = `${screens[0]?.id}` || "0"
        }
    } else {
        console.warn('IPC Renderer not available')
    }
    fullW.value = timerRef.value?.offsetWidth || 0
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
    const result = await window.ipcRenderer.invoke(ExposedRecording.START_FFMPEG_RECORDING, Number(selectedScreen.value))
    if (result?.error) {
        console.error(result.error || 'Failed to start recording')
        return
    }

    savePathFile.value = result.outputPathAndFileName
    console.log('FFmpeg recording started:', result.outputPathAndFileName)

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
    window.ipcRenderer.send(ExposedRecording.OPEN_SAVE_FOLDER, savePathFile.value)
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

function show() {
    window.ipcRenderer.send(ExposedRecording.HIDE_TIMER_WINDOW, {
        x:      window.screen.width - 50 - fullW.value,
        y:      window.screen.height - 70,
        isFull: true,
    })
    isFull.value = true
}

function close() {
    window.ipcRenderer.send(ExposedRecording.HIDE_TIMER_WINDOW, {
        x:      window.screen.width - 35, // - e.clientX,
        y:      window.screen.height / 2, // - e.screenY,
        isFull: false,
    })
    isFull.value = false
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
