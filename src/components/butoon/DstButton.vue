<template>
    <b-button
        class="dst-button"
        :variant="variant"
        :disabled="disabled"
        @click="emit('click')"
    >
        <div class="content flex-row">
            <dst-svg
                v-if="icon"
                :name="icon"
            />

            <div :class="{ 'ml-x1': icon }">
                {{ value }}
            </div>
        </div>
    </b-button>
</template>

<script lang="ts" setup>
import { ButtonVariant } from "@/components/butoon/definitions/button-types.ts"
import DstSvg from "@/components/dst-svg.vue"

const emit = defineEmits<{
    click: []
}>()

withDefaults(defineProps<{
    icon?:     string
    value?:    string
    disabled?: boolean
    variant?:  ButtonVariant
}>(), {
    icon:     "",
    value:    "",
    disabled: false,
    variant:  ButtonVariant.Primary,
})

</script>

<style scoped>
.dst-button {
    cursor: pointer;
}
</style>
