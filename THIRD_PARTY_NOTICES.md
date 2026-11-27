# Pemberitahuan pihak ketiga

Lisensi MIT di `LICENSE` berlaku untuk **kode buatan proyek ini** (HTML/CSS/JS di `index.html`, `tools/`, `build/`, `sw.js`, `bot/src`, `tests/`).
Hal berikut **tidak** tercakup oleh lisensi tersebut:

## Aset gambar
`media/images/*` (foto/ilustrasi profil) dan `icons/*` tidak dilisensikan lewat MIT. Hak cipta tetap pada pemiliknya; jangan memakai ulang tanpa izin. Pemilik repositori perlu memastikan hak atas gambar profil.

## Pustaka yang disertakan (`build/vendor/`, ikut tertanam di halaman hasil build)
Nama dan lisensi di bawah ini berdasarkan proyek hulu yang dikenali dari kode; **periksa ulang versi dan lisensinya sebelum rilis publik** karena berkas hasil minifikasi tidak menyertakan semua header.

| Berkas | Proyek hulu | Lisensi hulu |
|---|---|---|
| `jsbarcode.min.js` | JsBarcode 3.12.3 (Johan Lindell) | MIT (tertulis di header berkas) |
| `terser.min.js` | Terser | BSD-2-Clause (tertulis di berkas) |
| `jsqr.min.js` | jsQR (Cosmo Wolfe) | Apache-2.0 |
| `qrcode.min.js` | qrcode-generator (Kazuhiko Arase) | MIT |
| `beautifier.min.js` | js-beautify | MIT |
| `lame.min.js` | lamejs | **LGPL-3.0** — berkas ini terpisah dan dapat diganti; jika kamu mendistribusikan situs, sertakan pemberitahuan ini dan tautan ke sumbernya |

## Kode pihak ketiga di dalam `tools/*.html`
Halaman PDF/Image/Video memuat atau menyertakan pustaka seperti pdf.js, pdf-lib, dan UpscalerJS (umumnya Apache-2.0/MIT). Lisensi masing-masing tetap berlaku.

## Dimuat dari CDN saat dipakai (tidak disalin ke repo)
- Prettier 3.6.2 (MIT) — fitur Rapikan di beranda (`cdn.jsdelivr.net`).
- tesseract.js 5.1.0 (Apache-2.0) — OCR (`cdn.jsdelivr.net`).
- Google Fonts (SIL Open Font License) — huruf antarmuka.

## Dependensi bot (`bot/package.json`)
`@whiskeysockets/baileys` (MIT), `node-webpmux` (MIT), `pdf-lib` (MIT), `pino` (MIT), `qrcode` (MIT), `sharp` (Apache-2.0, opsional). Bot berinteraksi dengan WhatsApp lewat pustaka tidak resmi; lihat `SECURITY.md` dan `bot/README.md` untuk risikonya.
