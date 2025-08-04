import { ipcMain, screen, shell } from "electron"
import { ExposedRecording } from "./definitions/renderer"
import { screenRecorder } from "../ffmpeg"
import { getWindowByName, WindowName } from "../window/utils/ipc-controller.ts"


export function initMainWindowControlsHandlers() {
    // Обработчик для запуска записи через FFmpeg
    ipcMain.handle(ExposedRecording.START_FFMPEG_RECORDING, async (_event, screenIndex?: number) => {
        try {
            return await screenRecorder.startRecording(screenIndex)
        } catch (error) {
            console.error('Error starting FFmpeg recording:', error)
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    })

    // Обработчик для остановки записи через FFmpeg
    ipcMain.handle(ExposedRecording.STOP_FFMPEG_RECORDING, async () => {
        try {
            return await screenRecorder.stopRecording()
        } catch (error) {
            console.error('Error stopping FFmpeg recording:', error)
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    })

    // Обработчик для получения статуса записи
    ipcMain.handle(ExposedRecording.GET_RECORDING_STATUS, async () => {
        return screenRecorder.getRecordingStatus()
    })

    // Обработчик для получения пути сохранения
    ipcMain.handle(ExposedRecording.GET_SAVE_PATH, async () => {
        return screenRecorder.getRecordingsPath()
    })

    // Обработчик для получения списка доступных экранов
    ipcMain.handle(ExposedRecording.GET_AVAILABLE_SCREENS, async () => {
        const displays = screen.getAllDisplays()
        const result = displays.map((display, index) => ({
            id: index,
            name: display.id === screen.getPrimaryDisplay().id ? 'Primary Screen' : `Screen ${index + 1}`,
            isPrimary: display.id === screen.getPrimaryDisplay().id,
            width: display.size.width,
            height: display.size.height
        }))
        return result
    })

    // Обработчик для открытия папки
    ipcMain.on(ExposedRecording.OPEN_SAVE_FOLDER, (_event, path: string) => {
        if (path) shell.showItemInFolder(path)
        else shell.openPath(screenRecorder.getRecordingsPath())
    })

    // Обработчик для открытия папки
    ipcMain.on(ExposedRecording.MOVE_TIMER_WINDOW, (_event, position) => {
        const timerWin = getWindowByName(WindowName.Timer)
        if (!timerWin) return

        timerWin.setPosition(position.x, position.y)
    })
}
