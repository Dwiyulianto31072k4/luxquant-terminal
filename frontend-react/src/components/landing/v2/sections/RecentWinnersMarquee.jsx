// src/components/landing/v2/sections/RecentWinnersMarquee.jsx
// ════════════════════════════════════════════════════════════════
// RecentWinnersMarquee — "money parade" tepat di bawah Hero.
//
// Peran storyline: ubah janji hero jadi BUKTI EMOSIONAL yang bergerak.
// Kartu PnL (_with_card) auto-scroll ke kanan, tanpa border, dengan
// gradasi warna tema di 4 sisi biar kartu terasa "menyatu" ke halaman.
// Tiap kartu punya caption dinamis (spot vs leverage vs peak) — sebuah
// open-loop + FOMO yang narik user scroll ke section berikutnya.
//
// Data: `gainers` dari useLandingData (/signals/top-performers) yang kini
// membawa latest_chart_url + pnl_leverage + realized_pct. Kartu PnL =
// deriveChartWithCard(latest_chart_url) → varian _with_card.png.
// Klik kartu → SignalDetailModal (reuse, sama seperti TopGainers/prod).
//
// Props: gainers (array)
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../../../CoinLogo";
import { SignalDetailModal } from "../../../TopPerformers";

// Sama persis dgn TopPerformers/SignalModal: hanya chart TP2/3/4 yang punya
// varian kartu PnL. Kalau bukan, kembalikan null → winner di-skip.
const deriveChartWithCard = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!/_tp[234]_/i.test(rawUrl)) return null;
  if (/_with_card|_combined/i.test(rawUrl)) return null;
  return rawUrl.replace(/\.png$/i, "_with_card.png");
};

const cleanPair = (p) => (p || "").replace(/USDT$/i, "").replace(/^3A/i, "");

const fmtInt = (n) => {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.round(Number(n)).toLocaleString("en-US");
};

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

