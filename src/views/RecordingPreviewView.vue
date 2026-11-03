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
                    v-if="isEditing"
                    class="name-editor"
                >
                    <input
                        ref="nameInput"
                        v-model="draftName"
                        class="name-input"
                        maxlength="200"
                        spellcheck="false"
                        @keydown.enter.prevent="commitRename"
                        @keydown.esc.prevent="cancelRename"
                        @blur="commitRename"
                    >
                    <span class="extension">{{ extension }}</span>
                </div>

                <button
                    v-else
                    class="file-name"
                    title="Нажмите, чтобы переименовать"
                    @click="startRename"
                >
                    <span class="name-text">{{ info.fileName }}</span>
                    <span class="edit-icon">✎</span>
                </button>

                <div
                    v-if="renameError"
                    class="rename-error"
                >
                    {{ renameError }}
                </div>

                <div
                    v-else
                    class="meta"
                >
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
import { computed, nextTick, ref } from "vue"
import { RecordingSavedInfo } from "@/deinitions/recorder.ts"
import { ExposedRecordingPreview } from "@/window/ipc-handlers/definitions/renderer.ts"
import { formatDuration, formatFileSize } from "@/utils/format.ts"

interface PreviewPayload {
    info:      RecordingSavedInfo
    thumbnail: string | null
}

const COPIED_LABEL_MS = 1500
const ERROR_LABEL_MS = 3000

interface RenameResult {
    info?:  RecordingSavedInfo
    error?: string
}

const info = ref<RecordingSavedInfo | null>(null)
const thumbnail = ref<string | null>(null)
const isCopied = ref(false)

// Переименование файла прямо в миниатюре: имя без расширения, расширение не меняется
const isEditing = ref(false)
const draftName = ref("")
const renameError = ref("")
const nameInput = ref<HTMLInputElement | null>(null)
let errorTimer: ReturnType<typeof setTimeout> | null = null

const extension = computed(() => {
    const name = info.value?.fileName ?? ""
    const dot = name.lastIndexOf(".")
    return dot > 0 ? name.slice(dot) : ""
})
const baseName = computed(() => {
    const name = info.value?.fileName ?? ""
    return extension.value ? name.slice(0, -extension.value.length) : name
})

const duration = computed(() => formatDuration(info.value?.durationMs ?? 0))
const size = computed(() => formatFileSize(info.value?.sizeBytes ?? 0))

function send(channel: ExposedRecordingPreview) {
    window.ipcRenderer?.send(channel)
}

function setHover(isHovered: boolean) {
    window.ipcRenderer?.send(ExposedRecordingPreview.HOVER, isHovered)
}

async function startRename() {
    draftName.value = baseName.value
    renameError.value = ""
    isEditing.value = true
    window.ipcRenderer?.send(ExposedRecordingPreview.EDITING, true)
    await nextTick()
    nameInput.value?.focus()
    nameInput.value?.select()
}

function stopEditing() {
    isEditing.value = false
    window.ipcRenderer?.send(ExposedRecordingPreview.EDITING, false)
}

function showRenameError(message: string) {
    renameError.value = message
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
        renameError.value = ""
    }, ERROR_LABEL_MS)
}

/** Enter или клик мимо поля — сохранить имя. Срабатывает один раз: после Enter поле теряет фокус ещё раз */
async function commitRename() {
    if (!isEditing.value) return
    const name = draftName.value.trim()
    stopEditing()
    if (!name || name === baseName.value) return

    const result = await window.ipcRenderer?.invoke<RenameResult>(ExposedRecordingPreview.RENAME, name)
    if (result?.info) info.value = result.info
    else showRenameError(result?.error || "Не удалось переименовать файл")
}

function cancelRename() {
    stopEditing()
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

    // Имя файла — кнопка: по клику превращается в поле ввода
    .file-name {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin: 0 -4px;
        padding: 2px 4px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        cursor: text;

        .name-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .edit-icon {
            flex-shrink: 0;
            opacity: 0.45;
            font-size: 12px;
        }

        &:hover {
            background: rgba(255, 255, 255, 0.08);

            .edit-icon {
                opacity: 0.9;
            }
        }
    }

    .name-editor {
        display: flex;
        align-items: center;
        gap: 2px;
        margin: 0 -4px;
        padding: 1px 6px 1px 4px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.35);
        box-shadow: 0 0 0 2px #667eea;

        .name-input {
            flex: 1;
            min-width: 0;
            border: none;
            outline: none;
            background: transparent;
            color: #ffffff;
            font-size: 13px;
            font-weight: 600;
        }

        .extension {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
        }
    }

    .rename-error {
        margin-top: 2px;
        font-size: 12px;
        color: #fbbf24;
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
