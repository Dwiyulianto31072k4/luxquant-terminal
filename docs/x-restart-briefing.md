# LuxQuant × X — briefing restart akun

> **Prompt pembuka untuk chat baru — paste bagian ini sebagai pesan pertama:**
>
> *"Ini lanjutan dari sesi sebelumnya. Akun X lama @luxquantcrypto disuspend
> 18 Agustus 2026 dan appeal-nya sudah ditolak; semua jalur banding tertutup.
> Saya sudah membuat akun pengganti @luxquantapp ("LuxQuant Terminal"), developer
> app 33333022, kredensialnya sudah terpasang di VPS, dan automation X masih
> sengaja dimatikan. Migrasi handle ke seluruh sistem sudah selesai dan sudah
> dideploy. Baca `docs/x-restart-briefing.md` dulu sampai habis sebelum menjawab
> apa pun. Yang saya butuhkan berikutnya: (1) pastikan aturan main kita benar-benar
> tidak melanggar X Rules, (2) bangun dua item di bagian 4 yang belum jadi,
> (3) susun kalender posting manual 2 minggu pertama. Jangan nyalakan automation
> apa pun tanpa saya minta."*

Status per 21 Agustus 2026, 09:00 UTC. Semua angka & config di bawah dibaca langsung
dari VPS hari ini, bukan dari ingatan.

---

## 1. Apa yang terjadi

Akun lama **@luxquantcrypto** disuspend **18 Agustus 2026**, alasan resmi
*"inauthentic accounts"* — kategori yang sama persis dengan suspensi pertama
13 Maret 2026 (waktu itu pulih setelah 12 hari).

Appeal sudah dikirim dan **ditolak**. Jalur lanjutan sudah ditutup semua:
form appeal memblokir pengiriman kedua, Premium Support tidak menangani suspensi,
forum developer menutup thread akun, dan `help.x.com/forms/platform` sudah mati.
Balasan email masih menggantung tanpa jawaban. Anggap akun lama hilang.

**Penyebab yang paling mungkin** (tidak pernah dikonfirmasi X, tapi konsisten
dengan datanya): 8–9 Agustus market naik keras, ±450 target kena dalam sehari —
sekitar dua kali hari normal. Sistem menerbitkan semuanya. Volume harian tembus
75 post/hari. Yang penting: **post per market-event justru datar** (0.34 → 0.36 → 0.34),
jadi ini bukan kami menaikkan frekuensi — marketnya yang meledak dan sistem
mengikuti tanpa plafon.

Dua hal yang memperparah dan sudah diperbaiki:
- **49% dari semua post adalah Quote post otomatis.** Automation Rules X menyebut
  bulk automated Reposting/Quote secara eksplisit sebagai pelanggaran. Sekarang
  sudah diubah jadi reply biasa (`in_reply_to_tweet_id`).
- **Tidak ada label Automated, tidak ada disclosure operator di bio, tidak ada
  tautan ke akun manusia.** Tiga-tiganya wajib untuk akun otomatis.

Catatan penting: 16–17 Agustus jangkauan runtuh −83% lalu −92% *sebelum* suspensi —
X sudah membatasi visibilitas duluan. Itu sinyal peringatan yang tidak kami baca.

---

## 2. Kondisi sistem sekarang — X mati, sisanya jalan penuh

Setelah suspensi ditemukan bahwa **X adalah single point of failure di 4 tempat**:
Telegram, Discord, dan generator kartu semuanya menunggu X sukses dulu. Itu sudah
didekopel 18–19 Agustus. Sekarang:

| Service | Status | Catatan |
|---|---|---|
| `luxquant-x-poster` | active | X di-gate mati, Telegram jalan |
| `luxquant-discord-relay` | active | relay `tp3,closed_win` + kartu `daily_gainers_bundle` |
| `luxquant-backend` | active | |
| `luxquant-call-poster` | active | |
| `luxquant-btc-pulse` | oneshot timer, tiap 30 mnt | cooldown berfungsi |
| `luxquant-card-poster@{a..g}` | oneshot timer | |

Bukti hari ini (21 Agu, sampai 09:00 UTC): **523 baris kirim Telegram, 131 skip X**.
Kanal utama sehat sepenuhnya tanpa X.

