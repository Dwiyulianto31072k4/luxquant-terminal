# LuxQuant — Social Content Truth Sheet

Sumber kebenaran untuk semua konten sosial media. Setiap angka di sini diverifikasi
langsung dari **production** (`ssh luxquant-vps`, DB `luxquant`, API `127.0.0.1:8002`)
pada **3 Agustus 2026**, bukan dari dokumen lama atau ingatan.

Aturan pakai: kalau sebuah klaim tidak ada di dokumen ini, jangan diposting sebelum
dicek ulang ke production. Kalau produk berubah, dokumen ini yang diupdate duluan.

---

## 1. Identitas produk (pakai kata-kata ini persis)

| Item | Nilai resmi |
|---|---|
| Nama | **LuxQuant Terminal** |
| Tagline `<title>` | Quantitative Crypto Intelligence |
| Domain | `https://luxquant.tw` |
| Asal | Built in Taiwan · Running Since 2023 |
| Sinyal pertama | **27 Desember 2023, 13:25 UTC** (~950 hari jalan) |
| Bahasa UI | English + 中文 (zh) |
| X | `@luxquantcrypto` (~2.6K followers) |
| Telegram gratis | `t.me/LuxQuantSignal` |
| Instagram | `@luxquant.tw`, `@dailyrekomcrypto` |

**Deskripsi satu kalimat yang sudah dipakai di produk** (FAQ landing, `frontend-react/src/content/faq.js`):

> LuxQuant Terminal is a quantitative crypto market-intelligence platform: algorithmic
> trade calls with a public, timestamped track record, money-flow and sector context,
> on-chain whale signals, risk scoring, and AI research — so decisions start from data,
> not noise.

Deskripsi footer: *"Market intelligence for crypto — signals, execution, on-chain context, and research in one terminal."*

---

## 2. Angka headline (yang tampil di landing page hari ini)

Sumber: `GET /api/v1/signals/analyze?time_range=all` → dipakai `ProofBar.jsx` + `Performance.jsx`.

| Label di landing | Nilai | Catatan |
|---|---|---|
| **Verified Win Rate** | **85.6%** | definisi di §3 |
| **Trades On Record** | **55,475** | total signal sejak Des 2023 |
| **Running Since 2023** | **~950d** | dihitung live dari 27 Des 2023 |

Rincian pendukung (semua live):

- Closed trades: **54,219** · Winners: **46,391** · Stopped out (SL): **7,828**
- Sebaran exit: TP1 **7,701** · TP2 **16,315** · TP3 **11,965** · TP4 **10,410** · SL **7,828**
- Pair aktif: **749** · Signal open sekarang: **1,256**
- Volume call: **± 95 signal/hari** (rata-rata 30 hari)

**Stabilitas win rate** (ini kekuatan cerita, pakai kalau ditantang "cherry-picking"):

| Window | Win rate | Wins | Losses |
|---|---|---|---|
| 30 hari | 84.56% | 2,360 | 431 |
| 90 hari | 84.75% | 6,654 | 1,197 |
| All-time | 85.56% | 46,392 | 7,827 |

**Per risk level** (tampil di landing "Risk Level Analysis"):

| Risk | Signals | Win rate | Avg R:R |
|---|---|---|---|
| Low | 11,924 | 84.05% | 1.88 |
| Normal | 9,581 | 84.61% | 1.96 |
| High | 28,612 | 85.46% | 2.01 |

---

## 3. Definisi yang TIDAK BOLEH bergeser

Ini bagian paling rawan mismatch. Semua definisi di bawah sudah dipakai konsisten
di web, di API, dan di caption Telegram — konten sosmed harus ikut.

### 3.1 "Win" = **menyentuh minimal TP1**

Aturan outcome (`backend/app/services/performance_metrics.py`, tabel `_cache_outcomes`):
level tertinggi yang tercapai menang — `tp4 > tp3 > tp2 > tp1 > sl`.

Konsekuensi yang harus dipahami: **call yang sempat kena TP1 lalu jatuh ke stop tetap
tercatat sebagai TP1 win.** 85.6% artinya "berapa persen call yang setidaknya mencapai
target pertama", bukan "berapa persen posisi ditutup untung".

Frasa aman: *"85.6% of our calls reached at least their first target."*
Frasa terlarang: *"85.6% profitable trades"*, *"85.6% of members made money"*.

