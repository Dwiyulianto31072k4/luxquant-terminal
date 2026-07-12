# LuxQuant — Market Intelligence Expansion Roadmap (Free-Stack)

> Referensi: fitur ValueScan / Coinglass-style, dibangun **100% dari sumber gratis**.
> Konteks brand: **halal / spot-utility first** — data futures dipakai hanya sebagai
> *market-structure / risk context* (nyambung ke BTC regime), **bukan** sinyal trading
> futures/leverage. Semua fitur berbasis perps wajib ada disclaimer.
>
> Status riset: terverifikasi Juli 2026. Harga & free tier bisa berubah — cek ulang sebelum integrasi.

---

## 0. Prinsip desain inti — CALL-CENTRIC (wajib)

Semua fitur baru **berputar di sekitar call/sinyal aktif** yang sudah diproduksi LuxQuant —
**bukan** tabel market-wide terpisah seperti ValueScan.

**Fondasi yang sudah ada:** LuxQuant Terminal sudah "active signals ≤ 7 hari":
- Endpoint `GET /api/v1/terminal/screener?days=7&scope=all` → hanya sinyal 7 hari terakhir.
- Kode menyatakan *"signals live max 7d"* → satu sinyal aktif maksimal 7 hari.
- Filter WINDOW = day-bucket dari `created_at`: `bucket = floor((now − created_at)/86.4e6)` (0=hari ini … 6=6 hari lalu). `ALL` = semua 7 hari.
- Filter tambahan: status (OPEN/TP1–TP4/SL), SECTOR, RISK, DECOUPLED.

**Aturan untuk semua tab baru:**
1. Warisi **filter-context yang sama** (WINDOW 7d + day-bucket + SECTOR + RISK).
2. **Default = SCOPED** ke pair yang punya call aktif; market-wide = toggle sekunder opsional.
3. Tiap metrik baru → **confluence factor / KEY REASON** di kartu signal (chip: `net-inflow spike`, `liq cluster below`, `whale deposit`, dst).

**Konsekuensi (penting):**
- Ingestion cukup untuk **~universe call aktif** (ratusan pair), bukan 1000+ token → **hemat kuota free tier drastis** (Coinalyze 40/min, CoinGecko 10k/bln, Dune). Inilah yang bikin jalur gratis feasible.
- Perkuat brand halal: data futures **hanya** muncul sebagai konteks call spot-utility, tak pernah jadi produk trading futures berdiri sendiri.

---

## 1. Ringkasan fitur & prioritas

8 fitur diambil dari ValueScan; 6 bisa dibangun gratis. #3 & #4 butuh data berbayar → ditunda.

| # | Fitur | Sifat | Prioritas | Catatan halal |
|---|-------|-------|-----------|---------------|
| 12 | Top Lists multi-timeframe (Gainers/Losers) | Spot/market | 🥇 Fase 1 | Netral |
| 11 | Liquidation treemap (aktual, per koin) | Futures | 🥇 Fase 1 | Frame sbg risk context + disclaimer |
| 6  | Whale Flow futures (OI × harga, taker) | Futures | 🥈 Fase 2 | Frame sbg risk context + disclaimer |
| 10 | Announcement + Industry/Macro/Sentiment digest | Berita | 🥈 Fase 2 | Netral (mesin: Grok) |
| 5  | Token Flow (CEX net-inflow per token) | On-chain/spot | 🥈 Fase 2 | Netral — prioritas brand |
| 8  | Whale deposit/withdraw feed | On-chain/spot | 🥉 Fase 3 | Netral — perkaya Whale Alert lama |
| 4  | Circulation / Active-New Addresses | On-chain | 🔻 Tunda | Butuh Glassnode (~$999/bln) |
| 3  | Main Cost / realized price (avg holder cost) | On-chain | 🔻 Tunda | Butuh Glassnode / indexer berat |

---

## 2. Stack data gratis (final)

