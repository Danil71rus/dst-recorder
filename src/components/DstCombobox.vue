<template>
    <div class="combobox-wrapper">
        <label v-if="label" :for="dropdownId" class="form-label">{{ label }}</label>

        <b-dropdown
            :id="dropdownId"
            :text="dropdownText"
            :disabled="disabled"
            :variant="error ? 'danger' : 'outline-secondary'"
            class="w-100"
        >
            <template v-for="item in items">
                <template v-if="item.items && item.items.length">
                    <b-dropdown-header :key="`header-${item.id}`">{{ item.title }}</b-dropdown-header>
                    <b-dropdown-item
                        v-for="subItem in item.items"
                        :key="subItem.id"
                        :active="subItem.id === modelValue"
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
                        :active="item.id === modelValue"
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
import { computed, PropType } from 'vue';

/** Интерфейс одного элемента выпадающего списка */
export interface ComboboxItem {
    /** Уникальный id элемента */
    id: string
    /** Основной текст, который выводится в выпадающем списке */
    title: string
    /** Дополнительный текст */
    subtitle?: string
    /** Задизейблен ли элемент */
    disabled?: boolean
    /** Массив элементов выпадающего списка (для группы) */
    items?: ComboboxItem[]
    // Другие поля, такие как email, mobile, icon и т.д.,
    // могут быть добавлены по аналогии при необходимости.
}



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
    /** Состояние ошибки (может быть булевым или строкой с текстом ошибки) */
    error: {
        type: [Boolean, String],
        default: false,
    },
});

// --- EMITS ---
const emit = defineEmits(['update:modelValue']);

// --- COMPUTED ---

/** Уникальный ID для связи label и dropdown */
const dropdownId = computed(() => `combobox-${Math.random().toString(36).substring(2, 9)}`);

/** "Плоский" список всех элементов без учета групп для упрощения поиска */
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
    return flattenedItems.value.find(item => item.id === props.modelValue);
});

/** Текст для кнопки dropdown: либо заголовок выбранного элемента, либо placeholder */
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
    emit('update:modelValue', item.id);
}
</script>

<style lang="scss" scoped>
.combobox-wrapper {
    position: relative;
    text-align: left; // Для корректного отображения label
}

// Bootstrap Vue 2/3 может добавлять лишние отступы, это их убирает.
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
