import { BrowserWindow, ipcMain } from "electron"
import { ExposedWinSelectAria } from "./definitions/renderer.ts"
import { screenRecorder } from "../../ffmpeg.ts"
import { getWindowByName, WindowName } from "../utils/ipc-controller.ts"

export function initSelectAriaWindowControlsHandlers(ariaWin: BrowserWindow) {
    ipcMain.on(ExposedWinSelectAria.MOVE_ARIA_WINDOW, (_event, val) => {
        ariaWin.setPosition(val.x, val.y)
        updatePositionByAria(ariaWin)
    })

    ipcMain.on(ExposedWinSelectAria.STOP_MOVE_WINDOW, () => updateSettingCropByAria(ariaWin))
}

export function updateSettingCropByAria(ariaWin: BrowserWindow) {
    const currentSettings = screenRecorder.getSettings()
    if (currentSettings) {

        const border = 4
        const size = ariaWin.getSize()
        const position = ariaWin.getPosition()

        // console.log("size: ", size)
        // console.log("position: ", position)
        // console.log("currentSettings.crop: ", currentSettings.crop)
        // console.log("currentSettings.offset: ", currentSettings.offset)

        screenRecorder.setSettings({
            ...currentSettings,
            offset: { x: position[0] + border, y: position[1] + border },
            crop:   { w: size[0] - (border * 2), h: size[1] - (border * 2) },
        })

        // const newSet = screenRecorder.getSettings()
        // console.log("newSet.crop: ", newSet.crop)
        // console.log("newSet.offset: ", newSet.offset)
    }
}

export function updatePositionByAria(ariaWin: BrowserWindow) {
    const [tX, tY] = ariaWin.getPosition()
    const [aW, aH] = ariaWin.getSize()
    const timerWin = getWindowByName(WindowName.Timer)
    if (timerWin) {
        const [tW ] = timerWin.getSize()
        const border = 4
        timerWin.setPosition(
            Math.max(tX + aW - tW, 0),
            Math.max(tY + aH + border, 0),
        )
        if (!timerWin.isVisible()) timerWin.show()
    }
}
