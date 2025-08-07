import ffmpeg from 'fluent-ffmpeg'
import { app, systemPreferences } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { DateTime } from "luxon"
import { exec } from 'child_process'
import FfmpegStatic from 'ffmpeg-ffprobe-static'
import { sleep } from "../src/utils/utils"
import { FfmpegDevice, FfmpegDeviceLists, FfmpegSettings, getDefaultSettings } from "./difenition/ffmpeg.ts"
import { ExposedWinMain } from "./ipc-handlers/definitions/renderer.ts"
import { getWindowByName, WindowName } from "./window/utils/ipc-controller.ts"


export class ScreenRecorder {
    private static instance: ScreenRecorder

    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null
    private outputPathAndFileName: string = ''
    private recordingStartTime: number = 0
    private isRecording: boolean = false

    private settings: FfmpegSettings = {
        ...getDefaultSettings(),
        outputPath: join(homedir(), 'Desktop', 'Dst-Recorder'),
    }

    private readonly ffmpegBinaryPath: string | null = null;

    private constructor() {
        if (!existsSync(this.settings.outputPath)) {
            mkdirSync(this.settings.outputPath, { recursive: true });
        }
        this.ffmpegBinaryPath = this.initializeFfmpegPath();
        if (this.ffmpegBinaryPath) {
            ffmpeg.setFfmpegPath(this.ffmpegBinaryPath);
        } else {
            console.error('CRITICAL: FFmpeg binary not found. Recording will fail.');
        }

        setTimeout(async () => {
            const device = await this.getSeparatedDevices()
            this.setSettings({
                ...this.settings,
                audio: device.audio.find(item => item.name.startsWith("Recorder-Input")) || device.audio[0],
                video: device.video.find(item => item.name.startsWith("Capture screen 0")) || device.video[0],
            })
        }, 1000)
    }

    public static getInstance(): ScreenRecorder {
        if (!ScreenRecorder.instance) {
            ScreenRecorder.instance = new ScreenRecorder();
        }
        return ScreenRecorder.instance;
    }

    private initializeFfmpegPath(): string | null {
        let ffmpegPath: string | null = null;

        if (app.isPackaged) {
            // В собранной версии FFmpeg находится в app.asar.unpacked
            const platform = process.platform;
            let ffmpegName = 'ffmpeg';

            // На Windows файл имеет расширение .exe
            if (platform === 'win32') {
                ffmpegName = 'ffmpeg.exe';
            }

            console.log('App is packaged. Looking for FFmpeg...');
            console.log('Platform:', platform);
            console.log('Resource path:', process.resourcesPath);

            // Пробуем найти FFmpeg в разных возможных местах
            // Порядок важен - сначала проверяем наиболее вероятные места
            const possiblePaths = [
                // Путь где FFmpeg был найден в собранной версии
                join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-ffprobe-static', ffmpegName),
                // Стандартный путь для extraResources
                join(process.resourcesPath, 'bin', ffmpegName),
            ];

            console.log('Checking paths:');
            for (const path of possiblePaths) {
                console.log('- Checking:', path, 'Exists:', existsSync(path));
                if (existsSync(path)) {
                    ffmpegPath = path;
                    break;
                }
            }
        } else {
            // В режиме разработки используем путь из ffmpeg-ffprobe-static
            ffmpegPath = FfmpegStatic.ffmpegPath;
        }

        if (ffmpegPath && existsSync(ffmpegPath)) {
            console.log('FFmpeg path successfully set to:', ffmpegPath);
            // Убедимся, что файл исполняемый
            try {
                require('fs').accessSync(ffmpegPath, require('fs').constants.X_OK);
                console.log('FFmpeg is executable');
            } catch (e) {
                console.error('FFmpeg is not executable:', e);
            }
            return ffmpegPath;
        }

        console.error('CRITICAL: FFmpeg binary not found');
        return null;
    }

    public getSeparatedDevices(): Promise<FfmpegDeviceLists> {
        // Убедитесь, что путь к ffmpeg правильный, особенно для собранного приложения
        const ffmpegPath = FfmpegStatic.ffmpegPath;
        if (!ffmpegPath) return Promise.resolve({ video: [], audio: [] });

        const command = `"${ffmpegPath}" -f avfoundation -list_devices true -i ""`;

        return new Promise((resolve) => {
            exec(command, (_error, _stdout, stderr) => {
                const lines = stderr.split('\n')
                const result: FfmpegDeviceLists = {
                    video: [],
                    audio: [],
                };

                let currentSection: 'video' | 'audio' | null = null

                for (const line of lines) {
                    // Определяем, в какой секции мы находимся
                    if (line.includes('AVFoundation video devices:')) {
                        currentSection = 'video'
                        continue; // Переходим к следующей строке
                    } else if (line.includes('AVFoundation audio devices:')) {
                        currentSection = 'audio'
                        continue // Переходим к следующей строке
                    }

                    if (!currentSection) continue

                    // Парсим строку с устройством
                    const deviceMatch = line.match(/\[(\d+)\]\s(.*)/)
                    if (deviceMatch && deviceMatch[1] && deviceMatch[2]) {
                        const device: FfmpegDevice = {
                            index: parseInt(deviceMatch[1], 10),
                            name:  deviceMatch[2].trim(),
                        }

                        if (currentSection === 'video') result.video.push(device)
                        else result.audio.push(device)
                    }
                }

                resolve(result)
            })
        })
    }