### 3.2 Ada DUA win rate — jangan pernah disandingkan

| Populasi | Win rate | Artinya |
|---|---|---|
| `hit` (default, dipakai publik) | **85.56%** | mencapai minimal TP1 |
| `closed` | ~57% | **TP4 completion rate** — ~35k call TP1–TP3 dibuang dari denominator |

Modul `performance_metrics.py` sendiri memberi peringatan eksplisit: keduanya cuma
berbagi nama. Jangan taruh berdampingan di bawah satu heading "win rate".

### 3.3 "Peak" ≠ realized

`top-performers` mengembalikan `gain_pct` = **peak run-up dari entry** (harga tertinggi
selama trade), plus `realized_pct` terpisah = gain ke TP tertinggi yang benar-benar kena.

Contoh nyata hari ini: **KOMAUSDT** — `gain_pct 313.79%` tapi `realized_pct 13.3%`.

Situs sudah mengakui ini di `DayDrillModal.jsx`:
> *"Peak is the max run-up during the trade … so it's not a realized gain."*

Kalau konten pakai angka peak, **wajib** diberi label "peak". Jangan sekali-kali
menyajikan +313% sebagai keuntungan member.

### 3.3a Basis `gain_pct` berubah 2026-08-04: dari **entry call PERTAMA**

Sebelumnya `top-performers` mengelompokkan per pair lalu memilih call dengan rasio
terbaik — nama kolomnya `first_entry`, tapi urutannya `ORDER BY gain_ratio DESC`.
Untuk koin yang dipanggil berkali-kali (ESPORTS 7x, BANK 7x, KOMA 7x dalam 30 hari),
angka headline diukur dari re-entry yang kebetulan paling murah — harga yang tidak
bisa didapat siapa pun yang mengikuti sejak awal.

Sekarang `gain_pct` = dari entry call **paling awal** di window, ke harga tertinggi
yang dicapai sesudahnya. Dampaknya pada board 30 hari (diukur 2026-08-04):

| Koin | Basis lama | Basis sekarang |
|---|---|---|
| ESPORTS | +358,6% | +285,7% |
| KOMA | +342,7% | +340,9% |
| ON | +314,8% | +280,6% |

Payload juga membawa `first_signal_id` dan `last_signal_id`, dan `all_signal_ids`
kini urut kronologis (dulu urut UUID — tidak berguna). `realized_pct` tetap diukur
terhadap entry call yang chart-nya ditampilkan, bukan entry pertama, karena itu
gain ke TP pada call tersebut.

**Konsekuensi konten:** jangan pernah menyebut jumlah call sebuah koin tanpa
menyebut angkanya. Kartu Proof of Call menampilkan call pertama dan call terakhir
berdampingan, dan captionnya wajib menyatakan total call sebenarnya — menampilkan
2 dari 7 tanpa menyebut 7 adalah mismatch.

### 3.4 Angka leverage adalah konvensi tampilan

Tweet otomatis menulis hal seperti *"the 75x side caught 372%"*. Itu = spot % × `pnl_leverage`
yang tersimpan per signal. Bukan posisi nyata, bukan hasil member, dan tidak
memperhitungkan likuidasi. Aman dipakai hanya kalau kata "at 75x" ikut tertulis.

### 3.5 Statistik peak (window 30 hari — yang dipakai kartu Track Record)

| Metrik | 30d | All-time |
|---|---|---|
| Avg peak per winning call | **+24.4%** (median +8.3%) | +62.7% (median +25.9%) |
| Avg peak pada exit TP4+ | **+49.5%** (median +21.4%) | +68.6% |
| Best call | AKEUSDT **+3,350%** peak | MYXUSDT +22,839% ⚠️ |

⚠️ Rekor all-time MYXUSDT +22,839% kemungkinan besar artefak data — jangan dipakai.
Aturan yang sudah berlaku: kartu sosial pakai window, bukan all-time, untuk "best call".

---

## 4. Peta produk — apa yang benar-benar ada

### Publik (tanpa login)
| Route | Isi |
|---|---|
| `/` | Landing V2 (hero slider, ProofBar, Performance, Top Gainers, Architecture, FAQ) |
| `/learn`, `/coins` | 19 istilah glossary + **624 halaman coin** ter-prerender (SEO) |
| `/blog` | 6 artikel (sector rotation, BTC dominance, whale alerts, flow intensity, altseason, stablecoin dominance) |
| `/pricing`, `/payment` | Plan + checkout USDT |
| `/status` | Status page publik |

