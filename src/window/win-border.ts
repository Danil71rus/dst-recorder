import { app, BrowserWindow, screen } from "electron"
import { join } from "path"
import { setWindowReady, WindowName } from "./utils/ipc-controller.ts"

const isDev = !app.isPackaged

export async function createBorderWindow() {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.bounds

    const borderWindow = new BrowserWindow({
        x:              0,
        y:              0,
        width:          width,
        height:         height,
        show:           false,
        frame:          false,
        alwaysOnTop:    true,
        resizable:      false,
        skipTaskbar:    true,
        transparent:    true,
        hasShadow:      false,
        focusable:      false,
        fullscreenable: false,
        webPreferences: {
            preload:          join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox:          true,
        },
    })

    setWindowReady(WindowName.Border, borderWindow)

    if (isDev) {
        await borderWindow.loadURL("http://localhost:5173/#/border")
    } else {
        const indexPath = join(__dirname, "../dist/index.html")
        await borderWindow.loadFile(indexPath, { hash: "border" })
    }

    borderWindow.on("ready-to-show", () => {
        borderWindow.setAlwaysOnTop(true, "screen-saver")
        borderWindow.setVisibleOnAllWorkspaces(true)
        borderWindow.setIgnoreMouseEvents(true)
    })

    borderWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("Border window page failed to load:", errorCode, errorDescription)
    })

    return borderWindow
}
