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
    // Определяем целевую директорию в зависимости от режима
    const targetDir = isDevelopment
        ? path.resolve(__dirname, "..", "dist-electron")
        : path.resolve(__dirname, "..", "dist")

    console.log(`[Build] Mode: ${isDevelopment ? "development" : "production"}`)
    console.log(`[Build] Target directory: ${targetDir}`)

    // Создаём директорию assets если её нет
    fs.mkdirSync(path.resolve(targetDir, "assets"), { recursive: true })
    iconTray(targetDir)
    createIconsJS(targetDir)
}

// Если скрипт запускается напрямую
if (require.main === module) {
    build()
}
module.exports = {
    build,
}
