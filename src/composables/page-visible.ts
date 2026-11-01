import { onBeforeUnmount, ref } from "vue"

/** Видно ли окно: Electron переключает document.visibilityState при show()/hide() окна */
export function usePageVisible() {
    const isVisible = ref(document.visibilityState === "visible")
    const update = () => {
        isVisible.value = document.visibilityState === "visible"
    }

    document.addEventListener("visibilitychange", update)
    onBeforeUnmount(() => document.removeEventListener("visibilitychange", update))

    return isVisible
}