### Gratis (cukup login)
`/home` · `/market-pulse` · `/crypto-news` · `/performance` · `/journal` · `/notifications` · `/referral` · `/assistant` · `/profile`

### Premium (`PREMIUM_REQUIRED` di `App.jsx:120`)
`/signals` · `/terminal` · `/agent` · `/ai-arena` · `/onchain` · `/money-flow` · `/delistings` · `/bitcoin` · `/markets` · `/orderbook` · `/calendar` · `/watchlist` · `/portfolio` · `/tips` · `/api-keys`

### Apa yang tiap fitur benar-benar lakukan

| Fitur | Isi sebenarnya | Sumber data |
|---|---|---|
| **Signals** | Call dengan entry, TP1–TP4, SL, risk level, chart proof, journey, korelasi BTC, max leverage Binance | Channel Telegram VIP privat → di-mirror `scraper_realtime.py` |
| **Terminal** | 20+ tab analitik: confluence, OI, long/short, funding, squeeze, order flow, liquidations, momentum, sectors, token flow, RSI/ATR, risk calculator, treemap | Binance, Bybit, Coinalyze, Dune |
| **AI Research** (`/ai-arena`) | **BTC Compass** — outlook 24 jam + 72 jam + fase siklus, dengan confidence & status kualitas data. **756 report** sejak 11 Apr 2026, ~6–7/hari, total biaya AI **$11.61** | 23 endpoint di 5 tier |
| **Agent** | Eksekusi otomatis di akun Binance user (app terpisah `cryptobot`, di-proxy `/cryptobot/`) | API key user |
| **Market Pulse** | Feed pergerakan harga real-time — 3,237 event/24 jam, 331 coin | Forwarder bot Telegram |
| **Crypto News** | 780 artikel, kategorisasi + ekstraksi | Google News, CoinDesk, Cointelegraph, Decrypt |
| **On-Chain** | 586 alert: transfer, whale, smart money, mint/burn, likuidasi, security | Forwarder dari channel on-chain |
| **Money Flow** | Rotasi sektor, dominance, altseason index, flow intensity per coin, tekanan beli/jual DEX | CoinGecko, GeckoTerminal |
| **Delistings** | 464 event delisting bursa + pump tracker pasca-pengumuman | Worker delisting |
| **Performance** | 13 view: All-Time, Daily (5), Research (7 — calibration, pattern×BTC, EV, calendar, timing, coins, WR×BTC) | DB internal |
| **Journal** | Jurnal trading + equity curve + heatmap + insight AI | Input user (52 entri) |
| **Assistant** | Bantuan AI per-halaman. **Menolak memberi saran beli/jual** | DeepSeek |
| **Referral** | Komisi **10%**, kode + QR, cashout USDT | — |

### Sumber data eksternal (kalau ditanya "datanya dari mana")
Binance (spot + futures), Bybit, CoinGecko, GeckoTerminal, Coinalyze, Coinglass, Dune,
Etherscan, BscScan, blockchain.com, mempool.space, SoSoValue (ETF flows), FRED,
alternative.me (Fear & Greed), Google News + CoinDesk + Cointelegraph + Decrypt.
Model AI: Claude Haiku 4.5 (caption sosial), DeepSeek (assistant), xAI.

---

## 5. Harga & angka bisnis

| Plan | Harga | Durasi |
|---|---|---|
| Free | $0 | — |
| Monthly | **$50** | 30 hari |
| Annual | **$400** (hemat 33%) | 365 hari |
| Lifetime | **$1,000** | selamanya |

Pembayaran: **USDT di BNB Smart Chain (BEP-20)**, diverifikasi on-chain, aktivasi otomatis.
Referral: **10%** komisi.

**Angka user riil (jangan dibulatkan ke atas):**

| Metrik | Nilai |
|---|---|
| Total user terdaftar | **837** |
| Punya akses VIP aktif | **127** |
| Free | 706 |
| Telegram tertaut | 252 |
| Ada di grup VIP Telegram | 107 |
| Signup Jul 2026 | 241 |
| Signup Jun 2026 | 195 |

