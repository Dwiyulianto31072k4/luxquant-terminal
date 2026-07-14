// src/components/landing/v2/sections/RecentWinnersMarquee.jsx
// ════════════════════════════════════════════════════════════════
// RecentWinnersMarquee — "money parade" right below the hero.
//
// Truly seamless infinite rail (transform: translate3d loop, GPU) that the
// user can also grab and drag. Fully transparent section so the page's
// continuous maroon canvas flows through with no gradient break (same idea
// as the Global Reach section). Each card opens the exact full proof modal.
//
// Data: `gainers` from useLandingData (/signals/top-performers) → carries
// latest_chart_url + pnl_leverage + realized_pct + type (Daily|Weekly).
// PnL card = deriveChartWithCard(latest_chart_url) → the _with_card.png variant.
// Order: interleave Weekly then Daily (W,D,W,D…), peak-sorted within each type.
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

// Short, varied, soft-sell copy. Each card reads differently (deterministic
// pick per signal so it stays stable), professional and not templated. The
// numbers are real; the tone gently implies "this is what LuxQuant does".
// No dash characters anywhere.
const buildCaption = (w) => {
  const sym = cleanPair(w.pair);
  const peak = fmtInt(w.gain_pct);
  const realized = fmtInt(w.realized_pct);
  const lev = w.pnl_leverage ? Number(w.pnl_leverage) : null;
  const levPeak = lev && w.gain_pct != null ? fmtInt(w.gain_pct * lev) : null;
  const date = fmtDate(w.signal_time);
  const ago = timeAgo(w.signal_time);

  const c = [];
  if (peak) {
    c.push(`Called ${ago}, $${sym} ran to a +${peak}% peak from entry.`);
    c.push(`The algorithm flagged $${sym} on ${date}; it topped near +${peak}%.`);
    c.push(`Entry to peak, +${peak}% on $${sym}. The kind of call we make daily.`);
    c.push(`$${sym} climbed +${peak}% after the call. Live, not hindsight.`);
    c.push(`$${sym} pushed +${peak}% above entry. Proof, not promises.`);
  }
  if (peak && realized) {
    c.push(`$${sym}: +${realized}% booked to plan, +${peak}% at the high.`);
    c.push(`$${sym} played out clean, +${realized}% realized, +${peak}% at the peak.`);
  }
  if (peak && levPeak) {
    c.push(`$${sym} peaked +${peak}%. At ${lev}x, that is roughly +${levPeak}%.`);
  }
  if (c.length === 0) return `$${sym}, called ${ago || "recently"}.`;

  let h = 0;
  const key = String(w.signal_id || sym);
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return c[h % c.length];
};

const ArrowUpRight = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

