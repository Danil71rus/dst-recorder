import { join } from "path"
import { app } from "electron"

const ICON_BY_PLATFORM: Record<string, string> = {
    darwin: "camera.icns",
    win32:  "camera.ico",
}

/**
 * Иконка приложения (окна, Dock). app.getAppPath() — корень проекта в dev и папка приложения в сборке,
 * куда electron-builder кладёт src/assets (см. "files" в electron-builder.json)
 */
export function getIconPath(): string {
    return join(app.getAppPath(), "src/assets", ICON_BY_PLATFORM[process.platform] ?? "camera.png")
}
