import type sanitizeHtml from "sanitize-html"
import type * as _ from "lodash"

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
        $scrollTo: (element: string | Element, duration?: number, options?: {[key: string]: unknown}) => void
        _: typeof _
    }
}
