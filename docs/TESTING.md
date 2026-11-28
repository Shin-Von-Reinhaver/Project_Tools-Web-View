# Pengujian

## Terotomatisasi (berjalan di CI)
| Berkas | Yang diuji |
|---|---|
| `bot/test/*.test.js` | Perintah bot, menu, API, pengingat, efek media (ffmpeg) |
| `tests/ui_smoke.py` | Semua halaman alat terbuka tanpa galat, tombol bantuan, tanpa overflow 320–1280 px, preferensi rusak, offline, versi cache |
| `tests/pwa_update.py` | Service worker + rilis baru dengan header `Cache-Control: max-age=600` (seperti GitHub Pages): HTML, aset, cache lama, offline |
| `tests/panel_e2e.py` | Panel bot: login, sesi kedaluwarsa, kunci salah, penguncian 5×gagal, pairing (stub), mixed-content HTTPS→HTTP |
| `tests/a11y.py` | Kontras di 11 tampilan (default terang/gelap + 10 skin), axe WCAG A/AA, keyboard, dialog/fokus/Escape, reduced-motion |

Masalah aksesibilitas yang sudah diketahui dan belum diperbaiki terdaftar di `KNOWN` pada `tests/a11y.py` (kartu PDF/Image: tombol bersarang).

## Yang tetap perlu dicoba manual
Lingkungan otomatis hanya mencakup Chromium (dan Firefox/WebKit di CI sebagai informasi). Hal berikut membutuhkan perangkat/akun nyata:

**Safari (iOS/macOS) dan Chrome stabil**
- [ ] Tambahkan ke Layar Utama (iOS) / Pasang aplikasi (Chrome): ikon, nama, layar penuh.
- [ ] Mode pesawat: beranda dan 3 alat terbuka; alat PDF/Image/Video yang memuat pustaka CDN (Prettier, tesseract) menampilkan pesan "butuh internet", bukan layar kosong.
- [ ] Rilis baru → buka aplikasi dua kali → konten baru muncul (lihat angka versi di kaki beranda).
- [ ] Safari menghapus data situs yang tidak dipakai ±7 hari (kecuali terpasang di Layar Utama): cache offline dapat hilang; pastikan situs tetap bisa dimuat ulang.
- [ ] Safari iOS: unggah berkas, tombol Tempel (izin papan klip), unduhan ZIP/PDF.

**Panel bot dengan HTTPS sungguhan**
- [ ] Situs HTTPS → bot lewat Cloudflare Tunnel (HTTPS): tersambung.
- [ ] Situs HTTPS → bot `http://192.168.x.x`: panel menampilkan petunjuk mixed-content (diblokir browser).
- [ ] Safari: `https` → `http://localhost` (perilakunya berbeda antar browser; Chromium mengizinkan).
- [ ] Pairing dengan nomor cadangan milikmu sendiri (satu-satunya langkah yang menyambung ke WhatsApp nyata).

**Aksesibilitas dengan pembaca layar**
- [ ] VoiceOver/TalkBack: tombol ?, dialog bantuan, kartu alat, hasil kalkulator terbaca jelas.
