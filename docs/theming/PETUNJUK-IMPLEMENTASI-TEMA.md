# Petunjuk Implementasi: Standardisasi Warna + 3 Mode Tema
### LuxQuant Terminal — panduan siap-eksekusi (bisa dipakai di sesi Claude / Claude Code lain)

> Dokumen ini merangkum **best practice lintas platform** (Tailwind, shadcn/Radix,
> Material Design 3, W3C Design Tokens, WCAG) lalu menerjemahkannya jadi langkah
> konkret untuk stack **React + Tailwind** LuxQuant.
> Baca bareng: `AUDIT-WARNA-STANDARDISASI.md` (data) & `RANCANGAN-STANDARDISASI-WARNA-MULTITEMA.md` (milestone).

---

## A. Ringkasan best practice (hasil riset)

**1. Arsitektur token 3 lapis** — konsensus semua design system besar (Material 3, W3C DTCG, panduan token modern):
- **Primitive** = nilai mentah ("apa warnanya"): `--lux-gold-500: 212 168 83`.
- **Semantic** = peran/makna ("untuk apa"): `--accent`, `--surface`, `--positive`. **Lapis inilah yang berubah antar tema.**
- **Component** (opsional) = keputusan lokal: `--button-bg`. Component → **selalu** rujuk semantic, tidak pernah primitive langsung.

**2. Penamaan berbasis fungsi, bukan warna.** Material 3 & panduan token menegaskan: hindari `blue-100`/`dark-red`; pakai `color-error-text`, `surface`, `accent`. Nama harus self-documenting.

**3. Pola "surface + foreground pair"** (shadcn/ui). Tiap surface punya pasangan teksnya: `surface`/`surface-foreground`, `accent`/`accent-foreground`. Ini menjamin kontras teks-vs-latar konsisten di semua tema — sangat relevan untuk mode Bright.

**4. Tema lewat CSS variable + `data-theme`, bukan `dark:` per elemen** (Tailwind v3/v4). Komponen memakai satu token; nilai di-override per selektor tema. Tak perlu tulis varian `dark:` di ribuan tempat. Ganti tema = ganti class → tidak memicu re-render React.

**5. Channel RGB + `<alpha-value>` wajib** agar modifier opacity (`/70`, `/40`) tetap jalan:
```js
accent: "rgb(var(--accent) / <alpha-value>)"   // di config
--accent: 212 168 83;                          // di CSS (channel, bukan hex)
```

**6. Simpan nilai per-tema, jangan dicampur** (WCAG guidance). Setiap tema punya blok nilainya sendiri; jangan berbagi nilai antar tema yang bisa bikin kontras jeblok.

**7. Anti-flash (FOUC)** — script blocking kecil di `<head>` `index.html` yang set `data-theme` **sebelum** render pertama. Tidak dikompilasi Babel → pakai JS sederhana; bungkus `localStorage` dengan try-catch.

**8. Kontras WCAG 2.2 AA berlaku untuk SEMUA tema** — 4.5:1 teks normal, 3:1 teks besar (≥18.66px / 14px bold) & komponen UI/border. Mode Bright **tidak** otomatis lolos; harus diuji terpisah.

---

## B. Prinsip yang diadopsi untuk LuxQuant

- 3 lapis token: primitive → semantic → komponen (via Tailwind class).
- Nama semantic fungsional (lihat token final di `RANCANGAN-...md` §3).
- Nilai channel RGB + `<alpha-value>`.
- `data-theme="luxquant|dark|bright"` di `<html>`.
- Luxquant = baseline; setelah tokenisasi harus **pixel-identik** dgn versi sekarang.
- Bright disembunyikan sampai tokenisasi tuntas & lolos kontras.

---

## C. Implementasi konkret (copy-paste ready)

