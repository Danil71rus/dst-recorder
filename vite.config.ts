import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import electron from "vite-plugin-electron"
import { resolve } from "path"
import { copyFileSync, mkdirSync } from "fs"

export default defineConfig({
    plugins: [
        vue(),
        // Плагин для копирования иконок
        {
            name: "copy-icons",
            closeBundle() {
                // Создаём директорию assets если её нет
                try {
                    mkdirSync(resolve(__dirname, "dist/assets"), { recursive: true })

                    // Копируем иконки
                    const icons = ["camera.icns", "camera.ico", "camera.png"]
                    icons.forEach(icon => {
                        try {
                            copyFileSync(
                                resolve(__dirname, `src/assets/${icon}`),
                                resolve(__dirname, `dist/assets/${icon}`),
                            )
                            console.log(`Copied ${icon} to dist/assets/`)
                        } catch (error) {
                            console.error(`Failed to copy ${icon}:`, error)
                        }
                    })
                } catch (error) {
                    console.error("Failed to create assets directory:", error)
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
            "@":  resolve(__dirname, "src"),
            "@a": resolve(__dirname, "src", "assets"),
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
