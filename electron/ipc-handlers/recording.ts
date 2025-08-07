import { ipcMain, shell } from "electron"
import { ExposedRecording } from "./definitions/renderer"
import { screenRecorder } from "../ffmpeg"
import { getWindowByName, WindowName } from "../window/utils/ipc-controller.ts"
import { FfmpegSettings } from "../difenition/ffmpeg.ts"


export function initMainWindowControlsHandlers() {
    // Обработчик для запуска записи через FFmpeg
    ipcMain.handle(ExposedRecording.START_FFMPEG_RECORDING, async () => {
        try {
            return await screenRecorder.startRecording()
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

    ipcMain.handle(ExposedRecording.GET_SETTINGS, () => {
        return screenRecorder.getSettings()
    })

    // Обработчик для получения пути сохранения
    ipcMain.handle(ExposedRecording.SAVE_SETTINGS, async (_event, settings?: FfmpegSettings) => {
        screenRecorder.setSettings(settings)
    })

    // Обработчик для получения списка доступных экранов
    ipcMain.handle(ExposedRecording.GET_DEVICES, async () => {
        return await screenRecorder.getSeparatedDevices()
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

    // Обработчик для открытия папки
    ipcMain.on(ExposedRecording.HIDE_TIMER_WINDOW, (_event, position) => {
        const timerWin = getWindowByName(WindowName.Timer)
        if (!timerWin) return
        // timerWin.hide()
        if (!position.isFull) {
            console.log(`${position.x} ${position.y}`)
            timerWin.setSize(36, 54)
            timerWin.setPosition(position.x, position.y, true)

        } else {
            console.log(`${position.x} ${position.y}`)
            timerWin.setSize(440, 54)
            timerWin.setPosition(position.x, position.y, true)
        }
    })
}
