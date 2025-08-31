import { app, BrowserWindow, nativeImage } from "electron"
import { screenRecorder } from "./ffmpeg.ts"
import { createMainWindow } from "./window/win-main.ts"
import { createTimerWindow } from "./window/win-timer.ts"
import { createSelectAriaWindow } from "./window/win-select-aria.ts"
import { join } from "path"
import { existsSync } from "fs"
import { getIconPath } from "./utils/icon-utils.ts"
import { logger } from "./utils/logger.ts"
import { trayManager } from "./tray/tray-manager.ts"
import os from "os"

const isDarwin = os.platform() === "darwin"

// Глобальный single-instance lock — ставим ДО whenReady, чтобы избежать двойного запуска в dev
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
    // Завершаем процесс немедленно (важно для dev-скриптов)
    process.exit(0)
}

// Обработка попытки второго запуска
app.on("second-instance", () => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
    }
})

// Диагностика путей FFmpeg при запуске (логируем в файл через electron-log)
function logFFmpegPaths() {
    logger.info("=== FFmpeg Path Diagnostics at Startup ===")
    logger.info(`App packaged: ${app.isPackaged}`)
    logger.info(`App path: ${app.getAppPath()}`)
    logger.info(`Resources path: ${process.resourcesPath}`)
    logger.info(`Platform: ${process.platform}`)

    if (app.isPackaged) {
        const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
        const expectedPath = join(process.resourcesPath, "bin", ffmpegName)
        logger.info(`Expected FFmpeg path: ${expectedPath}`)
        logger.info(`FFmpeg exists at expected path: ${existsSync(expectedPath)}`)

        // Проверяем содержимое директории bin
        const binPath = join(process.resourcesPath, "bin")
        if (existsSync(binPath)) {
            try {
                const files = require("fs").readdirSync(binPath)
                logger.info(`Files in bin directory: ${files.join(", ")}`)
            } catch (e) {
                logger.error("Error reading bin directory:", e)
            }
        } else {
            logger.info(`Bin directory does not exist at: ${binPath}`)
        }
    }
    logger.info("=== End FFmpeg Diagnostics ===")
}

app.whenReady().then(async () => {
    // Устанавливаем иконку приложения
    if (isDarwin) {
        try {
            const iconPath = getIconPath()
            app.dock?.setIcon(nativeImage.createFromPath(iconPath))
         } catch (error) {
             logger.error("Failed to set dock icon:", error)
         }
    }

    // Логируем диагностику FFmpeg
    logFFmpegPaths()

    // macOS: скрываем Dock и делаем приложение "меню-барным", чтобы иконка в трее гарантированно была видна
    if (isDarwin) {
        try {
            app.dock?.hide()
            // @ts-ignore: доступно только на macOS
            if (typeof app.setActivationPolicy === "function") app.setActivationPolicy("accessory")
        } catch (e) {
            logger.warn("Failed to adjust activation policy for tray mode:", e)
        }
    }

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

    // 'second-instance' обрабатывается до whenReady — см. блок выше
})

app.on("window-all-closed", () => {
    // Для macOS не выходим, чтобы приложение продолжало жить в трее
    if (process.platform !== "darwin") {
        app.quit()
    }
})