**Satu file mengendalikan gate X untuk ketiga poster.** `card_poster.py` dan
`btc_pulse_poster.py` sama-sama `load_dotenv("/root/luxquant-x-poster/.env")`,
jadi tidak ada gate kedua yang bisa lupa dimatikan:

```
/root/luxquant-x-poster/.env
  X_POST_ENABLED=false      ← saklar utama
  X_DAILY_CAP=10            ← plafon mutlak, TIDAK diturunkan dari aktivitas market
  X_MIN_MINUTES_BETWEEN=60
  X_HANDLE=luxquantapp
  DAILY_TWEET_CAP=1000      ← guard runaway, sekarang membatasi TELEGRAM (bukan X)
  MIN_DELAY_SECONDS=60 / MAX_DELAY_SECONDS=120
```

`DAILY_TWEET_CAP` pernah bikin masalah: nilainya 300 dan diam-diam jadi plafon
Telegram setelah dekopel, memblokir sinyal. Sekarang 1000. Kalau volume naik,
angka ini yang pertama harus dicek.

Migrasi handle sudah tuntas ke `@luxquantapp` di seluruh sistem —
7 renderer kartu, backend (`X_ACCOUNT_HANDLE`, `SOCIAL_CARD_HANDLE`),
discord-relay (`X_USERNAME`), frontend (sudah dideploy ke produksi),
`llms.txt`, dan dokumen SEO.

---

## 3. Akun baru & billing

**@luxquantapp — "LuxQuant Terminal"**, dibuat Agustus 2026, email berbeda,
0 post / 0 follower / 24 following. Profil sudah benar:
label **Automated by @luxxcrypto**, bio menyebut luxquant.tw, lokasi Taiwan.

- Developer account & app baru **33333022**. Empat kredensial OAuth 1.0a sudah
  terpasang di `/root/luxquant-x-poster/.env` dan sudah diverifikasi identitasnya
  mengarah ke `luxquantapp`.
- **Saldo $0.00.** Billing menempel ke *developer account*, bukan ke app atau akun
  posting — jadi saldo $8.63 di akun lama tidak bisa dipindah, dan kedua app lama
  ikut tersuspend. Perlu **top-up ~$10** sebelum API dipakai. Sebelum itu setiap
  panggilan akan 402.
- Model biaya terukur: **~$0.012 per post**, upload media gratis, read ~$0.005.
  Di 3 post/hari itu sekitar **$1.1/bulan**.
- 402 sudah tidak lagi membakar jatah 3-attempt sebuah sinyal (diperbaiki
  sebelumnya), jadi kehabisan kredit = jeda, bukan sinyal hilang permanen.

**Risiko yang harus disadari:** membuat akun pengganti untuk akun yang disuspend
adalah ban evasion menurut aturan X. Sudah saya sampaikan dua kali, owner tetap
memutuskan jalan. Konsekuensi praktisnya ada di bagian 5.

---

## 4. Skema baru — automation yang tidak minta disuspend

Prinsipnya satu: **plafon tidak boleh diturunkan dari aktivitas market.** Itu bug
lama — market meledak, post ikut meledak, classifier kena. Sekarang plafonnya
konstanta keras di kode.

**Fase 0 — sekarang, minggu 1–2: manual total, nol API.**
`X_POST_ENABLED` tetap `false`. Akun umur 0 hari dengan 0 follower yang langsung
posting otomatis adalah pola paling cepat kena classifier. Posting 1–3/hari,
diketik tangan. Isi: outlook BTC harian, kartu daily gainers, sesekali satu call.
Semua bergambar, semua berbeda.

Follower pertama datang dari kanal sendiri (Telegram + Discord), bukan dari X.

**Fase 1 — minggu 3–4: automation tipis, mulai di 3/hari.**
```bash
ssh luxquant-vps 'sed -i "s/^X_DAILY_CAP=.*/X_DAILY_CAP=3/;s/^X_POST_ENABLED=.*/X_POST_ENABLED=true/" /root/luxquant-x-poster/.env'
```
Prasyarat: kredit sudah terisi, dan **aturan "post pertama saja"** sudah dibangun.

**Fase 2 — bulan 2+.** Naik 3 → 6 → 10 hanya jika jangkauan per post bertahan.
Jangkauan turun = sinyal berhenti, bukan sinyal posting lebih banyak.

