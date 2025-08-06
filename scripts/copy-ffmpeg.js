const { copyFileSync, mkdirSync, existsSync, chmodSync } = require('fs');
const { join, dirname } = require('path');
const { platform } = process;

const ffmpegStatic = require('ffmpeg-ffprobe-static');

// Создаем директорию bin если она не существует
const binDir = join(__dirname, '..', 'bin');
if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true });
}

try {
  // Копируем ffmpeg
  const ffmpegSource = ffmpegStatic.ffmpegPath;
  const ffmpegDest = join(binDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  
  if (existsSync(ffmpegSource)) {
    copyFileSync(ffmpegSource, ffmpegDest);
    console.log(`✓ Copied ffmpeg from ${ffmpegSource} to ${ffmpegDest}`);
    
    // Устанавливаем права на выполнение (только для Unix-подобных систем)
    if (platform !== 'win32') {
      chmodSync(ffmpegDest, 0o755);
      console.log(`✓ Set executable permissions for ffmpeg`);
    }
  } else {
    console.error(`✗ ffmpeg not found at ${ffmpegSource}`);
  }

  // Копируем ffprobe
  const ffprobeSource = ffmpegStatic.ffprobePath;
  const ffprobeDest = join(binDir, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  
  if (existsSync(ffprobeSource)) {
    copyFileSync(ffprobeSource, ffprobeDest);
    console.log(`✓ Copied ffprobe from ${ffprobeSource} to ${ffprobeDest}`);
    
    // Устанавливаем права на выполнение (только для Unix-подобных систем)
    if (platform !== 'win32') {
      chmodSync(ffprobeDest, 0o755);
      console.log(`✓ Set executable permissions for ffprobe`);
    }
  } else {
    console.error(`✗ ffprobe not found at ${ffprobeSource}`);
  }

  console.log('\nFFmpeg binaries copied successfully!');
} catch (error) {
  console.error('Error copying ffmpeg binaries:', error);
  process.exit(1);
}