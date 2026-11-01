import { BrowserWindow, dialog, ipcMain } from "electron"
import { ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer.ts"
import { screenRecorder } from "@/recorder/screen-recorder.ts"
import { RecorderSettings } from "@/deinitions/recorder.ts"
import { getDisplayPreview } from "@/recorder/displays.ts"
import { hotkeyManager } from "@/recorder/hotkeys.ts"


export function initMainWindowControlsHandlers(mainWin: BrowserWindow) {
    ipcMain.handle(ExposedWinMain.GET_SETTINGS, () => {
        return screenRecorder.getSettings()
    })

    ipcMain.handle(ExposedWinMain.GET_DISPLAYS, () => {
        return screenRecorder.getDisplays()
    })

    ipcMain.handle(ExposedWinMain.GET_DISPLAY_PREVIEW, (_event, displayId: number) => {
        return getDisplayPreview(Number(displayId))
    })

    // Настройки сохраняются сразу при изменении — окно при этом остаётся открытым
    ipcMain.handle(ExposedWinMain.SAVE_SETTINGS, async (_event, settings?: RecorderSettings) => {
        screenRecorder.setSettings(settings)
    })

    ipcMain.handle(ExposedWinMain.GET_HOTKEY_STATUS, () => {
        return hotkeyManager.getStatus()
    })

    ipcMain.on(ExposedWinMain.SUSPEND_HOTKEYS, (_event, isSuspended: boolean) => {
        hotkeyManager.suspend(Boolean(isSuspended))
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

    ipcMain.on(ExposedWinMain.MOVE_MAIN_WINDOW, (_event, position) => {
        mainWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinMain.HIDE, async () => {
        mainWin.hide()
    })
}
