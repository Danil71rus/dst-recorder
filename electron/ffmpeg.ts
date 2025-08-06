import ffmpeg from 'fluent-ffmpeg'
import { screen, systemPreferences, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { DateTime } from "luxon"
import { exec } from 'child_process'

// Утилита для ожидания
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

enum PlatformType {
    Darwin = "darwin",
    Win32 = "win32",
    Linux = "linux",
}

// Настройки для ВИДЕО входа для каждой платформы
const settingsInputOptions: { [key in NodeJS.Platform]?: string[] } = {
    // macOS
    [PlatformType.Darwin]: [
        '-capture_cursor', '1',
        '-capture_mouse_clicks', '1',
        '-pixel_format', 'uyvy422'
    ],
    // Windows
    [PlatformType.Win32]: [
        '-draw_mouse', '1'
    ],
    // Linux
    [PlatformType.Linux]: [
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
    private outputPath: string = join(homedir(), 'Desktop', 'Dst-Recorder')

    // Изменяемы переменные
    private outputPathAndFileName: string = ''
    private recordingStartTime: number = 0
    private isRecording: boolean = false
    // экран
    private screenIndex = 0
    private currentDisplay: Electron.Display | null = null

    constructor() {
        // Создаем папку для записей, если её нет
        if (!existsSync(this.outputPath)) {
            mkdirSync(this.outputPath, { recursive: true })
        }
    }

    /**
     * Динамически ищет индексы устройств AVFoundation.
     * @private
     */
    private async getAvFoundationDevices(): Promise<{ videoIndex?: string; micIndex?: string; systemAudioIndex?: string; error?: string }> {
        if (!ffmpegPath) {
            return { error: 'FFmpeg path is not configured.' }
        }
        return new Promise((resolve) => {
            // Запускаем FFmpeg с флагом для получения списка устройств
            exec(`${ffmpegPath} -f avfoundation -list_devices true -i ""`, (_error, _stdout, stderr) => {
                // ffmpeg выводит список в stderr и завершается с ошибкой, это нормальное поведение
                const output = stderr.toString();
                console.log('AVFoundation list_devices output:\n', output);

                const videoDeviceRegex = /\[AVFoundation indev @ .*\] \[(\d+)\] Capture screen \d+/;
                const micDeviceRegex = /\[AVFoundation indev @ .*\] \[(\d+)\] HUAWEI FreeBuds Pro/;
                const systemAudioRegex = /\[AVFoundation indev @ .*\] \[(\d+)\] BlackHole \d+ch/;

                const videoMatch = output.match(videoDeviceRegex);
                const micMatch = output.match(micDeviceRegex);
                const systemAudioMatch = output.match(systemAudioRegex);

                const videoIndex = videoMatch?.[1];
                const micIndex = micMatch?.[1];
                const systemAudioIndex = systemAudioMatch?.[1];

                console.log(`Discovered Device Indices: Video=${videoIndex}, Mic=${micIndex}, SystemAudio=${systemAudioIndex}`);

                if (!videoIndex) {
                    return resolve({ error: 'Could not find screen capture device. Is it in use?' });
                }
                if (!micIndex) {
                    return resolve({ error: 'Could not find microphone "HUAWEI FreeBuds Pro". Is it connected?' });
                }
                if (!systemAudioIndex) {
                    return resolve({ error: 'Could not find "BlackHole" audio device. Is it installed?' });
                }

                resolve({ videoIndex, micIndex, systemAudioIndex });
            });
        });
    }


    /**
     * Начать запись экрана
     * @param screenIndex - Индекс экрана для записи
     */
    async startRecording(screenIndex?: number): Promise<{ outputPathAndFileName?: string; error?: string }> {
        if (this.isRecording) return { error: 'Recording is already in progress' }

        try {
            const platform = process.platform

            if (platform === 'darwin') {
                const hasPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted'
                if (!hasPermission) {
                    const message = 'Screen Recording permission required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then restart the app.'
                    console.warn(message)
                    return { error: message }
                }
                console.log('Screen recording permission is granted.')
                console.log('Reminder: For system audio recording, ensure sound output is set to BlackHole in System Settings.')
            }

            const displays = screen.getAllDisplays()
            this.screenIndex = screenIndex ?? 0
            this.currentDisplay = displays[this.screenIndex]
            if (!this.currentDisplay) {
                return { error: `Display with index ${this.screenIndex} not found.` };
            }

            console.log(`Target display: Screen ${this.screenIndex}, ${this.currentDisplay.size.width}x${this.currentDisplay.size.height}`)

            const fileName = this.generateShortFilename("mp4")
            this.outputPathAndFileName = join(this.outputPath, fileName)

            this.ffmpegCommand = ffmpeg()

            if (platform === 'darwin') {
                // 1. Получаем актуальные индексы устройств
                console.log('Discovering AVFoundation devices...');
                const devices = await this.getAvFoundationDevices();

                if (devices.error) {
                    console.error('Device discovery failed:', devices.error);
                    return { error: devices.error };
                }
                const { videoIndex, micIndex, systemAudioIndex } = devices;

                // 2. Используем найденные индексы в команде
                // Вход 1: Видео с экрана
                this.ffmpegCommand
                    .input(`${videoIndex}:none`)
                    .inputFormat('avfoundation')
                    .inputFPS(30)
                    .inputOptions(settingsInputOptions.darwin || []);

                // Вход 2: Аудио с микрофона
                this.ffmpegCommand
                    .input(`none:${micIndex}`)
                    .inputFormat('avfoundation');

                // Вход 3: Системный звук (BlackHole)
                this.ffmpegCommand
                    .input(`none:${systemAudioIndex}`)
                    .inputFormat('avfoundation');

                // ---- ИСПРАВЛЕНИЕ ЗДЕСЬ ----
                // Принудительно микшируем оба аудио входа в стерео и затем объединяем их.
                // Это решает проблему с 16-канальным звуком от BlackHole.
                this.ffmpegCommand.complexFilter('[1:a]aformat=channel_layouts=stereo[mic];[2:a]aformat=channel_layouts=stereo[system];[mic][system]amix=inputs=2[a_out]');


                // Настройки вывода
                this.ffmpegCommand
                    .outputOptions([
                        '-map', '0:v',
                        '-map', '[a_out]',
                        '-c:v', 'libx264',
                        '-c:a', 'aac',
                        '-preset', 'ultrafast',
                        '-crf', '23',
                        '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart',
                        '-r', '30',
                        '-vsync', '2',
                        '-b:a', '192k'
                    ])
                    .size(`${this.currentDisplay.size.width}x${this.currentDisplay.size.height}`)
                    .output(this.outputPathAndFileName);

            } else {
                // Логика для Windows и Linux
                const inputDevice = platform === 'win32' ? 'desktop' : ':0.0';
                const inputOptions = settingsInputOptions?.[platform] || [];

                this.ffmpegCommand.input(inputDevice)
                    .inputOptions(inputOptions)
                    .inputFPS(30);

                this.ffmpegCommand
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions([
                        '-preset', 'ultrafast',
                        '-crf', '23',
                        '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart',
                        '-r', '30',
                        '-vsync', '2',
                        '-b:a', '128k'
                    ])
                    .size(`${this.currentDisplay.size.width}x${this.currentDisplay.size.height}`)
                    .output(this.outputPathAndFileName);
            }

            this.ffmpegCommand
                .on('start', (commandLine: string) => {
                    console.log('FFmpeg started with command:', commandLine)
                    this.isRecording = true
                    this.recordingStartTime = Date.now()
                })
                // .on('progress', (progress) => {
                //     console.log('Recording progress:', progress.timemark)
                // })
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
                });

            console.log('Starting FFmpeg with output:', this.outputPathAndFileName)
            this.ffmpegCommand.run()

            await sleep(1000)
            return this.isRecording
                ? { outputPathAndFileName: this.outputPathAndFileName }
                : { error: 'Failed to start recording' }
        } catch (error) {
            console.error('Error starting recording:', error)
            this.isRecording = false
            return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    async stopRecording(): Promise<{ outputPath?: string; duration?: number; error?: string }> {
        if (!this.isRecording || !this.ffmpegCommand) return { error: 'No recording in progress' }

        const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000)

        return new Promise((resolve) => {
            this.ffmpegCommand!.on('end', () => {
                console.log('FFmpeg process ended.')
                this.isRecording = false
                this.ffmpegCommand = null
                setTimeout(() => {
                    if (existsSync(this.outputPathAndFileName)) {
                        const stats = statSync(this.outputPathAndFileName)
                        if (stats.size > 0) {
                            console.log(`Video file saved: ${this.outputPathAndFileName}, size: ${stats.size} bytes`)
                            resolve({ outputPath: this.outputPathAndFileName, duration })
                        } else {
                            console.error('File was created but is empty.')
                            resolve({ error: 'Recorded file is empty.' })
                        }
                    } else {
                        console.error('Video file not found after recording stopped.')
                        resolve({ error: 'Video file was not saved properly.' })
                    }
                }, 500)
            }).on('error', (err: Error) => {
                console.error('FFmpeg error on stop:', err.message)
                // Даже при ошибке остановки, файл может быть корректно сохранен
                resolve({ outputPath: this.outputPathAndFileName, duration, error: err.message })
            })

            console.log('Attempting to stop FFmpeg gracefully by sending "q"...')
            try {
                // @ts-ignore
                const proc = this.ffmpegCommand.ffmpegProc;
                if (proc && proc.stdin && !proc.stdin.destroyed) {
                    proc.stdin.write('q\n')
                    proc.stdin.end(); // Важно закрыть stdin
                } else {
                    console.warn('Stdin not available, killing process.')
                    this.ffmpegCommand!.kill('SIGINT')
                }
            } catch (e) {
                console.error('Could not send "q" to stdin, killing process:', e)
                this.ffmpegCommand!.kill('SIGINT')
            }
        })
    }

    getRecordingStatus(): { isRecording: boolean; duration: number } {
        const duration = this.isRecording ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0
        return { isRecording: this.isRecording, duration }
    }

    getRecordingsPath(): string {
        return this.outputPath
    }

    generateShortFilename(format: string): string {
        const now = DateTime.now().toFormat('dd-MM-yyyy_HH_mm_ss')
        return `SR_${now}.${format}`
    }
}

// Создаем единственный экземпляр рекордера
export const screenRecorder = new ScreenRecorder()
