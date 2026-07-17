# Audit Standardisasi Warna — LuxQuant Terminal

> Tujuan: memetakan semua fitur/page/modal yang **belum** memakai sistem warna
> terstandar, supaya migrasi ke token semantik (dan multi-tema Luxquant/Dark/Bright)
> jadi mudah dan tidak ada tabrakan warna.
>
> Scope: `frontend-react/src/**/*.jsx`. Angka = perkiraan jejak warna hardcoded
> (hasil scan pola hex). Sifatnya indikator prioritas, bukan hitungan presisi.

---

## 1. Ringkasan eksekutif

**Status: BELUM terstandar.** Sistem token ada (`bg-primary`, `gold-primary`, dst.
di `tailwind.config.js` + `:root` `index.css`), tapi mayoritas komponen bypass
token itu dan menulis warna hex/rgba langsung.

Temuan angka:

| Metrik | Nilai |
|---|---|
| Warna hex hardcoded dalam class `[#...]` | **±737 kejadian di 108 file** |
| Pemakaian `rgba(...)` inline | ratusan kejadian di 60+ file |
| Definisi warna ganda (config hex **dan** CSS var) | ya — sumber tabrakan utama |

**Sumber masalah inti:** satu konsep warna punya banyak versi kode. Contoh nyata
keluarga "background gelap":

| Hex | Dipakai | Status |
|---|---|---|
| `#0a0506` | token resmi `bg-primary` | ✅ token |
| `#0a0805` | ±277× / 64 file | ❌ hardcoded (bukan token) |
| `#0a0503`, `#070507`, `#120809`, dll | ±163× / 57 file | ❌ variasi hardcoded lain |

Efeknya: ubah 1 token → yang hardcoded tidak ikut → tampilan belang. Di mode
Bright, semua hex gelap hardcoded tetap gelap → layout pecah.

---

## 2. Sebaran per keluarga warna

| Keluarga | Perkiraan jejak | Token tujuan |
|---|---|---|
| Surface gelap (near-black) | ±440× | `surface`, `surface-raised`, `surface-hover` |
| Emas / amber | ±407× / 97 file | `accent`, `accent-light`, `accent-dark` |
| Semantic hijau/merah (profit/loss) | ±349× / 68 file | `positive`, `negative` |
| Biru Telegram | ±17× / 11 file | `brand-telegram` (fixed, non-tema) |

---

## 3. Palet token semantik yang diusulkan

Satu "kamus" resmi berbasis **fungsi**, bukan warna. Semua komponen nanti hanya
boleh pakai ini.

| Token | Fungsi | Nilai Luxquant (existing) |
|---|---|---|
| `surface` | background halaman utama | `#0a0506` |
| `surface-raised` | card / panel / modal | `#0a0805` (disatukan dari 4–5 varian) |
| `surface-hover` | state hover baris/card | `rgba(30,12,15,.9)` |
| `border` | garis default | `rgba(255,255,255,.06)` |
| `border-accent` | garis emas | `rgba(212,168,83,.3)` |
| `text` | teks utama | `#ffffff` |
| `text-secondary` | teks sekunder | `#b8a89a` |
| `text-muted` | teks redup | `#a59585` |
| `accent` / `accent-light` / `accent-dark` | emas brand | `#d4a853` / `#f0d890` / `#8b6914` |
| `positive` | profit / naik | `#4ade80` |
| `negative` | loss / turun | `#f87171` |
| `warning` | peringatan | `#fbbf24` |
| `brand-telegram` | ikon Telegram (tetap, lintas tema) | `#0088cc` |

**Catatan teknis:** simpan nilai sebagai channel RGB (`--surface: 10 5 6;`) dan
definisikan token Tailwind sebagai `rgb(var(--surface) / <alpha-value>)`, supaya
modifier opacity (`/70`, `/40` yang dipakai banyak) tetap berfungsi.

---

## 4. Tabel mapping hex → token (klaster utama)

