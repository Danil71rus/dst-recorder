/**
 * Интервал между опорными кадрами в MediaRecorder (Chromium 112+). В стандартной библиотеке TypeScript его нет.
 * https://w3c.github.io/mediacapture-record/#dom-mediarecorderoptions-videokeyframeintervalduration
 */

declare global {
    interface MediaRecorderOptions {
        videoKeyFrameIntervalDuration?: number
        videoKeyFrameIntervalCount?:    number
    }
}

export {}
