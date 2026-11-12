import { execFile } from "child_process"
import { Rect } from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

/**
 * Положение окон других приложений (macOS) — к ним примагничивается рамка выбора области.
 * Electron таких данных не даёт, поэтому список берётся у системы: CGWindowListCopyWindowInfo через osascript (JXA).
 * Отдельных разрешений не нужно: читаются только координаты, без названий и содержимого окон.
 */

// Вызов osascript занимает сотни миллисекунд: список запрашивается в фоне и не чаще этого интервала
const REFRESH_INTERVAL_MS = 1500
const TIMEOUT_MS = 3000
// Мелкие окна (значки, всплывающие панели) не цели для записи
const MIN_WINDOW_SIZE = 120

// 1 | 16 = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements; слой 0 — обычные окна приложений
const SCRIPT = `
ObjC.import("CoreGraphics")
const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0)))
JSON.stringify(list.filter(item => item.kCGWindowLayer === 0).map(item => ({
    pid:    item.kCGWindowOwnerPID,
    x:      item.kCGWindowBounds.X,
    y:      item.kCGWindowBounds.Y,
    width:  item.kCGWindowBounds.Width,
    height: item.kCGWindowBounds.Height,
})))
`

interface WindowEntry extends Rect {
    pid: number
}

let windows: Rect[] = []
let refreshedAt = 0
let isRefreshing = false
let isUnavailable = process.platform !== "darwin"

const contains = (outer: Rect, inner: Rect) => {
    return outer.x <= inner.x && outer.y <= inner.y
        && outer.x + outer.width >= inner.x + inner.width
        && outer.y + outer.height >= inner.y + inner.height
}

/** Список идёт от верхнего окна к нижнему: окно, целиком закрытое окном выше, не видно — к нему не магнитимся */
function visibleWindows(entries: WindowEntry[]): Rect[] {
    const result: Rect[] = []
    for (const { pid, ...rect } of entries) {
        const isOwn = pid === process.pid
        const isTooSmall = rect.width < MIN_WINDOW_SIZE || rect.height < MIN_WINDOW_SIZE
        if (isOwn || isTooSmall || result.some(front => contains(front, rect))) continue
        result.push(rect)
    }
    return result
}

function refresh() {
    isRefreshing = true
    execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", SCRIPT], { timeout: TIMEOUT_MS }, (error, stdout) => {
        isRefreshing = false
        refreshedAt = Date.now()
        try {
            if (error) throw error
            windows = visibleWindows(JSON.parse(stdout) as WindowEntry[])
        } catch (e) {
            // Без списка окон рамка продолжает примагничиваться к краям экрана
            isUnavailable = true
            windows = []
            logger.warn("[WindowBounds] Window list is not available — snapping to screen edges only:", e)
        }
    })
}

/** Последний известный список окон; заодно обновляет его в фоне, если он устарел */
export function getWindowBounds(): Rect[] {
    if (!isUnavailable && !isRefreshing && Date.now() - refreshedAt > REFRESH_INTERVAL_MS) refresh()
    return windows
}
