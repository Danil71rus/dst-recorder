<template>
    <div class="dst-microphone-picker">
        <dst-combobox
            class="picker"
            :model-value="modelValue"
            :items="items"
            :display-type="ComboboxDisplayType.Right"
            :variant="ComboboxStyle.Secondary"
            placeholder="Микрофон"
            :label="label"
            @update:model-value="value => emit('update:modelValue', value)"
        />

        <div class="meter">
            <dst-level-meter
                :level="level"
                :disabled="!isMonitoring"
                :title="meterTitle"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * Выбор микрофона с индикатором уровня: сразу видно, что выбран тот микрофон, в который вы говорите
 */
import { computed, toRef } from "vue"
import DstCombobox from "@/components/combobox/DstCombobox.vue"
import DstLevelMeter from "@/components/DstLevelMeter.vue"
import { ComboboxDisplayType, ComboboxItem, ComboboxStyle } from "@/components/combobox/definitions/dst-combobox.ts"
import { useAudioLevel } from "@/composables/audio-level.ts"
import { MIC_NONE } from "@/deinitions/recorder.ts"

interface Props {
    // deviceId выбранного микрофона (v-model)
    modelValue: string
    // название выбранного микрофона: по нему он найдётся, если deviceId сменился
    micLabel:   string
    items:      ComboboxItem[]
    // слушать микрофон для индикатора (окно видно и запись не идёт)
    monitoring: boolean
    label?:     string
}

interface Emits {
    (e: "update:modelValue", value: string): void
}

const props = withDefaults(defineProps<Props>(), {
    label: "Микрофон",
})
const emit = defineEmits<Emits>()

const isMonitoring = computed(() => props.monitoring && props.modelValue !== MIC_NONE)

const { level, isAvailable } = useAudioLevel({
    deviceId: toRef(props, "modelValue"),
    label:    toRef(props, "micLabel"),
    enabled:  isMonitoring,
})

const meterTitle = computed(() => {
    if (props.modelValue === MIC_NONE) return "Микрофон не записывается"
    if (!isAvailable.value) return "Нет доступа к микрофону"
    return "Уровень сигнала микрофона"
})
</script>

<style lang="scss" scoped>
.dst-microphone-picker {
    display: flex;
    align-items: flex-end;
    gap: 12px;

    .picker {
        flex: 1;
        min-width: 0;
    }

    // Высота кнопки выпадающего списка: индикатор стоит напротив неё, а не напротив подписи
    .meter {
        width: 96px;
        height: 38px;
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
}
</style>
