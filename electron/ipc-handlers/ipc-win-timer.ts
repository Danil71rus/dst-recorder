import {ipcMain, shell} from "electron"
import {ExposedWinTimer} from "./definitions/renderer"
import {screenRecorder} from "../ffmpeg"
import {getWindowAll, getWindowByName, WindowName} from "../window/utils/ipc-controller.ts"


export function initTimerWindowControlsHandlers() {
    ipcMain.handle(ExposedWinTimer.START_FFMPEG_RECORDING, async () => {
        try {
            return await screenRecorder.startRecording()
        } catch (error) {
            console.error('Error starting FFmpeg recording:', error)
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    })

    ipcMain.handle(ExposedWinTimer.STOP_FFMPEG_RECORDING, async () => {
        try {
            return await screenRecorder.stopRecording()
        } catch (error) {
            console.error('Error stopping FFmpeg recording:', error)
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
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

    ipcMain.on(ExposedWinTimer.CLOSE_ALL_WINDOW, () => {
        getWindowAll().map(item => item?.close())
    })

    ipcMain.on(ExposedWinTimer.OPEN_MAIN_WIN, () => {
       const mainWin = getWindowByName(WindowName.Main)
        mainWin?.show()
    })
}
