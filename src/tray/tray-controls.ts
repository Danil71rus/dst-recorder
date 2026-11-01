import { app, nativeImage, NativeImage, Point, Rectangle } from "electron"
import { join } from "path"
import { logger } from "@/utils/logger.ts"

/**
 * Кнопки паузы и остановки прямо в иконке приложения в строке меню — для записи, начатой из трея.
 *
 * Отдельными значками их не сделать: macOS ставит каждый новый значок левее всех существующих
 * (в том числе чужих), а если места не хватает — прячет. Поэтому кнопки нарисованы в самой иконке:
 * [⏸] [⏹] [камера] ● 00:15 — и по месту клика понятно, что нажато.
 */

export type TrayClickTarget = "pause" | "stop" | "menu"

// Раскладка картинки trayRecording*Template.png в точках (см. src/assets/tray)
const BUTTON = 18
const GAP = 6
// Отступ картинки от левого края значка в строке меню
const ICON_INSET = 4
// Кнопки ловят клик и по половине промежутка рядом с собой — по маленьким значкам легко промахнуться
const PAUSE_END = ICON_INSET + BUTTON + GAP / 2
const STOP_END = PAUSE_END + GAP + BUTTON

const icons = new Map<string, NativeImage>()

function loadIcon(file: string): NativeImage {
    let icon = icons.get(file)
    if (!icon) {
        const path = join(app.getAppPath(), "src/assets/tray", file)
        icon = nativeImage.createFromPath(path)
        if (icon.isEmpty()) logger.error(`[Tray] Icon not found: ${path}`)
        // Монохромная template-иконка: macOS сама красит её под светлую и тёмную строку меню
        icon.setTemplateImage(true)
        icons.set(file, icon)
    }
    return icon
}

/** Обычная иконка приложения или иконка с кнопками паузы/продолжения и остановки */
export function getTrayIcon(controls: "none" | "pause" | "play"): NativeImage {
    const file = {
        none:  "trayTemplate.png",
        pause: "trayRecordingPauseTemplate.png",
        play:  "trayRecordingPlayTemplate.png",
    }[controls]
    return loadIcon(file)
}

/** Что нажали в иконке с кнопками */
export function getClickTarget(bounds: Rectangle, position: Point): TrayClickTarget {
    // position — в координатах экрана; на случай, если macOS отдаст координаты внутри значка, — берём их как есть
    const isScreenPoint = position.x >= bounds.x && position.x <= bounds.x + bounds.width
    const x = isScreenPoint ? position.x - bounds.x : position.x

    const target: TrayClickTarget = x < PAUSE_END ? "pause" : x < STOP_END ? "stop" : "menu"
    logger.info(`[Tray] Click at ${x.toFixed(1)}pt of ${bounds.width}pt → ${target}`)
    return target
}