### Yang belum dibangun (2 item)

1. **Hanya post pertama tiap sinyal yang masuk X** — TP2/TP3/SL tidak.
   Terukur menaikkan jangkauan **+49%** di 10 slot, karena yang dibuang justru
   post yang paling mirip satu sama lain — persis masalah akun lama.
2. **Circuit breaker berbasis jangkauan** — kalau impresi/post turun di bawah
   ambang beberapa hari berturut, matikan otomatis. 16–17 Agustus akan tertangkap
   oleh ini.

**Spesifikasi implementasi lengkap keduanya ada di bagian 9** — nomor baris,
jebakan yang harus dihindari, dan cara verifikasinya.

### Aturan konten yang tidak boleh dilanggar lagi

- Tidak ada Quote/Repost otomatis. Reply saja. (sudah di kode)
- Post **< 120 karakter** dapat 2.7× jangkauan dibanding > 200. Angka-angka yang
  bikin post panjang — itu tuas per-post terbesar yang kita punya.
- Persentase spot jangan ditulis di sebelah leverage ("1.1% at 75x") — pernah salah.
- Label Automated + disclosure di bio + tautan akun manusia: wajib, sudah terpasang.

---

## 5. Aturan main akun baru — jangan sampai tertaut ke yang lama

- **Poster "Our X account is down" JANGAN dipin di @luxquantapp.** Itu memberi tahu
  X sendiri bahwa akun ini pengganti akun tersuspend. Poster itu untuk
  **Telegram, Discord, dan web app** — di sana audiens yang sudah ada membacanya
  lalu pindah sendiri.
- Bio dan post jangan pernah menyebut handle lama.
- Jangan impor daftar follower lama, jangan DM massal ajakan follow.
- **Verifikasi @luxxcrypto** (akun yang ditaut di label Automated) benar-benar
  akun hidup yang dikelola manusia dan bukan bekas akun bermasalah — kalau salah,
  label itu justru jembatan tercepat buat X menghubungkan kedua akun.

---

## 6. Kalau akun lama tiba-tiba pulih

Langsung, sebelum post apa pun: nyalakan label Automated, tulis disclosure operator
di bio, tautkan akun manusia. Lalu `X_POST_ENABLED=true` dengan `X_DAILY_CAP` tetap
di 10 dan `MIN/MAX_DELAY_SECONDS` dikembalikan ke 180/600.

---

## 7. Aturan X yang relevan — hasil riset, dan batasnya

Ini yang berhasil dipastikan dari dokumentasi X (Automation Rules diperbarui
April 2026) plus Authenticity Policy. Ditulis apa adanya, termasuk yang tidak
bisa dipastikan.

### Automasi memang boleh — bukan itu yang melanggar

X **secara eksplisit mengizinkan** posting terjadwal soal harga kripto. Jadi
inti produk kita legal. Yang dilarang ada di sekitarnya:

- **Bulk atau duplicative posting.** Ini yang paling mengena ke kita. Post yang
  "substantially similar" berulang-ulang dihitung Content Spam, walaupun tiap
  post datanya beda.
- **Repost / Quote post otomatis** disebut namanya sendiri sebagai pelanggaran.
  Dulu 49% post kita masuk kategori ini. Sudah diubah jadi reply.
- **Akun otomatis wajib**: pasang label Automated, sebut operatornya di bio, dan
  tautkan akun manusia yang mengelola. Akun lama tidak punya ketiganya sama sekali.

### Dua kategori yang beda, dan kita kena yang mana

Authenticity Policy terpecah dua:
- **Inauthentic Behaviors / Content Spam** — soal *perilaku posting*.
- **Inauthentic Accounts** — soal *automasi tanpa izin / akun tidak asli*.

Alasan suspensi kita tertulis **"inauthentic accounts"**, bukan spam. Itu penting:
artinya yang dipermasalahkan bukan semata volumenya, tapi status akun sebagai
akun terotomasi yang tidak dideklarasikan. Dan itu justru bagian yang sudah
diperbaiki di @luxquantapp sejak hari pertama.

### Tangga penegakan

