<template>
    <div
        class="aria"
        :class="{ 'black-fon': !isRecord }"
        @mousedown="startDrag"
    >
        <dst-svg
            v-if="!isRecord"
            name="move-96"
            class="icon-move"
        />
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import _ from "lodash"
import { ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { RecordingStatus } from "@/deinitions/ffmpeg.ts"
import DstSvg from "@/components/dst-svg.vue"

const isRecord = ref(false)

// Обновление состояния записи в трее
window.ipcRenderer?.on(ExposedWinSelectAria.UPDATED_STATE_TIMER, (_event, status) => {
    const newVal = status as RecordingStatus
    if (_.isBoolean(newVal?.isRecording)) isRecord.value = newVal.isRecording
})

/** Перемещение окна */
let dragPosition: { x: number, y: number } | null = null
function startDrag(e: MouseEvent) {
    dragPosition = { x: e.clientX, y: e.clientY }
    window.addEventListener("mousemove", drag)
    window.addEventListener("mouseup", stopDrag)
}
function drag(e: MouseEvent) {
    if (!dragPosition) return
    window.ipcRenderer?.send(ExposedWinSelectAria.MOVE_ARIA_WINDOW, {
        x: e.screenX - dragPosition.x,
        y: e.screenY - dragPosition.y,
    })
}
function stopDrag() {
    dragPosition = null
    window.removeEventListener("mousemove", drag)
    window.removeEventListener("mouseup", stopDrag)
    window.ipcRenderer?.send(ExposedWinSelectAria.STOP_MOVE_WINDOW)
}
</script>

<style lang="scss" scoped>
.aria {
    width: 100%;
    height: 100%;
    border: #667eea 4px solid;
    opacity: 100%;

    display: flex;
    justify-content: center;
    align-items: center;

    &.black-fon {
        background-color: rgba(34, 34, 37, 0.4);
    }

    .icon-move {
        width: 200px;
        color: rgba(255, 255, 255, 0.58);
    }
}
</style>
