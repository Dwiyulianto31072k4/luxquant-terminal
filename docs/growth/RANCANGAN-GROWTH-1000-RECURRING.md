# RANCANGAN GROWTH — Menuju 1.000 Recurring Subscriber

**Tanggal:** 23 Juli 2026
**Sasaran:** minimal 1.000 recurring subscriber per bulan
**Batasan yang ditetapkan pemilik:** **paket harga TIDAK diubah** — Monthly $50 / Annual $400 / Lifetime $1.000 tetap seperti sekarang. Semua rancangan di bawah bekerja di atas struktur harga yang ada.

---

## 1. Baseline (angka produksi, terverifikasi)

### Kualitas produk — ini bukan masalahnya
| Metrik | Angka | Sumber |
|---|---|---|
| Win rate keseluruhan | **85.6%** | `/api/v1/signals/analyze` |
| Signals resolved | 53.230 | idem |
| Winners / stopped out | 45.559 / 7.671 | idem |
| Pairs traded | 749 | idem |
| Avg P/L TP4+ (avg peak) | **+61.5%** (10.223 trade, 19%) | Track Record |
| Avg loss saat SL | **−3.9%** (7.671 trade, 14%) | Track Record |
| Total sinyal sejak 24 Des 2023 | 54.471 | DB |

Produknya kuat dan buktinya publik. Rasio asimetri (−3.9% vs +61.5%) adalah aset pemasaran terbaik yang dimiliki.

### Funnel — di sini masalahnya
| Tahap | Angka | Catatan |
|---|---|---|
| Signup / bulan | 120–200 | 100% organik, $0 marketing |
| Kembali lagi (login >1x) | ~14% | 86% hilang setelah kunjungan pertama |
| Link Telegram | **31%** | penting: lihat §3 |
| Payment intent / bulan | ~40 | niat beli tinggi |
| **Berhasil bayar / bulan** | **~6** | success rate **19%** |
| Renewal | **0 sepanjang sejarah** | 25 pembayar, semua bayar 1x |
| Subscriber aktif | 118 (104 lifetime, ~15 berjangka) | lifetime mendominasi |
| Referral | 43 kode, 13 pemakaian, $0 payout | infra jadi, tidak dipakai |

**Intent yang hangus:** 105 user mencoba bayar dan tidak pernah berhasil — $21.485 expired + $11.650 cancelled, vs $2.280 tertagih.

### Perbandingan benchmark industri 2026
- Conversion signup→paid kamu ≈ **4%** → benchmark freemium: rata-rata 3.7%, "good" 3–5%, "great" 8–12%. **Conversion-mu normal.**
- Activation rata-rata SaaS **37.5%**; naik 25% → **+34% revenue**. Activation-mu ~14%.
- Annual churn 5–10% vs monthly 30–50% → mix annual adalah kunci recurring.

**Kesimpulan:** yang rusak bukan produk dan bukan daya jualnya. Yang rusak adalah **kasir, jangkauan, dan perpanjangan.**

---

## 2. Prinsip rancangan

1. **Jangan gandakan traffic sebelum kasir & activation beres.** Menambah pengunjung hanya menambah orang yang gagal bayar.
2. **Perbaiki yang sudah ada sebelum membangun baru.** Audit kode menunjukkan banyak infrastruktur sudah jadi tapi tidak tersambung (§3).
3. **Harga tidak diubah.** Semua peningkatan datang dari konversi, jangkauan, dan retensi.
4. **Semua klaim pemasaran harus terverifikasi di produk.** Angka di iklan = angka di website = angka di database.

---

## 3. Temuan audit kode — yang sudah ada vs yang hilang

Ini bagian terpenting: sebagian besar pekerjaan bukan membangun dari nol.