export default function RecentWinnersMarquee({ gainers = [] }) {
  const { t } = useTranslation();

  // Interleave Weekly → Daily → Weekly → Daily (same spirit as Top Gainers).
  // Within each type, keep peak-sorted order; skip a pair if it already appeared.
  const winners = useMemo(() => {
    const eligible = (gainers || [])
      .map((g) => ({ ...g, cardImg: deriveChartWithCard(g.latest_chart_url) }))
      .filter((g) => g.cardImg && g.signal_id);

    const dedupeByPair = (list) => {
      const seen = new Set();
      return list
        .sort((a, b) => (b.gain_pct || 0) - (a.gain_pct || 0))
        .filter((g) => !seen.has(g.pair) && seen.add(g.pair));
    };

    const typeOf = (g) => String(g.type || "").toLowerCase();
    const weekly = dedupeByPair(eligible.filter((g) => typeOf(g) === "weekly"));
    const daily = dedupeByPair(eligible.filter((g) => typeOf(g) === "daily"));
    // Fallback if type tag missing (shouldn't happen from useLandingData)
    const untyped = dedupeByPair(eligible.filter((g) => !typeOf(g)));

    const combined = [];
    const seenPair = new Set();
    const MAX = 20;
    const push = (item) => {
      if (!item || seenPair.has(item.pair) || combined.length >= MAX) return;
      seenPair.add(item.pair);
      combined.push(item);
    };

    const max = Math.max(weekly.length, daily.length);
    for (let i = 0; i < max && combined.length < MAX; i++) {
      push(weekly[i]); // 1st, 3rd, 5th… weekly
      push(daily[i]);  // 2nd, 4th, 6th… daily
    }
    // Top up if one side ran dry / types missing
    for (const item of untyped) push(item);

    return combined;
  }, [gainers]);

  const hasWinners = winners.length > 0;

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

  // ── seamless transform loop + grab/drag ──
  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const dragRef = useRef({ active: false, startX: 0, startOffset: 0, moved: false });

  const onWinMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    offsetRef.current = d.startOffset + dx;
  }, []);

  const onWinUp = useCallback(() => {
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
    setTimeout(() => { dragRef.current.active = false; }, 0);
  }, [onWinMove]);

  const onPointerDown = (e) => {
    dragRef.current = { active: true, startX: e.clientX, startOffset: offsetRef.current, moved: false };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
  };

  useEffect(() => () => {
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
  }, [onWinMove, onWinUp]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !hasWinners) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let raf;
    let last;
    const SPEED = 42; // px per second
    const n = winners.length;
    const frame = (ts) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      // One set width = left offset of the first card of the duplicated set.
      const secondStart = track.children[n];
      const setW = secondStart ? secondStart.offsetLeft : 0;
      if (setW > 0) {
        if (!reduce && !pausedRef.current && !dragRef.current.active) {
          offsetRef.current -= SPEED * dt;
        }
        let o = offsetRef.current;
        if (o <= -setW) o += setW;
        else if (o > 0) o -= setW;
        offsetRef.current = o;
        track.style.transform = `translate3d(${o}px,0,0)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasWinners, winners.length]);

  const track = hasWinners ? [...winners, ...winners] : [];

  return (
    <section className="rwm relative z-10 py-12 sm:py-24">
      {/* Warm maroon glow only (additive) — section stays transparent so the
          page canvas flows through with no gradient break. */}
      <div className="rwm-bg" aria-hidden="true" />

      {/* Heading */}
      <div className="relative z-10 mx-auto max-w-6xl px-5 text-center">
        <h2 className="text-2xl sm:text-4xl lg:text-[2.9rem] font-bold leading-[1.05] tracking-tight text-white">
          Real calls. Real peaks.
        </h2>
        <p className="mt-3 text-sm sm:text-[15px] text-white/55 max-w-lg mx-auto leading-relaxed">
          Every card is an actual LuxQuant call, from entry to peak, exactly as it played out.
        </p>
      </div>

      {/* Rail */}
      <div className="rwm-window relative z-10 mt-8 sm:mt-14">
        <div
          className="rwm-viewport"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
          onTouchStart={() => { pausedRef.current = true; }}
          onTouchEnd={() => { setTimeout(() => { pausedRef.current = false; }, 1400); }}
          onPointerDown={onPointerDown}
        >
          <div className="rwm-track" ref={trackRef}>
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
                          img.src = w.latest_chart_url;
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
                        <span className="text-[11.5px] font-mono tabular-nums text-white/40">
                          {date}{ago ? ` · ${ago}` : ""}
                        </span>
                      )}
                    </div>

                    <p className="mt-2.5 text-[13.5px] leading-[1.7] text-white/65">
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

        {/* Soft side fades so cards dissolve into the page at the edges */}
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
        .rwm-bg {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 64% 78% at 50% 46%, rgba(150,30,30,0.30) 0%, rgba(112,24,24,0.13) 42%, rgba(40,10,11,0) 72%),
            radial-gradient(ellipse 42% 48% at 50% 44%, rgba(212,168,83,0.06) 0%, rgba(212,168,83,0) 70%);
        }

        .rwm-viewport { overflow: hidden; cursor: grab; }
        .rwm-viewport:active { cursor: grabbing; }
        .rwm-track {
          display: flex;
          width: max-content;
          will-change: transform;
          padding: 10px 0;
        }
        .rwm-card {
          flex: 0 0 auto;
          width: 500px;
          margin-right: 28px;
          text-align: left;
          user-select: none;
          -webkit-user-drag: none;
        }
        @media (max-width: 1023px) { .rwm-card { width: 360px; margin-right: 20px; } }
        @media (max-width: 640px)  {
          .rwm-card { width: 268px; margin-right: 14px; }
          .rwm-meta { padding-top: 12px; }
          .rwm-meta p { font-size: 12px; line-height: 1.6; }
          .rwm-img-wrap { border-radius: 14px; }
        }

        .rwm-img-wrap {
          position: relative;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(212,168,83,0.12), 0 22px 52px -22px rgba(0,0,0,0.8);
          transition: box-shadow .3s ease, transform .3s ease;
        }
        .rwm-img { width: 100%; height: auto; display: block; }
        .rwm-card:hover .rwm-img-wrap {
          box-shadow: 0 0 0 1px rgba(212,168,83,0.38), 0 28px 60px -18px rgba(139,26,26,0.55);
          transform: translateY(-3px);
        }
        .rwm-meta { padding: 16px 4px 0; }
        .rwm-proof {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          color: #d4a853;
          font-weight: 600;
          font-size: 12.5px;
        }
        .rwm-card:hover .rwm-proof { color: #f0d890; }

        /* Soft maroon edge dissolve into the page canvas (not near-black).
           Matches the globe section feel: cards sit "inside" the brand bg. */
        .rwm-fade { position: absolute; top: 0; bottom: 0; width: 10%; pointer-events: none; z-index: 5; }
        .rwm-fade-l {
          left: 0;
          background: linear-gradient(
            to right,
            rgba(90, 20, 22, 0.82) 0%,
            rgba(120, 28, 28, 0.32) 45%,
            transparent 100%
          );
        }
        .rwm-fade-r {
          right: 0;
          background: linear-gradient(
            to left,
            rgba(90, 20, 22, 0.82) 0%,
            rgba(120, 28, 28, 0.32) 45%,
            transparent 100%
          );
        }
        @media (max-width: 640px) { .rwm-fade { width: 7%; } }

        .rwm-skel { position: relative; overflow: hidden; background: rgba(255,255,255,0.045); }
        .rwm-skel::after {
          content: ""; position: absolute; inset: 0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
          animation: rwmShimmer 1.4s infinite;
        }
        .rwm-skel-line { height: 11px; border-radius: 5px; }
        @keyframes rwmShimmer { 100% { transform: translateX(100%); } }

        @media (prefers-reduced-motion: reduce) { .rwm-skel::after { animation: none; } }
      `}</style>
    </section>
  );
}
