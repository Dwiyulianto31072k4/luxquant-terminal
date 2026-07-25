# Rancangan Standardisasi Warna & Multi-Tema — LuxQuant Terminal

> Dokumen perencanaan: dari warna hardcoded yang tersebar → sistem token tunggal →
> 3 mode warna (**Luxquant**, **Dark**, **Bright**).
> Pendamping: `AUDIT-WARNA-STANDARDISASI.md` (data temuan & peta fitur).

---

## 1. Tujuan & prinsip

**Tujuan.** Semua warna di aplikasi mengalir dari satu set token semantik, sehingga
(a) ganti/atur warna cukup di satu tempat, (b) tidak ada tabrakan/duplikasi, dan
(c) mode warna bisa ditambah hanya dengan satu blok nilai.

**Prinsip.**
- **Satu konsep = satu token.** Tidak ada lagi 5 versi "hitam".
- **Token berbasis fungsi**, bukan warna (`surface`, `accent`, `positive` — bukan `gold`, `black`).
- **Tema = data, bukan kode.** Nilai warna hidup di CSS, logika komponen tidak tahu-menahu soal tema.
- **Standardisasi = prasyarat multi-tema.** Warna yang belum ter-token tidak akan ikut ganti tema.
- **Luxquant sebagai baseline regresi.** Setelah tokenisasi, tampilan Luxquant harus identik dengan sekarang — itu bukti tidak ada yang rusak.

---

## 2. Arsitektur target

```
Primitive tokens        Semantic tokens            Konsumen
(nilai mentah)          (peran/fungsi)             (komponen)
--lux-black-900: 10 5 6 →  --surface ────────────→ bg-surface, text-surface, ...
--lux-gold-500: 212 168 83 → --accent ───────────→ text-accent, border-accent, ...
                           --positive ───────────→ text-positive, bg-positive/10
```

Tiga lapis:
1. **Primitive** — palet mentah (didefinisikan sekali, tidak dipakai langsung di komponen).
2. **Semantic** — memetakan primitive ke peran; **inilah yang berubah antar tema**.
3. **Konsumen** — komponen hanya memakai token semantic lewat class Tailwind.

**Mekanisme tema:** atribut `data-theme` di `<html>`. CSS mendefinisikan nilai
semantic per tema. Ganti atribut → seluruh UI ikut. Persistensi via `localStorage`,
plus script anti-flash (set tema sebelum render pertama).

**Catatan teknis wajib:** simpan nilai sebagai **channel RGB** (`--surface: 10 5 6;`)
dan token Tailwind sebagai `rgb(var(--surface) / <alpha-value>)`, agar modifier
opacity (`/70`, `/40`) yang dipakai luas tetap berfungsi.

---

## 3. Token semantik final

| Token | Fungsi | Luxquant | Dark | Bright |
|---|---|---|---|---|
| `surface` | bg halaman | `10 5 6` | `14 14 16` | `250 250 250` |
| `surface-raised` | card/panel/modal | `10 8 5` | `24 24 27` | `255 255 255` |
| `surface-hover` | hover baris/card | `30 12 15` | `39 39 42` | `241 241 244` |
| `border` | garis default | `255 255 255 /.06` | `255 255 255 /.09` | `20 20 20 /.10` |
| `border-accent` | garis emas | `212 168 83 /.30` | `212 168 83 /.30` | `212 168 83 /.45` |
| `text` | teks utama | `255 255 255` | `244 244 245` | `20 20 20` |
| `text-secondary` | teks sekunder | `184 168 154` | `161 161 170` | `82 82 91` |
| `text-muted` | teks redup | `165 149 133` | `113 113 122` | `120 120 130` |
| `accent` | emas brand | `212 168 83` | `212 168 83` | `176 137 60` |
| `accent-light` | emas terang | `240 216 144` | `240 216 144` | `201 162 39` |
| `accent-dark` | emas gelap | `139 105 20` | `139 105 20` | `139 105 20` |
| `positive` | profit/naik | `74 222 128` | `74 222 128` | `22 163 74` |
| `negative` | loss/turun | `248 113 113` | `248 113 113` | `220 38 38` |
| `warning` | peringatan | `251 191 36` | `251 191 36` | `202 138 4` |
| `brand-telegram` | ikon Telegram (fixed) | `0 136 204` | `0 136 204` | `0 136 204` |

> Nilai Dark & Bright di atas adalah titik awal — akan dikalibrasi di M3 & M9.

---

## 4. Milestone lengkap

Effort: S (≤0.5 hari) · M (1–2 hari) · L (3–5 hari) · XL (>1 minggu). Estimasi relatif, 1 dev.