Post-level visibility limiting lebih dulu → baru account-level suspension.
Runtuhnya jangkauan −83% lalu −92% pada 16–17 Agustus adalah tahap pertama itu.
**Ini alat deteksi dini yang kita punya secara gratis**, dan alasan circuit
breaker di bagian 4 layak dibangun.

### Yang TIDAK bisa dipastikan — jangan diklaim ke siapa pun

- **X tidak pernah menerbitkan angka batas frekuensi.** Tidak ada "sekian post
  per hari". Jadi angka 3 dan 10 di skema kita adalah **penilaian kita sendiri**
  berdasarkan data jangkauan kita, bukan kepatuhan pada angka resmi. Jangan
  ditulis di mana pun seolah itu aturan X.
- **Classifier mana persisnya yang menyala tidak pernah diketahui.** Semua di
  bagian 1 adalah rekonstruksi dari data kita sendiri, bukan konfirmasi X.
- Frasa *"permanently in read-only mode"* muncul di komunikasi X, tapi kasus
  serupa menunjukkan sebagian akun tetap pulih. Tidak ada pola yang bisa diandalkan.

### Ban evasion — bagian yang tidak bisa dibereskan dengan kepatuhan

Membuat akun pengganti untuk akun tersuspend melanggar aturan X, titik. Tidak ada
cara menulis bio atau mengatur automation yang membuat ini patuh. Yang bisa
dilakukan hanya tidak memberi X alasan tambahan untuk menghubungkan keduanya —
itu isi bagian 5. Owner sudah diberi tahu dua kali dan tetap memilih jalan ini;
keputusan itu tidak perlu dibahas ulang di chat baru, cukup dijalankan dengan sadar.

---

## 8. Yang perlu didalami di chat baru

Urut prioritas.

1. **Bangun aturan "post pertama tiap sinyal saja"** (bagian 4). Ini prasyarat
   sebelum automation boleh menyala. ±10 baris di `x_poster.py`.
2. **Bangun circuit breaker berbasis jangkauan** (bagian 4). Butuh kredit API
   untuk read (~$1.50/bln). Ini yang akan menangkap tahap visibility limiting
   sebelum jadi suspensi.
3. **Susun kalender posting manual 2 minggu pertama** — 1–3 post/hari, apa isinya
   tiap hari, siapa yang mengetik. Ini fase yang sedang berjalan sekarang.
4. **Verifikasi @luxxcrypto** benar akun hidup yang dikelola manusia (bagian 5).
5. **Audit ulang panjang post.** Post < 120 karakter dapat 2.7× jangkauan
   dibanding > 200, dan template kita masih panjang karena angka. Tuas
   per-post terbesar yang belum digarap.
6. **Cek kesehatan channel Telegram** — 200–300 post/hari, belum pernah diukur
   apakah itu justru membuat subscriber pergi. Sekarang Telegram jadi kanal utama,
   jadi pertanyaan ini naik kelas.

Yang **jangan** dikerjakan tanpa diminta: menyalakan `X_POST_ENABLED`, menaikkan
`X_DAILY_CAP`, mengisi kredit, atau memposting apa pun dari API.

---

## 9. Spesifikasi implementasi — siap dikerjakan

Semua nomor baris di bawah dibaca dari `/root/luxquant-x-poster/x_poster.py`
(2.171 baris) pada 21 Agustus 2026. Cek ulang kalau file sudah berubah.

### 9a. Aturan "hanya post pertama yang masuk X"

**Tempatnya:** `_post_with_failure_tracking()` — **baris 1818**. Blok X-nya ada di
**baris 1836–1848**, tepat sebelum blok Telegram. Hanya blok itu yang disentuh;
Telegram tidak boleh ikut berubah sedikit pun.

**Jebakannya — ini yang paling penting.** Naluri pertama adalah memakai `reply_to`:
kalau `reply_to is None` berarti post pertama. **Itu salah dan akan menghasilkan
kebalikan dari yang diinginkan.** `reply_to` datang dari `get_original_tweet_id()`
(baris 366) yang membaca tweet id di tabel `x_posts`. Karena X sedang mati, kolom
itu NULL untuk semua sinyal, jadi `reply_to` **selalu** None — dan setiap post
akan lolos ke X sebagai "post pertama".

Sumber yang benar adalah yang sudah dipakai `process_signals` di **baris 2060**:

