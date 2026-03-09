const { execSync } = require('child_process');
const { join } = require('path');
const { existsSync } = require('fs');

console.log('Running postinstall script...');

// Проверяем наличие electron
const electronPath = join(__dirname, '..', 'node_modules', '.pnpm', 'electron@37.2.2', 'node_modules', 'electron');

if (existsSync(electronPath)) {
  const installScript = join(electronPath, 'install.js');

  if (existsSync(installScript)) {
    try {
      console.log('Installing Electron binary...');
      execSync(`node "${installScript}"`, {
        cwd: electronPath,
        stdio: 'inherit'
      });
      console.log('✓ Electron installed successfully');
    } catch (error) {
      console.error('Failed to install Electron:', error.message);
      // Не выходим с ошибкой, чтобы не блокировать установку других пакетов
    }
  }
} else {
  console.log('Electron not found in node_modules, skipping...');
}

// Также запускаем ffmpeg-ffprobe-static install если нужно
const ffmpegPath = join(__dirname, '..', 'node_modules', '.pnpm', 'ffmpeg-ffprobe-static@6.1.2-rc.1', 'node_modules', 'ffmpeg-ffprobe-static');

if (existsSync(ffmpegPath)) {
  const ffmpegInstallScript = join(ffmpegPath, 'install.js');

  if (existsSync(ffmpegInstallScript)) {
    try {
      console.log('Installing FFmpeg binaries...');
      execSync(`node "${ffmpegInstallScript}"`, {
        cwd: ffmpegPath,
        stdio: 'inherit'
      });
      console.log('✓ FFmpeg installed successfully');
    } catch (error) {
      console.error('Failed to install FFmpeg:', error.message);
    }
  }
}

console.log('Postinstall completed!');
