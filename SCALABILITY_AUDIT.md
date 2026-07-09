# LuxQuant — Audit Skalabilitas Backend (siap user banyak)

Hasil investigasi seluruh codebase. Fokus: apa yang akan patah saat user naik (100 → 1.000 → 10.000+). Diprioritaskan **P0 (kritikal) → P2 (nice-to-have)**. Yang **sudah dibereskan hari ini** ditandai ✅.

Konteks server: **VPS 2 vCPU / 8 GB**, Postgres `max_connections=200`, gunicorn 4 worker (UvicornWorker), + poller + ~15 service worker + cryptobot.

---

## Ringkasan eksekutif

Software sudah dioptimasi bagus di jalur signal (threadpool, cache, serve-stale). Tapi untuk **skala besar** ada beberapa celah struktural yang perlu ditangani berurutan:

1. **Blocking event loop** masih ada di puluhan endpoint lain (pola `async def` + DB sinkron). — sebagian ✅, sisanya perlu sapuan.
2. **Tak ada rate-limit** di `/api/v1/*` (hanya di public API). — abuse/DoS risk.
3. **Frontend polling** menggandakan beban per-user (41 titik polling). — beban naik linear × jumlah user.
4. **DB connection pool kecil** + banyak proses berbagi Postgres. — antrean koneksi saat konkurensi tinggi.
5. **Ketergantungan API eksternal** (CoinGecko free-tier 429). — bottleneck saat ramai.
6. **Kapasitas 2-core**. — mentok saat beban puncak (sudah terbukti).

---

## P0 — Kritikal (tangani sebelum growth)

### 1. Blocking event loop di endpoint yang belum di-proteksi
**Masalah:** 279 handler `async def` di 46 file; banyak menjalankan `db.execute` **sinkron**. Saat Postgres melambat (beban tinggi), endpoint ini **membekukan worker** → WORKER TIMEOUT → request user di-drop. Ini akar semua insiden hari ini.

**Sudah ✅:** `signals` (coin-intel, stats, bulk-7d, active→def, top-performers), `edge-lab` (4 endpoint), `notifications/unread-count→def`, `journey-insights`, `ai-arena/chart-data`, `delistings`.

**Belum:** router lain yang DB-heavy & bisa ramai — `whale`, `onchain_endpoint`, `market_pulse`, `coins`, `coin_profile`, `calendar`, `watchlist`, `analytics`, `daily_dashboard`, `btc_correlation`, `bitcoin`, dst.

**Rekomendasi (pilih satu strategi global, jangan tambal satu-satu selamanya):**
- **A (termudah & aman):** endpoint **read-only yang tak pakai `await`** → ubah `async def` → **`def`**. FastAPI otomatis jalankan di threadpool → tak pernah membekukan loop. Ini "aturan emas" untuk semua endpoint baca-DB.
- **B (paling benar jangka panjang):** migrasi ke **driver DB async** (SQLAlchemy 2.0 async + `asyncpg`) untuk endpoint yang harus `async`.
- **C (tambalan):** bungkus query di `run_in_threadpool` (dipakai untuk yang punya `await`, mis. top-performers).
- Semua endpoint cache-able: **cache + serve-stale + (opsional) single-flight lock** — pola yang sudah kita pakai.

> Aturan tim ke depan: *"Endpoint baca-DB = `def` (bukan `async def`), kecuali benar-benar butuh `await`."*

### 2. Rate limiting di `/api/v1/*`
**Masalah:** rate-limit hanya ada di **public API** (`deps_public.py`, per API-key). Endpoint utama `/api/v1/*` **tanpa batas** — satu klien nakal / bug / bot bisa membanjiri (kita bahkan lihat UFW memblok scan port 5432 dari luar). Saat user banyak, tak ada rem.

**Rekomendasi:** pasang rate-limit global (mis. **slowapi** / middleware Redis) per-IP & per-user pada `/api/v1/*`, terutama endpoint mahal (`bulk-7d`, `analyze`, `top-performers`, `edge-lab`, `market/*`). Fail-open (kalau Redis down, jangan blok semua).

### 3. Cache-Control / edge caching untuk endpoint publik
**Masalah:** endpoint publik (landing, `/public/v1/*`, `market/*`) di-hit tiap user langsung ke origin. Kamu sudah pakai **Cloudflare** — tapi tanpa header `Cache-Control`, CF tak meng-cache di edge.

**Rekomendasi:** tambah `Cache-Control: public, max-age=15, stale-while-revalidate=60` pada endpoint publik read-only. Cloudflare akan melayani ribuan user dari edge → origin nyaris tak tersentuh. **Ini pengganda skala terbesar dengan usaha terkecil.**

---

## P1 — Penting (saat mulai ramai)

### 4. Frontend polling menggandakan beban
**Masalah:** **41 `setInterval`** di 36 komponen. Tiap user login = browser-nya polling banyak endpoint (SignalsPage 30s, SignalsTable prices 15s, NotificationBell, Header, MarketHighlights, OverviewPage, dst). Dengan **N user**, beban = **N × semua interval**. Di 1.000 user ini ribuan request/detik ke origin.

