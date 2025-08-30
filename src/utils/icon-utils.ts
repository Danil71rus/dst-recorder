import { join } from "path"
import { app } from "electron"

export function getIconPath(): string {
    // Используем app.isPackaged для более надёжного определения режима
    const isDev = !app.isPackaged

    let iconPath: string

    if (isDev) {
        // В dev режиме используем путь относительно корня проекта
        if (process.platform === "darwin") {
            iconPath = join(process.cwd(), "src/assets/camera.icns")
        } else if (process.platform === "win32") {
            iconPath = join(process.cwd(), "src/assets/camera.ico")
        } else {
            iconPath = join(process.cwd(), "src/assets/camera.png")
        }
        console.log(`[DEV] Using icon path: ${iconPath}`)
    } else {
        // В production иконки копируются в dist через electron-builder.json
        // Используем путь относительно appPath
        const appPath = app.getAppPath()

        if (process.platform === "darwin") {
            // На macOS иконка уже встроена в .app bundle, но для dock нужен путь к файлу
            iconPath = join(appPath, "src/assets/camera.icns")
        } else if (process.platform === "win32") {
            iconPath = join(appPath, "src/assets/camera.ico")
        } else {
            iconPath = join(appPath, "src/assets/camera.png")
        }
        console.log(`[PROD] Using icon path: ${iconPath}`)
    }

    console.log(`Icon path resolved to: ${iconPath}`)
    console.log(`App packaged: ${app.isPackaged}`)
    console.log(`App path: ${app.getAppPath()}`)

    return iconPath
}
