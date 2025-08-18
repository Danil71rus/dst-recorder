import { ipcMain } from "electron"
import { trayManager } from "../../tray/tray-manager.ts"
import { ExposedFfmpeg } from "./definitions/renderer.ts"
import { RecordingStatus } from "@/deinitions/ffmpeg.ts"
import { screenRecorder } from "../../ffmpeg.ts"

export function initTrayHandlers() {
    // Обновление состояния записи в трее
    ipcMain.on(ExposedFfmpeg.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        trayManager.updateMenu(status)
    })

    ipcMain.on(ExposedFfmpeg.UPDATED_SETTINGS, () => {
        trayManager.updateMenu(screenRecorder.getRecordingStatus())
    })
}

