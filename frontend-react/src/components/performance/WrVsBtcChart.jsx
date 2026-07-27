// src/components/performance/WrVsBtcChart.jsx
// ════════════════════════════════════════════════════════════════
// Win rate benchmarked against Bitcoin.
//
// Replaces the old standalone "Win Rate Trend" line, which showed the edge
// with nothing to hold it against — an 85% line is unreadable on its own,
// because the honest question is whether it holds when BTC is falling.
// Here the WR line sits over BTC candlesticks on a second axis, plus the
// three numbers that answer it directly: correlation, and win rate split
// across BTC up-days vs down-days.
//
// Data: /api/v1/analytics/wr-vs-btc?range=all (cached server-side), sliced
// client-side so switching range is instant and costs no request.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { InfoTip, SECTION_INFO } from "./MetricInfo";

const API_BASE = "/api/v1";
const RANGES = [
  { id: "30D", days: 30 },
  { id: "90D", days: 90 },
  { id: "1Y", days: 365 },
  { id: "ALL", days: Infinity },
];

const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const signed = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx,
      b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

// Candlestick drawn into a recharts range-Bar ([low, high]); body = open→close.
function Candle({ x, y, width, height, payload }) {
  const { o, h, l, c } = payload || {};
  if (o == null || h == null || l == null || c == null || !height) return null;
  const span = h - l || 1;
  const pxPer = height / span;
  const up = c >= o;
  const color = up ? "rgb(var(--pos))" : "rgb(var(--neg))";
  const cx = x + width / 2;
  const bodyTop = y + (h - Math.max(o, c)) * pxPer;
  const bodyH = Math.max(Math.abs(c - o) * pxPer, 1);
  const bw = Math.max(Math.min(width * 0.7, 7), 1.2);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} opacity={0.75} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} rx={0.5} fill={color} opacity={0.9} />
    </g>
  );
}