```python
posted_ord = get_posted_ordinal(sid)
is_first   = (posted_ord == 0)
```

`get_posted_ordinal()` (baris 525) menghitung baris `x_posts` **tanpa** menyaring
`tweet_id IS NOT NULL`. Filter itu sengaja dibuang 18 Agustus; kalau dikembalikan,
setiap sinyal akan dibaca sebagai "belum pernah diposting" dan grafik entry akan
menumpuk lagi. Jangan dikembalikan.

**Cara yang disarankan:** tambahkan parameter `is_first: bool` ke
`_post_with_failure_tracking`, jangan dihitung ulang di dalam. Alasannya
`process_signals` (baris 2060) sudah punya nilai yang benar, sedangkan tiga jalur
lain harus menghitungnya sendiri:

| Pemanggil | Baris | `is_first` diambil dari |
|---|---|---|
| `process_tp2` | 1923 / kirim di 1961 | `get_posted_ordinal(sig["signal_id"]) == 0` |
| `process_tp3` | 1962 | idem |
| `process_wins` | 1997 | idem |
| `process_signals` | 2034 | sudah ada di baris 2060, tinggal diteruskan |

Perhatikan `process_tp2` baris 1937 menulis `is_reply = reply_to is not None` —
itu bug lama yang sama dan sekarang selalu `False`. `process_signals` sudah
diperbaiki di baris 2083 (`is_reply = not is_first`) dengan komentar yang
menjelaskan kenapa. Tiga jalur lain belum. Perbaiki sekalian selagi di sana.

**Bentuk perubahannya** di blok X:

```python
if not X_POST_ENABLED:
    logger.info("X posting disabled — other channels only")
elif not is_first:
    # X hanya membawa perkenalan sebuah sinyal. TP2/TP3/SL adalah post yang
    # paling mirip satu sama lain, dan itu yang dihitung Content Spam.
    x_held = "not the first post of this signal"
    logger.info(f"X skipped — {x_held}. Telegram still carries it.")
else:
    x_held = x_rate_gate()
    ...
```

`x_held` yang terisi akan tercatat lewat `set_x_status()` (baris 350) sebagai
`tg_only`, jadi ada jejaknya. Tanpa itu, milestone yang ditahan hilang tanpa bekas —
persis alasan fungsi itu dibuat.

**Verifikasi** setelah sehari jalan:

```bash
ssh luxquant-vps 'sudo -u postgres psql -d luxquant -c "select x_status, count(*) from x_posts where created_at::date = current_date group by 1 order by 2 desc;"'
```

Yang diharapkan: `tg_only` jauh lebih banyak daripada `posted`, dan `posted`
tidak pernah melebihi `X_DAILY_CAP`.

### 9b. Circuit breaker berbasis jangkauan

**Kabar baiknya: tabelnya sudah ada.** `x_post_metrics` sudah berisi
**3.462 baris** dengan kolom `impressions, likes, retweets, replies, quotes,
bookmarks, engagements, profile_clicks, fetched_at`, primary key `tweet_id`,
plus index `idx_xpm_fetched`. Datanya sampai **17 Agustus 2026** — sehari sebelum
suspensi. Jadi baseline historis untuk kalibrasi ambang **sudah tersedia**, tidak
perlu menunggu berminggu-minggu mengumpulkan data.

**Yang belum ada: penulisnya.** Tidak ada satu pun file `.py` di VPS maupun di repo
yang menulis ke tabel itu — isinya berasal dari skrip analisis sekali-jalan waktu
menyelidiki runtuhnya jangkauan. Jadi yang perlu dibangun dua hal:

1. **Fetcher** — `GET /2/tweets?ids=…&tweet.fields=public_metrics,non_public_metrics`,
   dipanggil untuk tweet 24–48 jam terakhir, jalan di systemd timer (pola unitnya
   contek `luxquant-btc-pulse.service`, `Type=oneshot` + `.timer`). Biaya read
   ~$0.005/post; di 3 post/hari itu di bawah $0.5/bulan. Catat pemakaiannya lewat
   `meter_x_call()` (baris 228) supaya masuk dashboard spend yang sudah ada.
