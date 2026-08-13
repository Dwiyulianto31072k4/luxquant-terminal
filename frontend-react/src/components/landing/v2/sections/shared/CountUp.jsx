// src/components/landing/v2/sections/shared/CountUp.jsx
// ════════════════════════════════════════════════════════════════
// Angka yang berjalan naik saat section-nya pertama terlihat.
//
// Tiga hal yang membuat versi naif salah, dan ditangani di sini:
//
//   1. DATA DATANG BELAKANGAN. Angka di landing berasal dari fetch, jadi saat
//      section terlihat nilainya masih null. Animasi hanya dimulai ketika
//      section terlihat DAN nilainya sudah ada — kalau tidak, ia menghitung
//      naik menuju 0 lalu melompat ke angka asli.
//   2. LEBAR TEKS BERUBAH TIAP FRAME. "8.4%" lebih sempit dari "85.6%", jadi
//      elemen di sebelahnya bergeser-geser selama animasi. `tabular-nums`
//      mengunci lebar tiap digit, dan `minWidth` dari nilai akhir menahan
//      kotaknya.
//   3. prefers-reduced-motion. Yang memilih diam langsung mendapat nilai
//      akhirnya, tanpa animasi sama sekali.
//
// Easing-nya ease-out kubik: cepat di awal, melambat mendekati nilai akhir —
// gerak yang terasa "mendarat", bukan berhenti mendadak.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

const DURATION = 900;

export function useCountUp(target, active, { decimals = 1 } = {}) {
  const [value, setValue] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || target == null || startedRef.current) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setValue(target);
      startedRef.current = true;
      return undefined;
    }

    startedRef.current = true;
    const from = 0;
    const delta = target - from;
    let raf = 0;
    const t0 = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out kubik
      setValue(from + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);

  if (target == null) return null;
  // Sebelum animasi dimulai, tampilkan NILAI AKHIR — bukan 0.
  //
  // Versi pertama mengembalikan 0 saat belum aktif, jadi section yang belum
  // di-scroll menampilkan "0.0%" — angka palsu yang terbaca seperti angka
  // asli. Itu kesalahan yang lebih buruk daripada tidak ada animasi: pembaca
  // (atau mesin pengindeks) bisa membacanya sebagai fakta.
  if (value == null) return target;
  return Number(value.toFixed(decimals));
}

/**
 * @param {number|null} value   nilai akhir
 * @param {boolean}     active  section sudah terlihat?
 * @param {string}      suffix  mis. "%"
 */
export default function CountUp({
  value,
  active,
  decimals = 1,
  suffix = "",
  prefix = "",
  className = "",
  placeholder = "—",
}) {
  const shown = useCountUp(value, active, { decimals });

  if (value == null || shown == null) return <span className={className}>{placeholder}</span>;

  // Kunci lebar ke nilai AKHIR supaya tetangganya tidak bergeser tiap frame.
  const final = `${prefix}${value.toFixed(decimals)}${suffix}`;

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: "tabular-nums", minWidth: `${final.length}ch`, display: "inline-block" }}
    >
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
