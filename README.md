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
- Tombol **?** di setiap alat (kartu dan bilah atas) berisi penjelasan singkat dan langkah pakai
- Semua kotak teks di alat punya **Unggah berkas** (txt, json, csv, md, kode, dll.), **Tempel** dari papan klip, dan seret-lepas berkas; mengetik manual tetap bisa
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

## Tes & CI
Rincian di `docs/TESTING.md` dan `docs/CI.md`. Singkatnya:
```bash
python3 build/build.py --check                      # hasil build konsisten dengan sumber di build/
(cd bot && npm ci && npm test)                      # tes bot
pip install -r tests/requirements.txt && python3 -m playwright install chromium && (cd tests && npm ci)
python3 tests/ui_smoke.py && python3 tests/pwa_update.py && python3 tests/panel_e2e.py && python3 tests/a11y.py
```
Setelah mengubah sumber di `build/`, jalankan `python3 build/build.py` dan commit hasilnya. Tes tidak menyambung ke WhatsApp.

## Keamanan, lisensi, kontribusi
`SECURITY.md` (cara melapor kerentanan dan menangani kunci bot), `LICENSE` (MIT untuk kode; aset gambar dan pustaka pihak ketiga dijelaskan di `THIRD_PARTY_NOTICES.md`), `CONTRIBUTING.md`.

## Lapor bug & riwayat perubahan
Buat issue lewat template *Laporan bug*. Riwayat ada di `CHANGELOG.md`. Versi situs tampil di kaki beranda dan mengikuti judul teratas `CHANGELOG.md`.

## Catatan keamanan
Jangan menempelkan token GitHub atau kunci API di chat/issue. Bot membuat kunci sendiri di `bot/data/config.json` (sudah di `.gitignore`).
