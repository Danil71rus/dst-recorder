import { computed, ref } from "vue"
import type { ComboboxItem } from "@/components/combobox/definitions/dst-combobox"
import {
    AfterRecordingAction,
    Compression,
    COUNTDOWN_OPTIONS,
    describeAudio,
    DisplayInfo,
    HotkeyAction,
    HotkeyStatus,
    getDefaultSettings,
    normalizeSize,
    RecorderSettings,
    SIZE_PRESETS,
    sizeTitleMap,
    VideoCodec,
} from "@/deinitions/recorder.ts"
import { isHevcSupported } from "@/capture/video-mime.ts"
import { fullScreenOutputSize, sizesForDisplay } from "@/recorder/capture-plan.ts"
import { ExposedWinMain, ExposedWinTimer } from "@/window/ipc-handlers/definitions/renderer"
import { useMicrophones } from "@/composables/microphones.ts"

export enum IpcScope {
    Main = "main",
    Timer = "timer",
}

interface UseRecordingSettingsOptions {
    autoSaveOnChange?: boolean
    ipcScope?:         IpcScope.Main | IpcScope.Timer
}

/** Состояние окна настроек: выбор экрана, качества, микрофона и звука компьютера */
export function useRecordingSettings(options: UseRecordingSettingsOptions = {}) {
    const { autoSaveOnChange = false, ipcScope = IpcScope.Main } = options
    const saveChannel = ipcScope === IpcScope.Timer ? ExposedWinTimer.SAVE_SETTINGS : ExposedWinMain.SAVE_SETTINGS

    const displays = ref<DisplayInfo[]>([])
    const currentState = ref<RecorderSettings>(getDefaultSettings())
    const { micList, labelOf } = useMicrophones(currentState)

    // Монитор из настроек; если он отключён, запись пойдёт на основной — его и показываем
    const currentDisplay = computed(() => {
        return displays.value.find(display => display.id === currentState.value.displayId) || displays.value[0]
    })

    const selectedVideo = computed({
        get: () => `${currentDisplay.value?.id ?? ""}`,
        set: (displayId: string) => {
            const display = displays.value.find(item => `${item.id}` === displayId)
            if (!display) return
            currentState.value.displayId = display.id
            setSize(currentState.value.defSize)
            tryAutoSave()
        },
    })

    const screensList = computed((): ComboboxItem[] => {
        return displays.value.map((display) => {
            const { width, height } = fullScreenOutputSize(display, currentState.value.defSize)
            return {
                id:       `${display.id}`,
                title:    display.label,
                subtitle: `${width} × ${height}`,
            }
        })
    })

    const sizesCombobox = computed((): ComboboxItem[] => {
        return sizesForDisplay(SIZE_PRESETS, currentDisplay.value).map(size => ({
            id:    size,
            title: sizeTitleMap[size],
        }))
    })

    const selectedDefSize = computed({
        get: () => `${currentState.value.defSize}`,
        set: (size: string) => {
            setSize(Number(size))
            tryAutoSave()
        },
    })

    const compressionList: ComboboxItem[] = [
        {
            id:       Compression.Quality,
            title:    "Высокое качество",
            subtitle: "Чётче в движении, файлы больше",
        },
        {
            id:    Compression.Balanced,
            title: "Сбалансированное",
        },
        {
            id:       Compression.Compact,
            title:    "Компактное",
            subtitle: "Файлы меньше, быстрые сцены мягче",
        },
    ]
    const selectedCompression = computed({
        get: () => currentState.value.compression,
        set: (compression: string) => {
            currentState.value.compression = compression as Compression
            tryAutoSave()
        },
    })

    // HEVC предлагается, только если этот Chromium умеет им кодировать (нужен аппаратный кодировщик)
    const codecList: ComboboxItem[] = [
        {
            id:       VideoCodec.H264,
            title:    "H.264",
            subtitle: "Открывается везде",
        },
        ...(isHevcSupported()
            ? [{
                id:       VideoCodec.Hevc,
                title:    "HEVC (H.265)",
                subtitle: "Файлы меньше, но открывается не во всех плеерах и браузерах",
            }]
            : []),
    ]
    const selectedCodec = computed({
        get: () => currentState.value.videoCodec,
        set: (codec: string) => {
            currentState.value.videoCodec = codec as VideoCodec
            tryAutoSave()
        },
    })

    const selectedMic = computed({
        get: () => currentState.value.micDeviceId,
        set: (deviceId: string) => {
            currentState.value.micDeviceId = deviceId
            currentState.value.micLabel = labelOf(deviceId)
            tryAutoSave()
        },
    })

    const recordSystemAudio = computed({
        get: () => currentState.value.recordSystemAudio,
        set: (value: boolean) => {
            currentState.value.recordSystemAudio = value
            tryAutoSave()
        },
    })

    const showBorder = computed({
        get: () => currentState.value.showBorder,
        set: (value: boolean) => {
            currentState.value.showBorder = value
            tryAutoSave()
        },
    })

    // Сочетание, которое не удалось зарегистрировать (занято другим приложением), подсвечивается в настройках
    const hotkeyStatus = ref<HotkeyStatus>({ toggleRecording: true, togglePause: true })

    const hotkeyModel = (action: HotkeyAction) => computed({
        get: () => currentState.value.hotkeys[action],
        set: (accelerator: string) => {
            currentState.value.hotkeys = { ...currentState.value.hotkeys, [action]: accelerator }
            tryAutoSave()
        },
    })
    const hotkeyToggleRecording = hotkeyModel("toggleRecording")
    const hotkeyTogglePause = hotkeyModel("togglePause")

    const countdownList: ComboboxItem[] = COUNTDOWN_OPTIONS.map(seconds => ({
        id:    `${seconds}`,
        title: seconds ? `${seconds} сек` : "Без отсчёта",
    }))
    const selectedCountdown = computed({
        get: () => `${currentState.value.countdownSeconds}`,
        set: (seconds: string) => {
            currentState.value.countdownSeconds = Number(seconds)
            tryAutoSave()
        },
    })

    const afterRecordingList: ComboboxItem[] = [
        {
            id:       AfterRecordingAction.Preview,
            title:    "Показать миниатюру",
            subtitle: "Длительность, размер и кнопки «Открыть», «Копировать», «Удалить»",
        },
        {
            id:    AfterRecordingAction.Finder,
            title: "Показать файл в Finder",
        },
        {
            id:    AfterRecordingAction.Nothing,
            title: "Ничего не делать",
        },
    ]
    const selectedAfterRecording = computed({
        get: () => currentState.value.afterRecording,
        set: (action: string) => {
            currentState.value.afterRecording = action as AfterRecordingAction
            tryAutoSave()
        },
    })

    function setOutputPath(path: string) {
        currentState.value.outputPath = path
        tryAutoSave()
    }

    const selectedDefSizeName = computed(() => sizeTitleMap[normalizeSize(currentState.value.defSize)])
    const selectedVideoName = computed(() => currentDisplay.value?.label || "")
    const selectedAudioName = computed(() => describeAudio(currentState.value))

    /** Качество не выше разрешения экрана: на мониторе 1080p пресет 4K превращается в 1080p */
    function setSize(size: number) {
        const available = sizesForDisplay(SIZE_PRESETS, currentDisplay.value)
        const wanted = normalizeSize(size)
        currentState.value.defSize = available.includes(wanted) ? wanted : available[0] ?? wanted
    }

    /** newSettings — рассылка из main после сохранения; без них (открыли окно) настройки запрашиваются */
    async function updateSettings({ newSettings }: { newSettings?: unknown } = {}) {
        const [settings, displayList] = await Promise.all([
            (newSettings as RecorderSettings | undefined)
                ?? window.ipcRenderer?.invoke<RecorderSettings>(ExposedWinMain.GET_SETTINGS),
            window.ipcRenderer?.invoke<DisplayInfo[]>(ExposedWinMain.GET_DISPLAYS),
        ])
        if (displayList?.length) displays.value = displayList
        if (settings) currentState.value = { ...settings, hotkeys: { ...settings.hotkeys } }

        const status = await window.ipcRenderer?.invoke<HotkeyStatus>(ExposedWinMain.GET_HOTKEY_STATUS)
        if (status) hotkeyStatus.value = status
    }

    async function save() {
        // Через IPC можно передать только обычный объект. Поверхностная копия не годится: вложенный объект
        // (hotkeys) остаётся реактивным Proxy, IPC отказывается его копировать — и настройки не сохраняются
        const plain = JSON.parse(JSON.stringify(currentState.value)) as RecorderSettings
        await window.ipcRenderer?.invoke(saveChannel, plain)
    }

    function tryAutoSave() {
        if (!autoSaveOnChange) return
        save().catch(error => console.error("[Settings] Failed to save:", error))
    }

    return {
        currentState,
        currentDisplay,
        sizesCombobox,
        selectedDefSize,
        compressionList,
        selectedCompression,
        codecList,
        selectedCodec,
        selectedVideo,
        selectedMic,
        recordSystemAudio,
        showBorder,
        screensList,
        micList,
        selectedDefSizeName,
        selectedVideoName,
        selectedAudioName,
        hotkeyStatus,
        hotkeyToggleRecording,
        hotkeyTogglePause,
        countdownList,
        selectedCountdown,
        afterRecordingList,
        selectedAfterRecording,
        setOutputPath,
        save,
        updateSettings,
    }
}
