# Compass 2.0 Projection Resolver — Deploy & Backfill Runbook

## Kenapa ini ada

Audit table (Projection Accountability) selama ini menampilkan semua row
PENDING karena tabel `compass_projection_resolutions` tidak pernah diisi:
tidak ada service yang mengevaluasi barrier. Resolver ini menutup loop itu.

Perubahan yang menyertainya:

- `app/services/compass_projection_resolver.py` — evaluator first-barrier baru
  (CLEAN_HIT / INVALIDATED_FIRST / STALE_NO_TOUCH / AMBIGUOUS_BAR /
  RANGE_HELD / RANGE_BREAK_UP / RANGE_BREAK_DOWN).
- `app/services/ai_arena_v6_persist.py` — contract baru otomatis menandai
  contract ACTIVE lama menjadi SUPERSEDED.
- `GET /scenario-ledger` — pagination server-side (`limit`, `offset`,
  `filter`), field `total` + `filtered_total`, dan `stats` dihitung dari
  SELURUH ledger (bukan cuma halaman yang di-fetch). Angka "REPORTS 50"
  yang lama adalah limit query, bukan total data.
- Frontend `VerdictLedger` — fetch per halaman + filter ke server, kartu
  Hit-rate baru, stale/ambiguous dikecualikan dari hit-rate.
- `luxquant-compass-resolver.{service,timer}` — jalan tiap 5 menit.
- Operational health sekarang memonitor timer resolver.

## 1. Deploy

```bash
cd /root/luxquant-terminal
git pull   # atau rsync file yang berubah

# restart backend API supaya route baru aktif
systemctl restart luxquant-backend.service

# install + enable timer resolver (idempotent, meng-copy semua unit v6)
bash backend/migrations/install_v6_timers.sh
```

## 2. Backfill riwayat (termasuk report 3 hari lalu)

Resolver otomatis mengevaluasi SEMUA contract yang belum punya resolusi,
dari `active_from`-nya masing-masing, memakai kline 1m Bybit historis —
jadi report 3 hari lalu (atau lebih, sampai `--max-age-days`, default 30)
ikut dinilai sesuai kondisi pasar saat itu, bukan kondisi sekarang.

Cek dulu tanpa menulis DB:

```bash
cd /root/luxquant-terminal/backend
venv/bin/python -m app.services.compass_projection_resolver --backfill --dry-run --verbose
```

Output per contract: `DRY-RUN <projection_id> -> <OUTCOME> (barrier=... at ...)`
plus ringkasan JSON di akhir:

```json
{
  "checked": 120,
  "resolved": 97,
  "still_pending": 23,
  "outcomes": {"CLEAN_HIT": 41, "INVALIDATED_FIRST": 30, "STALE_NO_TOUCH": 26},
  "superseded": 0
}
```

Kalau hasil dry-run masuk akal, jalankan beneran:

```bash
venv/bin/python -m app.services.compass_projection_resolver --backfill --verbose
```

Setelah itu refresh halaman AI Research → Projection Audit: Resolved,
Clean hits, Invalidated, dan Hit rate akan terisi, dan "Reports"
menampilkan total sungguhan (bukan 50).

## 3. Operasional harian

Timer jalan tiap 5 menit tanpa perlu campur tangan:

```bash
systemctl status luxquant-compass-resolver.timer
journalctl -u luxquant-compass-resolver.service -n 50
```

## 4. Aturan penilaian (target-first)

- Window evaluasi: `active_from` → `active_from + stale_after_minutes`.
- Barrier pertama yang tersentuh menang (target vs invalidation).
- Trigger dihormati: `close_below`/`close_above` butuh CLOSE menembus level
  (wick saja tidak cukup); trigger `touch`/`intrabar` cukup wick.
- Dua barrier di candle 1m yang sama → `AMBIGUOUS_BAR` (tidak dihitung
  hit maupun miss).
- Window habis tanpa sentuhan → `STALE_NO_TOUCH` (juga tidak dihitung
  hit/miss; hit rate = clean_hits / (clean_hits + invalidated)).
- Bias RANGE dinilai sebagai `RANGE_HELD` / `RANGE_BREAK_UP` /
  `RANGE_BREAK_DOWN` dengan band atas = max(primary_touch, extension_high)
  dan band bawah = invalidation.
