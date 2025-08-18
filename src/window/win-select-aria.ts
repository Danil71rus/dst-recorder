import { BrowserWindow } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"
import { updatePositionByAria, updateSettingCropByAria } from "./ipc-handlers/ipc-win-select-aria.ts"

const isDev = process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true"

export async function createSelectAriaWindow() {
    const selectAriaWindow = new BrowserWindow({
        // icon: getIconPath(),
        width:  669,
        height: 508,
        // width:  1200,
        // height: 1000,

        show:           false,
        frame:          false,
        alwaysOnTop:    true,
        skipTaskbar:    true,
        transparent:    true,
        webPreferences: {
            preload:          join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox:          true,
        },
    })

    if (isDev) {
        await selectAriaWindow.loadURL("http://localhost:5173/#/select-aria")
        // selectAriaWindow.webContents.openDevTools()
    } else {
        // В production используем правильный путь
        const indexPath = join(__dirname, "../dist/index.html")
        await selectAriaWindow.loadFile(indexPath, { hash: "select-aria" })
        // selectAriaWindow.webContents.openDevTools()
    }

    selectAriaWindow.on("ready-to-show", () => {
        setWindowReady(WindowName.SelectAria, selectAriaWindow)
        selectAriaWindow.setAlwaysOnTop(true)
        selectAriaWindow.setVisibleOnAllWorkspaces(true) // окно будет видно на всех столах
        // selectAriaWindow.show()
    })

    selectAriaWindow.on("resize", () => updatePositionByAria(selectAriaWindow))
    selectAriaWindow.on("resized", () => updateSettingCropByAria(selectAriaWindow))

    // Добавляем обработчик для отладки загрузки только если есть проблемы
    selectAriaWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("Page failed to load:", errorCode, errorDescription)
    })

    return selectAriaWindow
}
