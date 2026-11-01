<template>
    <div class="countdown">
        <transition
            name="tick"
            mode="out-in"
        >
            <div
                v-if="secondsLeft > 0"
                :key="secondsLeft"
                class="circle"
            >
                <span class="number">{{ secondsLeft }}</span>
                <span class="hint">Esc — отмена</span>
            </div>
        </transition>
    </div>
</template>

<script setup lang="ts">
/**
 * Обратный отсчёт перед записью (src/recorder/countdown.ts): окно не принимает клики и скрывается до начала захвата
 */
import { ref } from "vue"
import { ExposedCountdown } from "@/window/ipc-handlers/definitions/renderer.ts"

const secondsLeft = ref(0)

window.ipcRenderer?.on(ExposedCountdown.TICK, (_event, value) => {
    secondsLeft.value = Number(value) || 0
})
</script>

<style lang="scss" scoped>
.countdown {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    user-select: none;

    .circle {
        width: 180px;
        height: 180px;
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(15, 15, 20, 0.72);
        border: 2px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
        color: #ffffff;
    }

    .number {
        font-size: 96px;
        font-weight: 700;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    .hint {
        margin-top: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
    }
}

// Цифра появляется с лёгким «щелчком»: увеличивается и проявляется
.tick-enter-active {
    transition: transform 250ms cubic-bezier(0.2, 0.9, 0.3, 1.3), opacity 200ms ease-out;
}

.tick-leave-active {
    transition: transform 150ms ease-in, opacity 150ms ease-in;
}

.tick-enter-from {
    transform: scale(0.6);
    opacity: 0;
}

.tick-leave-to {
    transform: scale(1.15);
    opacity: 0;
}
</style>