### C1. `tailwind.config.js` — token → CSS var
```js
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: {
    surface:        { DEFAULT: withAlpha("--surface"),
                      raised: withAlpha("--surface-raised"),
                      hover:  withAlpha("--surface-hover") },
    border:         { DEFAULT: withAlpha("--border"),
                      accent: withAlpha("--border-accent") },
    text:           { DEFAULT: withAlpha("--text"),
                      secondary: withAlpha("--text-secondary"),
                      muted: withAlpha("--text-muted") },
    accent:         { DEFAULT: withAlpha("--accent"),
                      light: withAlpha("--accent-light"),
                      dark:  withAlpha("--accent-dark") },
    positive:       withAlpha("--positive"),
    negative:       withAlpha("--negative"),
    warning:        withAlpha("--warning"),
    "brand-telegram": withAlpha("--brand-telegram"),
  }}},
};
```
> Kompatibilitas: token lama (`bg-primary`, `gold-primary`) boleh dipertahankan sbg
> alias sementara agar file yang belum dimigrasi tidak pecah, lalu dihapus di M10.

### C2. `index.css` — primitive + semantic + blok tema
```css
@layer base {
  :root {
    /* PRIMITIVE (nilai mentah, channel RGB) */
    --lux-black-900: 10 5 6;   --lux-black-850: 10 8 5;
    --lux-gold-500: 212 168 83; --lux-gold-300: 240 216 144; --lux-gold-700: 139 105 20;
    --green-400: 74 222 128;   --red-400: 248 113 113; --amber-400: 251 191 36;
    --tg: 0 136 204;
  }
  /* SEMANTIC per tema */
  [data-theme="luxquant"] {
    --surface: 10 5 6; --surface-raised: 10 8 5; --surface-hover: 30 12 15;
    --border: 255 255 255; --border-accent: var(--lux-gold-500);
    --text: 255 255 255; --text-secondary: 184 168 154; --text-muted: 165 149 133;
    --accent: var(--lux-gold-500); --accent-light: var(--lux-gold-300); --accent-dark: var(--lux-gold-700);
    --positive: var(--green-400); --negative: var(--red-400); --warning: var(--amber-400);
    --brand-telegram: var(--tg);
  }
  [data-theme="dark"] {
    --surface: 14 14 16; --surface-raised: 24 24 27; --surface-hover: 39 39 42;
    --border: 255 255 255; --border-accent: var(--lux-gold-500);
    --text: 244 244 245; --text-secondary: 161 161 170; --text-muted: 113 113 122;
    --accent: var(--lux-gold-500); --accent-light: var(--lux-gold-300); --accent-dark: var(--lux-gold-700);
    --positive: var(--green-400); --negative: var(--red-400); --warning: var(--amber-400);
    --brand-telegram: var(--tg);
  }
  [data-theme="bright"] {
    --surface: 250 250 250; --surface-raised: 255 255 255; --surface-hover: 241 241 244;
    --border: 20 20 20; --border-accent: 176 137 60;
    --text: 20 20 20; --text-secondary: 82 82 91; --text-muted: 120 120 130;
    --accent: 176 137 60; --accent-light: 201 162 39; --accent-dark: 139 105 20;
    --positive: 22 163 74; --negative: 220 38 38; --warning: 202 138 4;
    --brand-telegram: var(--tg);
  }
  body { background: rgb(var(--surface)); color: rgb(var(--text)); }
}
```
> Catatan: `--border`/`--text` dipakai dgn opacity (`border-border/10`) → simpan sbg
> channel lalu atur alpha di class. Contoh Luxquant border tipis: `border-white/[.06]`
> jadi `border-border/[.06]`.

### C3. Anti-flash — di `index.html` `<head>`, PALING ATAS
```html
<script>
  (function () {
    try {
      var t = localStorage.getItem("theme");
      var ok = ["luxquant","dark","bright"];
      document.documentElement.dataset.theme = ok.indexOf(t) > -1 ? t : "luxquant";
    } catch (e) { document.documentElement.dataset.theme = "luxquant"; }
  })();
</script>
```

### C4. `ThemeContext` (React)
```jsx
import { createContext, useContext, useEffect, useState } from "react";
const ThemeCtx = createContext(null);
const THEMES = ["luxquant", "dark", "bright"];
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem("theme"); return THEMES.includes(t) ? t : "luxquant"; }
    catch { return "luxquant"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
```
Bungkus di root (mis. dekat `AuthProvider` di `App.jsx`). Toggle 3-arah tinggal panggil `setTheme`.
> Sembunyikan opsi "bright" sampai tokenisasi tuntas (feature flag sederhana).

