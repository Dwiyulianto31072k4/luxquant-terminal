// src/components/landing/v2/sections/RecentWinnersMarquee.jsx
// ════════════════════════════════════════════════════════════════
// RecentWinnersMarquee — "money parade" right below the hero.
//
// Slow, drag scrollable rail of real PnL cards (entry to peak) sitting
// INSIDE a faint gold wireframe globe backdrop, so it reads as one
// immersive, contained space that blends into the neighbouring sections.
//
// Data: `gainers` from useLandingData (/signals/top-performers) which
// carries latest_chart_url + pnl_leverage + realized_pct. PnL card =
// deriveChartWithCard(latest_chart_url) → the _with_card.png variant.
// Full image shown (no crop). Click → the exact full proof modal.
//
// Props: gainers (array)
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../../../CoinLogo";
import { SignalDetailModal } from "../../../TopPerformers";

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

const timeAgo = (iso) => {
  if (!iso) return null;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(s)) return null;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
};

// Flowing English narration. No dashes anywhere.
const buildCaption = (w) => {
  const peak = fmtInt(w.gain_pct);
  const realized = fmtInt(w.realized_pct);
  const lev = w.pnl_leverage ? Number(w.pnl_leverage) : null;
  const levRealized = lev && w.realized_pct != null ? fmtInt(w.realized_pct * lev) : null;
  const levPeak = lev && w.gain_pct != null ? fmtInt(w.gain_pct * lev) : null;
  const date = fmtDate(w.signal_time);

  let s = `Called by the LuxQuant algorithm on ${date}.`;
  if (realized && levRealized) {
    s += ` It realized +${realized}% on spot, which at ${lev}x turned into +${levRealized}% right on plan.`;
  } else if (realized) {
    s += ` It realized +${realized}% on spot.`;
  }
  if (levPeak) {
    s += ` Had you exited at the +${peak}% peak, ${lev}x would have returned roughly +${levPeak}%.`;
  } else if (peak) {
    s += ` It went on to peak at +${peak}% after the call.`;
  }
  return s;
};

const ArrowUpRight = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

// Faint wireframe globe backdrop (armillary look) — pure SVG, slow spin.
const GlobeBackdrop = () => (
  <svg className="rwm-globe-svg" viewBox="0 0 600 600" aria-hidden="true">
    <defs>
      <radialGradient id="rwmGlow" cx="50%" cy="42%" r="60%">
        <stop offset="0%" stopColor="rgba(212,168,83,0.18)" />
        <stop offset="45%" stopColor="rgba(139,26,26,0.10)" />
        <stop offset="100%" stopColor="rgba(10,5,6,0)" />
      </radialGradient>
    </defs>
    <circle cx="300" cy="300" r="270" fill="url(#rwmGlow)" />
    <g fill="none" stroke="rgba(212,168,83,0.16)" strokeWidth="1">
      <circle cx="300" cy="300" r="248" />
      <ellipse cx="300" cy="300" rx="248" ry="86" />
      <ellipse cx="300" cy="300" rx="248" ry="168" />
      <g className="rwm-globe-spin" style={{ transformOrigin: "300px 300px" }}>
        <ellipse cx="300" cy="300" rx="86" ry="248" />
        <ellipse cx="300" cy="300" rx="168" ry="248" />
        <line x1="300" y1="52" x2="300" y2="548" />
      </g>
    </g>
  </svg>
);

