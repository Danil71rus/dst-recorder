<template>
    <div
        class="dst-level-meter"
        :class="{ disabled }"
        :title="title"
    >
        <div
            class="fill"
            :style="{ '--level': `${Math.round(level * 100)}%` }"
        />
    </div>
</template>

<script setup lang="ts">
interface Props {
    // уровень сигнала 0..1
    level:     number
    disabled?: boolean
    title?:    string
}

withDefaults(defineProps<Props>(), {
    disabled: false,
    title:    "",
})
</script>

<style lang="scss" scoped>
.dst-level-meter {
    position: relative;
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;

    // Градиент неподвижен, уровень только открывает его: громкий сигнал уходит в жёлтое и красное
    .fill {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, #38c172 0%, #38c172 65%, #ffc107 85%, #e3342f 100%);
        clip-path: inset(0 calc(100% - var(--level)) 0 0);
        transition: clip-path 50ms linear;
    }

    &.disabled {
        opacity: 0.4;
    }
}
</style>
