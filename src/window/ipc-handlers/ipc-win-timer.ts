import { BrowserWindow, ipcMain, shell } from "electron"
import { ExposedWinTimer, ExposedWinMain, ExposedFfmpeg } from "./definitions/renderer.ts"
import { screenRecorder } from "../../ffmpeg.ts"
import { getWindowByName, WindowName } from "../utils/ipc-controller.ts"
import { RecordingStatus } from "@/deinitions/ffmpeg.ts"


export function initTimerWindowControlsHandlers(timerWin: BrowserWindow) {
    ipcMain.handle(ExposedWinTimer.START_FFMPEG_RECORDING, async () => {
        return await screenRecorder.startRecording()
    })

    ipcMain.handle(ExposedWinTimer.STOP_FFMPEG_RECORDING, async () => {
        return await screenRecorder.stopRecording()
    })

    ipcMain.handle(ExposedWinTimer.GET_RECORDING_STATUS, () => {
        return screenRecorder.getRecordingStatus()
    })

    ipcMain.on(ExposedFfmpeg.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        timerWin.webContents.send(ExposedWinTimer.UPDATED_STATE_TIMER, status)
    })

    ipcMain.on(ExposedWinTimer.OPEN_SAVE_FOLDER, (_event, path: string) => {
        if (path) shell.showItemInFolder(path)
        else shell.openPath(screenRecorder.getSettings()?.outputPath)
    })

    ipcMain.on(ExposedWinTimer.MOVE_TIMER_WINDOW, (_event, position) => {
        timerWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinTimer.OPEN_MAIN_WIN, () => {
        const mainWin = getWindowByName(WindowName.Main)
        if (mainWin) {
            mainWin.show()
            mainWin.webContents.send(ExposedWinMain.SHOW)
        }
    })

    ipcMain.on(ExposedWinTimer.HIDE, () => {
        timerWin.hide()
        const res = screenRecorder.stopRecording()
        if (res?.error) {
            // Сбросим для сброса настроек с областью
            screenRecorder.resetByStop()
        }
    })
}
