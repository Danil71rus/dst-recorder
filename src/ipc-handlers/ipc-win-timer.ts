import { ipcMain, shell } from "electron"
import { ExposedWinTimer, ExposedWinMain } from "./definitions/renderer.ts"
import { screenRecorder } from "../ffmpeg.ts"
import { getWindowAll, getWindowByName, WindowName } from "../window/utils/ipc-controller.ts"


export function initTimerWindowControlsHandlers() {
    ipcMain.handle(ExposedWinTimer.START_FFMPEG_RECORDING, async () => {
        return await screenRecorder.startRecording()
    })

    ipcMain.handle(ExposedWinTimer.STOP_FFMPEG_RECORDING, async () => {
        return await screenRecorder.stopRecording()
    })

    ipcMain.handle(ExposedWinTimer.GET_RECORDING_STATUS, async () => {
        return screenRecorder.getRecordingStatus()
    })

    ipcMain.on(ExposedWinTimer.OPEN_SAVE_FOLDER, (_event, path: string) => {
        if (path) shell.showItemInFolder(path)
        else shell.openPath(screenRecorder.getRecordingsPath())
    })

    ipcMain.on(ExposedWinTimer.MOVE_TIMER_WINDOW, (_event, position) => {
        const timerWin = getWindowByName(WindowName.Timer)
        if (!timerWin) return
        timerWin.setPosition(position.x, position.y)
    })

    ipcMain.on(ExposedWinTimer.OPEN_MAIN_WIN, () => {
        const mainWin = getWindowByName(WindowName.Main)
        if (mainWin) {
            mainWin.show()
            mainWin.webContents.send(ExposedWinMain.SHOW)
        }
    })

    ipcMain.on(ExposedWinTimer.CLOSE_ALL_WINDOW, () => {
        getWindowAll().map(item => item?.close())
    })
}