| Kapabilitas | Status | Lokasi |
|---|---|---|
| Reminder expiry H-7 / H-3 / H-1 | ✅ **SUDAH ADA** | `backend/app/services/notification_worker.py:204` `generate_subscription_expiry_notifications()` |
| Pengiriman reminder ke luar app | ❌ **TIDAK ADA** | fungsi di atas hanya `INSERT INTO notifications` — in-app saja |
| Telegram DM helper | ✅ **SUDAH ADA, belum dipakai untuk reminder** | `backend/app/services/telegram_group.py:132` `send_dm(telegram_id, text)` |
| Invite / kick / grace VIP Telegram | ✅ SUDAH ADA | `telegram_group.py` + worker grace period |
| **Email sender** | ❌ **TIDAK ADA SAMA SEKALI** | tidak ada smtplib/sendgrid/resend di seluruh `backend/app` |
| Payment intent lifecycle | ✅ ADA | `backend/app/api/routes/subscription.py` — pending → confirmed / expired / cancelled |
| Follow-up intent mangkrak | ❌ TIDAK ADA | tidak ada worker yang menyentuh `payments.status='expired'` |
| Infra referral + credit ledger | ✅ ADA, nganggur | `referral_service.py`, tabel `referral_codes` / `referral_uses` / `referral_payouts` / `credit_ledger` |
| Notifikasi in-app | ✅ ADA tapi jenuh | 7.404 notif tak terbaca → kanal ini praktis mati |

### Konsekuensi terbesar: 69% user tidak bisa dihubungi

Karena **tidak ada email**, satu-satunya kanal keluar adalah **Telegram DM**. Hanya 31% user yang punya `users.telegram_id`. Artinya:

> Untuk 69% user, tidak ada cara apa pun mengirim reminder expiry, follow-up pembayaran gagal, atau win-back.

Ini menjelaskan renewal 0% meski logika reminder-nya sudah ada: reminder-nya masuk ke inbox in-app yang tak pernah dibuka, dan mayoritas user tak punya kanal alternatif.

**Karena itu "link Telegram" bukan fitur engagement — itu prasyarat infrastruktur monetisasi.**

---

## 4. MODUL 1 — Checkout Recovery (prioritas #1)

**Masalah:** 105 user gagal bayar, success rate 19%. Rail pembayaran satu-satunya adalah USDT BEP-20 on-chain; mayoritas calon pembeli tidak punya USDT siap di jaringan yang benar.

### 1a. Follow-up intent mangkrak (usaha kecil, dampak langsung)
Worker baru yang membaca `payments` dan menghubungi user yang niatnya hangus.

- **Trigger:** `payments.status IN ('expired','cancelled')` dan user belum pernah punya payment `confirmed`.
- **Kanal:** Telegram DM via `telegram_group.send_dm()` bila `users.telegram_id` ada; bila tidak → masuk **antrian admin** di tab Follow-ups (sudah ada di Management System).
- **Jadwal:** T+1 jam, T+24 jam, T+72 jam (maksimal 3 sentuhan, lalu berhenti).
- **Isi pesan:** tawarkan bantuan + metode alternatif + link bayar ulang. Bukan menagih — menawarkan bantuan teknis.
- **Anti-spam:** tabel penanda `payment_followups` (satu baris per payment per tahap) supaya idempoten seperti pola `source_id` di notification_worker.

### 1b. Rail pembayaran tambahan
Penyebab akar 81% kegagalan. Pilihan (keputusan pemilik):
- Pasar Indonesia/SEA → **QRIS / transfer bank / e-wallet** (Xendit atau Midtrans)
- Pasar global → **card** via payment processor crypto (mis. NOWPayments)
- Minimal tanpa integrasi baru: perjelas panduan di `PaymentPage.jsx` (jaringan BEP-20, contoh, estimasi waktu) + tombol "butuh bantuan → admin".

### 1c. Halaman bayar yang menahan tangan
- Tampilkan **jaringan yang benar** dengan peringatan besar (kesalahan jaringan = dana hilang = trauma)
- Countdown invoice + status verifikasi real-time
- Tombol "Bayar lewat admin" (fitur `SubscribeViaAdminModal` sudah ada) dinaikkan visibilitasnya

**Target:** success rate 19% → 50–60%. Efeknya: ~6 → **~20–24 paid/bulan tanpa satu user baru.**

**Selesai bila:** worker follow-up jalan & teruji, ≥1 rail non-on-chain hidup, success rate terukur di dashboard Finance.

---

## 5. MODUL 2 — Reachability & Activation 90 Menit (prioritas #2)

