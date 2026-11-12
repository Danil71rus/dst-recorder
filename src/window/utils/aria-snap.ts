import { BrowserWindow, screen } from "electron"
import { Rect } from "@/deinitions/recorder.ts"
import { ARIA_BORDER } from "@/window/utils/aria-geometry.ts"
import { findFitTarget, outset, snapMove, snapResize, SnapTarget } from "@/window/utils/snap.ts"
import { getWindowBounds } from "@/window/utils/window-bounds.ts"

/**
 * Примагничивание рамки выбора области: к окнам других приложений — так, чтобы в запись попало ровно окно
 * (рамка снаружи), и к краям экранов (весь экран и область без строки меню и Dock). И перемещение, и изменение
 * размера идут через setBounds из main — поэтому рамка липнет на ходу, а не после того, как её отпустили.
 */

function snapTargets(): SnapTarget[] {
    const displays = screen.getAllDisplays().flatMap(display => [display.bounds, display.workArea])
    return [
        ...displays.map(rect => ({ rect, inset: 0 })),
        ...getWindowBounds().map(rect => ({ rect, inset: ARIA_BORDER })),
    ]
}

export interface AriaMove {
    // куда пользователь тащит левый верхний угол рамки
    x:        number
    y:        number
    // зажат Option: без примагничивания
    isFree?:  boolean
    // первое сообщение нового перетаскивания
    isStart?: boolean
}

// Размер рамки до того, как она обхватила окно: если увести её с окна в том же перетаскивании, он вернётся
let sizeBeforeFit: { width: number, height: number } | null = null

/**
 * Границы рамки, которую пользователь тащит. Центр рамки рядом с центром окна — рамка обхватывает окно целиком;
 * иначе её края липнут к краям окон и экранов
 */
export function moveAria(ariaWin: BrowserWindow, move: AriaMove): Rect {
    // Новое перетаскивание: размер, с которым рамку оставили (в том числе на окне), теперь её собственный
    if (move.isStart) sizeBeforeFit = null

    const [width = 0, height = 0] = ariaWin.getSize()
    const size = sizeBeforeFit ?? { width, height }
    const frame = { x: move.x, y: move.y, ...size }

    const target = move.isFree ? null : findFitTarget(frame, getWindowBounds())
    if (target) {
        sizeBeforeFit = size
        return outset(target, ARIA_BORDER)
    }

    sizeBeforeFit = null
    return move.isFree ? frame : snapMove(frame, snapTargets())
}

/** Новые координаты краёв рамки (экранные точки): заданы только те края, которые тянет пользователь */
export interface AriaEdges {
    left?:   number
    right?:  number
    top?:    number
    bottom?: number
}

// Меньше рамка не становится: внутри должна помещаться подсказка с размером
const MIN_WIDTH = 240
const MIN_HEIGHT = 160

/** Рамка, у которой пользователь тянет края: с ограничением наименьшего размера и примагничиванием */
export function resizeAria(ariaWin: BrowserWindow, edges: AriaEdges, isFree: boolean): Rect {
    const current = ariaWin.getBounds()
    const currentRight = current.x + current.width
    const currentBottom = current.y + current.height

    // Тянут левый край — он не может зайти за правый ближе наименьшей ширины, и наоборот
    const left = Math.min(edges.left ?? current.x, currentRight - MIN_WIDTH)
    const right = Math.max(edges.right ?? currentRight, left + MIN_WIDTH)
    const top = Math.min(edges.top ?? current.y, currentBottom - MIN_HEIGHT)
    const bottom = Math.max(edges.bottom ?? currentBottom, top + MIN_HEIGHT)

    const wanted = { x: left, y: top, width: right - left, height: bottom - top }
    return isFree ? wanted : snapResize(wanted, current, snapTargets())
}