    async startRecording(): Promise<{ outputPathAndFileName?: string; error?: string }> {
        if (this.isRecording) return { error: 'Recording is already in progress' };
        if (!this.ffmpegBinaryPath) return { error: 'FFmpeg is not available.' };

        try {
            if (process.platform !== 'darwin') return { error: 'This recorder is currently configured for macOS only.' }

            const hasPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted'
            if (!hasPermission) return { error: 'Screen Recording permission required.' }

            if (!this.settings.audio || !this.settings.video) return { error: `Display with index not found.` }


            this.outputPathAndFileName = join(this.settings.outputPath, this.generateShortFilename())
            this.ffmpegCommand = ffmpeg()
                // ---- МАКСИМАЛЬНО ПРОСТАЯ КОМАНДА ----
                // Один вход для видео, один для УЖЕ синхронизированного аудио
                .input(`${this.settings.video.index}:${this.settings.audio.index}`)
                .inputFormat('avfoundation')
                .inputFPS(this.settings.fps)
                .inputOptions(['-thread_queue_size', '2048', '-capture_cursor', '1'])
                // Фильтр для смешивания каналов и увеличения громкости микрофона
                .audioFilter([
                    // Смешиваем многоканальный звук в стерео.
                    // Канал 0 (микрофон) усиливаем в 2.5 раза.
                    // Канал 2 (системный звук) оставляем как есть.
                    'pan=stereo|c0=2.5*c0|c1=1.0*c2'
                ])
                .outputOptions([
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '23',
                    '-pix_fmt', 'yuv420p',
                    '-s', `${this.settings.size.width}x${this.settings.size.height}`,
                    '-r', `${this.settings.fps}`,
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-y'
                ])
                .output(this.outputPathAndFileName);

            this.ffmpegCommand
                .on('start', (cmd) => { console.log('FFmpeg started:', cmd); this.isRecording = true; this.recordingStartTime = Date.now(); })
                .on('end', () => { console.log('Recording finished.'); this.isRecording = false; })
                .on('error', (err) => { console.error('FFmpeg error:', err.message); this.isRecording = false; })
                .on('stderr', (line) => { if (!line.includes('frame=')) console.log('FFmpeg:', line); });

            this.ffmpegCommand.run();
            await sleep(3000);
            return { outputPathAndFileName: this.outputPathAndFileName };
        } catch (error) {
            console.error('Start recording error:', error);
            return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    // ... stopRecording и остальные методы без изменений ...
    async stopRecording(): Promise<{ outputPath?: string; duration?: number; error?: string }> {
        if (!this.isRecording || !this.ffmpegCommand) return { error: 'No recording in progress' }
        const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000)
        return new Promise((resolve) => {
            this.ffmpegCommand!
                .on('end', () => {
                    this.isRecording = false;
                    this.ffmpegCommand = null;
                    setTimeout(() => {
                        if (existsSync(this.outputPathAndFileName) && statSync(this.outputPathAndFileName).size > 0) {
                            resolve({ outputPath: this.outputPathAndFileName, duration });
                        } else {
                            resolve({ error: 'Output file is missing or empty.' });
                        }
                    }, 500);
                })
                .on('error', (err: Error) => resolve({ outputPath: this.outputPathAndFileName, duration, error: err.message }));

            try {
                // @ts-ignore
                this.ffmpegCommand.ffmpegProc.stdin.write('q\n');
            } catch (e) {
                this.ffmpegCommand?.kill('SIGINT');
            }
        });
    }

    getRecordingStatus(): { isRecording: boolean; duration: number } {
        const duration = this.isRecording ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0
        return { isRecording: this.isRecording, duration }
    }

    getRecordingsPath(): string { return this.settings.outputPath }

    getSettings() {
        return this.settings
    }

    setSettings(settings?: FfmpegSettings) {
        if (!settings) return
        this.settings = settings
        getWindowByName(WindowName.Main)?.webContents.send(ExposedWinMain.SHOW)
    }

    generateShortFilename(): string {
        return `SR_${DateTime.now().toFormat('dd-MM-yyyy_HH_mm_ss')}.mp4`;
    }
}

export const screenRecorder = ScreenRecorder.getInstance();
