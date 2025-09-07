import { app, BrowserWindow } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"

const isDev = !app.isPackaged

export const sizeDef = { width: 550, height: 56 }
export const sizeMax = { width: 550, height: 356 }

export async function createTimerWindow() {
    const timerWindow = new BrowserWindow({
        // icon: getIconPath(),
        width:          sizeDef.width,
        height:         sizeDef.height,
        // width:  1200,
        // height: 1000,
        show:           false,
        frame:          false,
        alwaysOnTop:    true,
        resizable:      false,
        skipTaskbar:    true,
        transparent:    true,
        hasShadow:      false,
        webPreferences: {
            preload:          join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox:          true,
        },
    })

    setWindowReady(WindowName.Timer, timerWindow)

    if (isDev) {
        await timerWindow.loadURL("http://localhost:5173/#/timer")
        // timerWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, "../dist/index.html")
        await timerWindow.loadFile(indexPath, { hash: "timer" })
        // timerWindow.webContents.openDevTools()
    }

    timerWindow.on("ready-to-show", () => {
        timerWindow.setAlwaysOnTop(true)
        timerWindow.setVisibleOnAllWorkspaces(true) // окно будет видно на всех столах
        // timerWindow.show() // Не показываем автоматически - управление через трей
    })

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    timerWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("Timer window page failed to load:", errorCode, errorDescription)
    })

    return timerWindow
}
