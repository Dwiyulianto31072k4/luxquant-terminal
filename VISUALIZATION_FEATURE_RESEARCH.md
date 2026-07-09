# LuxQuant — Signal Visualization Feature: Research & Database Findings

Referensi teknis untuk membangun fitur visualisasi (heatmap) di atas data **Potential Trade**.
Disusun dari pembacaan langsung codebase (backend `signals.py`, `money_flow_router.py`, `enrichment_service_v3.py`, migrations, `schema.sql`) + riset best-practice heatmap crypto.

> **Status scope (dari keputusanmu):** visualisasi = treemap tiles + matrix grid + bubble/scatter + sector heatmap. Cakupan = **hanya koin Potential Trade**. Dokumen ini menyiapkan fondasi data; contoh layout final menyusul darimu.

---

## 1. Ringkasan Eksekutif

- Fitur Potential Trade (`SignalsPage.jsx`) menarik **4 endpoint** lalu memfilter/mengurutkan **seluruhnya di frontend** (client-side) atas array 7 hari. Artinya menambah metrik = join field baru per-row + tambah opsi — **tidak wajib bikin endpoint baru**.
- **Rasio volume/market cap yang kamu minta SUDAH dihitung** di backend: `flow_intensity = volume_24h / market_cap` di `/money-flow/coins`, lengkap dengan tag turnover (high/elevated/normal) dan Δvolume 7d.
- Sumber metrik terkaya yang belum dipakai di halaman: **`signal_enrichment.entry_snapshot`** (JSONB) — berisi RSI, volume, ATR/volatilitas, funding, entry-quality per timeframe (m15/h1/h4) pada saat sinyal dibuat. Ini bahan emas untuk filter/warna heatmap.
- Kendala reliability utama: `signals.market_cap` disimpan sebagai **string** ("1.2B"), `created_at` sebagai **TEXT**, volume 24h live berasal dari **price provider di `SignalsTable`** (bukan DB), dan data ter-**redaksi** untuk non-subscriber.

---

## 2. Cara Kerja Potential Trade Sekarang

**Frontend:** `frontend-react/src/components/SignalsPage.jsx` (1577 baris) + `SignalsTable.jsx` (harga/volume live) + `SignalModal.jsx`.

Saat mount & tiap 30 detik memanggil 4 endpoint paralel (`Promise.allSettled`):

| Endpoint | Isi | Wajib? |
|---|---|---|
| `GET /api/v1/signals/bulk-7d` | Semua sinyal 7 hari (sumber utama tabel) | Ya |
| `GET /api/v1/signals/stats` | Win rate & jumlah agregat | Best-effort |
| `GET /api/v1/signals/coin-intel` | Win streak, win rate, verdict per-pair | Best-effort |
| `GET /api/v1/analytics/tag-wr` | Win rate historis per tag (90d) | Best-effort |

Pola penting:
- **Filter & sorting semua client-side** atas `allSignals`. Pagination 20/hal juga di frontend.
- **Harga & volume 24h live** di-fetch terpisah di `SignalsTable` (via price provider), lalu di-push ke parent lewat `handlePricesUpdate` → dipakai untuk sort "Volume 24H" & "Current Price". Jadi volume live **tidak** ada di `bulk-7d`.
- **Join by pair:** `coinIntel[s.pair]` menautkan win streak/verdict; BTC correlation sudah di-join di SQL `bulk-7d`.
- **Money Flow strip:** `moneyFlowApi.getCoins({limit:80})` dipakai untuk "Coin Flow Intensity" — ini pintu masuk `flow_intensity`.

Filter yang sudah ada: search pair, status (open/tp1-4/loss/recently-hit), risk level, high win streak, BTC decoupled, BTC high-align, verdict (worth/avoid), tanggal, tag. Sort: 16 opsi termasuk `volume`, `market_cap`, `win_rate`, `win_streak`, `btc_corr`, `max_target`, `stop_loss`.

---

## 3. Peta Database (skema production sebenarnya)