function ChartTip({ active, payload, showBtc }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-md border border-ink/12 bg-surface-secondary px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="mb-1 text-text-muted">{d.date}</div>
      <div className="text-text-primary">
        Win rate <span className="text-accent-text">{pct(d.wr)}</span>
        <span className="ml-1 text-text-muted">({d.closed} closed)</span>
      </div>
      {showBtc && d.c != null && (
        <div className="mt-0.5 text-text-primary">
          BTC <span className="text-text-muted">${Math.round(d.c).toLocaleString()}</span>
          {d.chg != null && (
            <span className={d.chg >= 0 ? "ml-1 text-profit" : "ml-1 text-loss"}>
              {signed(d.chg)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function WrVsBtcChart() {
  const [series, setSeries] = useState([]);
  const [rangeId, setRangeId] = useState("90D");
  const [showBtc, setShowBtc] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/analytics/wr-vs-btc?range=all`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setSeries((j?.series || []).filter((r) => r.win_rate != null));
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const { rows, wrAvg, corr, upWR, downWR, btcDelta, btcMin, btcMax } = useMemo(() => {
    const days = RANGES.find((r) => r.id === rangeId)?.days ?? 90;
    const src = days === Infinity ? series : series.slice(-days);
    const td = src.map((r) => ({
      date: r.date,
      wr: r.win_rate,
      o: r.btc_open,
      h: r.btc_high,
      l: r.btc_low,
      c: r.btc_close,
      range: [r.btc_low, r.btc_high],
      chg: r.btc_open ? ((r.btc_close - r.btc_open) / r.btc_open) * 100 : null,
      closed: r.total_closed,
    }));
    const lows = src.map((r) => r.btc_low).filter((v) => v != null);
    const highs = src.map((r) => r.btc_high).filter((v) => v != null);
    const lo = lows.length ? Math.min(...lows) : 0;
    const hi = highs.length ? Math.max(...highs) : 1;
    const pad = (hi - lo) * 0.06;
    const wsum = src.reduce((s, r) => s + r.win_rate * r.total_closed, 0);
    const nsum = src.reduce((s, r) => s + r.total_closed, 0);
    // Days with too few closes are noise, not signal — 3 is the floor for a
    // daily win rate to mean anything.
    const sig = td.filter((d) => d.closed >= 3 && d.chg != null);
    const wAvg = (arr) => {
      const w = arr.reduce((s, d) => s + d.wr * d.closed, 0);
      const n = arr.reduce((s, d) => s + d.closed, 0);
      return n ? w / n : null;
    };
    const withBtc = src.filter((r) => r.btc_close != null);
    const first = withBtc[0]?.btc_close;
    const last = withBtc[withBtc.length - 1]?.btc_close;
    return {
      rows: td,
      wrAvg: nsum ? wsum / nsum : 0,
      corr: pearson(sig.map((d) => d.wr), sig.map((d) => d.chg)),
      upWR: wAvg(sig.filter((d) => d.chg > 0)),
      downWR: wAvg(sig.filter((d) => d.chg < 0)),
      btcDelta: first && last ? ((last - first) / first) * 100 : null,
      btcMin: lo - pad,
      btcMax: hi + pad,
    };
  }, [series, rangeId]);

  const swing = upWR != null && downWR != null ? upWR - downWR : null;

  return (
    <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-5">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-normal tracking-tight text-text-primary">
            Win Rate × Bitcoin
            <InfoTip info={SECTION_INFO.wr_btc} />
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
            does the edge survive every BTC regime?
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-ink/10 bg-surface-secondary p-0.5 font-mono text-[10px]">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRangeId(r.id)}
                aria-pressed={rangeId === r.id}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  rangeId === r.id
                    ? "bg-accent text-accent-fg"
                    : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-ink/10 bg-surface-secondary p-0.5 font-mono text-[10px]">
            {[
              { id: false, label: "Win rate" },
              { id: true, label: "vs BTC" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setShowBtc(o.id)}
                aria-pressed={showBtc === o.id}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  showBtc === o.id
                    ? "bg-accent text-accent-fg"
                    : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* benchmark stats — the reason this chart exists */}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[11px]">
        <span className="text-text-muted">
          WR <b className="text-accent-text">{pct(wrAvg)}</b>
        </span>
        {showBtc && btcDelta != null && (
          <span className="text-text-muted">
            BTC{" "}
            <b className={btcDelta >= 0 ? "text-profit" : "text-loss"}>{signed(btcDelta)}</b> over
            range
          </span>
        )}
        {showBtc && corr != null && (
          <span className="text-text-muted">
            Correlation{" "}
            <b className="text-accent-text">
              r {corr >= 0 ? "+" : ""}
              {corr.toFixed(2)}
            </b>
          </span>
        )}
      </div>

      <div className="h-56 w-full lg:h-72">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-ink/[0.04]" />
        ) : rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: showBtc ? 2 : 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="perfWrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ink) / 0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgb(var(--fg-muted))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dy={8}
                minTickGap={28}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString("en", { month: "short", year: "2-digit" })
                }
              />
              <YAxis
                yAxisId="wr"
                stroke="rgb(var(--fg-muted))"
                fontSize={10}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="btc"
                orientation="right"
                hide={!showBtc}
                stroke="rgb(var(--fg-muted))"
                fontSize={9}
                width={34}
                domain={[btcMin, btcMax]}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTip showBtc={showBtc} />} />
              {showBtc && (
                <Bar yAxisId="btc" dataKey="range" shape={<Candle />} isAnimationActive={false} />
              )}
              <ReferenceLine
                yAxisId="wr"
                y={wrAvg}
                stroke="rgb(var(--accent) / 0.3)"
                strokeDasharray="4 4"
              />
              {!showBtc && (
                <Area yAxisId="wr" type="monotone" dataKey="wr" stroke="none" fill="url(#perfWrFill)" />
              )}
              <Line
                yAxisId="wr"
                type="monotone"
                dataKey="wr"
                stroke="rgb(var(--accent))"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: "rgb(var(--accent))", stroke: "rgb(var(--surface))", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-muted">
            no data in range
          </div>
        )}
      </div>

      {/* the punchline: does it hold when BTC falls? */}
      {upWR != null && downWR != null && (
        <p className="mt-3 border-t border-ink/[0.06] pt-2.5 font-mono text-[10px] leading-relaxed text-text-muted">
          On BTC <span className="text-profit">up</span> days WR{" "}
          <b className="text-text-primary">{pct(upWR)}</b> · on BTC{" "}
          <span className="text-loss">down</span> days WR{" "}
          <b className="text-text-primary">{pct(downWR)}</b>
          {swing != null && (
            <>
              {" "}
              · {signed(swing)} swing —{" "}
              {Math.abs(swing) < 5 ? "holds up across regimes" : "co-moves with BTC"}
            </>
          )}
        </p>
      )}
    </div>
  );
}
