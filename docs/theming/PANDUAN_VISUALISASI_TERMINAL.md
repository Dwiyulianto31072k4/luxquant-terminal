# LuxQuant Terminal — Panduan Visualisasi

Cara baca tabel: **Menampilkan** = data mentahnya, **User bisa apa** = aksi praktis, **Skenario & Trik** = cara membacanya jadi keputusan ("kalau … cenderung …").

> Prinsip umum LuxQuant: setiap call aktif maksimal 7 hari. Semua visual di bawah membantu memilih *call mana yang layak diambil*, *seberapa besar*, dan *kapan waspada* — bukan bikin sinyal baru, tapi memperkuat/menyaring sinyal yang sudah ada.

---

## 🎯 SIGNALS

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **Confluence** | Card sinyal high-conviction: arah, HTF strength, MTF alignment (4H/1H/15m), entry tag, warning, % from call | Screening call terbaik; filter chip (HTF strong / full aligned / fresh / golden / no-warning); lihat **Coiled** (setup bagus belum gerak) | **Kalau** HTF strong + full aligned + masih *fresh* (dekat entry) → setup paling bersih, prioritaskan. **Kalau** ada warning atau sudah jauh dari entry → kualitas turun, kecilkan size atau skip. **Trik:** "Coiled" = belum bergerak = risk/reward terbaik karena entry masih dekat. |
| **Overview** | Market Regime gauge + KPI + Time-to-TP1 + **Outcomes by Day** (TP1–4 vs SL) + Signals by Sector | Baca *backdrop* pasar sebelum ambil call; lihat kecepatan capai TP & komposisi menang/kalah; sektor terkonsentrasi | **Kalau** gauge di zona risk-on (altseason tinggi, breadth luas) → longs lebih aman, boleh agresif. **Kalau** risk-off → kecilkan size, utamakan sinyal terkuat saja. **Trik:** kalau banyak call menumpuk di 1 sektor, kamu sebenarnya megang 1 taruhan besar — jangan tertipu "diversifikasi" palsu. |
| **Live** | Breadth, best mover, Δ-from-call, **Opportunity Map** (dist vs upside tersisa), **Peak-vs-Now giveback**, Top Movers | Pantau tiap call live vs entry; cari yang masih dekat entry + upside besar | **Kalau** call masih dekat entry tapi upside ke TP masih besar → *late entry* masih layak. **Kalau** "giveback" tinggi (sudah pump lalu balik turun) → momentum habis, jangan kejar. **Trik:** Opportunity Map pojok "dekat entry + upside besar" = tempat berburu entry telat. |
| **Anomaly** | Anomaly scatter (price × volume intensity), Volume Spike Detector, Outperform/Underperform BTC | Bedakan pump nyata vs noise; koin yang gerak lepas dari BTC | **Kalau** harga naik **dengan** volume spike → gerakan didukung partisipasi (lebih valid). **Kalau** harga naik **tanpa** volume → rapuh, sering fakeout. **Trik:** koin outperform BTC saat BTC flat = ada katalis spesifik koin itu, layak ditelusuri. |

---

## 📈 DERIVATIVES

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **Open Interest** | OI Δ × Price Δ quadrant + OI Builders/Unwinds | Cek gerakan ada "bahan bakar" leverage atau tidak | **Harga↑ + OI↑** = uang baru masuk long → tren didukung. **Harga↑ + OI↓** = short covering → rally rapuh, hati-hati exhaustion. **Harga↓ + OI↑** = short baru agresif. **Harga↓ + OI↓** = long ditutup/likuidasi, tekanan mereda. **Trik:** harga bikin high baru tapi OI turun = warning kehabisan tenaga. |
| **Long / Short** | LSR distribution, **Top Traders vs Retail**, Taker Pressure, Crowded Positioning, **Liquidation tape live** | Baca crowd positioning, smart-money vs retail, likuidasi real-time | **Kalau** retail heavy short (LSR ≪1) tapi top traders long (>1.5) → whale akumulasi diam-diam, condong contrarian bullish. **Kalau** semua ekstrem satu arah → pasar rapuh, rawan squeeze balik. **Trik:** tape likuidasi memerah deras di satu sisi sering menandai *local bottom/top* (capitulation). |
| **Funding & Squeeze** | Funding neg/pos leaderboard, **Perp Basis** (rich/cheap), Funding × Δ scatter | Cari funding ekstrem (squeeze fuel), premium/diskon perp | **Funding sangat positif + OI naik** = long overheat → risiko long-squeeze (flush turun). **Funding negatif + OI tinggi** = short overheat → bahan bakar short-squeeze (naik). **Trik:** funding "salah arah" vs harga (divergence ekstrem) sering resolve dengan gerakan violent — itu setup paling reliable. |
| **Squeeze** | Squeeze score radar (funding × L/S, size = OI) | Lihat sisi mana paling crowded/extended | **Kalau** bubble besar (OI gede) + funding ekstrem + LSR condong → titik paling rawan squeeze. **Trik:** pakai ini sebagai peringatan risiko, bukan entry langsung — crowded bisa tambah crowded dulu sebelum pecah. |

