import { app, BrowserWindow, nativeImage } from "electron"
import { createMainWindow } from "./window/win-main.ts"
import {createTimerWindow } from "./window/win-timer.ts"
import { join } from "path"
import { existsSync } from "fs"
import { getIconPath } from "./utils/icon-utils.ts"

// Диагностика путей FFmpeg при запуске
function logFFmpegPaths() {
    console.log("=== FFmpeg Path Diagnostics at Startup ===");
    console.log("App packaged:", app.isPackaged);
    console.log("App path:", app.getAppPath());
    console.log("Resources path:", process.resourcesPath);
    console.log("Platform:", process.platform);

    if (app.isPackaged) {
        const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const expectedPath = join(process.resourcesPath, 'bin', ffmpegName);
        console.log("Expected FFmpeg path:", expectedPath);
        console.log("FFmpeg exists at expected path:", existsSync(expectedPath));

        // Проверяем содержимое директории bin
        const binPath = join(process.resourcesPath, 'bin');
        if (existsSync(binPath)) {
            try {
                const files = require('fs').readdirSync(binPath);
                console.log("Files in bin directory:", files);
            } catch (e) {
                console.error("Error reading bin directory:", e);
            }
        } else {
            console.log("Bin directory does not exist at:", binPath);
        }
    }
    console.log("=== End FFmpeg Diagnostics ===\n");
}

app.whenReady().then(async () => {
    // Устанавливаем иконку приложения
    if (process.platform === 'darwin') {
        const iconPath = getIconPath();
        console.log(`Setting dock icon to: ${iconPath}`);

        if (existsSync(iconPath)) {
            console.log(`Icon file exists at ${iconPath}`);
            try {
                app.dock.setIcon(nativeImage.createFromPath(iconPath));
                console.log(`Dock icon set successfully`);
            } catch (error) {
                console.error(`Failed to set dock icon:`, error);
            }
        } else {
            console.error(`Icon file not found at ${iconPath}`);
        }
    }

    // Логируем диагностику FFmpeg
    logFFmpegPaths();

    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return
    }

    await Promise.all([createMainWindow(), createTimerWindow()])
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

app.on("window-all-closed", () => {
    app.quit()
})

