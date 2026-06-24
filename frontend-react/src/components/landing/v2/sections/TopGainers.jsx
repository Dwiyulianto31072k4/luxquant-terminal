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
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../context/AuthContext";
import CoinLogo from "../../../CoinLogo";
import { SignalDetailModal } from "../../../TopPerformers";

const GOLD_BTN = {
  background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
  color: "#0a0506",
};

const symbolOf = (pair) =>
  pair?.replace(/USDT$/i, "").replace(/^3A/, "") || "—";

// Satu sel coin — flat (hairline grid), bobot ringan (MEXC-style), clickable.
const GainerCard = ({ item, onClick }) => (
  <button
    onClick={onClick}
    className="text-left p-4 bg-[#0a0805] hover:bg-white/[0.025] transition-colors group w-full"
  >
    <div className="flex items-center gap-2.5 mb-3">
      <CoinLogo pair={item.pair} size={26} />
      <div className="min-w-0">
        <p className="text-white text-sm font-medium leading-tight truncate group-hover:text-gold-primary transition-colors">
          {symbolOf(item.pair)}
          <span className="text-text-muted font-normal">USDT</span>
        </p>
      </div>
    </div>
    <p className="text-xl lg:text-2xl font-semibold text-profit leading-none tabular-nums">
      +{(item.gain_pct ?? 0).toFixed(1)}%
    </p>
    <p className="text-text-muted text-[10px] mt-1.5 uppercase tracking-wider">
      Peak gain
    </p>
  </button>
);

const SkeletonCard = () => (
  <div className="p-4 bg-[#0a0805] animate-pulse">
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-full bg-white/[0.06]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-16 bg-white/[0.06] rounded" />
        <div className="h-2.5 w-10 bg-white/[0.04] rounded" />
      </div>
    </div>
    <div className="h-6 w-20 bg-white/[0.06] rounded" />
  </div>
);

export default function TopGainers({ stats, gainers = [], onNav }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState("Daily");
  const goPlatform = () => navigate(isAuthenticated ? "/home" : "/login");

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
    const ids =
      item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
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
  const cleanPair = (p) =>
    p ? p.replace(/^3A/, "").replace(/USDT$/i, "") + "USDT" : "???";

  const filtered = gainers.filter((g) => (g.type || "Daily") === tab);
  // potong ke kelipatan 3 (biar baris 3-kolom rapi), maksimal 21
  const count = Math.floor(Math.min(filtered.length, 21) / 3) * 3;
  const items = filtered.slice(0, count);
  const hasData = gainers.length > 0;
  const canMarquee = items.length >= 6;

  // stat kiri
  const bestGain =
    gainers.length > 0 ? Math.max(...gainers.map((g) => g.gain_pct || 0)) : null;
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
      label: "Best Performer",
      value: fmtPct(bestGain),
      accent: "text-profit",
    },
    {
      // angka netral → putih (MEXC-clean, gak dipaksa warna brand)
      label: "Verified Win Rate",
      value: stats ? `${(stats.win_rate ?? 0).toFixed(1)}%` : "—",
      accent: "text-white",
    },
    {
      label: "Pairs Tracked",
      value: stats ? (stats.active_pairs ?? 0).toLocaleString() : "—",
      accent: "text-white",
    },
  ];

  return (
    <section
      id="signals-preview"
      className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24"
    >
      {/* title — bold (judul boleh tebal), glow halus */}
      <h2
        className="text-center font-bold text-white text-3xl lg:text-5xl tracking-tight mb-12 lg:mb-16"
        style={{ textShadow: "0 0 30px rgba(255,255,255,0.12)" }}
      >
        Top Gainers
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.6fr] gap-8 lg:gap-12 items-center">
        {/* ── LEFT: stats (bobot ringan — semibold, bukan black) ── */}
        <div className="space-y-10 lg:space-y-12 text-center lg:text-left">
          {leftStats.map((s) => (
            <div key={s.label}>
              <p className="text-text-muted text-sm lg:text-base mb-2">
                {s.label}
              </p>
              <p
                className={`font-semibold text-[2.1rem] lg:text-[2.7rem] leading-none tabular-nums ${s.accent}`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── RIGHT: tabbed card ── */}
        <div className="relative rounded-2xl bg-[#0a0805] border border-white/[0.07] p-5 lg:p-7 overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

          {/* header: tabs + More */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-5">
              {["Daily", "Weekly"].map((tt) => (
                <button
                  key={tt}
                  onClick={() => setTab(tt)}
                  className={`text-base font-medium transition-colors ${
                    tab === tt
                      ? "text-white"
                      : "text-text-muted hover:text-white/70"
                  }`}
                >
                  {tt}
                  {tab === tt && (
                    <span className="block h-0.5 mt-1.5 rounded-full bg-gold-primary" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => onNav?.("performance")}
              className="flex items-center gap-1 text-text-muted hover:text-gold-primary text-xs transition-colors"
            >
              More
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* hairline grid — auto-scroll ke atas (loop) + fade gradient (MEXC) */}
          {!hasData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden">
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
                className="tg-marquee grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/[0.06]"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/[0.06] rounded-lg overflow-hidden">
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
              Loading live data…
            </p>
          )}
        </div>
      </div>

      {/* Sign Up Now */}
      <div className="flex justify-center mt-12 lg:mt-16">
        <button
          onClick={goPlatform}
          className="px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide transition-all hover:-translate-y-0.5 shadow-[0_4px_16px_rgba(212,168,83,0.25)] hover:shadow-[0_6px_20px_rgba(212,168,83,0.35)]"
          style={GOLD_BTN}
        >
          {isAuthenticated ? "Open Terminal" : "Sign Up Now"}
        </button>
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