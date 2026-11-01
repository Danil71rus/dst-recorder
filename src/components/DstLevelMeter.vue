<template>
    <div
        class="dst-level-meter"
        :class="{ disabled }"
        :title="title"
    >
        <span
            v-for="(cell, index) in cells"
            :key="index"
            class="segment"
            :class="[cell.zone, { lit: !disabled && index < litCount }]"
        />
    </div>
</template>

<script setup lang="ts">
/**
 * Индикатор уровня в виде светодиодной шкалы: зелёный — нормальная громкость, жёлтый — громко, красный — перегруз
 */
import { computed } from "vue"

interface Props {
    // уровень сигнала 0..1
    level:     number
    disabled?: boolean
    title?:    string
    segments?: number
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    title:    "",
    segments: 24,
})

// Границы зон в долях шкалы
const WARNING_FROM = 0.7
const DANGER_FROM = 0.88

// Не «segments»: в шаблоне это имя занято свойством с числом сегментов
const cells = computed(() => Array.from({ length: props.segments }, (_, index) => {
    const position = (index + 1) / props.segments
    const zone = position > DANGER_FROM ? "danger" : position > WARNING_FROM ? "warning" : "normal"
    return { zone }
}))

const litCount = computed(() => Math.round(Math.min(Math.max(props.level, 0), 1) * props.segments))
</script>

<style lang="scss" scoped>
.dst-level-meter {
    display: flex;
    gap: 3px;
    width: 100%;
    height: 10px;

    .segment {
        flex: 1;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.12);
        transition: background-color 80ms linear, box-shadow 80ms linear;

        &.lit.normal {
            background: #34d399;
            box-shadow: 0 0 4px rgba(52, 211, 153, 0.6);
        }

        &.lit.warning {
            background: #fbbf24;
            box-shadow: 0 0 4px rgba(251, 191, 36, 0.6);
        }

        &.lit.danger {
            background: #f87171;
            box-shadow: 0 0 4px rgba(248, 113, 113, 0.6);
        }
    }

    &.disabled {
        opacity: 0.4;
    }
}
</style>