---

## 🧭 MARKET

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **vs BTC** | Relative strength tiap call vs BTC (logo koin di ujung garis) | Lihat mana outperform/underperform BTC | **Kalau** koin outperform saat BTC sideways → kekuatan relatif asli, kandidat kuat. **Kalau** cuma naik ikut BTC → bukan alpha, cuma beta. **Trik:** di pasar risk-on cari yang paling outperform; di risk-off yang paling *tahan* turun. |
| **BTC Correlation** | Korelasi tiap koin ke BTC | Cari yang decoupled | **Kalau** korelasi rendah → gerak sendiri, bagus untuk diversifikasi & tahan saat BTC drop. **Trik:** kalau BTC mau volatile, koin high-correlation ikut kena — kurangi exposure ke situ. |
| **Momentum** | RS × volume-accel scatter + leaderboard (momentum score 0–100) | Cari yang kuat + volume naik | **Kalau** RS tinggi **dan** volume accel naik → momentum sehat, tren cenderung lanjut. **Kalau** RS tinggi tapi volume melambat → momentum menua. **Trik:** kuadran "kuat + volume naik" = tempat momentum trade paling aman. |
| **Sectors** | Rotasi sektor (Δ market cap) | Lihat sektor mana panas | **Kalau** 1 sektor memimpin konsisten → rotasi sedang jalan, ikuti pemimpinnya. **Trik:** uang crypto rotasi bergiliran; sektor yang baru mulai naik sering punya runway lebih panjang daripada yang sudah pump lama. |

---

## 🔎 SCREENERS

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **RSI Heatmap** | RSI(14 · 1h) semua call, band overbought/oversold + garis rata-rata | Lihat mana yang stretched (≥70) atau beaten (≤30) | **Kalau** RSI ≥70 **tapi tren kuat** → jangan short buta; crypto bisa "stay overbought" berhari-hari saat trending. **Kalau** RSI ≤30 di koin bagus → kandidat mean-reversion bounce. **Trik:** RSI paling ampuh untuk *timing entry* di dalam call yang sudah valid — beli saat pullback ke oversold, bukan saat sudah overbought. |
| **ATR Levels** | Daily-range exhaustion (range 24h vs ATR harian) | Lihat mana yang sudah "habis" range hariannya vs fresh | **Kalau** exhaustion ≥100% (EXCEEDED) → sudah gerak > rata-rata harian, kejar entry di sini berisiko reversi/pullback. **Kalau** FRESH (rendah) → masih ada ruang gerak, entry lebih nyaman. **Trik:** pakai ATR untuk set stop — stop di bawah ~1.5× ATR biar tidak kena *noise* biasa. |

---

## ⚡ EDGE

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **Edge Simulator** | **Edge Economics** (expectancy / profit factor / R:R / where winners exit) + **Edge Map** (win-rate × sample × EV per pattern) + drill | Buktikan edge dalam angka; pattern confluence mana yang beneran menang | **Kalau** sebuah pattern punya win-rate tinggi **dan** sample cukup banyak **dan** EV positif → itu edge nyata, boleh dibobot lebih besar. **Kalau** win-rate tinggi tapi sample kecil → belum signifikan, jangan over-percaya. **Trik:** profit factor >1.5 & expectancy positif = sistem layak dijalankan konsisten; fokus perbesar size di pattern EV tertinggi. |
| **Risk Calculator** | Position size / leverage / R:R / breakeven WR / harga likuidasi + R-ladder + ATR + **correlation guard** | Ubah call jadi trade ter-ukur | **Kalau** breakeven win-rate > win-rate historismu → R:R terlalu jelek, geser TP/SL. **Kalau** correlation guard menyala (banyak call searah/BTC-align) → total risiko lebih besar dari yang terlihat, kecilkan tiap posisi. **Trik:** patok risiko per trade ~1–2% akun; biarkan tool yang hitung size — jangan tentukan lot dulu baru cari alasan. |

---

## 🗺️ MARKET MAP

