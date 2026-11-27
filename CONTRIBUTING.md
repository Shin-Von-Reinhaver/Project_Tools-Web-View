# Berkontribusi

1. Ubah **sumber**, bukan hasil build: `build/apps/*.js`, `build/hub.js|css`, `build/kit.js|css`, `build/i18n-en.json`. `tools/utility|text|dev|qr|audio-tools.html` adalah hasil `python3 build/build.py`.
   `index.html`, `tools/pdf-tools.html`, `tools/image-tools.html`, `tools/video-tools.html` ditulis tangan; build hanya menyuntikkan kit dan kamus bahasa.
2. Jalankan `python3 build/build.py`, lalu `python3 build/build.py --check` (harus lulus) dan commit hasil build bersama sumbernya.
3. Tes lokal: `cd bot && npm ci && npm test` dan `python3 tests/ui_smoke.py` (lihat README). CI menjalankan semuanya pada setiap PR.
4. Tambahkan baris di `CHANGELOG.md` (judul `## YYYY-MM-DD`); angka versi di kaki beranda diambil dari judul teratas.
5. Jangan menempelkan rahasia (lihat `SECURITY.md`).
