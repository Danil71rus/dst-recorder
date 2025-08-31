import { app, shell, dialog } from "electron"
import { dirname } from "path"
import { logger } from "./logger.ts"

export const appName = "Dst-Recorder"

export function sleep(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function showMessageBoxPermission() {
    const message = "Для записи экрана требуется разрешение macOS (Screen Recording). Откройте настройки и разрешите приложению доступ. После этого перезапустите приложение."
    logger.warn("macOS screen recording permission is NOT granted")

    // Подсказка пользователю с возможностью открыть настройки или перезапустить приложение
    try {
        const res = dialog.showMessageBoxSync({
            type:      "warning",
            buttons:   ["Открыть настройки", "Перезапустить приложение", "Отмена"],
            defaultId: 0,
            cancelId:  2,
            title:     "Требуется доступ к записи экрана",
            message,
            detail:    "Settings → Privacy & Security → Screen Recording → отметьте Dst-Recorder. После изменения настроек потребуется перезапуск приложения.",
        })
        if (res === 0) {
            // Открываем нужный раздел настроек
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        } else if (res === 1) {
            app.relaunch()
            app.exit(0)
        }
    } catch (e) {
        logger.warn("Failed to show permission dialog:", e)
        // Попытка хотя бы открыть нужный раздел
        try {
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        } catch {}
    }
}

export function checkErrorAndShowMessageBox(error: string, ffmpegBinaryPath: string) {
    const patterns = [
        /permission/i,
        /denied/i,
        /not authorized/i,
        /operation not permitted/i,
        /screen.?record/i,
        /cannot capture/i,
        /kTCCAccessDenied/i,
        /AVFoundation.*permission/i,
        /screencapture|scstream/i,
    ]
    // Если ошибка похожа на отсутствие разрешения на запись экрана — подскажем пользователю
    if (patterns.some(re => re.test(error))) {
        try {
            // Логируем отказ TCC/Screen Recording для packaged режима в файл
            logger.error(`Screen Recording permission denied or blocked. Error: ${error}`)
            const ffPath = ffmpegBinaryPath || ""
            const ffDir = ffPath ? dirname(ffPath) : ""
            const detailLines = [
                "Откройте Settings → Privacy & Security → Screen Recording и отметьте:",
                ` • ${appName}`,
                " • ffmpeg (если появляется в списке для этого приложения)",
                ffPath ? `Путь к FFmpeg: ${ffPath}` : "",
                "После изменения настроек перезапустите приложение.",
            ].filter(Boolean)

            const res = dialog.showMessageBoxSync({
                type:      "warning",
                buttons:   ["Открыть настройки", "Показать папку FFmpeg", "Перезапустить приложение", "Закрыть"],
                defaultId: 0,
                cancelId:  3,
                title:     "Нет доступа к записи экрана",
                message:   "macOS блокирует захват экрана (требуется разрешение Screen Recording).",
                detail:    detailLines.join("\n"),
            })
            if (res === 0) {
                // Открываем нужный раздел настроек
                shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            } else if (res === 1 && ffDir) {
                // Откроем папку с бинарём — иногда macOS показывает пункт именно как 'ffmpeg'
                shell.showItemInFolder(ffPath)
            } else if (res === 2) {
                app.relaunch()
                app.exit(0)
            }
        } catch (e) {
            logger.error("checkErrorAndShowMessageBox error: ", e)
        }
    }
}