export default function RecentWinnersMarquee({ gainers = [] }) {
  const { t } = useTranslation();

  const winners = useMemo(() => {
    const seen = new Set();
    return (gainers || [])
      .map((g) => ({ ...g, cardImg: deriveChartWithCard(g.latest_chart_url) }))
      .filter((g) => g.cardImg && g.signal_id && !seen.has(g.pair) && seen.add(g.pair))
      .sort((a, b) => (b.gain_pct || 0) - (a.gain_pct || 0))
      .slice(0, 12);
  }, [gainers]);

  // ── proof modal (reuse SignalDetailModal — the exact full proof) ──
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

  const openProof = useCallback(
    (item) => {
      if (!item?.signal_id) return;
      const ids = item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
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

  // ── slow auto scroll + grab/drag (window-listener based, so taps still
  //    fire a real click → the proof modal opens reliably) ──
  const scrollerRef = useRef(null);
  const pausedRef = useRef(false);
  const dragRef = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  const normalizeLoop = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (half <= 0) return;
    if (el.scrollLeft >= half) el.scrollLeft -= half;
    else if (el.scrollLeft < 0) el.scrollLeft += half;
  }, []);

  const onWinMove = useCallback((e) => {
    const el = scrollerRef.current;
    const d = dragRef.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    el.scrollLeft = d.startLeft - dx;
    normalizeLoop();
  }, [normalizeLoop]);

  const onWinUp = useCallback(() => {
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
    setTimeout(() => { dragRef.current.active = false; }, 0);
  }, [onWinMove]);

  const onPointerDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
  };

  useEffect(() => () => {
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
  }, [onWinMove, onWinUp]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || winners.length === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    let raf;
    let last;
    const SPEED = 15; // px per second — calm
    const step = (ts) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      const half = el.scrollWidth / 2;
      if (half > 0 && !pausedRef.current && !dragRef.current.active) {
        let next = el.scrollLeft + SPEED * dt;
        if (next >= half) next -= half;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [winners.length]);

  const hasWinners = winners.length > 0;
  const track = hasWinners ? [...winners, ...winners] : [];

  return (
    <section className="rwm relative z-10 overflow-hidden py-20 sm:py-28">
      {/* Immersive globe backdrop + vignette (cards sit "inside" it) */}
      <div className="rwm-globe" aria-hidden="true"><GlobeBackdrop /></div>
      <div className="rwm-vignette" aria-hidden="true" />

      {/* Eyebrow + heading */}
      <div className="relative z-10 mx-auto max-w-6xl px-5 text-center">
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.26em] text-gold-primary/80">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-primary/50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-primary/80" />
          </span>
          Recent winners · live proof
        </div>
        <h2 className="mt-4 text-[1.7rem] sm:text-4xl lg:text-[2.7rem] font-bold leading-[1.05] tracking-tight text-white">
          Real calls. Real peaks.
        </h2>
        <p className="mt-3 text-sm sm:text-[15px] text-white/50 max-w-lg mx-auto leading-relaxed">
          Every card is an actual LuxQuant call, from entry to peak, exactly as it played out.
        </p>
      </div>

      {/* Rail */}
      <div className="rwm-window relative z-10 mt-12">
        <div
          ref={scrollerRef}
          className="rwm-scroller"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
          onTouchStart={() => { pausedRef.current = true; }}
          onTouchEnd={() => { setTimeout(() => { pausedRef.current = false; }, 1500); }}
          onPointerDown={onPointerDown}
        >
          <div className="rwm-track">
            {!hasWinners &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`skel-${i}`} className="rwm-card">
                  <div className="rwm-img-wrap rwm-skel" style={{ paddingTop: "56%" }} />
                  <div className="rwm-meta">
                    <div className="rwm-skel rwm-skel-line" style={{ width: "45%" }} />
                    <div className="rwm-skel rwm-skel-line" style={{ width: "92%", marginTop: 12 }} />
                    <div className="rwm-skel rwm-skel-line" style={{ width: "70%", marginTop: 7 }} />
                  </div>
                </div>
              ))}
            {track.map((w, i) => {
              const sym = cleanPair(w.pair);
              const peak = fmtInt(w.gain_pct);
              const date = fmtDate(w.signal_time);
              const ago = timeAgo(w.signal_time);
              const caption = buildCaption(w);
              return (
                <button
                  key={`${w.signal_id}-${i}`}
                  onClick={() => { if (!dragRef.current.moved) openProof(w); }}
                  className="rwm-card group"
                  title={`${sym} · open full proof`}
                >
                  <div className="rwm-img-wrap">
                    <img
                      src={w.cardImg}
                      alt={`${sym} PnL card`}
                      loading="lazy"
                      draggable="false"
                      className="rwm-img"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.dataset.fallback !== "1" && w.latest_chart_url) {
                          img.dataset.fallback = "1";
                          img.src = w.latest_chart_url; // base chart if the _with_card variant is missing
                          return;
                        }
                        const card = img.closest(".rwm-card");
                        if (card) card.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="rwm-meta">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CoinLogo pair={w.pair} size={22} />
                      <span className="text-white text-[15px] font-semibold tracking-tight">${sym}</span>
                      {(date || ago) && (
                        <span className="text-[11px] font-mono tabular-nums text-white/40">
                          {date}{ago ? ` · ${ago}` : ""}
                        </span>
                      )}
                      {peak && (
                        <span className="ml-auto text-[14px] font-mono tabular-nums text-emerald-400 font-medium">
                          peak +{peak}%
                        </span>
                      )}
                    </div>

                    <p className="mt-2.5 text-[13px] leading-[1.7] text-white/65">
                      {caption}{" "}
                      <span className="rwm-proof">
                        View proof
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side fades → blend into page base (#0a0506) */}
        <div className="rwm-fade rwm-fade-l" aria-hidden="true" />
        <div className="rwm-fade rwm-fade-r" aria-hidden="true" />
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
        /* Vertical blend so the section melts into its neighbours */
        .rwm::before, .rwm::after {
          content: "";
          position: absolute;
          left: 0; right: 0;
          height: 140px;
          pointer-events: none;
          z-index: 2;
        }
        .rwm::before { top: 0;    background: linear-gradient(to bottom, #0a0506 0%, rgba(10,5,6,0) 100%); }
        .rwm::after  { bottom: 0; background: linear-gradient(to top,    #0a0506 0%, rgba(10,5,6,0) 100%); }

        .rwm-globe {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(1100px, 130vw);
          aspect-ratio: 1 / 1;
          transform: translate(-50%, -50%);
          z-index: 0;
          pointer-events: none;
          opacity: 0.55;
        }
        .rwm-globe-svg { width: 100%; height: 100%; display: block; }
        .rwm-globe-spin { animation: rwmGlobeSpin 90s linear infinite; }
        @keyframes rwmGlobeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .rwm-vignette {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background:
            radial-gradient(ellipse 60% 55% at 50% 50%, rgba(10,5,6,0) 40%, rgba(10,5,6,0.55) 100%);
        }

        .rwm-scroller {
          overflow-x: auto;
          overflow-y: hidden;
          cursor: grab;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
          padding: 10px 0;
          touch-action: pan-x;
        }
        .rwm-scroller:active { cursor: grabbing; }
        .rwm-scroller::-webkit-scrollbar { display: none; }
        .rwm-track {
          display: flex;
          gap: 26px;
          width: max-content;
          padding: 0 max(24px, calc((100vw - 1440px) / 2));
        }
        .rwm-card {
          flex: 0 0 auto;
          width: 300px;
          text-align: left;
          user-select: none;
          -webkit-user-drag: none;
        }
        @media (min-width: 640px)  { .rwm-card { width: 380px; } }
        @media (min-width: 1024px) { .rwm-card { width: 460px; } }

        .rwm-img-wrap {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(212,168,83,0.12), 0 20px 48px -20px rgba(0,0,0,0.8);
          transition: box-shadow .3s ease, transform .3s ease;
        }
        .rwm-img {
          width: 100%;
          height: auto;      /* full image, no crop */
          display: block;
        }
        .rwm-card:hover .rwm-img-wrap {
          box-shadow: 0 0 0 1px rgba(212,168,83,0.36), 0 26px 56px -18px rgba(139,26,26,0.55);
          transform: translateY(-3px);
        }
        .rwm-meta { padding: 15px 4px 0; }
        .rwm-proof {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          color: #d4a853;
          font-weight: 600;
          font-size: 12px;
        }
        .rwm-card:hover .rwm-proof { color: #f0d890; }

        .rwm-fade { position: absolute; top: 0; bottom: 0; width: 8%; pointer-events: none; z-index: 5; }
        .rwm-fade-l { left: 0;  background: linear-gradient(to right, #0a0506 0%, rgba(10,5,6,0.55) 45%, transparent 100%); }
        .rwm-fade-r { right: 0; background: linear-gradient(to left,  #0a0506 0%, rgba(10,5,6,0.55) 45%, transparent 100%); }
        @media (max-width: 640px) { .rwm-fade { width: 6%; } }

        /* Loading skeleton (shown until winners arrive) */
        .rwm-skel { position: relative; overflow: hidden; background: rgba(255,255,255,0.045); }
        .rwm-skel::after {
          content: ""; position: absolute; inset: 0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
          animation: rwmShimmer 1.4s infinite;
        }
        .rwm-skel-line { height: 11px; border-radius: 5px; }
        @keyframes rwmShimmer { 100% { transform: translateX(100%); } }

        @media (prefers-reduced-motion: reduce) {
          .rwm-globe-spin { animation: none; }
          .rwm-skel::after { animation: none; }
        }
      `}</style>
    </section>
  );
}
