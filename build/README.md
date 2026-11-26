# Build

Semua halaman di `tools/` dan `index.html` dirakit dari sumber di folder ini.

## Perintah
```
python3 build/build.py              # rakit semuanya
python3 build/build.py audio-tools  # satu alat baru saja
python3 build/build.py old          # sisipkan kit + kamus ke PDF/Image/Video Tools
python3 build/build.py index        # sisipkan kit + katalog pencarian ke index.html
python3 build/catalog.py            # buat ulang katalog pencarian (butuh: pip install playwright)
```
Urutan setelah mengubah alat: `build.py` → `catalog.py` → `build.py index`.

## Isi
- `kit.js` / `kit.css`: tema, bahasa, penerjemah DOM, sinkron antar-frame, deep-link, PWA. Dipakai SEMUA halaman.
- `skins.py`: palet 10 tema (tambah satu entri di `SKINS` untuk tema baru).
- `hub.js` / `hub.css`: kerangka alat baru (komponen UI, ZIP, berkas).
- `apps/*.js`: isi tiap alat baru. Teks UI ditulis `_('Indonesia','English')`.
- `i18n-en.json`: kamus Indonesia → English untuk PDF/Image/Video Tools (kunci = teks Indonesia persis).
- `vendor/`: library pihak ketiga (lihat lisensi di bawah).

## Menambah bahasa
Di akhir `kit.js` boot, atau dari file kamus baru: `KIT.regLang('ms','Bahasa Melayu',{ "Teks Indonesia":"Teks Melayu", ... })`.
Teks yang belum ada otomatis jatuh ke English.

## Lisensi library (di-inline ke halaman)
- lamejs (MP3 encoder) — LGPL-3.0
- qrcode-generator — MIT
- jsQR — Apache-2.0
- JsBarcode — MIT
