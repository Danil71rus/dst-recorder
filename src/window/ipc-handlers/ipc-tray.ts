import { ipcMain } from "electron"
import { trayManager } from "../../tray/tray-manager.ts"
import { ExposedRecorder } from "./definitions/renderer.ts"
import { RecordingStatus } from "@/deinitions/recorder.ts"
import { screenRecorder } from "../../recorder/screen-recorder.ts"

export function initTrayHandlers() {
    // Обновление состояния записи в трее
    ipcMain.on(ExposedRecorder.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        trayManager.updateMenu(status)
    })

    ipcMain.on(ExposedRecorder.UPDATED_SETTINGS, () => {
        trayManager.updateMenu(screenRecorder.getRecordingStatus())
    })
}

