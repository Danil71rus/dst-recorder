import { CaptureApi, CaptureReply, CaptureResult } from "@/deinitions/recorder.ts"
import { ExposedCapture } from "@/window/ipc-handlers/definitions/renderer.ts"
import { CaptureSession, CaptureSink } from "./capture-session.ts"

const sink: CaptureSink = {
    chunk: data => window.ipcRenderer?.send(ExposedCapture.CHUNK, data),
    ended: reason => window.ipcRenderer?.send(ExposedCapture.ENDED, reason),
}

async function reply<T>(action: () => T | Promise<T>): Promise<CaptureReply<T>> {
    try {
        return { ok: true, value: await action() }
    } catch (error) {
        console.error("[Capture]", error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}

/** API окна записи для main (вызывается через webContents.executeJavaScript, см. capture-bridge.ts) */
export function createCaptureApi(): CaptureApi {
    let session: CaptureSession | null = null

    const release = async () => {
        const current = session
        session = null
        await current?.dispose()
    }

    return {
        start: options => reply(async () => {
            await release()
            const next = new CaptureSession(sink)
            session = next
            try {
                return await next.start(options)
            } catch (error) {
                await release()
                throw error
            }
        }),
        pause:  () => reply(() => session?.pause()),
        resume: () => reply(() => session?.resume()),
        stop:   () => reply(async (): Promise<CaptureResult> => {
            if (!session) return { chunks: 0 }
            try {
                return await session.stop()
            } finally {
                await release()
            }
        }),
    }
}