**Agent (cryptobot) riil:** 113 user terdaftar, **25 akun exchange** tersambung,
24 konfigurasi strategi, **6 aktif jalan**, 95 posisi (7 masih open).

---

## 6. Batas kepatuhan — hal yang tidak boleh diklaim

### BTC Compass / AI Research (`docs/btc-compass-contract.md` — kontrak produk resmi)

Compass **boleh** menampilkan: arah bias + confidence, liquidity magnet, konfluensi
dan ketidaksepakatan, peringatan event-risk, kondisi invalidasi tesis, freshness sumber data.

Compass **tidak boleh** menampilkan: grade setup A/B/C · perintah beli/jual langsung ·
entry/SL/TP/position-size spesifik · klaim kepastian atau ekspektasi profit.

Kontraknya menyatakan tegas: *"It is not a signal service."* Konten sosmed tentang
AI Research harus mengikuti batas ini.

### Aturan copy yang sudah diputuskan (jangan dibalik diam-diam)

- **Tidak pernah tampilkan loss per-trade di X.** Transparansi hidup di website; X
  menampilkan win rate agregat yang jujur + "verify on site". Tapi jangan pula
  mengklaim tidak ada loss — 7,828 SL ada di halaman publik.
- **Persentase, bukan raw count.** Jumlah mentah terbaca seperti firehose/noise.
- **Channel Telegram gratis: bahasa Inggris saja**, tanpa stop-loss di blok ladder,
  tidak pernah menyiratkan target pasti tercapai, dan **tidak pernah menjelaskan jadwal posting**.
- **X: maksimal SATU `$cashtag` per post** — API menolak 2+ dengan 403.
- **Tanpa urgency/scarcity/countdown**, disengaja: keberatan utama channel ini adalah
  "kelihatan seperti pump group", dan perangkat urgency justru kosakata genre itu.
- Link jangan di body tweet ($0.20 vs $0.015); taruh di self-reply.
- **Win rate di CTA pakai definisi History-tab situs** (TP1 dihitung menang) supaya
  tombol dan situs tidak pernah berbeda.

---

## 7. Otomasi sosial yang SUDAH jalan (jangan bentrok)

| Service | Yang diposting | Frekuensi |
|---|---|---|
| `luxquant-x-poster` | TP2/TP3/closed_win/win_streak, caption Haiku 4.5 + chart | **~100–130 tweet/hari** (Jul: 3,839) |
| `card_poster` slot A–G | Daily Recap 00:00 · Daily Gainers 10:00 · ETF Flows BTC 14:00 · Insight 15:00 · ETF ETH 14:30 · weekly/monthly 01:00 & 11:00 | harian, mode `post` (live) |
| `btc_pulse_poster` | Konten kontrarian saat BTC ±2%/2.5% | cek tiap 30 menit, ~5–8×/bulan |
| `tg_call_poster` + `caption_builder` | Mirror ke channel gratis + ladder trade plan | ikut X |
| `luxquant-discord-relay` | Tweet TP3/TP4 → Discord | ikut X |

Total 15,675 tweet tercatat. **Konten manual baru harus melengkapi ini, bukan mengulang** —
celah yang belum terisi: edukasi, di balik layar, penjelasan metodologi, konten produk
(fitur terminal), dan konten yang mengakui loss secara dewasa.

---

## 8. Risiko mismatch — cek daftar ini sebelum posting

1. **"Thousands of traders"** — di landing v1 lama. Platform punya **837 user, 127 berbayar**.
   Angka ribuan hanya valid untuk follower X (2.6K) / audiens channel, dan harus disebut demikian.
2. **Peak dibaca sebagai profit** — risiko terbesar. Selalu tulis "peak".
3. **Testimonial palsu** — `LandingPage.jsx` (v1) berisi 5 testimonial fiktif
   (Rizky Hidayat, Marcus Chen, Priya Sharma, Hiroshi Tanaka, Daniel Kim). **Kode mati,
   `/v1` redirect ke `/`, tidak tayang.** Jangan pernah dipakai ulang di konten.
4. **Signal tidak diverifikasi harga** — TP/SL di-scrape dari teks Telegram, bukan
   dicocokkan ke data exchange. Jangan klaim "exchange-verified".