**Rekomendasi:**
- **Pause saat tab tersembunyi** — `document.visibilitychange`: hentikan polling kalau tab tak aktif (banyak user buka tab tapi tak menonton). Hemat besar, gratis.
- **Perpanjang interval** yang tak kritikal (notif 30→60s, dst).
- **Ganti polling → push** untuk data live (WebSocket/SSE) — `websocket.py` masih TODO. Satu koneksi WS per user jauh lebih murah dari polling REST berkali-kali.
- **Konsolidasi**: banyak komponen fetch data market yang sama → satu context/provider bersama, bukan tiap komponen polling sendiri.

### 5. DB connection pool & pooler
**Masalah:** `pool_size=5, max_overflow=10` per proses. 4 API worker = s/d 60 koneksi; + poller + ~15 worker service → total bisa mendekati `max_connections=200` saat sibuk. Saat konkurensi tinggi per worker, request **antre s/d 10 dtk** (`pool_timeout`) untuk koneksi → lambat/berujung error.

**Rekomendasi:** pasang **PgBouncer** (transaction pooling) di depan Postgres. Semua service connect ke PgBouncer; ini yang mengelola koneksi nyata ke Postgres → aman naikkan konkurensi tanpa meledakkan `max_connections`. Standar untuk skala.

### 6. Ketergantungan API eksternal (CoinGecko/Binance/Bybit)
**Masalah:** `market/*` bergantung API eksternal; **CoinGecko free-tier kena 429** saat ramai (terlihat di log). `coin-metadata` bahkan "No API key — free public tier".

**Rekomendasi:** (a) pakai **API key CoinGecko berbayar** (kuota jauh lebih tinggi) dan set di semua worker (termasuk coin-metadata), (b) cache lebih agresif + serve-stale (sebagian sudah), (c) circuit-breaker: kalau provider 429/timeout, langsung sajikan cache lama, jangan retry membebani.

### 7. Kapasitas: 2 core → 4 core
**Masalah:** terbukti hari ini box mentok saat beban puncak bertepatan (poller + batch + user). Semua `nice`/threadpool sudah menekan software; sisanya tenaga.

**Rekomendasi:** untuk skala serius, **≥4 vCPU** (dan pertimbangkan **memisahkan Postgres ke server sendiri** — DB dan app berbagi 2 core sekarang, itu batas nyata). Memisah DB = lompatan skala besar.

---

## P2 — Pengerasan (good hygiene)

8. **Single-flight lock** untuk semua compute mahal (bukan cuma coin-intel) — cegah stampede cold-start sepenuhnya. Serve-stale sudah menutupi 95%.
9. **Index review** — jalankan `EXPLAIN ANALYZE` pada query CTE berat (`signal_outcomes`, `analyze`, `top-performers`) di data produksi; pastikan tak ada seq-scan mahal saat tabel membesar.
10. **Worker recycling** — set `LUXQUANT_MAX_REQUESTS` (mis. 2000) di gunicorn untuk membatasi kebocoran memori jangka panjang (sekarang 0/disabled).
11. **Timeout klien luar** — pastikan semua panggilan eksternal punya timeout ketat (sebagian sudah 8–15s).
12. **Observability** — slow-request logger (`🐢 SLOW`) sudah terpasang; pertimbangkan metrik (Prometheus/Grafana) untuk p95 latency & error rate per endpoint saat scaling.
13. **Graceful degradation** — endpoint non-kritikal (whale, onchain, news) sebaiknya balas cepat dari cache/`204` daripada menahan request saat sumbernya lambat.

---

## Urutan eksekusi yang disarankan

1. **P0-3 (Cache-Control edge)** — usaha kecil, dampak terbesar untuk endpoint publik.
2. **P0-1 (sapuan `async def`→`def`)** — hilangkan sisa freezer; jadikan aturan tim.
3. **P0-2 (rate-limit `/api/v1/*`)** — rem abuse.
4. **P1-4 (frontend: pause-on-hidden + interval)** — potong beban per-user.
5. **P1-5 (PgBouncer)** + **P1-7 (4-core / DB terpisah)** — kapasitas.
6. **P1-6 (CoinGecko berbayar)** — hilangkan 429.
7. P2 sesuai kebutuhan.

Dengan P0 + P1 selesai, backend siap menampung **puluhan ribu user** dengan nyaman. Yang sudah dikerjakan hari ini (threadpool, cache, serve-stale, nice, reconnect) adalah fondasi P0-1 yang benar — tinggal disapu rata ke semua endpoint + tambah rate-limit, edge-cache, PgBouncer, dan kapasitas.

---

# BAGIAN 2 — Infra & Keamanan Backend

Fokus keandalan/keamanan operasional (bukan skala/fitur). Sebagian perlu **diverifikasi di server** (bukan terlihat dari kode) — perintah cek disertakan.

## 🔴 P0 — Verifikasi SEKARANG (risiko fatal kalau salah)

