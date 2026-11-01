import { BrowserWindow } from "electron"
import { DisplayInfo, Rect } from "@/deinitions/recorder.ts"
import { findDisplayByRect } from "../../recorder/displays.ts"

// Толщина рамки окна выбора области: сама рамка в запись не попадает
export const ARIA_BORDER = 4

export interface AriaArea {
    display: DisplayInfo
    // область относительно левого верхнего угла монитора, в логических точках
    area:    Rect
}

/** Что записывать, если открыто окно выбора области: монитор под ним и область внутри рамки */
export function getAriaArea(ariaWin: BrowserWindow): AriaArea {
    const [x = 0, y = 0] = ariaWin.getPosition()
    const [width = 0, height = 0] = ariaWin.getSize()
    const inner: Rect = {
        x:      x + ARIA_BORDER,
        y:      y + ARIA_BORDER,
        width:  width - ARIA_BORDER * 2,
        height: height - ARIA_BORDER * 2,
    }
    const display = findDisplayByRect(inner)

    return {
        display,
        area: {
            ...inner,
            x: inner.x - display.bounds.x,
            y: inner.y - display.bounds.y,
        },
    }
}
