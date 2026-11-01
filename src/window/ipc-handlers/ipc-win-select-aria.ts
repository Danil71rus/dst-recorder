import { BrowserWindow, ipcMain, screen } from "electron"
import { ExposedRecorder, ExposedWinSelectAria } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { ARIA_BORDER } from "@/window/utils/aria-geometry.ts"
import { RecordingStatus } from "@/deinitions/recorder.ts"

export function initSelectAriaWindowControlsHandlers(ariaWin: BrowserWindow) {
    ipcMain.on(ExposedWinSelectAria.MOVE_ARIA_WINDOW, (_event, val) => {
        ariaWin.setPosition(val.x, val.y)
        updatePositionByAria(ariaWin)
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
