#!/usr/bin/env bash
# Pasang kebutuhan lalu jalankan bot. Aman diulang. Untuk Termux (juga jalan di Linux biasa).
set -e
cd "$(dirname "$0")"
if command -v pkg >/dev/null 2>&1; then
  pkg update -y
  pkg install -y nodejs-lts git ffmpeg
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
fi
[ -d node_modules ] || npm install --no-audit --no-fund
exec npm start
