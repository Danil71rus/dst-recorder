<template>
    <div
        class="itl-svg"
        :class="[
            classes,
            {'table-clickable': tableClickable}
        ]"
        v-html="svgTag"
    />
</template>

<script lang="ts" setup>
import { computed } from "vue"
import { itlIcons } from "@/deinitions/modules/itl-icons.ts"
import { getUUID } from "@/utils/utils.ts"

const props = withDefaults(defineProps<{
    name: string
    noTransition?: boolean
    tableClickable?: boolean
    preventDrag?: boolean
    disabled?: boolean
}>(), {
    noTransition:   false,
    tableClickable: false,
    preventDrag:    false,
    disabled:       false,
})

const svgTag = computed(() => {
    const svgTag = itlIcons[props.name]

    if (!svgTag) {
        console.log(`icon not found: ${props.name}`)
    }

    const uuid = getUUID()
    return svgTag?.replace(/fill="(white|#333|#333333)"/gm, 'fill="currentColor"')
        .replace(/stroke="(white)"/gm, 'stroke="currentColor"')
        .replace(/gradienttop/g, `gradienttop-${uuid}`)
        .replace(/gradientbottom/g, `gradientbottom-${uuid}`)
            // https://jira.itoolabs.com/browse/VUE-6356?focusedCommentId=211331
        .replace(/mask-unique/g, uuid)
})

const classes = computed(() => {
    const classes = [`svg-${props.name}`]
    if (props.noTransition) classes.push("no-transition")
    // if (props.preventDrag) classes.push(PREVENT_DRAG_CLASS)
    if (props.disabled) classes.push("disabled")
    return classes
})
</script>

<style lang="scss">
.itl-svg {
    line-height: 0;
    user-select: none;

    &.default-color {
        color: var(--graphicsColorHighContrast);

        &:hover,
        &:active {
            color: unset;
        }
    }

    &.no-transition svg > path {
        transition: none;
    }

    svg {
        width: inherit;
        height: inherit;
        fill: currentColor;

        & > path {
            transition: var(--fastTransition);
            transition-property: color;
        }

        * {
            pointer-events: none;
        }
    }
}
</style>

