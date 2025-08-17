<template>
    <div
        class="aria"
        @mousedown="startDrag"
    />
</template>

<script setup lang="ts">
import { ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"

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
    display: block;
    opacity: 100%;
}
</style>
