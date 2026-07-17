// src/components/landing/v2/sections/TopGainers.jsx
// ════════════════════════════════════════════════════════════════
// TopGainers — struktur section "Fees as Low as 0.00%" MEXC, isinya
// Top Gainers LuxQuant. Tipografi MEXC-light: cuma judul yang bold,
// sisanya ≤600 + grid hairline (garis tipis antar sel), bukan box tebal.
//
// Klik kartu → buka SignalDetailModal (modal bukti yang sama dengan
// TopPerformers di produksi: chart before/after + journey). Modal di-
// reuse via named export dari ../../../TopPerformers (bukan bikin baru).
//
// Data dari `gainers` (useLandingData → /signals/top-performers) + `stats`.
// CATATAN: klik butuh `item.signal_id` (+ `all_signal_ids`) ikut ke-pass
// dari useLandingData. Kalau gainer gak punya signal_id, klik no-op.
//
// Props: stats, gainers, onNav(id)
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../context/AuthContext";
import CoinLogo from "../../../CoinLogo";
import { SignalDetailModal } from "../../../TopPerformers";

const GOLD_BTN = {
  background:
    "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
  color: "rgb(var(--surface))",
};

const symbolOf = (pair) => pair?.replace(/USDT$/i, "").replace(/^3A/, "") || "—";

// Satu sel coin — flat (hairline grid), bobot ringan (MEXC-style), clickable.
const GainerCard = ({ item, onClick }) => (
  <button
    onClick={onClick}
    className="relative text-left p-4 bg-surface-raised hover:bg-ink/[0.025] transition-colors group w-full"
  >
    {/* open affordance — diagonal arrow, brightens on hover */}
    <svg
      className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-text-muted/35 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H9M17 7v8" />
    </svg>
    <div className="flex items-center gap-2.5 mb-3">
      <CoinLogo pair={item.pair} size={26} />
      <div className="min-w-0">
        <p className="text-text-primary text-sm font-medium leading-tight truncate group-hover:text-text-primary transition-colors">
          {symbolOf(item.pair)}
          <span className="text-text-muted font-normal">USDT</span>
        </p>
        <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-text-muted">
          <svg
            className="h-2.5 w-2.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Called
        </span>
      </div>
    </div>
    <p className="text-xl lg:text-2xl font-semibold text-profit leading-none tabular-nums">
      +{(item.gain_pct ?? 0).toFixed(1)}%
    </p>
    <p className="text-text-muted text-[10px] mt-1.5 uppercase tracking-wider">Peak since call</p>
  </button>
);

const SkeletonCard = () => (
  <div className="p-4 bg-surface-raised animate-pulse">
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-full bg-ink/[0.06]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-16 bg-ink/[0.06] rounded" />
        <div className="h-2.5 w-10 bg-ink/[0.04] rounded" />
      </div>
    </div>
    <div className="h-6 w-20 bg-ink/[0.06] rounded" />
  </div>
);

