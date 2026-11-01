<template>
    <section class="dst-settings-section">
        <header class="header">
            <h2 class="title">
                {{ title }}
            </h2>

            <p
                v-if="description"
                class="description"
            >
                {{ description }}
            </p>
        </header>

        <div class="content">
            <slot />
        </div>
    </section>
</template>

<script setup lang="ts">
/**
 * Раздел окна настроек: заголовок и карточка с полями
 */
interface Props {
    title:        string
    description?: string
}

withDefaults(defineProps<Props>(), {
    description: "",
})
</script>

<style lang="scss" scoped>
.dst-settings-section {
    display: flex;
    flex-direction: column;
    padding: 16px 18px 18px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);

    .header {
        margin-bottom: 14px;
    }

    .title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.65);
    }

    .description {
        margin: 4px 0 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.45);
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
}
</style>
