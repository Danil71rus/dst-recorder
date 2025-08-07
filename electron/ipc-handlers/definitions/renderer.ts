import type { IpcRendererEvent } from "electron"


export enum ExposedRecording {
    // main
    GET_DEVICES = "get-devices",
    GET_SETTINGS = "get-settings",
    SAVE_SETTINGS = "save-settings",

    OPEN_SAVE_FOLDER = "open-save-folder",
    MOVE_TIMER_WINDOW = "move-timer-window",
    HIDE_TIMER_WINDOW = "hide-timer-window",
    // FFmpeg каналы
    START_FFMPEG_RECORDING = "start-ffmpeg-recording",
    STOP_FFMPEG_RECORDING = "stop-ffmpeg-recording",
    GET_RECORDING_STATUS = "get-recording-status",
}

export type ExposedChannel = ExposedRecording | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
