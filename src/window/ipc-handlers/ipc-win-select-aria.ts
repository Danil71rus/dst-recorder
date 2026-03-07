import { BrowserWindow, ipcMain, screen } from "electron"
import { ExposedFfmpeg, ExposedWinSelectAria } from "./definitions/renderer.ts"
import { screenRecorder } from "../../ffmpeg.ts"
import { getWindowByName, WindowName } from "../utils/ipc-controller.ts"
import { RecordingStatus } from "@/deinitions/ffmpeg.ts"

export function initSelectAriaWindowControlsHandlers(ariaWin: BrowserWindow) {
    ipcMain.on(ExposedWinSelectAria.MOVE_ARIA_WINDOW, (_event, val) => {
        ariaWin.setPosition(val.x, val.y)
        updatePositionByAria(ariaWin)
    })

    ipcMain.on(ExposedWinSelectAria.STOP_MOVE_WINDOW, () => updateSettingCropByAria(ariaWin))

    ipcMain.on(ExposedFfmpeg.UPDATED_STATE_TIMER, (_event, status: RecordingStatus) => {
        ariaWin.webContents.send(ExposedWinSelectAria.UPDATED_STATE_TIMER, status)
    })
}

export function updateSettingCropByAria(ariaWin: BrowserWindow) {
    const currentSettings = screenRecorder.getSettings()
    if (!currentSettings) return

    const border = 4
    const size = ariaWin.getSize() // логические пиксели
    const position = ariaWin.getPosition() // логические пиксели

    const newPosition = { x: position[0] + border, y: position[1] + border }
    const currentWinName = screen.getDisplayNearestPoint(newPosition).label

    const video = (() => {
        if (currentSettings.video?.label === currentWinName) return currentSettings.video
        return screenRecorder
            .getDevicesList()
            .video
            .find(item => item.label === currentWinName) || currentSettings.video
    })()

    // Достаем scaleFactor для правильного маппинга на маках (Retina)
    const scaleFactor = video?.scaleFactor || 1

    const boundsX = video?.bounds?.x || 0
    const boundsY = video?.bounds?.y || 0
    const boundsW = video?.bounds?.width || 1920
    const boundsH = video?.bounds?.height || 1080

    // 1. Считаем ЛОГИЧЕСКОЕ смещение внутри монитора
    const logicalX = Math.max(newPosition.x - boundsX, 0)
    const logicalY = Math.max(newPosition.y - boundsY, 0)

    let logicalCropW = Math.min(size[0] - (border * 2), boundsW - logicalX)
    let logicalCropH = Math.min(size[1] - (border * 2), boundsH - logicalY)

    logicalCropW = Math.max(logicalCropW, 2)
    logicalCropH = Math.max(logicalCropH, 2)

    // 2. ПЕРЕВОДИМ В ФИЗИЧЕСКИЕ ПИКСЕЛИ (для FFmpeg)
    let cropW = logicalCropW * scaleFactor
    let cropH = logicalCropH * scaleFactor
    let offsetX = logicalX * scaleFactor
    let offsetY = logicalY * scaleFactor

    // 3. Строго четные значения (физические)
    cropW = Math.floor(cropW) & ~1
    cropH = Math.floor(cropH) & ~1
    offsetX = Math.floor(offsetX) & ~1
    offsetY = Math.floor(offsetY) & ~1

    // 4. Применяем логику пресетов (scale)
    const defSize = Number(currentSettings.defSize) || 1080
    let scaleW = cropW
    let scaleH = cropH

    if (cropH > defSize) {
        scaleH = defSize
        scaleW = Math.round((cropW / cropH) * scaleH)
    }

    scaleW = scaleW & ~1
    scaleH = scaleH & ~1

    // === ДОБАВЛЯЕМ ЛОГИ ===
    // console.log("\n=== AREA SELECT DEBUG ===")
    // console.log("Scale Factor:", scaleFactor)
    // console.log("Logical Crop:", { w: logicalCropW, h: logicalCropH, x: logicalX, y: logicalY })
    // console.log("Physical Crop (to FFmpeg):", { w: cropW, h: cropH, x: offsetX, y: offsetY })
    // console.log("Target Scale:", { w: scaleW, h: scaleH })
    // console.log("=========================\n")

    screenRecorder.setSettings({
        ...currentSettings,
        offset: { x: offsetX, y: offsetY }, // Передаем физические координаты
        crop:   { w: cropW, h: cropH },
        scale:  { w: scaleW, h: scaleH },
        video,
    })
}

export function updatePositionByAria(ariaWin: BrowserWindow) {
    const [tX, tY] = ariaWin.getPosition()
    const [aW, aH] = ariaWin.getSize()
    const timerWin = getWindowByName(WindowName.Timer)
    if (timerWin) {
        const [tW ] = timerWin.getSize()
        const border = 4
        timerWin.setPosition(
            Math.max(tX + aW - tW, 0),
            Math.max(tY + aH + border, 0),
        )
        if (!timerWin.isVisible()) timerWin.show()
    }
}
