import { app, BrowserWindow } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"
import { getIconPath } from "../utils/icon-utils.ts"

const isDev = !app.isPackaged

export async function createMainWindow() {
    const mainWindow = new BrowserWindow({
        icon:           getIconPath(),
        width:          550,
        height:         500,
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

    setWindowReady(WindowName.Main, mainWindow)

    if (isDev) {
        await mainWindow.loadURL("http://localhost:5173")
        // mainWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, "../dist/index.html")
        await mainWindow.loadFile(indexPath)
        // mainWindow.webContents.openDevTools()
    }

    mainWindow.on("ready-to-show", () => {
        mainWindow.setVisibleOnAllWorkspaces(true) // окно будет видно на всех столах
        // mainWindow.show()
    })

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("Main window page failed to load:", errorCode, errorDescription)
    })

    return mainWindow
}
