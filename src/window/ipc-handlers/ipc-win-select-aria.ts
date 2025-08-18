import { BrowserWindow, ipcMain, screen } from "electron"
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
        const newPosition = { x: position[0] + border, y: position[1] + border }


        const currentWinName = screen.getDisplayNearestPoint(newPosition).label
        const video = (() => {
            if (currentSettings.video?.label === currentWinName) return currentSettings.video
            // Если переместились на другой экран
            return screenRecorder
                .getCurrentDevicesList()
                .video
                .find(item => item.label === currentWinName) || currentSettings.video
        })()

        // [0] screen.bounds: HP 27f ({"x":1920,"y":0,"width":1920,"height":1080})
        newPosition.x = Math.max(newPosition.x - (video?.bounds?.x || 0), 0)
        newPosition.y = Math.max(newPosition.y - (video?.bounds?.y || 0), 0)

        console.log("newPosition: ", JSON.stringify(newPosition))

        screenRecorder.setSettings({
            ...currentSettings,
            offset: newPosition,
            crop:   { w: size[0] - (border * 2), h: size[1] - (border * 2) },
            video,
        })
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
