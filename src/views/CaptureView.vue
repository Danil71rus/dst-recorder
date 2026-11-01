<template>
    <div class="capture" />
</template>

<script setup lang="ts">
/**
 * Скрытое окно записи: только регистрирует API для main (src/capture/capture-api.ts).
 */
import { onBeforeUnmount } from "vue"
import { createCaptureApi } from "@/capture/capture-api.ts"

const api = createCaptureApi()
window.dstCapture = api

onBeforeUnmount(() => {
    void api.stop()
    window.dstCapture = undefined
})
</script>
