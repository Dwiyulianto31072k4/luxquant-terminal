// src/components/landing/v2/sections/ProofBar.jsx
// ════════════════════════════════════════════════════════════════
// ProofBar — strip angka tepat di bawah hero (pola MEXC: bukti
// nempel di atas). Pakai stats nyata dari /signals/analyze.
// Laurel emas FILLED + gradasi kiri-kanan tiap angka. Angka gede,
// bold, dengan gradasi emas halus (sesuai tema LuxQuant).
//
// Props:
//   stats → object dari useLandingData().stats (boleh null saat loading)
// ════════════════════════════════════════════════════════════════
import Laurel from "./Laurel";

const FIRST_SIGNAL = new Date("2023-12-27T13:25:00Z");
const daysRunning = Math.floor(
  (Date.now() - FIRST_SIGNAL.getTime()) / 86400000,
);

export default function ProofBar({ stats }) {
  const items = [
    {
      value: stats ? `${stats.win_rate?.toFixed(1)}%` : "—",
      label: "Verified Win Rate",
    },
    {
      value: stats ? (stats.total_signals ?? 0).toLocaleString() : "—",
      label: "Trades On Record",
    },
    {
      value: `${daysRunning.toLocaleString()}d`,
      label: "Running Since 2023",
    },
  ];

  return (
    <section className="relative z-10 max-w-5xl mx-auto px-4 lg:px-8 pb-6 lg:pb-10">
      <div className="grid grid-cols-3 gap-2 lg:gap-6">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-center justify-center gap-1.5 sm:gap-3 lg:gap-5"
          >
            <Laurel
              side="left"
              className="w-5 h-11 sm:w-6 sm:h-14 lg:w-7 lg:h-16 flex-shrink-0 drop-shadow-[0_0_10px_rgba(212,168,83,0.25)]"
            />
            <div className="text-center">
              {/* angka: gede + bold + gradasi emas halus (putih→emas) */}
              <p
                className="font-extrabold text-2xl sm:text-4xl lg:text-5xl leading-none tabular-nums bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, #ffffff 0%, #fbf3da 55%, #e7c980 100%)",
                }}
              >
                {it.value}
              </p>
              <p className="text-text-muted text-[9px] sm:text-[11px] lg:text-xs uppercase tracking-[0.14em] mt-2">
                {it.label}
              </p>
            </div>
            <Laurel
              side="right"
              className="w-5 h-11 sm:w-6 sm:h-14 lg:w-7 lg:h-16 flex-shrink-0 drop-shadow-[0_0_10px_rgba(212,168,83,0.25)]"
            />
          </div>
        ))}
      </div>
    </section>
  );
}