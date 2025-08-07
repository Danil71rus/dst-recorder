<template>
    <div class="combobox-wrapper">
        <label v-if="label" :for="dropdownId" class="form-label">{{ label }}</label>

        <b-dropdown
            :id="dropdownId"
            :disabled="disabled"
            :variant="buttonVariant"
            class="w-100"
            :text="dropdownText"
            :split="isSplit"
            :dropup="isDropup"
            :right="isRight"
        >
            <!-- Рендеринг элементов списка -->
            <template v-for="item in items">
                <template v-if="item.items && item.items.length">
                    <b-dropdown-header :key="`header-${item.id}`">{{ item.title }}</b-dropdown-header>
                    <b-dropdown-item
                        v-for="subItem in item.items"
                        :key="subItem.id"
                        :active="String(subItem.id) === modelValue"
                        :disabled="subItem.disabled"
                        @click="onItemSelect(subItem)"
                    >
                        <div>
                            <div class="item-title">{{ subItem.title }}</div>
                            <small v-if="subItem.subtitle" class="text-muted">{{ subItem.subtitle }}</small>
                        </div>
                    </b-dropdown-item>
                    <b-dropdown-divider :key="`divider-${item.id}`"></b-dropdown-divider>
                </template>

                <template v-else>
                    <b-dropdown-item
                        :key="item.id"
                        :active="String(item.id) === modelValue"
                        :disabled="item.disabled"
                        @click="onItemSelect(item)"
                    >
                        <div>
                            <div class="item-title">{{ item.title }}</div>
                            <small v-if="item.subtitle" class="text-muted">{{ item.subtitle }}</small>
                        </div>
                    </b-dropdown-item>
                </template>
            </template>
        </b-dropdown>
        <div v-if="error && typeof error === 'string'" class="invalid-feedback d-block">
            {{ error }}
        </div>
    </div>
</template>

<script lang="ts" setup>
import {computed, PropType} from 'vue';
import {ComboboxDisplayType, ComboboxItem, ComboboxStyle} from "@/components/combobox/definitions/dst-combobox.ts";

// --- PROPS ---
const props = defineProps({
    /** ID выбранного элемента (для v-model) */
    modelValue: {
        type: String,
        default: '',
    },
    /** Массив элементов для отображения */
    items: {
        type: Array as PropType<ComboboxItem[]>,
        default: () => [],
    },
    /** Текст над компонентом */
    label: {
        type: String,
        default: '',
    },
    /** Текст, который отображается, когда ничего не выбрано */
    placeholder: {
        type: String,
        default: 'Выберите значение...',
    },
    /** Флаг, отключающий компонент */
    disabled: {
        type: Boolean,
        default: false,
    },
    /** Состояние ошибки. Переопределяет цвет на 'danger' */
    error: {
        type: [Boolean, String],
        default: false,
    },
    /** Тип отображения (поведение) */
    displayType: {
        type: String as PropType<ComboboxDisplayType>,
        default: ComboboxDisplayType.Default,
    },
    /** Вариант (цвет) */
    variant: {
        type: String as PropType<ComboboxStyle>,
        default: ComboboxStyle.OutlineSecondary,
    },
});

// --- EMITS ---
const emit = defineEmits(['update:modelValue']);

// --- COMPUTED ---

/** Уникальный ID для связи label и dropdown */
const dropdownId = computed(() => `combobox-${Math.random().toString(36).substring(2, 9)}`);

// Вычисляемые свойства для управления поведением b-dropdown
const isSplit = computed(() => props.displayType === ComboboxDisplayType.Split);
const isDropup = computed(() => props.displayType === ComboboxDisplayType.Up);
const isRight = computed(() => props.displayType === ComboboxDisplayType.Right);

/** Вычисляет 'variant' (цвет) для кнопки. Ошибка имеет наивысший приоритет. */
const buttonVariant = computed(() => {
    if (props.error) {
        return ComboboxStyle.Danger;
    }
    return props.variant;
});

/** "Плоский" список всех элементов для упрощения поиска */
const flattenedItems = computed(() => {
    const flat: ComboboxItem[] = [];
    props.items.forEach(item => {
        if (item.items) {
            flat.push(...item.items);
        } else {
            flat.push(item);
        }
    });
    return flat;
});

/** Выбранный на данный момент элемент */
const selectedItem = computed(() => {
    return flattenedItems.value.find(item => String(item.id) === props.modelValue);
});

/** Текст для кнопки dropdown */
const dropdownText = computed(() => {
    return selectedItem.value ? selectedItem.value.title : props.placeholder;
});

// --- METHODS ---

/**
 * Обработчик выбора элемента из списка.
 * @param item - Выбранный объект ComboboxItem
 */
function onItemSelect(item: ComboboxItem) {
    if (item.disabled) return;
    emit('update:modelValue', String(item.id));
}
</script>

<style lang="scss" scoped>
.combobox-wrapper {
    position: relative;
    text-align: left;
}

// Убираем лишние отступы в меню
:deep(.dropdown-menu) {
    .dropdown-header {
        padding-top: 0.5rem;
        padding-bottom: 0.25rem;
    }
    .dropdown-divider {
        margin-top: 0.25rem;
        margin-bottom: 0.5rem;
    }
}
</style>
