import { BrowserWindow, ipcMain, shell } from "electron"
import { ExposedRecorder, ExposedWinTimer } from "./definitions/renderer.ts"
import { screenRecorder } from "../../recorder/screen-recorder.ts"
import { RecorderSettings, RecordingStatus } from "@/deinitions/recorder.ts"
import { sizeDef, sizeMax } from "../win-timer.ts"


export function initTimerWindowControlsHandlers(timerWin: BrowserWindow) {
    ipcMain.handle(ExposedWinTimer.START_RECORDING, async () => {
        return await screenRecorder.startRecording()
    })

    ipcMain.handle(ExposedWinTimer.STOP_RECORDING, async () => {
        return await screenRecorder.stopRecording()
    })

    ipcMain.handle(ExposedWinTimer.GET_RECORDING_STATUS, () => {
        return screenRecorder.getRecordingStatus()
    })

    ipcMain.on(ExposedRecorder.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        timerWin.webContents.send(ExposedWinTimer.UPDATED_STATE_TIMER, status)
    })

    ipcMain.on(ExposedWinTimer.OPEN_SAVE_FOLDER, (_event, path: string) => {
        if (path) shell.showItemInFolder(path)
        else shell.openPath(screenRecorder.getSettings()?.outputPath)
    })

    ipcMain.on(ExposedWinTimer.MOVE_TIMER_WINDOW, (_event, position) => {
        timerWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinTimer.SHOW_SETTINGS, (_, show) => {
        if (!show) timerWin.setSize(sizeDef.width, sizeDef.height, true)
        else timerWin.setSize(sizeMax.width, sizeMax.height, true)
    })

    ipcMain.handle(ExposedWinTimer.SAVE_SETTINGS, async (_event, settings?: RecorderSettings) => {
        screenRecorder.setSettings(settings)
    })

    ipcMain.on(ExposedWinTimer.HIDE, () => {
        timerWin.hide()
        if (screenRecorder.isBusy()) {
            void screenRecorder.stopRecording()
        } else {
            // Записи нет — просто сбрасываем режим области
            screenRecorder.resetByStop()
        }
    })

    ipcMain.handle(ExposedWinTimer.PAUSE_RECORDING, () => {
        return screenRecorder.pauseRecording()
    })

    ipcMain.handle(ExposedWinTimer.RESUME_RECORDING, () => {
        return screenRecorder.resumeRecording()
    })
}
