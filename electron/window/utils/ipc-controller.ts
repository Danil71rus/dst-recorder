import { BrowserWindow } from "electron"
import { initMainWindowControlsHandlers } from "../../ipc-handlers/recording"

export enum WindowName {
    Main = "mainWindow",
    Timer = "timerWindow",
}

type WindowsState = Record<WindowName, WindowState>

interface WindowState {
    isReady: boolean
    windowLink: BrowserWindow | null
}

const windowDefaultState = () => ({
    isReady:    false,
    windowLink: null,
})

const _windowsState: WindowsState = {
    [WindowName.Main]:  windowDefaultState(),
    [WindowName.Timer]: windowDefaultState(),
}

const _handlersRegister = [
    {
        type:        "main",
        isRegister:  false,
        isAvailable: () => _windowsState[WindowName.Main].isReady,
        register:    () => {
            const mainWindow = _windowsState[WindowName.Main].windowLink
            if (!mainWindow) {
                console.log('Main window not found, skipping IPC registration')
                return
            }
            initMainWindowControlsHandlers()
        },
    },
]

export const initializeIpcHandlersIfAvailable = () => {
    _handlersRegister.map(handler => {
        if (!handler.isRegister && handler.isAvailable()) {
            console.log(`Registering handler: ${handler.type}`)
            handler.register()
            handler.isRegister = true
        }

        return handler
    })
}

export const getWindowByName = (window: WindowName) => {
    return _windowsState[window].windowLink
}

export const setWindowReady = (window: WindowName, windowLink: BrowserWindow) =>  {
    _windowsState[window] = {
        isReady:    true,
        windowLink: windowLink
    }
    initializeIpcHandlersIfAvailable()
}
