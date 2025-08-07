import { BrowserWindow } from 'electron'
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller"

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true'

export function createMainWindow() {
    const mainWindow = new BrowserWindow({
        width:  550,
        height: 400,
        show:   false,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true
        },
    })

    if (isDev) {
        mainWindow.loadURL("http://localhost:5173")
        // mainWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, '../dist/index.html')

        // Используем loadFile для локальных файлов
        mainWindow.loadFile(indexPath)
            .then(() => console.log('Successfully loaded index.html'))
            .catch(err =>  console.error('Failed to load index.html:', err))
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
