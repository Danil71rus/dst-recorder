# CLAUDE.md

Этот файл содержит инструкции для Claude Code (claude.ai/code) при работе с кодом в этом репозитории.

**⚠️ ВАЖНО: Все ответы, размышления и общение должны быть на русском языке.**

## 🔍 Использование Graphify — ОБЯЗАТЕЛЬНО ДЛЯ ВСЕХ ВОПРОСОВ О КОДЕ

> **✅ КРИТИЧЕСКОЕ ПРАВИЛО:**
> 
> **При ЛЮБОМ вопросе о коде, архитектуре, компонентах или поиске в проекте:**
> 1. СНАЧАЛА запусти одну из команд Graphify
> 2. Используй результаты вместо grep/file search
> 3. Это экономит время и дает полный контекст
> 
> **НИКОГДА не начинай с raw grep или file browsing — ВСЕГДА Graphify первым!**

### Команды Graphify, которые ВСЕГДА использовать:

**Понимание компонента:**
```bash
graphify explain "ScreenRecorder"
graphify explain "FfmpegSettings"  
```

**Поиск связей между компонентами:**
```bash
graphify path "ScreenRecorder" "startRecording"
graphify path "main.ts" "FFmpeg Binary"
```

**Поиск по теме:**
```bash
graphify query "запись экрана"
graphify query "обработчики IPC"
graphify query "аудио"
```

**После изменения кода обновляй граф:**
```bash
graphify update .
```

## Обзор проекта

Dst-Recorder — профессиональное приложение для записи экрана на Electron для macOS и Windows, созданное с использованием Vue 3, TypeScript и FFmpeg. Приложение записывает видео экрана с поддержкой системного звука и микрофона, используя собственные API AVFoundation (macOS) или GDI (Windows).

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

**Важно**: Все скрипты сборки запускают `pnpm prebuild` или `pnpm prebuild:mac`/`pnpm prebuild:win` в первую очередь, что выполняет `scripts/copy-ffmpeg.js` для копирования бинарников FFmpeg в директорию `bin/`.

## Архитектура

### Система множественных окон Electron

Приложение использует три независимых экземпляра BrowserWindow, управляемых через `src/window/`:

1. **Основное окно** (`win-main.ts`) - Интерфейс настроек и конфигурации на маршруте `/`
2. **Окно таймера** (`win-timer.ts`) - Оверлей управления записью на маршруте `/timer`
3. **Окно выбора области** (`win-select-aria.ts`) - Оверлей выбора области на маршруте `/select-aria`

Все окна используют одинаковый Vue роутер, но отображают разные маршруты. Окна создаются в `src/main.ts` и управляются через `src/window/utils/ipc-controller.ts`.

### Интеграция FFmpeg

Основная логика записи находится в `src/ffmpeg.ts` (синглтон-класс `ScreenRecorder`):

- **Разрешение бинарников FFmpeg**: В собранных приложениях FFmpeg расположен в нескольких возможных путях (см. `initializeFfmpegPath()`). Приоритет: `Contents/MacOS/ffmpeg` → `Resources/bin/ffmpeg` → распакованные модули asar.
- **Захват, специфичный для платформы**: macOS использует AVFoundation с `-f avfoundation`, Windows использует GDI grab, Linux использует X11 grab.
- **Поток записи**: `startRecording()` → настраивает команду FFmpeg с кодеком H.264, аудиофильтрами и путём вывода → `stopRecording()` корректно останавливает процесс FFmpeg с командой 'q' или SIGINT.
- **Пауза/Возобновление**: Использует сигналы SIGSTOP/SIGCONT для замораживания/размораживания процесса FFmpeg (только macOS/Linux).

### Архитектура IPC

Обработчики IPC организованы в `src/window/ipc-handlers/`:

- `ipc-win-main.ts` - Обработчики для окна основных настроек
- `ipc-win-timer.ts` - Обработчики для таймера и управления записью
- `ipc-win-select-aria.ts` - Обработчики для окна выбора области
- `ipc-tray.ts` - Обработчики взаимодействия с системным лотком
- `definitions/renderer.ts` - TypeScript определения для открытых IPC каналов (например, `ExposedFfmpeg`, `ExposedWinSelectAria`)

Все имена IPC каналов централизованы как константы в файле определений.

### Управление состоянием

- **Состояние записи**: Управляется синглтон-экземпляром `ScreenRecorder` (`src/ffmpeg.ts`)
- **Сохранение настроек**: Настройки сохраняются в `dst-settings.json` в директории `app.getPath('userData')`
- **Коммуникация окон**: Основной процесс транслирует обновления состояния всем окнам через `ipcMain.emit()` и `webContents.send()`

### Настройка аудио на macOS

Приложение ожидает "Aggregate Device" для синхронизированного захвата звука (микрофон + системный звук). Смотрите `README.md` для детальных инструкций по настройке с использованием виртуального аудиодрайвера BlackHole. Устройство обычно называется "Recorder-Input".

## Структура файлов

