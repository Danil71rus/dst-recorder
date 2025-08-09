import { ipcMain} from "electron"
import { ExposedWinMain } from "./definitions/renderer.ts"
import { screenRecorder } from "../ffmpeg.ts"
import { FfmpegSettings } from "../deinitions/ffmpeg.ts"
import { getWindowByName, WindowName } from "../window/utils/ipc-controller.ts"


export function initMainWindowControlsHandlers() {
    ipcMain.handle(ExposedWinMain.GET_SETTINGS, () => {
        return screenRecorder.getSettings()
    })

    ipcMain.handle(ExposedWinMain.SAVE_SETTINGS, async (_event, settings?: FfmpegSettings) => {
        screenRecorder.setSettings(settings)
        getWindowByName(WindowName.Main)?.hide()
    })

    ipcMain.handle(ExposedWinMain.GET_DEVICES, async () => {
        return await screenRecorder.getSeparatedDevices()
    })

    ipcMain.on(ExposedWinMain.MOVE_MAIN_WINDOW, (_event, position) => {
        const timerWin = getWindowByName(WindowName.Main)
        if (!timerWin) return
        timerWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinMain.HIDE, async () => {
        getWindowByName(WindowName.Main)?.hide()
    })
}
