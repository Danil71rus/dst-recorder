import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import electron from "vite-plugin-electron"
import { resolve } from "path"

export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        entry: "src/main.ts",
        onstart(options) {
          if (options.startup) {
            options.startup()
          }
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: [
                "electron",
                "fluent-ffmpeg",
                "ffmpeg-ffprobe-static"
              ],
            },
          },
        },
      },
      {
        entry: "src/preload.ts",
        onstart(options) {
          if (options.reload) {
            options.reload()
          }
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: [
                "electron",
                "fluent-ffmpeg",
                "ffmpeg-ffprobe-static"
              ],
            },
          },
        },
      },
    ]),
  ],
  resolve: {
      preserveSymlinks: true,
        alias: {
            "@": resolve(__dirname, "src"),
            "@a": resolve(__dirname, "src", "assets"),
        },
  },
  // Для Electron приложений всегда используем относительные пути
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Добавляем настройки для правильной работы в Electron
    rollupOptions: {
      output: {
        format: "es"
      }
    }
  },
  server: {
    port: 5173,
    host: true,
  },
})
