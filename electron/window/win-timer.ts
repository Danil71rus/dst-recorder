import { BrowserWindow } from 'electron'
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller"

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true'

export function createTimerWindow() {
    const timerWindow = new BrowserWindow({
        width:  540,
        height: 54,
        // width:  1200,
        // height: 1000,
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
        timerWindow.loadURL("http://localhost:5173/#/timer")
        // timerWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, '../dist/index.html')

        // Используем loadFile для локальных файлов
        timerWindow.loadFile(indexPath, { hash: "timer" })
            .then(() => console.log('Successfully loaded index.html'))
            .catch(err =>  console.error('Failed to load index.html:', err))

        // timerWindow.webContents.openDevTools()
    }

    timerWindow.on("ready-to-show", () => {
        setWindowReady(WindowName.Timer, timerWindow)
        timerWindow.setAlwaysOnTop(true)
        timerWindow.show()
    })

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    timerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('Page failed to load:', errorCode, errorDescription)
    })

    return timerWindow
}
