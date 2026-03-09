const path = require("path")
const fs = require("fs")
const { copyFileSync } = require("fs")
const { resolve } = require("path")

const isDevelopment = process.env.NODE_ENV === "development"

function isSVGFile(filePath) {
    return filePath.endsWith(".svg")
}

function createIconsJS(targetDir) {
    const svgDir = path.resolve(__dirname, "..", "src", "assets", "svg")

    if (!fs.existsSync(svgDir)) {
        console.warn(`SVG directory not found: ${svgDir}`)
        return
    }

    const svgs = fs.readdirSync(svgDir).filter(isSVGFile)

    if (svgs.length === 0) {
        console.warn("No SVG files found in", svgDir)
        return
    }

    console.log(`[Icons] Found ${svgs.length} SVG files`)

    const itlIcons = {}

    for (const svg of svgs) {
        const iconName = svg.slice(0, -4) // убираем расширение .svg
        const svgContent = fs.readFileSync(path.resolve(svgDir, svg), { encoding: "utf8" })
        itlIcons[iconName] = svgContent
        console.log(`[Icons] Added icon: ${iconName}`)
    }

    // Создаем директорию если не существует
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
    }

    const targetFile = path.resolve(targetDir, "assets", "itl-icons.js")
    const content = `export default ${JSON.stringify(itlIcons)}`
    fs.writeFileSync(targetFile, content, { flag: "w" })

    console.log(`[Icons] Generated successfully: ${targetFile}`)
    console.log(`[Icons] Total icons: ${Object.keys(itlIcons).length}`)
}

function iconTray(targetDir) {
    // Копируем иконки приложения
    const icons = ["camera.icns", "camera.ico", "camera.png"]
    icons.forEach(icon => {
        try {
            copyFileSync(
                resolve(__dirname, "..", `src/assets/${icon}`),
                resolve(targetDir, `assets/${icon}`),
            )
            console.log(`[Assets] Copied ${icon} to ${targetDir}/assets/`)
        } catch (error) {
            console.error(`[Assets] Failed to copy ${icon}:`, error)
        }
    })
}

function build() {
    console.log(`[Build] Mode: ${isDevelopment ? "development" : "production"}`)

    if (isDevelopment) {
        // В dev режиме генерируем только в dist-electron
        const targetDir = path.resolve(__dirname, "..", "dist-electron")
        console.log(`[Build] Target directory: ${targetDir}`)
        fs.mkdirSync(path.resolve(targetDir, "assets"), { recursive: true })
        iconTray(targetDir)
        createIconsJS(targetDir)
    } else {
        // В production режиме генерируем в обе директории
        // Сначала в dist-electron (нужно для импорта во время сборки)
        const distElectronDir = path.resolve(__dirname, "..", "dist-electron")
        console.log(`[Build] Target directory 1: ${distElectronDir}`)
        fs.mkdirSync(path.resolve(distElectronDir, "assets"), { recursive: true })
        createIconsJS(distElectronDir)

        // Затем в dist (для финальной сборки)
        const distDir = path.resolve(__dirname, "..", "dist")
        console.log(`[Build] Target directory 2: ${distDir}`)
        fs.mkdirSync(path.resolve(distDir, "assets"), { recursive: true })
        iconTray(distDir)
        createIconsJS(distDir)
    }
}

// Если скрипт запускается напрямую
if (require.main === module) {
    build()
}
module.exports = {
    build,
}
