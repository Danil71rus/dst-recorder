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