Skema production = `schema.sql` (base) + `backend/migrations/*` + tabel yang dibuat worker. ORM `models/signal.py` **tidak lengkap** — jangan dijadikan acuan. Berikut tabel yang relevan untuk visualisasi.

### 3.1 `signals` — inti Potential Trade
Kolom (dari `schema.sql`, PK `signal_id TEXT`):
`signal_id`, `channel_id`, `call_message_id` (unique, dipakai sort/tiebreak), `message_link`, `pair`, `entry`, `target1..4`, `stop1..2`, `risk_level` (text: low/normal/high), `volume_rank_num`, `volume_rank_den`, `created_at` **(TEXT)**, `status`, `raw_text`, `text_sha1`, `edit_date`, **`market_cap` (TEXT, mis. "1.2B")**, `risk_reasons`, `entry_chart_path`, `latest_chart_path`, `chart_status`.
Tambahan via worker (dipakai `/top-performers`): **`peak_price`**, **`peak_at`** (diisi `scripts/peak_price_worker.py`).

### 3.2 `signal_updates` — riwayat hit TP/SL
`signal_id`, `channel_id`, `update_message_id`, `update_type` (tp1..tp4/sl/stop), `price`, `update_at` (TEXT), dst. PK komposit. Status "sebenarnya" diturunkan dari tabel ini via CTE `signal_outcomes` (ambil level tertinggi yang kena).

### 3.3 `signal_btc_correlation` — korelasi ke BTC (migration 01 & 02)
Per `signal_id` (unique): `corr_1h_7d`, `corr_4h_30d`, `beta_30d`, `r_squared_30d`, `corr_zscore`, `is_decoupled`, `is_extended`, `btc_context` (JSONB: price/trend/rsi_14/regime/dominance), `interpretation` (JSONB: **`alignment_score`**, `risk_level`, headline, sizing_hint, hedge_hint…). Migration 02 menambah metrik lanjutan: `tail_corr_btc_down/up`, `downside_beta`, `lead_lag_hours`, `volatility_ratio`, `coin_volatility_pct`, `momentum_divergence_7d`, `sample_size`, `confidence`.
`bulk-7d` sudah expose: `btc_beta`, `btc_corr`, `btc_decoupled`, `btc_extended`, `btc_align_score`, `btc_risk`.

### 3.4 `signal_enrichment` — snapshot kaya per sinyal (JSONB) ⭐
Kolom `entry_snapshot` & `live_snapshot` (JSONB). `bulk-7d` baru memakai `entry_snapshot->'tags_annotated'` (untuk important_tags). Struktur `entry_snapshot.facts` (dari `enrichment_service_v3.py`):
- `by_timeframe.{m15,h1,h4}.trend` — arah/kekuatan tren
- `by_timeframe.{m15,h1,h4}.momentum` — **`rsi`**, `rsi_state`, `rsi_divergence`
- `by_timeframe.{m15,h1,h4}.volume` — fakta volume per TF
- `entry_quality` — kualitas titik entry
- `levels`, `structure` — S/R, struktur harga
- `context` — **`vol_24h_usd`**, funding rate, **`atr_percentile_h4`** (regime volatilitas), liquidity tier
- `tags` + `tags_annotated` (`{name, important}`)

> Ini sumber metrik paling kaya & **belum** tervisualisasikan. Ideal untuk sumbu bubble/warna heatmap (mis. RSI h1, ATR percentile, vol_24h saat entry).

### 3.5 `coins` — metadata koin (join by pair)
`base_symbol`, `coingecko_id`, `market_cap_rank`, `pair` (dilihat di view `v_signal_with_correlation`). Berguna untuk market cap numeric yang reliable & ranking.

### 3.6 Money Flow snapshots (worker `money_flow_worker.py`, retensi harian)
- **`mf_coin_snapshots`**: `snapshot_at`, `coin_id`, `symbol`, `price`, `market_cap` (numeric), `volume_24h` (numeric), `price_change_24h/7d/30d`, `is_luxquant_signal`. → sumber `/money-flow/coins` & `flow_intensity`.
- **`mf_sector_snapshots`**: `category_id`, `name`, `market_cap`, `volume_24h`, `market_cap_change_24h`, `top_3_coins`. → `/money-flow/sectors`.
- **`mf_macro_snapshots`**: `btc_dominance`, `eth_dominance`, `stablecoin_dominance`, `total_market_cap`, `total_volume_24h`, `altseason_index`. → `/money-flow/macro`.

