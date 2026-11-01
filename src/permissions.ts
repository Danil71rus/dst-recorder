import { app, desktopCapturer, dialog, shell, systemPreferences } from "electron"
import { existsSync, writeFileSync } from "fs"
import { join } from "path"
import { logger } from "./utils/logger.ts"
import { appName } from "./utils/utilsForMain.ts"

/**
 * Разрешения macOS (TCC) запрашиваются от имени самого приложения, а не ffmpeg:
 * тогда в системных диалогах и в настройках фигурирует только Dst-Recorder.
 * ffmpeg — дочерний процесс, и macOS засчитывает ему разрешения приложения
 * (при условии, что пакет приложения подписан — см. builder/after-pack.js).
 */

type MediaPermission = "microphone" | "screen"

interface PermissionHelp {
    title:        string
    message:      string
    steps:        string[]
    settingsUrl:  string
    // Запись экрана macOS применяет только после перезапуска приложения
    needsRestart: boolean
}

const isDarwin = process.platform === "darwin"

const PERMISSIONS_ORDER: MediaPermission[] = ["microphone", "screen"]

const HELP: Record<MediaPermission, PermissionHelp> = {
    microphone: {
        title:        "Нужен доступ к микрофону",
        message:      `Разрешите ${appName} записывать звук`,
        steps:        [
            "1. Нажмите «Открыть настройки».",
            `2. В разделе «Микрофон» включите ${appName}.`,
        ],
        settingsUrl:  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        needsRestart: false,
    },
    screen: {
        title:        "Нужен доступ к записи экрана",
        message:      `Разрешите ${appName} записывать экран`,
        steps:        [
            "1. Нажмите «Открыть настройки».",
            `2. В разделе «Запись экрана и системного звука» (или «Запись экрана») включите ${appName}.`,
            "3. Перезапустите приложение — macOS применяет это разрешение только после перезапуска.",
        ],
        settingsUrl:  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        needsRestart: true,
    },
}

// Ошибки FFmpeg, которые означают отказ macOS в доступе к экрану
const CAPTURE_DENIED_PATTERNS = [
    /permission/i,
    /denied/i,
    /not authorized/i,
    /operation not permitted/i,
    /screen.?record/i,
    /cannot capture/i,
    /kTCCAccessDenied/i,
    /screencapture|scstream/i,
]

// Для экрана Electron не различает «ещё не спрашивали» и «отказано» — помним сами
const screenRequestedMarker = () => join(app.getPath("userData"), "screen-permission-requested")

function isGranted(kind: MediaPermission): boolean {
    return systemPreferences.getMediaAccessStatus(kind) === "granted"
}

/** Системный запрос от имени приложения. true — если в результате доступ есть */
async function requestFromSystem(kind: MediaPermission): Promise<boolean> {
    if (kind === "microphone") {
        const status = systemPreferences.getMediaAccessStatus("microphone")
        return status === "not-determined" ? systemPreferences.askForMediaAccess("microphone") : status === "granted"
    }

    // У Electron нет askForMediaAccess для экрана: попытка получить список экранов
    // показывает системный запрос и добавляет приложение в список «Запись экрана»
    try {
        await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
    } catch (error) {
        logger.warn("[TCC] desktopCapturer.getSources failed:", error)
    }
    return isGranted("screen")
}

/** Окно с пошаговой инструкцией и кнопкой, открывающей нужный раздел настроек */
export function showPermissionHelp(kind: MediaPermission) {
    const help = HELP[kind]
    const buttons = help.needsRestart
        ? ["Открыть настройки", "Перезапустить", "Позже"]
        : ["Открыть настройки", "Позже"]

    // Приложение живёт в строке меню без иконки в Dock — иначе окно может открыться под другими
    app.focus({ steal: true })
    const choice = dialog.showMessageBoxSync({
        type:      "info",
        title:     help.title,
        message:   help.message,
        detail:    help.steps.join("\n"),
        buttons,
        defaultId: 0,
        cancelId:  buttons.length - 1,
    })

    if (choice === 0) {
        void shell.openExternal(help.settingsUrl)
    } else if (help.needsRestart && choice === 1) {
        app.relaunch()
        app.exit(0)
    }
}

/**
 * Запрашивает недостающие разрешения: при первом запуске — системными диалогами,
 * дальше — нашей инструкцией. Возвращает true, если можно начинать запись.
 */
export async function ensurePermissions(): Promise<boolean> {
    if (!isDarwin) return true

    for (const kind of PERMISSIONS_ORDER) {
        if (isGranted(kind)) continue

        const isFirstScreenRequest = kind === "screen" && !existsSync(screenRequestedMarker())
        if (isFirstScreenRequest) writeFileSync(screenRequestedMarker(), "")

        logger.info(`[TCC] Requesting ${kind} access`)
        if (await requestFromSystem(kind)) continue

        // В первый раз macOS сама показывает диалог с кнопкой «Открыть Системные настройки»
        // и после включения предлагает перезапуск — наш диалог поверх только мешал бы
        if (!isFirstScreenRequest) showPermissionHelp(kind)
        logger.warn(`[TCC] ${kind} access is not granted`)
        return false
    }
    return true
}

/** Если FFmpeg упал из-за отказа в доступе к экрану — показываем инструкцию */
export function handleCaptureError(error: string) {
    if (!CAPTURE_DENIED_PATTERNS.some(pattern => pattern.test(error))) return
    logger.error(`[TCC] Screen capture denied by macOS: ${error}`)
    showPermissionHelp("screen")
}
