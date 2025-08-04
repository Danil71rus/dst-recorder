import { app, BrowserWindow } from "electron"
import { createMainWindow } from "./window/win-main"
import {createTimerWindow} from "./window/win-timer.ts";

app.whenReady().then(() => {
    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return
    }

    createMainWindow()
    createTimerWindow()
    // createTray()

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })

    app.on("second-instance", () => {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })
})

app.on("window-all-closed", (event: Event) => {
    event.preventDefault()
    app.quit()
})

