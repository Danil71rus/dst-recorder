import { BrowserWindow } from "electron"
import { initMainWindowControlsHandlers } from "../ipc-handlers/ipc-win-main.ts"
import { initTimerWindowControlsHandlers } from "../ipc-handlers/ipc-win-timer.ts"
import { initSelectAriaWindowControlsHandlers } from "../ipc-handlers/ipc-win-select-aria.ts"
import { initTrayHandlers } from "../ipc-handlers/ipc-tray.ts"

export enum WindowName {
    Main = "mainWindow",
    Timer = "timerWindow",
    SelectAria = "selectAria",
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
    [WindowName.Main]:       windowDefaultState(),
    [WindowName.Timer]:      windowDefaultState(),
    [WindowName.SelectAria]: windowDefaultState(),
}

const _handlersRegister = [
    {
        type:        "main",
        isRegister:  false,
        isAvailable: () => _windowsState[WindowName.Main].isReady,
        register:    () => {
            const mainWindow = _windowsState[WindowName.Main].windowLink
            if (!mainWindow) {
                console.log("Main window not found, skipping IPC registration")
                return
            }
            initMainWindowControlsHandlers(mainWindow)
        },
    },
    {
        type:        "timer",
        isRegister:  false,
        isAvailable: () => _windowsState[WindowName.Timer].isReady,
        register:    () => {
            const timerWindow = _windowsState[WindowName.Timer].windowLink
            if (!timerWindow) {
                console.log("Timer window not found, skipping IPC registration")
                return
            }
            initTimerWindowControlsHandlers(timerWindow)
        },
    },
    {
        type:        "selectAria",
        isRegister:  false,
        isAvailable: () => _windowsState[WindowName.SelectAria].isReady,
        register:    () => {
            const ariaWindow = _windowsState[WindowName.SelectAria].windowLink
            if (!ariaWindow) {
                console.log("Aria window not found, skipping IPC registration")
                return
            }
            initSelectAriaWindowControlsHandlers(ariaWindow)
        },
    },
    {
        type:        "tray",
        isRegister:  false,
        isAvailable: () => true, // Трей не зависит от окон
        register:    () => {
            initTrayHandlers()
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

export const getWindowAll = () => {
    return Object.values(_windowsState).map(item => item.windowLink)
}

export const setWindowReady = (window: WindowName, windowLink: BrowserWindow) => {
    _windowsState[window] = {
        isReady:    true,
        windowLink: windowLink,
    }
    initializeIpcHandlersIfAvailable()
}