---

## 4. Katalog Metrik (siap dipakai heatmap)

### A. Per sinyal — dari `/signals/bulk-7d` (tanpa kerja tambahan)
| Metrik | Field | Tipe | Catatan |
|---|---|---|---|
| Pair | `pair` | string | kunci join |
| Entry / Targets / Stops | `entry`,`target1..4`,`stop1..2` | float | — |
| Max target % | turunan | % | `(maxTarget-entry)/entry` (sudah dihitung di FE) |
| Stop % | turunan | % | dari `stop1` |
| Risk:Reward | turunan | rasio | `|target-entry|/|entry-stop|` |
| Risk level | `risk_level` | enum | low/normal/high |
| Status | `status` | enum | open/tp1-3/closed_win/closed_loss |
| Market cap | `market_cap` | **string** | perlu parse "B/M/K/T"→number |
| Volume rank | `volume_rank_num/den` | int | ranking volume saat call |
| BTC beta / corr | `btc_beta`,`btc_corr` | float | — |
| BTC alignment | `btc_align_score` | 0–100 | warna bagus |
| BTC decoupled/extended | bool | — | filter |
| Important tags | `important_tags` | array | filter chip |
| Umur sinyal | `created_at` | TEXT→date | recency |

### B. Per pair — dari `/signals/coin-intel`
Win rate historis, `current_streak {type, length}`, verdict (`worth_it`/`avoid`/neutral via `classifyCoin`), `current_flow`.

### C. Live — dari price provider (`SignalsTable`)
`current_price`, **`volume` 24h live**, % dari entry ("from call").

### D. Per koin — dari `/money-flow/coins` ⭐ (kunci permintaanmu)
| Metrik | Field | Interpretasi |
|---|---|---|
| **Volume/MCap ratio** | `flow_intensity` | turnover; benchmark sehat ±2–15%/hari (lihat §5) |
| Turnover tag | `turnover_tag` | high (≥0.30) / elevated (≥0.10) / normal |
| Δ Volume 7d | `vol_change_7d` | akselerasi minat |
| Market cap (numeric) | `market_cap` | **untuk ukuran tile** |
| Volume 24h (numeric) | `volume_24h` | — |
| Price change | `price_change_24h/7d/30d` | **untuk warna tile** |
| Flag LuxQuant | `is_luxquant_signal` | filter scope Potential Trade |

### E. Enrichment (butuh expose field baru di `bulk-7d`) ⭐
RSI per TF, `rsi_divergence`, ATR percentile (regime volatilitas), `vol_24h_usd` saat entry, funding rate, entry-quality, liquidity tier. Sumber `signal_enrichment.entry_snapshot.facts`.

### F. Market-wide — `/money-flow/sectors` & `/macro`
Rotasi modal per sektor (Δmcap 24h/7d/30d), BTC/ETH/stablecoin dominance, altseason index. → untuk **sector heatmap**.

---

## 5. Interpretasi Volume/Market-Cap Ratio (riset)

`flow_intensity = volume_24h / market_cap`. Konsensus riset:
- **Rasio tinggi** = likuiditas kuat + minat/hype tinggi; entry/exit mulus, tapi bisa sinyal volatilitas jangka pendek / spekulasi.
- **Rasio rendah** = minat lemah/stagnan; rawan slippage & volatilitas saat masuk-keluar.
- **Benchmark sehat** umumnya **~2–10%** (koin mapan bisa 5–15%). Ekstrem tinggi bisa indikasi manipulasi/hype pump.

Backend LuxQuant sudah memetakan ini ke tag: `high_turnover` ≥0.30, `elevated_turnover` ≥0.10, `normal_turnover` <0.10 — konsisten sebagai lapisan warna/filter.

