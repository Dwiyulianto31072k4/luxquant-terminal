import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";

// ─── Elegant custom icons (thin 1.5 stroke, characterful) ───────────────────
const Icon = {
  // Layered shield — depth via two offset plates, not a flat lock
  shield: (cls = "w-3.5 h-3.5") => (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 6v5.5c0 4 2.9 6.9 7 8.5 4.1-1.6 7-4.5 7-8.5V6l-7-3Z" />
      <path d="M9.2 12.2 11 14l3.8-4" opacity="0.7" />
    </svg>
  ),
  // Rebound arc — a single upward bounce, dynamic; replaces the refresh loop
  rebound: (cls = "w-3.5 h-3.5") => (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 16c3-6 6-8 9.5-8H19" />
      <path d="M15.5 4.5 20 8l-3.5 3.5" opacity="0.85" />
    </svg>
  ),
  // Crosshair target — focused action marker
  target: (cls = "w-3.5 h-3.5") => (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" opacity="0.7" />
      <path d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3" opacity="0.5" />
    </svg>
  ),
  external: (cls = "w-2.5 h-2.5") => (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  arrowRight: (cls = "w-3 h-3") => (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  chevron: (cls = "w-2.5 h-2.5") => (
    <svg className={cls} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 3.5 5 6.5 8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const BtcDomAlert = ({ allSignals, onSignalClick }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const btcdomSignal = useMemo(() => {
    if (!allSignals || allSignals.length === 0) return null;
    const btcdomSignals = allSignals
      .filter((s) => s.pair && s.pair.toUpperCase().includes("BTCDOM"))
      .sort((a, b) => (b.call_message_id || 0) - (a.call_message_id || 0));
    return btcdomSignals.length > 0 ? btcdomSignals[0] : null;
  }, [allSignals]);

  if (!btcdomSignal) return null;

  const isLoss = ["closed_loss", "sl"].includes(btcdomSignal.status);

  const formatPrice = (price) => {
    if (!price && price !== 0) return "-";
    const num = parseFloat(price);
    return isNaN(num) ? "-" : num.toFixed(2);
  };

  const getStatusLabel = (status) => {
    const map = {
      open: "OPEN",
      tp1: "TP1 HIT",
      tp2: "TP2 HIT",
      tp3: "TP3 HIT",
      closed_win: "TP4 HIT",
      tp4: "TP4 HIT",
      closed_loss: "STOPPED",
      sl: "STOPPED",
    };
    return map[status] || status?.toUpperCase();
  };

  const getStatusColor = (status) => {
    if (["tp1", "tp2", "tp3", "closed_win", "tp4"].includes(status))
      return { bg: "rgba(34,197,94,0.12)", text: "#22c55e", border: "rgba(34,197,94,0.25)" };
    if (["closed_loss", "sl"].includes(status))
      return { bg: "rgba(239,68,68,0.12)", text: "#ef4444", border: "rgba(239,68,68,0.25)" };
    return { bg: "rgb(var(--ink) / 0.05)", text: "#fff", border: "rgb(var(--ink) / 0.1)" };
  };

  const sc = getStatusColor(btcdomSignal.status);

  const formatTimeAgo = (dt) => {
    if (!dt) return "";
    const diffMs = new Date() - new Date(dt);
    if (diffMs < 0) return "just now";
    const mins = Math.floor(diffMs / 60000),
      hrs = Math.floor(mins / 60),
      days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  };

  const formatExactTime = (dt) => {
    if (!dt) return "";
    const d = new Date(dt);
    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short" });
    const hours = d.getHours().toString().padStart(2, "0");
    const mins = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${month}, ${hours}:${mins}`;
  };

  const getRiskLabel = (riskStr) => {
    const r = (riskStr || "").toLowerCase();
    if (r.startsWith("low")) return "Low";
    if (r.startsWith("med")) return "Medium";
    if (r.startsWith("high")) return "High";
    return "Normal";
  };

  const riskColor = btcdomSignal.risk_level?.toLowerCase().startsWith("low")
    ? "#22c55e"
    : btcdomSignal.risk_level?.toLowerCase().startsWith("high")
      ? "#ef4444"
      : "rgb(var(--accent))";

  const tpLevels = [
    {
      label: "TP1",
      value: btcdomSignal.target1,
      hit: ["tp1", "tp2", "tp3", "closed_win", "tp4"].includes(btcdomSignal.status),
    },
    {
      label: "TP2",
      value: btcdomSignal.target2,
      hit: ["tp2", "tp3", "closed_win", "tp4"].includes(btcdomSignal.status),
    },
    {
      label: "TP3",
      value: btcdomSignal.target3,
      hit: ["tp3", "closed_win", "tp4"].includes(btcdomSignal.status),
    },
    {
      label: "TP4",
      value: btcdomSignal.target4,
      hit: ["closed_win", "tp4"].includes(btcdomSignal.status),
    },
  ].filter((tp) => tp.value);

  const hitCount = tpLevels.filter((tp) => tp.hit).length;
  const progressWidth = tpLevels.length > 1 ? `${(hitCount / (tpLevels.length - 1)) * 100}%` : "0%";

  // Refined palette: subtle gold accent throughout; red only when the signal is stopped.
  const accent = isLoss ? "#ef4444" : "rgb(var(--accent))";

  return (
    <div className="mb-4">
      {/* ─────────────────────────────────────
 COLLAPSED BAR
 ───────────────────────────────────── */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors duration-200"
        style={{
          background: "rgba(18, 12, 10, 0.55)",
          border: "1px solid rgb(var(--line) / 0.10)",
          borderLeft: `2px solid ${accent}55`,
        }}
      >
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <CoinLogo pair="BTCUSDT" size={32} />
            {/* warning badge */}
            <span
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ring-2 ring-surface-secondary"
              style={{ background: accent, color: "rgb(var(--accent-fg))" }}
            >
              !
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-wide text-text-primary leading-tight">
              BTC Dominance Index Warning
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted/70 leading-tight mt-0.5">
              Macro Market Condition
            </p>
          </div>
        </div>

        {/* Center: Timestamps */}
        <div className="hidden md:flex items-center gap-4 text-[10px] text-text-muted ml-auto mr-2">
          <span className="flex items-center gap-1.5">
            <span className="text-text-muted/50 uppercase tracking-wider text-[9px]">Called</span>
            <strong className="text-text-primary/90 font-mono font-medium">
              {formatExactTime(btcdomSignal.created_at)}
            </strong>
            <span className="text-text-muted/40">· {formatTimeAgo(btcdomSignal.created_at)}</span>
          </span>
          {btcdomSignal.last_update_at && (
            <>
              <span className="w-px h-3 bg-ink/10" />
              <span className="flex items-center gap-1.5">
                <span className="text-text-muted/50 uppercase tracking-wider text-[9px]">
                  Update
                </span>
                <strong className="font-mono font-medium" style={{ color: sc.text }}>
                  {formatExactTime(btcdomSignal.last_update_at)}
                </strong>
                <span className="text-text-muted/40">
                  · {formatTimeAgo(btcdomSignal.last_update_at)}
                </span>
              </span>
            </>
          )}
        </div>

        {/* Right: Status + chevron */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
            style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
          >
            {getStatusLabel(btcdomSignal.status)}
          </span>
          <span
            className={`text-text-muted/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            {Icon.chevron("w-2.5 h-2.5")}
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────
 EXPANDED PANEL — refined minimal
 ───────────────────────────────────── */}
      {expanded && (
        <div
          className="mt-1.5 rounded-xl overflow-hidden bda-panel"
          style={{
            background: "rgba(12, 8, 8, 0.92)",
            border: "1px solid rgb(var(--line) / 0.10)",
          }}
        >
          {/* faint top hairline accent */}
          <div
            className="h-px w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}40, transparent)` }}
          />

          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN ── identity + data */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                {/* Coin identity row */}
                <div
                  className="flex items-center justify-between gap-3 bda-stagger"
                  style={{ "--d": "40ms" }}
                >
                  <div className="flex items-center gap-3">
                    <CoinLogo pair="BTCUSDT" size={38} />
                    <div>
                      <h4 className="text-text-primary text-[15px] font-bold tracking-tight leading-none">
                        BTCDOMUSDT
                      </h4>
                      <p className="text-text-muted/70 text-[10px] uppercase tracking-[0.16em] mt-1">
                        Dominance Index
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://www.binance.com/en/support/faq/what-is-bitcoin-dominance-btcdom-e3b1ab97a3e24df4b0e41a469ccf7a21"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-ink/[0.03] border border-ink/[0.07] text-text-muted hover:text-text-primary hover:border-ink/15 transition-all text-[9px] font-medium uppercase tracking-wider"
                    >
                      Learn {Icon.external("w-2.5 h-2.5")}
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSignalClick && onSignalClick(btcdomSignal);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
                      style={{
                        background: `${accent}12`,
                        color: accent,
                        border: `1px solid ${accent}2a`,
                      }}
                    >
                      Open Chart {Icon.arrowRight("w-3 h-3")}
                    </button>
                  </div>
                </div>

                {/* Stat strip — compact inline, divided (secondary data) */}
                <div
                  className="flex items-stretch rounded-xl overflow-hidden bda-stagger"
                  style={{
                    background: "rgb(var(--ink) / 0.015)",
                    border: "1px solid rgb(var(--ink) / 0.05)",
                    "--d": "90ms",
                  }}
                >
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[8px] text-text-muted/60 uppercase tracking-[0.16em] mb-1">
                      Entry
                    </p>
                    <p className="text-text-primary font-mono text-[15px] font-semibold leading-none">
                      {formatPrice(btcdomSignal.entry)}
                    </p>
                  </div>
                  <div className="w-px bg-ink/[0.06]" />
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[8px] text-text-muted/60 uppercase tracking-[0.16em] mb-1">
                      Stop Loss
                    </p>
                    <p className="font-mono text-[15px] font-semibold leading-none text-loss/90">
                      {formatPrice(btcdomSignal.stop1)}
                    </p>
                  </div>
                  <div className="w-px bg-ink/[0.06]" />
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[8px] text-text-muted/60 uppercase tracking-[0.16em] mb-1">
                      Risk
                    </p>
                    <p
                      className="text-[15px] font-semibold leading-none"
                      style={{ color: riskColor }}
                    >
                      {getRiskLabel(btcdomSignal.risk_level)}
                    </p>
                  </div>
                </div>

                {/* Target Journey */}
                {tpLevels.length > 0 && (
                  <div className="bda-stagger" style={{ "--d": "140ms" }}>
                    <p className="text-[8px] text-text-muted/60 uppercase tracking-[0.16em] mb-3">
                      Target Journey
                    </p>
                    <div className="relative w-full px-1">
                      <div className="absolute top-[4px] left-1 right-1 h-px bg-ink/[0.08] rounded-full" />
                      <div
                        className="absolute top-[4px] left-1 h-px rounded-full transition-all duration-1000"
                        style={{
                          width: progressWidth,
                          background: "#22c55e",
                          boxShadow: "0 0 6px rgba(34,197,94,0.5)",
                        }}
                      />
                      <div className="relative flex justify-between items-start z-10">
                        {tpLevels.map((tp, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full ring-4 ring-surface-raised transition-all ${tp.hit ? "bg-positive" : "bg-surface-raised"}`}
                              style={tp.hit ? { boxShadow: "0 0 6px #4ade80" } : undefined}
                            />
                            <span
                              className={`text-[9px] font-semibold tracking-wide ${tp.hit ? "text-positive" : "text-text-muted"}`}
                            >
                              {tp.label}
                            </span>
                            <span
                              className={`text-[8px] font-mono ${tp.hit ? "text-text-primary/70" : "text-text-muted/35"}`}
                            >
                              {formatPrice(tp.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN ── action plan */}
              <div
                className="lg:col-span-5 flex flex-col gap-4 lg:pl-6 lg:border-l border-ink/[0.06] bda-stagger"
                style={{ "--d": "110ms" }}
              >
                {/* Section label */}
                <div className="flex items-center gap-2" style={{ color: accent }}>
                  {Icon.target("w-3.5 h-3.5")}
                  <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase">Action Plan</h3>
                </div>

                {/* Hero statement — the focus, via size + space (not loud color) */}
                <div className="relative pl-4">
                  <div
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                    style={{ background: `${accent}80` }}
                  />
                  <p className="text-text-primary text-[14px] font-semibold leading-snug">
                    If{" "}
                    <span className="font-mono" style={{ color: accent }}>
                      $BTCDOM
                    </span>{" "}
                    is rising,
                    <br className="hidden sm:block" />{" "}
                    <span className="text-loss">sell your altcoins.</span>
                  </p>
                  <p className="text-text-muted/80 text-[10px] leading-relaxed mt-1.5">
                    BTC absorbs market liquidity. Even if BTC dumps, altcoins tend to dump harder.
                  </p>
                </div>

                {/* Action items */}
                <div className="flex flex-col gap-3.5 pt-1">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-text-muted"
                      style={{
                        background: "rgb(var(--ink) / 0.03)",
                        border: "1px solid rgb(var(--ink) / 0.06)",
                      }}
                    >
                      {Icon.shield("w-3.5 h-3.5")}
                    </div>
                    <div>
                      <p className="text-text-primary/90 text-[10px] font-bold uppercase tracking-[0.14em] leading-none mb-1.5">
                        Risk Management
                      </p>
                      <p className="text-text-muted/80 text-[10px] leading-relaxed">
                        Reduce position sizes drastically. Keep capital in liquid funds (USDT).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-positive/80"
                      style={{
                        background: "rgba(34,197,94,0.05)",
                        border: "1px solid rgba(34,197,94,0.12)",
                      }}
                    >
                      {Icon.rebound("w-3.5 h-3.5")}
                    </div>
                    <div>
                      <p className="text-positive/90 text-[10px] font-bold uppercase tracking-[0.14em] leading-none mb-1.5">
                        Recovery Plan
                      </p>
                      <p className="text-text-muted/80 text-[10px] leading-relaxed">
                        Buy back when reversal signs appear, or redeploy into high-probability
                        setups.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
 @keyframes bdaPanelIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
 .bda-panel { animation: bdaPanelIn 0.28s cubic-bezier(.16,1,.3,1); }
 @keyframes bdaStaggerIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
 .bda-stagger { animation: bdaStaggerIn 0.4s cubic-bezier(.16,1,.3,1) backwards; animation-delay: var(--d, 0ms); }
 `}</style>
    </div>
  );
};

export default BtcDomAlert;
