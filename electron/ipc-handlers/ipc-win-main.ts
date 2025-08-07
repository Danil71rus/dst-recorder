import { ipcMain } from "electron"
import { ExposedWinMain } from "./definitions/renderer"
import { screenRecorder } from "../ffmpeg"
import { FfmpegSettings } from "../difenition/ffmpeg.ts"


export function initMainWindowControlsHandlers() {
    ipcMain.handle(ExposedWinMain.GET_SETTINGS, () => {
        return screenRecorder.getSettings()
    })

    ipcMain.handle(ExposedWinMain.SAVE_SETTINGS, async (_event, settings?: FfmpegSettings) => {
        screenRecorder.setSettings(settings)
    })

    ipcMain.handle(ExposedWinMain.GET_DEVICES, async () => {
        return await screenRecorder.getSeparatedDevices()
    })
}
