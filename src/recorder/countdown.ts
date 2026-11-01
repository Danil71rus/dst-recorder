import { globalShortcut } from "electron"
import { DisplayInfo } from "@/deinitions/recorder.ts"
import { ExposedCountdown } from "@/window/ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "@/window/utils/ipc-controller.ts"
import { logger } from "@/utils/logger.ts"

const TICK_MS = 1000
// После скрытия окно отсчёта ещё несколько кадров на экране — ждём, чтобы оно не попало в начало записи
const HIDE_SETTLE_MS = 200
const CANCEL_KEY = "Escape"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Обратный отсчёт перед записью: крупные цифры по центру записываемого экрана.
 * Отменяется клавишей Esc или остановкой записи (isCancelled). Возвращает true, если отсчёт дошёл до конца
 */
export async function runCountdown(
    seconds: number,
    display: DisplayInfo,
    isCancelled: () => boolean,
): Promise<boolean> {
    const countdownWindow = getWindowByName(WindowName.Countdown)
    if (seconds <= 0 || !countdownWindow || countdownWindow.isDestroyed()) return true

    let isEscPressed = false
    // Esc перехватывается только на время отсчёта
    const isEscRegistered = globalShortcut.register(CANCEL_KEY, () => {
        isEscPressed = true
    })
    const isStopped = () => isEscPressed || isCancelled()

    const [width = 0, height = 0] = countdownWindow.getSize()
    countdownWindow.setPosition(
        Math.round(display.bounds.x + (display.bounds.width - width) / 2),
        Math.round(display.bounds.y + (display.bounds.height - height) / 2),
    )

    try {
        for (let left = seconds; left > 0; left--) {
            if (isStopped()) break
            countdownWindow.webContents.send(ExposedCountdown.TICK, left)
            if (left === seconds) countdownWindow.showInactive()
            await sleep(TICK_MS)
        }
    } finally {
        countdownWindow.hide()
        countdownWindow.webContents.send(ExposedCountdown.TICK, 0)
        if (isEscRegistered) globalShortcut.unregister(CANCEL_KEY)
    }

    if (isStopped()) {
        logger.info("[Countdown] Cancelled")
        return false
    }
    await sleep(HIDE_SETTLE_MS)
    return !isStopped()
}
