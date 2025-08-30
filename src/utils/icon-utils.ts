import { join } from "path";
import { app } from "electron";
import { existsSync } from "fs";

export function getIconPath(): string {
    const isDev = !app.isPackaged;

    // Выбираем имя файла по платформе
    const fileName =
        process.platform === "darwin"
            ? "camera.icns"
            : process.platform === "win32"
                ? "camera.ico"
                : "camera.png";

    const candidates = isDev
        ? [
            // Dev: исходники
            join(process.cwd(), "src/assets", fileName),
            // На случай если dev-сервер упал, но сборка dist есть
            join(process.cwd(), "dist/assets", fileName),
        ]
        : [
            // Prod: внутри asar
            join(app.getAppPath(), "src/assets", fileName),
            join(app.getAppPath(), "dist/assets", fileName),
            // Prod: прямой путь через resources -> app.asar
            join(process.resourcesPath, "app.asar", "src/assets", fileName),
            join(process.resourcesPath, "app.asar", "dist/assets", fileName),
            // Prod: как extra resource (если когда-то перенесём)
            join(process.resourcesPath, "assets", fileName),
        ];

    let resolved = candidates.find(p => {
        try {
            return existsSync(p);
        } catch {
            return false;
        }
    });

    if (!resolved) {
        // Фоллбек: пробуем png по умолчанию из исходников
        resolved = join(isDev ? process.cwd() : app.getAppPath(), "src/assets", "camera.png");
        console.warn("[Icon] No icon found in candidates, fallback to:", resolved);
    }

    console.log(`[Icon] Selected path: ${resolved}`);
    console.log(`[Icon] App packaged: ${app.isPackaged} | AppPath: ${app.getAppPath()} | Resources: ${process.resourcesPath}`);
    return resolved;
}