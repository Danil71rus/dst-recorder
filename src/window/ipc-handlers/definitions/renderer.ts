import type { IpcRendererEvent } from "electron"

export enum ExposedFfmpeg {
    UPDATED_SETTINGS = "Ffmpeg::updated-settings",
    UPDATED_STATE_TIMER = "Ffmpeg::updated-state-timer",
}

export enum ExposedWinMain {
    SHOW = "show",
    GET_DEVICES = "get-devices",
    GET_SETTINGS = "get-settings",
    SAVE_SETTINGS = "save-settings",
    MOVE_MAIN_WINDOW = "move-main-window",
    HIDE = "hide",
}

export enum ExposedWinTimer {
    OPEN_MAIN_WIN = "open-main-win",
    OPEN_SAVE_FOLDER = "open-save-folder",
    MOVE_TIMER_WINDOW = "move-timer-window",
    UPDATED_STATE_TIMER = "updated-state-timer",
    HIDE = "hide",
    // FFmpeg каналы
    START_FFMPEG_RECORDING = "start-ffmpeg-recording",
    STOP_FFMPEG_RECORDING = "stop-ffmpeg-recording",
    GET_RECORDING_STATUS = "get-recording-status",
}

export enum ExposedWinSelectAria {
    MOVE_ARIA_WINDOW = "move-aria-window",
    STOP_MOVE_WINDOW = "stop-move-window",
}

export type ExposedChannel = ExposedFfmpeg | ExposedWinMain | ExposedWinTimer | ExposedWinSelectAria | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