Riset: *activation trumps acquisition*; top performer memicu onboarding dalam **90 menit pertama**. Aha moment LuxQuant: **user melihat satu call, lalu menyaksikannya kena TP.**

### 2a. Kampanye link Telegram (memperbaiki infrastruktur, bukan sekadar UX)
Sasaran: 31% → **70%+** user ter-link.
- Onboarding wajib-lewat (skippable tapi muncul lagi): satu langkah, satu tombol, alasan jelas — *"Sinyal dan pemberitahuan penting dikirim lewat Telegram."*
- `TelegramNudgeModal` sudah ada dengan cooldown menurun — naikkan prioritas & perjelas value proposition.
- Kampanye satu kali ke 69% user lama yang belum link (lewat in-app banner + antrian admin outreach).

### 2b. Alur 90 menit pertama
| Waktu | Aksi | Kanal |
|---|---|---|
| Menit 0 | Setelah signup, tampilkan **satu call aktif** (bukan dashboard kosong): "Ini yang algoritma lihat sekarang" | In-app |
| Menit 1 | Satu ajakan tunggal: link Telegram | In-app |
| Menit 5 | Kirim satu **bukti kemenangan terbaru** + chart | TG DM |
| Jam 24 | "Algoritma mengeluarkan N call sejak kamu daftar — ini 3 terbaik" | TG DM |
| Hari 7 | Arahkan ke Track Record + ajakan berlangganan (harga normal) | TG DM + in-app |

### 2c. Bereskan kejenuhan notifikasi
7.404 notif tak terbaca membuat kanal in-app mati. Triase: kategori penting (expiry, pembayaran, akun) dipisah dari firehose sinyal, dan default preferensi dikurangi.

**Metrik activation:** user yang **link TG + membuka ≥1 detail call dalam 7 hari.** Sekarang ~14% → target **37.5%**.

**Selesai bila:** rasio link TG ≥70% untuk signup baru, alur 5 tahap jalan, activation terukur.

---

## 6. MODUL 3 — Renewal Delivery (prioritas #3)

Logikanya sudah ada; yang hilang hanya **pengiriman dan jalur aksi**. Ini pekerjaan paling murah dengan hasil paling langsung.

### 3a. Sambungkan reminder ke Telegram
Ubah `generate_subscription_expiry_notifications()` agar selain INSERT notifikasi, juga memanggil `telegram_group.send_dm()` bila user ter-link.

Isi pesan **bukan** "tagihan jatuh tempo", tapi bukti nilai:
> *"Langgananmu berakhir dalam 3 hari. Selama periode ini algoritma mencetak N call di atas +20%, dengan win rate X%. Perpanjang di sini: [link]"*

### 3b. Grace period & degradasi lembut
- 3 hari grace: akses read-only, bukan mati mendadak (pola grace VIP Telegram sudah ada, samakan perilakunya)
- Auto-kick VIP TG baru setelah grace habis (sudah ada, pastikan sinkron)

### 3c. Pause daripada cancel
Riset: pause mengurangi churn 15–25%, dan yang pause **reaktivasi 70%** (vs 20% yang cancel). Tambahkan opsi "jeda 1 bulan" di halaman langganan.

### 3d. Dorong Annual di titik renewal
Riset: 25–40% mau pindah annual bila ditawarkan saat renewal, churn turun 60–70%. **Tanpa mengubah harga** — cukup menampilkan perbandingan: $400/thn ≈ $33/bln vs $50/bln.

### 3e. Win-back
28 user expired: satu kampanye berisi rekap performa selama mereka absen + jalur kembali.

**Selesai bila:** reminder terkirim via TG, grace + pause hidup, ≥1 renewal tercatat (dari 0), tawaran annual muncul di alur renewal.

---

## 7. MODUL 4 — X & Telegram (corong atas)

### 4a. Pin post (FINAL — siap eksekusi)

**Struktur:** 1 main post (2 gambar) + 4 reply. Gaya: kalimat pendek aktif, tanpa emoji/hashtag, angka presisi. Semua % besar memakai kata *"peaked / at peak"* (pergerakan puncak setelah call, bukan realized profit).

