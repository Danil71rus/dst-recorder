import { BrowserWindow } from 'electron'
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true'

export async function createMainWindow() {
    const mainWindow = new BrowserWindow({
        width:  550,
        height: 400,
        show:   false,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        transparent: true,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true
        },
    })

    if (isDev) {
        await mainWindow.loadURL("http://localhost:5173")
        // mainWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, '../dist/index.html')
        await mainWindow.loadFile(indexPath)
        // mainWindow.webContents.openDevTools()
    }

    mainWindow.on("ready-to-show", () => {
        setWindowReady(WindowName.Main, mainWindow)
        // mainWindow.show()
    })

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Page failed to load:', errorCode, errorDescription)
    })

    return mainWindow
}
