import ffmpeg from 'fluent-ffmpeg'
import { screen, systemPreferences, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { DateTime } from "luxon"
import { exec } from 'child_process'
import FfmpegStatic from 'ffmpeg-ffprobe-static'
import { sleep } from "../src/utils/utils"

export class ScreenRecorder {
    private static instance: ScreenRecorder;

    private ffmpegCommand: ffmpeg.FfmpegCommand | null = null;
    private readonly outputPath: string = join(homedir(), 'Desktop', 'Dst-Recorder');
    private outputPathAndFileName: string = '';
    private recordingStartTime: number = 0;
    private isRecording: boolean = false;
    private screenIndex = 0;
    private currentDisplay: Electron.Display | null = null;
    private readonly ffmpegBinaryPath: string | null = null;

    private constructor() {
        if (!existsSync(this.outputPath)) {
            mkdirSync(this.outputPath, { recursive: true });
        }
        this.ffmpegBinaryPath = this.initializeFfmpegPath();
        if (this.ffmpegBinaryPath) {
            ffmpeg.setFfmpegPath(this.ffmpegBinaryPath);
        } else {
            console.error('CRITICAL: FFmpeg binary not found. Recording will fail.');
        }
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

    // Метод поиска теперь ищет наше новое Агрегатное устройство
    private async getDevices(): Promise<{ videoIndex?: string; audioIndex?: string; error?: string }> {
        if (!this.ffmpegBinaryPath) return { error: 'FFmpeg path is not configured.' };
        return new Promise((resolve) => {
            exec(`"${this.ffmpegBinaryPath}" -f avfoundation -list_devices true -i ""`, (_error, _stdout, stderr) => {
                const output = stderr.toString();

                const videoDeviceRegex = /\[AVFoundation indev @ .*\] \[(\d+)\] Capture screen \d+/;
                // Ищем новое устройство по имени, которое вы ему дали
                const audioDeviceRegex = /\[AVFoundation indev @ .*\] \[(\d+)\] Recorder-Input/;

                const videoMatch = output.match(videoDeviceRegex);
                const audioMatch = output.match(audioDeviceRegex);

                const videoIndex = videoMatch?.[1];
                const audioIndex = audioMatch?.[1];

                if (!videoIndex) return resolve({ error: 'Could not find screen capture device.' });
                if (!audioIndex) return resolve({ error: 'Could not find Aggregate Device named "Recorder-Input". Please check Audio MIDI Setup.' });

                resolve({ videoIndex, audioIndex });
            });
        });
    }

    async startRecording(screenIndex?: number): Promise<{ outputPathAndFileName?: string; error?: string }> {
        if (this.isRecording) return { error: 'Recording is already in progress' };
        if (!this.ffmpegBinaryPath) return { error: 'FFmpeg is not available.' };

        try {
            if (process.platform !== 'darwin') return { error: 'This recorder is currently configured for macOS only.' };
            const hasPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted';
            if (!hasPermission) return { error: 'Screen Recording permission required.' };

            const displays = screen.getAllDisplays();
            this.screenIndex = screenIndex ?? 0;
            this.currentDisplay = displays[this.screenIndex];
            if (!this.currentDisplay) return { error: `Display with index ${this.screenIndex} not found.` };

            const { width, height } = this.currentDisplay.size;
            this.outputPathAndFileName = join(this.outputPath, this.generateShortFilename());

            console.log('Discovering devices...');
            const devices = await this.getDevices();
            if (devices.error || !devices.videoIndex || !devices.audioIndex) {
                return { error: devices.error || 'Failed to discover required devices.' };
            }

            const { videoIndex, audioIndex } = devices;

            this.ffmpegCommand = ffmpeg()
                // ---- МАКСИМАЛЬНО ПРОСТАЯ КОМАНДА ----
                // Один вход для видео, один для УЖЕ синхронизированного аудио
                .input(`${videoIndex}:${audioIndex}`)
                .inputFormat('avfoundation')
                .inputFPS(30)
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
                    '-s', `${width}x${height}`,
                    '-r', '30',
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

    getRecordingsPath(): string { return this.outputPath; }

    generateShortFilename(): string {
        return `SR_${DateTime.now().toFormat('dd-MM-yyyy_HH_mm_ss')}.mp4`;
    }
}

export const screenRecorder = ScreenRecorder.getInstance();
