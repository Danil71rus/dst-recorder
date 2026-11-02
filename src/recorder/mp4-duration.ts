import { closeSync, openSync, readSync } from "fs"

/**
 * Длительность MP4/MOV по заголовку файла (атом mvhd) — без декодирования и сторонних утилит.
 * Читаются только заголовки атомов, сами видеоданные пропускаются, поэтому это быстро даже для больших файлов.
 *
 * У фрагментированного MP4 (так пишет MediaRecorder во время записи) длительность в заголовке нулевая —
 * тогда возвращается null, и длительность берётся из того, что приложение запомнило при сохранении.
 */

const HEADER_SIZE = 8
const MAX_ATOMS = 4096

interface Atom {
    type:       string
    // начало содержимого атома (после заголовка)
    dataOffset: number
    dataSize:   number
}

function readBytes(fd: number, position: number, length: number): Buffer {
    const buffer = Buffer.alloc(length)
    const read = readSync(fd, buffer, 0, length, position)
    return buffer.subarray(0, read)
}

/** Атом нужного типа среди атомов на отрезке [start, end) */
function findAtom(fd: number, start: number, end: number, type: string): Atom | null {
    let position = start
    for (let index = 0; index < MAX_ATOMS && position + HEADER_SIZE <= end; index++) {
        const header = readBytes(fd, position, 16)
        if (header.length < HEADER_SIZE) return null

        let size = header.readUInt32BE(0)
        const atomType = header.toString("latin1", 4, 8)
        let headerSize = HEADER_SIZE
        if (size === 1) {
            // 64-битный размер — у атомов больше 4 ГБ (обычно mdat)
            if (header.length < 16) return null
            size = Number(header.readBigUInt64BE(8))
            headerSize = 16
        } else if (size === 0) {
            // атом до конца файла
            size = end - position
        }
        if (size < headerSize) return null

        if (atomType === type) return { type, dataOffset: position + headerSize, dataSize: size - headerSize }
        position += size
    }
    return null
}

/** Длительность в миллисекундах или null, если её нет в заголовке */
export function readMp4DurationMs(path: string, fileSize: number): number | null {
    let fd: number | null = null
    try {
        fd = openSync(path, "r")
        const moov = findAtom(fd, 0, fileSize, "moov")
        if (!moov) return null
        const mvhd = findAtom(fd, moov.dataOffset, moov.dataOffset + moov.dataSize, "mvhd")
        if (!mvhd) return null

        const data = readBytes(fd, mvhd.dataOffset, 32)
        const version = data.readUInt8(0)
        // version 0: даты по 4 байта; version 1: по 8 байт
        const timescale = data.readUInt32BE(version === 1 ? 20 : 12)
        const duration = version === 1 ? Number(data.readBigUInt64BE(24)) : data.readUInt32BE(16)
        if (!timescale || !duration) return null
        return Math.round(duration / timescale * 1000)
    } catch {
        return null
    } finally {
        if (fd !== null) closeSync(fd)
    }
}
