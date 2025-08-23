import { app, BrowserWindow, nativeImage } from "electron"
import { screenRecorder } from "./ffmpeg.ts"
import { createMainWindow } from "./window/win-main.ts"
import { createTimerWindow } from "./window/win-timer.ts"
import { createSelectAriaWindow } from "./window/win-select-aria.ts"
import { join } from "path"
import { existsSync } from "fs"
import { getIconPath } from "./utils/icon-utils.ts"
import { trayManager } from "./tray/tray-manager.ts"
import os from "os"

const isDarwin = os.platform() === "darwin"

// Диагностика путей FFmpeg при запуске
function logFFmpegPaths() {
    console.log("=== FFmpeg Path Diagnostics at Startup ===")
    console.log("App packaged:", app.isPackaged)
    console.log("App path:", app.getAppPath())
    console.log("Resources path:", process.resourcesPath)
    console.log("Platform:", process.platform)

    if (app.isPackaged) {
        const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
        const expectedPath = join(process.resourcesPath, "bin", ffmpegName)
        console.log("Expected FFmpeg path:", expectedPath)
        console.log("FFmpeg exists at expected path:", existsSync(expectedPath))

        // Проверяем содержимое директории bin
        const binPath = join(process.resourcesPath, "bin")
        if (existsSync(binPath)) {
            try {
                const files = require("fs").readdirSync(binPath)
                console.log("Files in bin directory:", files)
            } catch (e) {
                console.error("Error reading bin directory:", e)
            }
        } else {
            console.log("Bin directory does not exist at:", binPath)
        }
    }
    console.log("=== End FFmpeg Diagnostics ===\n")
}

app.whenReady().then(async () => {
    // Устанавливаем иконку приложения
    if (isDarwin) {
        try {
            const iconPath = getIconPath()
            app.dock?.setIcon(nativeImage.createFromPath(iconPath))
        } catch (error) {
            console.error("Failed to set dock icon:", error)
        }
    }

    // Логируем диагностику FFmpeg
    logFFmpegPaths()

    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return
    }

    await Promise.all([createMainWindow(), createTimerWindow(), createSelectAriaWindow()])
    trayManager.createTray()
    await screenRecorder.asyncInit()

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

app.on("window-all-closed", () => {
    app.quit()
})

