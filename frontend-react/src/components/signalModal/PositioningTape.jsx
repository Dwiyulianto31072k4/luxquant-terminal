import CoinLogo from "../CoinLogo";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseMcap(mcap) {
  if (mcap == null || mcap === "") return null;
  if (typeof mcap === "number") return mcap > 0 ? mcap : null;
  const str = String(mcap).toUpperCase();
  const parsed = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (str.includes("T")) return parsed * 1e12;
  if (str.includes("B")) return parsed * 1e9;
  if (str.includes("M")) return parsed * 1e6;
  if (str.includes("K")) return parsed * 1e3;
  return parsed;
}

export function money(val) {
  const n = num(val);
  if (n == null || n < 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(val, digits = 2) {
  const n = num(val);
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function ratioTxt(val, digits = 4) {
  const n = num(val);
  if (n == null) return "—";
  return n.toFixed(digits);
}

function countdown(ms) {
  if (!ms) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function longPctFromRatio(ratio) {
  const r = num(ratio);
  if (r == null || r < 0) return null;
  return (r / (r + 1)) * 100;
}

export function readPositioning(deriv) {
  const g = num(deriv?.lsGlobal?.ratio);
  const a = num(deriv?.lsTopAccounts?.ratio);
  const p = num(deriv?.lsTopPositions?.ratio);
  const ratios = [g, a, p].filter((n) => n != null);
  if (!ratios.length) return null;

  const avg = ratios.reduce((sum, n) => sum + n, 0) / ratios.length;
  const longPct = longPctFromRatio(avg);
  const allLong = ratios.every((r) => r > 1.05);
  const allShort = ratios.every((r) => r < 0.95);
  const opposite = g != null && p != null && (g - 1) * (p - 1) < 0;
  const split = g != null && p != null && Math.abs(g - p) >= 0.45;

  // Describes what the books show, and stops there. This used to end in a call:
  // 64% long was printed as "LEAN SHORT" — the contrarian read — so a trade
  // recommendation sat next to raw exchange data, inverted on the way past. The
  // metrics are the product; the reader decides what they mean.
  let note = "Books are mixed \u2014 no one-sided crowd.";
  if (opposite) {
    note = "Top accounts and the global crowd sit on opposite sides.";
  } else if (allLong) {
    note = "All three books sit above 1 \u2014 more long than short.";
  } else if (allShort) {
    note = "All three books sit below 1 \u2014 more short than long.";
  } else if (avg > 1.15) {
    note = "Positioning tilts long across the books.";
  } else if (avg < 0.87) {
    note = "Positioning tilts short across the books.";
  }

  const splitLabel = opposite ? "opposite" : split ? "wide" : "aligned";

  return {
    longPct,
    note,
    splitLabel,
    top: p,
    global: g,
  };
}

function Kv({ label, hint, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <span className="text-[12.5px] text-text-muted">{label}</span>
      <span className="min-w-0 text-right font-mono text-[13.5px] font-medium tabular-nums text-text-primary">
        {children}
        {hint ? <span className="ml-2 text-[11px] font-normal text-text-muted">{hint}</span> : null}
      </span>
    </div>
  );
}

function LsRow({ label, book }) {
  if (!book || num(book.ratio) == null) return null;
  const longPct = num(book.longPct) ?? longPctFromRatio(book.ratio);
  const shortPct = num(book.shortPct) ?? (longPct != null ? 100 - longPct : null);
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-text-muted">{label}</span>
        <span className="font-mono text-[15px] font-semibold tabular-nums text-text-primary">
          {ratioTxt(book.ratio)}
        </span>
      </div>
      {longPct != null && shortPct != null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-positive">
            {Math.round(longPct)}L
          </span>
          <div className="flex h-3 flex-1 overflow-hidden rounded-sm bg-ink/[0.06]">
            <div className="h-full bg-positive/80" style={{ width: `${longPct}%` }} />
            <div className="h-full bg-negative/80" style={{ width: `${shortPct}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-negative">
            {Math.round(shortPct)}S
          </span>
        </div>
      ) : null}
    </div>
  );
}

function FundingSpark({ series }) {
  const values = (series || []).map(num).filter((n) => n != null);
  if (values.length < 2) return null;
  const w = 120;
  const h = 28;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 0.001;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const stroke = last >= 0 ? "rgb(var(--neg))" : "rgb(var(--pos))";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-[7.5rem]" aria-hidden>
      <polyline fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

/**
 * Per-coin positioning tape for SignalModal — L/S books, funding, OI,
 * volume ratios, and a fade-the-crowd read. Sized as a desk card, not a chip.
 */
export default function PositioningTape({
  pair,
  livePrice,
  change24h,
  formatPrice,
  deriv,
  marketCap,
  compact = false,
}) {
  const base = String(pair || "").replace(/(USDT|USDC|USD)$/i, "") || "—";
  const funding = num(deriv?.funding);
  const fundingPos = funding != null && funding > 0;
  const next = countdown(deriv?.nextFundingMs);
  const oi = num(deriv?.oiUsd);
  const oiCh = num(deriv?.oiChange24h);
  const futVol = num(deriv?.volume24h);
  const spotVol = num(deriv?.spotVolume24h);
  const mcap = parseMcap(marketCap);
  const change7d = num(deriv?.change7d);
  const trend = deriv?.fundingTrend || [];
  const read = readPositioning(deriv);

  const oiMcap = oi != null && mcap > 0 ? (oi / mcap) * 100 : null;
  const futSpot = futVol != null && spotVol > 0 ? futVol / spotVol : null;
  const oiFut = oi != null && futVol > 0 ? oi / futVol : null;


  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-surface-raised">
      <div className={`border-b border-ink/[0.07] ${compact ? "px-3 py-2.5" : "px-3.5 py-3"}`}>
        <div className="flex items-center gap-2.5">
          <CoinLogo pair={pair} size={compact ? 22 : 26} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-display text-[15px] font-semibold tracking-tight text-text-primary">
                {base}
              </span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-text-primary">
                {livePrice > 0 && formatPrice ? formatPrice(livePrice) : "—"}
              </span>
              {change24h != null && (
                <span
                  className={`font-mono text-[12px] tabular-nums ${
                    change24h >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  24h {pct(change24h)}
                </span>
              )}
              {change7d != null && (
                <span
                  className={`font-mono text-[12px] tabular-nums ${
                    change7d >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  7d {pct(change7d)}
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Positioning · perp
            </p>
          </div>
        </div>
      </div>

      <div className={`divide-y divide-ink/[0.06] ${compact ? "px-3" : "px-3.5"}`}>
        <div className="py-1.5">
          <Kv label="Market cap">{mcap ? money(mcap) : marketCap || "—"}</Kv>
          <Kv
            label="Open interest"
            hint={oiCh != null ? `${pct(oiCh)} 24h` : null}
          >
            {money(oi)}
          </Kv>
          <Kv label="Futures volume">{money(futVol)}</Kv>
          <Kv label="Spot volume">{money(spotVol)}</Kv>
        </div>

        <div className="py-1.5">
          <Kv label="OI / mcap">{oiMcap != null ? `${oiMcap.toFixed(1)}%` : "—"}</Kv>
          <Kv label="Futures / spot">{futSpot != null ? `${futSpot.toFixed(1)}x` : "—"}</Kv>
          <Kv label="OI / fut volume">{oiFut != null ? oiFut.toFixed(2) : "—"}</Kv>
        </div>

        <div className="py-1.5">
          <Kv
            label="Funding"
            hint={
              funding != null
                ? `${fundingPos ? "longs pay" : "shorts pay"}${next ? ` · ${next}` : ""}`
                : null
            }
          >
            <span className={fundingPos ? "text-negative" : "text-positive"}>
              {funding != null ? `${funding >= 0 ? "+" : ""}${funding.toFixed(4)}%` : "—"}
            </span>
          </Kv>
          {trend.length > 0 && (
            <div className="flex items-center justify-between gap-3 py-[7px]">
              <span className="text-[12.5px] text-text-muted">Funding trend</span>
              <div className="flex min-w-0 items-center gap-2">
                <FundingSpark series={trend} />
                <span className="truncate font-mono text-[10.5px] tabular-nums text-text-muted">
                  {trend.map((v) => (num(v) == null ? "—" : num(v).toFixed(2))).join(" ")}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="py-1">
          <LsRow label="L/S global" book={deriv?.lsGlobal} />
          <LsRow label="L/S top accounts" book={deriv?.lsTopAccounts} />
          <LsRow label="L/S top positions" book={deriv?.lsTopPositions} />
          <Kv label="Taker buy/sell">
            {num(deriv?.takerBuySell) != null ? num(deriv.takerBuySell).toFixed(4) : "—"}
          </Kv>
        </div>
      </div>

      {read ? (
        <div className="border-t border-ink/[0.07] bg-ink/[0.025] px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Crowd positioning
              <span className="ml-1.5 text-text-secondary">{read.splitLabel}</span>
            </p>
            {read.top != null && read.global != null ? (
              <p className="font-mono text-[11px] tabular-nums text-text-muted">
                top {read.top.toFixed(2)} vs global {read.global.toFixed(2)}
              </p>
            ) : null}
          </div>

          {read.longPct != null ? (
            <div className="mt-2.5">
              <div className="flex h-3.5 overflow-hidden rounded-sm bg-ink/[0.06]">
                <div className="h-full bg-positive/80" style={{ width: `${read.longPct}%` }} />
                <div className="h-full bg-negative/80" style={{ width: `${100 - read.longPct}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
                <span className="text-positive">{Math.round(read.longPct)}% long</span>
                <span className="text-negative">{Math.round(100 - read.longPct)}% short</span>
              </div>
            </div>
          ) : null}

          <p className="mt-2.5 text-[12px] leading-snug text-text-secondary">{read.note}</p>
        </div>
      ) : null}
    </div>
  );
}
