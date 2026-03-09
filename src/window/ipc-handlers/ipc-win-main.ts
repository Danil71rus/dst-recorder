import { BrowserWindow, dialog, ipcMain } from "electron"
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

    ipcMain.handle(ExposedWinMain.PICK_OUTPUT_PATH, async () => {
        const result = await dialog.showOpenDialog(mainWin, {
            title:       "Выберите папку для сохранения записей",
            properties:  ["openDirectory", "createDirectory"],
            defaultPath: screenRecorder.getSettings().outputPath,
        })

        if (result.canceled || !result.filePaths?.length) return ""
        return result.filePaths[0] || ""
    })

    ipcMain.handle(ExposedWinMain.GET_DEVICES, async () => {
        return await screenRecorder.updateAndGetDevices()
    })

    ipcMain.on(ExposedWinMain.MOVE_MAIN_WINDOW, (_event, position) => {
        mainWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinMain.HIDE, async () => {
        mainWin.hide()
    })
}