**MAIN (pinned) — Slide 1 + Slide 2**
```
Crypto has thousands of coins. Most of them are noise.

Our algorithm has read the market 24/7 since December 2023 and
published every call it made — 53,230 resolved, 85.6% winners,
across 749 pairs.

Use it free and verify every number: luxquant.tw
Updates and free calls on Telegram: t.me/LuxQuantSignal
```
- Gambar 1 — Cover: `Read the Market. Move With Conviction.` + sub + footer `luxquant.tw · t.me/LuxQuantSignal`
- Gambar 2 — **Screenshot** baris KPI Track Record: `85.6% · 53,230 · 45,559 · 749`

**Reply 1 — Asimetri**
```
A win rate means nothing without the size of the wins and losses.

When our algorithm is wrong, the average stop-out costs 3.9%.
When it runs, nearly 1 in 5 calls pushes past the final target —
averaging +61.5% at peak.

That asymmetry is the whole edge, and it is all on record.
```
- Gambar: **Screenshot** panel `Where Winners Exit` (TP4+ +61.5% & SL −3.9% dalam satu frame)

**Reply 2 — Top movers**
```
What that looked like last month.

AKE peaked +1,157% after the call. BANK +834%. TAIKO +731%.
NFP +691%. TLM +403%.

Not cherry-picked highlights — every one of them sits in the same
public table as the losers.
```
- Gambar: kartu Top Movers (5 baris besar + label `Peak move after the call · last 30 days`)

**Reply 3 — Free + verify**
```
Use it free, then verify every number yourself.

A free account opens core market views and the full performance
database. The win-rate chart is interactive: pick any day, open it,
and read the exact calls behind it — entries, targets, outcomes.

Screenshots are easy. A database is hard.

luxquant.tw
```
- Gambar: **Screenshot** modal day-drill terbuka di atas chart Win Rate × Bitcoin

**Reply 4 — Telegram**
```
Follow us on Telegram too.

Market updates and a free selection of our algo calls, sent as they
happen — the easiest way to see how the algorithm works before you
commit to anything.

t.me/LuxQuantSignal
```
- Gambar: free-path card (phone mockup `telegram-ss.png` + QR join)

**Mekanika:** MAIN → Reply 1–4 jeda ±2 menit → Pin to profile. Jam tayang 20:00–24:00 WIB. Link web pakai `?utm_source=x&utm_medium=pin`.
**Ritual bulanan:** tanggal 1, tambah satu reply berisi top movers + WR terbaru. Pin tidak diganti; thread tumbuh jadi dinding bukti.

### 4b. Profil X
- **Bio:** `Markets don't sleep. Neither does our quant algorithm — derivatives, whale flow & order books, scanned 24/7. Don't trust, verify → luxquant.tw`
- **Nama akun:** `LuxQuant — 24/7 Crypto Quant Signals` (kolom nama ter-index pencarian X)
- **Website field:** `luxquant.tw/performance?utm_source=x&utm_medium=profile`

### 4c. Retune `x_poster` (utang teknis penting)
Kondisi: 40–220 tweet/hari, 13.9K post → 2.561 follower. Hanya event kemenangan (`tp2/tp3/closed_win`), **nol post kekalahan** — bertentangan dengan klaim transparan. `daily_recap` cuma pernah tayang 6 kali.

Rencana:
- `MIN_PROFIT_PCT` 0 → 5–8; `DAILY_TWEET_CAP` → ~5
- `daily_recap` jadi post andalan harian
- Tambah recap mingguan yang **menyertakan kekalahan** (membuat klaim transparansi jadi nyata)
- Simpan impressions/likes per tweet ke `x_posts` + UTM di semua link → feedback loop (sekarang buta)
- Sinyal real-time penuh tetap eksklusif Telegram; X jadi etalase bukti

⚠️ **Risiko:** `x_poster.py` hidup di VPS `/root/luxquant-x-poster/` dan **tidak ada di repo** — tidak terversion, tidak ada backup di git. Sebaiknya dimasukkan ke repo.

---

## 8. MODUL 5 — Referral Loop (prioritas setelah 1–3)

