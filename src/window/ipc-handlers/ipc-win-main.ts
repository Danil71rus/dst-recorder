import { BrowserWindow, ipcMain } from "electron"
import { ExposedWinMain } from "./definitions/renderer.ts"
import { screenRecorder } from "../../ffmpeg.ts"
import { FfmpegSettings } from "../../deinitions/ffmpeg.ts"


export function initMainWindowControlsHandlers(mainWin: BrowserWindow) {
    ipcMain.handle(ExposedWinMain.GET_SETTINGS, () => {
        return screenRecorder.getSettings()
    })

    ipcMain.handle(ExposedWinMain.SAVE_SETTINGS, async (_event, settings?: FfmpegSettings) => {
        screenRecorder.setSettings(settings)
        mainWin.hide()
    })

    ipcMain.handle(ExposedWinMain.GET_DEVICES, async () => {
        return await screenRecorder.getSeparatedDevices()
    })

    ipcMain.on(ExposedWinMain.MOVE_MAIN_WINDOW, (_event, position) => {
        mainWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinMain.HIDE, async () => {
        mainWin.hide()
    })
}
