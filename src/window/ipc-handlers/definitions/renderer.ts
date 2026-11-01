import type { IpcRendererEvent } from "electron"

// Рассылка из ядра записи (src/recorder/screen-recorder.ts) всем окнам
export enum ExposedRecorder {
    UPDATED_SETTINGS = "Recorder::updated-settings",
    UPDATED_STATE_TIMER = "Recorder::updated-state-timer",
}

export enum ExposedWinMain {
    SHOW = "main:show",
    GET_DISPLAYS = "main:get-displays",
    GET_DISPLAY_PREVIEW = "main:get-display-preview",
    GET_HOTKEY_STATUS = "main:get-hotkey-status",
    // пока пользователь вводит новое сочетание, глобальные сочетания не должны срабатывать
    SUSPEND_HOTKEYS = "main:suspend-hotkeys",
    GET_SETTINGS = "main:get-settings",
    SAVE_SETTINGS = "main:save-settings",
    PICK_OUTPUT_PATH = "main:pick-output-path",
    MOVE_MAIN_WINDOW = "main:move-main-window",
    HIDE = "main:hide",
}

export enum ExposedWinTimer {
    SHOW_SETTINGS = "timer:show-settings",
    SAVE_SETTINGS = "timer:save-settings",
    OPEN_SAVE_FOLDER = "timer:open-save-folder",
    MOVE_TIMER_WINDOW = "timer:move-timer-window",
    UPDATED_STATE_TIMER = "timer:updated-state-timer",
    HIDE = "timer:hide",
    START_RECORDING = "timer:start-recording",
    STOP_RECORDING = "timer:stop-recording",
    GET_RECORDING_STATUS = "timer:get-recording-status",
    PAUSE_RECORDING = "timer:pause-recording",
    RESUME_RECORDING = "timer:resume-recording",
}

export enum ExposedWinSelectAria {
    MOVE_ARIA_WINDOW = "aria:move-aria-window",
    UPDATED_STATE_TIMER = "aria:updated-state-timer",
    SET_ARIA_ACTIVE = "aria:set_aria_active",
}

// Скрытое окно записи (src/capture/ ↔ src/recorder/capture-bridge.ts)
export enum ExposedCapture {
    // кусочек MP4-файла
    CHUNK = "capture:chunk",
    // запись оборвалась сама: экран отключён, macOS отозвала доступ, ошибка кодировщика
    ENDED = "capture:ended",
}

// Обратный отсчёт перед записью (src/recorder/countdown.ts ↔ CountdownView.vue)
export enum ExposedCountdown {
    TICK = "countdown:tick",
}

// Миниатюра после записи (src/recorder/recording-preview.ts ↔ RecordingPreviewView.vue)
export enum ExposedRecordingPreview {
    SHOW = "preview:show",
    OPEN = "preview:open",
    COPY = "preview:copy",
    REVEAL = "preview:reveal",
    DELETE = "preview:delete",
    CLOSE = "preview:close",
    // перетаскивание файла из миниатюры в другое приложение
    START_DRAG = "preview:start-drag",
    // курсор над миниатюрой — не прятать её
    HOVER = "preview:hover",
}

export type ExposedChannel = ExposedRecorder | ExposedWinMain | ExposedWinTimer | ExposedWinSelectAria | ExposedCapture
    | ExposedCountdown | ExposedRecordingPreview | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