---

## 6. Konvensi Heatmap (riset best-practice)

Dari TradingView / CoinMarketCap / COIN360 / CryptoRank:
- **Ukuran tile = market cap** (konvensi standar; mata langsung menangkap "besar = penting").
- **Warna tile = % price change** (hijau/merah), timeframe bisa dipilih (24h/7d/30d).
- **Volume** sebagai filter/threshold atau info saat hover.
- **Grouping = sektor** (treemap hierarkis) untuk melihat rotasi modal antar sektor.
- Interaksi standar: hover tooltip detail, klik tile → drill (buka SignalModal), selector timeframe & metrik.

Untuk LuxQuant kita bisa "membajak" konvensi ini tapi ganti dimensi dengan metrik sinyal:
size = market cap **atau** flow_intensity; warna = win_rate / btc_align / price_change / max_target%; filter = turnover, risk, status, streak.

---

## 7. Rancangan 4 Tipe Visualisasi (scope: koin Potential Trade)

Semua memakai dataset yang sama: sinyal 7 hari (`bulk-7d`) di-join dengan coin-intel + money-flow coins (`is_luxquant_signal`) + live volume. Satu "model data gabungan" per pair menyuplai keempat view.

1. **Treemap tiles** — tile per pair. Ukuran & warna = metrik yang dipilih user (dropdown "Size by" / "Color by"). Default: size=market cap, color=max target %. Grouping opsional per sektor/risk.
2. **Matrix grid (koin × metrik)** — baris = pair, kolom = metrik ternormalisasi (win rate, flow_intensity, btc_align, RSI, max target%, streak), tiap sel diwarnai skala. Bagus untuk banding presisi + sort per kolom.
3. **Bubble/scatter** — X & Y = 2 metrik pilihan (mis. flow_intensity vs win_rate), ukuran bubble = metrik ke-3 (market cap), warna = risk/verdict. Untuk lihat cluster/outlier.
4. **Sector heatmap** — kelompokkan pair Potential Trade ke sektor (via `coins`/CoinGecko category atau `mf_sector_snapshots`), warnai rotasi modal. "Uang lagi ke sektor mana + sinyal kita di situ ada berapa".

Semua share: panel filter (reuse logika `SignalsPage`), selector metrik, tooltip, klik→`openSignal()`.

---

## 8. Rencana Integrasi Data

**Opsi A — Full client-side (paling cepat, MVP):**
Reuse 4 endpoint existing + `moneyFlowApi.getCoins({luxquant_only:true})`. Bangun util `buildCoinModel(signals, coinIntel, flowCoins, livePrices)` → array objek per pair dengan semua metrik. Komponen viz konsumsi array ini. Tanpa backend baru.

**Opsi B — Endpoint agregat baru (kalau butuh enrichment/RSI/ATR):**
Tambah `GET /api/v1/signals/heatmap` yang di server sudah join `signals` + `signal_btc_correlation` + `signal_enrichment` (extract RSI/ATR/vol dari JSONB) + `mf_coin_snapshots`. Mengurangi kerja FE & buka metrik enrichment. Rekomendasi: mulai Opsi A, naik ke B saat perlu RSI/ATR/sektor.

**Refresh:** ikut pola 30 detik existing. Money-flow snapshot di-refresh worker berkala (bukan real-time) — tandai "as of snapshot_at".

---

## 9. Catatan Reliability & Gotcha