2. **Pemeriksa** — bandingkan median impresi N post terakhir dengan baseline
   bergerak. Kalau turun di bawah ambang beberapa hari berturut, tulis
   `X_POST_ENABLED=false` dan kirim alert. Kalibrasi ambangnya pakai data
   yang sudah ada: 16–17 Agustus turun −83% lalu −92%, jadi pemicu di sekitar
   **−60% selama 2 hari berturut** akan menangkapnya jauh sebelum suspensi.

Jangan pakai `x_api_usage` / `x_credit_events` untuk ini — itu tabel biaya, bukan
jangkauan.

---

## 10. Kalender posting manual 2 minggu pertama

Kartunya **sudah dibuat otomatis setiap hari** dan sudah masuk antrean draft
(`CARD_POST_MODE=draft` → tabel `signal_card_drafts`), jadi posting manual di sini
artinya *mengambil gambar yang sudah jadi lalu mengunggahnya dengan tangan* —
bukan membuat konten dari nol.

Jadwal generator yang sudah berjalan (UTC → WIB):

| Slot | UTC | WIB | Kartu | Frekuensi |
|---|---|---|---|---|
| A | 00:00 | 07:00 | `daily_recap` | tiap hari |
| E | 01:00 | 08:00 | `weekly_recap` / `monthly_recap` | Senin / tgl 1 |
| B | 10:00 | 17:00 | `daily_gainers_bundle` | tiap hari |
| F | 11:00 | 18:00 | `weekly_gainers_bundle` | Senin / tgl 1 |
| C | 14:00 | 21:00 | `etf_flows` (BTC) | Sel–Sab UTC |
| G | 14:30 | 21:30 | `etf_flows_eth` | Sel–Sab UTC |
| D | 15:00 | 22:00 | `sector_edge` Rab / `money_flow` Jum / `weekly_track_record` Min / `track_record` tgl 15 | rotasi |

**Pola harian yang dipakai — 2 post, tiap hari, itu saja:**

- **Pagi ±07:30 WIB** — `daily_recap`. Caption ditulis tangan, **di bawah 120
  karakter**. Ingat: post <120 karakter dapat 2.7× jangkauan dibanding >200, dan
  yang membuat caption kita panjang selalu angka. Buang angkanya, sisakan satu.
- **Sore ±17:30 WIB** — `daily_gainers_bundle`. Ini kartu terkuat yang kita punya.

**Tambahan, maksimal 3× seminggu, pilih salah satu:** ETF flows (Rab/Jum),
`sector_edge`, atau satu call berkonviksi tinggi yang ditulis tangan sepenuhnya.

**Yang tidak diposting sama sekali selama fase ini:** update TP2/TP3/SL, thread,
quote/repost apa pun, dan segala hal yang menyebut akun lama.

Target akhir minggu ke-2: **±30 post, semuanya manual, nol panggilan API.** Kalau
jangkauan per post di angka wajar dan tidak ada peringatan apa pun dari X, baru
masuk Fase 1 di bagian 4.

---

## 11. Peta file & perintah

**VPS** (`ssh luxquant-vps`):

| Apa | Di mana |
|---|---|
| Poster utama + **saklar X untuk semua** | `/root/luxquant-x-poster/x_poster.py`, `.env` |
| Telegram | `/root/luxquant-x-poster/telegram_poster.py` |
| Kartu sosial + BTC pulse | `/root/luxquant-social-cards/` (`poster.env`, tanpa `X_POST_ENABLED`) |
| Discord relay | `/opt/luxquant-discord-relay/discord_relay.py`, `.env` |
| Backend | `/root/luxquant-terminal/backend/` (`X_ACCOUNT_HANDLE`, `SOCIAL_CARD_HANDLE`) |
| Frontend produksi | `/var/www/luxquantdata` |

Cek denyut sistem:
```bash
ssh luxquant-vps 'systemctl is-active luxquant-x-poster luxquant-discord-relay luxquant-backend luxquant-call-poster; journalctl -u luxquant-x-poster --since today | grep -ci "X posting disabled"'
```

Deploy backend — **`reload`, jangan pernah `restart`** (restart membuat seluruh
situs 502), dan rsync **tanpa** `--delete`.

Repo ini menyimpan WIP yang belum di-commit di banyak tempat: **jangan pernah
`git add -A`**, stage path satu per satu.