| Sumber | Gratis | Limit | Endpoint kunci | Menutupi |
|--------|--------|-------|----------------|----------|
| **Coinalyze** | ✅ (perlu API key) | 40 call/min | `/liquidation-history`, `/open-interest-history`, `/long-short-ratio-history` (multi-exchange, teragregasi) | 11, 6 |
| **Binance Futures public** | ✅ tanpa key | REST 1000/5min · WS 1024 stream | `!forceOrder@arr` (WS), `/futures/data/openInterestHist`, `/futures/data/globalLongShortAccountRatio` | 11 (fallback spike), 6 |
| **CoinGecko Demo** | ✅ | 100/min · 10k/bln | `/coins/markets?price_change_percentage=1h,24h,7d,30d` | 12, 4 (circulating) |
| **Dune** | ✅ free tier | query 5–30 dtk, antre | tabel `cex.addresses` (29 chain, sudah berlabel) + query flow | 5, 8 |
| **Bitquery** | ✅ Developer | 100k poin/bln (~20k call), 30/min, **non-komersial** | GraphQL `Transfers` (whale feed lintas chain) | 8, backup 5 |
| **Grok (xAI)** | berbayar API | — | live X + web → JSON digest | 10 |

**Penting:**
- **Coinalyze = sumber likuidasi utama** (multi-exchange → menutup masalah *undercount* Binance).
- **Binance `!forceOrder`** hanya kirim 1 likuidasi terbesar per simbol per detik → **jangan** dipakai untuk total volume; cocok untuk **spike alert real-time** saja.
- **Dune `cex.addresses`** sudah berisi address exchange terlabel → tak perlu labeli wallet manual.
- **Bitquery free = non-komersial**; kalau LuxQuant dijual, upgrade Pro (~$99/bln).
- **Flipside Crypto = JANGAN dipakai** (platform sunset pertengahan 2026). Dune tetap pilihan on-chain SQL.

---

## 3. Primitive inti: deteksi anomali (robust)

Semua nilai → **normalisasi ke USD** dulu. Deteksi "spike/abnormal" pakai **robust z-score** (median + MAD),
bukan z-score naif (data kripto fat-tail → z-score biasa banyak false alarm).

```python
# MAD = median(|x - median(x)|)
robust_z = 0.6745 * (x - median) / MAD

if abs(robust_z) >= 3.0:   # 2.5 = lebih sensitif
    label = "High Alert"

# window pendek (5–15m) → "Short-Term Signal"
# window panjang (4H–1D) konsisten searah → "Trend Signal"
```

Satu fungsi ini menggerakkan sinyal di #5, #6, #8 — tanpa AI berbayar.

---

## 4. Logika perhitungan per fitur

### #12 Top Lists
```
kandidat = filter(vol24h >= MIN_VOL, mcap >= MIN_MCAP)   # buang sampah
gainers  = sort_desc(kandidat, price_change_pct[tf])
losers   = sort_asc(kandidat,  price_change_pct[tf])
# momentum (opsional, BOBOT WAJIB DIKALIBRASI, bukan angka final):
#   0.4*24h + 0.3*7d + 0.2*30d + 0.1*1h
```
Status: sort 1-timeframe = terbukti. Bobot momentum = heuristik, kalibrasi dulu.

### #11 Liquidation treemap (Metode A — aktual, direkomendasikan Fase 1)
```python
# Sumber utama: Coinalyze /liquidation-history (multi-exchange)
# window bergulir 1H / 4H
notional[sym] += liq_amount_usd
side_bias      = (liq_short - liq_long) / total     # warna
ukuran_kotak   = notional[sym]                       # treemap
spike          = robust_z(notional[sym]) >= 3.0      # highlight
# Binance !forceOrder@arr = fallback untuk alert real-time saja
```
⚠️ Perlakukan angka sbg **indeks relatif** (BTC vs ETH), bukan absolut.
Frame UI: "Risk / Liquidation Context" + disclaimer (bukan ajakan leverage).