- **`market_cap` string** → parse "T/B/M/K" ke number (helper `parseMcap` sudah ada di `SignalsPage`). Untuk angka reliable pakai `mf_coin_snapshots.market_cap` (numeric) join by symbol.
- **`created_at`/`update_at` TEXT** → parse hati-hati; sort pakai `call_message_id` (lebih stabil, sudah jadi tiebreaker).
- **Volume live** hanya ada setelah `SignalsTable` fetch; kalau viz berdiri sendiri tanpa tabel, harus fetch harga/volume sendiri atau pakai `mf_coin_snapshots.volume_24h` (snapshot, bukan real-time).
- **Redaksi non-subscriber:** `bulk-7d` menyembunyikan entry/target/stop/link untuk non-subscriber (`is_redacted:true`). Viz harus handle field null (mis. sembunyikan tile detail / soft-paywall).
- **Money-flow di-gate premium** (`require_subscription` di router). Scope Potential Trade + money-flow = subscriber-only path.
- **Symbol vs pair:** money-flow pakai `symbol` (BTC), signals pakai `pair` (BTCUSDT). Normalisasi (`pair.replace(/USDT$/,'')`) — sudah dipakai di FE.
- **Missing data sink:** ikuti pola existing — row tanpa data (volume 0 / null streak) tenggelam ke bawah, jangan cemari sort ascending.
- **Enrichment tidak selalu ada** untuk semua sinyal (stale/backfill). Treat sebagai best-effort.

---

## 10b. Live Data — apa yang bisa ditambah untuk visualisasi realtime

**Kondisi sekarang:** WebSocket **belum ada** (`websocket.py` masih TODO). Data live per-pair mengalir lewat polling proxy `GET /api/v1/market/prices?symbols=...` (di-chunk, refresh ~15 dtk di `SignalsTable`). Proxy ini **hanya mengembalikan `{price, volume}`** — padahal ticker mentahnya jauh lebih kaya.

> **Sumber utama sudah Binance Futures.** `_fetch_binance_tickers` di `market.py` memanggil `fapi/v1/ticker/24hr` **lebih dulu** (spot & Bybit hanya fallback). Karena **semua token yang di-call LuxQuant listing di Binance Futures**, kita bisa standarkan live-layer sepenuhnya ke `fapi` — satu sumber, semua pair ke-cover, plus buka data derivatif (funding/OI/long-short/taker) per-symbol. Response `ticker/24hr` sudah berisi semua field di bawah; kodenya cuma membuangnya.

### Binance Futures (fapi) — endpoint per-symbol yang relevan
| Endpoint | Data | Guna |
|---|---|---|
| `fapi/v1/ticker/24hr` | `lastPrice`, `priceChangePercent`, `highPrice`, `lowPrice`, `weightedAvgPrice`, `openPrice`, `quoteVolume`, `count` | inti heatmap live (1 call untuk semua symbol) |
| `fapi/v1/premiumIndex` | `lastFundingRate`, `markPrice` | funding sentiment |
| `fapi/v1/openInterest` + `futures/data/openInterestHist` | open interest | tekanan posisi |
| `futures/data/globalLongShortAccountRatio` / `topLongShortPositionRatio` | rasio long/short | sentimen |
| `futures/data/takerlongshortRatio` | taker buy/sell | tekanan beli/jual live |
| `fapi/v1/klines` | OHLC | sparkline per tile |

### Quick win #1 — perkaya `/market/prices` (ubah kecil, dampak besar)
Ticker mentah sudah berisi field yang saat ini **dibuang**. Tinggal tambahkan ke response:
| Field baru | Sumber ticker | Guna di heatmap |
|---|---|---|
| `price_change_pct_24h` | Binance `priceChangePercent` / Bybit `price24hPcnt` | **warna tile realtime** (hijau/merah) — sekarang cuma BTC yang punya |
| `high_24h` / `low_24h` | `highPrice`/`lowPrice` | posisi harga di range hari ini (mis. dekat high = momentum) |
| `turnover_24h` | `quoteVolume`/`turnover24h` | volume USD realtime (sudah ada sebagian) |
| `bid`/`ask` (opsional) | `bid1Price`/`ask1Price` | spread → proxy likuiditas |

Ini membuat warna & momentum heatmap **live per-pair**, bukan snapshot. Perubahan terlokalisir di `market.py` (`_fetch_binance_tickers`/`_fetch_bybit_tickers` + `/prices`) + FE `getVolVal`-style getter.

