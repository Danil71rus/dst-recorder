import type { IpcRendererEvent } from "electron"

export enum ExposedFfmpeg {
    UPDATED_SETTINGS = "Ffmpeg::updated-settings",
    UPDATED_STATE_TIMER = "Ffmpeg::updated-state-timer",
}

export enum ExposedWinMain {
    SHOW = "main:show",
    GET_DEVICES = "main:get-devices",
    GET_SETTINGS = "main:get-settings",
    SAVE_SETTINGS = "main:save-settings",
    MOVE_MAIN_WINDOW = "main:move-main-window",
    HIDE = "main:hide",
}

export enum ExposedWinTimer {
    SHOW_SETTINGS = "timer:show-settings",
    SAVE_SETTINGS = "timer:save-settings",
    OPEN_SAVE_FOLDER = "timer:open-save-folder",
    MOVE_TIMER_WINDOW = "timer:move-timer-window",
    UPDATED_STATE_TIMER = "timer:updated-state-timer",
    HIDE = "hide",
    // FFmpeg каналы
    START_FFMPEG_RECORDING = "timer:start-ffmpeg-recording",
    STOP_FFMPEG_RECORDING = "timer:stop-ffmpeg-recording",
    GET_RECORDING_STATUS = "timer:get-recording-status",
}

export enum ExposedWinSelectAria {
    MOVE_ARIA_WINDOW = "aria:move-aria-window",
    STOP_MOVE_WINDOW = "aria:stop-move-window",
    UPDATED_STATE_TIMER = "aria:updated-state-timer",
}

export type ExposedChannel = ExposedFfmpeg | ExposedWinMain | ExposedWinTimer | ExposedWinSelectAria | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
