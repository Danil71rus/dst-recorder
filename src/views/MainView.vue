<template>
    <div
        class="main-view"
        @mousedown="drag.startDrag"
    >
        <div class="container">
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

            <hr>

            <div class="flex-row">
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
import { ExposedFfmpeg, ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer"
import { ComboboxDisplayType, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import { dragPosition } from "@/composables/drag-position.ts"
import { useRecordingSettings } from "@/composables/recording-settings"

const {
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

window.ipcRenderer?.on(ExposedWinMain.SHOW, async () => await updateSettings())
window.ipcRenderer?.on(
    ExposedFfmpeg.UPDATED_SETTINGS,
    async (_event, newSettings) => await updateSettings({ newSettings }),
)

function onClose() {
    window.ipcRenderer?.send(ExposedWinMain.HIDE)
}
</script>

<style lang="scss" scoped>
.main-view {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
    background: rgba(1, 12, 12, 0.48);
    padding: 25px;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.16);
    margin: 8px;
    color: #ffffff;

    &>*:not(:first-child) {
        margin-top: 24px;
    }
}
</style>
