import { app, Tray, Menu, nativeImage, shell} from 'electron'
import { join } from 'path'
import { getWindowByName, WindowName } from '../window/utils/ipc-controller.ts'
import { screenRecorder } from '../ffmpeg.ts'
import { ExposedWinMain } from '../ipc-handlers/definitions/renderer.ts'

export class TrayManager {
    private static instance: TrayManager
    private tray: Tray | null = null
    private recordingInterval: NodeJS.Timeout | null = null
    private isDarwin = process.platform === 'darwin'

    private constructor() {}

    public static getInstance(): TrayManager {
        if (!TrayManager.instance) {
            TrayManager.instance = new TrayManager()
        }
        return TrayManager.instance
    }

    private createIcon() {
        const isDev = !app.isPackaged
        const iconFileName = 'camera.png'
        const iconPath = isDev
            ? join(process.cwd(), 'src/assets', iconFileName)
            : join(app.getAppPath(), 'src/assets', iconFileName)

        const icon = nativeImage.createFromPath(iconPath)
        if (icon.isEmpty()) return nativeImage.createFromPath(iconPath)
        return this.isDarwin
            ? icon.resize({ width: 22, height: 22 })
            : icon.resize({ width: 16, height: 16 })
    }

    public createTray(): void {
        try {
            this.tray = new Tray(this.createIcon())
            this.tray.setToolTip('DST Recorder')

            this.updateMenu()

            // На macOS клик по трею обычно показывает меню
            // На других платформах - правый клик
            if (process.platform === 'darwin') {
                this.tray.on('click', () => this.tray?.popUpContextMenu())
                this.tray.on('right-click', () => this.tray?.popUpContextMenu())
            }
        } catch (error) {
            console.error('Error creating tray:', error)
        }
    }

    private updateMenu(): void {
        if (!this.tray) return

        const contextMenu = screenRecorder.getIsRecording()
            ? this.getRecordingMenu()
            : this.getDefaultMenu()
        this.tray.setContextMenu(contextMenu)
    }

    private getDefaultMenu(): Menu {
        return Menu.buildFromTemplate([
            {
                label: '▶️ Начать запись',
                click: () => this.startRecording()
            },
            {
                type: 'separator'
            },
            {
                label: '⚙️ Настройки',
                click: () => this.openSettings()
            },
            {
                label: '⏱️ Таймер',
                click: () => this.openTimer()
            },
            {
                label: '📂 Открыть папку с записями',
                click: () => this.openRecordingsFolder()
            },
            {
                type: 'separator'
            },
            {
                label: 'Выход',
                click: () => this.quitApp()
            }
        ])
    }

    private getRecordingMenu(): Menu {
        return Menu.buildFromTemplate([
            {
                label: '⏹️ Остановить запись',
                click: () => this.stopRecording()
            },
            {
                type: 'separator'
            },
            {
                label: '⚙️ Настройки',
                click: () => this.openSettings()
            },
            {
                label: '⏱️ Таймер',
                click: () => this.openTimer()
            },
            {
                label: '📂 Открыть папку с записями',
                click: () => this.openRecordingsFolder()
            },
            {
                type: 'separator'
            },
            {
                label: 'Выход',
                click: () => this.quitApp()
            }
        ])
    }

    private async startRecording(): Promise<void> {
        try {
            // Скрываем все окна перед началом записи
            const mainWindow = getWindowByName(WindowName.Main)
            const timerWindow = getWindowByName(WindowName.Timer)

            if (mainWindow?.isVisible()) mainWindow.hide()
            if (timerWindow?.isVisible()) timerWindow.hide()

            // Начинаем запись
            const result = await screenRecorder.startRecording()
            if (result?.error) {
                console.error('Failed to start recording:', result.error)
                return
            }

            // Обновляем иконку трея
            this.updateTrayIcon(true)

            // Запускаем таймер для обновления меню и заголовка трея
            this.recordingInterval = setInterval(() => {
                this.updateMenu()
                if (process.platform === 'darwin') this.tray?.setTitle(this.getFormattedDuration())
            }, 1000)

            // Обновляем меню сразу
            this.updateMenu()

            // Показываем окно таймера
            // if (timerWindow) timerWindow.show()
        } catch (error) {
            console.error('Error starting recording:', error)
        }
    }

    private async stopRecording(): Promise<void> {
        await screenRecorder.stopRecording()

        // Останавливаем таймер
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval)
            this.recordingInterval = null
        }

        // Обновляем иконку трея и сбрасываем заголовок
        this.updateTrayIcon(false)
        if (this.isDarwin) this.tray?.setTitle('')

        // Обновляем меню
        this.updateMenu()

        // Скрываем окно таймера
        // const timerWindow = getWindowByName(WindowName.Timer)
        // if (timerWindow) timerWindow.hide()
    }

    private openSettings(): void {
        const mainWindow = getWindowByName(WindowName.Main)
        if (mainWindow) {
            mainWindow.show()
            mainWindow.webContents.send(ExposedWinMain.SHOW)
        }
    }

    private openTimer(): void {
        const timerWindow = getWindowByName(WindowName.Timer)
        if (timerWindow) timerWindow.show()
    }

    private openRecordingsFolder(): void {
        const recordingsPath = screenRecorder.getRecordingsPath()
        shell.openPath(recordingsPath).catch(err => {
            console.error('Failed to open recordings folder:', err)
        })
    }

    private quitApp(): void {
        // Если идет запись, сначала останавливаем её
        if (screenRecorder.getIsRecording()) {
            this.stopRecording().then(() => app.quit())
        } else {
            app.quit()
        }
    }

    private getFormattedDuration(): string {
        if (!screenRecorder.getIsRecording()) return '00:00'

        const startTime = screenRecorder.getRecordingStartTime()
        if (startTime === 0) return '00:00'

        const duration = Math.floor((Date.now() - startTime) / 1000)
        const minutes = Math.floor(duration / 60)
        const seconds = duration % 60

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    private updateTrayIcon(isRecording: boolean): void {
        if (!this.tray) return
        // Обновляем подсказку
        if (isRecording) this.tray.setToolTip('DST Recorder - Идет запись')
        else this.tray.setToolTip('DST Recorder')
        this.tray.setImage(this.createIcon())
    }

    public updateRecordingState(isRecording: boolean): void {
        if (isRecording) {
            // Запускаем таймер для обновления меню
            if (!this.recordingInterval) {
                this.recordingInterval = setInterval(() => this.updateMenu(), 1000)
            }
        } else {
            // Останавливаем таймер
            if (this.recordingInterval) {
                clearInterval(this.recordingInterval)
                this.recordingInterval = null
            }
        }

        this.updateTrayIcon(isRecording)
        this.updateMenu()
    }
}

export const trayManager = TrayManager.getInstance()