### S1. SECRET_KEY JWT harus kuat & unik di produksi
`.env` lokal berisi `SECRET_KEY=local-dev-secret-key-change-in-production`. **Kalau produksi memakai secret default/lemah ini, siapa pun bisa MEMALSUKAN token JWT → ambil-alih akun apa pun (termasuk admin).** Ini paling kritikal.
```bash
# di VPS — pastikan BUKAN nilai dev, dan panjang/acak:
grep SECRET_KEY /root/luxquant-terminal/backend/.env
# kalau masih default → ganti dgn: openssl rand -hex 32  → lalu restart backend
```

### S2. Backup database
Tak terlihat strategi backup Postgres di repo. **Tanpa backup, satu kegagalan disk = kehilangan semua data user/sinyal/pembayaran.**
```bash
# cek ada cron/timer backup?
crontab -l | grep -i 'pg_dump\|backup'; systemctl list-timers | grep -i backup
```
Kalau tak ada: pasang `pg_dump` harian ke storage terpisah (atau WAL archiving / managed Postgres dgn PITR).

## 🟠 P1 — Penting

### S3. Kebocoran detail error ke user (76 tempat)
Banyak endpoint `raise HTTPException(500, detail=f"...{str(e)}")` — **membocorkan pesan error internal (query SQL, path, tipe exception) ke klien.** Info bocor + membantu penyerang. Ganti jadi pesan generik untuk user, detail hanya di log server. Contoh: `detail="Internal error"` + `logger.exception(e)`.

### S4. Secret di log
Log `tg-delivery` mencetak **token bot Telegram** plaintext (`bot8583504017:AAE...`) di journald. Token di log = bocor ke siapa pun yang bisa baca log. Jangan pernah log URL/секрет penuh; mask token.

### S5. Redis — persistence, memory limit, eviction
Redis dipakai untuk cache **dan** (menurut komentar deploy) sebagian state auth/session. Perlu dipastikan:
```bash
redis-cli CONFIG GET maxmemory          # 0 = tak dibatasi → risiko OOM box
redis-cli CONFIG GET maxmemory-policy   # utk cache idealnya allkeys-lru
redis-cli CONFIG GET save               # persistence? kalau kosong, restart = hilang semua
redis-cli INFO keyspace
```
Kalau `maxmemory=0` → set batas (mis. 512mb) + `allkeys-lru`. Kalau ada state penting (session) di Redis → aktifkan AOF/RDB, atau pindahkan session ke Postgres/JWT (JWT sudah stateless — bagus).

### S6. Single Point of Failure
- **Poller tunggal** (leader-election): kalau leader mati, cache berhenti di-refresh sampai pemilihan ulang → semua serve-stale lalu kosong. Pastikan ada standby yang cepat mengambil alih (kode sudah ada `is_leader()`; verifikasi failover-nya cepat).
- **Postgres tunggal & Redis tunggal**: tak ada replika. Untuk keandalan tinggi → read-replica Postgres + Redis dgn persistence/replica.

### S7. CORS produksi
Default di kode cuma `localhost`. Kalau frontend same-origin (nginx serve dist + proxy `/api`) → CORS tak relevan (aman). Tapi kalau ada akses cross-origin, pastikan `CORS_ORIGINS` env berisi domain asli dan **bukan** `*` bersama `allow_credentials=True`.
```bash
grep -i cors /root/luxquant-terminal/backend/.env
```

## 🟡 P2 — Pengerasan

- **systemd `MemoryMax`** per service — sekarang `Restart=always` tanpa batas memori; satu service bocor bisa OOM seluruh box. Set `MemoryMax=` untuk worker berat (AI, social image-gen).
- **Migrasi DB** — ada Alembic + statement `ADD COLUMN IF NOT EXISTS` idempoten di `database.py` (campur). `deploy.sh` tak menjalankan `alembic upgrade`. Pastikan perubahan skema punya jalur yang jelas & teruji (drift = bug diam-diam).
- **Rollback deploy** — `deploy.sh` abort kalau backend gagal start (bagus), tapi backend yang *start tapi rusak* tak auto-rollback. Simpan build/commit sebelumnya untuk rollback cepat.
- **Firewall** — UFW sudah blokir scan port 5432 dari luar (bagus). Pastikan Postgres & Redis **hanya** listen `127.0.0.1` (bukan `0.0.0.0`).
```bash
ss -tlnp | grep -E '5432|6379'   # harus 127.0.0.1, bukan 0.0.0.0
```
- **`.env` permissions** — `chmod 600` file `.env` (berisi semua secret).

## Prioritas infra
1. **S1 (SECRET_KEY)** + **S2 (backup)** — verifikasi malam ini; risiko fatal.
2. **S4 (token di log)** + **S3 (error leak)** — kebocoran, perbaikan kode ringan.
3. **S5 (Redis)** + **S6 (SPOF)** — keandalan.
4. P2 sesuai waktu.

> Catatan positif: **SQL injection aman** (bound params + f-string hanya untuk CTE konstan), JWT **stateless** (restart tak melogout user), UFW aktif, health-check di deploy, watchdog DB ada. Fondasi keamanannya sudah lumayan — celah utama = verifikasi SECRET_KEY & backup, plus kebersihan error/log.
