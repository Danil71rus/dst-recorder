import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import electron from "vite-plugin-electron"
import { resolve } from "path"
// @ts-ignore
import { build } from "./builder/build.js"

export default defineConfig({
    plugins: [
        vue(),
        // Плагин для копирования иконок и генерации itl-icons.js
        {
            name: "build-assets",
            closeBundle() {
                try {
                    build()
                } catch (error) {
                    console.error("[Assets] Failed to build assets:", error)
                }
            },
        },
        // Плагин для генерации иконок в dev режиме
        {
            name: "build-dev-icons",
            buildStart() {
                if (process.env.NODE_ENV === "development") {
                    try {
                        build()
                    } catch (error) {
                        console.error("[Dev Icons] Failed to build dev icons:", error)
                    }
                }
            },
        },
        electron([
            {
                entry: "src/main.ts",
                // Возвращаем onstart, чтобы плагин сам управлял запуском Electron
                onstart(options) {
                    options.startup()
                },
                vite: {
                    build: {
                        outDir:        "dist-electron",
                        rollupOptions: {
                            external: [
                                "electron",
                                "fluent-ffmpeg",
                                "ffmpeg-ffprobe-static",
                            ],
                        },
                    },
                },
            },
            {
                entry: "src/preload.ts",
                onstart(options) {
                    // ВАЖНО: нужно перезагружать, а не запускать заново,
                    // чтобы избежать дублирования окон
                    options.reload()
                },
                vite: {
                    build: {
                        outDir:        "dist-electron",
                        rollupOptions: {
                            external: [
                                "electron",
                                "fluent-ffmpeg",
                                "ffmpeg-ffprobe-static",
                            ],
                        },
                    },
                },
            },
        ]),
    ],
    resolve: {
        preserveSymlinks: true,
        alias:            {
            "@":   resolve(__dirname, "src"),
            "@a":  resolve(__dirname, "src", "assets"),
            "@ad": resolve(__dirname, "dist-electron", "assets"),
        },
    },
    // Для Electron приложений всегда используем относительные пути
    base:  "./",
    build: {
        outDir:        "dist",
        emptyOutDir:   true,
        // Добавляем настройки для правильной работы в Electron
        rollupOptions: {
            output: {
                format: "es",
            },
        },
        // Копируем иконки в dist/assets
        assetsDir: "assets",
    },
    server: {
        port: 5173,
        host: true,
    },
})
