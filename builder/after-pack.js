/**
 * electron-builder afterPack: ad-hoc подпись macOS-пакета.
 *
 * Без подписи macOS (TCC) не может приписать разрешения дочернего процесса приложению,
 * и пользователю приходится отдельно разрешать запись экрана и микрофон для ffmpeg.
 * С подписанным пакетом ffmpeg (дочерний процесс) пользуется разрешениями Dst-Recorder.
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

/** Отдельные исполняемые файлы вне вложенных бандлов: ffmpeg, ffprobe, нативные модули из node_modules */
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

function codesign(args) {
    execFileSync("codesign", args, { stdio: "inherit" })
}

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return
    if (process.platform !== "darwin") {
        console.warn("[after-pack] codesign доступен только на macOS — пакет останется без подписи")
        return
    }

    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    const contents = join(appPath, "Contents")

    const binaries = findLooseBinaries(contents)
    console.log(`[after-pack] Ad-hoc signing ${binaries.length} binaries in ${appPath}`)
    for (const binary of binaries) codesign(["--force", "--sign", "-", binary])

    codesign(["--force", "--deep", "--sign", "-", appPath])
    codesign(["--verify", "--deep", "--strict", "--verbose=2", appPath])
}