| ID | Milestone | Output | Kriteria selesai (DoD) | Effort | Depends |
|---|---|---|---|---|---|
| **M0** | Baseline & branch | Branch `feat/theming`; screenshot baseline halaman kunci (home, markets, ai-arena, signals, landing, admin) | Baseline visual tersimpan sebagai acuan regresi | S | — |
| **M1** | Fondasi token | `tailwind.config.js` + `index.css` disatukan; primitive + semantic token (channel RGB) | Build sukses; Luxquant **pixel-identik** dgn baseline; token lama (`bg-bg-primary`, dll) tetap jalan | M | M0 |
| **M2** | Infra tema | `ThemeContext` + `localStorage` + `data-theme` + script anti-flash + toggle 3-arah di header/profile | Ganti tema live tanpa reload; pilihan persist; tidak ada flash saat load | M | M1 |
| **M3** | Mode **Dark** | Blok `[data-theme="dark"]` terkalibrasi + QA | Semua halaman token-based tampil rapi di Dark; kontras teks ≥ WCAG AA | M | M2 |
| **M4** | Standardisasi shared | `ui/Modal`, `SignalModal`, `coinIntelShared`, `vizShared`, `_ui`, `_shared` → token | 0 hex hardcoded di file shared; visual Luxquant identik | M | M1 |
| **M5** | Codemod global | Script `codemod-colors.js` untuk klaster surface + semantic; dijalankan per folder | ~60–70% hex mekanis tergantikan; diff direview & commit bertahap | L | M1, M4 |
| **M6** | Page berat (🔴) | AI Arena v6, Markets, Bitcoin, Autotrade, Journal, Terminal, Landing, Admin → token + sapuan manual (gradient/rgba) | Tiap page: 0 hex liar; Luxquant identik; lolos di Dark | XL | M5 |
| **M7** | Page sedang/ringan (🟡🟢) | Sisa page & modal → token | Semua page bebas hex liar | L | M5 |
| **M8** | Pagar (lint) | Rule ESLint/Stylelint tolak `[#hex]` di className + CI check | PR dengan warna arbitrer gagal CI | S | M6, M7 |
| **M9** | Mode **Bright** | Nilai light terkalibrasi + QA kontras per halaman; un-hide toggle | Semua halaman kontras ≥ WCAG AA; tidak ada elemen "belang" gelap | L | M6, M7 |
| **M10** | Rilis & cleanup | Hapus definisi warna ganda; hapus/arsip landing `/v1` bila mati; dokumentasi token | Satu sumber warna; README token; changelog | S | M8, M9 |

**Jalur kritis:** M0 → M1 → M2 → M3 (Dark nyala). Bright (M9) menunggu tokenisasi
tuntas (M6+M7). Selama itu, toggle Bright disembunyikan / ditandai *beta*.

---

## 5. Fase rilis (bukan sekali besar)

- **Rilis 1 — "Dark tersedia".** M0–M3 + M4. Luxquant + Dark aktif; Bright hidden.
  Nilai: fitur baru cepat sampai ke user, risiko kecil (semua gelap).
- **Rilis 2 — "Tokenisasi tuntas".** M5–M8. Tidak terlihat user, tapi codebase bersih
  & terkunci lint. Fondasi Bright siap.
- **Rilis 3 — "Bright tersedia".** M9–M10. Light mode dibuka setelah semua halaman
  lolos kontras.

---

## 6. Workflow standardisasi per halaman (loop M6/M7)

1. Buka satu area (mis. `SignalModal.jsx`).
2. Jalankan codemod → tangkap hex mekanis (klaster surface/semantic).
3. Sapu manual: gradient, `rgba()` inline, warna di luar klaster → token terdekat.
4. `npm run dev` → bandingkan halaman itu dengan screenshot baseline (Luxquant wajib identik).
5. Cek cepat di Dark → tidak ada elemen nyangkut gelap/terang.
6. `git commit` kecil per area (mudah rollback).

---

## 7. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Codemod salah ganti (mis. hex di chart lib yang memang harus fixed) | Warna data chart berubah | Whitelist file/nilai yang dikecualikan; review diff per folder |
| Modifier opacity rusak (`/40`) | Transparansi hilang | Pakai channel RGB + `<alpha-value>` (M1); uji di M4 |
| Flash tema saat load | UX jelek | Script anti-flash inline di `index.html` (M2) |
| Bright bikin teks tak terbaca | Aksesibilitas | Kalibrasi nilai + audit kontras WCAG AA per halaman (M9) |
| Halaman belum ter-token → belang di Bright | Tampilan rusak | Bright hidden sampai M6+M7 selesai |
| Regresi diam-diam di Luxquant | Tampilan berubah tak sengaja | Baseline screenshot (M0) + commit kecil + review |

---

## 8. Guardrail jangka panjang (M8)

- **ESLint/Stylelint:** tolak `className` yang mengandung `[#...]` atau `rgb(`/`rgba(` literal.
- **CI check:** `grep` gagal-kan build bila ada hex baru di `src` di luar file token.
- **Konvensi PR:** warna baru = tambah token dulu, baru dipakai.

---

## 9. Definition of Done (keseluruhan)

- `src/**/*.jsx` bebas warna hex/rgba arbitrer (kecuali file token & whitelist chart).
- Warna terdefinisi **sekali** (tidak ada duplikasi config vs CSS).
- Tiga tema berfungsi live, persist, tanpa flash.
- Semua halaman lolos kontras WCAG AA di ketiga tema.
- Lint memblok warna liar; dokumentasi token tersedia.

---

## 10. Langkah pertama yang konkret

M0 + M1 bisa dimulai sekarang: bikin branch, simpan baseline, lalu satukan
`tailwind.config.js` + `index.css` ke sistem token. Setelah M1 lolos (Luxquant
identik), M2–M3 membuat Dark nyala dalam waktu singkat.
