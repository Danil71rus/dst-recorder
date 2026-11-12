import { app, BrowserWindow, ipcMain } from "electron"
import { screenRecorder } from "@/recorder/screen-recorder.ts"
import { createMainWindow } from "@/window/win-main.ts"
import { createTimerWindow } from "@/window/win-timer.ts"
import { createSelectAriaWindow } from "@/window/win-select-aria.ts"
import { createBorderWindow } from "@/window/win-border.ts"
import { createCaptureWindow } from "@/window/win-capture.ts"
import { createCountdownWindow, createRecordingPreviewWindow } from "@/window/win-overlay.ts"
import { logger } from "@/utils/logger.ts"
import { trayManager } from "@/tray/tray-manager.ts"
import { ensurePermissions } from "@/permissions.ts"
import { MIC_NONE, RecorderSettings } from "@/deinitions/recorder.ts"
import { hotkeyManager } from "@/recorder/hotkeys.ts"
import { ExposedRecorder } from "@/window/ipc-handlers/definitions/renderer.ts"
import os from "os"

const isDarwin = os.platform() === "darwin"

app.whenReady().then(async () => {
    // macOS: приложение живёт только в строке меню, без значка в Dock. В собранном приложении это задаёт
    // LSUIElement в Info.plist (electron-builder.json) — значок не мелькает даже при запуске; здесь — для dev
    if (isDarwin) app.setActivationPolicy("accessory")

    logger.info(`Start: Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, `
        + `${process.platform} ${process.getSystemVersion()}, packaged=${app.isPackaged}`)

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
        createCountdownWindow(),
        createRecordingPreviewWindow(),
    ])
    trayManager.createTray()
    initHotkeys()

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

/** Глобальные сочетания: старт/стоп, пауза и рамка области из любого приложения. Перерегистрируются при смене настроек */
function initHotkeys() {
    hotkeyManager.init({
        toggleRecording: () => {
            if (screenRecorder.isBusy()) void screenRecorder.stopRecording()
            else void trayManager.startRecording()
        },
        togglePause: () => {
            if (screenRecorder.getRecordingStatus().isPaused) screenRecorder.resumeRecording()
            else screenRecorder.pauseRecording()
        },
        selectArea: () => trayManager.toggleAria(),
    })
    hotkeyManager.apply(screenRecorder.getSettings().hotkeys)
    ipcMain.on(ExposedRecorder.UPDATED_SETTINGS, (_event, settings: RecorderSettings) => {
        hotkeyManager.apply(settings.hotkeys)
    })
}

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
app.on("will-quit", () => {
    hotkeyManager.unregisterAll()
    screenRecorder.abort()
})

app.on("window-all-closed", () => {
    // Для macOS не выходим, чтобы приложение продолжало жить в трее
    if (!isDarwin) app.quit()
})
