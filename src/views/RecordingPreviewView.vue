<template>
    <!-- Прижимаем карточку к низу окна: окно стоит в углу экрана, и пустое место должно быть сверху -->
    <div class="preview-window">
        <div
            v-if="info"
            class="preview"
            @mouseenter="setHover(true)"
            @mouseleave="setHover(false)"
        >
            <button
                class="close"
                title="Закрыть"
                @click="send(ExposedRecordingPreview.CLOSE)"
            >
                ×
            </button>

            <div
                class="thumbnail"
                draggable="true"
                title="Перетащите файл в Slack, Telegram или письмо"
                @dragstart.prevent="send(ExposedRecordingPreview.START_DRAG)"
                @dblclick="send(ExposedRecordingPreview.OPEN)"
            >
                <img
                    v-if="thumbnail"
                    :src="thumbnail"
                    alt=""
                    draggable="false"
                >

                <span
                    v-else
                    class="thumbnail-placeholder"
                >
                    🎬
                </span>

                <span class="duration">{{ duration }}</span>
            </div>

            <div class="details">
                <div
                    class="file-name"
                    :title="info.fileName"
                >
                    {{ info.fileName }}
                </div>

                <div class="meta">
                    {{ duration }} · {{ size }}
                </div>
            </div>

            <div class="actions">
                <button
                    class="action"
                    @click="send(ExposedRecordingPreview.OPEN)"
                >
                    <span class="icon">▶</span>
                    Открыть
                </button>

                <button
                    class="action"
                    :class="{ done: isCopied }"
                    @click="copy"
                >
                    <span class="icon">{{ isCopied ? "✓" : "⧉" }}</span>
                    {{ isCopied ? "Готово" : "Копировать" }}
                </button>

                <button
                    class="action"
                    @click="send(ExposedRecordingPreview.REVEAL)"
                >
                    <span class="icon">📂</span>
                    В Finder
                </button>

                <button
                    class="action danger"
                    @click="send(ExposedRecordingPreview.DELETE)"
                >
                    <span class="icon">🗑</span>
                    Удалить
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * Миниатюра после записи (src/recorder/recording-preview.ts): превью, длительность и размер файла, быстрые действия
 */
import { computed, ref } from "vue"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { ExposedRecordingPreview } from "@/window/ipc-handlers/definitions/renderer.ts"

interface PreviewPayload {
    info:      RecordingSavedInfo
    thumbnail: string | null
}

const COPIED_LABEL_MS = 1500

const info = ref<RecordingSavedInfo | null>(null)
const thumbnail = ref<string | null>(null)
const isCopied = ref(false)

const pad = (value: number) => `${value}`.padStart(2, "0")

/** 0:07, 12:34, 1:02:03 */
const duration = computed(() => {
    const totalSeconds = Math.round((info.value?.durationMs ?? 0) / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
})

/** 845 КБ, 12,4 МБ, 1,2 ГБ */
const size = computed(() => {
    const bytes = info.value?.sizeBytes ?? 0
    const units = ["Б", "КБ", "МБ", "ГБ"]
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    const digits = unit >= 2 && value < 100 ? 1 : 0
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })} ${units[unit]}`
})

function send(channel: ExposedRecordingPreview) {
    window.ipcRenderer?.send(channel)
}

function setHover(isHovered: boolean) {
    window.ipcRenderer?.send(ExposedRecordingPreview.HOVER, isHovered)
}

async function copy() {
    await window.ipcRenderer?.invoke(ExposedRecordingPreview.COPY)
    isCopied.value = true
    setTimeout(() => {
        isCopied.value = false
    }, COPIED_LABEL_MS)
}

window.ipcRenderer?.on(ExposedRecordingPreview.SHOW, (_event, payload) => {
    const { info: nextInfo, thumbnail: nextThumbnail } = payload as PreviewPayload
    // Та же запись — пришёл кадр из видео; новая запись — сбрасываем состояние
    if (info.value?.path !== nextInfo.path) isCopied.value = false
    info.value = nextInfo
    thumbnail.value = nextThumbnail
})
</script>

<style lang="scss" scoped>
.preview-window {
    height: 100vh;
    display: flex;
    align-items: flex-end;
}

.preview {
    position: relative;
    width: calc(100vw - 16px);
    margin: 8px;
    padding: 10px;
    border-radius: 14px;
    background: rgba(24, 24, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(16px);
    color: #ffffff;
    user-select: none;
    animation: slide-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1);

    &:hover .close {
        opacity: 1;
    }
}

@keyframes slide-in {
    from {
        transform: translateX(24px);
        opacity: 0;
    }

    to {
        transform: none;
        opacity: 1;
    }
}

.close {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 1;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font-size: 16px;
    line-height: 20px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms;
}

.thumbnail {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .thumbnail-placeholder {
        font-size: 40px;
        opacity: 0.6;
    }

    .duration {
        position: absolute;
        right: 6px;
        bottom: 6px;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.7);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
    }
}

.details {
    margin-top: 8px;
    padding: 0 2px;

    .file-name {
        font-size: 13px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .meta {
        margin-top: 2px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        font-variant-numeric: tabular-nums;
    }
}

.actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 10px;

    .action {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 2px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        font-size: 11px;
        cursor: pointer;
        transition: background 120ms;

        &:hover {
            background: rgba(255, 255, 255, 0.16);
        }

        &.done {
            background: rgba(52, 211, 153, 0.25);
        }

        &.danger:hover {
            background: rgba(248, 113, 113, 0.3);
        }

        .icon {
            font-size: 14px;
            line-height: 18px;
        }
    }
}
</style>