### #11 Metode B (predictive price-level heatmap — versi Pro, nanti)
```python
dOI = OI_now - OI_prev
for N, w in {10:0.4, 25:0.3, 50:0.2, 100:0.1}:   # bobot = ASUMSI, kalibrasi
    p_liq_long  = P * (1 - 1/N)                   # aproksimasi (abaikan MM/fee/funding)
    p_liq_short = P * (1 + 1/N)
    bins[bucket(p_liq_long)]  += dOI * w
    bins[bucket(p_liq_short)] += dOI * w
# hapus bin yang harganya sudah dilewati price
```
Selalu **estimasi** (Coinglass/Hyblock pun begitu). Butuh kalibrasi leverage-distribution.

### #6 Whale Flow futures (framing: risk context)
Kombinasi **ΔOI × arah harga** (standar industri) + net taker flow:

| Harga | OI | Arti | Sinyal |
|-------|----|----|--------|
| ↑ | ↑ | Long baru masuk | 🟢 Trend inflow |
| ↓ | ↑ | Short baru masuk | 🔴 Trend outflow |
| ↑ | ↓ | Short covering | 🟡 Bounce lemah |
| ↓ | ↓ | Long exit / likuidasi | 🟡 Distribusi |

```python
netFlow  = takerBuyUSD - takerSellUSD
signal   = classify(sign(dPrice), sign(dOI))
strength = robust_z(netFlow)                     # >=3 → High Alert
label    = "Short-Term" if window <= 15m else "Trend"
```
Status kuadran OI×harga = **terbukti standar**. Framing halal: tampilkan sebagai konteks
risiko BTC/market, disertai disclaimer, bukan sinyal entry futures.

### #5 Token Flow (CEX net-inflow) — prioritas brand
```sql
-- Dune: pakai cex.addresses
NetInflow = SUM(transfer masuk ke cex.addresses)
          - SUM(transfer keluar dari cex.addresses)   -- per token, per timeframe
Change%   = (now - prev) / abs(prev)
spike     = robust_z(NetInflow) >= 3.0
```
Status: metodologi = terbukti (sama CryptoQuant/Glassnode). Caveat: label tak 100%,
transfer internal = noise → filter.

### #8 Whale feed
```python
direction = "deposit" if to in cex.addresses else "withdraw"
threshold = max(USD_MIN, p99(transfer_usd[token]))   # dinamis per token
# simpan running balance wallet; sumber: Bitquery Transfers + cex.addresses
```

### #10 Announcement / Sentiment digest — mesin: Grok
Backend panggil Grok API tiap ~30 menit → simpan JSON ke tabel `announcements` + widget sentimen.
Prompt Grok: lihat Lampiran A.

---

## 5. Skema data (minimal)

```sql
metric_snapshots (               -- flow/metric per token per timeframe
  id, symbol, metric_type,       -- token_flow | whale_flow | liquidation | ...
  market_type,                   -- spot | futures | null
  timeframe,                     -- 5m..1Y
  value_json JSONB,              -- {net_inflow, inflow, outflow, change_pct, robust_z, label,...}
  source, captured_at,
  UNIQUE(symbol, metric_type, market_type, timeframe, captured_at)
)  -- TimescaleDB hypertable; index (symbol, captured_at)

liquidations (                   -- #11 (rolling window, dari Coinalyze)
  id, symbol, window, liq_long_usd, liq_short_usd, total_usd,
  side_bias, robust_z, captured_at
)

whale_txns (                     -- #8
  id, chain, tx_hash, symbol, direction, exchange, wallet,
  amount, usd_value, wallet_balance_after, captured_at, source
)

announcements (                  -- #10
  id, exchange, type, title, url, summary_ai, symbols TEXT[],
  severity SMALLINT, published_at
)
```

Ingestion = worker terjadwal (Celery/APScheduler; Redis sudah ada) → tulis snapshot → serve dari cache.

---

## 6. Integrasi ke fitur LuxQuant lain (diferensiasi vs ValueScan)

ValueScan menampilkan data ini terpisah. LuxQuant menjahitnya jadi satu narasi lewat AI Arena.

