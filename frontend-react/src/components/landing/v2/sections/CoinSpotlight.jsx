// src/components/landing/v2/sections/CoinSpotlight.jsx
// ════════════════════════════════════════════════════════════════
// CoinSpotlight — MEXC-style coin selector (swipeable chips + search)
// with a compact, redesigned per-coin call-history panel underneath.
// Data: /analytics/edge-lab (coin list) + /signals/journey-insights/{pair}.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import CoinLogo from "../../../CoinLogo";

const C = {
  gold: "#e7c373", goldL: "#f0d890", gold2: "#d4a853", gold3: "#b8893c", gold4: "#8b6914",
  win: "#4ade80", loss: "#f87171", muted: "#8a8f9c",
};
const sym = (p) => (p || "").replace(/USDT$/i, "");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const bigPct = (v) => {
  if (v == null) return "—";
  if (v >= 1000) return `+${(v / 1000).toFixed(1)}K%`;
  if (v >= 100) return `+${Math.round(v)}%`;
  return `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
};
// stablecoins to keep out of the chip rail
const STABLE = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDD", "PYUSD", "BUSD", "USD1", "USDS"]);
// top market-cap order (ex-stablecoins) — these lead the chip rail
const TOP_MCAP = ["BTC", "ETH", "BNB", "SOL", "XRP", "TRX", "DOGE", "ADA", "HYPE", "LINK", "AVAX", "SUI", "TON", "DOT", "BCH"];

function Spinner() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: C.gold }} />
    </div>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="group rounded-xl border border-white/[0.06] bg-surface-raised p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-line/25 hover:shadow-[0_10px_26px_rgba(0,0,0,0.5)]">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums transition-transform duration-300 group-hover:scale-[1.03] group-hover:origin-left lg:text-2xl" style={{ color: accent || "#fff" }}>{value}</p>
    </div>
  );
}

export default function CoinSpotlight() {
  const [coins, setCoins] = useState([]);   // [{pair, sector, median_peak, win_rate, count}]
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState("BTCUSDT");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const railRef = useRef(null);

  // coin list (cached server-side) → chips + search source
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/analytics/edge-lab?days=90&sector=all")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        const lb = (j.coin_leaderboard || []).filter((c) => !STABLE.has(sym(c.pair)));
        const lbMap = new Map(lb.map((c) => [sym(c.pair), c]));
        const majorSet = new Set(TOP_MCAP);
        // 1) top market-cap coins (ex-stablecoins), using leaderboard data if present
        const majors = TOP_MCAP.map((s) => lbMap.get(s) || { pair: `${s}USDT`, win_rate: null, median_peak: null });
        // 2) remaining called coins ordered by best win rate
        const rest = lb
          .filter((c) => !majorSet.has(sym(c.pair)))
          .sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));
        setCoins([...majors, ...rest]);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // selected coin → per-coin journey insights
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    fetch(`/api/v1/signals/journey-insights/${sel}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDetail(j); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [sel]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return coins;
    return coins.filter((c) => sym(c.pair).includes(q));
  }, [coins, query]);

  // search → enter selects the typed pair directly (even if not in list)
  const submitSearch = () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    setSel(q.endsWith("USDT") ? q : `${q}USDT`);
  };

  const ok = detail?.available === true;
  const hit = ok ? detail.hit_rate_per_tp || [] : [];
  const tpColors = [C.goldL, C.gold, C.gold2, C.gold3];
  const outcome = hit.map((h, i) => ({
    label: h.tp,
    count: h.hit_count || 0,
    avg: h.avg_exit_gain_pct,
    color: h.tp === "SL" ? C.loss : tpColors[i] || C.gold,
  }));
  const totalClosed = outcome.reduce((s, o) => s + o.count, 0);
  // overall avg realized PnL per closed trade (weighted by outcome count)
  const avgPnl = (() => {
    let s = 0, n = 0;
    hit.forEach((h) => { if (h.avg_exit_gain_pct != null && h.hit_count) { s += h.avg_exit_gain_pct * h.hit_count; n += h.hit_count; } });
    return n ? s / n : null;
  })();
  const signedPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
  const slRate = hit.find((h) => h.tp === "SL")?.hit_rate_pct;
  const winRate = slRate == null ? null : 100 - slRate;
  const ttp = ok ? detail.time_to_each_tp || [] : [];
  const maxSec = Math.max(...ttp.map((t) => t.avg_seconds || 0), 1);
  const peak = ok ? detail.peak_potential || {} : {};
  const entry = ok ? detail.entry_behavior || {} : {};
  const risk = ok ? detail.risk_profile || {} : {};
  const coinMeta = coins.find((c) => c.pair === sel);

  return (
    <section id="coin-spotlight" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
      {/* header */}
      <div className="mb-8 text-center lg:mb-10">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/60" />
          Per-Coin Track Record
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-gold-primary/60" />
        </span>
        <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-text-primary lg:text-[2.6rem]">
          Track any coin{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark bg-clip-text text-transparent">we've called.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-primary/55 lg:text-base">
          Pick a coin — or search any pair — to see its full, timestamped call history.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-surface-raised shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        {/* ── chip rail + search ── */}
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <div ref={railRef} className="flex gap-2 overflow-x-auto pb-1 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {coins.slice(0, 40).map((c) => {
                const on = c.pair === sel;
                return (
                  <button
                    key={c.pair}
                    onClick={() => setSel(c.pair)}
                    className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-200 hover:-translate-y-0.5 ${
                      on
                        ? "border-gold-primary/50 bg-gold-primary/[0.12] shadow-[0_4px_14px_rgba(212,168,83,0.2)]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <CoinLogo pair={c.pair} size={20} />
                    <span className={`text-[12px] font-semibold ${on ? "text-text-primary" : "text-text-muted"}`}>{sym(c.pair)}</span>
                  </button>
                );
              })}
            </div>
            {/* MEXC-style dark fade + scroll arrow → 3D depth at the edge */}
            <div className="pointer-events-none absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-surface-raised via-surface-raised/75 to-transparent" />
            <button
              onClick={() => railRef.current?.scrollBy({ left: 260, behavior: "smooth" })}
              aria-label="Scroll coins"
              className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-secondary text-text-muted shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all hover:scale-105 hover:border-gold-primary/50 hover:text-gold-primary"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="relative sm:w-48">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                placeholder="Search coin…"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] uppercase text-text-primary placeholder:normal-case placeholder:text-text-muted/70 outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-text-muted hover:text-text-primary" aria-label="Clear">✕</button>
              )}
            </div>

            {/* live preview dropdown (handles similar names) */}
            {query && (
              <div className="absolute right-0 top-full z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-xl border border-white/12 bg-surface-raised p-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
                {filtered.length ? (
                  filtered.slice(0, 14).map((c) => (
                    <button
                      key={c.pair}
                      onClick={() => { setSel(c.pair); setQuery(""); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <CoinLogo pair={c.pair} size={20} />
                      <span className="text-[12px] font-semibold text-text-primary">{sym(c.pair)}<span className="ml-1 font-mono text-[9px] text-text-muted">USDT</span></span>
                      {c.win_rate != null && <span className="ml-auto font-mono text-[10px]" style={{ color: "rgb(var(--pos))" }}>{pct(c.win_rate)}</span>}
                    </button>
                  ))
                ) : (
                  <button
                    onClick={submitSearch}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
                  >
                    Try “{query.toUpperCase().replace(/USDT$/, "")}USDT” →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── detail panel ── */}
        <div className="p-4 lg:p-6">
          {loading ? (
            <Spinner />
          ) : !ok ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <CoinLogo pair={sel} size={34} />
              <p className="text-[13px] font-semibold text-text-primary">{sym(sel)}USDT</p>
              <p className="max-w-xs text-[12px] text-text-muted">
                Not enough calls on this coin yet to build a track record. Try another coin.
              </p>
            </div>
          ) : (
            <>
              {/* coin header */}
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <CoinLogo pair={sel} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold text-text-primary">
                    {sym(sel)}<span className="ml-1 font-mono text-[11px] text-text-muted">USDT</span>
                    {coinMeta?.sector && <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-gold-primary/70">{coinMeta.sector}</span>}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">{detail.sample_size} signals on record</p>
                </div>
                {winRate != null && (
                  <span className="rounded-lg px-2.5 py-1 text-[12px] font-bold" style={{ color: C.win, background: "rgba(74,222,128,0.12)" }}>
                    {pct(winRate)} WR
                  </span>
                )}
              </div>

              {/* stat tiles */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <StatTile label="Win Rate" value={pct(winRate)} accent={C.win} />
                <StatTile label="Avg PnL / trade" value={signedPct(avgPnl)} accent={avgPnl != null && avgPnl < 0 ? C.loss : C.win} />
                <StatTile label="Avg Peak" value={bigPct(peak.avg_peak_excursion_pct)} accent={C.gold} />
                <StatTile label="Best Call" value={bigPct(peak.best_peak_pct)} accent={C.gold} />
              </div>

              {/* donut + time-to-TP */}
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {/* outcome donut */}
                <div className="group rounded-xl border border-white/[0.06] bg-surface-raised p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line/20 hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">Outcome distribution</p>
                  <div className="flex items-center gap-5">
                    <div className="relative h-32 w-32 flex-shrink-0">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={outcome} dataKey="count" nameKey="label" startAngle={90} endAngle={-270} innerRadius="64%" outerRadius="100%" stroke="none" paddingAngle={1.5}>
                            {outcome.map((o) => <Cell key={o.label} fill={o.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-bold tabular-nums text-text-primary">{totalClosed}</span>
                        <span className="font-mono text-[8px] uppercase tracking-wider text-text-muted">closed</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 pb-0.5 font-mono text-[8px] uppercase tracking-wider text-text-muted">
                        <span className="w-2.5 flex-shrink-0" />
                        <span className="w-7">Exit</span>
                        <span className="flex-1 text-right">Avg P/L</span>
                        <span className="w-9 text-right">n</span>
                        <span className="w-8 text-right">%</span>
                      </div>
                      {outcome.map((o) => (
                        <div key={o.label} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: o.color }} />
                          <span className="w-7 font-mono text-[11px] font-semibold" style={{ color: o.label === "SL" ? C.loss : "#fff" }}>{o.label === "TP4" ? "TP4+" : o.label}</span>
                          <span className="flex-1 text-right font-mono text-[11px] tabular-nums" style={{ color: o.avg == null ? C.muted : o.avg >= 0 ? C.win : C.loss }}>{signedPct(o.avg)}</span>
                          <span className="w-9 text-right font-mono text-[11px] tabular-nums text-text-primary">{o.count}</span>
                          <span className="w-8 text-right font-mono text-[9px] text-text-muted">{totalClosed ? ((o.count / totalClosed) * 100).toFixed(0) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 border-t border-white/[0.05] pt-2.5 font-mono text-[8.5px] leading-relaxed text-text-muted">
                    Avg P/L · TP1–TP3 = actual target gains · <span className="text-text-secondary">TP4+ = avg peak</span> (TP4 is the final target — winners usually run beyond it) · SL = avg loss.
                  </p>
                </div>

                {/* time to each TP */}
                <div className="group rounded-xl border border-white/[0.06] bg-surface-raised p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line/20 hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">Time to each TP</p>
                  <div className="space-y-2.5">
                    {ttp.map((t) => (
                      <div key={t.tp}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold" style={{ color: C.gold }}>{t.tp}</span>
                          <span className="font-mono text-[12px] font-semibold tabular-nums text-text-primary">{t.avg_human || "—"}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/40" style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.55)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(((t.avg_seconds || 0) / maxSec) * 100, 3)}%`,
                              background: "linear-gradient(180deg, #f6e0a0 0%, #e7c373 40%, #a8842f 100%)",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 6px rgba(212,168,83,0.35)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-white/[0.06] pt-2.5 font-mono text-[10px] text-text-muted">
                    smooth entry <span className="text-text-primary">{pct(entry.smooth_entry_rate_pct)}</span> · time in profit <span className="text-text-primary">{pct(risk.avg_time_in_profit_pct)}</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
