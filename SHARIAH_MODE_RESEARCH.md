# LuxQuant Shariah Mode — Riset & Rencana Implementasi

Status: **Fase 1 SELESAI dan jalan di produksi** (2026-08-12). Fase 2 belum mulai.
Riset ditulis 2026-08-12; lihat §11 untuk hasil implementasi.
Pemicu: prospek dari Maroko (ELGHALI) — *"In islamic country, we respect chariaa financial
to put our money in crypto. We trade just in spot and the project must be Halal"* — plus
referensi ke Telegram "Crypto Fatwa bot" yang mengagregasi 4 sumber screening syariah.

---

## 1. Ringkasan eksekutif

Fiturnya bukan sekadar badge "halal/haram" di kartu sinyal. Yang diminta prospek itu dua
hal, dan yang kedua justru lebih berat buat LuxQuant hari ini:

1. **Coin harus halal** → screening per-aset. Ini yang mudah; datanya sudah 97% ada.
2. **Tradingnya harus spot, tanpa leverage** → ini menyentuh cara LuxQuant memasarkan diri.

Kabar bagusnya: **secara mekanik, sinyal LuxQuant sudah spot-friendly.**

| Fakta yang diverifikasi di DB produksi | Angka |
|---|---|
| Total sinyal | 56.329 |
| Arah | **56.324 long, nol short** — diuji dua arah: `target1 > entry` **dan** `stop1 < entry` |
| `pnl_leverage` | rotasi tampilan untuk PnL card (10/20/25/50/75 hampir rata ±11.100 masing-masing) |
| `max_leverage` | angka Binance yang sebenarnya, ditulis `max_leverage_worker.py` |
| Coin ter-enrich metadata | 726 dari 750 (96,8%) |

Artinya: entry/TP/SL LuxQuant bisa dieksekusi 100% di spot tanpa mengubah satu pun angka.
Yang haram bukan sinyalnya — tapi **framing marketing** (PnL card "+13,95% at 75x", tweet
leverage) dan modul futures di Terminal (liquidations, funding, OI).

> Temuan sampingan saat verifikasi: `pnl_leverage` kadang **melebihi** `max_leverage` yang
> sebenarnya — BRKB punya kartu 50x dan 75x padahal Binance hanya mengizinkan 20x untuk
> pair itu. Jadi sebagian kartu marketing menampilkan leverage yang bahkan tidak bisa
> dieksekusi. Di luar lingkup fitur ini, tapi perlu dicatat.

Estimasi dampak katalog kalau filter syariah dinyalakan. **Angka ini khusus 643 pair
kripto** — 89 pair TradFi dan 3 indeks dikeluarkan lebih dulu (§4.2). Sinyal 90 hari,
n=9.035:

| Bucket `token_type` | Coin | Sinyal 90d | % | Kecenderungan syariah |
|---|---|---|---|---|
| utility | 202 | 2.923 | 32,4% | condong halal |
| layer1 | 155 | 2.163 | 23,9% | condong halal |
| layer2 | 50 | 728 | 8,1% | condong halal |
| rwa | 15 | 195 | 2,2% | halal bila underlying jelas & bukan ribawi |
| **subtotal condong-halal** | **422** | **6.009** | **66,5%** | |
| defi | 104 | 1.383 | 15,3% | case-by-case, banyak lending → haram |
| memecoin | 66 | 982 | 10,9% | mashbooh/haram (tidak ada manfaat) |
| stablecoin | 20 | 247 | 2,7% | mashbooh (reserve berbunga, aturan *sarf*) |
| governance | 16 | 208 | 2,3% | case-by-case |
| kosong / privacy / exchange | 15 | 206 | 2,3% | perlu ditinjau |

**66,5% flow sinyal kripto lolos filter ketat.** Produknya tidak jadi kosong. Ini angka
yang menentukan: kalau cuma 20%, fitur ini tidak layak dijual.

Ukuran pasar (tabel `users`, diverifikasi ulang): **955 user, 144 berbayar.** Indonesia
adalah negara dengan user berbayar terbanyak yang diketahui — **32**. Berikutnya IN 3,
JP/CA/GB masing-masing 2, PK 1, SA 1.

> ⚠️ Batas kepercayaan pada angka ini: **97 dari 144 user berbayar (67%) tidak punya
> `geo_country` sama sekali.** Jadi kita **tidak** bisa mengklaim "Indonesia sepertiga
> pelanggan" — yang bisa dikatakan hanya: dari yang negaranya tercatat, Indonesia paling
> besar dengan selisih jauh. Arahnya masuk akal (Indonesia negara Muslim terbesar di
> dunia), tapi dasarnya lebih tipis dari kesan yang saya berikan sebelumnya.

---

## 2. Temuan riset: sumber data eksternal

Saya cek semua sumber yang muncul di screenshot bot + alternatif komersial.

| Sumber | Cakupan | Akses data | Verdict |
|---|---|---|---|
| **Sharlife** (sharlife.my) | crypto + saham, terdaftar di SC Malaysia | halaman HTML per-coin, slug `/crypto-shariah/crypto/<slug>`, status Yes/No/Grey + breakdown 5 kategori (Legitimacy, Project, Financials, Token, Staking) | **sumber rujukan terbaik**; scrape + link, jangan republish teks |
| **CryptoUmmah** | 2.589 coin: 294 halal / 1.130 mashbooh / 1.165 haram, metodologi 27 poin | web (halaman utama return HTTP 402 saat difetch — ada paywall) | rujukan metodologi, cakupan terbesar |
| **Musaffa** | 120k saham + 8.2k ETF, API komersial, basis AAOIFI | ada API resmi | **tidak meng-cover crypto** — gugur |
| **Crypto Halal** / PIF (pif.finance) | rating crypto | tidak ada API/metodologi publik | rujukan sekunder |
| **Crypto Islam** (t.me/CrypoIslam) | channel Telegram Arab | publik; post lama berisi verdict per-coin, post baru tidak lagi terstruktur | bisa di-ingest lewat Telethon (infra sudah ada), tapi **rapuh** |
| **Shariah Review Bureau** | badan advisory Bahrain | tidak ada dataset publik | hanya nama untuk kredibilitas |

**Kesimpulan penting: tidak ada satu pun API syariah crypto komersial yang siap pakai.**
Bot di screenshot itu sendiri agregator scraping. Jadi kita tidak bisa "beli data" — kita
harus punya engine sendiri, dengan sitasi ke sumber eksternal sebagai pendukung.

### 2.1 Bagaimana persisnya bot itu bekerja (sudah dibuktikan)

Bot itu **tidak** memanggil API syariah apa pun. Ia membaca tabel HTML Sharlife.

`GET https://sharlife.my/crypto-shariah` mengembalikan **satu halaman 4,7 MB** yang sudah
server-rendered berisi **seluruh 1.132 baris** coin — dan tiap baris punya atribut data
yang langsung bisa dibaca mesin:

```html
<tr class="crypto-row search-item"
    onclick="window.location='/crypto-shariah/crypto/1inch'"
    data-asset-id="612892efb4d6c12086d1e16e"
    data-ticker="1INCH 1INCH"
    data-status="Non-Shariah">
```

Tidak ada API key, tidak ada login, tidak ada pagination. Satu GET = seluruh dataset.
Saya parse: **1.109 ticker unik → 642 Shariah, 316 Grey, 151 Non-Shariah.**

Verifikasi silang dengan tiga coin yang dicoba prospek di screenshot — cocok 3/3,
**termasuk slug URL-nya**:

| Coin | Kata bot | Data Sharlife hasil parse | Slug |
|---|---|---|---|
| ALICE | halal 🟢 | `Shariah` | `/my-neighbour-alice` ✓ |
| PORTAL | questionable 🟠 | `Grey` | `/portal` ✓ |
| ME | questionable 🟠 | `Grey` | `/magic-eden` ✓ |

