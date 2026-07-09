# Kenapa WORKER TIMEOUT Muncul Setelah Gunicorn — & Best Practice Mengatasinya

Dokumen referensi: akar masalah, mekanisme, dan praktik terbaik (dari dokumentasi gunicorn/uvicorn + praktik produksi FastAPI). Ditulis untuk kasus LuxQuant, tapi prinsipnya umum.

---

## TL;DR

`WORKER TIMEOUT` **bukan** disebabkan oleh gunicorn — gunicorn hanya **menyorotinya**. `--timeout` gunicorn itu **heartbeat proses** (cek "worker masih hidup?"), bukan timeout request. Uvicorn polos **tak punya mekanisme pembunuh** itu, jadi masalah yang sama dulu **tak kelihatan** (worker cuma melambat, tak dibunuh).

Dua akar nyata di aplikasimu:
1. **Event loop ke-blok** — endpoint `async def` menjalankan kerja sinkron berat (compute / query DB sinkron). Worker tak bisa "lapor" → dibunuh.
2. **CPU starvation** — job batch/loop berat (cron peak, enrichment loop) berbagi **2 core** dengan web worker → worker kelaparan → tak sempat lapor → dibunuh.

Keduanya sudah kita tangani (threadpool + nice/CPUWeight). Best practice lengkap ada di bawah.

---

## 1. Kenapa muncul "setelah gunicorn"?

