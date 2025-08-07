/** Интерфейс одного элемента выпадающего списка */
export interface ComboboxItem {
    id: string | number;
    title: string;
    subtitle?: string;
    disabled?: boolean;
    items?: ComboboxItem[];
}

/** Перечисление для управления поведением/типом dropdown */
export enum ComboboxDisplayType {
    Default = 'default',
    Up = 'up',
    Split = 'split',
    Right = 'right',
}

/** Перечисление для управления цветом/стилем dropdown */
export enum ComboboxStyle {
    Primary = 'primary',
    Secondary = 'secondary',
    Success = 'success',
    Danger = 'danger',
    Warning = 'warning',
    Info = 'info',
    Light = 'light',
    Dark = 'dark',
    OutlinePrimary = 'outline-primary',
    OutlineSecondary = 'outline-secondary',
    OutlineSuccess = 'outline-success',
    OutlineDanger = 'outline-danger',
    OutlineWarning = 'outline-warning',
    OutlineInfo = 'outline-info',
    OutlineLight = 'outline-light',
    OutlineDark = 'outline-dark',
}
