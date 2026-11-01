import { desktopCapturer, Display, screen, systemPreferences } from "electron"
import { DisplayInfo, Rect } from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

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

// Ширина превью экрана в окне настроек (в пикселях картинки; окно настроек — около 500 точек, Retina — ×2)
const PREVIEW_WIDTH = 960
const PREVIEW_JPEG_QUALITY = 80

/**
 * Снимок экрана для превью в настройках (JPEG data URL). null — снимка нет: например, нет разрешения
 * на запись экрана. Без разрешения не вызываем desktopCapturer, чтобы не показывать системный запрос ради превью
 */
export async function getDisplayPreview(id: number): Promise<string | null> {
    if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted") return null

    const display = findDisplay(id)
    const height = Math.round(PREVIEW_WIDTH * display.bounds.height / display.bounds.width)
    try {
        const sources = await desktopCapturer.getSources({
            types:         ["screen"],
            thumbnailSize: { width: PREVIEW_WIDTH, height },
        })
        const thumbnail = sources.find(source => source.display_id === String(display.id))?.thumbnail
        if (!thumbnail || thumbnail.isEmpty()) return null
        return `data:image/jpeg;base64,${thumbnail.toJPEG(PREVIEW_JPEG_QUALITY).toString("base64")}`
    } catch (error) {
        logger.warn("[Displays] Failed to get preview:", error)
        return null
    }
}
