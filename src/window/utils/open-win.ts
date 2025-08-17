import { BrowserWindow, screen } from "electron"

export function showOnCurrentWin(win: BrowserWindow, skipMove?: boolean) {
    if (win.isVisible()) {
        win.hide()
    }

    if (!skipMove) {
        const { x, y } = screen.getCursorScreenPoint()
        const currentDisplay = screen.getDisplayNearestPoint({ x, y })
        const [aW, aH] = win.getSize()
        // 💡 Перед показом окна, устанавливаем его новую позицию
        win.setPosition(
            Math.round(currentDisplay.workArea.x + (currentDisplay.workArea.width / 2) - (aW / 2)),
            Math.round(currentDisplay.workArea.y + (currentDisplay.workArea.height / 2) - (aH / 2)),
        )
    }

    win.setVisibleOnAllWorkspaces(true)
    win.show()
    win.setVisibleOnAllWorkspaces(false)
}
