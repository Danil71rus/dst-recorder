import { ipcMain } from "electron"
import { trayManager } from "../../tray/tray-manager.ts"
import { ExposedTray } from "./definitions/renderer.ts"

export function initTrayHandlers() {
    // Обновление состояния записи в трее
    ipcMain.on(ExposedTray.UPDATE_RECORDING_STATE, (_event, isRecording: boolean) => {
        trayManager.updateRecordingState(isRecording)
    })
}
