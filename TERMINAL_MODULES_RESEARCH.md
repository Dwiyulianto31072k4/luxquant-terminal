# LuxQuant — Riset Terminal Crypto Top & Peta Modul Visualisasi

Koreksi arah: fitur ini **bukan cuma heatmap**. Terminal top crypto = **suite banyak modul**. Heatmap hanya 1 dari ~12 modul. Dokumen ini: (1) katalog modul yang mereka punya, (2) petakan tiap modul ke data LuxQuant + status kelayakan, (3) usulan suite LuxQuant yang main di keunggulan uniknya (data sinyal/win-rate — yang CoinGlass/Velo TIDAK punya).

---

## 1. Apa yang sebenarnya divisualisasikan terminal top

Dari CoinGlass, Velo, Coinalyze, TradingView, Coin360/CryptoRank:

**Derivatif / futures (inti CoinGlass & Coinalyze):**
- **Liquidation Heatmap / Map** — klaster likuidasi per level harga sepanjang waktu (fitur andalan CoinGlass).
- **Funding Rate Heatmap** — koin × timeframe, warna = sentimen funding (positif/negatif).
- **Open Interest** — chart OI agregat lintas exchange + Δ.
- **Long/Short Ratio** — rasio akun/posisi long vs short.
- **Order Book / Liquidity Heatmap** — kedalaman L2/L3 di atas candle (wall bid/ask).
- **Order Flow / Footprint / TPO** — delta beli-jual per level (Velo/Buildix).
- **Options** — OI & volume opsi (CoinGlass).

**Market/spot & makro (TradingView, Coin360, CryptoRank):**
- **Market Heatmap / Treemap** — size = market cap, warna = % change.
- **RSI Heatmap** — semua koin, skala oversold/overbought (CoinGlass RSI tracker).
- **Sector / Category rotation** — rotasi modal antar sektor.
- **Dominance & Altseason** — BTC/ETH/stablecoin dominance, altseason index.
- **Screener** — tabel multi-metrik + filter (Velo free screener).

**On-chain:**
- **Whale flows / exchange in-out**, on-chain analytics.

**Pola desain umum:** dashboard multi-panel yang bisa di-custom, real-time, warna = sentimen/intensitas, hover→detail, klik→drill, selector timeframe & metrik, dan (Coinalyze) **custom metric** dari kombinasi data stream.

---

## 2. Peta Modul → Data LuxQuant (status kelayakan)

Status: ✅ bisa sekarang (data ada) · 🟡 perlu tambah endpoint Binance Futures (data ada, tinggal panggil) · 🔴 perlu sumber data baru (belum ada).

| Modul (ala terminal top) | Sumber data LuxQuant | Status | Catatan |
|---|---|---|---|
| **Signal Screener** (tabel+filter) | `bulk-7d` + coin-intel | ✅ | Sudah ada di SignalsPage; tinggal dipindah/di-embed |
| **Market/Signal Heatmap** (treemap) | `bulk-7d` + money-flow coins + fapi ticker | ✅ | Prototipe sudah dibuat |
| **RSI Heatmap** | `signal_enrichment.entry_snapshot` (rsi per TF) + fapi | ✅/🟡 | RSI saat entry sudah ada; RSI live perlu hitung dari klines |
| **Sector Rotation** | `mf_sector_snapshots` (`/money-flow/sectors`) | ✅ | Δmcap 24h/7d/30d per sektor |
| **Dominance & Altseason** | `mf_macro_snapshots` (`/money-flow/macro`) | ✅ | BTC/ETH/stable dominance + altseason index |
| **Funding Rate Heatmap** | fapi `premiumIndex` / `/market/funding-rates` | 🟡 | Sudah ada endpoint utk BTC; perluas ke semua pair signal |
| **Open Interest** | fapi `openInterest` + `openInterestHist` | 🟡 | Endpoint ada (param symbol); tinggal loop pair signal |
| **Long/Short Ratio** | fapi `globalLongShortAccountRatio` | 🟡 | Endpoint ada utk BTC; perluas |
| **Taker Buy/Sell Pressure** | fapi `takerlongshortRatio` / `/market/taker-volume` | 🟡 | Sama |
| **Order Book / Liquidity** | `orderbook_service` (Bybit) | 🟡 | **Cuma BTC & ETH** sekarang; perlu diperluas per pair |
| **Whale / Exchange Flows** | `whale_service` (Whale Alert) | ✅ | `/whale/flows`, `/transactions` |
| **BTC Correlation Matrix** | `signal_btc_correlation` | ✅ | beta, corr, alignment, decoupled — **unik LuxQuant** |
| **Liquidation Heatmap/Map** | — | 🔴 | Perlu feed likuidasi (Binance liq stream/CoinGlass API). Data belum ada |
| **Order Flow / Footprint / TPO** | — | 🔴 | Perlu data tick/trade granular; belum ada |
| **Options** | — | 🔴 | Belum ada sumber opsi |

