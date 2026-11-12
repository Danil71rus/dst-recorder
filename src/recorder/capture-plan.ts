import {
    Compression,
    DEFAULT_COMPRESSION,
    DEFAULT_VIDEO_CODEC,
    DisplayInfo,
    RecorderSettings,
    Rect,
    Size,
    VideoCodec,
} from "@/deinitions/recorder.ts"

/**
 * Геометрия и битрейт записи. Чистые функции без Electron — используются и в main, и в окнах настроек.
 *
 * Chromium сам масштабирует захват экрана до запрошенного размера, поэтому размер захвата подбирается так,
 * чтобы записываемая область (весь экран или выбранная рамка) уложилась в выбранное качество.
 */

export interface CapturePlan {
    // размер захвата всего экрана
    width:              number
    height:             number
    // область в долях кадра (0..1); null — весь экран
    crop:               Rect | null
    // размер итогового видео
    outputWidth:        number
    outputHeight:       number
    videoBitsPerSecond: number
}

// Бит на пиксель кадра для аппаратного H.264. Это потолок, а не расход: кодировщик работает с переменным
// битрейтом и на неподвижном экране тратит в 2–3 раза меньше. Balanced на экранном контенте даёт чёткий текст
// при размере файлов на уровне x264 veryfast (проверено прототипом)
const BITS_PER_PIXEL: Record<Compression, number> = {
    [Compression.Quality]:  0.045,
    [Compression.Balanced]: 0.03,
    [Compression.Compact]:  0.018,
}
// HEVC даёт то же качество при меньшем битрейте
const HEVC_BITRATE_RATIO = 0.65
const MIN_BITRATE = 500_000
const MAX_BITRATE = 16_000_000

export type VideoEncoding = Pick<RecorderSettings, "videoCodec" | "compression">
const DEFAULT_ENCODING: VideoEncoding = { videoCodec: DEFAULT_VIDEO_CODEC, compression: DEFAULT_COMPRESSION }
// Меньше этого область не имеет смысла: H.264 и рамка выбора всё равно не дадут меньше
const MIN_AREA_SIZE = 16

/** H.264 с YUV 4:2:0 требует чётных размеров */
const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

/** Обрезает область по границам экрана (координаты относительно левого верхнего угла экрана) */
export function clampArea(area: Rect, display: DisplayInfo): Rect | null {
    const { width: maxWidth, height: maxHeight } = display.bounds
    const x = Math.min(Math.max(area.x, 0), maxWidth)
    const y = Math.min(Math.max(area.y, 0), maxHeight)
    const width = Math.min(area.x + area.width, maxWidth) - x
    const height = Math.min(area.y + area.height, maxHeight) - y
    if (width < MIN_AREA_SIZE || height < MIN_AREA_SIZE) return null
    return { x, y, width, height }
}

/**
 * @param area — область записи в логических точках относительно экрана; null — весь экран
 */
export function planCapture(
    display: DisplayInfo,
    size: Size,
    fps: number,
    area: Rect | null,
    encoding: VideoEncoding = DEFAULT_ENCODING,
): CapturePlan {
    const { width: physicalWidth, height: physicalHeight } = display.physical
    const region = area ? clampArea(area, display) : null

    // Во сколько раз уменьшить картинку, чтобы записываемая область уложилась в выбранное качество:
    // не выше пресета и не шире кадра 16:9 этой высоты (узкая высокая и широкая низкая области тоже влезут)
    const regionPhysicalWidth = region ? region.width * display.scaleFactor : physicalWidth
    const regionPhysicalHeight = region ? region.height * display.scaleFactor : physicalHeight
    const maxWidth = Math.round(size * 16 / 9)
    const ratio = Math.min(1, size / regionPhysicalHeight, maxWidth / regionPhysicalWidth)

    const width = even(physicalWidth * ratio)
    const height = even(physicalHeight * ratio)
    const crop = region
        ? {
            x:      region.x / display.bounds.width,
            y:      region.y / display.bounds.height,
            width:  region.width / display.bounds.width,
            height: region.height / display.bounds.height,
        }
        : null

    const outputWidth = crop ? even(crop.width * width) : width
    const outputHeight = crop ? even(crop.height * height) : height
    const codecRatio = encoding.videoCodec === VideoCodec.Hevc ? HEVC_BITRATE_RATIO : 1
    const bitsPerPixel = BITS_PER_PIXEL[encoding.compression] * codecRatio
    const bitrate = Math.round(outputWidth * outputHeight * fps * bitsPerPixel)

    return {
        width,
        height,
        crop,
        outputWidth,
        outputHeight,
        videoBitsPerSecond: Math.min(Math.max(bitrate, MIN_BITRATE), MAX_BITRATE),
    }
}

/** Размер итогового видео при записи всего экрана — для подписей в настройках */
export function fullScreenOutputSize(display: DisplayInfo, size: Size) {
    const { outputWidth, outputHeight } = planCapture(display, size, 30, null)
    return { width: outputWidth, height: outputHeight }
}

/** Пресеты качества, которые имеют смысл для экрана: не выше физического разрешения */
export function sizesForDisplay(presets: Size[], display?: DisplayInfo): Size[] {
    const maxHeight = display?.physical.height ?? Number.POSITIVE_INFINITY
    const available = presets.filter(size => size <= maxHeight)
    return available.length ? available : presets.slice(-1)
}
