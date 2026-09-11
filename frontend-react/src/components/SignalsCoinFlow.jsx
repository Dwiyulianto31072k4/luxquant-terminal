// SignalsCoinFlow — capital rotation on the Signals desk.
// Collapsed: a spark of turnover so the strip is not an empty header.
// Open: ranked table. Intensity = 24h volume ÷ market cap (size-adjusted churn).

import { useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import { SegGroup } from "./ui/SegGroup";

const COUNT_OPTS = [
  { key: "10", label: "10" },
  { key: "20", label: "20" },
  { key: "30", label: "30" },
];

function timeAgo(iso) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function statusMeta(st) {
  const s = (st || "").toLowerCase();
  if (s === "sl" || s === "closed_loss")
    return { l: "SL", c: "bg-loss/12 text-loss" };
  if (s === "closed_win") return { l: "Win", c: "bg-profit/12 text-profit" };
  if (s.startsWith("tp"))
    return { l: s.toUpperCase(), c: "bg-profit/12 text-profit" };
  if (s === "open") return { l: "Open", c: "bg-accent/12 text-accent" };
  return { l: "Open", c: "bg-accent/12 text-accent" };
}

function statusRank(st) {
  const s = (st || "").toLowerCase();
  if (!st) return -1;
  if (s === "sl" || s === "closed_loss") return 0;
  if (s === "open") return 1;
  if (s.startsWith("tp")) return 1 + (parseInt(s.slice(2), 10) || 1);
  if (s === "closed_win") return 6;
  return 1;
}

function Chg({ pct, className = "" }) {
  if (pct == null || Number.isNaN(Number(pct)))
    return <span className={`text-text-muted ${className}`}>—</span>;
  const n = Number(pct);
  return (
    <span
      className={`font-mono tabular-nums ${n >= 0 ? "text-profit" : "text-loss"} ${className}`}
    >
      {n >= 0 ? "+" : ""}
      {n.toFixed(2)}%
    </span>
  );
}

function IntensityCell({ value, max }) {
  const v = value || 0;
  const pct = Math.max(4, Math.min(100, (v / (max || 1)) * 100));
  const hot = pct > 70;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.07] sm:w-20">
        <div
          className={`h-full rounded-full ${hot ? "bg-accent" : "bg-accent/55"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-[11px] tabular-nums text-text-primary">
        {value != null ? value.toFixed(2) : "—"}
      </span>
    </div>
  );
}

function Spark({ rows, maxInt, onPick }) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-end gap-px sm:h-9 sm:gap-0.5">
      {rows.map(({ c, sig }) => {
        const h = Math.max(12, Math.round(((c.flow_intensity || 0) / maxInt) * 100));
        const chg = c.price_change_24h;
        const tone =
          chg == null ? "bg-ink/25" : chg >= 0 ? "bg-profit/70" : "bg-loss/70";
        return (
          <button
            key={c.coin_id || c.symbol}
            type="button"
            title={`${c.symbol} · intensity ${c.flow_intensity?.toFixed(2) ?? "—"} · 24h ${
              chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(c);
            }}
            className={`relative min-w-0 flex-1 rounded-sm ${tone} ${
              c.is_luxquant_signal ? "ring-1 ring-accent/60" : ""
            }`}
            style={{ height: `${h}%` }}
          >
            {sig ? <span className="sr-only">has call</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function SignalsCoinFlow({ coins = [], signals = [], onOpenSignal, onMore }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [sort, setSort] = useState({ key: "intensity", dir: "desc" });

  const findSignal = (sym) =>
    signals.find(
      (s) =>
        (s.pair || "").replace(/USDT$/i, "").toUpperCase() === String(sym).toUpperCase()
    );

  const enriched = useMemo(
    () =>
      coins.map((c) => {
        const sig = findSignal(c.symbol);
        const entry = sig?.entry ? Number(sig.entry) : null;
        const fromCall = entry && c.price ? ((c.price - entry) / entry) * 100 : null;
        return { c, sig, fromCall };
      }),
    // coins/signals identity is the snapshot from the parent fetch
    [coins, signals]
  );

  const sorted = useMemo(() => {
    const val = (x) => {
      switch (sort.key) {
        case "coin":
          return x.c.symbol || "";
        case "chg":
          return x.c.price_change_24h ?? -Infinity;
        case "intensity":
          return x.c.flow_intensity ?? -Infinity;
        case "fromcall":
          return x.fromCall ?? -Infinity;
        case "status":
          return x.sig ? statusRank(x.sig.status) : -Infinity;
        case "called":
          return x.sig?.created_at ? new Date(x.sig.created_at).getTime() : -Infinity;
        default:
          return 0;
      }
    };
    return [...enriched].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [enriched, sort]);

  const rows = sorted.slice(0, count);
  const maxInt = Math.max(...rows.map((r) => r.c.flow_intensity || 0), 0.0001);
  const callN = rows.filter((r) => r.c.is_luxquant_signal).length;
  const top = rows[0]?.c;

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
    );

  const openCoin = (c) => {
    const sig = findSignal(c.symbol);
    if (sig) onOpenSignal?.(sig);
    else onMore?.();
  };

  const SortHead = ({ label, k, align = "right" }) => (
    <th className={`py-1.5 px-2 ${align === "left" ? "text-left" : "text-right"}`}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
          sort.key === k ? "text-text-primary" : "text-text-muted hover:text-text-primary"
        } ${align === "left" ? "" : "flex-row-reverse"}`}
      >
        {label}
        <span className="text-[8px] opacity-70">
          {sort.key === k ? (sort.dir === "desc" ? "↓" : "↑") : ""}
        </span>
      </button>
    </th>
  );

  if (!coins.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-2 text-left"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted ${
              open ? "" : "-rotate-90"
            }`}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          <span className="shrink-0">
            <span className="block text-[13px] font-medium text-text-primary">Coin flow</span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted sm:block">
              {top ? `${top.symbol} ${Number(top.flow_intensity || 0).toFixed(2)}` : "turnover"}
              {callN ? ` · ${callN} calls` : ""}
            </span>
          </span>
        </button>
        <Spark rows={rows} maxInt={maxInt} onPick={openCoin} />
        <button
          type="button"
          onClick={onMore}
          className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted hover:text-accent"
        >
          More
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink/[0.06] px-3 pb-3 pt-2 sm:px-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-snug text-text-muted">
              Intensity = 24h volume ÷ market cap. Green/red in the spark is 24h. Ring = on the desk.
            </p>
            <SegGroup
              size="sm"
              aria-label="How many coins"
              value={String(count)}
              onChange={(k) => setCount(Number(k))}
              options={COUNT_OPTS}
            />
          </div>

          {/* Mobile cards */}
          <div className="space-y-1 sm:hidden">
            {rows.map(({ c, sig, fromCall }, i) => {
              const sm = sig ? statusMeta(sig.status) : null;
              return (
                <button
                  key={c.coin_id || c.symbol}
                  type="button"
                  onClick={() => openCoin(c)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                    c.is_luxquant_signal ? "bg-accent/[0.06]" : "hover:bg-ink/[0.03]"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center font-mono text-[10px] text-text-muted">
                    {i + 1}
                  </span>
                  <CoinLogo pair={`${c.symbol}USDT`} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-text-primary">{c.symbol}</span>
                      {c.is_luxquant_signal ? (
                        <span className="rounded bg-accent/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-accent">
                          Call
                        </span>
                      ) : null}
                      {sm ? (
                        <span className={`rounded px-1 py-px text-[9px] font-medium ${sm.c}`}>{sm.l}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] tabular-nums">
                      <Chg pct={c.price_change_24h} />
                      {fromCall != null ? (
                        <span className="text-text-muted">
                          from call <Chg pct={fromCall} />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <IntensityCell value={c.flow_intensity} max={maxInt} />
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden no-scrollbar -mx-1 overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-ink/[0.06]">
                  <th className="w-6 py-1.5 pl-2 text-left font-mono text-[9px] text-text-muted">#</th>
                  <SortHead label="Coin" k="coin" align="left" />
                  <SortHead label="24h" k="chg" />
                  <SortHead label="Intensity" k="intensity" />
                  <SortHead label="From call" k="fromcall" />
                  <SortHead label="Status" k="status" align="left" />
                  <SortHead label="Called" k="called" align="left" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, sig, fromCall }, i) => {
                  const sm = sig ? statusMeta(sig.status) : null;
                  return (
                    <tr
                      key={c.coin_id || c.symbol}
                      onClick={() => openCoin(c)}
                      className={`cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03] ${
                        c.is_luxquant_signal ? "bg-accent/[0.04]" : ""
                      }`}
                    >
                      <td className="py-2 pl-2 font-mono text-[10px] tabular-nums text-text-muted">
                        {i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <CoinLogo pair={`${c.symbol}USDT`} size={20} />
                          <span className="text-[12.5px] font-medium text-text-primary">
                            {c.symbol}
                          </span>
                          {c.is_luxquant_signal ? (
                            <span className="rounded bg-accent/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-accent">
                              Call
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-[12px]">
                        <Chg pct={c.price_change_24h} className="font-medium" />
                      </td>
                      <td className="px-2 py-2">
                        <IntensityCell value={c.flow_intensity} max={maxInt} />
                      </td>
                      <td className="px-2 py-2 text-right text-[12px]">
                        <Chg pct={fromCall} className="font-medium" />
                      </td>
                      <td className="px-2 py-2">
                        {sm ? (
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${sm.c}`}>
                            {sm.l}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] tabular-nums text-text-muted">
                        {sig?.created_at ? timeAgo(sig.created_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
