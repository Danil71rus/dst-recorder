<template>
    <b-button
        :variant="buttonVariant"
        :disabled="disabled"
        @click="$emit('click', $event)"
    >
        {{ value }}
    </b-button>
</template>

<script lang="ts" setup>
import { computed, PropType } from 'vue';

// Определяем типы кнопок, которые принимал ваш оригинальный компонент itl-button
type ButtonType =
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'call-accept'
    | 'call-reject'
    | 'white'
    | 'call-control'
    | 'numpad';

const props = defineProps({
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
     * Тип кнопки, который будет преобразован в bootstrap 'variant'.
     */
    classType: {
        type: String as PropType<ButtonType>,
        default: 'primary',
    },
});

// Определяем событие, которое компонент может генерировать
defineEmits(['click']);

/**
 * Вычисляемое свойство для преобразования 'classType'
 * в 'variant' для bootstrap-vue.
 */
const buttonVariant = computed(() => {
    switch (props.classType) {
        case 'primary':
            return 'primary';
        case 'secondary':
            return 'secondary';
        case 'danger':
            return 'danger';
        case 'call-accept':
            return 'success';
        case 'call-reject':
            return 'danger';
        case 'white':
            return 'light';
        case 'call-control':
        case 'numpad':
            return 'outline-secondary';
        default:
            return 'primary';
    }
});
</script>

<style scoped>
/* Стили можно оставить пустыми, так как bootstrap-vue позаботится об этом. */
.btn {
    min-height: 38px; /* Пример стиля для консистентности */
}
</style>
