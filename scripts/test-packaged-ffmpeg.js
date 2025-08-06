const { app } = require('electron');
const { join } = require('path');
const { existsSync, readdirSync } = require('fs');

console.log('=== FFmpeg Path Diagnostics ===');
console.log('App packaged:', app.isPackaged);
console.log('App path:', app.getAppPath());
console.log('Exe path:', app.getPath('exe'));
console.log('Resources path:', process.resourcesPath);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('');

// Проверяем различные возможные пути
const pathsToCheck = [
    process.resourcesPath,
    join(process.resourcesPath, 'bin'),
    join(process.resourcesPath, '..', 'bin'),
    join(app.getPath('exe'), '..', '..', 'Resources'),
    join(app.getPath('exe'), '..', '..', 'Resources', 'bin'),
    join(app.getAppPath(), 'bin'),
    join(app.getAppPath(), '..', 'bin'),
    join(app.getAppPath(), '..', '..', 'bin')
];

console.log('Checking directories:');
pathsToCheck.forEach(path => {
    if (existsSync(path)) {
        console.log(`\n✓ Directory exists: ${path}`);
        try {
            const files = readdirSync(path);
            const relevantFiles = files.filter(f => 
                f.includes('ffmpeg') || 
                f.includes('ffprobe') || 
                f === 'bin' ||
                f.endsWith('.exe')
            );
            if (relevantFiles.length > 0) {
                console.log('  Contains:', relevantFiles.join(', '));
            }
        } catch (e) {
            console.log('  (Cannot read directory)');
        }
    } else {
        console.log(`✗ Directory not found: ${path}`);
    }
});

// Специфичные для платформы проверки
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const specificPaths = [
    join(process.resourcesPath, 'bin', ffmpegName),
    join(process.resourcesPath, '..', 'bin', ffmpegName),
    join(app.getPath('exe'), '..', '..', 'Resources', 'bin', ffmpegName),
    join(app.getAppPath(), 'bin', ffmpegName),
    join(app.getAppPath(), '..', 'bin', ffmpegName)
];

console.log(`\nChecking for ${ffmpegName}:`);
specificPaths.forEach(path => {
    const exists = existsSync(path);
    console.log(`${exists ? '✓' : '✗'} ${path}`);
});