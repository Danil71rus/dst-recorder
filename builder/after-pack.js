/**
 * electron-builder afterPack: ad-hoc подпись macOS-пакета.
 *
 * macOS (TCC) привязывает разрешения на запись экрана и микрофон к подписи приложения.
 * Без подписи система не может надёжно опознать Dst-Recorder: разрешения слетают после
 * пересборки или не применяются вовсе, а вложенные Helper-процессы получают отказ.
 *
 * Если для сборки настроен сертификат Developer ID (CSC_LINK / CSC_NAME), electron-builder
 * после этого хука переподпишет пакет настоящей подписью — хук этому не мешает.
 */
const { execFileSync } = require("child_process")
const { closeSync, lstatSync, openSync, readdirSync, readSync } = require("fs")
const { join } = require("path")

// Магические числа Mach-O: 32/64 бит в обоих порядках байт и универсальные (fat) бинарники
const MACH_O_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca])
// Вложенные бандлы (Electron Framework, Helper.app) подписывает codesign --deep целиком
const NESTED_BUNDLE = /\.(app|framework)$/

function isMachO(file) {
    const fd = openSync(file, "r")
    try {
        const header = Buffer.alloc(4)
        return readSync(fd, header, 0, 4, 0) === 4 && MACH_O_MAGICS.has(header.readUInt32BE(0))
    } finally {
        closeSync(fd)
    }
}

/** Отдельные исполняемые файлы вне вложенных бандлов: нативные модули из node_modules */
function findLooseBinaries(dir) {
    const result = []
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        const stat = lstatSync(path)
        if (stat.isSymbolicLink()) continue
        if (stat.isDirectory()) {
            if (!NESTED_BUNDLE.test(name)) result.push(...findLooseBinaries(path))
        } else if (stat.isFile() && isMachO(path)) {
            result.push(path)
        }
    }
    return result
}

/** Запускает codesign; при ошибке возвращает её текст (stderr), а не роняет процесс */
function codesign(args) {
    try {
        execFileSync("codesign", args, { stdio: ["ignore", "pipe", "pipe"] })
        return null
    } catch (error) {
        return (error.stderr?.toString() || error.message).trim()
    }
}

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return
    if (process.platform !== "darwin") {
        console.warn("[after-pack] codesign доступен только на macOS — пакет останется без подписи")
        return
    }

    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    const contents = join(appPath, "Contents")
    // Главный исполняемый файл нельзя подписывать отдельно: codesign тогда подписывает весь пакет
    // без --deep и падает на переименованном Helper.app. Его подпишет шаг с пакетом целиком
    const mainExecutable = join(contents, "MacOS", context.packager.appInfo.productFilename)

    const binaries = findLooseBinaries(contents).filter(path => path !== mainExecutable)
    console.log(`[after-pack] Ad-hoc signing ${binaries.length} binaries + bundle: ${appPath}`)
    for (const binary of binaries) {
        // Не критично: неподписанный бинарник в Resources всё равно запечатывается подписью пакета
        const error = codesign(["--force", "--sign", "-", binary])
        if (error) console.warn(`[after-pack] Skip ${binary}: ${error}`)
    }

    const bundleError = codesign(["--force", "--deep", "--sign", "-", appPath])
    if (bundleError) {
        throw new Error(`[after-pack] Не удалось подписать ${appPath}:\n${bundleError}`)
    }

    const verifyError = codesign(["--verify", "--deep", "--verbose=2", appPath])
    if (verifyError) {
        throw new Error(`[after-pack] Подпись не прошла проверку ${appPath}:\n${verifyError}`)
    }
    console.log("[after-pack] Signature OK")
}