### Quick win #2 — turunan live yang bisa dihitung di FE (tanpa endpoint baru)
- **% from call** (entry→harga live) — indikator "sinyal masih fresh atau sudah jalan".
- **% ke target/stop terdekat** — jarak realtime ke TP1/SL (progress bar warna).
- **Live flow_intensity** = `turnover_24h / market_cap` dihitung realtime (bukan snapshot money-flow).
- **Range position** = `(price - low_24h) / (high_24h - low_24h)`.

### Sumber live tambahan yang SUDAH ada (per-symbol, tinggal dipanggil)
| Endpoint | Data live | Catatan |
|---|---|---|
| `/market/funding-rate/{symbol}` & `/funding-rates` | funding rate | sentimen futures per koin |
| `/market/open-interest` (+ `/open-interest-history`) | OI | terima param `symbol` |
| `/market/long-short-ratio`, `/top-trader-ratio` | rasio long/short | sentimen per symbol |
| `/market/taker-volume` | taker buy/sell | tekanan beli/jual live |
| `/orderbook/analysis`, `/orderbook/comparison` | bid/ask pressure | likuiditas realtime |
| `/whale/transactions`, `/whale/stats`, `/whale/flows` | aliran whale | on-chain |
| `/market/klines` | OHLC | sparkline per tile |

> Rekomendasi live-layer: **v1** cukup Quick Win #1 + #2 (price/%change/volume/flow_intensity realtime + % from call) — sudah bikin heatmap "hidup". Funding/OI/long-short/orderbook/whale = **enrichment opsional** saat hover/drill, di-fetch on-demand supaya tidak membebani refresh 15 dtk.

### Upgrade jangka panjang (opsional)
Implementasikan `websocket.py` (Binance `!ticker@arr` stream) → push harga/%change realtime tanpa polling. Untuk MVP, polling 15 dtk yang ada sudah memadai.

---

## 10c. Penempatan Fitur & Paritas Filter (konfirmasi arahmu)

**Setuju — halaman/popup terpisah, bukan mengubah SignalsPage.** Rekomendasi:
- **Halaman baru `/heatmap`** (atau `/visualize`) sebagai default — ruang lebih lega untuk 4 tipe viz + panel filter, bisa deep-link & bookmark. Tambah entri di nav/`More` menu.
- **Atau modal/pop-up full-screen** dipicu tombol "Visualize" di SignalsPage — enak untuk "lihat cepat lalu tutup", tapi sempit untuk 4 viz sekaligus.
- Bisa keduanya: tombol di SignalsPage yang membuka halaman `/heatmap` (bukan modal) — tidak mengganggu tabel existing.

**Paritas data & filter dengan SignalsPage (wajib):** viz memakai **dataset yang sama** (`bulk-7d` + coin-intel + money-flow) dan **panel filter identik**. Supaya tidak menduplikasi logika, ekstrak filter/sort dari `SignalsPage.jsx` menjadi **hook bersama** `useSignalFilters(allSignals, coinIntel, …)` yang mengembalikan `filteredSignals` + state filter. SignalsPage dan Heatmap sama-sama pakai hook ini → filter "persis sama" dan tidak bisa desync. Semua filter existing (search pair, status, risk, streak, BTC decoupled/align, verdict, tanggal, tag) langsung berlaku di heatmap.

---

## 10. Pertanyaan Terbuka / Langkah Berikut

Menunggu **contoh layout** darimu. Sambil itu, keputusan yang perlu dikonfirmasi:
1. Metrik default untuk **size** & **color** treemap? (usul: size=market cap, color=max target % atau win rate)
2. Perlu metrik **enrichment (RSI/ATR/funding)** di v1? (menentukan Opsi A vs B integrasi)
3. Timeframe warna: pakai 24h/7d/30d dari money-flow, atau "% from call" (entry→now)?
4. Sektor: sumber kategori pakai `mf_sector_snapshots` (CoinGecko categories) — cukup?
5. Heatmap jadi **halaman baru** (`/heatmap`) atau **tab di Potential Trade**?

Begitu layout & jawaban di atas masuk, langkah teknis: (1) util `buildCoinModel`, (2) komponen viz per tipe, (3) panel filter/metrik selector bersama, (4) integrasi route/tab, (5) uji dengan data real + handle redaksi.
