import type sanitizeHtml from "sanitize-html"
import type { formatPhone } from "@/utils/format-phone"

declare module "@vue/runtime-core" {
    export interface ComponentCustomProperties {
        beforeCreate?(): void
        created?(): void
        beforeMount?(): void
        mounted?(): void
        beforeUnmount?(): void
        unmounted?(): void
        beforeUpdate?(): void
        updated?(): void
        activated?(): void
        deactivated?(): void
        $sanitizeHtml: typeof sanitizeHtml
        $formatPhone: typeof formatPhone
        $scrollTo: (element: string | Element, duration?: number, options?: {[key: string]: unknown}) => void
    }
}