**Kesimpulan kelayakan:** ~12 dari 15 modul bisa dibangun (8 ✅ sekarang, 6 🟡 tinggal perluas fapi). Yang **tidak** realistis tanpa sumber data baru: liquidation heatmap, order-flow footprint, options — ini justru andalan CoinGlass, tapi butuh feed khusus.

---

## 3. Keunggulan unik LuxQuant (jangan cuma niru — ungguli)

CoinGlass/Velo/Coinalyze **tidak punya**: data **call/sinyal + outcome** (win rate, TP/SL hit, streak), **enrichment saat entry** (RSI/ATR/volume/tags per timeframe), dan **BTC correlation per sinyal**. Ini moat LuxQuant.

Maka suite LuxQuant harus **overlay konteks derivatif generik DI ATAS lapisan sinyal** — mis. heatmap funding tapi hanya untuk koin yang lagi di-call, atau OI/long-short yang ditandai "sinyal aktif di sini". Tidak ada terminal lain bisa lakukan itu.

---

## 4. Usulan: "LuxQuant Terminal" — dashboard multi-modul

Halaman baru `/terminal` (atau `/visualize`), layout dashboard dengan **panel yang bisa dipilih/di-custom**, semua share filter Potential Trade (`useSignalFilters`). Diprioritaskan per tier:

**Tier 1 — bisa sekarang, dampak tinggi (data ✅):**
1. **Signal Screener** (pindahan tabel SignalsPage) — inti.
2. **Signal Heatmap** (treemap/matrix/bubble/sector) — prototipe sudah ada.
3. **Sector Rotation + Dominance/Altseason strip** — konteks makro "uang ke mana".
4. **BTC Alignment panel** — matrix korelasi sinyal ke BTC (unik).
5. **Whale / Exchange Flow** ticker.

**Tier 2 — perluas fapi ke semua pair signal (🟡, backend kecil):**
6. **Funding Rate Heatmap** (koin signal × waktu).
7. **Open Interest + Δ** per pair signal.
8. **Long/Short & Taker pressure** gauge per pair.
9. **RSI Heatmap live** (dari klines).

**Tier 3 — butuh sumber data baru (🔴, roadmap):**
10. Liquidation heatmap (integrasi CoinGlass API / Binance liq stream).
11. Order-flow/footprint (butuh data trade granular).

**Interaksi ala terminal top:** timeframe selector global, warna=sentimen/intensitas, hover tooltip, klik→SignalModal, layout panel bisa disusun, refresh live 15 dtk (fapi).

---

## 5. Yang perlu diputuskan

1. **Bentuk:** dashboard multi-panel (ala CoinGlass Pro) atau kumpulan tab (Screener / Heatmap / Funding / OI / …)?
2. **Scope Tier 1 dulu** (semua data siap) lalu Tier 2, atau langsung sekalian Tier 2?
3. **Liquidation heatmap** (andalan CoinGlass) — mau investasi integrasi data eksternal, atau skip?
4. Modul mana yang paling kamu mau duluan? (mis. funding heatmap sering jadi pembeda)

> Prototipe heatmap yang sudah ada = **modul #2** dari suite ini. Langkah berikut: aku bisa perluas prototipe jadi **dashboard multi-panel** (screener + heatmap + funding + OI + sector + BTC align) supaya kelihatan wujud "terminal"-nya, bukan cuma satu heatmap.
