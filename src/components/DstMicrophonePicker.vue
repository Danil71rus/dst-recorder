<template>
    <div class="dst-microphone-picker">
        <dst-combobox
            :model-value="modelValue"
            :items="items"
            :display-type="ComboboxDisplayType.Right"
            :variant="ComboboxStyle.Secondary"
            placeholder="Микрофон"
            :label="label"
            @update:model-value="value => emit('update:modelValue', value)"
        />

        <div
            class="meter-row"
            :class="{ muted: !isMonitoring }"
        >
            <svg
                class="mic-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <rect
                    x="9"
                    y="3"
                    width="6"
                    height="11"
                    rx="3"
                />
                <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
            </svg>

            <dst-level-meter
                class="meter"
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
    flex-direction: column;
    gap: 10px;

    // Шкала под списком, на всю ширину: не тесним выпадающий список длинными названиями микрофонов
    .meter-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);

        &.muted .mic-icon {
            opacity: 0.4;
        }
    }

    .mic-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        fill: none;
        stroke: rgba(255, 255, 255, 0.8);
        stroke-width: 2;
        stroke-linecap: round;
    }

    .meter {
        flex: 1;
    }

    // Длинное название микрофона обрезается многоточием, а не растягивает кнопку списка
    :deep(.dropdown-toggle) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
</style>
