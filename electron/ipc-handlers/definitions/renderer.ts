import type { IpcRendererEvent } from "electron"


export enum ExposedRecording {
    GET_SAVE_PATH = "get-save-path",
    OPEN_SAVE_FOLDER = "open-save-folder",
    MOVE_TIMER_WINDOW = "move-timer-window",
    HIDE_TIMER_WINDOW = "hide-timer-window",
    // FFmpeg каналы
    START_FFMPEG_RECORDING = "start-ffmpeg-recording",
    STOP_FFMPEG_RECORDING = "stop-ffmpeg-recording",
    GET_RECORDING_STATUS = "get-recording-status",
    GET_AVAILABLE_SCREENS = "get-available-screens",
}

export type ExposedChannel = ExposedRecording | string

export interface ExposedIpcRenderer {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    send: (channel: ExposedChannel, ...args: unknown[]) => void
    invoke: <T>(channel: ExposedChannel, ...args: unknown[]) => Promise<T>
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
}
