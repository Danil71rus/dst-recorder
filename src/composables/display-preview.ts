import { onBeforeUnmount, Ref, ref, watch } from "vue"
import { ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer.ts"

// Превью обновляется, пока окно настроек открыто: видно, что сейчас происходит на экране
const REFRESH_INTERVAL_MS = 2000

interface DisplayPreviewOptions {
    displayId: Ref<number | undefined>
    // обновлять только когда превью видно
    enabled:   Ref<boolean>
}

/** Снимок выбранного экрана для превью в настройках */
export function useDisplayPreview({ displayId, enabled }: DisplayPreviewOptions) {
    const preview = ref<string | null>(null)
    const isLoading = ref(false)

    let timer: ReturnType<typeof setTimeout> | null = null
    // Защита от гонок: пока шёл снимок прошлого экрана, пользователь мог выбрать другой
    let generation = 0

    function stop() {
        generation++
        if (timer) clearTimeout(timer)
        timer = null
    }

    async function refresh(current: number) {
        const id = displayId.value
        if (id === undefined) return

        const image = await window.ipcRenderer?.invoke<string | null>(ExposedWinMain.GET_DISPLAY_PREVIEW, id)
        if (current !== generation) return
        preview.value = image ?? null
        isLoading.value = false
        // Следующий снимок — после того, как пришёл этот: запросы не копятся, даже если снимок долгий
        timer = setTimeout(() => void refresh(current), REFRESH_INTERVAL_MS)
    }

    function start() {
        stop()
        if (!enabled.value || displayId.value === undefined) return
        isLoading.value = true
        void refresh(generation)
    }

    // Другой экран — сразу убираем снимок прошлого, чтобы не показывать чужую картинку
    watch(displayId, () => {
        preview.value = null
        start()
    })
    watch(enabled, start, { immediate: true })
    onBeforeUnmount(stop)

    return {
        preview,
        isLoading,
    }
}