5. **Peak terduplikasi antar call sekoin** — mis. 3 call BANKUSDT berbagi satu
   `peak_price` 0.67205. Klaim "best call" bisa terhitung ganda.
6. **Profit factor 11.6 / SQN 206** — artefak aturan outcome "level tertinggi menang".
   Sudah benar tidak dipublikasikan; jangan mulai sekarang.
7. **Angka yang boleh keluar publik dari R-metrics hanya dua**: breakeven win rate
   **33.73%** dan calls measured **54,205**. Sisanya butuh login (keputusan sengaja).

---

## 8a. Konsistensi win rate — bukti yang tahan diuji

**Per tahun** (definisi platform, minimal sentuh TP1):

| Tahun | Resolved | Win rate |
|---|---|---|
| 2024 | 13.256 | 86,9% |
| 2025 | 21.863 | 85,3% |
| 2026 (s/d 3 Agu) | 19.000 | 84,9% |

2023 hanya 104 call (104/104 menang) — sampel terlalu kecil, jangan dipakai.

**Per kondisi BTC** — BTC daily change dari Binance klines, di-join ke `daily_market_regime`
(kolom `wins`/`losses` saja). Independen dari performa kita:

| Kondisi BTC | Hari | Resolved | Win rate |
|---|---|---|---|
| ≤ −3% | 70 | 2.104 | **71,1%** |
| −3%…−1% | 190 | 7.277 | 77,8% |
| −1%…+1% | 384 | 20.961 | 84,2% |
| +1%…+3% | 192 | 14.938 | 88,5% |
| > +3% | 87 | 8.870 | **93,8%** |

**Jangan klaim "win rate konsisten di segala kondisi market."** Tidak benar — rentangnya
71% sampai 94%. Yang benar dan tetap kuat: *"tetap 71% bahkan di hari BTC anjlok lebih
dari 3%"*, dan *"84–87% tiap tahun sejak 2023."*

⚠️ **JEBAKAN: kolom `regime` di `daily_market_regime` itu sirkular.** Labelnya dihitung
dari win rate harian kita sendiri (`coin_intel_worker.compute_daily_regimes`: ≥70% =
`strong`, ≥50% = `neutral`, sisanya `weak`) — bukan kondisi market. Jadi "89,6% di regime
strong / 39,4% di weak" itu tautologi dan **tidak boleh** dipakai sebagai bukti apa pun.
Kolom `wins`/`losses`/`win_rate`-nya asli dan aman dipakai.

---

## 8b. Positioning web-first + in-app chat (keputusan branding 2026-08-03)

**Branding utama = terminal di web (`luxquant.tw`). Telegram opsional, bukan syarat.**

Data yang mendukung ini (bukan asumsi):

| Fakta | Angka |
|---|---|
| User yang **tidak** menautkan Telegram sama sekali | **585 dari 838 (70%)** |
| Daftar via Google | 542 · Telegram 236 · Discord 48 · local 11 |

Komentar di `chat_autoreply_worker.py` mengonfirmasi arsitekturnya:
*"most accounts are Google or Discord with no telegram_id … so the in-app bell
is the floor, and a Telegram DM is a bonus for the minority who linked one."*

Artinya semua fungsi inti — signals, terminal, performance, notifikasi (bell),
chat — jalan penuh di browser tanpa Telegram.

**Tapi jangan hapus Telegram dari cerita.** Channel gratis `t.me/LuxQuantSignal`
masih jadi funnel utama, alert Telegram tetap jalan untuk 253 user yang menautkan,
dan sinyalnya sendiri lahir di channel VIP Telegram. Frasa yang benar:
*"Telegram opsional"*, bukan *"tanpa Telegram"*.

### In-app chat — apa yang benar-benar ada

Live di produksi sejak **30 Juli 2026** (`ChatLauncher.jsx` + `/api/v1/chat/*`):

| Fakta | Nilai |
|---|---|
| Percakapan | 39 (semua status open) |
| User yang pernah chat | 12 |
| Pesan user (source `web`) | 30 |
| Balasan admin (source `admin_panel`) | 72 |
| Pesan sistem (auto-reply away) | 17 |
| Jembatan Telegram | `tg_support_chat_id` = **NULL** — murni web |

