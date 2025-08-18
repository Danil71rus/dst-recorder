import { BrowserWindow } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"
// import { getIconPath } from "../utils/icon-utils.ts"

const isDev = process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true"

export async function createTimerWindow() {
    const timerWindow = new BrowserWindow({
        // icon: getIconPath(),
        width:          500,
        height:         54,
        // width:  1200,
        // height: 1000,
        show:           false,
        frame:          false,
        alwaysOnTop:    true,
        resizable:      false,
        skipTaskbar:    true,
        transparent:    true,
        webPreferences: {
            preload:          join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox:          true,
        },
    })

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
        setWindowReady(WindowName.Timer, timerWindow)
        timerWindow.setAlwaysOnTop(true)
        timerWindow.setVisibleOnAllWorkspaces(true) // окно будет видно на всех столах
        // timerWindow.show() // Не показываем автоматически - управление через трей
    })

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    timerWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("Page failed to load:", errorCode, errorDescription)
    })

    return timerWindow
}
