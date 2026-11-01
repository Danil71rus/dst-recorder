/**
 * Форматирование для интерфейса — общее для main-процесса (меню трея) и окон (миниатюра после записи)
 */

const pad = (value: number) => `${value}`.padStart(2, "0")

/** 0:07, 12:34, 1:02:03 */
export function formatDuration(durationMs: number): string {
    const totalSeconds = Math.round(Math.max(durationMs, 0) / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

const SIZE_UNITS = ["Б", "КБ", "МБ", "ГБ"]

/** 845 КБ, 12,4 МБ, 1,2 ГБ */
export function formatFileSize(bytes: number): string {
    let value = Math.max(bytes, 0)
    let unit = 0
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
        value /= 1024
        unit++
    }
    // Дробная часть нужна только для крупных единиц и небольших значений: «12,4 МБ», но «845 КБ»
    const digits = unit >= 2 && value < 100 ? 1 : 0
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })} ${SIZE_UNITS[unit]}`
}

const MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."]

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Когда сделана запись: «14:17», «вчера 14:17», «28 окт. 14:17» */
export function formatRecordingTime(timestamp: number, now = new Date()): string {
    const date = new Date(timestamp)
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    if (isSameDay(date, now)) return time

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (isSameDay(date, yesterday)) return `вчера ${time}`

    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${time}`
}
