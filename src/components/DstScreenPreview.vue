<template>
    <div
        class="dst-screen-preview"
        :style="{ aspectRatio }"
    >
        <img
            v-if="src"
            class="image"
            :src="src"
            alt="Превью экрана"
            draggable="false"
        >

        <span
            v-else
            class="placeholder"
        >
            {{ isLoading ? "Загрузка превью…" : "Превью недоступно — нет разрешения на запись экрана" }}
        </span>
    </div>
</template>

<script setup lang="ts">
/**
 * Превью выбранного экрана в настройках: видно, какой именно экран будет записан
 */
import { computed } from "vue"

interface Props {
    // снимок экрана (data URL) или null, пока его нет
    src:        string | null
    isLoading?: boolean
    // пропорции экрана «ширина / высота», чтобы место под превью не прыгало при загрузке
    ratio?:     number
}

const props = withDefaults(defineProps<Props>(), {
    isLoading: false,
    ratio:     16 / 10,
})

const aspectRatio = computed(() => `${props.ratio}`)
</script>

<style lang="scss" scoped>
.dst-screen-preview {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;

    .image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
    }

    .placeholder {
        padding: 0 16px;
        font-size: 13px;
        text-align: center;
        color: rgba(255, 255, 255, 0.6);
    }
}
</style>