Untuk sumber lain: verdict "Crypto Islam" selalu berupa link ke **message ID spesifik**
(`t.me/CrypoIslam/184`, `/2100`, `/5961`) → berarti bot punya indeks hasil scraping arsip
channel, coin→message_id. Sementara **"Crypto Halal" dan "Shariah Review Bureau" menjawab
"fatwa not found" di ketiga screenshot, tanpa kecuali** — dua konektor itu kemungkinan
besar kosong atau placeholder. Jadi data riil bot ini praktis cuma dua sumber.

Ada juga host `api.sharlife.my` yang membalas JSON terstruktur (`{"success":false,
"error":{"code":"not_found"}}`) — REST API nyata, mungkin dipakai app mobile mereka.
Tidak perlu dikejar; halaman HTML sudah memberi semuanya.

### 2.2 Tapi cakupannya tipis — dan ini alasan kita tetap butuh engine sendiri

Saya join dataset Sharlife dengan **643 pair kripto** LuxQuant (TradFi dan indeks
dikeluarkan — §4.2, karena Sharlife memang tidak menilai perpetual saham).

**Angka ini sudah memakai metode pencocokan yang benar (`coingecko_id` → slug); versi
pertama saya memakai ticker dan itu salah — lihat §2.4.**

| | Coin | Sinyal 90d | % flow |
|---|---|---|---|
| `Shariah` | 236 | 3.310 | 36,6% |
| `Grey` | 79 | 1.032 | 11,4% |
| `Non-Shariah` | 57 | 756 | 8,4% |
| **tidak terdaftar sama sekali** | **271** | **3.937** | **43,6%** |

**Sharlife meng-cover 57,9% katalog kripto kita.** Tetap ada 43,6% flow sinyal yang akan
tampil kosong kalau kita cuma mengagregasi seperti bot itu. Itulah kenapa balasan bot ke
prospek penuh "fatwa not found" — bukan botnya pintar, sumbernya yang bolong.

**Konsekuensi desain:** engine internal (rules + LLM) adalah **lapisan dasar** yang menutup
271 coin sisanya; Sharlife dipakai sebagai **koroborasi** yang menaikkan confidence dan
memberi link keluar. Bukan sebaliknya. Ini membalik urutan Layer 2 dan Layer 3 di rencana
awal — dan justru membuat produk kita lebih baik dari bot itu, bukan sekadar menyamai.

**Effort turun drastis untuk konektor Sharlife**: bukan scraper per-halaman (1.100+ request),
tapi **satu GET mingguan + parse regex**. Realistis ±60 baris kode, masuk Fase 1, bukan Fase 2.

### 2.4 Identitas aset — `1000SHIB` itu SHIB, dan jangan pernah memotongnya sendiri

Pertanyaan pemilik: pair kita kadang berbentuk `1000SHIB`, `10000MOG`. Sudah tertangani?
**Ya — tapi bukan dengan cara memotong angkanya.**

**Kabar baik: `coins.coingecko_id` sudah menyimpan identitas aslinya.** Ini isi DB hari ini:

```
1000SHIB    → shiba-inu        1000PEPE   → pepe
1000BONK    → bonk             1000FLOKI  → floki
1000XEC     → ecash            1000LUNC   → terra-luna
1000000MOG  → mog-coin         1000RATS   → rats-ordinals
1000SATS    → sats-ordinals    1MBABYDOGE → 1mbabydoge
```

Screening membaca `coingecko_id`, jadi ia menilai SHIB yang sesungguhnya. Pengali 1000×
itu murni konvensi harga Binance (supaya harga tidak penuh angka nol) dan **tidak
mengubah apa pun secara syariah** — memiliki 1 unit "1000SHIB" sama saja memiliki 1000 SHIB.

**Kabar buruk: memotong prefiks secara regex itu berbahaya, dan saya sempat melakukannya.**
Perhitungan cakupan saya yang pertama (§2.2) memakai ticker + potong `1000`. Itu keliru:

| Kasus | Kalau dipotong | Kenyataannya |
|---|---|---|
| `1000CAT` | → `CAT` → Sharlife: **Cyber Arena**, Non-Shariah | `coingecko_id` kita = `1000cat`, **aset yang sama sekali lain** |
| `1000X` | → `X` | token ini memang bernama 1000X (`1000x-by-virtuals`) |
| `1INCH`, `42`, `4`, `86`, `2Z`, `0G`, `9F` | rusak | memang berawalan angka |
| `1MBABYDOGE` | prefiksnya `1M`, bukan `1000` | pola regex-nya pun beda |

**Dan mencocokkan lewat ticker sama berbahayanya.** Di Sharlife, **22 ticker menunjuk lebih
dari satu aset** — beberapa dengan vonis berlawanan:

```
LIT   → lighter (Non-Shariah)  |  litentry (Shariah)      ← vonis berlawanan
HYPE  → hyper-liquid (Shariah) |  hyperlane (Grey) | supreme-finance (Grey)
PEPE  → pepe                   |  based-pepe
BEAM  → beam                   |  beam-privacy
```

Kalau kita match lewat ticker, `LIT` bisa dapat "halal" atau "haram" tergantung baris mana
yang kebetulan terbaca duluan. Untuk fitur syariah, itu tidak bisa diterima.

**Aturan yang dipakai (dan sudah saya verifikasi jalan):**
1. **Utama:** `coins.coingecko_id` → slug Sharlife. Eksak, tanpa tebakan. → 251 pair.
2. **Cadangan:** ticker, **hanya bila ticker itu unik** di Sharlife. → 134 pair.
3. **Ticker ambigu → tolak**, jadi `unrated`. Bukan ditebak. → 3 pair.
4. **Tidak pernah memotong prefiks angka.** Sama sekali.

Memakai aturan ini, cakupannya justru naik (49,2% → 51,3%) *dan* tiga salah-cocok berhenti
sebelum sempat tayang.

### 2.5 Satu bug identitas yang sudah terlihat di data kita sendiri

Pair `T` punya `fetch_error = fetch_failed:bitcoin` — worker metadata kita menebak ticker
`T` sebagai **Bitcoin**. Yang benar `T` = Threshold Network (Sharlife pun mencatatnya
`threshold`, Non-Shariah).

Artinya `coingecko_id` **bukan sumber yang boleh dipercaya buta**. Sebelum backfill, perlu
satu langkah validasi: cek bahwa simbol resmi di CoinGecko benar-benar cocok dengan
`base_symbol` kita (setelah membuang pengali 1000/10000/1M). Yang tidak cocok → `unrated`
+ masuk antrean review, jangan di-screening di atas identitas yang salah.

Ini murah dilakukan dan mencegah kelas kesalahan terburuk: **vonis yang terdengar yakin,
lengkap dengan alasan, tapi tentang aset yang keliru.**

### 2.6 Catatan cara bot itu tumbuh

`/start` bot itu dikunci: user wajib join `t.me/alihan_crypto` dan
`t.me/crpytonewsfromalihan` dulu, baru tombol "Check subscription" membuka aksesnya.
Jadi tool syariah itu dipakai sebagai **mesin akuisisi subscriber Telegram**. Pola yang
sama bisa kita pakai di Fase 4 — bedanya CTA kita mengarah ke langganan berbayar, bukan
sekadar channel.

