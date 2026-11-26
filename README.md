# Shin Tools (Project_Tools-Web-View)

Kumpulan alat web yang berjalan sepenuhnya di browser: PDF, gambar, video, audio, QR & kode, teks, utilitas harian, dan developer tools. Berkas tidak diunggah ke server. Bisa dipasang sebagai aplikasi (PWA) dan dipakai offline.

## Isi
| Folder / berkas | Fungsi |
|---|---|
| `index.html` | Beranda: daftar alat, pencarian global (Ctrl+K atau `/`), tema & bahasa, panel WhatsApp Bot |
| `tools/*.html` | 8 alat mandiri (PDF, Image, Video, Audio, Utilitas, Dev, QR, Teks) |
| `build/` | Sumber & skrip perakit halaman (lihat `build/README.md`) |
| `bot/` | WhatsApp Bot (Node.js 20+) yang bisa dikendalikan dari panel di beranda |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: cache offline dan ikon |

## Fitur beranda
- Pencarian global ke seluruh alat, termasuk deskripsi tiap fitur
- Strip **Terakhir dibuka** untuk akses cepat
- Penanda **mode offline**
- Tema (11 pilihan) dan bahasa ID/EN
- Tautan langsung ke alat: `index.html#pdf-tools`, `#image-tools`, `#video-tools`, `#audio-tools`, `#utility-tools`, `#dev-tools`, `#qr-tools`, `#text-tools`

## Menjalankan
Situs ini statis. Cukup sajikan foldernya, mis. `python3 -m http.server 8080`, atau pakai GitHub Pages / Netlify. Service worker butuh `http(s)`, bukan `file://`.

## Mengubah alat
```
python3 build/build.py      # rakit semua halaman
python3 build/catalog.py    # buat ulang katalog pencarian (butuh playwright)
python3 build/build.py index
```
Jangan sunting `tools/audio-tools.html`, `dev-tools.html`, `qr-tools.html`, `text-tools.html`, `utility-tools.html` langsung; ubah `build/apps/*.js` lalu rakit ulang. Setiap kali berkas yang di-cache berubah, naikkan `VERSION` di `sw.js`.

## Bot
Lihat `bot/README.md`. Tes: `cd bot && npm ci && npm test`.

## Catatan keamanan
Jangan menempelkan token GitHub atau kunci API di chat/issue. Bot membuat kunci sendiri di `bot/data/config.json` (sudah di `.gitignore`).