`--timeout` di gunicorn adalah **heartbeat/health-check tingkat proses**, bukan batas waktu request. Master gunicorn membunuh worker **hanya jika worker gagal memberi sinyal ke master dalam batas waktu** ([Gunicorn/Uvicorn tuning](https://www.edgeservers.com.au/en/articles/python-gunicorn-uvicorn-tuning), [lightrun](https://lightrun.com/answers/encode-uvicorn-gunicorn-with-uvicornworker-is-not-respecting-the-timeout)).

- **Uvicorn polos (sebelumnya):** tak ada arbiter yang memantau heartbeat, jadi **tak ada yang membunuh** worker lambat. Saat event loop beku 60 dtk, request cuma menggantung lalu pulih — **senyap**, tak ada log `WORKER TIMEOUT`.
- **Gunicorn + UvicornWorker (sekarang):** arbiter memantau heartbeat. Kalau event loop beku (kode sinkron) atau worker kelaparan CPU sampai tak bisa lapor dalam `timeout`, master kirim **SIGABRT** → worker mati & reboot. Jadi masalah **lama** yang tadinya tak kelihatan sekarang **muncul sebagai log**.

**Nuansa penting** ([discussion #339](https://github.com/tiangolo/uvicorn-gunicorn-fastapi-docker/discussions/339)): karena UvicornWorker async, worker tetap dianggap "sehat" walau **satu** coroutine menggantung — SELAMA event loop masih berputar. Tapi kalau coroutine itu menjalankan **kode sinkron yang memblok loop**, seluruh loop beku → heartbeat tak ter-update → baru di situ gunicorn membunuhnya. Inilah yang terjadi di endpoint `async def` + kerja sinkron.

> Kesimpulan: gunicorn = alarm yang benar. Jangan matikan alarmnya (menaikkan `timeout` besar-besaran hanya menyembunyikan freeze). Perbaiki penyebab freeze-nya.

---

## 2. Akar #1 — Blocking di dalam `async def` (event loop freeze)

**Prinsip:** di `async def`, kalau kamu memanggil operasi **sinkron** (query DB sinkron, `requests.get`, compute CPU berat, `time.sleep`) tanpa `await` yang benar, event loop **beku** selama itu — server tak bisa melayani request lain sama sekali ([FastAPI: Concurrency](https://fastapi.tiangolo.com/async/), [Ithy: FastAPI hangs on long DB queries](https://ithy.com/article/fastapi-blocking-issues-hmzy9pkr)).

Penting ([10 Async Pitfalls](https://medium.com/@bhagyarana80/10-async-pitfalls-in-fastapi-and-how-to-avoid-them-60d6c67ea48f)): **membungkus fungsi blocking dalam `async def` lalu `await` TIDAK membuatnya async.** Kamu harus benar-benar meng-offload-nya.

### Best practice
1. **Offload ke threadpool** — `from fastapi.concurrency import run_in_threadpool` atau `asyncio.to_thread(fn, ...)`. Loop tetap hidup, kerja berat jalan di thread lain. ← *ini yang kita pakai untuk coin-intel, journey-insights, ai-arena, delisting.*
2. **Pakai driver async** untuk DB (SQLAlchemy 1.4+/2.0 async, `asyncpg`, Tortoise) kalau mau endpoint `async def` yang query DB tanpa blocking. Alternatif: jadikan endpoint **`def` biasa** (bukan `async def`) — FastAPI otomatis menjalankannya di threadpool, jadi query sinkron tak memblok loop. ← *`services_monitor` kita aman justru karena `def` sinkron.*
3. **Jangan compute berat di request path.** Hitung di **background worker/poller**, simpan ke cache; endpoint cukup **baca cache** (fresh → stale → 503), jangan pernah compute inline. ← *pola coin-intel yang kita perbaiki.*
4. **Job panjang → offload ke task queue** (Celery/RQ/arq); request balas `202 Accepted` segera ([blog.arfy.ca](https://blog.arfy.ca/worker-timeout/)).
5. **Single-flight + serve-stale** untuk cache mahal, supaya cold-cache + trafik tak bikin banyak worker compute barengan (thundering herd). ← *lock Redis SETNX yang kita tambah.*

---

## 3. Akar #2 — CPU starvation (noisy neighbor) di box kecil

Walau event loop tak beku oleh kode kita, worker bisa **kelaparan CPU**: kalau proses lain (cron batch, worker loop) menyita CPU, OS jarang menjadwalkan worker web → worker tak sempat kirim heartbeat dalam `timeout` → dibunuh. Di box **2 core** dengan banyak service, ini gampang terjadi.

### Best practice (prioritas & isolasi resource)
1. **Turunkan prioritas job non-kritis** dengan `nice`/`ionice`, atau lebih baik **`CPUWeight`** (cgroups v2 via systemd). Beri web server bobot lebih besar dari background worker saat CPU langka ([iximiuz: cgroups](https://labs.iximiuz.com/tutorials/controlling-process-resources-with-cgroups)). ← *kita set `Nice=19 IOSchedulingClass=idle CPUWeight=20` pada enrichment/arena, dan `nice -n 19 ionice -c3` pada cron.*
2. **Pisahkan** web server & background worker jadi service/cgroup berbeda supaya "noisy neighbor tak mencekik beban kritis" ([cleanstart: cgroup](https://www.cleanstart.com/guide/cgroup)). ← *poller sudah terpisah (`LUXQUANT_RUN_POLLERS=0` di web, jalan di `luxquant-poller.service`).*
3. **Pantau** dengan `systemd-cgtop` untuk verifikasi alokasi CPU antar service.
4. **Deploy hygiene** — build (npm/vite) menyita CPU; beri `nice`/`ionice`, atau build di CI/mesin lain lalu rsync artefak, supaya build tak mencekik worker yang sedang jalan. ← *kita `nice` `npm run build` di `deploy.sh`.*
5. **Kapasitas** — kalau semua sudah di-prioritaskan tapi masih mepet, **tambah core**. Di 2 core untuk 4 web worker + enrichment + arena + poller + cryptobot + cron, headroom memang tipis; 4 core memberi ruang nyata.

---

## 4. Tuning gunicorn/uvicorn yang benar

- **Jumlah worker (async):** untuk UvicornWorker, worker ≈ **jumlah core** (async 1 worker melayani banyak request). Rumus `2×core+1` itu untuk worker **sync**, bukan async ([iklobato](https://medium.com/@iklobato/mastering-gunicorn-and-uvicorn-the-right-way-to-deploy-fastapi-applications-aaa06849841e), [oneuptime](https://oneuptime.com/blog/post/2026-02-03-python-uvicorn-production/view)). Di 2 core, 2–4 wajar; 4 membantu "menyembunyikan" blocking DB sinkron tapi menambah kontensi.
- **`timeout` = batas atas heartbeat**, bukan obat. Boleh sedikit dinaikkan kalau ada request/stream sah yang panjang, tapi jangan dipakai untuk menutupi freeze ([lightrun](https://lightrun.com/answers/encode-uvicorn-gunicorn-with-uvicornworker-is-not-respecting-the-timeout)).
- **`threads`** relevan untuk sync worker / threadpool sizing; samakan dengan pola offload-mu.
- **`graceful_timeout`** untuk rolling reload tanpa drop request. ← *sudah 20s.*
- **`worker_tmp_dir=/dev/shm`** supaya heartbeat file di RAM, hindari false-positive saat disk sibuk ([discussion #339](https://github.com/tiangolo/uvicorn-gunicorn-fastapi-docker/discussions/339)). ← *sudah dipakai.*
- **Kenapa gunicorn (bukan uvicorn polos)?** gunicorn kasih rolling graceful reload + self-heal (reboot worker macet) + manajemen proses. Jadi tetap pakai gunicorn; dia "alarm + pemulih", bukan penyebab.

---

## 5. Peta: yang sudah kita lakukan vs best practice

| Best practice | Status di LuxQuant |
|---|---|
| Offload blocking di `async def` → threadpool | ✅ coin-intel, journey-insights, ai-arena/chart-data, delistings |
| Compute berat di poller, endpoint baca cache (fresh→stale→503) | ✅ coin-intel (stale-serve) |
| Single-flight (anti thundering-herd) | ✅ Redis SETNX lock coin-intel |
| Endpoint sinkron pakai `def` (auto-threadpool) | ✅ services_monitor (aman apa adanya) |
| Turunkan prioritas background (nice/ionice/CPUWeight) | ✅ cron peak+enrichment, service enrichment-v3, arena-v6 |
| Pisahkan poller dari web | ✅ `LUXQUANT_RUN_POLLERS=0` + `luxquant-poller.service` |
| Deploy build tak mencekik worker | ✅ `nice -n 19 ionice -c3 npm run build` |
| Heartbeat di RAM | ✅ `worker_tmp_dir=/dev/shm` |
| Rolling graceful reload | ✅ `reload-or-restart` + `graceful_timeout=20` |

## 6. Yang tersisa (opsional, sesuai kebutuhan)

- **Driver DB async** (SQLAlchemy async/asyncpg) ATAU ubah endpoint read berat jadi `def` → menghapus blocking DB dari loop secara struktural. Refactor besar; lakukan kalau timeout organik masih muncul.
- **Task queue (Celery/arq)** untuk job yang berpotensi >60 dtk, balas `202` segera.
- **CPUWeight halus** via systemd untuk semua service (bukan cuma nice) + `systemd-cgtop` untuk monitoring.
- **Naik ke 4 core** — headroom kapasitas; paling terasa untuk deploy-tanpa-kedip di box padat.
- **Deploy di CI + rsync artefak** — hilangkan CPU-spike build dari server produksi.

---

## Sumber

- Gunicorn/Uvicorn tuning — https://www.edgeservers.com.au/en/articles/python-gunicorn-uvicorn-tuning
- Gunicorn UvicornWorker timeout (heartbeat, bukan request) — https://lightrun.com/answers/encode-uvicorn-gunicorn-with-uvicornworker-is-not-respecting-the-timeout
- WORKER TIMEOUT crash cycle & /dev/shm — https://github.com/tiangolo/uvicorn-gunicorn-fastapi-docker/discussions/339
- Solusi WORKER TIMEOUT (offload, background job, timeout) — https://blog.arfy.ca/worker-timeout/
- FastAPI Concurrency & async/await — https://fastapi.tiangolo.com/async/
- FastAPI hangs on long DB queries — https://ithy.com/article/fastapi-blocking-issues-hmzy9pkr
- 10 Async Pitfalls in FastAPI — https://medium.com/@bhagyarana80/10-async-pitfalls-in-fastapi-and-how-to-avoid-them-60d6c67ea48f
- Deploy Gunicorn+Uvicorn yang benar — https://medium.com/@iklobato/mastering-gunicorn-and-uvicorn-the-right-way-to-deploy-fastapi-applications-aaa06849841e
- Uvicorn production deployment — https://oneuptime.com/blog/post/2026-02-03-python-uvicorn-production/view
- Controlling process resources with cgroups — https://labs.iximiuz.com/tutorials/controlling-process-resources-with-cgroups
- cgroup guide (noisy neighbor isolation) — https://www.cleanstart.com/guide/cgroup
