// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
// import "@sentry/electron/preload"
import { ExposedChannel } from "./ipc-handlers/definitions/renderer"

contextBridge.exposeInMainWorld("ipcRenderer", {
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
        ipcRenderer.on(channel, listener)
    },
    send: (channel: ExposedChannel, ...args: unknown[]) => {
        ipcRenderer.send(channel, ...args)
    },
    invoke: (channel: ExposedChannel, ...args: unknown[]) => {
        return ipcRenderer.invoke(channel, ...args)
    },
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
        ipcRenderer.off(channel, listener)
    },
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel)
    },
})