| Visualisasi | Menampilkan | User bisa apa | Skenario & Trik |
|---|---|---|---|
| **Treemap** | Ubin market-cap × warna metrik + dominance / altseason / sector rotation | Peta pasar sekilas: di mana bobot & panas | **Kalau** BTC dominance naik + altseason index rendah → uang lari ke BTC, alt cenderung lemah (kurangi alt). **Kalau** dominance turun + altseason naik → giliran alt, agresif di alt. **Trik:** warna hijau menyebar merata = breadth sehat; hijau cuma di segelintir ubin besar = rally sempit/rapuh. |
| **Bubble** | Peta Momentum × Turnover (kuadran) | Lihat "hot money rising" vs "fading" | **Kalau** momentum tinggi + turnover tinggi → uang aktif masuk, tren hidup. **Kalau** momentum tinggi tapi turnover mengering → minat memudar, siap-siap balik arah. **Trik:** kuadran kanan-atas untuk ikut tren, kuadran kanan-bawah (momentum tinggi, volume turun) untuk waspada exit. |
| **Matrix** | Heatmap koin × metrik (WR / Vol-MCap / BTC align / Max Tgt / From Call / Δ24h), sortable, header sticky | Bandingkan banyak metrik sekaligus | **Trik:** urutkan by 1 metrik lalu scan baris — koin yang "hijau di banyak kolom" adalah confluence terbaik. Satu kolom merah menyala (mis. warning/BTC misalign) cukup untuk downgrade sebuah call meski metrik lain bagus. |
| **Explore** | Scatter bebas: pilih sumbu X / Y / warna sendiri | Eksplorasi hubungan metrik apa pun | **Trik:** uji hipotesismu sendiri — mis. plot *funding* (X) vs *Δ24h* (Y) untuk lihat apakah funding ekstrem beneran mendahului pembalikan pada data call kamu. Titik yang jauh dari kerumunan (outlier) biasanya cerita paling menarik. |

---

## 🌐 Fitur lintas-semua (bukan tab)

| Fitur | Fungsi | Trik |
|---|---|---|
| **Hover status koin** | Arahkan kursor ke logo/nama koin → status sinyal (OPEN/TP/SL) + "called Xh ago" | Cek *umur* call sebelum masuk — call yang baru di-call beberapa jam lalu masih dekat entry; yang sudah 5 hari mendekati kedaluwarsa 7 hari. |
| **Klik koin → modal detail** | Status, waktu call, stats, tombol "Open full signal" | Dari chart mana pun langsung lompat ke detail sinyal — alur riset cepat tanpa pindah tab. |
| **Pan + zoom** | Semua scatter bisa digeser & di-zoom (ter-clamp ke data) | Zoom ke kluster padat untuk baca label yang tumpang-tindih; double-click reset. |
| **Filter multi-tanggal** | Pilih hari-hari spesifik dalam window 7 hari | Bandingkan performa call per hari — mis. isolasi hari BTC dump untuk lihat mana yang tahan. |
| **Status rings** | Warna status mengelilingi tiap titik scatter | Baca sebaran outcome (OPEN/TP/SL) langsung di chart tanpa buka satu-satu. |

---

### Alur kerja terintegrasi (cara pakai semuanya bersama)
1. **Regime (Overview + Treemap dominance/altseason)** → tentukan agresif atau defensif hari ini.
2. **Confluence + Matrix** → saring call berkualitas (banyak metrik hijau, HTF strong, aligned).
3. **RSI + ATR + Momentum** → timing entry (beli pullback, hindari yang sudah exhausted/overbought).
4. **OI + Funding + Basis + Long/Short + Liquidation** → cek bahan bakar & bahaya (crowded? squeeze fuel? likuidasi ekstrem?).
5. **Risk Calculator + Correlation guard** → tentukan size, stop (pakai ATR), dan pastikan tidak over-exposed searah.
6. **Edge Simulator** → validasi jangka panjang: pattern mana yang layak dibobot lebih besar.

*Sumber interpretasi:* funding/OI combos & divergence — [Tradelink](https://tradelink.pro/blog/funding-rate-open-interest/), [CoinGlass](https://www.coinglass.com/learn/how-to-judge-market-by-fr-en), [Thrive.fi](https://thrive.fi/blog/trading/open-interest-vs-volume-vs-funding-rate); LSR contrarian & retail vs top traders — [WalletFinder](https://www.walletfinder.ai/blog/long-short-ratio), [Gate](https://www.gate.com/crypto-wiki/article/understanding-long-short-ratio-the-sentiment-indicator-in-crypto-markets); RSI di trend kuat & mean reversion — [Changelly](https://changelly.com/blog/rsi-relative-strength-index-in-crypto/), [Flipster](https://flipster.io/en/blog/mean-reversion-in-crypto-how-to-trade-oversold-and-overbought-perps).
