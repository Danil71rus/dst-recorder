import { BrowserWindow, ipcMain, screen } from "electron"
import { ExposedRecorder, ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { ARIA_BORDER } from "@/window/utils/aria-geometry.ts"
import { AriaEdges, resizeAria, snapAriaPosition } from "@/window/utils/aria-snap.ts"
import { RecordingStatus } from "@/deinitions/recorder.ts"

export function initSelectAriaWindowControlsHandlers(ariaWin: BrowserWindow) {
    // Рамка примагничивается к окнам и краям экрана; с зажатым Option (Alt) двигается свободно
    ipcMain.on(ExposedWinSelectAria.MOVE_ARIA_WINDOW, (_event, val: { x: number, y: number, isFree?: boolean }) => {
        const position = val.isFree ? val : snapAriaPosition(ariaWin, val.x, val.y)
        ariaWin.setPosition(Math.round(position.x), Math.round(position.y))
        updatePositionByAria(ariaWin)
    })

    ipcMain.on(ExposedWinSelectAria.RESIZE_ARIA_WINDOW, (_event, val: { edges: AriaEdges, isFree?: boolean }) => {
        const { x, y, width, height } = resizeAria(ariaWin, val.edges, Boolean(val.isFree))
        // событие resize окна само передвинет таймер (см. win-select-aria.ts)
        ariaWin.setBounds({
            x:      Math.round(x),
            y:      Math.round(y),
            width:  Math.round(width),
            height: Math.round(height),
        })
    })

    ipcMain.on(ExposedRecorder.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        ariaWin.webContents.send(ExposedWinSelectAria.UPDATED_STATE_TIMER, status)
    })
}

interface TimerPosition {
    x: number
    y: number
    isInsideAria: boolean
}

function calculateTimerPosition(
    ariaX: number,
    ariaY: number,
    ariaWidth: number,
    ariaHeight: number,
    timerWidth: number,
    timerHeight: number,
    screenY: number,
    screenHeight: number,
): TimerPosition {
    const border = ARIA_BORDER
    const padding = 10

    let posX = ariaX + ariaWidth - timerWidth
    let posY = ariaY + ariaHeight + border
    let isInsideAria = false

    // Проверяем, помещается ли окно таймера снизу
    const bottomSpace = screenY + screenHeight - posY
    if (bottomSpace < timerHeight + padding) {
        // Снизу места нет, пробуем сверху
        const topSpace = ariaY - screenY
        if (topSpace >= timerHeight + border + padding) {
            // Сверху есть место
            posY = ariaY - timerHeight - border
        } else {
            // Ни сверху, ни снизу места нет - размещаем внутри в правом нижнем углу
            posX = ariaX + ariaWidth - timerWidth - border * 2
            posY = ariaY + ariaHeight - timerHeight - border * 2
            isInsideAria = true
        }
    }

    return { x: posX, y: posY, isInsideAria }
}

export function updatePositionByAria(ariaWin: BrowserWindow) {
    const [ariaX, ariaY] = ariaWin.getPosition()
    const [ariaWidth, ariaHeight] = ariaWin.getSize()
    const timerWin = getWindowByName(WindowName.Timer)
    if (!timerWin) return

    const [timerWidth, timerHeight] = timerWin.getSize()

    // Получаем дисплей, на котором находится окно выбора области
    const display = screen.getDisplayNearestPoint({ x: ariaX + ariaWidth / 2, y: ariaY + ariaHeight / 2 })
    const { y: screenY, height: screenHeight } = display.bounds

    const position = calculateTimerPosition(
        ariaX,
        ariaY,
        ariaWidth,
        ariaHeight,
        timerWidth,
        timerHeight,
        screenY,
        screenHeight,
    )

    // Если таймер внутри окна выбора, устанавливаем правильный уровень окон
    if (position.isInsideAria) {
        // Таймер должен быть выше окна выбора области
        timerWin.setAlwaysOnTop(true, "floating")
        ariaWin.setAlwaysOnTop(true, "normal")
    } else {
        // Оба окна на одном уровне
        timerWin.setAlwaysOnTop(true, "floating")
        ariaWin.setAlwaysOnTop(true, "floating")
    }

    timerWin.setPosition(Math.floor(position.x), Math.floor(position.y))
    if (!timerWin.isVisible()) timerWin.show()
}
