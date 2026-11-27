# Shin Bot (WhatsApp, gratis)

Bot WhatsApp tanpa API berbayar. Jalankan, buka link yang muncul, selesai.

## Termux (Android), satu perintah
```
pkg update -y && pkg upgrade -y && pkg install -y git && git clone https://github.com/Shin-Von-Reinhaver/Project_Tools-Web-View.git && cd Project_Tools-Web-View/bot && bash termux.sh
```
Ganti `USERNAME/REPO` dengan repo kamu. Jika repo hanya berisi isi folder `bot`, hapus `/bot`.
`termux.sh` memasang Node.js, git, ffmpeg, menjalankan `npm install`, mengaktifkan wake-lock, lalu `npm start`.

Setelah itu:
1. Terminal bertanya **nomor WhatsApp bot** (contoh `6281234567890`). Masukkan, lalu muncul **kode tautan**.
2. WhatsApp → Perangkat tertaut → Tautkan perangkat → *Tautkan dengan nomor telepon* → masukkan kode.
3. Panel terbuka otomatis di browser HP (kalau tidak, buka "Link panel" dari terminal).

Run ulang berikutnya cukup `cd REPO/bot && npm start`. Agar tetap jalan saat layar mati: `pkg install tmux`, jalankan di dalam `tmux`, dan matikan penghematan baterai untuk Termux.
Di Termux `sharp` tidak ada, jadi gambar diolah dengan ffmpeg (hasil sama, sedikit lebih lambat).

## PC / server
Node.js 20+ dan ffmpeg, lalu `npm install && npm start`. Link panel muncul di terminal, QR tampil di terminal dan panel.

Tanpa file `.env` bot tetap jalan: kunci dibuat otomatis (`data/config.json`) dan nomor yang ditautkan menjadi pemilik.

## Dari situs https (HTTPS gratis)
Panel di situs https hanya bisa memanggil bot lewat alamat https (kecuali localhost). Pasang [cloudflared](https://github.com/cloudflare/cloudflared/releases) lalu isi `.env`: `TUNNEL=1` dan `PANEL_URL=https://situsmu.example`.

## API kirim pesan (gratis)
```
GET  /api/send?key=KUNCI&to=6281234567890&message=Halo
POST /api/send   Authorization: Bearer KUNCI   {"to":"6281234567890","message":"Halo"}
```
Maksimal 30 permintaan per menit. `GET /api/status` publik.

## Perintah utama
| Perintah | Fungsi |
|---|---|
| `.stiker` | Gambar/video/GIF jadi stiker (aturan WhatsApp: 512×512, WebP, maks 500 KB, maks 10 detik) |
| `.stiker 6` / `.stiker 70%` | Atur sendiri durasi (detik) atau resolusi bila hasil terlalu besar. Tanpa angka, bot menyesuaikan otomatis dan memberi tahu |
| `.stiker crop` | Isi penuh bingkai (potong tepi) |
| `.toimg` | Stiker jadi gambar (GIF bila animasi) |
| `.tomp3` | Video atau pesan suara jadi MP3 |
| `.kompresvideo 10` | Kecilkan video ke ±10 MB (batas kirim WhatsApp 16 MB) |
| `.potong 5 15` | Potong video dari detik 5 sampai 15 (boleh `0:30 1:10`) |
| `.ingatkan 10m minum obat` | Pengingat: `d`=detik `m`=menit `j`=jam `h`=hari (mis. `1j30m`) atau jam `14:30`. Lihat `.pengingatku`, batalkan `.batalingat 3` |

### Sinkron dengan alat web
Bot sekarang punya padanan hampir semua alat web (71 perintah). Ketik `.menu` untuk kartu menu berkategori, `.menu <nomor/nama>` untuk detail satu kategori (mis. `.menu 4`, `.menu developer`), dan `.menu semua` untuk semuanya. Perintah teks juga jalan bila kamu **membalas** sebuah pesan (mis. balas teks lalu `.hitungkata`).

| Kategori | Perintah |
|---|---|
| 🧮 Utilitas | `.hitung` (ilmiah) `.persen` `.diskon` `.margin` `.satuan` `.kurs` `.cicilan` `.tabungan` `.bagi` `.bmi` `.sandi` `.umur` `.selisih` `.tambahhari` `.weton` `.acak` `.tim` `.pilih` `.dadu` |
| ✍️ Teks | `.huruf` `.hitungkata` `.gaya` `.terbilang` `.romawi` `.rapikan` |
| 💻 Developer | `.json` `.base64` `.hash` `.uuid` `.jwt` `.waktu` `.url` `.warna` `.encode` `.decode` `.regex` `.cron` |
| 🔳 QR & Link | `.qr` `.qrwifi` `.walink` |
| 🖼️ Stiker & Gambar | `.stiker` `.toimg` `.resize` `.kompres` `.topdf` `.pdfadd` `.pdfdone` `.filter` |
| 🎬 Video & Audio | `.tomp3` `.kompresvideo` `.potong` `.audio` `.kecepatan` `.bisu` `.mundur` `.putar` `.togif` `.frame` |

Contoh: `.diskon 250000 30 10 11` · `.cicilan 300jt 9 120` · `.satuan 5 km m` · `.audio nightcore` (balas audio) · `.filter sepia` (balas gambar) · `.kecepatan 2` (balas video).

Daftar lengkap: `.menu`. Pengaturan opsional ada di `.env.example`. Docker: `docker build -t shinbot . && docker run -p 3000:3000 -v $PWD/data:/app/data -v $PWD/auth:/app/auth shinbot`.
Tes: `npm test` (tes media: `TEST_IMG=gambar.jpg TEST_VID=video.webm npm test`).
