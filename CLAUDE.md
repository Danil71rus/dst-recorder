# CLAUDE.md

Этот файл содержит инструкции для Claude Code (claude.ai/code) при работе с кодом в этом репозитории.

**⚠️ ВАЖНО: Все ответы, размышления и общение должны быть на русском языке.**

## Обзор проекта

Dst-Recorder — приложение для записи экрана на Electron 45 (macOS 14.2+, Windows не проверялась): Vue 3, TypeScript. Записывает экран или область, звук компьютера и микрофон в MP4. Всё записывает Chromium (getDisplayMedia: экран через ScreenCaptureKit, звук компьютера через Core Audio Tap; getUserMedia, WebAudio, MediaRecorder с аппаратным H.264) — FFmpeg, BlackHole и агрегатные аудиоустройства **не используются**.

## Ключевые команды

### Разработка
- `pnpm dev` - Запустить dev-сервер (Vite + Electron)
- `pnpm compile` - Проверка типов TypeScript и сборка с Vite
- `pnpm lint` - Запустить ESLint на кодовой базе
- `pnpm lint-ci` - Запустить ESLint в режиме CI (ошибка на предупреждения)

### Сборка
- `pnpm build` - Полная production сборка (проверка типов + Vite build + electron-builder)
- `pnpm build:mac` - Сборка для macOS (DMG пакеты x64 и arm64)
- `pnpm build:win` - Сборка для Windows (NSIS инсталлятор)

Скрипты `prebuild*` только очищают `release/` (`scripts/clean-release.js`). С Electron 42 бинарник Electron не скачивается сам при установке — это делает `install-electron` в `postinstall`/`predev`.

## Архитектура

### Окна Electron

Пять экземпляров BrowserWindow, создаются в `src/main.ts`, реестр — `src/window/utils/ipc-controller.ts`:

1. **Основное окно** (`win-main.ts`) — настройки, маршрут `/`
2. **Окно таймера** (`win-timer.ts`) — управление записью, `/timer`
3. **Окно выбора области** (`win-select-aria.ts`) — рамка области, `/select-aria`
4. **Рамка экрана** (`win-border.ts`) — подсветка записываемого экрана, `/border`
5. **Окно записи** (`win-capture.ts`) — невидимое, в нём идёт захват и кодирование, `/capture`

### Запись

Main-процесс, `src/recorder/`:

- `screen-recorder.ts` — синглтон `ScreenRecorder`: состояние idle → starting → recording ⇄ paused → stopping, настройки, окна области/рамки, реакция на отключение мониторов.
- `capture-bridge.ts` — управляет окном записи через `webContents.executeJavaScript(…, true)` (`window.dstCapture`), выбирает экран в `setDisplayMediaRequestHandler` (`audio: "loopback"`), принимает кусочки MP4 по IPC. Для звука компьютера нужен ключ `NSAudioCaptureUsageDescription` в Info.plist (`electron-builder.json`), флаги Chromium не нужны.
- `capture-plan.ts` — чистые функции: размер захвата, область в долях кадра, битрейт. Используются и в окнах настроек.
- `recording-file.ts`, `settings-store.ts` (проверка и миграция `dst-settings.json`), `displays.ts`.

Окно записи, `src/capture/`: `capture-session.ts` (getDisplayMedia + getUserMedia + MediaRecorder, фрагментированный MP4 раз в секунду), `audio-mixer.ts` (WebAudio на фиксированных 48 кГц, микрофон ×2), `video-crop.ts` (обрезка области через MediaStreamTrackProcessor/Generator), `media-devices.ts` (микрофоны — общий модуль с окнами настроек).

Пауза — `MediaRecorder.pause()`. Ошибки захвата приходят с префиксом источника (`[screen] …`, `[microphone] …`) — по нему `permissions.ts` показывает нужную инструкцию.

### Архитектура IPC

Обработчики в `src/window/ipc-handlers/` (`ipc-win-main.ts`, `ipc-win-timer.ts`, `ipc-win-select-aria.ts`, `ipc-tray.ts`). Все имена каналов — enum-ы в `definitions/renderer.ts` (`ExposedRecorder`, `ExposedWinMain`, `ExposedWinTimer`, `ExposedWinSelectAria`, `ExposedCapture`).

### Управление состоянием

- **Источник истины**: `ScreenRecorder` в main. `setSettings()` проверяет, сохраняет в `dst-settings.json` (`app.getPath('userData')`) и рассылает всем окнам `ExposedRecorder.UPDATED_SETTINGS`; статус записи — `ExposedRecorder.UPDATED_STATE_TIMER` раз в секунду.
- **Окна настроек**: `composables/recording-settings.ts`; микрофон выбирается компонентом `DstMicrophonePicker` с индикатором уровня (`composables/audio-level.ts`), который слушает микрофон только пока окно видно.

## Структура файлов

- `src/main.ts` — точка входа main-процесса
- `src/render.ts` — точка входа Vue
- `src/preload.ts` — мост IPC для рендерера
- `src/permissions.ts` — разрешения macOS
- `src/deinitions/recorder.ts` — типы и пресеты (RecorderSettings, Size, DisplayInfo, CaptureOptions)
- `src/recorder/` — ядро записи (main)
- `src/capture/` — захват и кодирование (окно записи)
- `src/window/` — создание окон и обработчики IPC
- `src/views/` — MainView, TimerView, SelectAriaView, BorderView, CaptureView
- `src/components/`, `src/composables/` — UI и логика настроек
- `src/tray/` — меню в строке меню
- `builder/build.js` — генерация иконок; `builder/after-pack.js` — ad-hoc подпись пакета macOS

## Критические рассмотрения

### Разрешения на macOS

- Микрофон: `NSMicrophoneUsageDescription` в `electron-builder.json`, запрос `askForMediaAccess`.
- Запись экрана и системного звука: запрос через `desktopCapturer.getSources`, применяется после перезапуска.
- Ad-hoc подпись (`after-pack.js`) нужна, чтобы macOS надёжно узнавала приложение.

### Обработка видео и звука

- **Область**: `window/utils/aria-geometry.ts` берёт область внутри рамки (минус 4 px рамки) и монитор под ней; `capture-plan.ts` переводит её в доли кадра.
- **Размер**: Chromium масштабирует захват экрана до запрошенного размера; качество (пресет) ограничивает итоговую область по высоте и ширине 16:9.
- **AirPods**: открытый микрофон переводит их в режим гарнитуры (24 кГц) — поэтому микшер работает на фиксированных 48 кГц, а индикатор уровня не держит микрофон открытым без надобности.
- **Вывод**: MP4 (H.264 + AAC) в папку из настроек (по умолчанию `~/Desktop/Dst-Recorder/`).

## Заметки о разработке

- **Vue Router**: Использует хеш-маршрутизацию (`createWebHashHistory`) для совместимости с Electron
- **Vite Plugin Electron**: Обрабатывает сборку основного процесса и preload скриптов Electron с горячей перезагрузкой при разработке
- **Построитель ассетов**: Пользовательские плагины Vite в `vite.config.ts` запускают `builder/build.js` для генерации ассетов иконок
- **Импорты**: только через алиас `@/…` (настроен в `tsconfig.json` и для всех сборок в `vite.config.ts`), без `./` и `../`
- **Интерфейс**: только на русском, без i18n
- **Логирование**: Все логи записываются в файл через `electron-log` (см. `src/utils/logger.ts`)
