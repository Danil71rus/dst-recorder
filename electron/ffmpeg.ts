import ffmpeg from 'fluent-ffmpeg'
import { screen, systemPreferences, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { DateTime } from "luxon"
import { sleep } from "../src/utils/utils.ts";

enum PlatformType {
    Darwin = "darwin",
    Win32 = "win32",
    Linux = "linux",
}

const settingsInputOptions: { [key in NodeJS.Platform]?: string[] } = {
    // macOS
    [PlatformType.Darwin]: [
        '-f', 'avfoundation',
        '-capture_cursor', '1',
        '-capture_mouse_clicks', '1',
        '-pixel_format', 'uyvy422',
        '-framerate', '30'
    ],
    // Windows
    [PlatformType.Win32]: [
        '-f', 'gdigrab',
        '-framerate', '30',
        '-draw_mouse', '1'
    ],
    // Linux
    [PlatformType.Linux]: [
        '-f', 'x11grab',
        '-framerate', '30',
        '-draw_mouse', '1'
    ]
}

// Установка пути к FFmpeg с учетом production/development
const getFfmpegPath = () => {
    try {
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
        let ffmpegPath = ffmpegInstaller.path

        // В production режиме FFmpeg находится в unpacked папке
        if (app.isPackaged) {
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
        }

        console.log('FFmpeg path:', ffmpegPath)
        return ffmpegPath
    } catch (error) {
        console.error('Error getting FFmpeg path:', error)
        return null
    }
}

const ffmpegPath = getFfmpegPath()
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath)
} else {
    console.error('FFmpeg path not found!')
}

export class ScreenRecorder {
    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null
    private outputPath: string = join(homedir(), 'Desktop', 'Dst-recorder')
    private outputPathAndFileName: string = ''
    private recordingStartTime: number = 0
    private isRecording: boolean = false
    private size = {
        width:  1920,
        height: 1080,
    }

    constructor() {
        // Создаем папку для записей, если её нет
        if (!existsSync(this.outputPath)) {
            mkdirSync(this.outputPath, { recursive: true })
        }
    }

