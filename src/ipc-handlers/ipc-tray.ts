import { ipcMain } from "electron"
import { trayManager } from "../tray/tray-manager.ts"
import { ExposedTray } from "./definitions/renderer.ts"

export function initTrayHandlers() {
    // Обновление состояния записи в трее
    ipcMain.on(ExposedTray.UPDATE_RECORDING_STATE, (_event, isRecording: boolean) => {
        trayManager.updateRecordingState(isRecording)
    })

    // Показать меню трея
    ipcMain.on(ExposedTray.SHOW_TRAY_MENU, () => {
        // Этот метод может быть полезен для программного вызова меню трея
        // Но обычно меню показывается по клику на иконку
    })

    // Уничтожить трей (при закрытии приложения)
    ipcMain.on(ExposedTray.DESTROY_TRAY, () => {
        trayManager.destroy()
    })
}