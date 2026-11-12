import { ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"

/**
 * Изменение размера рамки выбора области за её края и углы. Окно рамки не меняет размер средствами macOS:
 * ручки сообщают в main, куда пользователь утянул край, а main ставит границы окна — с примагничиванием на ходу.
 */

export type AriaHandle = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right"

export const ARIA_HANDLES: AriaHandle[] = [
    "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right",
]

export function useAriaResize() {
    // Расстояние от курсора до края окна в момент нажатия: край идёт за курсором без скачка
    let grab: { left?: number, right?: number, top?: number, bottom?: number } | null = null

    function startResize(handle: AriaHandle, e: MouseEvent) {
        grab = {
            left:   handle.includes("left") ? e.clientX : undefined,
            right:  handle.includes("right") ? window.innerWidth - e.clientX : undefined,
            top:    handle.includes("top") ? e.clientY : undefined,
            bottom: handle.includes("bottom") ? window.innerHeight - e.clientY : undefined,
        }
        window.addEventListener("mousemove", resize)
        window.addEventListener("mouseup", stopResize)
    }

    function resize(e: MouseEvent) {
        if (!grab) return
        const edge = (offset: number | undefined, position: number, direction: 1 | -1) => {
            return offset === undefined ? undefined : position + offset * direction
        }
        window.ipcRenderer?.send(ExposedWinSelectAria.RESIZE_ARIA_WINDOW, {
            edges: {
                left:   edge(grab.left, e.screenX, -1),
                right:  edge(grab.right, e.screenX, 1),
                top:    edge(grab.top, e.screenY, -1),
                bottom: edge(grab.bottom, e.screenY, 1),
            },
            // с зажатым Option (Alt) рамка не примагничивается
            isFree: e.altKey,
        })
    }

    function stopResize() {
        grab = null
        window.removeEventListener("mousemove", resize)
        window.removeEventListener("mouseup", stopResize)
    }

    return { startResize }
}
