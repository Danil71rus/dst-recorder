import { app, BrowserWindow, nativeImage } from "electron"
import { screenRecorder } from "./recorder/screen-recorder.ts"
import { createMainWindow } from "./window/win-main.ts"
import { createTimerWindow } from "./window/win-timer.ts"
import { createSelectAriaWindow } from "./window/win-select-aria.ts"
import { createBorderWindow } from "./window/win-border.ts"
import { createCaptureWindow } from "./window/win-capture.ts"
import { getIconPath } from "./utils/icon-utils.ts"
import { logger } from "./utils/logger.ts"
import { trayManager } from "./tray/tray-manager.ts"
import { ensurePermissions } from "./permissions.ts"
import { MIC_NONE } from "./deinitions/recorder.ts"
import os from "os"

const isDarwin = os.platform() === "darwin"

// Скрываем иконку из Dock (только для macOS)
if (isDarwin) app.dock?.hide()

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

    logger.info(`Start: Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, `
        + `${process.platform} ${process.getSystemVersion()}, packaged=${app.isPackaged}`)

    // macOS: скрываем Dock и делаем приложение "меню-барным", чтобы иконка в трее гарантированно была видна
    if (isDarwin) {
        try {
            app.dock?.hide()
            app.setActivationPolicy("accessory")
        } catch (e) {
            logger.warn("Failed to adjust activation policy for tray mode:", e)
        }
    }

    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return
    }

    screenRecorder.init()
    await Promise.all([
        createMainWindow(),
        createTimerWindow(),
        createSelectAriaWindow(),
        createBorderWindow(),
        createCaptureWindow(),
    ])
    trayManager.createTray()

    // Первый запуск: сразу просим разрешения от имени приложения,
    // чтобы к моменту первой записи всё уже было разрешено
    void ensurePermissions({ microphone: screenRecorder.getSettings().micDeviceId !== MIC_NONE })

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

// Перед выходом (трей, Cmd+Q, выключение Mac) дожидаемся, пока запись остановится и файл сохранится
let isQuitAfterRecording = false
const QUIT_WAIT_TIMEOUT_MS = 30_000
app.on("before-quit", (event) => {
    if (isQuitAfterRecording || !screenRecorder.isBusy()) return
    event.preventDefault()
    isQuitAfterRecording = true
    logger.info("Quit requested during recording — waiting for the file to be saved")

    const timeout = new Promise(resolve => setTimeout(resolve, QUIT_WAIT_TIMEOUT_MS))
    Promise.race([screenRecorder.stopRecording({ reveal: false }), timeout])
        .catch(error => logger.error("Error while stopping recording before quit:", error))
        .finally(() => app.quit())
})

// Страховка: если запись так и не остановилась, закрываем файл с тем, что успело записаться
app.on("will-quit", () => screenRecorder.abort())

app.on("window-all-closed", () => {
    // Для macOS не выходим, чтобы приложение продолжало жить в трее
    if (!isDarwin) app.quit()
})