    /**
     * Начать запись экрана
     * @param screenIndex - Индекс экрана для записи (опционально)
     */
    async startRecording(screenIndex?: number): Promise<{ outputPath?: string; error?: string }> {
        if (this.isRecording) return { error: 'Recording is already in progress' }

        try {
            // Для macOS проверяем разрешения
            if (process.platform === 'darwin') {
                // Проверяем разрешения на запись экрана
                const hasPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted'

                if (!hasPermission) {
                    console.warn('Screen Recording permission not granted!')
                    console.warn('Please grant Screen Recording permission to this app:')
                    console.warn('System Preferences > Security & Privacy > Privacy > Screen Recording')

                    // Возвращаем ошибку с инструкциями
                    return {
                        error: 'Screen Recording permission required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then restart the app.'
                    }
                }
            }

            // Получаем информацию о всех экранах
            const displays = screen.getAllDisplays()
            console.log(`Found ${displays.length} displays`)
            displays.forEach((display, index) => {
                console.log(`Display ${index}: ${display.size.width}x${display.size.height}, primary: ${display.id === screen.getPrimaryDisplay().id}`)
            })

            // Находим нужный экран для записи
            this.size = displays[screenIndex ?? 0].size
            console.log(`Target display for recording: Screen ${screenIndex ?? 0}, ${this.size.width}x${this.size.height}`)

            // Генерируем имя файла с временной меткой
            const fileName = this.generateShortFilename("mp4")
            this.outputPathAndFileName = join(this.outputPath, fileName)

            // Определяем устройство захвата и формат в зависимости от платформы
            const platform = process.platform
            const inputOptions = settingsInputOptions?.[platform] || settingsInputOptions.linux
            if (!inputOptions?.length) {
                console.error("inputOptions")
                return { error: "inputOptions" }
            }

            // Создаем команду FFmpeg
            this.ffmpegCommand = ffmpeg()

            if (platform === 'darwin') {
                // Для macOS нужно использовать "Capture screen X" для записи экрана
                // Для записи аудио: ":0" - микрофон, ":default" - системное аудио (требует виртуальный драйвер)
                // Индекс 0 - основной экран, 1 - первый внешний монитор
                const screenToCapture = screenIndex
                    ? `Capture screen ${screenIndex}:0`
                    : "Capture screen 0:0"  // По умолчанию записываем первый экран
                this.ffmpegCommand.input(screenToCapture)
                console.log(`Using AVFoundation input: "${screenToCapture}" (with microphone audio)`)
            } else if (platform === 'win32') {
                // Для Windows захватываем весь рабочий стол
                this.ffmpegCommand.input('desktop')
            } else {
                // Для Linux захватываем экран с координат 0,0
                this.ffmpegCommand.input(':0.0')
            }

            // Добавляем опции ввода
            this.ffmpegCommand.inputOptions(inputOptions)

            // Настройки вывода для MP4
            this.ffmpegCommand
                .videoCodec('libx264')
                .audioCodec('aac') // Добавляем аудио кодек
                .fps(30) // Явно указываем выходной FPS
                .outputOptions([
                    '-preset', 'ultrafast',
                    '-crf', '23',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    '-r', '30', // Принудительно устанавливаем выходной FPS
                    '-vsync', '2', // Избегаем дублирования кадров
                    '-b:a', '128k' // Битрейт аудио
                ])
                .size(`${this.size.width}x${this.size.height}`)
                .output(this.outputPathAndFileName)

            // Обработчики событий
            this.ffmpegCommand
                .on('start', (commandLine: string) => {
                    console.log('FFmpeg started with command:', commandLine)
                    this.isRecording = true
                    this.recordingStartTime = Date.now()
                })
                .on('progress', (progress) => {
                    console.log('Recording progress:', progress)
                })
                .on('end', () => {
                    console.log('Recording finished successfully')
                    this.isRecording = false
                })
                .on('error', (err: Error) => {
                    console.error('FFmpeg error during recording:', err)
                    this.isRecording = false
                })
                .on('stderr', (stderrLine) => {
                    console.log('FFmpeg stderr:', stderrLine)
                })

            // Запускаем запись
            console.log('Starting FFmpeg with output:', this.outputPathAndFileName)
            this.ffmpegCommand.run()

            // Ждем немного, чтобы убедиться, что запись началась
            await sleep(1000)
            return this.isRecording
                ? { outputPath: this.outputPathAndFileName }
                : { error: 'Failed to start recording' }
        } catch (error) {
            console.error('Error starting recording:', error)
            this.isRecording = false
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    /**
     * Остановить запись
     */
    async stopRecording(): Promise<{ outputPath?: string; duration?: number; error?: string }> {
        console.log('stopRecording called, isRecording:', this.isRecording)

        if (!this.isRecording || !this.ffmpegCommand) {
            return { error: 'No recording in progress' }
        }

        try {
            // Вычисляем продолжительность записи
            const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000)
            console.log('Recording duration:', duration, 'seconds')

            return new Promise((resolve) => {
                if (!this.ffmpegCommand) {
                    resolve({ error: 'No ffmpeg command found' })
                    return
                }

                let isResolved = false
                const resolveOnce = (result: any) => {
                    if (!isResolved) {
                        isResolved = true
                        resolve(result)
                    }
                }

                // Устанавливаем обработчик завершения
                this.ffmpegCommand.on('end', () => {
                    console.log('FFmpeg process ended normally')
                    this.isRecording = false
                    this.ffmpegCommand = null

                    // Проверяем, что файл существует и имеет размер
                    setTimeout(() => {
                        if (existsSync(this.outputPathAndFileName)) {
                            const stats = statSync(this.outputPathAndFileName)
                            console.log(`Video file saved: ${this.outputPathAndFileName}, size: ${stats.size} bytes`)
                            resolveOnce({
                                success: true,
                                outputPath: this.outputPathAndFileName,
                                duration: duration
                            })
                        } else {
                            console.error('Video file not found after recording stopped')
                            resolveOnce({
                                success: false,
                                error: 'Video file was not saved properly'
                            })
                        }
                    }, 500) // Даём 500ms на финализацию файла
                })

                // Устанавливаем обработчик ошибок
                this.ffmpegCommand.on('error', (err: Error) => {
                    console.log('FFmpeg error during stop:', err.message)

                    // Проверяем тип ошибки
                    const isNormalTermination =
                        err.message.includes('SIGKILL') ||
                        err.message.includes('SIGINT') ||
                        err.message.includes('SIGTERM') ||
                        err.message.includes('signal 2') ||
                        err.message.includes('signal 15') ||
                        err.message.includes('Exiting normally') ||
                        err.message.includes('ffmpeg exited with code');

                    if (isNormalTermination) {
                        console.log('Recording stopped with expected termination signal')
                        this.isRecording = false
                        this.ffmpegCommand = null

                        // Проверяем файл после небольшой задержки
                        setTimeout(() => {
                            if (existsSync(this.outputPathAndFileName)) {
                                const stats = statSync(this.outputPathAndFileName)
                                console.log(`Video file verified after error: ${this.outputPathAndFileName}, size: ${stats.size} bytes`)
                                resolveOnce({
                                    success: true,
                                    outputPath: this.outputPathAndFileName,
                                    duration: duration
                                })
                            } else {
                                console.error('Video file not found after termination')
                                resolveOnce({
                                    success: false,
                                    error: 'Video file was not saved'
                                })
                            }
                        }, 1000)
                    } else {
                        console.error('Unexpected error stopping recording:', err)
                        this.isRecording = false
                        this.ffmpegCommand = null
                        resolveOnce({
                            success: false,
                            error: err.message
                        })
                    }
                })

                // Для корректного сохранения видео используем inputOption для writeInput
                console.log('Stopping FFmpeg recording...')

                // Сохраняем текущий файл перед остановкой
                const currentOutputPath = this.outputPathAndFileName

                // Используем ffmpegCommand.ffmpegProc для доступа к процессу
                try {
                    // @ts-ignore - доступ к внутреннему процессу
                    const proc = this.ffmpegCommand.ffmpegProc
                    if (proc && proc.stdin && !proc.stdin.destroyed) {
                        console.log('Sending q to FFmpeg stdin...')
                        proc.stdin.write('q\n')
                    }
                } catch (e) {
                    console.log('Could not send q to stdin:', e)
                }

                // Даём время на корректное завершение (2 секунды)
                setTimeout(() => {
                    if (this.isRecording && this.ffmpegCommand) {
                        console.log('FFmpeg did not stop gracefully, sending SIGINT...')
                        // Используем SIGINT для более корректного завершения
                        this.ffmpegCommand.kill('SIGINT')

                        // Если через ещё 2 секунды не остановился, используем SIGTERM
                        setTimeout(() => {
                            if (this.isRecording && this.ffmpegCommand) {
                                console.log('Sending SIGTERM...')
                                this.ffmpegCommand.kill('SIGTERM')

                                // Последний шанс - SIGKILL
                                setTimeout(() => {
                                    if (this.isRecording) {
                                        console.log('Force resolving as success')
                                        this.isRecording = false
                                        this.ffmpegCommand = null
                                        resolveOnce({
                                            success: true,
                                            outputPath: currentOutputPath,
                                            duration: duration
                                        })
                                    }
                                }, 1000)
                            }
                        }, 2000)
                    }
                }, 2000)
            })
        } catch (error) {
            console.error('Error in stopRecording:', error)
            this.isRecording = false
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    /**
     * Получить статус записи
     */
    getRecordingStatus(): { isRecording: boolean; duration: number } {
        const duration = this.isRecording
            ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
            : 0

        return {
            isRecording: this.isRecording,
            duration: duration
        }
    }

    /**
     * Получить путь к папке с записями
     */
    getRecordingsPath(): string {
        return this.outputPath
    }

    generateShortFilename(format: string): string {
        const now = DateTime.now().toFormat('dd-MM-yyyy_HH_mm')
        return `SR_${now}.${format}`
    }
}

// Создаем единственный экземпляр рекордера
export const screenRecorder = new ScreenRecorder()
