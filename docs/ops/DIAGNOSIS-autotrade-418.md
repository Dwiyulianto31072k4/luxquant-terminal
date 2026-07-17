# Diagnosis AutoTrade — "Nggak Mau Entry Lagi"

Tanggal: 2026-07-14
Status: **diagnosis only** — belum ada perubahan kode.

> ⚠️ **Catatan penting dibaca duluan:** kode di folder ini (`~/Downloads/luxquant-terminal`)
> **tidak sinkron dengan yang jalan di VPS**. Bukti & implikasinya di Bagian 4. Sebagian
> analisis di bawah adalah inferensi dari frontend + activity log karena logika skip yang
> sebenarnya ada di backend versi VPS, bukan di snapshot ini.

---

## 1. Baca ulang screenshot — ini DUA masalah, bukan satu

Counter di header activity:

```
Completed 0 · Skipped 98 · Failed 2 · Reconcile 0 · Running 0
```

- **Failed 2** → dua sinyal (ARBUSDT, USUALUSDT) gagal karena **Binance HTTP 418 (IP ban)**.
- **Skipped 98** → hampir semua sinyal **di-SKIP oleh RISK ENGINE** dengan alasan
  **"max trade notional"** (batch 34 + 19 + 31 + 11 ≈ 95, tag `risk`).
- **Completed 0** → tidak ada satu pun entry berhasil.

Jadi penyebab utama "ga mau entry" **bukan** ban 418 (itu cuma 2 kejadian). Penyebab utamanya
adalah **risk engine nge-skip hampir semua sinyal di cek "max trade notional"**. Ban 418
masalah kedua yang terpisah.

## 2. Masalah A (UTAMA) — semua sinyal di-skip "max trade notional"

Di activity timeline, label "max trade notional" berasal dari action event
`execution.skip_risk_limit.max_trade_notional`
(lihat `frontend-react/.../autotrade/ActivityTimeline.jsx:131-138` — judul dibentuk dari
`action.replace("execution.skip_","").replaceAll("_"," ")`).

Arti setting-nya, dari `backend/knowledge/autotrade-page.md:71`:

> **Max trade notional (USDT)** — the largest size per trade in USDT (default 10) —
> effectively your per-trade position cap.

Artinya: setiap kali risk engine mau entry, ukuran order (notional) **melebihi cap
"Max trade notional"**, jadi sinyalnya di-skip. Karena ini terjadi ke ~95 sinyal beruntun
dan Completed = 0, capnya **mengikat (binding) ke hampir semua order**. Kemungkinan penyebab,
urut dari paling mungkin:

1. **Cap di bawah minimum order Binance.** Default cap = **10 USDT**, tapi minimum notional
   per order di Binance USDⓈ-M Futures umumnya **±20 USDT** (banyak pair 20, sebagian 5).
   Kalau order minimum yang valid (±20) > cap (10), order mustahil dibuat → di-skip sebagai
   "max_trade_notional". Guard di frontend cuma `MIN_LIVE_ENTRY_USDT = 6`
   (`ConfigurationStudio.jsx:26`) — terlalu rendah dibanding minimum futures Binance nyata,
   jadi cap 10 lolos validasi UI tapi mental di eksekusi.
2. **Salah tafsir margin vs notional + leverage.** Kalau `sizing.value` (mis. 10) dihitung
   sebagai *margin* lalu dikali leverage (mis. 10×) → notional = 100, sedangkan cap
   dibandingkan sebagai notional (10) → selalu lewat cap → skip.
3. **Cap memang di-set terlalu kecil** untuk ukuran entry yang dihitung strategi.

**Cek cepat (paling mungkin langsung nyala lagi):**
- Buka config AutoTrade akun user itu → **Risk limits → "Max trade notional (USDT)"**.
  Kalau masih 10, naikkan ke **±20–50 USDT** (di atas minimum Binance) dan coba lagi.
- Pastikan **Min available (USDT)** (default 5) < saldo bebas akun, dan saldo cukup.
- Cek **leverage** + **sizing method/value**: pastikan notional hasil = sizing × leverage
  masih ≤ cap yang baru.

> Karena logika skip yang persis ada di backend VPS (lihat Bagian 4), angka minimum & rumus
> pastinya perlu diverifikasi dari kode/eksekusi nyata di VPS, bukan dari snapshot ini.

## 3. Masalah B (SEKUNDER) — Binance HTTP 418 IP ban

Dua sinyal gagal dengan:

```
Binance HTTP 418 GET /fapi/v1/ticker/price params={'symbol':'ARBUSDT'}:
{'code':-1003,'msg':'Way too many requests; IP(187.127.135.84) banned until 1783855317204.
 Please use the websocket for live updates to avoid bans.'}
```

- IP VPS **187.127.135.84** (sama dgn `eth0` di sesi SSH `luxquant-vps`) kena **IP-ban
  sementara** karena kebanyakan request REST (429 berulang → 418).
