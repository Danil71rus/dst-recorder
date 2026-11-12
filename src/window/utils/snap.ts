import { Rect } from "@/deinitions/recorder.ts"

/**
 * Примагничивание рамки выбора области к краям целей (экраны, окна других приложений).
 * Чистые функции без Electron. Все координаты — логические точки в общей системе координат экранов.
 */

export interface SnapTarget {
    rect:  Rect
    // на сколько рамка должна выступать за цель: у окна — на толщину рамки (в запись попадает ровно окно),
    // у экрана — 0 (рамка целиком остаётся на экране)
    inset: number
}

// Ближе этого расстояния край рамки притягивается к краю цели
const SNAP_DISTANCE = 12
// Меньше рамку примагничивание не делает
const MIN_SIZE = 48

// Рамка «садится» на окно целиком, когда её центр оказался рядом с центром окна: ближе этой доли меньшей
// стороны окна, но в пределах от MIN до MAX точек. По всему окну ловить нельзя — иначе на большом окне
// не получилось бы выбрать его часть
const FIT_RADIUS_RATIO = 0.15
const FIT_RADIUS_MIN = 40
const FIT_RADIUS_MAX = 120

const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })

/**
 * Окно, которое рамка должна обхватить целиком. windows — от верхнего окна к нижнему: рассматривается только
 * окно, которое видно под центром рамки, — середина нижнего окна может быть закрыта верхним
 */
export function findFitTarget(frame: Rect, windows: Rect[]): Rect | null {
    const point = center(frame)
    const under = windows.find((rect) => {
        return point.x >= rect.x && point.x <= rect.x + rect.width
            && point.y >= rect.y && point.y <= rect.y + rect.height
    })
    if (!under) return null

    const target = center(under)
    const side = Math.min(under.width, under.height)
    const radius = Math.min(Math.max(side * FIT_RADIUS_RATIO, FIT_RADIUS_MIN), FIT_RADIUS_MAX)
    return Math.hypot(point.x - target.x, point.y - target.y) <= radius ? under : null
}

/** Прямоугольник, увеличенный на margin с каждой стороны */
export function outset(rect: Rect, margin: number): Rect {
    return {
        x:      rect.x - margin,
        y:      rect.y - margin,
        width:  rect.width + margin * 2,
        height: rect.height + margin * 2,
    }
}

interface Span {
    start: number
    end:   number
}

/** Цели, рядом с которыми рамка находится по другой оси: далёкое окно не должно притягивать */
function spansNear(targets: SnapTarget[], axis: "x" | "y", frame: Rect): Span[] {
    const [position, size, crossPosition, crossSize] = axis === "x"
        ? ["x", "width", "y", "height"] as const
        : ["y", "height", "x", "width"] as const

    return targets
        .filter(({ rect, inset }) => {
            const from = rect[crossPosition] - inset - SNAP_DISTANCE
            const to = rect[crossPosition] + rect[crossSize] + inset + SNAP_DISTANCE
            return frame[crossPosition] < to && frame[crossPosition] + frame[crossSize] > from
        })
        .map(({ rect, inset }) => ({ start: rect[position] - inset, end: rect[position] + rect[size] + inset }))
}

/** Ближайшее значение из кандидатов в пределах SNAP_DISTANCE; иначе исходное */
function nearest(value: number, candidates: number[]): number {
    let best = value
    let bestDistance = SNAP_DISTANCE + 1
    for (const candidate of candidates) {
        const distance = Math.abs(candidate - value)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    }
    return best
}

/** Перемещение: левый край к левому краю цели или правый к правому (то же по вертикали); размер не меняется */
export function snapMove(frame: Rect, targets: SnapTarget[]): Rect {
    const along = (axis: "x" | "y", size: number) => {
        const spans = spansNear(targets, axis, frame)
        return nearest(frame[axis], spans.flatMap(span => [span.start, span.end - size]))
    }
    return { ...frame, x: along("x", frame.width), y: along("y", frame.height) }
}

/** Изменение размера: притягиваются только те края, которые пользователь сдвинул */
export function snapResize(frame: Rect, previous: Rect, targets: SnapTarget[]): Rect {
    const along = (axis: "x" | "y", size: "width" | "height") => {
        const spans = spansNear(targets, axis, frame)
        let start = frame[axis]
        let end = frame[axis] + frame[size]
        if (start !== previous[axis]) start = nearest(start, spans.map(span => span.start))
        if (end !== previous[axis] + previous[size]) end = nearest(end, spans.map(span => span.end))
        return end - start >= MIN_SIZE ? { start, size: end - start } : { start: frame[axis], size: frame[size] }
    }
    const horizontal = along("x", "width")
    const vertical = along("y", "height")
    return { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size }
}