export default function TopGainers({ stats, gainers = [], onNav }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState("Daily");
  const goPlatform = () => navigate(isAuthenticated ? "/home" : "/login");

  // ── custom date range (top-performers supports date_from/date_to) ──
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customData, setCustomData] = useState([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const customActive = !!(customFrom && customTo);

  useEffect(() => {
    if (!customFrom || !customTo) return;
    const a = customFrom < customTo ? customFrom : customTo;
    const b = customFrom < customTo ? customTo : customFrom;
    let alive = true;
    setCustomLoading(true);
    fetch(`/api/v1/signals/top-performers?date_from=${a}&date_to=${b}&limit=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setCustomData((d?.top_gainers || []).map((i) => ({ ...i, type: "Custom" })));
        setCustomLoading(false);
      })
      .catch(() => alive && setCustomLoading(false));
    return () => {
      alive = false;
    };
  }, [customFrom, customTo]);
  const clearCustom = () => {
    setCustomFrom("");
    setCustomTo("");
    setCustomData([]);
  };

  // ── modal (reuse SignalDetailModal, sama seperti TopPerformers prod) ──
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
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleItemClick = (item) => {
    if (!item?.signal_id) {
      console.warn(
        "[TopGainers] gainer tanpa signal_id — pastikan useLandingData pass signal_id/all_signal_ids",
        item
      );
      return;
    }
    const ids = item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
    const bi = ids.indexOf(item.signal_id);
    setModalSignalIds(ids);
    setModalIndex(bi >= 0 ? bi : 0);
    setModalItem(item);
    setModalOpen(true);
    fetchDetail(item.signal_id);
  };

  const goToSignal = (i) => {
    if (i >= 0 && i < modalSignalIds.length) {
      setModalIndex(i);
      fetchDetail(modalSignalIds[i]);
    }
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalSignalIds([]);
    setModalIndex(0);
    setModalItem(null);
    setSignalDetail(null);
  };
  const cleanPair = (p) => (p ? p.replace(/^3A/, "").replace(/USDT$/i, "") + "USDT" : "???");

  const baseItems = customActive ? customData : gainers.filter((g) => (g.type || "Daily") === tab);
  // potong ke kelipatan 3 (biar baris 3-kolom rapi), maksimal 21
  const count = Math.floor(Math.min(baseItems.length, 21) / 3) * 3;
  const items = baseItems.slice(0, count);
  const hasData = baseItems.length > 0;
  const canMarquee = items.length >= 6;

  // stat kiri — best call (mengikuti periode aktif: custom kalau dipilih)
  const bestSource = customActive ? customData : gainers;
  const bestGainer =
    bestSource.length > 0
      ? bestSource.reduce((a, b) => ((b.gain_pct || 0) > (a.gain_pct || 0) ? b : a))
      : null;
  const bestGain = bestGainer ? bestGainer.gain_pct || 0 : null;
  // ringkas angka gain besar (MEXC-style): 3.58M% / 12.4K% / 49.7%
  const fmtPct = (v) => {
    if (v == null) return "—";
    if (v >= 1000000) return `+${(v / 1000000).toFixed(2)}M%`;
    if (v >= 10000) return `+${(v / 1000).toFixed(1)}K%`;
    return `+${v.toFixed(1)}%`;
  };
  const leftStats = [
    {
      // realized gain → hijau (profit), konsisten dgn % di kartu
      label: "Best Call",
      value: fmtPct(bestGain),
      accent: "text-profit",
      pair: bestGainer?.pair,
      onClick: bestGainer?.signal_id ? () => handleItemClick(bestGainer) : null,
    },
    {
      // angka netral → putih (MEXC-clean, gak dipaksa warna brand)
      label: "Verified Win Rate",
      value: stats ? `${(stats.win_rate ?? 0).toFixed(1)}%` : "—",
      accent: "text-text-primary",
      onClick: () => navigate("/performance"),
    },
    {
      label: "Pairs Tracked",
      value: stats ? (stats.active_pairs ?? 0).toLocaleString() : "—",
      accent: "text-text-primary",
      onClick: () => navigate("/performance"),
    },
  ];

  return (
    <section
      id="signals-preview"
      className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24"
    >
      {/* header — framed as LuxQuant's own signal calls (not market noise) */}
      <div className="text-center mb-12 lg:mb-16">
        <span className="inline-flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-accent/55" />
          Verified Track Record
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-accent/55" />
        </span>

        <h2
          className="mt-5 font-bold text-text-primary text-3xl lg:text-5xl tracking-tight"
          style={{ textShadow: "0 0 30px rgb(var(--ink) / 0.12)" }}
        >
          Top Gainers We Called
        </h2>

        <p className="mx-auto mt-4 max-w-2xl text-sm lg:text-base leading-relaxed text-text-primary/55">
          Not market noise — every coin below is a real LuxQuant entry. These are the peak gains
          each one ran after our call.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-10 lg:gap-14 items-center">
        {/* ── LEFT: boxed cards on MOBILE only · bare big stats on DESKTOP ── */}
        <div className="flex flex-row items-stretch justify-between gap-2.5 sm:gap-3 lg:flex-col lg:items-start lg:gap-11">
          {leftStats.map((s) => {
            const Wrap = s.onClick ? "button" : "div";
            return (
              <Wrap
                key={s.label}
                onClick={s.onClick || undefined}
                className={`group relative flex-1 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-3 text-center transition-all sm:p-4 lg:flex-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left ${
                  s.onClick
                    ? "cursor-pointer hover:-translate-y-0.5 hover:border-ink/12 hover:bg-ink/[0.035] lg:hover:translate-y-0 lg:hover:bg-transparent"
                    : ""
                }`}
              >
                {/* mobile-only corner arrow */}
                {s.onClick && (
                  <svg
                    className="absolute right-2 top-2 h-3.5 w-3.5 text-text-muted/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary sm:right-3 sm:top-3 lg:hidden"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 17L17 7M17 7H9M17 7v8"
                    />
                  </svg>
                )}
                <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[8px] font-medium uppercase leading-tight tracking-[0.1em] text-text-muted sm:mb-2 sm:text-[10px] sm:tracking-[0.16em] lg:mb-2.5 lg:justify-start lg:text-[13px] lg:tracking-[0.16em]">
                  <span className="hidden h-px w-5 bg-gradient-to-r from-accent/70 to-transparent lg:inline-block" />
                  {s.label}
                  {/* desktop-only inline arrow */}
                  {s.onClick && (
                    <svg
                      className="hidden h-3 w-3 flex-shrink-0 text-text-muted/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary lg:inline-block"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 17L17 7M17 7H9M17 7v8"
                      />
                    </svg>
                  )}
                </p>
                <p
                  className={`font-bold leading-none tabular-nums text-[1.25rem] sm:text-[1.9rem] lg:text-[3.6rem] xl:text-[4rem] ${s.accent}`}
                >
                  {s.value}
                </p>

                {s.pair && (
                  <div className="mt-1.5 flex items-center justify-center gap-1 sm:mt-2 sm:gap-1.5 lg:mt-2.5 lg:justify-start lg:gap-1.5">
                    <CoinLogo pair={s.pair} size={16} />
                    <span className="text-[10px] font-medium text-accent sm:text-xs lg:text-sm">
                      {symbolOf(s.pair)}
                      <span className="text-text-muted font-normal">USDT</span>
                    </span>
                  </div>
                )}
              </Wrap>
            );
          })}
        </div>

        {/* ── RIGHT: tabbed card ── */}
        <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] p-5 lg:p-7 overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />

          {/* header: tabs (Daily · Weekly · Custom) + More */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-5">
              {["Daily", "Weekly"].map((tt) => (
                <button
                  key={tt}
                  onClick={() => {
                    setTab(tt);
                    clearCustom();
                    setPickerOpen(false);
                  }}
                  className={`text-base font-medium transition-colors ${
                    tab === tt && !customActive
                      ? "text-text-primary"
                      : "text-text-muted hover:text-text-primary/70"
                  }`}
                >
                  {tt}
                  {tab === tt && !customActive && (
                    <span className="block h-0.5 mt-1.5 rounded-full bg-accent" />
                  )}
                </button>
              ))}

              {/* Custom — opens a small date-range popover (no layout shift) */}
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((o) => !o)}
                  className={`flex items-center gap-1 text-base font-medium transition-colors ${
                    customActive || pickerOpen
                      ? "text-text-primary"
                      : "text-text-muted hover:text-text-primary/70"
                  }`}
                >
                  Custom
                  <svg
                    className="h-3 w-3 opacity-70"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                  {customActive && (
                    <span className="absolute -bottom-1.5 inset-x-0 h-0.5 rounded-full bg-accent" />
                  )}
                </button>

                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                    <div className="absolute left-0 top-9 z-30 w-[268px] rounded-xl border border-ink/12 bg-surface-secondary p-3 shadow-[0_16px_40px_rgb(var(--scrim) / 0.35)]">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          Pick a date range
                        </span>
                        <button
                          onClick={() => setPickerOpen(false)}
                          className="text-text-muted transition-colors hover:text-text-primary"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg border border-ink/10 bg-ink/[0.03] px-2 py-1.5">
                        <input
                          type="date"
                          value={customFrom}
                          max={customTo || undefined}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-text-primary outline-none"
                        />
                        <span className="font-mono text-[10px] text-text-muted">→</span>
                        <input
                          type="date"
                          value={customTo}
                          min={customFrom || undefined}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-text-primary outline-none"
                        />
                      </div>
                      {customActive && (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-text-muted">
                            {customLoading ? "loading…" : `${customData.length} calls`}
                          </span>
                          <button
                            onClick={clearCustom}
                            className="rounded-md border border-ink/10 px-2 py-0.5 font-mono text-[10px] text-text-muted transition-colors hover:border-ink/25 hover:text-text-primary"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => navigate("/performance")}
              className="flex items-center gap-1 text-text-muted hover:text-text-primary text-xs transition-colors"
            >
              More
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* hairline grid — auto-scroll ke atas (loop) + fade gradient (MEXC) */}
          {!hasData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/[0.06] rounded-lg overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : canMarquee ? (
            <div
              className="tg-window relative overflow-hidden rounded-lg h-[400px] lg:h-[460px]"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
              }}
            >
              {/* konten digandakan 2x → loop mulus (translateY -50%) */}
              <div
                className="tg-marquee grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/[0.06]"
                style={{ animationDuration: `${items.length * 1.7}s` }}
              >
                {[...items, ...items].map((item, i) => (
                  <GainerCard
                    key={`${item.pair}-${i}`}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/[0.06] rounded-lg overflow-hidden">
              {items.map((item, i) => (
                <GainerCard
                  key={`${item.pair}-${i}`}
                  item={item}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          )}

          {!hasData && (
            <p className="text-center text-text-muted text-[11px] mt-4">
              {customActive
                ? customLoading
                  ? "Loading…"
                  : "No calls in this range."
                : "Loading live data…"}
            </p>
          )}
        </div>
      </div>

      {/* CTA — arahkan ke bukti lengkap di halaman Performance */}
      <div className="flex flex-col items-center gap-3 mt-12 lg:mt-16">
        <button
          onClick={() => navigate("/performance")}
          className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide transition-all hover:-translate-y-0.5 shadow-[0_4px_16px_rgb(var(--accent) / 0.25)] hover:shadow-[0_6px_20px_rgb(var(--accent) / 0.35)]"
          style={GOLD_BTN}
        >
          See Full Track Record
          <svg
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.4}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <p className="text-text-muted text-xs">Every call, verified and timestamped.</p>
      </div>

      {/* === MODAL (reuse SignalDetailModal — portal ke body) === */}
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

      {/* marquee — scroll ke atas, loop, pause saat hover */}
      <style>{`
 @keyframes tgScroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
 .tg-marquee {
 animation-name: tgScroll;
 animation-timing-function: linear;
 animation-iteration-count: infinite;
 animation-duration: 30s;
 will-change: transform;
 }
 .tg-window:hover .tg-marquee { animation-play-state: paused; }
 @media (prefers-reduced-motion: reduce) { .tg-marquee { animation-name: none; } }
 `}</style>
    </section>
  );
}