**Cara menyebutnya yang benar:** chat ada di dalam terminal, dikirim dari browser,
**dijawab tim (manusia)** lewat admin panel. Ada auto-reply "away" ketika tim tidak
di meja, plus nudge ke admin setelah 30 menit dan tarik-balik user kalau balasan
tak terbaca.

**Jangan diklaim:**
- ❌ "Support 24/7" atau "dibalas instan" — justru ada away message karena tim
  tidak selalu ada. Klaim 24/7 milik **mesinnya**, bukan supportnya.
- ❌ "AI chatbot" untuk support — sender `ai` ada di skema tapi **0 pesan**.
  Support dijawab manusia. Yang AI adalah tombol **"Ask AI"** (Assistant per-halaman,
  DeepSeek) — fitur berbeda, jangan digabung.
- ❌ angka volume ("ribuan pertanyaan terjawab") — baru 39 percakapan.

---

## 8c. Kamus istilah resmi — pakai kata yang sudah dipakai produknya

Diambil dari `landing/v2/sections/Architecture.jsx` dan `content/faq.js`, bukan karangan.
Frekuensi di copy publik: *call* 61× · *peak* 52× · *edge* 26× · *depth* 10× ·
*flow* 8× · *track record* 5× · *algo* 5× · *quant engine* 2×.

| Konsep | Kata resmi produk | Jangan pakai |
|---|---|---|
| Mesin sinyal | **Quant Engine**, **Algo Calls**, **Predictive Alpha** | mesin kuantitatif, AI Screener |
| Satu sinyal | **call** (bukan "sinyal") | tips, rekomendasi |
| Rencana trade | **Entry, TP & SL on every call** | area analisis |
| Rekam jejak | **timestamped track record**, **Verified Performance** | histori |
| Aliran modal | **capital rotating**, **Money Flow**, **On-Chain Flows** | pergerakan uang |
| Whale | **whale transfers & netflows** | Whale Tracker |
| Order book | **Order Book Depth**, **bid/ask liquidity** | Order Heatmap |
| Outlook BTC | **BTC Compass regime read**, **AI Research** | prediksi, sinyal AI |
| Eksekusi otomatis | **Agent** — *executes & manages your trades* | AutoTrade, bot |
| Lainnya | **Market Breadth**, **Derivatives**, **Volatility**, **edge**, **peak** | — |

Register untuk audiens Indonesia: kalimat Indonesia + istilah trading tetap Inggris
(*entry, TP, SL, pair, call, trade plan, capital flow*). Jangan diterjemahkan harfiah —
itu justru terbaca asing di telinga trader.

---

## 9. Cara refresh angka sebelum bikin konten

```bash
ssh luxquant-vps 'curl -s "http://127.0.0.1:8002/api/v1/signals/analyze?time_range=all" | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)[\"stats\"],indent=2))"'
```

```bash
ssh luxquant-vps 'curl -s "http://127.0.0.1:8002/api/v1/signals/top-performers?limit=10&days=7" | python3 -m json.tool | head -40'
```

```bash
ssh luxquant-vps 'curl -s http://127.0.0.1:8002/api/v1/performance/public-summary'
```

---

## 10. Sudut cerita yang jujur & belum dipakai

Semua bisa didukung angka di dokumen ini:

- **Konsistensi, bukan keajaiban** — 84.6% (30h) / 84.8% (90h) / 85.6% (all-time).
  Rentangnya cuma 1 poin di 55 ribu call.
- **Matematika kenapa edge itu nyata** — breakeven butuh 33.7%, kami di 85.6%.
  Angka ini sudah publik dan bisa diverifikasi.
- **Kami menerbitkan yang kalah** — 7,828 stop-out ada di halaman publik, tidak dihapus.
- **Peak vs realized, dijelaskan sendiri** — mengedukasi sekaligus melindungi dari
  tuduhan menggoreng angka. Belum ada kompetitor yang berani.
- **Skala mesin** — ~95 call/hari, 749 pair, jalan 950 hari tanpa putus.
- **AI Research yang menolak memberi perintah** — kontrak produk melarang bilang
  "beli/jual". Ini pembeda, bukan kekurangan.
- **Transparansi biaya AI** — 756 report BTC Compass seharga total $11.61.

---

*Terakhir diverifikasi: 3 Agustus 2026, terhadap production. Produksi & repo lokal
berada di commit yang sama (`1ed2456`), dengan WIP belum di-commit di kedua sisi.*
