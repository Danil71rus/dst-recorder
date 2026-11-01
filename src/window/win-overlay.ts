import { app, BrowserWindow, BrowserWindowConstructorOptions } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "@/window/utils/ipc-controller.ts"
import { logger } from "@/utils/logger.ts"

const isDev = !app.isPackaged

/**
 * Служебное окно поверх всего (обратный отсчёт, миниатюра после записи): без рамки и тени,
 * прозрачное, на всех рабочих столах, не в Dock и не в Mission Control
 */
export async function createOverlayWindow(
    name: WindowName,
    route: string,
    options: BrowserWindowConstructorOptions,
): Promise<BrowserWindow> {
    const overlayWindow = new BrowserWindow({
        show:                   false,
        frame:                  false,
        transparent:            true,
        hasShadow:              false,
        resizable:              false,
        movable:                false,
        minimizable:            false,
        maximizable:            false,
        fullscreenable:         false,
        skipTaskbar:            true,
        alwaysOnTop:            true,
        hiddenInMissionControl: true,
        ...options,
        webPreferences:         {
            preload:          join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox:          true,
            ...options.webPreferences,
        },
    })

    overlayWindow.setAlwaysOnTop(true, "screen-saver")
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    setWindowReady(name, overlayWindow)

    overlayWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        logger.error(`${route} window failed to load:`, errorCode, errorDescription)
    })

    if (isDev) {
        await overlayWindow.loadURL(`http://localhost:5173/#/${route}`)
    } else {
        await overlayWindow.loadFile(join(__dirname, "../dist/index.html"), { hash: route })
    }
    return overlayWindow
}

export function createCountdownWindow() {
    return createOverlayWindow(WindowName.Countdown, "countdown", {
        width:     220,
        height:    220,
        focusable: false,
    })
}

export function createRecordingPreviewWindow() {
    return createOverlayWindow(WindowName.RecordingPreview, "recording-preview", {
        width:            340,
        height:           320,
        // Клик по кнопке срабатывает сразу, без предварительного клика для активации окна
        acceptFirstMouse: true,
    })
}
