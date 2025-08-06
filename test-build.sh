#!/bin/bash

echo "=== Testing FFmpeg in build ==="

# Очищаем старую сборку
rm -rf release
rm -rf bin

# Запускаем копирование FFmpeg
echo "Running copy-ffmpeg script..."
node scripts/copy-ffmpeg.js

# Проверяем, что файлы скопировались
echo -e "\nChecking bin directory:"
ls -la bin/

# Собираем приложение
echo -e "\nBuilding app..."
npm run build:mac

# Проверяем содержимое ресурсов в собранном приложении
echo -e "\nChecking built app resources:"
if [ -d "release/mac-arm64/Dst-Recorder.app" ]; then
    echo "Checking arm64 build:"
    ls -la "release/mac-arm64/Dst-Recorder.app/Contents/Resources/bin/" 2>/dev/null || echo "bin directory not found in arm64 build"
fi

if [ -d "release/mac/Dst-Recorder.app" ]; then
    echo "Checking x64 build:"
    ls -la "release/mac/Dst-Recorder.app/Contents/Resources/bin/" 2>/dev/null || echo "bin directory not found in x64 build"
fi

echo -e "\nBuild test completed!"