- `src/main.ts` - Точка входа основного процесса Electron
- `src/render.ts` - Точка входа процесса рендеринга Vue
- `src/preload.ts` - Скрипт предварительной загрузки, открывающий API IPC для рендерера
- `src/ffmpeg.ts` - Основная логика записи FFmpeg (класс ScreenRecorder)
- `src/window/` - Создание окон и обработчики IPC
- `src/views/` - Vue представления для каждого окна (MainView, TimerView, SelectAriaView)
- `src/components/` - Переиспользуемые Vue компоненты
- `src/utils/` - Утилиты (логирование, пути иконок, и т.д.)
- `src/tray/` - Управление меню системного лотка
- `src/locales/` - Переводы i18n
- `builder/build.js` - Построитель ассетов (копирует иконки, генерирует реестр иконок)
- `scripts/` - Скрипты сборки (копирование FFmpeg, тестирование)
- `bin/` - Бинарники FFmpeg/FFprobe (копируются скриптами prebuild)

## Критические рассмотрения

### Упаковка бинарников FFmpeg

Бинарники FFmpeg должны быть доступны в собранном приложении. Процесс сборки:

1. `scripts/copy-ffmpeg.js` копирует бинарники из `node_modules/ffmpeg-ffprobe-static` в `bin/`
2. `electron-builder.json` определяет `extraFiles` для копирования `bin/ffmpeg` → `Contents/MacOS/ffmpeg` (macOS)
3. `electron-builder.json` также включает `extraResources` для копирования всей папки `bin/`
4. При запуске `initializeFfmpegPath()` проверяет несколько возможных путей

### Разрешения на macOS

Приложение требует разрешения на **запись экрана** и **доступ к микрофону**:

- Микрофон: `NSMicrophoneUsageDescription` в `electron-builder.json`
- Запись экрана: Проверяется при запуске через `systemPreferences.getMediaAccessStatus('screen')`
- Если разрешения отсутствуют, приложение показывает диалог и отказывает в запуске записи

### Обработка видео

- **Выбор области**: SelectAriaView позволяет пользователям обрезать область записи. Параметры обрезки/смещения/масштабирования применяются через видеофильтры FFmpeg (`crop` + `scale`).
- **Микширование звука**: Многоканальный звук смешивается в стерео с усилением микрофона, используя аудиофильтр `pan=stereo|c0=2.5*c0|c1=1.0*c2`.
- **Вывод**: Все записи сохраняются как MP4 (видео H.264 + аудио AAC) в папку, выбранную пользователем (по умолчанию: `~/Desktop/Dst-Recorder/`).

## Заметки о разработке

- **Vue Router**: Использует хеш-маршрутизацию (`createWebHashHistory`) для совместимости с Electron
- **Vite Plugin Electron**: Обрабатывает сборку основного процесса и preload скриптов Electron с горячей перезагрузкой при разработке
- **Построитель ассетов**: Пользовательские плагины Vite в `vite.config.ts` запускают `builder/build.js` для генерации ассетов иконок
- **i18n**: Vue I18n используется для локализации (русская локаль в `src/locales/`)
- **Логирование**: Все логи записываются в файл через `electron-log` (см. `src/utils/logger.ts`)

## graphify — ОБЯЗАТЕЛЬНО ДЛЯ ВСЕХ ВОПРОСОВ О КОДЕ

**✅ ПРАВИЛО: ВСЕГДА используй Graphify перед поиском в коде!**

Этот проект имеет граф знаний в директории `graphify-out/` с центральными узлами, структурой сообществ и кросс-файловыми отношениями.

### Обязательные правила использования:

1. **Вопрос о компоненте?** → `graphify explain "<имя>"`
   - Пример: `graphify explain "ScreenRecorder"` → сразу получаешь все его методы, зависимости и связи

2. **Нужно найти поток/логику?** → `graphify path "<A>" "<B>"`
   - Пример: `graphify path "startRecording" "FFmpeg"` → полный путь выполнения

3. **Вопрос по теме?** → `graphify query "<тема>"`
   - Пример: `graphify query "запись экрана"` → все связанные компоненты за раз

4. **После изменения кода** → `graphify update .`
   - Мгновенно обновляет граф (только AST анализ, без API)

5. **Архитектурные вопросы** → читай `graphify-out/GRAPH_REPORT.md`
   - Вместо manual file browsing

### Примеры для этого проекта:

```bash
graphify query "интеграция FFmpeg"              # Найти поток записи
graphify explain "ScreenRecorder"               # Основной класс записи (34 связи)
graphify path "ScreenRecorder" "startRecording" # Поток инициализации записи
graphify query "IPC"                            # Коммуникация окон
graphify explain "FfmpegSettings"               # Конфигурация записи
graphify query "аудио"                          # Настройка звука
```

### Статистика графа:
- **416 узлов**, **623 связи**, **28 сообществ**
- **Центральные узлы**: ScreenRecorder (34), compilerOptions (18), scripts (15), getWindowByName() (14)
- **Последнее обновление**: 2026-05-28 из коммита 04f9c208