| Hex hardcoded ditemukan | → Token |
|---|---|
| `#0a0506` | `surface` |
| `#0a0805`, `#0a0503`, `#070507`, `#0b0708`, `#0d0808` | `surface-raised` |
| `#120809`, `#1e0c0f` | `surface-hover` |
| `#d4a853`, `#d4a017`, `#c9a227`, `#eab308` | `accent` |
| `#f0d890`, `#e5c07b`, `#ffd700`, `#facc15` | `accent-light` |
| `#8b6914`, `#b8860b` | `accent-dark` |
| `#4ade80`, `#22c55e`, `#16a34a`, `#56c996`, `#34d399` | `positive` |
| `#f87171`, `#ef4444`, `#c42020`, `#8b1a1a`, `#e07288`, `#dc2626` | `negative` |
| `#fbbf24`, `#f59e0b` | `warning` |
| `#0088cc`, `#229ed9`, `#2aabee` | `brand-telegram` |

> Klaster surface & semantic bisa di-codemod otomatis (find-replace terarah).
> Gradient dan `rgba()` inline perlu review manual.

---

## 5. Peta fitur non-standar (per area)

Severity: 🔴 berat · 🟡 sedang · 🟢 ringan

### Halaman inti (page)

| Fitur / Page | File utama | Jejak | Severity |
|---|---|---|---|
| Bitcoin | `BitcoinPage.jsx` | ±55 | 🔴 |
| Markets | `MarketsPage.jsx`, `TopPerformers.jsx`, `CoinIntelligence.jsx`, `coinIntelShared.jsx` | ±90 | 🔴 |
| AI Arena v6 | `AIArenaPageV6.jsx` + `aiArenaV6/*` (CompassBrief, PriceChart, _ui, dll) | ±120 | 🔴 |
| Journal | `JournalPage.jsx` | ±50 | 🔴 |
| Analyze | `AnalyzePage.jsx` | ±40 | 🔴 |
| Autotrade | `AutoTradePage.jsx` + `autotrade/*` (PositionsBoard, AutoTradeUI, ConfigPanel, dll) | ±80 | 🔴 |
| Macro Calendar | `MacroCalendarPage.jsx` | ±35 | 🟡 |
| Signals | `SignalsPage.jsx`, `SignalsTable.jsx`, `SignalTerminalPage.jsx`, `SignalHistoryTab.jsx` | ±50 | 🟡 |
| Market Pulse | `MarketPulsePage.jsx` | ±25 | 🟡 |
| Onchain | `OnchainPage.jsx` | ±25 | 🟡 |
| Overview (Home) | `OverviewPage.jsx` | ±22 | 🟡 |
| Watchlist | `WatchlistPage.jsx`, `WatchlistTabs.jsx`, `WatchingTab.jsx` | ±25 | 🟡 |
| Referral | `ReferralPage.jsx` | ±30 | 🟡 |
| Whale Alert | `WhaleAlertPage.jsx` | ±10 | 🟢 |
| Delistings | `DelistingsPage.jsx` | ±5 | 🟢 |
| Notifications | `NotificationsPage.jsx`, `NotificationBell.jsx`, `NotificationSettings.jsx` | ±10 | 🟢 |
| Profile | `ProfilePage.jsx` | ±15 | 🟢 |

### Terminal (viewport-locked)

| Fitur | File utama | Jejak | Severity |
|---|---|---|---|
| Terminal shell + viz | `terminal/TerminalLayout.jsx`, `vizShared.jsx`, `ConfluenceTabs.jsx`, `EdgeSimulator.jsx`, `SignalsAnalytics.jsx`, `DerivTabs.jsx` | ±55 | 🔴 |
| Order Book | `OrderBookPage.jsx` | ±15 | 🟡 |
| Edge Lab | `EdgeLabPage.jsx`, `edgelab/*` | ±30 | 🟡 |

### Landing & Auth

| Fitur | File utama | Jejak | Severity |
|---|---|---|---|
| Landing v1 (legacy `/v1`) | `landing/LandingPage.jsx` | ±100 | 🔴 |
| Landing v2 (`/`) | `landing/v2/sections/*` (Performance, Architecture, CoinSpotlight, TopGainers, HeaderV2, FooterV2, dll) | ±70 | 🔴 |
| Auth | `auth/LoginPage.jsx`, `RegisterPage.jsx`, `LeftBrandPanel.jsx`, `AuthGlobe.jsx`, callbacks | ±45 | 🟡 |

### Subscription / Payment

