import { createWriteStream, existsSync, statSync, unlinkSync, WriteStream } from "fs"
import { logger } from "@/utils/logger.ts"

/**
 * Файл записи. MediaRecorder отдаёт фрагментированный MP4 кусочками раз в секунду, они дописываются
 * в конец файла по мере поступления — при сбое на диске остаётся всё записанное до него.
 */
export class RecordingFile {
    private chunks = 0
    private bytes = 0
    private writeError: Error | null = null
    private chunkWaiters: (() => void)[] = []

    private constructor(
        public readonly path: string,
        private readonly stream: WriteStream,
    ) {
        stream.on("error", (error) => {
            this.writeError = error
            logger.error("[RecordingFile] Write error:", path, error)
        })
    }

    /** Создаёт файл; ошибка (нет доступа к папке, диск отключён) — сразу, до начала записи */
    static open(path: string): Promise<RecordingFile> {
        return new Promise((resolve, reject) => {
            const stream = createWriteStream(path)
            stream.once("error", reject)
            stream.once("open", () => {
                stream.off("error", reject)
                resolve(new RecordingFile(path, stream))
            })
        })
    }

    get chunksReceived() {
        return this.chunks
    }

    get bytesReceived() {
        return this.bytes
    }

    get error() {
        return this.writeError
    }

    write(data: Uint8Array) {
        this.chunks++
        this.bytes += data.byteLength
        if (!this.writeError) this.stream.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        this.notifyChunkWaiters()
    }

    /** Ждёт, пока придут все кусочки, которые отправило окно записи. false — не дождались */
    waitForChunks(count: number, timeoutMs: number): Promise<boolean> {
        if (this.chunks >= count) return Promise.resolve(true)

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.chunkWaiters = this.chunkWaiters.filter(waiter => waiter !== check)
                resolve(false)
            }, timeoutMs)
            const check = () => {
                if (this.chunks < count) return
                clearTimeout(timer)
                this.chunkWaiters = this.chunkWaiters.filter(waiter => waiter !== check)
                resolve(true)
            }
            this.chunkWaiters.push(check)
        })
    }

    /** Дописывает всё на диск. Пустой файл (запись не успела начаться) удаляется */
    async close(): Promise<{ saved: boolean }> {
        await new Promise<void>(resolve => this.stream.end(() => resolve()))

        const isEmpty = !existsSync(this.path) || statSync(this.path).size === 0
        if (isEmpty) {
            try {
                if (existsSync(this.path)) unlinkSync(this.path)
            } catch (error) {
                logger.warn("[RecordingFile] Failed to remove empty file:", this.path, error)
            }
        }
        logger.info(`[RecordingFile] Closed: ${this.path} (${this.chunks} chunks, ${this.bytes} bytes)`)
        return { saved: !isEmpty }
    }

    /** Для выхода из приложения: закрыть без ожидания */
    destroy() {
        this.stream.end()
    }

    private notifyChunkWaiters() {
        [...this.chunkWaiters].forEach(check => check())
    }
}
