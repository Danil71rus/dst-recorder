import type { IpcRendererEvent } from "electron"


export enum ExposedWinMain {
    SHOW = "show",
    GET_DEVICES = "get-devices",
    GET_SETTINGS = "get-settings",
    SAVE_SETTINGS = "save-settings",
    HIDE = "hide",
}

export enum ExposedWinTimer {
    OPEN_MAIN_WIN = "open-main-win",
    OPEN_SAVE_FOLDER = "open-save-folder",
    MOVE_TIMER_WINDOW = "move-timer-window",
    CLOSE_ALL_WINDOW = "close-all-window",
    // FFmpeg каналы
    START_FFMPEG_RECORDING = "start-ffmpeg-recording",
    STOP_FFMPEG_RECORDING = "stop-ffmpeg-recording",
    GET_RECORDING_STATUS = "get-recording-status",
}

export enum ExposedTray {
    UPDATE_RECORDING_STATE = "tray:update-recording-state",
    SHOW_TRAY_MENU = "tray:show-menu",
    DESTROY_TRAY = "tray:destroy"
}

export type ExposedChannel = ExposedWinMain | ExposedWinTimer | ExposedTray | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