### Batas hukum yang saya pegang
Kita **menautkan dan menyebut** verdict sumber lain (seperti bot itu: "Sharlife: halal 🟢 →
link"), bukan menyalin dan mengklaim teks/analisis mereka. Yang kita republish cukup:
nama sumber, status satu kata, tanggal, dan URL aslinya.

---

## 3. Landasan syariah (yang harus dicantumkan, bukan dikarang)

Kita **tidak mengeluarkan fatwa**. Bot di screenshot menutup setiap balasan dengan
*"The bot does not issue fatwas itself and only shows source decisions and statuses it
found."* — kita pakai disiplin yang sama. Yang kita lakukan: **screening**, merujuk
standar yang sudah terbit.

**MUI (Ijtima Ulama, 11 Nov 2021)** — paling relevan untuk pasar #1 kita:
- Kripto **sebagai mata uang**: haram (gharar, dharar, melanggar UU 7/2011 & PBI 17/2015).
- Kripto **sebagai komoditas/aset digital**: tidak sah diperdagangkan bila mengandung
  gharar/dharar/qimar dan tidak memenuhi syarat *sil'ah*: ada wujud fisik/formal, punya
  nilai, kuantitasnya diketahui pasti, ada hak milik, dan bisa diserahkan ke pembeli.
- **Boleh** bila memenuhi syarat *sil'ah* **dan** punya *underlying* serta manfaat jelas.
  → Ini persis kenapa memecoin gugur dan L1/utility lolos.

**SC Malaysia — Shariah Advisory Council (7 Juli 2020)**: aset digital diakui sebagai
*mal* (harta); investasi & perdagangan di bursa aset digital terdaftar pada prinsipnya
dibolehkan, sepanjang bebas riba, gharar, maysir, dan bukan berbasis *ribawi items*.

**AAOIFI**: tidak ada standar khusus crypto, tapi kerangka screening aktivitas bisnis +
rasio keuangan dipakai luas (Musaffa, Sharlife) sebagai basis.

**Konsensus mayoritas soal cara trading** (ini yang mengunci desain produk):
- **Margin/leverage** → riba (pinjaman berbunga) + gharar → dihindari.
- **Futures/perpetual** → tidak ada penyerahan barang, unsur maysir → dihindari.
- **Short selling** → menjual yang tidak dimiliki → dihindari. *(LuxQuant: nol short. Aman.)*
- **Spot, long, dimiliki penuh** → boleh.
- **Biaya langganan sinyal** → akad *ijarah* (jasa). Boleh, selama aktivitas dasarnya boleh.

---

## 4. Rubrik screening LuxQuant (7 kriteria)

Diturunkan dari MUI (*sil'ah* + manfaat) dan breakdown 5-kategori Sharlife, dipetakan ke
kolom `coins` yang **sudah ada** di DB.

| # | Kriteria | Sumber data | Gagal → |
|---|---|---|---|
| 1 | **Manfaat / utility nyata** (*sil'ah*: punya nilai & manfaat) | `has_utility`, `token_type`, `use_cases` | memecoin, token tanpa produk → **haram/mashbooh** |
| 2 | **Aktivitas bisnis proyek** | `sector`, `categories_raw`, `description` | lending berbunga (AAVE/COMP), judi/prediction market, adult, asuransi konvensional, DEX perpetual (dYdX/GMX) → **haram** |
| 3 | **Riba di tokenomics** | `utility_details`, whitepaper | yield tetap dijamin, "staking" yang sebenarnya lending berbunga → **haram** |
| 4 | **Gharar / maysir** | `token_type`, `risk_notes` | murni spekulasi, supply/kepemilikan tidak jelas → **mashbooh** |
| 5 | **Ribawi backing** | `token_type=rwa`, `stablecoin` | backing emas/perak/fiat → tunduk aturan *sarf* (harus tunai, serah-terima) → **mashbooh** + catatan |
| 6 | **Mekanisme konsensus/staking** | field baru `consensus` | PoS validator reward ≈ *ujrah* (boleh); PoW umumnya boleh; "staking" berbunga → gagal |
| 7 | **Legitimasi & transparansi** | `website`, `whitepaper_url`, `market_cap_rank` | tanpa whitepaper/tim/audit → **mashbooh** |

**Status akhir (4 nilai, sama seperti standar industri):**
`halal` 🟢 · `mashbooh` 🟡 (meragukan) · `haram` 🔴 · `unrated` ⚪

Aturan agregasi: satu kriteria `haram` → hasil `haram`. Tidak ada haram tapi ada
mashbooh → `mashbooh`. Semua lolos **dan** minimal 1 sumber eksternal setuju → `halal`.
Tanpa sumber eksternal, maksimum yang boleh kita berikan adalah `halal (internal)` —
ditandai beda di UI.

---

## 4.1 Dari mana STATUS-nya, dan dari mana ALASAN-nya

Ini dua masalah berbeda dengan sumber berbeda. Jangan dicampur.

### A. Status — sebagian dari luar, gratis

Sudah dibuktikan di §2.1: satu GET ke `sharlife.my/crypto-shariah` = 1.109 ticker
dengan status, terbaca dari atribut `data-status`. Gratis, tanpa key. **Tapi hanya
meng-cover 49% pair kita** (§2.2).

### B. Alasan — TIDAK bisa diambil dari luar. Ini yang harus kita buat sendiri.

Saya buka halaman detail Sharlife untuk empat coin. Hasilnya menutup opsi itu:

| Coin | Alasan tampil? | Terakhir di-screening |
|---|---|---|
| BTC | ya, paragraf pendek | **Q3 2024** |
| DOGE | ya, paragraf pendek | **Q3 2023** |
| ALICE | breakdown tampil, tapi *"Subscribe to unlock full detailed screening criteria"* | **Q1 2022** |
| AAVE | **terkunci total** — *"available for premium subscribers only… Subscribe or pay $5 to unlock"* | Q1 2024 |

Tiga masalah sekaligus:
1. **Berbayar.** Analisis rinci itu produk jualan mereka. Menyalinnya bukan cuma soal
   hukum — itu mengambil barang dagangan orang.
2. **Basi.** Q1 2022 sampai Q3 2024. Untuk aset yang tokenomics-nya berubah tiap tahun,
   itu terlalu tua untuk kita jadikan dasar.
3. **Bolong.** 43,6% flow sinyal kripto kita tidak ada di sana sama sekali.

**Kesimpulan: dari Sharlife kita ambil status + link keluar saja.** Alasannya kita
hasilkan sendiri. Kebetulan itu justru yang benar secara etis dan yang bikin produk kita
lebih baik dari bot di screenshot.

### C. Bahan mentah untuk alasan sudah kita punya di tabel `coins`

Ini bukan harapan — ini isi DB produksi hari ini:

| Sumber isi | Coin | Punya `description` | Punya `summary` |
|---|---|---|---|
| CoinGecko | 679 | 679 | 679 |
| manual override (ditulis tangan) | 33 | – | 33 |
| kosong | 38 | 0 | 14 |

Contoh nyata — perhatikan bahwa keputusannya praktis sudah tertulis di data:

```
GMX     token_type=defi
        categories_raw = ["decentralized finance (defi)", "derivatives",
                          "perpetuals", "avalanche ecosystem", ...]
        description    = "…trade 70+ assets with up to 100x leverage…"
        → derivatives + perpetuals + leverage. HARAM. Deterministik, tanpa LLM.

AAVE    summary = "…largest decentralized lending protocol… Users supply assets to
                   earn yield or borrow against collateral."
        → riba. HARAM.

1000PEPE has_utility=false
        risk_notes = "Pure speculation. No utility, no team, no roadmap."
        → gagal syarat sil'ah (manfaat). HARAM/MASHBOOH.
```

### D. Tiga lapis penghasil alasan

**Lapis 1 — Rules deterministik.** Alasannya adalah **kutipan fakta yang kita simpan**,
bukan karangan. Contoh yang tampil ke user:

> 🔴 **Haram** — Proyek ini menjalankan bursa derivatif dan perpetual dengan leverage
> hingga 100x. Kategori resmi token: `derivatives`, `perpetuals`.
> *Dasar: kriteria #2 (aktivitas bisnis). Sumber data: CoinGecko.*

**Lapis 2 — LLM**, hanya untuk yang tak terjawab rules. Output JSON ketat: per kriteria
harus mengembalikan `{pass, reason, evidence}` — dan **`evidence` wajib berupa potongan
teks dari `description`/`categories_raw` yang benar-benar ada**. Kalau model tidak bisa
menunjuk bukti, kriteria itu dianggap tidak terjawab, bukan diloloskan.

**Lapis 3 — Override admin/ulama.** Teks bebas, selalu menang atas dua lapis di atas.

**Aturan yang mengikat ketiganya: tidak ada alasan tanpa sitasi.** Setiap kalimat yang kita
tampilkan harus bisa ditelusuri ke field yang kita simpan, ke sumber eksternal, atau ke
nama admin yang meng-override. Kalau engine tidak punya bahan untuk beralasan, statusnya
`unrated` — bukan ditebak. Ini yang membedakan kita dari "AI bilang halal".

### E. Dua lubang yang sudah diketahui (lihat juga §4.2 — kelas aset yang salah dibaca)

1. **38 coin tanpa `description`** (DRAM, BLUEBIRD, CBRS, CTR, QNTX, BBX, …) membawa
   349 sinyal dalam 90 hari (**3,7% flow**). Tidak ada bahan → wajib `unrated`.
   Perbaikannya: refetch CoinGecko atau isi manual. Kecil, tapi jangan disembunyikan.
2. **`categories_raw` kotor oleh tag ekosistem** — ARPA misalnya membawa
   `"bnb chain ecosystem"`, `"polygon ecosystem"`, `"animoca brands portfolio"`,
   `"dwf labs portfolio"`. Ini persis bug yang sudah pernah diperbaiki di
   `coin_metadata_worker.py` (*"CRITICAL FIX: ecosystem tags filtered out"*) — kita pakai
   ulang filter yang sama, jangan mengulang kesalahannya.

---

## 4.2 KOREKSI — katalog kita berisi tiga kelas aset, dan Binance sudah melabelinya

Ditemukan 2026-08-12 saat menelusuri 38 coin tanpa `description`. Dugaan pemilik bahwa
sebagian dari mereka adalah saham ternyata benar. Tapi setelah diverifikasi ke sumber
otoritatif, **dua kesimpulan awal saya sendiri ternyata keliru** dan harus dicabut.

### Sumber yang benar: `GET https://fapi.binance.com/fapi/v1/exchangeInfo`

Binance sudah memberi label kelas aset pada tiap simbol, gratis, tanpa key:

```json
{"symbol":"JPMUSDT",    "contractType":"TRADIFI_PERPETUAL", "underlyingType":"EQUITY"}
{"symbol":"HYUNDAIUSDT","contractType":"TRADIFI_PERPETUAL", "underlyingType":"KR_EQUITY"}
{"symbol":"NATGASUSDT", "contractType":"TRADIFI_PERPETUAL", "underlyingType":"COMMODITY"}
{"symbol":"BTCDOMUSDT", "contractType":"PERPETUAL",         "underlyingType":"INDEX"}
{"symbol":"1000PEPEUSDT","contractType":"PERPETUAL",        "underlyingType":"COIN"}
```

Tidak perlu regex, tidak perlu LLM, tidak perlu menebak dari harga. Satu panggilan API.
Hasil klasifikasi seluruh katalog:

| `contractType` / `underlyingType` | Coin | Sinyal 90d | % |
|---|---|---|---|
| `PERPETUAL` / `COIN` — kripto sungguhan | 643 | 9.035 | 96,4% |
| `TRADIFI_PERPETUAL` / `EQUITY` | 76 | 247 | 2,6% |
| tidak ada lagi di Binance futures (delisted) | 15 | 50 | 0,5% |
| `PERPETUAL` / `INDEX` | 3 | 14 | 0,1% |
| `TRADIFI_PERPETUAL` / `KR_EQUITY` | 3 | 9 | 0,1% |
| `TRADIFI_PERPETUAL` / `COMMODITY` | 8 | 7 | 0,1% |
| `TRADIFI_PERPETUAL` / `PREMARKET` | 2 | 7 | 0,1% |

### Koreksi 1 — jumlahnya bukan 38, tapi 89

Saya sebelumnya menghitung 38 lewat pencocokan teks pada `description`. Angka
sebenarnya **89 pair TradFi** (76 EQUITY + 3 KR_EQUITY + 8 COMMODITY + 2 PREMARKET),
plus 3 indeks. Selisihnya besar karena banyak yang deskripsinya di CoinGecko tidak
memuat kata "tokenized".

### Koreksi 2 — ini bukan saham tokenisasi, ini DERIVATIF. Dan itu menyederhanakan semuanya.

Ini yang paling penting, dan saya sebelumnya salah membacanya.

`TRADIFI_PERPETUAL` artinya **kontrak perpetual atas saham** — bukan token saham yang bisa
dimiliki. **Tidak ada pasar spot-nya di Binance.** Deskripsi CoinGecko yang berbunyi
"Ondo Tokenized Stock" untuk AMZN/GOOGL/MSFT/JPM itu **hasil salah-cocok worker metadata
kita sendiri**: worker mencocokkan ticker `AMZN` ke token Ondo, padahal instrumen yang
sebenarnya dipanggil sinyal adalah perpetual saham Binance. Diverifikasi satu per satu —
AMZN, JPM, GOOGL, NVDA, EWJ: semuanya `TRADIFI_PERPETUAL` / `EQUITY`.

Konsekuensinya:

1. **Tidak perlu rubrik screening saham AAOIFI.** Pertanyaan "apakah rasio utang berbunga
   JPMorgan di bawah 30%" tidak pernah muncul, karena tidak ada JPMorgan yang bisa dimiliki
   di sini — yang ada cuma kontrak taruhan atas harganya.
2. **Musaffa tidak dibutuhkan.** Di §4.2 versi sebelumnya saya menghidupkannya kembali
   sebagai solusi untuk irisan ini. **Itu dicabut.** Tidak ada yang perlu dibeli.
   Pertanyaan §9.5 juga dihapus.
3. **Semua TradFi perp + indeks masuk satu bucket: `not_applicable`.** Tidak bisa dimiliki,
   tidak bisa diserahkan, tidak ada spot-nya → gagal syarat *sil'ah* di level definisi,
   sebelum sampai ke pertanyaan halal/haram. Ini bukan vonis `haram`; ini kelas aset yang
   memang di luar jangkauan Shariah Mode yang spot-only.

Deskripsi di DB kita sendiri sudah mengatakannya untuk dua di antaranya:
> BTCDOM: *"synthetic perpetual index… **Not an actual token**, but a derivative index for traders."*
> NATGAS: *"synthetic perpetual contract tracking the price of Natural Gas."*

### Yang tetap berlaku dari analisis sebelumnya

- **Isinya memang aset yang paling terang bermasalah**: JPM (bank konvensional), DKNG
  (DraftKings — judi), BRKB (asuransi konvensional), EWJ/EWY/EWZ/IWM (ETF indeks luas).
  Bedanya, alasan pengecualiannya jadi lebih sederhana dan lebih kuat: bukan "gagal
  screening saham", tapi "bukan aset yang bisa dimiliki".
- **Kelas aset ini sedang tumbuh.** Panggilan pertama hampir semuanya Mei–Juni 2026.
- **`rwa` menyusut drastis setelah dibersihkan**: dari 53 coin / 307 sinyal menjadi
  **15 coin / 195 sinyal**. Sebagian besar isi bucket itu memang perpetual saham, bukan
  RWA kripto. Ini yang membuat tabel §1 harus dihitung ulang.
- **REEF positif palsu** — `PERPETUAL`/`COIN`, kripto biasa. Dia L1 *untuk* tokenized
  equity, bukan equity-nya.

### Verifikasi harga sebagai pemeriksaan silang

Sebelum menemukan `exchangeInfo`, saya sempat menebak identitas dari harga entry. Hasilnya
campur: BRKB $474–495 cocok dengan Berkshire Class B ✓, NATGAS $2,84 cocok dengan Henry
Hub ✓, tapi SAMSUNG $208 dan HYUNDAI $415 **tidak** cocok dengan harga saham aslinya.
Tebakan harga itu tidak dipakai — `exchangeInfo` menjawab semuanya secara pasti. Dicatat
di sini supaya jelas mana yang bukti dan mana yang dulu cuma dugaan.

### Konsekuensi desain

1. **Kolom `asset_class`** di `coin_shariah`, diisi dari `exchangeInfo` Binance —
   `crypto_token` | `tradfi_perp` | `index_perp` | `delisted`.
2. Dijalankan **sebelum** rubrik apa pun. Salah kelas = rubrik salah.
3. `tradfi_perp` dan `index_perp` → `not_applicable` + penjelasan jujur. Nol biaya LLM.
4. 15 pair yang sudah delisted dari Binance futures (MATIC, RNDR, EOS, GAL, AUDIO, SXP,
   ANT, …) → tetap di-screening sebagai kripto; sinyalnya historis dan pairnya berganti
   nama, jadi identitasnya perlu dicek manual (§2.5).

## 5. Arsitektur teknis

### 5.1 Database — 2 tabel baru + 1 kolom

```sql
-- Hasil screening per coin (1 baris per pair)
CREATE TABLE coin_shariah (
    pair              text PRIMARY KEY REFERENCES coins(pair) ON DELETE CASCADE,
    asset_class       text NOT NULL DEFAULT 'crypto_token',
                      -- crypto_token|tradfi_perp|index_perp|delisted, dari exchangeInfo
    status            text NOT NULL DEFAULT 'unrated',   -- halal|mashbooh|haram|unrated|not_applicable
    confidence        smallint NOT NULL DEFAULT 0,       -- 0-100
    criteria          jsonb NOT NULL DEFAULT '{}',       -- {utility:{pass,note}, business:{...}, ...}
    summary           text,                              -- 2-3 kalimat, netral, bukan fatwa
    summary_id        text,                              -- terjemahan ID
    summary_ar        text,                              -- terjemahan AR
    consensus         text,                              -- pos|pow|other
    engine_version    text NOT NULL DEFAULT 'v1',
    screened_at       timestamptz,
    -- jalur review manusia, meniru pola review_status di tabel coins
    review_status     text NOT NULL DEFAULT 'pending',   -- pending|approved|overridden
    reviewed_by       integer REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at       timestamptz,
    review_notes      text,
    override_status   text,                              -- kalau diisi, ini yang tampil
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_coin_shariah_status ON coin_shariah(status);
CREATE INDEX idx_coin_shariah_class  ON coin_shariah(asset_class);
CREATE INDEX idx_coin_shariah_review ON coin_shariah(review_status);

-- Sitasi sumber eksternal (N baris per pair) — kita link, tidak mengklaim
CREATE TABLE coin_shariah_sources (
    id          bigserial PRIMARY KEY,
    pair        text NOT NULL REFERENCES coins(pair) ON DELETE CASCADE,
    source      text NOT NULL,        -- sharlife|cryptoummah|crypto_halal|crypto_islam|pif
    status_raw  text,                 -- "Yes"/"Grey"/"halal" apa adanya dari sumber
    status_norm text,                 -- halal|mashbooh|haram|not_found
    url         text,
    label       text,                 -- nama coin di sumber tsb
    checked_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pair, source)
);

-- Preferensi user: pakai kolom ui_prefs jsonb yang SUDAH ADA di users.
--   ui_prefs = {"shariah_mode": true, "shariah_strictness": "strict|moderate"}
-- Tidak perlu kolom baru → tidak ada ALTER TABLE di tabel users.
```

> ⚠️ Catatan operasional: memori proyek mencatat insiden `ADD COLUMN IF NOT EXISTS` saat
> import yang mengambil ACCESS EXCLUSIVE di tabel `users` dan menyebabkan statement
> timeout massal. Karena itu desain ini **sengaja tidak menyentuh tabel `users`** —
> `shariah_mode` disimpan di `ui_prefs` yang sudah ada.

### 5.2 Worker — `shariah_screening_worker.py`

Salin pola `coin_metadata_worker.py` (sudah jalan sebagai
`luxquant-coin-metadata.service`, daemon + `LISTEN new_pair_to_categorize`):

```
LISTEN new_pair_to_categorize          → coin baru masuk → screening otomatis
+ backfill mode (--backfill)           → 750 coin sekali jalan
+ refresh mode (mingguan)              → re-check sumber eksternal

Pipeline per coin:
  1. RULES   — deterministik, dari kolom coins yang sudah ada (gratis, instan)
               memecoin → haram; lending/perp/gambling keyword → haram; dst.
  2. LLM     — hanya untuk yang tidak terjawab rules; prompt terstruktur → JSON
               ketat sesuai 7 kriteria. Pakai OPENAI_API_KEY / DEEPSEEK_API_KEY
               yang sudah ada di .env, log biaya ke ai_usage_log (pola existing).
               Ini menutup 271 coin kripto yang tidak ada di Sharlife (43,6% flow).
  3. SOURCES — satu GET mingguan ke sharlife.my/crypto-shariah, parse
               data-ticker/data-status/slug dari 1.132 baris sekaligus, simpan ke
               coin_shariah_sources. Bukan per-coin. Lihat §2.1.
  4. MERGE   — agregasi jadi status akhir + confidence. Sumber eksternal yang
               sepakat menaikkan confidence; yang bertentangan dengan hasil
               internal otomatis masuk antrean review admin.
  5. QUEUE   — apa pun yang menyentuh sinyal top-100 by volume masuk antrean
               review admin sebelum tayang.
```

Estimasi biaya LLM: 750 coin × ~1.5k token in / 500 out. Dengan model murah
≈ **$2–5 untuk seluruh backfill**, lalu <$0.10/bulan untuk coin baru. Tidak signifikan.

### 5.3 API

**Keputusan scope (pemilik, 2026-08-12): tampilkan di dalam modal saja.** Tidak ada badge
di baris daftar sinyal dan tidak ada filter di `SignalsPage` pada rilis pertama. User
melihat status syariah saat membuka modal.

```
GET  /api/v1/coins/{pair}                   → tambah blok "shariah" di response existing
                                              ← INI SATU-SATUNYA yang dibutuhkan untuk
                                                menyalakan fitur di semua modal
GET  /api/v1/shariah/methodology            → rubrik + sumber + disclaimer (statis, i18n)
POST /api/v1/shariah/request-review         → user minta coin di-review (seperti Sharlife)
PATCH /api/v1/admin/shariah/{pair}          → override admin + catatan
GET  /api/v1/admin/shariah/queue            → antrean review

— nanti, kalau filter daftar jadi dibutuhkan (bukan sekarang):
GET  /api/v1/signals/bulk-7d                → tambah field shariah_status per pair
GET  /api/v1/shariah/coins?status=halal     → daftar untuk halaman /halal
GET  /api/v1/shariah/stats                  → distribusi status untuk landing
```

Satu endpoint mencukupi karena **`CoinUtilityModal.jsx:188` sudah memanggil
`/api/v1/coins/{pair}`**, dan `CoinCategoryBadge.jsx` juga memanggilnya dengan cache
module-level. Menambah satu blok di response itu langsung mengalir ke semua permukaan
modal tanpa fetch baru.

> Konsekuensi yang perlu disadari: tanpa filter daftar, user yang mencari coin halal harus
> membuka sinyal satu per satu. Untuk sekarang tidak apa-apa — dan kalau nanti filternya
> dibutuhkan, penambahannya bersifat aditif (`bulk-7d` + state di `SignalsPage`), **bukan
> rework**, karena keduanya membaca tabel `coin_shariah` yang sama.

### 5.4 Frontend — modal-first

Tempat utama (rilis pertama):

| Tempat | Perubahan |
|---|---|
| **`SignalModal.jsx` → tab `research`** | Kartu "Shariah Screening" di atas kartu CoinGecko yang sudah ada (blok `activeTab === "research"`, sekitar baris 2559). Tab ini memang sudah rumahnya fundamental coin — deskripsi, kategori, market data. Isi kartu: status besar + ringkasan 2–3 kalimat + breakdown 7 kriteria (collapsible) + link sumber eksternal + disclaimer. |
| **`CoinUtilityModal.jsx`** | Section yang sama, di bawah blok token type. Modal ini sudah fetch `/coins/{pair}` sendiri di baris 188 — cukup baca field baru, nol perubahan data-fetching. |
| **`CoinCategoryBadge.jsx`** | Pill ketiga 🟢/🟡/🔴/⚪ **di header modal saja**, bukan di baris daftar. Komponennya sudah dual-pill + cache — tinggal tambah satu pill. |

Menyusul (fase berikutnya, bukan sekarang):

| Tempat | Perubahan |
|---|---|
| `SignalsPage.jsx` | `shariahFilter` — hanya kalau ternyata dibutuhkan setelah dipakai. |
| Halaman `/halal` | direktori + metodologi + CTA. Aset SEO ("kripto halal" / "halal crypto list": volume nyata, kompetitor tipis). Prerender lewat `scripts/prerender-content.mjs`. |
| Toggle "Shariah Mode" | sembunyikan leverage di PnL/kartu + modul futures di Terminal. |
| i18n | `id` dulu, lalu `ar` + RTL (pekerjaan CSS tersendiri). |

---

## 6. Masalah jujur yang harus diputuskan pemilik

Ini bagian yang tidak boleh saya sembunyikan di catatan kaki.

**(a) Marketing leverage bertabrakan langsung dengan segmen ini.**
X poster dan Telegram channel gratis saat ini memposting PnL card bergaya futures
("+13,95% at 75x"). Untuk audiens syariah, itu bukan sekadar tidak menarik — itu
mendiskualifikasi produknya di mata mereka sebelum sempat melihat sinyalnya. Pilihannya:
segmentasi kanal (channel/handle terpisah untuk audiens syariah), atau geser semua ke
angka spot. Ini keputusan bisnis, bukan teknis.

**(b) Kita akan salah pada sebagian coin, dan itu sensitif.**
Salah bilang "halal" pada coin yang ternyata protokol lending berbunga bukan bug biasa —
itu kerugian kepercayaan yang tidak bisa ditarik. Mitigasi: status default `unrated`,
bukan `halal`. Tidak ada coin yang tampil `halal` tanpa (i) lolos 7 kriteria **dan**
(ii) minimal satu sumber eksternal, atau (iii) approval admin. Bahasa UI selalu
"hasil screening", tidak pernah "fatwa".

**(c) Kita bukan otoritas syariah.**
Jangka panjang, kredibilitas butuh nama — advisor/lembaga yang mau menandatangani
metodologi (DSN-MUI untuk ID, atau konsultan seperti Shariah Review Bureau). Sebelum itu
ada, posisi kita adalah agregator + screener yang transparan. Itu tetap jujur dan tetap
laku — bot di screenshot melakukan persis itu dan prospeknya memakainya.

**(d) Stablecoin.**
USDT/USDC adalah pasangan quote seluruh sinyal kita. Statusnya sendiri mashbooh di banyak
pandangan (cadangan berbunga, aturan *sarf*). Kita tidak bisa "menyelesaikan" ini; kita
harus menyatakannya terbuka di halaman metodologi dan membiarkan user memutuskan.

---

## 7. Rencana rilis bertahap — dari nol sampai selesai

Ringkasan jalur kritis. **"Selesai" = akhir Fase 4** (produk lengkap dan bisa dijual).
Fase 5–6 adalah pertumbuhan, bukan syarat rilis.

| Fase | Isi | Effort koding | Blocker |
|---|---|---|---|
| 0 | Keputusan pemilik | — | — |
| 1 | Data & engine (backend, tak terlihat user) | ~2 hari | tidak ada |
| 2 | Kartu syariah di modal + review admin (flag) | ~1,5 hari | Fase 1 |
| 3 | Review isi + buka publik | ~1 hari + kerja manusia | Fase 2 |
| 4 | Shariah Mode penuh (spot-first) | ~2 hari | keputusan (a) |
| 5 | Bahasa: `id`, lalu `ar` + RTL | ~1 + ~3 hari | Fase 4 |
| 6 | Distribusi: bot TG, landing, kanal | ~2 hari | Fase 4 |

Total ±9–12 hari kerja koding. Yang sebenarnya jadi penentu jadwal bukan koding,
tapi **review manusia di Fase 3**.

Keputusan "modal saja" (§5.3) memangkas Fase 2 dan 3: tidak ada perubahan di `bulk-7d`,
tidak ada filter/kolom/sorting di `SignalsPage`, dan tidak ada badge di baris daftar yang
perlu di-QA di semua breakpoint.

---

### Fase 0 — Keputusan pemilik (tidak ada koding)

Empat pertanyaan di §9. Hanya satu yang **memblokir**: keputusan (a) soal kanal marketing,
dan itu baru dibutuhkan di Fase 4. Sisanya bisa diputuskan sambil jalan. **Fase 1 bisa
dimulai hari ini tanpa menunggu apa pun.**

---

### Fase 1 — Data & engine · ~2 hari · backend only, nol perubahan yang dilihat user

Tujuan: setiap 750 pair punya status syariah yang bisa dipertanggungjawabkan, tersimpan
di DB. Belum ada yang tayang.

1. **Migrasi SQL** — `coin_shariah` + `coin_shariah_sources` (DDL di §5.1). Dua tabel baru,
   tidak menyentuh tabel `users` maupun `signals`. Aman dijalankan saat live.
2. **Validasi identitas** (§2.5) — pastikan `coingecko_id` tiap pair benar-benar merujuk
   aset yang sama dengan `base_symbol` (setelah pengali 1000/10000/1M diabaikan, **bukan
   dipotong**). Yang tidak cocok → `unrated` + antrean review. Ini menangkap kasus seperti
   `T` yang saat ini tercatat sebagai Bitcoin.
3. **Konektor Sharlife** — satu GET ke `sharlife.my/crypto-shariah`, parse
   `data-status` + slug dari 1.132 baris, tulis ke `coin_shariah_sources`. Pencocokan
   memakai aturan §2.4: `coingecko_id`→slug dulu, ticker unik sebagai cadangan, ticker
   ambigu ditolak. ±60 baris.
4. **Klasifikasi `asset_class` dari Binance `exchangeInfo`** (§4.2) — `crypto_token` /
   `tradfi_perp` / `index_perp` / `delisted`. Satu panggilan API, label otoritatif, tanpa
   tebakan. Berjalan **sebelum** rubrik apa pun; salah kelas = rubrik salah. Ini yang
   menyingkirkan 89 perpetual TradFi + 3 indeks dari lingkup screening.
5. **Rules engine** — deterministik, membaca kolom `coins` yang sudah ada. Menyelesaikan
   memecoin, lending, perp DEX, gambling, stablecoin tanpa satu pun panggilan LLM.
   `tradfi_perp` dan `index_perp` → `not_applicable` di sini juga, tanpa LLM.
6. **LLM pass** — hanya untuk sisa yang tidak terjawab rules (±271 coin kripto yang tak
   ada di Sharlife). Prompt terstruktur → JSON ketat 7 kriteria. Biaya di-log ke `ai_usage_log`.
7. **Merge + confidence** — agregasi rules + LLM + sumber eksternal jadi satu status.
8. **Daemon** — `shariah_screening_worker.py` + unit systemd, meniru
   `luxquant-coin-metadata.service`: `LISTEN new_pair_to_categorize` untuk coin baru,
   plus refresh Sharlife mingguan.

**Dianggap selesai bila:**
- 750/750 pair punya baris di `coin_shariah`, dan **`asset_class` cocok 100% dengan
  `exchangeInfo` Binance** — 643 `crypto_token`, 89 `tradfi_perp`, 3 `index_perp`,
  15 `delisted`.
- **JPM, DKNG, BRKB, EWJ, BTCDOM, NATGAS semuanya `not_applicable`** — bukan `halal`,
  bukan pula `haram`. Ini uji lakmus §4.2; kalau salah satu lolos sebagai `halal`,
  engine-nya belum boleh jalan.
- Nol coin berstatus `halal` tanpa korroborasi sumber eksternal atau approval admin
  (query verifikasi, bukan asumsi).
- Biaya backfill tercatat dan di bawah $10.
- Saya spot-check 20 coin secara manual (10 yang engine bilang halal, 10 haram) dan
  alasannya masuk akal.
- Coin baru yang masuk ke `coins` otomatis ter-screening dalam <5 menit.

---

### Fase 2 — Kartu syariah di modal + review admin · ~1,5 hari · di balik flag

Tujuan: fitur sudah bisa dipakai dan dikoreksi orang dalam, **user biasa belum melihat
apa pun**.

1. Blok `shariah` di `GET /api/v1/coins/{pair}` — **satu-satunya perubahan API yang
   dibutuhkan** untuk menyalakan fitur di semua modal (lihat §5.3).
2. Kartu "Shariah Screening" di `SignalModal.jsx` tab `research` — status + ringkasan +
   breakdown 7 kriteria (collapsible) + link sumber + disclaimer.
3. Section yang sama di `CoinUtilityModal.jsx`; modal itu sudah fetch endpoint yang sama
   di baris 188, jadi nol perubahan data-fetching.
4. Pill status di `CoinCategoryBadge.jsx` — **hanya di header modal**, bukan di baris daftar.
5. `GET /api/v1/admin/shariah/queue` + `PATCH /api/v1/admin/shariah/{pair}` + panel review
   di `AdminWorkspacePage.jsx`, meniru pola `review_status`/`reviewed_by` yang sudah
   teruji di tabel `coins`.
6. Semuanya di balik flag admin.

**Dianggap selesai bila:**
- Buka SignalModal → tab Research → kartu syariah tampil untuk pair mana pun, termasuk
  yang `unrated` (yang ini justru harus diuji: jangan sampai kartunya kosong/pecah).
- Admin bisa meng-override, dan hasilnya langsung berubah di modal tanpa restart worker.
- Akun non-admin tidak melihat perubahan apa pun (diverifikasi dengan akun uji, bukan
  diasumsikan).

---

### Fase 3 — Review isi & buka ke publik · ~1,5 hari koding + kerja manusia

**Ini fase yang paling lama, dan bottleneck-nya bukan kode.** Sebelum satu badge pun
tayang ke user, isinya harus ditinjau manusia — karena salah bilang "halal" tidak bisa
ditarik (§6b).

1. **Review manusia**: coin diurutkan berdasarkan volume sinyal. Meninjau **top ~150 coin
   sudah menutup sekitar 80% flow sinyal** — tidak perlu 750-nya sekaligus. Sisanya tetap
   tampil, tapi berlabel "belum ditinjau".
2. Halaman metodologi + disclaimer (EN + ID) — rubrik 7 kriteria, daftar sumber, dan
   pernyataan tegas: **hasil screening, bukan fatwa**. Ditautkan dari kartu di modal.
3. Endpoint `POST /shariah/request-review` — user minta coin ditinjau (meniru Sharlife).
4. Buka flag ke publik.

**Dianggap selesai bila:**
- Top 150 coin by volume sudah berstatus `approved` oleh manusia.
- Disclaimer muncul di setiap permukaan yang menampilkan status — pill (tooltip), kartu di
  modal, halaman metodologi. Tidak ada satu tempat pun yang menampilkan status telanjang.
- Coin yang belum ditinjau tampil `unrated`, bukan ditebak.

---

### Fase 4 — Shariah Mode penuh · ~2 hari · **titik "selesai"**

Sampai sini kita baru punya badge. Fase ini yang menjawab kalimat prospek
*"We trade just in spot"*.

1. Toggle di menu user → `ui_prefs.shariah_mode` (kolom jsonb yang sudah ada, **tanpa
   ALTER TABLE di `users`** — lihat peringatan di §5.1).
2. Saat ON:
   - **angka leverage disembunyikan** di kartu sinyal dan PnL card,
   - **modul futures disembunyikan** di Terminal: liquidations, funding rate, open interest,
   - copy berubah ke bahasa spot-first.
   - *Opsional:* daftar sinyal ikut tersaring ke halal. Ini satu-satunya bagian Fase 4 yang
     menarik kembali pekerjaan `bulk-7d` yang ditunda di §5.3 (+~0,5 hari). Kalau tidak
     diambil, Shariah Mode tetap bermakna — leverage dan modul futures hilang, statusnya
     tetap terbaca di modal.
3. Halaman `/halal` — direktori coin halal, di-prerender lewat `scripts/prerender-content.mjs`
   yang sudah ada. Ini aset SEO: query "kripto halal" / "halal crypto list" punya volume
   nyata dengan kompetitor tipis.

**Dianggap selesai bila:** dengan mode ON, saya menyisir seluruh aplikasi dan **tidak
menemukan satu pun angka leverage atau modul futures**. Itu kriteria lulus/gagal, bukan
penilaian rasa.

---

### Fase 5 — Bahasa · `id` ~1 hari, `ar` + RTL ~3 hari

Saat ini `src/i18n.js` hanya punya `en` dan `zh`.
- `id` dulu — Indonesia sudah pasar #1 kita (31 dari ~97 paid user). Ini murni penambahan
  file locale.
- `ar` menyusul, **dan jangan diremehkan**: butuh `dir="rtl"`, dan seluruh layout yang
  memakai margin/padding satu sisi harus diaudit. Ini pekerjaan CSS tersendiri, bukan
  sekadar menerjemahkan. Jangan digabung ke fase mana pun sebelum ini.

---

### Fase 6 — Distribusi · ~2 hari

1. **Bot Telegram `/halal BTC`** — UX persis bot di screenshot, tapi milik kita, dengan
   data yang cakupannya jauh lebih baik (§2.2) dan CTA ke langganan. Infra Telethon + bot
   sudah jalan di VPS.
2. Landing page khusus ID/MY/MENA.
3. Segmentasi kanal marketing sesuai keputusan (a).

---

### Setelah rilis — perawatan yang harus ada

Ini sering terlupa dan jadi sumber busuk data:
- Refresh Sharlife mingguan; kalau parse gagal (mereka ubah markup), **alert**, bukan diam.
  Struktur HTML pihak ketiga bisa berubah kapan saja tanpa pemberitahuan.
- Coin baru → auto-screening → masuk antrean review. Butuh SLA, misalnya ditinjau dalam
  7 hari sebelum sinyalnya boleh tayang dengan badge.
- Sumber eksternal yang berubah pendapat harus memicu re-review, bukan menimpa diam-diam
  keputusan admin.

---

## 8. Yang sudah ada dan bisa dipakai ulang (tidak perlu bangun dari nol)

- `coins` — 726/750 coin sudah ter-enrich: `token_type`, `sector`, `has_utility`,
  `categories_raw`, `use_cases`, `risk_notes`. **Ini 80% input rubrik sudah tersedia.**
- `coin_metadata_worker.py` + `luxquant-coin-metadata.service` — pola daemon,
  `LISTEN new_pair_to_categorize`, MANUAL_OVERRIDES, review_status. Tinggal disalin.
- `review_status`/`reviewed_by`/`review_notes` di `coins` — pola review admin sudah teruji.
- `ui_prefs` jsonb di `users` — tempat menyimpan toggle tanpa ALTER TABLE.
- Telethon + session string di `/root/LuxQuant News Automated` — untuk ingest channel.
- `ai_usage_log` + `social_cost.py` — pelacakan biaya LLM.
- `scripts/prerender-content.mjs` — SEO untuk halaman `/halal`.
- Framing "halal / spot-first" **sudah ada di kode**: `terminal.py:196` dan
  `dune_tokenflow_service.py:9`. Arahnya sudah pernah dipikirkan; ini melanjutkannya.

---

## 9. Pertanyaan terbuka untuk pemilik

1. Ketat atau moderat sebagai default? (ketat = hanya `halal`; moderat = `halal` + `mashbooh`)
2. Shariah Mode gratis untuk semua, atau jadi pembeda paket?
3. Marketing leverage: pisah kanal, atau geser semua ke angka spot?
4. Mau cari endorsement lembaga (DSN-MUI / konsultan syariah) sejak awal, atau rilis dulu
   sebagai screener transparan dan kejar kredibilitas belakangan?
5. **Perpetual TradFi (§4.2):** cukup ditandai `not_applicable` dengan penjelasan, atau
   disembunyikan sama sekali saat Shariah Mode menyala? Volumenya kecil (2,9% flow) tapi
   sedang tumbuh.

---

## 10. Log verifikasi (2026-08-12)

Pemilik meminta semua klaim dipastikan sebelum koding. Ini hasilnya — termasuk yang gagal.

### Terverifikasi ulang, berubah

| Klaim awal | Setelah diverifikasi |
|---|---|
| "38 saham tokenisasi" | **89 perpetual TradFi + 3 indeks**, dari `exchangeInfo` Binance |
| "saham tokenisasi, butuh screening AAOIFI" | **derivatif tanpa pasar spot** → `not_applicable`. Rubrik saham tidak dibutuhkan |
| "Musaffa dihidupkan kembali untuk irisan ini" | **dicabut.** Tidak ada yang perlu dibeli |
| "Sharlife cover 49,2%" (ticker + potong 1000) | **57,9% dari 643 pair kripto** (`coingecko_id`→slug) |
| "subtotal aman ~63%" | **66,5%**, dihitung ulang atas 643 pair kripto saja |
| "31 dari ~97 paid user di ID" | **144 paid total, ID 32** — dan 97 di antaranya tidak punya `geo_country` |
| "`rwa` 53 coin / 307 sinyal" | **15 coin / 195 sinyal** setelah perpetual saham dikeluarkan |
| "`pnl_leverage` bukan instruksi trade" | benar, **dan** ada `max_leverage` terpisah yang berisi angka Binance sungguhan |

### Terverifikasi, tetap berlaku

- Nol sinyal short — diuji dua arah (`target1 > entry` dan `stop1 < entry`), 56.324 long.
- Sharlife: 1.132 baris dalam satu GET, `data-status` terbaca mesin; cocok 3/3 dengan
  jawaban bot di screenshot, termasuk slug.
- Halaman detail Sharlife berbayar (AAVE terkunci penuh) dan basi (Q1 2022 – Q3 2024).
- 22 ticker Sharlife menunjuk >1 aset; `LIT` memberi vonis berlawanan.
- `coins.coingecko_id` sudah memetakan `1000SHIB`→`shiba-inu` dkk.
- Bug identitas `T` → `fetch_failed:bitcoin` (yang benar Threshold Network).
- `CoinUtilityModal.jsx:188` memang `fetch('/api/v1/coins/${pair}')`.
- `SignalModal.jsx:2559` memang awal blok `activeTab === "research"`.
- `src/i18n.js` hanya punya `en` (baris 27) dan `zh` (baris 486).
- `frontend-react/scripts/prerender-content.mjs` ada.
- Tabel `ai_usage_log` ada, lengkap dengan kolom `model` dan token.
- `users.ui_prefs` (jsonb) ada — toggle tidak perlu ALTER TABLE.

### Dugaan yang GAGAL diverifikasi dan tidak dipakai

- **Menebak identitas dari harga entry.** BRKB $474–495 cocok Berkshire ✓ dan NATGAS $2,84
  cocok Henry Hub ✓, tapi SAMSUNG $208 dan HYUNDAI $415 **tidak** cocok dengan harga saham
  aslinya. Metode ini dibuang; `exchangeInfo` menjawab semuanya secara pasti.
- **Isi channel Telegram Crypto Islam.** Post lama diklaim berisi verdict per-coin, tapi
  saya tidak bisa membaca isi pesan lewat web preview. Belum terbukti — jangan dijadikan
  dasar rencana sampai dicek lewat Telethon.
- **Metodologi 27 poin CryptoUmmah.** Halaman utamanya membalas HTTP 402. Angka
  294/1.130/1.165 berasal dari ringkasan hasil pencarian, **bukan dari sumber pertama.**

### Yang belum diverifikasi sama sekali

- Apakah rules + LLM benar-benar menghasilkan vonis yang tepat pada 271 coin tanpa
  pembanding eksternal. Ini baru terjawab setelah backfill Fase 1 dan spot-check 20 coin.
- Apakah Sharlife mengizinkan pengambilan otomatis. Tidak ada `robots.txt` di situs itu
  (dicek: mengembalikan HTML aplikasi, bukan file robots). Ketiadaan larangan bukan izin —
  layak dikirimi email pemberitahuan sebelum dijadwalkan mingguan.

---

## 11. Hasil Fase 1 (2026-08-12) — sudah jalan di produksi

Yang dibangun: `database/migration-shariah-v1.sql`,
`backend/app/services/shariah_screening_worker.py`,
`deployment/luxquant-shariah-screening.service` (aktif, `enable --now`).

### Temuan terpenting: vonis yakin tentang aset yang keliru — hampir tayang

`IDUSDT` sempat dinilai **haram** oleh rules engine, lengkap dengan kutipan:

> *"…hyperliquid is a layer one (l1) blockchain best known for perpetual futures and spot trading…"*

Tapi ID itu SPACE ID, protokol nama domain — sama sekali bukan Hyperliquid.
`coins.coingecko_id` untuk ID memang tertulis `hyperliquid`, hasil salah-tebak
worker metadata pada ticker pendek.

Validasi identitas menemukan **41 pair** dengan metadata milik aset lain:
`AI`/`AIN`→chainlink, `B`/`C`/`IN`→bitcoin, `H`→ethereum, `D`→tether,
`F`/`G`→figure-heloc, `TA`→bittensor, `ON`→tron, `AT`→polygon, `US`→tether,
`IP`→story-2, `IR`→hashnote-usyc. Semuanya dipaksa `unrated`, **dan alasan
lamanya dihapus** — kutipan yang salah alamat lebih berbahaya daripada kolom
kosong.

Tanpa langkah ini, LuxQuant akan menayangkan vonis haram bersitasi tentang
aset yang salah. Ini pembenaran paling kuat untuk aturan "tidak ada alasan
tanpa sitasi, dan tidak ada sitasi tanpa identitas yang terverifikasi".

### Hasil akhir

| Status | Coin | Sinyal 90d | Dari mana |
|---|---|---|---|
| mashbooh | 277 | 4.136 | 156 LLM, 70 rules, 51 sumber luar |
| halal | 197 | 2.760 | **197 sumber luar — nol dari kami sendiri** |
| haram | 103 | 1.351 | 83 rules, 19 sumber luar, 1 LLM |
| unrated | 81 | 840 | 41 identitas bermasalah + 40 tanpa bahan |
| not_applicable | 92 | 284 | klasifikasi Binance |

### Yang harus disadari sebelum tayang

**Seluruh 197 `halal` berasal dari Sharlife, tidak satu pun dari kami.** Itu
memang desainnya (rules kami tidak pernah boleh mengeluarkan `halal` sendiri,
dan LLM otomatis diturunkan ke `mashbooh`) — tapi konsekuensinya nyata: daftar
halal kita mewarisi bulat-bulat penilaian satu sumber yang **basi** (Q1 2022 –
Q3 2024) dan yang **analisis rincinya berbayar**, jadi kita tidak bisa memeriksa
alasannya. XMR (Monero) misalnya masuk halal karena Sharlife menilainya begitu.

Ini bukan bug, tapi juga bukan keadaan yang layak dibiarkan diam-diam. Pilihannya
di Fase 3: tinjau manusia untuk top-N coin sebelum dibuka, atau tambah sumber
kedua supaya `halal` butuh dua suara.

### Invarian yang diverifikasi (semuanya 0)

- `halal` tanpa korroborasi sumber eksternal: **0**
- Status tayang tanpa `_disclaimer`: **0**
- Status tayang tanpa `_basis` (dari mana + alasan): **0**
- Vonis pada coin yang identitasnya bermasalah: **0**
- `tradfi_perp`/`index_perp` yang bukan `not_applicable`: **0**

### Biaya

DeepSeek `deepseek-chat`, ~196 panggilan ≈ **$0,013** (perkiraan — lihat catatan
kegagalan di bawah). Jauh di bawah pagu $10.

### Dua kegagalan yang tercatat

1. **Pelacakan biaya mati diam-diam sepanjang backfill.** Skrip dijalankan
   sebagai path, bukan modul, sehingga `import app.services.ai_cost` gagal dan
   `except` menelannya. Biaya ~196 panggilan itu tidak terekam dan tidak bisa
   direkonstruksi. Sudah diperbaiki: kegagalan impor kini menulis ERROR yang
   menyebut penyebab dan cara menjalankan yang benar.
2. **Perbandingan simbol saya sendiri sempat salah.** Versi pertama memotong
   pengali angka lalu menuduh `1000CAT`, `1000X`, `1MBABYDOGE` tidak cocok —
   padahal simbol resmi coin-coin itu memang memuat angkanya. Diperbaiki dengan
   menerima kedua bentuk.

