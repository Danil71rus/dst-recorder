<template>
    <div
        class="aria"
        :class="{ 'black-fon': !isRecord }"
        @mousedown="drag.startDrag"
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
import { dragPosition } from "@/composables/drag-position.ts"

const isRecord = ref(false)

const drag = dragPosition(ExposedWinSelectAria.MOVE_ARIA_WINDOW, () => {
    window.ipcRenderer?.send(ExposedWinSelectAria.STOP_MOVE_WINDOW)
})

// Обновление состояния записи в трее
window.ipcRenderer?.on(ExposedWinSelectAria.UPDATED_STATE_TIMER, (_event, status) => {
    const newVal = status as RecordingStatus
    if (_.isBoolean(newVal?.isRecording)) isRecord.value = newVal.isRecording
})
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
