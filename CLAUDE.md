# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dst-Recorder is a professional screen recording Electron application for macOS and Windows, built with Vue 3, TypeScript, and FFmpeg. The app records screen video with system audio and microphone support, using native AVFoundation (macOS) or GDI (Windows) capture.

## Key Commands

### Development
- `pnpm dev` - Start development server (Vite + Electron)
- `pnpm compile` - Type-check with TypeScript and build with Vite
- `pnpm lint` - Run ESLint on codebase
- `pnpm lint-ci` - Run ESLint in CI mode (fail on warnings)

### Building
- `pnpm build` - Full production build (type-check + Vite build + electron-builder)
- `pnpm build:mac` - Build for macOS (both x64 and arm64 DMG packages)
- `pnpm build:win` - Build for Windows (NSIS installer)

**Important**: All build scripts run `pnpm prebuild` or `pnpm prebuild:mac`/`pnpm prebuild:win` first, which executes `scripts/copy-ffmpeg.js` to copy FFmpeg binaries to the `bin/` directory.

## Architecture

### Electron Multi-Window System

The app uses three independent BrowserWindow instances managed through `src/window/`:

1. **Main Window** (`win-main.ts`) - Settings and configuration UI at route `/`
2. **Timer Window** (`win-timer.ts`) - Recording control overlay at route `/timer`
3. **Select Area Window** (`win-select-aria.ts`) - Area selection overlay at route `/select-aria`

All windows share the same Vue router but display different routes. Windows are created in `src/main.ts` and managed via `src/window/utils/ipc-controller.ts`.

### FFmpeg Integration

Core recording logic lives in `src/ffmpeg.ts` (`ScreenRecorder` singleton class):

- **FFmpeg Binary Resolution**: In packaged apps, FFmpeg is located in multiple candidate paths (see `initializeFfmpegPath()`). Priority: `Contents/MacOS/ffmpeg` → `Resources/bin/ffmpeg` → unpacked asar modules.
- **Platform-Specific Capture**: macOS uses AVFoundation with `-f avfoundation`, Windows uses GDI grab, Linux uses X11 grab.
- **Recording Flow**: `startRecording()` → configures FFmpeg command with H.264 codec, audio filters, and output path → `stopRecording()` gracefully stops FFmpeg process with 'q' command or SIGINT.
- **Pause/Resume**: Uses SIGSTOP/SIGCONT signals to freeze/unfreeze FFmpeg process (macOS/Linux only).

### IPC Architecture

IPC handlers are organized in `src/window/ipc-handlers/`:

- `ipc-win-main.ts` - Handlers for main settings window
- `ipc-win-timer.ts` - Handlers for timer/recording controls
- `ipc-win-select-aria.ts` - Handlers for area selection window
- `ipc-tray.ts` - Handlers for system tray interactions
- `definitions/renderer.ts` - TypeScript definitions for exposed IPC channels (e.g., `ExposedFfmpeg`, `ExposedWinSelectAria`)

All IPC channel names are centralized as constants in the definitions file.

### State Management

- **Recording State**: Managed by singleton `ScreenRecorder` instance (`src/ffmpeg.ts`)
- **Settings Persistence**: Settings saved to `dst-settings.json` in `app.getPath('userData')` directory
- **Window Communication**: Main process broadcasts state updates to all windows via `ipcMain.emit()` and `webContents.send()`

### macOS Audio Setup

The app expects an "Aggregate Device" for synchronized audio capture (microphone + system audio). See `README.md` for detailed setup instructions using BlackHole virtual audio driver. The device is typically named "Recorder-Input".

## File Structure

- `src/main.ts` - Electron main process entry point
- `src/render.ts` - Vue renderer process entry point
- `src/preload.ts` - Preload script exposing IPC APIs to renderer
- `src/ffmpeg.ts` - Core FFmpeg recording logic (ScreenRecorder class)
- `src/window/` - Window creation and IPC handlers
- `src/views/` - Vue views for each window (MainView, TimerView, SelectAriaView)
- `src/components/` - Reusable Vue components
- `src/utils/` - Utility functions (logging, icon paths, etc.)
- `src/tray/` - System tray menu management
- `src/locales/` - i18n translations
- `builder/build.js` - Asset builder (copies icons, generates icon registry)
- `scripts/` - Build scripts (FFmpeg copy, testing)
- `bin/` - FFmpeg/FFprobe binaries (copied by prebuild scripts)

## Critical Considerations

### FFmpeg Binary Packaging

FFmpeg binaries must be accessible in the packaged app. The build process:

1. `scripts/copy-ffmpeg.js` copies binaries from `node_modules/ffmpeg-ffprobe-static` to `bin/`
2. `electron-builder.json` defines `extraFiles` to copy `bin/ffmpeg` → `Contents/MacOS/ffmpeg` (macOS)
3. `electron-builder.json` also includes `extraResources` to copy entire `bin/` folder
4. At runtime, `initializeFfmpegPath()` checks multiple candidate paths

### macOS Permissions

The app requires **Screen Recording** and **Microphone** permissions:

- Microphone: `NSMicrophoneUsageDescription` in `electron-builder.json`
- Screen Recording: Checked at runtime via `systemPreferences.getMediaAccessStatus('screen')`
- If permissions are missing, the app shows a dialog and refuses to start recording

### Video Processing

- **Area Selection**: SelectAriaView allows users to crop recording area. Crop/offset/scale settings are applied via FFmpeg video filters (`crop` + `scale`).
- **Audio Mixing**: Multi-channel audio is mixed to stereo with mic boost using `pan=stereo|c0=2.5*c0|c1=1.0*c2` audio filter.
- **Output**: All recordings saved as MP4 (H.264 video + AAC audio) in user-selected output folder (default: `~/Desktop/Dst-Recorder/`).

## Development Notes

- **Vue Router**: Uses hash-based routing (`createWebHashHistory`) for Electron compatibility
- **Vite Plugin Electron**: Handles Electron main/preload builds with hot-reload during development
- **Asset Builder**: Custom Vite plugins in `vite.config.ts` run `builder/build.js` to generate icon assets
- **i18n**: Vue I18n used for localization (Russian locale in `src/locales/`)
- **Logging**: All logs written to file via `electron-log` (see `src/utils/logger.ts`)
