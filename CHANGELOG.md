# Changelog

Format: tanggal (WIB) · ringkasan. Versi di kaki beranda = judul `## YYYY-MM-DD` teratas. Versi cache PWA otomatis berubah setiap `python3 build/build.py` (hash isi situs).

## 2026-11-29
### Ditambah
- `LICENSE` (MIT untuk kode), `THIRD_PARTY_NOTICES.md`, `SECURITY.md`, `CONTRIBUTING.md`.
- Indikator versi di kaki beranda (tautan ke changelog; tooltip menampilkan versi cache).
- `build.py --check` kini membangun ulang di salinan sementara dan membandingkan semua hasil (`index.html`, `sw.js`, `tools/*.html`) dengan isi repo.

### Diperbaiki
- `build.py` tidak idempoten: setiap build menambah satu baris kosong di `index.html`, sehingga hash versi cache ikut berubah.

## 2026-11-28
### Diperbaiki
- **Beranda mati bila preferensi tersimpan rusak.** `postMessage` dari halaman mana pun bisa menyimpan tema/bahasa sembarang ke `localStorage`, dan setelah dimuat ulang `index.html` error `Cannot read properties of undefined (reading 'bio')`. Kini pesan hanya diterima dari iframe/parent sendiri, nilai divalidasi (`build/kit.js`), dan `index.html` memulihkan nilai rusak.
- **Tombol (?) bersarang di dalam tombol kartu** pada Audio/Dev/QR/Teks/Utilitas (pelanggaran `nested-interactive` axe, 228 node). Kini tombol bantuan adalah saudara dari tombol kartu.
- **Kotak "Cara pakai" di Video Tools** mengecil jadi lingkaran 22×22 px karena bentrok kelas `.hq`.
- Kontras tombol "Connect" panel bot (4,09 → ≥ 4,5) dan teks `.tag` di PDF Tools.
- Halaman alat memakai landmark `<main>`.
- Terjemahan English Video/Image Tools yang masih bercampur Indonesia.
- Kalkulator: `-2^2` = −4; hasil sangat kecil seperti `1.2e-16` jadi 0; tautan `javascript:` di pratinjau Markdown dinetralkan; panah roda undian tidak terpotong; pesan galat JWT.

### Ditambah
- Tombol bantuan (?) dan unggah berkas / tempel di semua kotak teks; input warna dan QR manual.
- Bot WhatsApp: 71 perintah (padanan alat web) dan menu berkategori baru.
- `tests/ui_smoke.py` (tes UI Playwright), `build/build.py --check`, versi cache otomatis.