- Sumber beban REST (di snapshot backend ini): harga diambil per-symbol via REST, position
  monitor polling tiap ~12 dtk per posisi, dan adapter ccxt dibuat baru tiap sinyal × config
  (`load_markets` berulang), tanpa backoff. Detail kode: `exchange_adapter.py:585-598`,
  `position_tracker.py:118`, `engine.py:135-149,192-196,331-341`.
- Codebase **sudah punya** feed WS yang justru untuk hindari 418: `binance_ws_worker.py`
  streaming harga semua symbol ke Redis `lq:terminal:ws` (dibaca `terminal_worker.py:301`).
  Autotrade tinggal ikut baca blob itu, REST cuma fallback.

Ban ini lepas otomatis di timestamp `banned until` (epoch ms). **Jangan retry-loop** selama
ban — tiap retry memperpanjang ban.

## 4. ⚠️ Repo lokal ≠ kode di VPS (wajib dibereskan dulu)

Snapshot di folder ini **tidak konsisten** antara frontend dan backend:

| Aspek | Frontend (folder ini) | Backend (folder ini) | Yang jalan di VPS (dari log) |
|-------|----------------------|----------------------|------------------------------|
| Model config | `sizing{method,value}`, `risk_limits{max_trade_notional_usdt, max_open_positions, max_daily_trades, min_available_usdt, cooldown_*}` | `max_position_pct`, `max_leverage`, `max_concurrent_trades` (persen) | model **baru** (emit event `execution.skip_risk_limit.max_trade_notional`) |
| Event skip | timeline baca `execution.skip_*` / `execution.skip_risk_limit.*` | **tidak ada** kode yang meng-emit event itu | meng-emit event tsb (ada di screenshot) |
| Field `max_trade_notional` | dipakai (`ConfigurationStudio.jsx:95-96`) | **tidak ada** di `models/autotrade.py` & `schemas/autotrade.py` | ada |

Bukti spesifik:
- `models/autotrade.py:84-86` → hanya `max_position_pct / max_leverage / max_concurrent_trades`.
- `schemas/autotrade.py:159,229` → `max_position_pct` (persen), tak ada notional.
- `risk_manager.py` → sizing persen, **tak pernah** menyebut `max_trade_notional`, tak emit activity.
- Sebaliknya frontend + `knowledge/autotrade-page.md` + `ActivityTimeline.jsx` semua pakai
  model **notional/risk_limits** yang baru.

**Kesimpulan:** backend AutoTrade yang jalan di VPS adalah versi **lebih baru** dari backend
di folder ini. Jadi logika "max trade notional" yang benar-benar nge-skip sinyal **tidak ada
di snapshot ini** — aku belum bisa menunjuk baris pastinya.

**Yang dibutuhkan supaya bisa nge-fix presisi:** ambil kode backend autotrade yang aktual dari
VPS, mis. (dijalankan sendiri di terminal VPS, bukan lewat aku):

```bash
# di dalam sesi SSH luxquant-vps
systemctl cat luxquant-autotrade         # lihat WorkingDirectory & ExecStart service
cd <WorkingDirectory dari output di atas> # mis. /opt/luxquant/... atau /root/...
git rev-parse HEAD; git status           # commit yang ke-deploy
grep -rn "max_trade_notional" backend/app/services/autotrade
```

Lalu sinkronkan folder lokal ke commit itu (atau salinkan direktori `backend/app/services/autotrade`
+ `models/autotrade.py` + `schemas/autotrade.py` yang versi VPS ke sini) sebelum aku patch.

## 5. Urutan tindakan yang disarankan

1. **Sekarang (operasional, cepat):** cek & naikkan **Max trade notional** akun user ke
   ±20–50 USDT, pastikan saldo & Min-available oke → besar kemungkinan entry langsung jalan
   lagi (mengatasi Masalah A). Jangan restart-loop service selama ban 418 aktif.
2. **Sinkronkan kode VPS ↔ lokal** (Bagian 4) supaya aku lihat logika skip yang asli.
3. **Fix Masalah A di kode:** benahi validasi cap vs minimum-notional Binance & interpretasi
   margin/leverage (naikkan `MIN_LIVE_ENTRY_USDT` ke minimum futures nyata, tolak simpan cap
   di bawah itu, dan pastikan perbandingan cap dilakukan terhadap notional final).
4. **Fix Masalah B (418):** alihkan pembacaan harga autotrade ke Redis `lq:terminal:ws`
   (REST fallback), reuse adapter + cache `load_markets`, tambah backoff/circuit-breaker 429/418.
5. **Verifikasi di testnet/Dry Run** sebelum live.

## 6. Ringkas

- "Ga mau entry" **utamanya** karena RISK ENGINE nge-skip ~95 sinyal di cek **"max trade
  notional"** (Skipped 98, Completed 0) — bukan ban 418 (cuma 2 Failed).
- "Max trade notional" = cap ukuran per trade (default 10 USDT); kemungkinan besar **di bawah
  minimum order Binance / lebih kecil dari notional×leverage**, jadi semua order mental.
- **Kode folder ini beda versi dari VPS** — perlu disinkronkan dulu sebelum patch presisi.
- Ban 418 nyata tapi sekunder; solusinya pakai feed WS `lq:terminal:ws` yang sudah ada.
