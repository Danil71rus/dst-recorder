// Удаляет результаты прошлой сборки: если новая сборка упадёт,
// в release/ не останется старый DMG, который легко установить по ошибке
const { rmSync } = require("fs")
const { join } = require("path")

rmSync(join(__dirname, "..", "release"), { recursive: true, force: true })
console.log("✓ release/ cleaned")