### C5. Guardrail ESLint (M8)
Larang warna hex arbitrer di `className`:
```js
// eslint rule: no-restricted-syntax pada JSXAttribute className
// regex terlarang di value: /\[#([0-9a-fA-F]{3,8})\]/  dan  /\b(rgba?)\(/
```
Atau langkah cepat: skrip CI `grep -rEn "\[#[0-9a-fA-F]{3,8}\]" src/ && exit 1`.

### C6. Codemod (M5) — pendekatan
Node script yang baca `src/**/*.jsx`, ganti berdasar tabel mapping (`AUDIT-...md` §4):
`bg-[#0a0805]`→`bg-surface-raised`, `text-[#4ade80]`→`text-positive`, dst.
Jalankan **per folder**, review `git diff`, commit kecil. Kecualikan file chart/lib
yang warnanya memang harus fixed (whitelist).

---

## D. Aturan kontras (wajib dicek tiap tema, terutama Bright)

| Elemen | Rasio minimum (WCAG 2.2 AA) |
|---|---|
| Teks normal | 4.5 : 1 |
| Teks besar (≥18.66px / 14px bold) | 3 : 1 |
| Komponen UI & border | 3 : 1 |

Uji `text` vs `surface`, `text` vs `surface-raised`, `accent` vs `surface`,
`positive`/`negative` vs latarnya. Perbaiki nilai token, **bukan** override lokal.

---

## E. Prompt siap-tempel untuk Claude/Claude Code lain

> **Tugas:** Standardisasi warna & tambahkan 3 mode tema (luxquant/dark/bright) di
> `frontend-react`. Ikuti `RANCANGAN-STANDARDISASI-WARNA-MULTITEMA.md` (milestone
> M0–M10) dan `PETUNJUK-IMPLEMENTASI-TEMA.md` (§C pola implementasi, §D kontras).
>
> **Kerjakan berurutan, commit kecil per milestone:**
> 1. M0: buat branch `feat/theming`, simpan screenshot baseline halaman kunci.
> 2. M1: terapkan §C1 (config) + §C2 (index.css). Pertahankan token lama sbg alias.
>    **Syarat lolos: tampilan Luxquant identik dgn baseline, build sukses.**
> 3. M2: §C3 (anti-flash) + §C4 (ThemeContext) + toggle 3-arah. Sembunyikan opsi Bright.
> 4. M3: kalibrasi & QA mode Dark.
> 5. M4: tokenisasi file shared (`ui/Modal`, `SignalModal`, `coinIntelShared`, `vizShared`, `_ui`, `_shared`).
> 6. M5: buat & jalankan codemod (§C6) per folder; review diff.
> 7. M6–M7: tokenisasi page berat→ringan (urutan severity di `AUDIT-...md` §5).
> 8. M8: pasang guardrail lint (§C5).
> 9. M9: kalibrasi mode Bright + audit kontras (§D) per halaman, lalu un-hide toggle.
> 10. M10: hapus definisi warna ganda & alias lama; tulis README token.
>
> **Aturan mutlak:** komponen hanya pakai token semantic; jangan tulis hex/rgba baru;
> Luxquant harus tetap identik; tiap tema lolos WCAG AA.

---

## Referensi (best practice)

- Tailwind — Dark mode & CSS variables: https://tailwindcss.com/docs/dark-mode , https://tailwindcss.com/docs/customizing-colors
- shadcn/ui — Theming & semantic colors: https://ui.shadcn.com/docs/theming , https://www.shadcndesign.com/blog/how-semantic-colors-work-in-shadcn-ui
- Material Design 3 — Color roles & design tokens: https://m3.material.io/styles/color/roles , https://m3.material.io/foundations/design-tokens/overview
- Token layering (primitive/semantic/component): https://colorarchive.org/guides/color-token-naming-guide/
- Anti-flash React theme: https://dev.to/gaisdav/how-to-prevent-theme-flash-in-a-react-instant-dark-mode-switching-o20
- WCAG 2.2 kontras & tema: https://accessibility-test.org/blog/support/advanced-guides/color-contrast-in-wcag-2-2-testing-and-fixes-that-actually-work/ , https://dev.to/beefedai/designing-accessible-color-systems-and-ensuring-contrast-across-themes-2i43
