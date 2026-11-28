# Kebijakan keamanan

## Versi yang didukung
Hanya cabang `main` terbaru yang menerima perbaikan keamanan.

## Melaporkan kerentanan
**Jangan membuka issue publik** untuk kerentanan.

1. Buka tab **Security → Report a vulnerability** di repositori GitHub ini (laporan pribadi / GitHub Security Advisory).
2. Tulis: komponen (situs, panel bot, API bot, `build/`), langkah mengulang, dampak, dan versi (lihat angka versi di kaki beranda atau `CHANGELOG.md`).
3. Perkiraan respons: konfirmasi dalam 7 hari, perbaikan atau rencana dalam 30 hari untuk masalah yang terbukti.

Mohon **jangan** menyertakan kunci API, token, `bot/data/config.json`, berkas sesi WhatsApp, atau nomor pribadi di laporan. Bila perlu bukti, samarkan nilainya (`abcd…wxyz`).
Uji hanya terhadap instance milikmu sendiri; jangan mengirim pesan WhatsApp nyata ke orang lain dan jangan melakukan serangan beban.

## Rahasia yang dipakai bot
| Rahasia | Lokasi | Catatan |
|---|---|---|
| Kunci API / token pemilik (`ownerToken`) | `bot/data/config.json` (dibuat otomatis) atau `OWNER_TOKEN` di `.env` | Minimal 16 karakter. Dibandingkan dengan `timingSafeEqual`. Dicetak di terminal bot saat mulai. |
| Sesi WhatsApp (kredensial Baileys) | `bot/data/` | Siapa pun yang memegang folder ini dapat mengambil alih akun WhatsApp. |
| Sesi panel | token sesi di memori server (hilang saat bot restart) dan `localStorage` browser | Kedaluwarsa otomatis. Siapa pun yang bisa membaca `localStorage` perangkatmu dapat memakainya sampai kedaluwarsa; keluar lewat tombol logout panel, dan jangan masuk dari komputer bersama. |

`.env` dan `bot/data/` sudah ada di `.gitignore`. **Jangan** meng-commit, menempel di issue/chat, atau membagikan keduanya.

## Bila kunci bocor
1. Hentikan bot (`Ctrl+C`).
2. Ganti `OWNER_TOKEN` (atau hapus `ownerToken` di `bot/data/config.json`) dengan nilai acak baru ≥ 32 karakter, mis. `openssl rand -hex 32`.
3. Jalankan ulang bot dan masuk lagi di panel.
4. Jika folder `bot/data/` ikut bocor: di ponsel buka WhatsApp → Perangkat tertaut → keluarkan perangkat bot, hapus `bot/data/`, lalu pairing ulang.
5. Jika kunci pernah masuk ke commit Git: anggap sudah bocor (ganti kunci), lalu bersihkan riwayat (`git filter-repo`) dan cabut token GitHub terkait.

## Praktik yang disarankan
- Link panel dari terminal berbentuk `…/#bot=…&key=<kunci>`: kunci ada di *fragment* (tidak dikirim ke server) tetapi tersimpan di riwayat browser. Hapus riwayat bila memakai perangkat bersama.
- Gunakan header `Authorization: Bearer <kunci>` untuk `/api/send`. Parameter `?key=` ikut tercatat di log proxy, riwayat browser, dan header `Referer`.
- Batasi `ALLOWED_ORIGIN` ke alamat situs panelmu, jangan `*`.
- Pasang bot di belakang HTTPS (`TUNNEL=1`/Cloudflare Tunnel). Situs HTTPS tidak boleh memanggil bot HTTP non-localhost (diblokir browser sebagai mixed content).
- Di belakang tunnel/proxy, semua klien terlihat berasal dari alamat yang sama sehingga **batas percobaan login (5 gagal → kunci 10 menit) dan batas kirim bersifat global**: orang asing yang menebak 5 kali dapat mengunci login pemilik selama 10 menit (login benar pun ditolak dengan 429). Ini terkonfirmasi lewat tes (`tests/panel_e2e.py`) dan belum diubah karena menyangkut perilaku autentikasi. Gunakan kunci panjang dan jangan membagikan alamat bot.
- WhatsApp tidak mendukung bot tidak resmi; akun bisa dibatasi. Pakai nomor cadangan.
- Rotasi token GitHub/Cloudflare yang pernah ditempel di tempat tidak aman.

## Cakupan
Dalam cakupan: `index.html`, `tools/`, `sw.js`, `build/`, `bot/`. Di luar cakupan: kerentanan di WhatsApp, Cloudflare, atau pustaka hulu (laporkan ke mereka), serta serangan yang membutuhkan akses fisik ke perangkat.
