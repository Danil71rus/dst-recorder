<template>
    <div
        class="aria"
        :class="{ recording: isRecord }"
        @mousedown="drag.startDrag"
    >
        <!-- Уголки — подсказка, что рамку можно тянуть за края; сами ручки — невидимые полосы по краям и углам -->
        <template v-if="!isRecord">
            <span
                v-for="handle in ARIA_HANDLES"
                :key="`handle-${handle}`"
                class="handle"
                :class="handle"
                @mousedown.stop="startResize(handle, $event)"
            />

            <span
                v-for="corner in corners"
                :key="corner"
                class="corner"
                :class="corner"
            />

            <div class="center">
                <dst-svg
                    name="move-96"
                    class="icon-move"
                />

                <span class="size">{{ sizeLabel }}</span>
                <span class="hint">Перетащите рамку или тяните за край</span>
                <span class="hint">Рамка липнет к окнам и краям экрана, с ⌥ — свободно</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
/**
 * Рамка выбора области. Внешние 4 точки окна — сама рамка, в запись попадает только то, что внутри
 * (см. ARIA_BORDER в aria-geometry.ts). Во время записи остаётся только красная рамка — внутри ничего не рисуем,
 * иначе это попало бы в видео; клики проходят насквозь
 */
import { computed, onBeforeUnmount, ref } from "vue"
import { ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { RecordingStatus } from "@/deinitions/recorder.ts"
import DstSvg from "@/components/dst-svg.vue"
import { dragPosition } from "@/composables/drag-position.ts"
import { ARIA_HANDLES, useAriaResize } from "@/composables/aria-resize.ts"

// Толщина рамки в точках — должна совпадать с ARIA_BORDER
const FRAME = 4

const corners = ["top-left", "top-right", "bottom-left", "bottom-right"]

const isRecord = ref(false)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })

const drag = dragPosition(ExposedWinSelectAria.MOVE_ARIA_WINDOW)
const { startResize } = useAriaResize()

/** Размер области в пикселях экрана — столько же будет в записи, если качество не уменьшит картинку */
const sizeLabel = computed(() => {
    const scale = window.devicePixelRatio || 1
    const width = Math.max(0, Math.round((viewport.value.width - FRAME * 2) * scale))
    const height = Math.max(0, Math.round((viewport.value.height - FRAME * 2) * scale))
    return `${width} × ${height}`
})

function onResize() {
    viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

window.addEventListener("resize", onResize)
onBeforeUnmount(() => window.removeEventListener("resize", onResize))

window.ipcRenderer?.on(ExposedWinSelectAria.UPDATED_STATE_TIMER, (_event, status) => {
    const newVal = status as RecordingStatus
    if (typeof newVal?.isRecording === "boolean") isRecord.value = newVal.isRecording
})
</script>

<style lang="scss" scoped>
$frame: 4px;
$accent: #667eea;
$recording: #f87171;
$corner-size: 22px;
// ширина полосы у края, за которую рамку можно тянуть
$handle-size: 12px;

.aria {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    // Рамка: акцентная линия с тонкой светлой обводкой внутри — видна и на тёмном, и на светлом фоне
    border: $frame solid $accent;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
    background: rgba(102, 126, 234, 0.1);
    cursor: move;
    user-select: none;
    transition: border-color 200ms, background-color 200ms;

    &.recording {
        border-color: rgba($recording, 0.9);
        box-shadow: none;
        background: transparent;
        cursor: default;
    }
}

// Ручки изменения размера: полосы вдоль краёв (заходят внутрь рамки) и квадраты в углах поверх них
.handle {
    position: absolute;

    &.top,
    &.bottom {
        left: 0;
        right: 0;
        height: $handle-size;
        cursor: ns-resize;
    }

    &.left,
    &.right {
        top: 0;
        bottom: 0;
        width: $handle-size;
        cursor: ew-resize;
    }

    &.top-left,
    &.top-right,
    &.bottom-left,
    &.bottom-right {
        width: $corner-size;
        height: $corner-size;
        z-index: 1;
    }

    &.top-left,
    &.bottom-right {
        cursor: nwse-resize;
    }

    &.top-right,
    &.bottom-left {
        cursor: nesw-resize;
    }

    &.top,
    &.top-left,
    &.top-right {
        top: -$frame;
    }

    &.bottom,
    &.bottom-left,
    &.bottom-right {
        bottom: -$frame;
    }

    &.left,
    &.top-left,
    &.bottom-left {
        left: -$frame;
    }

    &.right,
    &.top-right,
    &.bottom-right {
        right: -$frame;
    }
}

// Уголки поверх рамки — как у выделения в графических редакторах
.corner {
    position: absolute;
    width: $corner-size;
    height: $corner-size;
    border: 0 solid #ffffff;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
    pointer-events: none;

    &.top-left {
        top: -$frame;
        left: -$frame;
        border-top-width: $frame;
        border-left-width: $frame;
    }

    &.top-right {
        top: -$frame;
        right: -$frame;
        border-top-width: $frame;
        border-right-width: $frame;
    }

    &.bottom-left {
        bottom: -$frame;
        left: -$frame;
        border-bottom-width: $frame;
        border-left-width: $frame;
    }

    &.bottom-right {
        right: -$frame;
        bottom: -$frame;
        border-right-width: $frame;
        border-bottom-width: $frame;
    }
}

.center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 18px;
    border-radius: 14px;
    background: rgba(15, 15, 20, 0.75);
    backdrop-filter: blur(10px);
    color: #ffffff;
    pointer-events: none;

    .icon-move {
        width: 44px;
        color: rgba(255, 255, 255, 0.85);
    }

    .size {
        font-size: 18px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    .hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.65);
        white-space: nowrap;
    }
}
</style>
