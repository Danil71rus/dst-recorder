<template>
    <div class="border-view" />
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
        border: 2px solid #27c201;
        pointer-events: none;
        box-sizing: border-box;
    }
}
</style>
