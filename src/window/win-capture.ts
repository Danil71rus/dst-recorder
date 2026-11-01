import { app, BrowserWindow } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"
import { captureBridge } from "../recorder/capture-bridge.ts"
import { logger } from "../utils/logger.ts"

const isDev = !app.isPackaged

/**
 * Невидимое окно, в котором Chromium захватывает экран, звук и кодирует видео (CaptureView.vue).
 * Управляется из main через src/recorder/capture-bridge.ts
 */
export async function createCaptureWindow() {
    const captureWindow = new BrowserWindow({
        width:                  1,
        height:                 1,
        show:                   false,
        frame:                  false,
        skipTaskbar:            true,
        focusable:              false,
        hiddenInMissionControl: true,
        webPreferences:         {
            preload:              join(__dirname, "preload.js"),
            contextIsolation:     true,
            sandbox:              true,
            // Окно никогда не показывается: без этого Chromium притормаживает фоновые страницы
            backgroundThrottling: false,
            // AudioContext должен работать без клика пользователя
            autoplayPolicy:       "no-user-gesture-required",
        },
    })

    setWindowReady(WindowName.Capture, captureWindow)

    // Сбой процесса окна обрывает запись: сохраняем записанное и поднимаем окно заново для следующих записей
    captureWindow.webContents.on("render-process-gone", (_event, details) => {
        logger.error("[Capture] Capture window process gone:", details.reason)
        captureBridge.reportCrash(`capture window ${details.reason}`)
        if (!captureWindow.isDestroyed()) captureWindow.webContents.reload()
    })

    captureWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        logger.error("Capture window failed to load:", errorCode, errorDescription)
    })

    if (isDev) {
        await captureWindow.loadURL("http://localhost:5173/#/capture")
    } else {
        await captureWindow.loadFile(join(__dirname, "../dist/index.html"), { hash: "capture" })
    }

    return captureWindow
}
