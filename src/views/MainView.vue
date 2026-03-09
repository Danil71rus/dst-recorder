<template>
    <div
        class="main-view"
        @mousedown="drag.startDrag"
    >
        <div class="container">
            <div class="scrollable-content">
                <dst-combobox
                    v-model="selectedVideo"
                    :items="screensList"
                    :display-type="ComboboxDisplayType.Right"
                    :variant="ComboboxStyle.Secondary"
                    placeholder="Экран"
                    label="Выбор экрана"
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
                    v-model="selectedAudio"
                    :items="audioList"
                    :display-type="ComboboxDisplayType.Right"
                    :variant="ComboboxStyle.Secondary"
                    placeholder="Звук"
                    label="Выбор звука"
                />

                <dst-output-path-picker
                    :path="currentState.outputPath"
                    @pick="pickOutputPath"
                />

                <dst-switch
                    v-model="showBorder"
                    label="Подсвечивать рамкой экран при записи"
                />

                <hr>
            </div>

            <div class="actions-footer">
                <dst-button
                    value="Сохранить"
                    :variant="ButtonVariant.Success"
                    @click="save"
                />

                <dst-button
                    class="ml-x4"
                    value="Закрыть"
                    :variant="ButtonVariant.OutlineSecondary"
                    @click="onClose"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { ExposedFfmpeg, ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstOutputPathPicker from "@/components/DstOutputPathPicker.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import DstSwitch from "@/components/DstSwitch.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { dragPosition } from "@/composables/drag-position.ts"
import { useRecordingSettings } from "@/composables/recording-settings"

const {
    currentState,
    sizesCombobox,
    selectedDefSize,
    selectedVideo,
    selectedAudio,
    screensList,
    audioList,
    save,
    updateSettings,
} = useRecordingSettings()

const drag = dragPosition(ExposedWinMain.MOVE_MAIN_WINDOW)

const showBorder = computed({
    get: () => currentState.value.showBorder ?? false,
    set: (value: boolean) => currentState.value.showBorder = value,
})

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateSettings())
window.ipcRenderer?.on(
    ExposedFfmpeg.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateSettings({ newSettings }),
)

function onClose() {
    window.ipcRenderer?.send(ExposedWinMain.HIDE)
}

async function pickOutputPath() {
    const selectedPath = await window.ipcRenderer?.invoke<string>(ExposedWinMain.PICK_OUTPUT_PATH)
    if (selectedPath) currentState.value.outputPath = selectedPath
}
</script>

<style lang="scss" scoped>
.main-view {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    overflow-y: auto;

    /* Кастомный скроллбар */
    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        transition: background 0.2s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.5);
        }
    }
}

.container {
    display: flex;
    flex-direction: column;
    background: rgba(1, 12, 12, 0.48);
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.16);
    margin: 8px;
    color: #ffffff;
    max-height: calc(100vh - 16px);
    overflow: hidden;
}

.scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 25px 25px 0 25px;

    /* Кастомный скроллбар для прокручиваемого контента */
    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(102, 126, 234, 0.5);
        border-radius: 3px;
        transition: background 0.2s ease;

        &:hover {
            background: rgba(102, 126, 234, 0.8);
        }
    }

    &>*:not(:first-child) {
        margin-top: 24px;
    }

    hr {
        margin-top: 24px;
        margin-bottom: 0;
    }
}

.actions-footer {
    display: flex;
    padding: 24px 25px 25px 25px;
    background: rgba(1, 12, 12, 0.48);
    border-radius: 0 0 1rem 1rem;
    position: sticky;
    bottom: 0;
}

</style>
