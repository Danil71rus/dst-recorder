<template>
    <div class="output-path-wrap">
        <label class="output-path-label">{{ label }}</label>

        <div class="output-path-row">
            <input
                :value="path"
                class="output-path-input"
                type="text"
                readonly
            >

            <dst-button
                class="ml-x2"
                :value="buttonText"
                :variant="ButtonVariant.OutlineSecondary"
                @click="emit('pick')"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import DstButton from "@/components/butoon/DstButton.vue"
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"

const emit = defineEmits<{ pick: [] }>()

withDefaults(
    defineProps<{
        path: string
        label?: string
        buttonText?: string
    }>(),
    {
        label:      "Папка сохранения",
        buttonText: "Выбрать",
    },
)

</script>

<style lang="scss" scoped>
.output-path-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.output-path-row {
    display: flex;
    align-items: center;
}

.output-path-label {
    font-size: 16px;
}

.output-path-input {
    width: 100%;
    min-width: 320px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    outline: none;

    &:focus {
        border-color: rgba(255, 255, 255, 0.5);
    }
}
</style>
