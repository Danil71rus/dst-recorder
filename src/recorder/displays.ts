import { Display, screen } from "electron"
import { DisplayInfo, Rect } from "@/deinitions/recorder.ts"
import { logger } from "../utils/logger.ts"

// При подключении монитора macOS шлёт пачку событий — схлопываем их в одно
const DISPLAY_CHANGE_DEBOUNCE_MS = 800

function toDisplayInfo(display: Display, index: number, primaryId: number): DisplayInfo {
    const { id, bounds, scaleFactor, size, label } = display
    return {
        id,
        label:     label || `Экран ${index + 1}`,
        bounds:    { ...bounds },
        scaleFactor,
        physical:  {
            width:  Math.round(size.width * scaleFactor),
            height: Math.round(size.height * scaleFactor),
        },
        isPrimary: id === primaryId,
    }
}

/** Все мониторы, основной — первым */
export function getDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays()
        .map((display, index) => toDisplayInfo(display, index, primaryId))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
}

/** Монитор по id; если он отключён — основной */
export function findDisplay(id?: number): DisplayInfo {
    const displays = getDisplays()
    return displays.find(display => display.id === id) || displays[0] as DisplayInfo
}

export function isDisplayConnected(id: number) {
    return screen.getAllDisplays().some(display => display.id === id)
}

/** Монитор, на котором центр прямоугольника (логические точки) */
export function findDisplayByRect(rect: Rect): DisplayInfo {
    const center = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    return findDisplay(screen.getDisplayNearestPoint(center).id)
}

let isWatching = false

/** Подписка на подключение/отключение мониторов и смену разрешения. Строго одна на приложение */
export function watchDisplays(onChange: () => void) {
    if (isWatching) return
    isWatching = true

    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = (reason: string) => {
        logger.info(`[Displays] ${reason}`)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            onChange()
        }, DISPLAY_CHANGE_DEBOUNCE_MS)
    }

    screen.on("display-added", () => schedule("display-added"))
    screen.on("display-removed", () => schedule("display-removed"))
    screen.on("display-metrics-changed", (_event, _display, changedMetrics: string[]) => {
        // workArea меняется от Dock и строки меню — на запись это не влияет
        if (changedMetrics.some(metric => metric === "bounds" || metric === "scaleFactor" || metric === "rotation")) {
            schedule(`display-metrics-changed: ${changedMetrics.join(",")}`)
        }
    })
}
