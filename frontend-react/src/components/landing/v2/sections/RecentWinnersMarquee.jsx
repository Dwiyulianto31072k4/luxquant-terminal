// src/components/landing/v2/sections/RecentWinnersMarquee.jsx
// ════════════════════════════════════════════════════════════════
// RecentWinnersMarquee — "money parade" right below the hero.
//
// Storyline role: turn the hero promise into moving, emotional proof.
// A calm, slow, drag scrollable rail of real PnL cards (entry to peak).
// Blends into the page (fades to #0a0506, the base bg) so it never
// looks like a hard band. Each card opens the full proof modal.
//
// Data: `gainers` from useLandingData (/signals/top-performers) which now
// carries latest_chart_url + pnl_leverage + realized_pct. The PnL card is
// deriveChartWithCard(latest_chart_url) → the _with_card.png variant.
//
// Interaction: auto advances slowly, pauses on hover, and the user can
// grab and drag (or trackpad / touch scroll) freely. Seamless loop.
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

// Diagonal arrow to the top right corner (same idea as the Top Gainer cards).
const ArrowUpRight = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
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

  // ── proof modal (reuse SignalDetailModal, same as TopGainers) ──
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

  // ── slow auto scroll + grab/drag + trackpad, seamless loop ──
  const scrollerRef = useRef(null);
  const pausedRef = useRef(false);      // hover / touch pause
  const dragRef = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || winners.length === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    let raf;
    let last;
    const SPEED = 16; // px per second — calm
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

  // Keep the loop seamless while the user scrolls/drags manually.
  const normalizeLoop = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (half <= 0) return;
    if (el.scrollLeft >= half) el.scrollLeft -= half;
    else if (el.scrollLeft < 0) el.scrollLeft += half;
  }, []);

  const onPointerDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const el = scrollerRef.current;
    const d = dragRef.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.startLeft - dx;
    normalizeLoop();
  };
  const endDrag = (e) => {
    const el = scrollerRef.current;
    if (el) el.releasePointerCapture?.(e.pointerId);
    // allow a tiny delay so a drag doesn't register as a click
    setTimeout(() => { dragRef.current.active = false; }, 0);
  };

  if (winners.length === 0) return null;
  const track = [...winners, ...winners];

  return (
    <section className="rwm relative z-10 py-16 sm:py-24">
      {/* Eyebrow + heading */}
      <div className="mx-auto max-w-6xl px-5 text-center">
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
      <div className="rwm-window relative mt-10">
        <div
          ref={scrollerRef}
          className="rwm-scroller"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; dragRef.current.active = false; }}
          onTouchStart={() => { pausedRef.current = true; }}
          onTouchEnd={() => { setTimeout(() => { pausedRef.current = false; }, 1500); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="rwm-track">
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
                        const card = e.currentTarget.closest(".rwm-card");
                        if (card) card.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="rwm-meta">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={w.pair} size={20} />
                      <span className="text-white text-[14px] font-semibold tracking-tight">${sym}</span>
                      {peak && (
                        <span className="ml-auto text-[13px] font-mono tabular-nums text-emerald-400 font-medium">
                          peak +{peak}%
                        </span>
                      )}
                    </div>

                    {(date || ago) && (
                      <div className="mt-1.5 text-[11px] font-mono tabular-nums text-white/40">
                        {date}{ago ? ` · ${ago}` : ""}
                      </div>
                    )}

                    <p className="mt-2.5 text-[12.5px] leading-[1.65] text-white/60">
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

        {/* Edge fades → blend into the page base (#0a0506), no hard band */}
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
        .rwm-scroller {
          overflow-x: auto;
          overflow-y: hidden;
          cursor: grab;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
          padding: 8px 0;
        }
        .rwm-scroller:active { cursor: grabbing; }
        .rwm-scroller::-webkit-scrollbar { display: none; }
        .rwm-track {
          display: flex;
          gap: 22px;
          width: max-content;
          padding: 0 max(20px, calc((100vw - 1180px) / 2));
        }
        .rwm-card {
          flex: 0 0 auto;
          width: 380px;
          text-align: left;
          user-select: none;
          -webkit-user-drag: none;
        }
        @media (max-width: 640px) {
          .rwm-card { width: 300px; }
        }
        .rwm-img-wrap {
          position: relative;
          height: 208px;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(212,168,83,0.10), 0 18px 44px -20px rgba(0,0,0,0.75);
          transition: box-shadow .3s ease, transform .3s ease;
        }
        .rwm-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          transition: transform .5s ease;
        }
        .rwm-card:hover .rwm-img-wrap {
          box-shadow: 0 0 0 1px rgba(212,168,83,0.32), 0 24px 52px -18px rgba(139,26,26,0.5);
          transform: translateY(-2px);
        }
        .rwm-card:hover .rwm-img { transform: scale(1.04); }
        .rwm-meta { padding: 14px 4px 0; }
        .rwm-proof {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          color: var(--gold-primary, #d4a853);
          font-weight: 600;
          font-size: 11.5px;
          letter-spacing: 0.01em;
        }
        .rwm-card:hover .rwm-proof { color: #f0d890; }

        .rwm-fade { position: absolute; top: 0; bottom: 0; width: 9%; pointer-events: none; z-index: 5; }
        .rwm-fade-l { left: 0;  background: linear-gradient(to right, #0a0506 0%, rgba(10,5,6,0.6) 40%, transparent 100%); }
        .rwm-fade-r { right: 0; background: linear-gradient(to left,  #0a0506 0%, rgba(10,5,6,0.6) 40%, transparent 100%); }
        @media (max-width: 640px) { .rwm-fade { width: 6%; } }
      `}</style>
    </section>
  );
}
