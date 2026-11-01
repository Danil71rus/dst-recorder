<template>
    <div class="dst-hotkey-input">
        <span class="label">{{ label }}</span>

        <div class="row">
            <button
                ref="button"
                class="field"
                :class="{ capturing: isCapturing, empty: !modelValue, conflict: isConflict && !isCapturing }"
                type="button"
                @click="startCapture"
                @keydown="onKeyDown"
                @blur="stopCapture"
            >
                <template v-if="isCapturing">
                    Нажмите сочетание…
                </template>

                <template v-else-if="modelValue">
                    <kbd
                        v-for="part in parts"
                        :key="part"
                        class="key"
                    >{{ part }}</kbd>
                </template>

                <template v-else>
                    Не задано
                </template>
            </button>

            <button
                v-if="modelValue && !isCapturing"
                class="clear"
                type="button"
                title="Отключить сочетание"
                @click="emit('update:modelValue', '')"
            >
                ×
            </button>
        </div>

        <span
            v-if="isCapturing"
            class="hint"
        >
            Нужна хотя бы одна из клавиш ⌘ ⌃ ⌥. Esc — отмена
        </span>

        <span
            v-else-if="isConflict"
            class="hint warning"
        >
            Сочетание занято другим приложением — выберите другое
        </span>
    </div>
</template>

<script setup lang="ts">
/**
 * Поле ввода глобального сочетания клавиш: кликните и нажмите сочетание.
 * Значение — строка Electron Accelerator ("Alt+Shift+R"). Клавиша берётся по физическому месту (KeyboardEvent.code),
 * поэтому сочетание одинаково работает в русской и английской раскладке
 */
import { computed, ref } from "vue"
import { ExposedWinMain } from "@/window/ipc-handlers/definitions/renderer.ts"

interface Props {
    modelValue:  string
    label:       string
    // сочетание не удалось зарегистрировать
    isConflict?: boolean
}

interface Emits {
    (e: "update:modelValue", value: string): void
}

const props = withDefaults(defineProps<Props>(), {
    isConflict: false,
})
const emit = defineEmits<Emits>()

const button = ref<HTMLButtonElement | null>(null)
const isCapturing = ref(false)

const MODIFIER_SYMBOLS: Record<string, string> = {
    Command: "⌘",
    Control: "⌃",
    Alt:     "⌥",
    Shift:   "⇧",
}

const NAMED_KEYS: Record<string, string> = {
    Space:        "Space",
    Enter:        "Enter",
    Tab:          "Tab",
    Delete:       "Delete",
    Home:         "Home",
    End:          "End",
    PageUp:       "PageUp",
    PageDown:     "PageDown",
    ArrowUp:      "Up",
    ArrowDown:    "Down",
    ArrowLeft:    "Left",
    ArrowRight:   "Right",
    Minus:        "-",
    Equal:        "=",
    BracketLeft:  "[",
    BracketRight: "]",
    Backslash:    "\\",
    Semicolon:    ";",
    Quote:        "'",
    Comma:        ",",
    Period:       ".",
    Slash:        "/",
    Backquote:    "`",
}

/** Клавиша по физическому месту: KeyR → R, Digit1 → 1, F5 → F5. null — клавиша-модификатор или неизвестная */
function keyFromCode(code: string): string | null {
    const letter = code.match(/^Key([A-Z])$/)?.[1]
    if (letter) return letter
    const digit = code.match(/^(?:Digit|Numpad)(\d)$/)?.[1]
    if (digit) return code.startsWith("Numpad") ? `num${digit}` : digit
    if (/^F\d{1,2}$/.test(code)) return code
    return NAMED_KEYS[code] ?? null
}

const parts = computed(() => props.modelValue.split("+").map(part => MODIFIER_SYMBOLS[part] ?? part))

function startCapture() {
    if (isCapturing.value) return
    isCapturing.value = true
    // Иначе нажатие текущего сочетания запустит запись вместо того, чтобы записаться в поле
    window.ipcRenderer?.send(ExposedWinMain.SUSPEND_HOTKEYS, true)
}

function stopCapture() {
    if (!isCapturing.value) return
    isCapturing.value = false
    window.ipcRenderer?.send(ExposedWinMain.SUSPEND_HOTKEYS, false)
}

function finish(value: string) {
    emit("update:modelValue", value)
    stopCapture()
    button.value?.blur()
}

function onKeyDown(event: KeyboardEvent) {
    if (!isCapturing.value) return
    event.preventDefault()
    if (event.code === "Escape") {
        stopCapture()
        button.value?.blur()
        return
    }

    const key = keyFromCode(event.code)
    if (!key) return

    const modifiers = [
        event.metaKey && "Command",
        event.ctrlKey && "Control",
        event.altKey && "Alt",
        event.shiftKey && "Shift",
    ].filter((modifier): modifier is string => Boolean(modifier))

    // Без ⌘/⌃/⌥ сочетание перехватит обычный ввод текста во всех приложениях — такие не принимаем (кроме F-клавиш)
    const hasMainModifier = event.metaKey || event.ctrlKey || event.altKey
    if (!hasMainModifier && !/^F\d{1,2}$/.test(key)) return

    finish([...modifiers, key].join("+"))
}
</script>

<style lang="scss" scoped>
.dst-hotkey-input {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .label {
        font-size: 16px;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .field {
        flex: 1;
        min-height: 38px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.25);
        color: #ffffff;
        font-size: 14px;
        text-align: left;
        cursor: pointer;
        outline: none;

        &:hover {
            border-color: rgba(255, 255, 255, 0.4);
        }

        &.capturing {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.35);
            color: rgba(255, 255, 255, 0.7);
        }

        &.empty {
            color: rgba(255, 255, 255, 0.5);
        }

        &.conflict {
            border-color: #fbbf24;
        }
    }

    .key {
        min-width: 24px;
        padding: 2px 6px;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        font-family: inherit;
        font-size: 13px;
        text-align: center;
    }

    .clear {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    }

    .hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.55);

        &.warning {
            color: #fbbf24;
        }
    }
}
</style>