| Fitur | File utama | Jejak | Severity |
|---|---|---|---|
| Pricing | `subscription/PricingPage.jsx` | ±20 | 🟡 |
| Payment | `subscription/PaymentPage.jsx` | ±20 | 🟡 |
| Premium/Status | `PremiumModal.jsx`, `SubscriptionStatus.jsx`, `SubscribeViaAdminModal.jsx` | ±10 | 🟢 |

### Admin (kolektif = area terberat)

| Fitur | File utama | Jejak | Severity |
|---|---|---|---|
| User management | `admin/UserDetailDrawer.jsx`, `users/*` (SendMessageModal, GrantModal, UsersTable, CrmChips) | ±60 | 🔴 |
| Workspace — Finance | `admin/workspace/FinanceTab.jsx`, `PaymentDetailPanel.jsx`, `ManualPaymentModal.jsx`, `finance/*` | ±60 | 🔴 |
| Workspace — Marketing/CRM | `MarketingTab.jsx`, `CampaignPanel.jsx`, `TodoTab.jsx`, `FollowupTab.jsx`, `QuickSendPopover.jsx`, `ContactBadge.jsx` | ±60 | 🔴 |
| Workspace — System/Growth | `SystemMap.jsx`, `SystemTab.jsx`, `GrowthTab.jsx`, `BackendHealthPanel.jsx` | ±20 | 🟡 |

### Modal & elemen shared (dipakai lintas fitur — prioritas tinggi karena efek luas)

| Elemen | File | Jejak | Severity |
|---|---|---|---|
| Modal dasar | `ui/Modal.jsx` | ±10 | 🔴 (dipakai semua modal) |
| Signal modal | `SignalModal.jsx`, `SignalStatusModal.jsx` | ±40 | 🔴 |
| BTC correlation | `BTCCorrelationModal.jsx`, `BTCCorrelationPanel.jsx` | ±10 | 🟡 |
| Coin utility / guide | `CoinUtilityModal.jsx`, `IndicatorGuideModal.jsx`, `GuideInfo.jsx` | ±15 | 🟡 |
| Deep analysis | `DeepAnalysis.jsx`, `coinIntelShared.jsx` | ±20 | 🟡 |
| Announcement / News / Nudge | `AnnouncementModal.jsx`, `NewsPreviewModal.jsx`, `TelegramNudgeModal.jsx`, `PnLShareModal.jsx` | ±15 | 🟡 |
| BTC dominance alert | `BtcDomAlert.jsx` | ±20 | 🟡 |
| Banner in-app | `InAppBrowserBanner.jsx` | ±5 | 🟢 |

---

## 6. Urutan eksekusi yang direkomendasikan

1. **Fondasi token** — satukan `tailwind.config.js` + `index.css` jadi satu sumber
   (CSS var channel RGB). Definisikan token final di §3. *(prasyarat semua langkah lain)*
2. **Elemen shared dulu** — `ui/Modal.jsx`, `SignalModal`, komponen `_shared`/`_ui`,
   `coinIntelShared`, `vizShared`. Efeknya paling luas per baris yang diubah.
3. **Surface & semantic via codemod** — find-replace terarah untuk klaster hex di §4
   (near-black → `surface-raised`; hijau/merah → `positive`/`negative`).
4. **Page berat (🔴) satu per satu** — AI Arena v6, Markets, Bitcoin, Autotrade,
   Journal, Terminal, Landing, Admin. Mulai dari yang paling ramai dikunjungi.
5. **Page sedang & ringan (🟡/🟢)** — sisanya, sambil review gradient/rgba manual.
6. **Pasang pagar (lint)** — rule `eslint`/`stylelint` yang menolak warna hex
   arbitrer di className, supaya ke depan standar terjaga otomatis.

Setelah langkah 1–3 selesai, mode **Dark** praktis langsung jalan; **Bright** menyusul
begitu page berat (langkah 4) sudah ter-tokenisasi.

---

## 7. Prinsip anti-tabrakan

- **Satu konsep = satu token.** Tidak ada lagi 5 versi "hitam".
- **Warna semantik lewat token, bukan hex.** Profit selalu `positive`, loss selalu `negative`.
- **Warna brand pihak ketiga** (Telegram) dikunci di token sendiri, tidak ikut tema.
- **Lint sebagai penjaga**, bukan sekadar konvensi tertulis.
