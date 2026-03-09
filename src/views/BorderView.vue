<template>
    <div class="border-view"></div>
</template>

<script setup lang="ts">
// Просто пустой контейнер для зеленой рамки
</script>

<style lang="scss" scoped>
.border-view {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    box-sizing: border-box;

    /* Рисуем рамку через псевдоэлементы, чтобы гарантировать видимость всех сторон */
    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 6px solid #00ff00;
        box-shadow: 0 0 0 2px rgba(0, 255, 0, 0.3),
                    inset 0 0 0 2px rgba(0, 255, 0, 0.3);
        pointer-events: none;
        box-sizing: border-box;
    }
}
</style>
