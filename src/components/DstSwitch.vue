<template>
    <div class="dst-switch">
        <label class="switch-label">
            <span class="label-text">{{ label }}</span>

            <div
                class="switch-container"
                :class="{ active: modelValue }"
                @click="toggle"
            >
                <div class="switch-thumb" />
            </div>
        </label>
    </div>
</template>

<script setup lang="ts">

interface Props {
    modelValue: boolean
    label: string
}

interface Emits {
    (e: "update:modelValue", value: boolean): void
}

const emit = defineEmits<Emits>()
const props = defineProps<Props>()
function toggle() {
    emit("update:modelValue", !props.modelValue)
}
</script>

<style lang="scss" scoped>
.dst-switch {
    width: 100%;
}

.switch-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
}

.label-text {
    font-size: 16px;
    color: #ffffff;
}

.switch-container {
    position: relative;
    width: 48px;
    height: 24px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    transition: background 0.2s ease;

    &.active {
        background: #667eea;
    }

    &:hover {
        background: rgba(255, 255, 255, 0.3);

        &.active {
            background: #7e8ff0;
        }
    }
}

.switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;

    .active & {
        transform: translateX(24px);
    }
}
</style>
