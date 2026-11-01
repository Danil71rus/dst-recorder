import { globalShortcut } from "electron"
import { HotkeyAction, HotkeySettings, HotkeyStatus } from "@/deinitions/recorder.ts"
import { logger } from "@/utils/logger.ts"

type HotkeyHandlers = Record<HotkeyAction, () => void>

const ACTIONS: HotkeyAction[] = ["toggleRecording", "togglePause"]

/**
 * Глобальные сочетания клавиш: работают из любого приложения, даже когда окна Dst-Recorder скрыты.
 * Сочетание может быть уже занято другим приложением — тогда оно не регистрируется, и настройки это показывают.
 */
class HotkeyManager {
    private handlers: HotkeyHandlers | null = null
    private hotkeys: HotkeySettings | null = null
    // Зарегистрированные нами сочетания — снимаем только их, не трогая чужие (например, Esc отсчёта)
    private registered = new Set<string>()
    private status: HotkeyStatus = { toggleRecording: true, togglePause: true }
    private isSuspended = false

    init(handlers: HotkeyHandlers) {
        this.handlers = handlers
    }

    apply(hotkeys: HotkeySettings) {
        this.hotkeys = { ...hotkeys }
        this.register()
    }

    /** Пока пользователь вводит новое сочетание в настройках, текущие не должны срабатывать */
    suspend(isSuspended: boolean) {
        if (this.isSuspended === isSuspended) return
        this.isSuspended = isSuspended
        this.register()
    }

    getStatus(): HotkeyStatus {
        return { ...this.status }
    }

    unregisterAll() {
        this.registered.forEach(accelerator => globalShortcut.unregister(accelerator))
        this.registered.clear()
    }

    private register() {
        this.unregisterAll()
        if (!this.hotkeys || !this.handlers || this.isSuspended) return

        for (const action of ACTIONS) {
            const accelerator = this.hotkeys[action]
            this.status[action] = accelerator ? this.registerOne(accelerator, this.handlers[action]) : true
        }
    }

    private registerOne(accelerator: string, handler: () => void): boolean {
        if (this.registered.has(accelerator)) {
            logger.warn(`[Hotkeys] ${accelerator} is assigned twice`)
            return false
        }
        try {
            const isRegistered = globalShortcut.register(accelerator, handler)
            if (isRegistered) this.registered.add(accelerator)
            else logger.warn(`[Hotkeys] ${accelerator} is already used by another application`)
            return isRegistered
        } catch (error) {
            // Некорректная строка сочетания — Electron бросает исключение
            logger.warn(`[Hotkeys] Invalid accelerator ${accelerator}:`, error)
            return false
        }
    }
}

export const hotkeyManager = new HotkeyManager()