export default function RecentWinnersMarquee({ gainers = [] }) {
  const { t } = useTranslation();

  // Only winners that actually have a PnL card, ranked by biggest peak gain.
  const winners = useMemo(() => {
    const seen = new Set();
    return (gainers || [])
      .map((g) => ({ ...g, cardImg: deriveChartWithCard(g.latest_chart_url) }))
      .filter((g) => g.cardImg && g.signal_id && !seen.has(g.pair) && seen.add(g.pair))
      .sort((a, b) => (b.gain_pct || 0) - (a.gain_pct || 0))
      .slice(0, 12);
  }, [gainers]);

  // ── proof modal (reuse SignalDetailModal, sama seperti TopGainers) ──
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalSignalIds, setModalSignalIds] = useState([]);
  const [modalIndex, setModalIndex] = useState(0);

  const fetchDetail = useCallback(async (sid) => {
    setDetailLoading(true);
    setSignalDetail(null);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`/api/v1/signals/detail/${sid}`, { headers });
      if (r.ok) setSignalDetail(await r.json());
    } catch (e) {
      console.warn("[RecentWinners] detail fetch failed:", e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleClick = useCallback(
    (item) => {
      if (!item?.signal_id) return;
      const ids =
        item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
      const bi = ids.indexOf(item.signal_id);
      setModalSignalIds(ids);
      setModalIndex(bi >= 0 ? bi : 0);
      setModalItem(item);
      setModalOpen(true);
      fetchDetail(item.signal_id);
    },
    [fetchDetail]
  );

  const goToSignal = useCallback(
    (i) => {
      if (i < 0 || i >= modalSignalIds.length) return;
      setModalIndex(i);
      fetchDetail(modalSignalIds[i]);
    },
    [modalSignalIds, fetchDetail]
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalSignalIds([]);
    setModalIndex(0);
    setModalItem(null);
    setSignalDetail(null);
  }, []);

  // Nothing to show yet → render nothing (never an empty/broken block).
  if (winners.length === 0) return null;

  // Duplicate the list so the horizontal loop is seamless.
  const track = [...winners, ...winners];

  return (
    <section className="relative z-10 py-10 sm:py-14">
      {/* Eyebrow + heading — short narrative hook */}
      <div className="mx-auto max-w-6xl px-5 text-center">
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-primary/80">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-primary/50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-primary/80" />
          </span>
          Recent winners · live proof
        </div>
        <h2 className="mt-3 text-2xl sm:text-3xl lg:text-[2.4rem] font-bold leading-tight tracking-tight text-white">
          Real calls. Real peaks.
        </h2>
        <p className="mt-2 text-sm text-white/55 max-w-xl mx-auto">
          Every card is an actual LuxQuant call — entry to peak, exactly as it played out.
        </p>
      </div>

      {/* Marquee window with theme-color edge gradients (embedded feel) */}
      <div className="rwm-window relative mt-8 overflow-hidden">
        <div className="rwm-track flex w-max gap-5 px-5">
          {track.map((w, i) => {
            const sym = cleanPair(w.pair);
            const peak = fmtInt(w.gain_pct);
            const realized = fmtInt(w.realized_pct);
            const lev = w.pnl_leverage ? Number(w.pnl_leverage) : null;
            const levRealized = lev && w.realized_pct != null ? fmtInt(w.realized_pct * lev) : null;
            const levPeak = lev && w.gain_pct != null ? fmtInt(w.gain_pct * lev) : null;
            const date = fmtDate(w.signal_time);

            return (
              <button
                key={`${w.signal_id}-${i}`}
                onClick={() => handleClick(w)}
                className="rwm-card group relative flex-shrink-0 w-[300px] sm:w-[340px] text-left"
                title={`${sym} · open full proof`}
              >
                {/* PnL card image — no border, soft rounded, fades into bg */}
                <div className="rwm-img-wrap relative overflow-hidden rounded-xl">
                  <img
                    src={w.cardImg}
                    alt={`${sym} PnL card`}
                    loading="lazy"
                    className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                    onError={(e) => {
                      const card = e.currentTarget.closest(".rwm-card");
                      if (card) card.style.display = "none";
                    }}
                  />
                </div>

                {/* Dynamic caption */}
                <div className="mt-3 px-1">
                  <div className="flex items-center gap-2">
                    <CoinLogo pair={w.pair} size={18} />
                    <span className="text-white text-[13px] font-semibold tracking-tight">${sym}</span>
                    {peak && (
                      <span className="ml-auto text-[12px] font-mono tabular-nums text-emerald-400">
                        peak +{peak}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/60">
                    Di-call algoritma LuxQuant{date ? ` pada ${date}` : ""}
                    {realized ? `, realized +${realized}% (spot)` : ""}
                    {levRealized ? ` — dengan ${lev}× jadi +${levRealized}% sesuai plan.` : "."}
                    {levPeak
                      ? ` Kalau exit tepat di puncak +${peak}%, dengan ${lev}× potensinya ~+${levPeak}%.`
                      : peak
                      ? ` Puncaknya menembus +${peak}% setelah dipanggil.`
                      : ""}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-primary/70 group-hover:text-gold-primary transition-colors">
                    View full proof
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Edge gradients — theme color, all four sides → "embedded" feel */}
        <div className="rwm-fade rwm-fade-l" aria-hidden="true" />
        <div className="rwm-fade rwm-fade-r" aria-hidden="true" />
        <div className="rwm-fade rwm-fade-t" aria-hidden="true" />
        <div className="rwm-fade rwm-fade-b" aria-hidden="true" />
      </div>

      {modalOpen && modalItem && (
        <SignalDetailModal
          item={modalItem}
          detail={signalDetail}
          loading={detailLoading}
          signalIds={modalSignalIds}
          currentIndex={modalIndex}
          onNavigate={goToSignal}
          onClose={closeModal}
          cleanPair={cleanPair}
          t={t}
        />
      )}

      <style>{`
        @keyframes rwmScroll { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .rwm-track {
          animation: rwmScroll 60s linear infinite;
          will-change: transform;
        }
        .rwm-window:hover .rwm-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .rwm-track { animation: none; } }

        .rwm-fade { position: absolute; pointer-events: none; z-index: 5; }
        .rwm-fade-l { top: 0; bottom: 0; left: 0; width: 12%;
          background: linear-gradient(to right, rgba(10,5,6,0.98) 0%, rgba(139,26,26,0.12) 55%, transparent 100%); }
        .rwm-fade-r { top: 0; bottom: 0; right: 0; width: 12%;
          background: linear-gradient(to left, rgba(10,5,6,0.98) 0%, rgba(139,26,26,0.12) 55%, transparent 100%); }
        .rwm-fade-t { left: 0; right: 0; top: 0; height: 26px;
          background: linear-gradient(to bottom, rgba(10,5,6,0.85) 0%, transparent 100%); }
        .rwm-fade-b { left: 0; right: 0; bottom: 0; height: 40px;
          background: linear-gradient(to top, rgba(10,5,6,0.9) 0%, transparent 100%); }

        .rwm-img-wrap {
          box-shadow: 0 0 0 1px rgba(212,168,83,0.12), 0 18px 40px -18px rgba(0,0,0,0.7);
        }
        .rwm-card:hover .rwm-img-wrap {
          box-shadow: 0 0 0 1px rgba(212,168,83,0.35), 0 22px 48px -16px rgba(139,26,26,0.5);
        }
      `}</style>
    </section>
  );
}
