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

    // 2. ПЕРЕВОДИМ В ФИЗИЧЕСКИЕ ПИКСЕЛИ (строго четные значения: & ~1)
    const offsetX = Math.floor(logicalX * scaleFactor) & ~1
    const offsetY = Math.floor(logicalY * scaleFactor) & ~1
    let cropW = Math.floor(logicalCropW * scaleFactor) & ~1
    let cropH = Math.floor(logicalCropH * scaleFactor) & ~1

    // 3. АБСОЛЮТНАЯ ЗАЩИТА ОТ ВЫХОДА ЗА ГРАНИЦЫ
    // Берем точный физический размер из scaleMax, если он есть
    const physicalW = video?.scaleMax?.width || (Math.floor(boundsW * scaleFactor) & ~1)
    const physicalH = video?.scaleMax?.height || (Math.floor(boundsH * scaleFactor) & ~1)

    if (offsetX + cropW > physicalW) {
        cropW = (physicalW - offsetX) & ~1
    }
    if (offsetY + cropH > physicalH) {
        cropH = (physicalH - offsetY) & ~1
    }

    cropW = Math.max(cropW, 2)
    cropH = Math.max(cropH, 2)

    // 4. Применяем логику пресетов (scale) с учетом пропорций 16:9
    const defSizeH = Number(currentSettings.defSize) || 1080
    // Вычисляем максимальную ширину для этого пресета
    const defSizeW = Math.round((defSizeH * 16) / 9)

    let scaleW = cropW
    let scaleH = cropH

    // Если область выходит за рамки целевого качества хотя бы по одной из сторон
    if (cropW > defSizeW || cropH > defSizeH) {
        const ratioW = defSizeW / cropW
        const ratioH = defSizeH / cropH

        // Берем минимальный коэффициент, чтобы гарантированно вписать область в рамки
        const minRatio = Math.min(ratioW, ratioH)

        scaleW = Math.round(cropW * minRatio)
        scaleH = Math.round(cropH * minRatio)
    }

    // 5. ЖЕСТКАЯ ЗАЩИТА: Масштаб также должен быть четным (минимум 2 пикселя)
    scaleW = Math.max(Math.floor(scaleW) & ~1, 2)
    scaleH = Math.max(Math.floor(scaleH) & ~1, 2)

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
