<template>
    <div
        class="main-view"
        @mousedown="drag.startDrag"
    >
        <div class="container">
            <header class="window-header">
                <h1 class="window-title">
                    Настройки записи
                </h1>
            </header>

            <div class="scrollable-content">
                <div class="sections">
                    <div class="column">
                        <dst-settings-section
                            title="Экран"
                            description="Что будет записано и в каком качестве"
                        >
                            <dst-combobox
                                v-model="selectedVideo"
                                :items="screensList"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                placeholder="Экран"
                                label="Монитор"
                            />

                            <dst-screen-preview
                                :src="screenPreview"
                                :is-loading="isPreviewLoading"
                                :ratio="screenRatio"
                            />

                            <dst-combobox
                                v-model="selectedDefSize"
                                :items="sizesCombobox"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                placeholder="Качество"
                                label="Качество"
                            />

                            <dst-combobox
                                v-model="selectedCompression"
                                :items="compressionList"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                label="Сжатие"
                            />

                            <dst-combobox
                                v-model="selectedCodec"
                                :items="codecList"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                label="Кодек"
                            />

                            <dst-switch
                                v-model="showBorder"
                                label="Подсвечивать экран рамкой во время записи"
                            />
                        </dst-settings-section>

                        <dst-settings-section
                            title="Сохранение"
                            description="Куда складывать записи и что показать после"
                        >
                            <dst-output-path-picker
                                :path="currentState.outputPath"
                                label="Папка"
                                @pick="pickOutputPath"
                            />

                            <dst-combobox
                                v-model="selectedAfterRecording"
                                :items="afterRecordingList"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                label="После записи"
                            />
                        </dst-settings-section>
                    </div>

                    <div class="column">
                        <dst-settings-section
                            title="Звук"
                            description="Ваш голос и звук компьютера — одной дорожкой"
                        >
                            <dst-microphone-picker
                                v-model="selectedMic"
                                :mic-label="currentState.micLabel"
                                :items="micList"
                                :monitoring="isPageVisible"
                            />

                            <dst-switch
                                v-model="recordSystemAudio"
                                label="Записывать звук компьютера"
                            />
                        </dst-settings-section>

                        <dst-settings-section
                            title="Управление"
                            description="Сочетания работают из любого приложения"
                        >
                            <dst-hotkey-input
                                v-model="hotkeyToggleRecording"
                                label="Начать / остановить запись"
                                :is-conflict="!hotkeyStatus.toggleRecording"
                            />

                            <dst-hotkey-input
                                v-model="hotkeyTogglePause"
                                label="Пауза / продолжить"
                                :is-conflict="!hotkeyStatus.togglePause"
                            />

                            <dst-combobox
                                v-model="selectedCountdown"
                                :items="countdownList"
                                :display-type="ComboboxDisplayType.Right"
                                :variant="ComboboxStyle.Secondary"
                                label="Отсчёт перед записью"
                            />
                        </dst-settings-section>
                    </div>
                </div>
            </div>

            <footer class="actions-footer">
                <span class="autosave-hint">Изменения сохраняются сразу</span>

                <dst-button
                    value="Готово"
                    :variant="ButtonVariant.Success"
                    @click="onClose"
                />
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { ExposedRecorder, ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstOutputPathPicker from "@/components/DstOutputPathPicker.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import DstSwitch from "@/components/DstSwitch.vue"
import DstMicrophonePicker from "@/components/DstMicrophonePicker.vue"
import DstScreenPreview from "@/components/DstScreenPreview.vue"
import DstSettingsSection from "@/components/DstSettingsSection.vue"
import DstHotkeyInput from "@/components/DstHotkeyInput.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { dragPosition } from "@/composables/drag-position.ts"
import { useRecordingSettings } from "@/composables/recording-settings"
import { usePageVisible } from "@/composables/page-visible.ts"
import { useDisplayPreview } from "@/composables/display-preview.ts"

const {
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
    hotkeyStatus,
    hotkeyToggleRecording,
    hotkeyTogglePause,
    countdownList,
    selectedCountdown,
    afterRecordingList,
    selectedAfterRecording,
    setOutputPath,
    updateSettings,
} = useRecordingSettings({ autoSaveOnChange: true })

const drag = dragPosition(ExposedWinMain.MOVE_MAIN_WINDOW)
// Индикатор микрофона и превью экрана работают, только пока окно настроек открыто
const isPageVisible = usePageVisible()

const { preview: screenPreview, isLoading: isPreviewLoading } = useDisplayPreview({
    displayId: computed(() => currentDisplay.value?.id),
    enabled:   isPageVisible,
})
const screenRatio = computed(() => {
    const bounds = currentDisplay.value?.bounds
    return bounds ? bounds.width / bounds.height : 16 / 10
})

void updateSettings()
window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateSettings())
window.ipcRenderer?.on(
    ExposedRecorder.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateSettings({ newSettings }),
)

function onClose() {
    window.ipcRenderer?.send(ExposedWinMain.HIDE)
}

async function pickOutputPath() {
    const selectedPath = await window.ipcRenderer?.invoke<string>(ExposedWinMain.PICK_OUTPUT_PATH)
    if (selectedPath) setOutputPath(selectedPath)
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/mixins" as *;

.main-view {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    overflow-y: auto;

    @include custom-scrollbar(
        $width: 8px,
        $track-bg: rgba(0, 0, 0, 0.2),
        $thumb-bg: rgba(255, 255, 255, 0.3),
        $thumb-bg-hover: rgba(255, 255, 255, 0.5),
        $border-radius: 4px
    );
}

.container {
    display: flex;
    flex-direction: column;
    width: calc(100% - 16px);
    max-height: calc(100vh - 16px);
    margin: 8px;
    border-radius: 1rem;
    background: rgba(1, 12, 12, 0.48);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.16);
    color: #ffffff;
    overflow: hidden;
}

.window-header {
    padding: 20px 24px 0;

    .window-title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }
}

.scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px 0;

    @include custom-scrollbar();
}

// Две колонки: слева экран с превью и сохранение, справа звук и управление
.sections {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;

    .column {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
}

.actions-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
    padding: 16px 24px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin-top: 16px;

    .autosave-hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
    }
}
</style>
