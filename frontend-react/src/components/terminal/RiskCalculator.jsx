// ════════════════════════════════════════════════════════════════
// Position Size & Risk Calculator — turns a LuxQuant call into a sized,
// risk-defined trade. Pure client-side math from account size + risk% +
// entry/stop/target. Prefills from any active signal. This is the #1
// practical tool a signal-follower needs: "here's a call → here's exactly
// how much to buy, the R:R, and where I get liquidated."
// ════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import CoinLogo from "../CoinLogo";
import { SectionBand, Kpi } from "./vizShared";

const fmtP = (v) => {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  return v.toPrecision(3);
};
const fmtUsd = (v) =>
  v == null || Number.isNaN(v)
    ? "—"
    : "$" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function RiskTab({ view, deriv }) {
  const [account, setAccount] = useState(1000);
  const [riskPct, setRiskPct] = useState(2);
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [target, setTarget] = useState("");
  const [pair, setPair] = useState(null);
  const [selSig, setSelSig] = useState(null);
  const [q, setQ] = useState("");

  const options = useMemo(() => {
    const seen = new Set();
    const out = [];
    (view || []).forEach((s) => {
      if (!s.pair || seen.has(s.pair) || !s.entry) return;
      seen.add(s.pair);
      out.push(s);
    });
    if (q) {
      const qq = q.toUpperCase();
      return out.filter((s) => s.pair.toUpperCase().includes(qq)).slice(0, 8);
    }
    return out.slice(0, 8);
  }, [view, q]);

  const prefill = (s) => {
    setPair(s.pair);
    setSelSig(s);
    setQ("");
    const e = Number(s.entry) || 0;
    const isShort = (s.signal_direction || "").toUpperCase() === "BEARISH";
    setSide(isShort ? "short" : "long");
    setEntry(e ? String(e) : "");
    if (e && s.max_target_pct != null) {
      const t = isShort ? e * (1 - s.max_target_pct / 100) : e * (1 + s.max_target_pct / 100);
      setTarget(String(Number(t.toPrecision(6))));
    }
    // default stop by risk tier (no explicit SL in the screener blob)
    const slPct = s.risk_norm === "HIGH" ? 0.08 : s.risk_norm === "LOW" ? 0.03 : 0.05;
    if (e) {
      const stop = isShort ? e * (1 + slPct) : e * (1 - slPct);
      setSl(String(Number(stop.toPrecision(6))));
    }
  };

  const E = parseFloat(entry),
    S = parseFloat(sl),
    T = parseFloat(target);
  const acct = Number(account) || 0,
    rpct = Number(riskPct) || 0,
    lev = Math.max(1, Number(leverage) || 1);
  const long = side === "long";
  const atrPct = pair ? (deriv?.pairs?.[pair]?.atr_pct ?? null) : null; // 1h ATR % of price
  const slDistPct = E > 0 && S > 0 ? (Math.abs(E - S) / E) * 100 : null;
  const stopInAtr = atrPct && slDistPct ? slDistPct / atrPct : null; // stop distance in ATRs

  // Correlation / concentration guard — other OPEN calls that would move with
  // this one (same sector or similar BTC-alignment). Taking several = one bet.
  const similar = useMemo(() => {
    if (!selSig) return null;
    const OPEN = new Set(["open", "tp1", "tp2", "tp3"]);
    const sec = selSig.sector || null;
    const ba = selSig.btc_align_score ?? null;
    const seen = new Set();
    const list = [];
    (view || []).forEach((s) => {
      if (s.pair === selSig.pair || seen.has(s.pair)) return;
      if (!OPEN.has((s.status || "").toLowerCase())) return;
      const sameSec = sec && (s.sector || null) === sec;
      const closeBa =
        ba != null && s.btc_align_score != null && Math.abs(s.btc_align_score - ba) <= 12;
      if (sameSec || closeBa) {
        seen.add(s.pair);
        list.push({ s, sameSec, closeBa });
      }
    });
    return { sec, ba, list: list.slice(0, 18) };
  }, [selSig, view]);

  const calc = useMemo(() => {
    if (!(E > 0) || !(S > 0) || !(acct > 0) || !(rpct > 0)) return null;
    const riskPerUnit = Math.abs(E - S);
    if (!riskPerUnit) return null;
    const rewardPerUnit = T > 0 ? Math.abs(T - E) : null;
    const rr = rewardPerUnit != null ? rewardPerUnit / riskPerUnit : null;
    const riskUsd = acct * (rpct / 100);
    const units = riskUsd / riskPerUnit; // coins
    const posUsd = units * E; // notional at entry
    const margin = posUsd / lev;
    const breakevenWR = rr ? 100 / (1 + rr) : null;
    // isolated-margin liquidation estimate (fees/maint. margin ignored)
    const liq = long ? E * (1 - 1 / lev) : E * (1 + 1 / lev);
    const slPastLiq = long ? S <= liq : S >= liq; // stop is beyond liquidation → bad
    const slValidSide = long ? S < E : S > E; // stop on correct side
    const tgtValidSide = T > 0 ? (long ? T > E : T < E) : true;
    const rewardUsd = rr != null ? riskUsd * rr : null;
    return {
      riskPerUnit,
      rr,
      riskUsd,
      units,
      posUsd,
      margin,
      breakevenWR,
      liq,
      slPastLiq,
      slValidSide,
      tgtValidSide,
      rewardUsd,
    };
  }, [E, S, T, acct, rpct, lev, long]);

  const inputCls =
    "w-full bg-surface-secondary border border-ink/[0.12] rounded-md px-3 py-2 text-[13px] text-text-primary font-mono focus:outline-none focus:border-ink/18";
  const labelCls = "font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted mb-1 block";

  // R-ladder geometry (SL = 0R at one end, entry = 1R marker, target = rr)
  const ladder = useMemo(() => {
    if (!calc || !(E > 0) || !(S > 0)) return null;
    const lo = Math.min(E, S, T > 0 ? T : E);
    const hi = Math.max(E, S, T > 0 ? T : E);
    const span = hi - lo || 1;
    const pos = (v) => `${((v - lo) / span) * 100}%`;
    return { pos, hasT: T > 0 };
  }, [calc, E, S, T]);

  return (
    <>
      <SectionBand
        title="Position Size & Risk Calculator"
        desc="Turn any call into a sized, risk-defined trade — how much to buy, your R:R, and where you'd get liquidated. Pick a signal to prefill, or enter levels manually."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
        {/* ── inputs ── */}
        <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden p-4 space-y-3">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />

          {/* signal prefill */}
          <div>
            <label className={labelCls}>Prefill from a call</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={pair || "Search pair…"}
              className={inputCls}
            />
            {q && options.length > 0 && (
              <div className="mt-1 rounded-md bg-surface-secondary border border-ink/[0.1] max-h-52 overflow-auto">
                {options.map((s) => (
                  <button
                    key={s.signal_id}
                    onClick={() => prefill(s)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-ink/[0.05] text-left"
                  >
                    <CoinLogo pair={s.pair} size={16} />
                    <span className="font-mono text-[11px] text-text-primary/85">
                      {s.pair.replace(/USDT$/i, "")}
                    </span>
                    <span className="ml-auto font-mono text-[9px] uppercase text-text-muted">
                      {(s.signal_direction || "long").slice(0, 4)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-1 rounded-md bg-surface-raised border border-ink/[0.1] p-0.5">
            {["long", "short"].map((sd) => (
              <button
                key={sd}
                onClick={() => setSide(sd)}
                className={`flex-1 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${side === sd ? (sd === "long" ? "bg-positive text-surface-raised font-semibold" : "bg-negative text-surface-secondary font-semibold") : "text-text-muted hover:text-text-primary"}`}
              >
                {sd}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Account ($)</label>
              <input
                type="number"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Risk / trade (%)</label>
              <input
                type="number"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Leverage ({lev}×)</label>
            <input
              type="range"
              min="1"
              max="50"
              value={lev}
              onChange={(e) => setLeverage(e.target.value)}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Entry</label>
              <input
                type="number"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Stop-loss</label>
              <input
                type="number"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Target</label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── outputs ── */}
        <div className="space-y-3">
          {!calc ? (
            <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] py-20 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
              Enter account, risk %, entry and stop-loss to size the trade.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label="Position Size"
                  value={fmtUsd(calc.posUsd)}
                  desc={`${fmtP(calc.units)} units @ ${fmtP(E)}`}
                  tone="text-text-primary"
                />
                <Kpi
                  label={`Margin @ ${lev}×`}
                  value={fmtUsd(calc.margin)}
                  desc="Collateral to post."
                />
                <Kpi
                  label="Risk (loss at SL)"
                  value={fmtUsd(calc.riskUsd)}
                  desc={`${rpct}% of account`}
                  tone="text-negative"
                />
                <Kpi
                  label="Reward at target"
                  value={calc.rewardUsd != null ? fmtUsd(calc.rewardUsd) : "—"}
                  desc={calc.rr != null ? `${calc.rr.toFixed(2)}R` : "set a target"}
                  tone="text-positive"
                />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label="Risk : Reward"
                  value={calc.rr != null ? `1 : ${calc.rr.toFixed(2)}` : "—"}
                  desc="Reward per unit of risk."
                  tone={
                    calc.rr >= 2
                      ? "text-positive"
                      : calc.rr != null && calc.rr < 1
                        ? "text-negative"
                        : undefined
                  }
                />
                <Kpi
                  label="Breakeven Win Rate"
                  value={calc.breakevenWR != null ? calc.breakevenWR.toFixed(0) + "%" : "—"}
                  desc="Min win rate to not lose money at this R:R."
                />
                <Kpi
                  label={`Liq. price ≈ ${lev}×`}
                  value={fmtP(calc.liq)}
                  desc="Isolated margin, fees ignored."
                  tone={calc.slPastLiq ? "text-negative" : undefined}
                />
                <Kpi
                  label="Distance to SL"
                  value={slDistPct != null ? slDistPct.toFixed(2) + "%" : "—"}
                  desc={
                    atrPct
                      ? `${stopInAtr != null ? stopInAtr.toFixed(1) : "—"}× 1h-ATR · coin ~${atrPct}%/h`
                      : "Stop distance from entry."
                  }
                  tone={stopInAtr != null && stopInAtr < 1 ? "text-warning" : undefined}
                />
              </div>

              {/* warnings */}
              {(calc.slPastLiq || !calc.slValidSide || !calc.tgtValidSide) && (
                <div className="rounded-xl border border-negative/30 bg-negative/[0.06] px-4 py-2.5 font-mono text-[10.5px] text-negative/90 space-y-1">
                  {!calc.slValidSide && (
                    <div>⚠ Stop-loss is on the wrong side of entry for a {side}.</div>
                  )}
                  {!calc.tgtValidSide && (
                    <div>⚠ Target is on the wrong side of entry for a {side}.</div>
                  )}
                  {calc.slPastLiq && (
                    <div>
                      ⚠ At {lev}× your liquidation ({fmtP(calc.liq)}) triggers before your stop —
                      lower leverage or widen margin.
                    </div>
                  )}
                </div>
              )}

              {/* R-ladder visual */}
              {ladder && (
                <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden p-4">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
                  <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
                    Trade Ladder
                  </div>
                  <div className="relative h-16 rounded-lg bg-ink/[0.02] border border-ink/[0.06]">
                    {/* gradient risk (below entry) / reward (above) */}
                    <div
                      className="absolute inset-y-0 rounded-l-lg"
                      style={{
                        left: 0,
                        right: `${100 - parseFloat(ladder.pos(E))}%`,
                        background: long ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)",
                      }}
                    />
                    {[
                      ["Stop", S, "rgb(var(--neg))"],
                      ["Entry", E, "rgb(var(--accent))"],
                      ladder.hasT ? ["Target", T, "rgb(var(--pos))"] : null,
                    ]
                      .filter(Boolean)
                      .map(([lab, v, c]) => (
                        <div
                          key={lab}
                          className="absolute top-0 bottom-0 flex flex-col items-center justify-between"
                          style={{ left: ladder.pos(v), transform: "translateX(-50%)" }}
                        >
                          <span className="font-mono text-[8.5px] uppercase" style={{ color: c }}>
                            {lab}
                          </span>
                          <span className="w-px flex-1 my-0.5" style={{ background: c }} />
                          <span className="font-mono text-[9px] text-text-primary/70">
                            {fmtP(v)}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 font-mono text-[9px] text-text-muted text-center">
                    risk 1R = {fmtUsd(calc.riskUsd)} ·{" "}
                    {calc.rr != null
                      ? `target = ${calc.rr.toFixed(2)}R (${fmtUsd(calc.rewardUsd)})`
                      : "add a target for R:R"}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Correlation / concentration guard */}
          {selSig && similar && similar.list.length > 0 && (
            <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden p-4">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Correlation &amp; Concentration
              </div>
              <div className="text-[11px] text-text-primary/70 mt-1 leading-relaxed">
                <span className="text-warning">{similar.list.length}</span> other open call
                {similar.list.length > 1 ? "s" : ""} would move with{" "}
                <span className="text-text-primary">
                  {(selSig.pair || "").replace(/USDT$/i, "")}
                </span>
                {similar.sec ? (
                  <>
                    {" "}
                    — same sector (<span className="text-text-primary/80">{similar.sec}</span>)
                  </>
                ) : null}
                {similar.ba != null ? <> or similar BTC-alignment</> : null}. Taking several is
                really one concentrated bet.
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {similar.list.map(({ s, sameSec }) => (
                  <span
                    key={s.pair}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink/[0.02] border border-ink/[0.07] px-2 py-1"
                  >
                    <CoinLogo pair={s.pair} size={15} />
                    <span className="font-mono text-[10.5px] text-text-primary/85">
                      {(s.pair || "").replace(/USDT$/i, "")}
                    </span>
                    <span className="font-mono text-[8px] uppercase text-text-muted/70">
                      {sameSec ? "sector" : "β-btc"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="font-mono text-[9px] text-text-primary/30 leading-relaxed">
            Estimates only — leverage/liquidation math is isolated-margin and ignores fees &
            maintenance margin. Not financial advice; size to what you can afford to lose.
          </p>
        </div>
      </div>
    </>
  );
}

export default RiskTab;
