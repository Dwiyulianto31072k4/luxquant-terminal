# Panduan: Potential Trades (Signals Page)

Halaman **Potential Trades** menampilkan sinyal trading yang dihasilkan algoritma
LuxQuant dalam bentuk tabel (Signals Table). Tiap baris = satu sinyal untuk satu
pair (misalnya BTCUSDT). Dokumen ini menjelaskan cara memakainya.

## Cara membaca satu baris sinyal (kolom)

- **Pair** — pasangan koin, mis. `BTCUSDT` (koin BTC dihargai dalam USDT).
- **Price** — harga terkini pair tersebut, beserta perubahan persentasenya.
- **Entry** — harga masuk yang disarankan sinyal.
- **Target** — target ambil-untung (take profit). Sinyal bisa punya beberapa target
  (TP1–TP4). Nilai hijau menunjukkan jarak ke target dari entry.
- **Stop Loss (SL)** — harga batas rugi; kalau tersentuh, sinyal ditutup rugi.
- **Risk** — level risiko sinyal: `NORMAL` atau `HIGH`. HIGH artinya lebih volatil /
  berisiko lebih besar.
- **MCap** — kapitalisasi pasar koin (indikasi ukuran; kecil = small-cap).
- **Vol 24H** — volume perdagangan 24 jam (likuiditas).
- **WR / Streak** — **Win Rate**: persentase historis sinyal pola ini yang berhasil
  kena target. **Streak**: rentetan menang/kalah beruntun terkini (mis. ▲2W = 2 kali
  menang beruntun, ▼1L = 1 kali kalah).
- **BTC Corr** — korelasi terhadap Bitcoin. Angka ρ (rho) dan β (beta) menunjukkan
  seberapa searah dan sekuat pergerakan koin mengikuti BTC. "Decoupled" = bergerak
  lepas dari BTC.
- **Verdict** — penilaian ringkas Coin Intelligence: `WORTH IT` (layak) beserta skor,
  atau tanda hindari.
- **Status** — kondisi sinyal saat ini: `OPEN` (masih berjalan), `TP1`/`TP2`/`TP3`/`TP4`
  (target ke-n sudah kena), `WIN` (ditutup untung), `LOSS` (kena stop loss).
- **Called Time** — kapan sinyal dipanggil (dibuat), plus "x jam lalu".

## Cara memfilter sinyal (Call Filter)

- **Tab tanggal** — Watchlist, All Days, Today, Yesterday, atau tanggal spesifik.
  Angka di sebelah label = jumlah sinyal pada hari itu.
- **Search pair** — ketik nama koin untuk menyaring. Pencariannya berbasis token:
  ketik `BTC` untuk semua yang diawali BTC, atau `BTCUSDT` untuk kecocokan pair persis.
- **Called Time / urutan** — mengatur pengurutan (terbaru/terlama, dsb).
- **Advanced Filters** (bagian yang bisa dibuka):
  - **Status** — saring berdasarkan open / updated / hasil.
  - **Risk** — NORMAL atau HIGH.
  - **Intelligence Filters** — *Hot streak* (sinyal dengan rentetan menang tinggi),
    dan **Verdict** (*Worth It* / *Avoid*).
  - **BTC correlation** — *Decoupled* (lepas dari BTC) atau *High align* (sangat
    searah BTC).
  - **Pattern Filters** — saring berdasarkan tag pola teknikal (mis. `fvg near entry`,
    `rsi overbought`, `bb expansion`, `vol climax`).
- **Reset All** — menghapus semua filter yang aktif.
- **Watchlist** — bintang di tiap baris menyimpan sinyal ke watchlist pribadi.

## Cara mencari coin small-cap yang menjanjikan

Gunakan kombinasi filter: urutkan/lihat kolom **MCap** yang kecil, pastikan **Vol 24H**
cukup (likuiditas), lalu perkuat dengan **Verdict = Worth It** dan/atau **Hot streak**.
Perhatikan juga **Risk** — small-cap sering `HIGH`.

## Istilah singkat

- **TP1–TP4** = Take Profit level 1 sampai 4 (target untung bertingkat).
- **SL / SL1 / SL2** = Stop Loss (batas rugi).
- **WR** = Win Rate. **Streak** = rentetan menang/kalah.
- **FVG** = Fair Value Gap; **RSI** = Relative Strength Index; **BB** = Bollinger Bands.
- **Decoupled** = bergerak lepas dari arah Bitcoin.

## Catatan penting

Sinyal dan data di halaman ini adalah **alat bantu dan informasi**, bukan rekomendasi
untuk membeli atau menjual. Keputusan trading sepenuhnya ada di tangan pengguna.