| Fitur baru | Disambung ke | Nilai tambah |
|------------|-------------|--------------|
| Token Flow (#5) | Money Flow + Watchlist | Granular per-token; alert "net inflow spike" |
| Whale Flow (#6) | BTC regime + AI Arena | Konteks risiko pasar (bukan sinyal futures) |
| Liquidation (#11) | OrderBook + Bitcoin page | Overlay level likuidasi = magnet harga |
| Whale feed (#8) | Whale Alert (ada) + Notifications | Perkaya dgn address/tx/saldo |
| Announcement (#10) | Delistings (ada) + Crypto News | Satu "Exchange Radar" |
| Top Lists (#12) | Markets page | Tambah kolom multi-tf |

**Pola integrasi:** semua metrik → `metric_snapshots` → **AI Arena & Signals membacanya sebagai confluence factor**:
```
confluence = w1*(netFlow searah) + w2*(token net inflow z>=3)
           + w3*(harga dekat cluster likuidasi) + w4*(whale flow searah)
→ perkuat / lemahkan verdict AI Arena
```
⚠️ Bobot `w1..w4` = **placeholder**. Wajib dikalibrasi dari data historis LuxQuant (pakai EdgeLab / backtest).
Tidak ada bobot universal; yang terbukti = **proses kalibrasinya**, bukan angka tetap.

---

## 7. Urutan build & biaya

| Fase | Fitur | Sumber | Biaya |
|------|-------|--------|-------|
| 1 | 12 Top Lists, 11 Liquidation treemap | CoinGecko, Coinalyze | $0 |
| 2 | 6 Whale Flow, 5 Token Flow, 10 News | Coinalyze/Binance, Dune, Grok | $0 (+ Grok API) |
| 3 | 8 Whale feed | Bitquery/Dune | $0 (non-komersial) |
| Tunda | 3 Main Cost, 4 Address metrics | Glassnode | ~$999/bln |

Target: 6 fitur ≈ 80% "rasa ValueScan" dengan **~$0/bln** (bayar dengan effort + maintenance).

---

## 8. Status kejujuran (proven vs perlu kalibrasi)

| Komponen | Status |
|----------|--------|
| Kuadran OI × harga (#6) | ✅ Terbukti standar |
| CEX netflow = masuk − keluar (#5, #8) | ✅ Terbukti standar |
| Robust z-score (median/MAD) | ✅ Terbukti (fat-tail) |
| Treemap likuidasi (Coinalyze) | ✅ Data valid (indeks relatif) |
| Liquidation price P×(1−1/N) | ⚠️ Aproksimasi (abaikan MM/fee/funding) |
| Bobot momentum / confluence / leverage-dist | ❌ Placeholder — WAJIB kalibrasi/backtest |

---

## Lampiran A — Prompt Grok untuk #10

```
You are the real-time crypto intelligence engine for a trading terminal.
Using your live access to X and the web, produce a JSON digest for the
LAST 6 HOURS. Do not invent anything; only include items you can verify
with a source URL.

Return EXACTLY this JSON shape:
{
  "exchange_announcements": [
    {"exchange":"", "type":"listing|delisting|maintenance|other",
     "symbols":["BTC"], "title":"", "url":"", "published_at":"ISO8601",
     "severity":1-5}
  ],
  "industry_highlights": [{"headline":"","why_it_matters":"","url":""}],
  "project_highlights": [{"symbol":"","update":"","url":""}],
  "macro": [{"headline":"","impact_on_crypto":"","url":""}],
  "market_sentiment": {"score":0-100,"label":"","top_bullish":["SYM"],
     "top_bearish":["SYM"],"summary":""}
}

Rules: dedupe near-identical items; prefer primary sources (exchange
blogs, official accounts) over rumor; flag unverified as severity<=2;
UTC timestamps; concise, factual, no hype.
```

## Lampiran B — Sumber riset
Coinalyze API docs · Binance Liquidation Order Streams (limit 1/dtk) · Binance Open Interest Statistics ·
Binance Long/Short Ratio · Dune `cex.addresses` · Bitquery Pricing & Whale-Alert guide ·
CoinGecko API rate limits · Glassnode Research (liquidation heatmaps) · DEXTools (liquidation maps).
