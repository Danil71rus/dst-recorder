<template>
    <b-button
        :variant="variant"
        :disabled="disabled"
        @click="$emit('click', $event)"
    >
        {{ value }}
    </b-button>
</template>

<script lang="ts" setup>
import { PropType } from 'vue';
import {ButtonVariant} from "@/components/butoon/definitions/button-types.ts"
// Импортируем enum из отдельного файла

defineProps({
    /** Текст кнопки */
    value: {
        type: String,
        default: '',
    },
    /** Флаг, отключающий кнопку */
    disabled: {
        type: Boolean,
        default: false,
    },
    /**
     * Вариант (цвет) кнопки из bootstrap-vue.
     */
    variant: {
        type: String as PropType<ButtonVariant>,
        default: ButtonVariant.Primary,
    },
});

// Определяем событие, которое компонент может генерировать
defineEmits(['click']);
</script>

<style scoped>
/* Стили можно оставить пустыми, так как bootstrap-vue позаботится об этом. */
.btn {
    min-height: 38px; /* Пример стиля для консистентности */
}
</style>
