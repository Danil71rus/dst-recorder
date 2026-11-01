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

    // refresh: true — перечитать устройства (открыли настройки), иначе отдаём кэш,
    // чтобы каждое обновление настроек не запускало новый процесс ffmpeg
    ipcMain.handle(ExposedWinMain.GET_DEVICES, async (_event, options?: { refresh?: boolean }) => {
        if (options?.refresh || !screenRecorder.hasDevices()) return await screenRecorder.refreshDevices()
        return screenRecorder.getDevicesList()
    })

    ipcMain.on(ExposedWinMain.MOVE_MAIN_WINDOW, (_event, position) => {
        mainWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinMain.HIDE, async () => {
        mainWin.hide()
    })
}