Infra lengkap sudah ada dan nganggur (43 kode, 13 pemakaian, $0 payout).

- **Invite-to-earn:** undang 3 teman yang aktif → 1 minggu akses gratis. Bot TG melacak.
- **KOL/affiliate:** komisi 40–50% pembayaran pertama + 10–20% recurring. Rekrut **dari 104 lifetime user dulu** (mereka sudah percaya produknya), lalu 5–10 micro-KOL (5k–50k follower). Riset: kampanye KOL crypto rata-rata ~$6.5 per $1; 5–10 micro mengalahkan 1 makro.
- Aset promosi otomatis: kartu PnL co-branded (renderer sudah ada).

---

## 9. Instrumentasi & metrik

Tanpa ini semua di atas hanya perasaan.

| Metrik | Definisi | Sekarang | Target |
|---|---|---|---|
| Checkout success | `confirmed / (confirmed+expired+cancelled)` | 19% | **≥55%** |
| TG linked | `telegram_id IS NOT NULL / total` | 31% | **≥70%** |
| Activation 7-hari | link TG + ≥1 detail call dibuka | ~14% | **≥37%** |
| Signup→paid | paid / signup per kohort bulan | 4% | **≥12%** |
| Renewal rate | perpanjang / jatuh tempo | **0%** | **≥50%** |
| Annual mix | annual / total subscriber berjangka | rendah | **≥40%** |
| Attribution | signup per `utm_source` | tidak ada | terpasang |

Tempat tampil: tab **Growth** di Management System (sudah ada) — tambahkan kartu untuk metrik di atas.

---

## 10. Roadmap berurutan

| Fase | Modul | Hasil yang diharapkan |
|---|---|---|
| **Fase 1** | Modul 1 (checkout) + Modul 3a (reminder → TG) | Paid/bulan 6 → ~20; renewal pertama tercatat |
| **Fase 2** | Modul 2 (reachability & activation) | TG linked ≥70%; activation ~37%; user bisa dihubungi |
| **Fase 3** | Modul 3 lengkap (grace, pause, annual push, win-back) | Renewal ≥50%; churn turun; recurring mulai menumpuk |
| **Fase 4** | Modul 4 (pin post + retune x_poster) | Corong atas hidup; follower & signup naik |
| **Fase 5** | Modul 5 (referral & KOL) + SEO coins | Growth loop compounding |

### Matematika menuju sasaran
| Fase | Signup/bln | Conv | Paid baru/bln | Recurring aktif |
|---|---|---|---|---|
| Sekarang | 150 | 4% | 6 | ~15 |
| Fase 1–2 | 150 | 13% | ~20 | ~60 |
| Fase 3 | 200 | 13% | 26 + renewal | ~180 |
| Fase 4 | 500 | 13% | ~65 | ~500 |
| Fase 5 | 800 | 13% | ~105 | **~1.000** |

Dengan mix annual-heavy (churn 5–10%), 1.000 recurring butuh ~100–120 paid baru/bulan → **realistis 9–12 bulan bila urutannya dipatuhi.**

---

## 11. Catatan penting

1. **Urutan tidak boleh ditukar.** Menjalankan Modul 4 (konten) sebelum Modul 1 (kasir) berarti membayar perhatian untuk mengantar orang ke pintu yang terkunci.
2. **Telegram adalah infrastruktur, bukan kanal sosial.** Tanpa email, TG DM satu-satunya jalan menghubungi user. Setiap persen kenaikan link TG menaikkan seluruh kemampuan monetisasi.
3. **Lifetime tetap dijual** sesuai keputusan pemilik. Konsekuensinya perlu disadari: setiap lifetime = MRR nol setelahnya, jadi target 1.000 *recurring* harus dipenuhi dari monthly/annual.
4. **Jaga integritas klaim.** Semua angka pemasaran harus sama dengan yang tampil di luxquant.tw. Gunakan "peaked/at peak" untuk % besar. Ini yang membuat posisi "don't trust, verify" bertahan.
5. **Rekonsiliasi revenue** (dua sumber kebenaran: Profit Share $600/12tx vs rekap manual $2.217) harus beres sebelum skala partner payout membesar.
