const { existsSync } = require('fs');
const { join } = require('path');
const { platform, arch } = process;

console.log('Platform:', platform);
console.log('Architecture:', arch);
console.log('---');

// Проверяем пути в режиме разработки
const devPaths = [
  'node_modules/ffmpeg-ffprobe-static/ffmpeg',
  'node_modules/ffmpeg-ffprobe-static/ffmpeg.exe',
  'node_modules/@ffmpeg-installer/ffmpeg/ffmpeg',
  'node_modules/@ffmpeg-installer/ffmpeg/ffmpeg.exe'
];

console.log('Development paths:');
devPaths.forEach(path => {
  const exists = existsSync(path);
  console.log(`${exists ? '✓' : '✗'} ${path}`);
});

console.log('\n---');

// Проверяем пути в собранном приложении (для симуляции)
const resourcesPath = process.env.RESOURCES_PATH || '/path/to/app/resources';
const prodPaths = [
  join(resourcesPath, 'bin', 'ffmpeg'),
  join(resourcesPath, 'bin', 'ffmpeg.exe'),
  join(resourcesPath, 'bin', `${platform}-${arch}`, 'ffmpeg'),
  join(resourcesPath, 'bin', `${platform}-${arch}`, 'ffmpeg.exe'),
  join(resourcesPath, 'bin', platform, arch, 'ffmpeg'),
  join(resourcesPath, 'bin', platform, arch, 'ffmpeg.exe')
];

console.log('Production paths (simulated):');
prodPaths.forEach(path => {
  console.log(`- ${path}`);
});

// Проверяем, какой файл действительно существует
try {
  const ffmpegStatic = require('ffmpeg-ffprobe-static');
  console.log('\nffmpeg-ffprobe-static paths:');
  console.log('ffmpeg:', ffmpegStatic.ffmpegPath);
  console.log('ffprobe:', ffmpegStatic.ffprobePath);
  console.log('ffmpeg exists:', existsSync(ffmpegStatic.ffmpegPath));
  console.log('ffprobe exists:', existsSync(ffmpegStatic.ffprobePath));
} catch (e) {
  console.error('\nError loading ffmpeg-ffprobe-static:', e.message);
}