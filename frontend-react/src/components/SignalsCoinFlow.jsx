// SignalsCoinFlow — where money is turning over, and whether LuxQuant is on it.
//
// Collapsed: the busiest coins by name and face, not an abstract bar strip. A
// row of ten anonymous blocks stretched across a desktop is a colour band, not
// a chart, and it never said which coin was which.
// Open: ranked table, filterable by whether the coin has a LuxQuant call.
//
// Intensity = 24h volume / market cap — size-adjusted churn, descriptive only.

import { useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import { SegGroup } from "./ui/SegGroup";
import BubbleField from "./BubbleField";

const COUNT_OPTS = [
  { key: "10", label: "10" },
  { key: "25", label: "25" },
  { key: "50", label: "50" },
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
  if (s === "sl" || s === "closed_loss") return { l: "SL", c: "bg-loss/12 text-loss" };
  if (s === "closed_win") return { l: "Win", c: "bg-profit/12 text-profit" };
  if (s.startsWith("tp")) return { l: s.toUpperCase(), c: "bg-profit/12 text-profit" };
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
    <span className={`font-mono tabular-nums ${n >= 0 ? "text-profit" : "text-loss"} ${className}`}>
      {n >= 0 ? "+" : ""}
      {n.toFixed(2)}%
    </span>
  );
}

function IntensityCell({ value, max }) {
  const v = value || 0;
  const pct = Math.max(4, Math.min(100, (v / (max || 1)) * 100));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.07] sm:w-20">
        <div
          className={`h-full rounded-full ${pct > 70 ? "bg-accent" : "bg-accent/55"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-[11px] tabular-nums text-text-primary">
        {value != null ? value.toFixed(2) : "—"}
      </span>
    </div>
  );
}

/** The collapsed strip: who is busiest, by face and by name. */
function TopStrip({ rows, onPick }) {
  return (
    <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      {rows.map(({ c, called }) => {
        const chg = c.price_change_24h;
        return (
          <button
            key={c.coin_id || c.symbol}
            type="button"
            title={`${c.symbol} · intensity ${c.flow_intensity?.toFixed(2) ?? "—"}${
              called ? " · LuxQuant call" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(c);
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition-colors ${
              called
                ? "border-accent/50 bg-accent/[0.08]"
                : "border-ink/[0.1] hover:bg-ink/[0.04]"
            }`}
          >
            <CoinLogo pair={`${c.symbol}USDT`} size={18} />
            <span className="max-w-[70px] truncate text-[11.5px] font-medium text-text-primary">
              {c.symbol}
            </span>
            <span
              className={`font-mono text-[10.5px] tabular-nums ${
                chg == null ? "text-text-muted" : chg >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function SignalsCoinFlow({ coins = [], signals = [], onOpenSignal, onMore }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [scope, setScope] = useState("all"); // all | called | uncalled
  const [sort, setSort] = useState({ key: "intensity", dir: "desc" });
  // Rows answer "rank them"; bubbles answer "where is the weight". Same data,
  // two questions, so it is a mode rather than a second panel.
  const [view, setView] = useState("rows");

  const signalBySymbol = useMemo(() => {
    const m = new Map();
    for (const s of signals) {
      const sym = (s.pair || "").replace(/USDT$/i, "").toUpperCase();
      // Keep the newest call per coin: the desk list can hold several.
      const prev = m.get(sym);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) m.set(sym, s);
    }
    return m;
  }, [signals]);

  const enriched = useMemo(
    () =>
      coins.map((c) => {
        const sig = signalBySymbol.get(String(c.symbol).toUpperCase());
        const entry = sig?.entry ? Number(sig.entry) : null;
        // Both sources mean "called in the last 7 days" — the desk list is live
        // and the snapshot flag is up to four hours old, so a coin counts as
        // called if either knows about it.
        return {
          c,
          sig,
          called: !!sig || !!c.is_luxquant_signal,
          fromCall: entry && c.price ? ((c.price - entry) / entry) * 100 : null,
        };
      }),
    [coins, signalBySymbol]
  );

  const counts = useMemo(() => {
    const called = enriched.filter((x) => x.called).length;
    return { all: enriched.length, called, uncalled: enriched.length - called };
  }, [enriched]);

  // Counts ride in the badge slot the control already has, so the segment
  // labels stay the same width whether a snapshot holds 8 calls or 108.
  const scopeOpts = [
    { key: "all", label: "All", badge: counts.all },
    { key: "called", label: "Called", badge: counts.called, title: "LuxQuant called this coin in the last 7 days" },
    { key: "uncalled", label: "No call", badge: counts.uncalled, title: "No LuxQuant call in the last 7 days" },
  ];

  const sorted = useMemo(() => {
    const pool =
      scope === "all" ? enriched : enriched.filter((x) => (scope === "called" ? x.called : !x.called));
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
    return [...pool].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [enriched, scope, sort]);

  const rows = sorted.slice(0, count);

  // Size is turnover in DOLLARS, not the intensity ratio: intensity is already
  // size-adjusted, so bubbling it would draw every coin nearly the same and
  // throw away the one thing a bubble is good at.
  const bubbleItems = useMemo(
    () =>
      rows
        .filter((r) => (r.c.volume_24h ?? 0) > 0)
        .map(({ c, called }) => ({
          id: c.coin_id || c.symbol,
          label: c.symbol,
          size: c.volume_24h,
          delta: c.price_change_24h ?? 0,
          sub: called ? "LuxQuant called this" : undefined,
          raw: c,
        })),
    [rows]
  );
  const maxInt = Math.max(...rows.map((r) => r.c.flow_intensity || 0), 0.0001);
  // The strip always shows the busiest coins overall, whatever the table is
  // filtered to: it is the headline, not a second copy of the table.
  const stripRows = useMemo(
    () =>
      [...enriched]
        .sort((a, b) => (b.c.flow_intensity ?? -1) - (a.c.flow_intensity ?? -1))
        .slice(0, 12),
    [enriched]
  );
  const top = stripRows[0]?.c;
  // Columns that only ever hold a dash for uncalled coins.
  const showCallCols = scope !== "uncalled";

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
    );

  const openCoin = (c) => {
    const sig = signalBySymbol.get(String(c.symbol).toUpperCase());
    if (sig) onOpenSignal?.(sig);
    else onMore?.();
  };

  const SortHead = ({ label, k, align = "right" }) => (
    <th className={`whitespace-nowrap px-2 py-1.5 ${align === "left" ? "text-left" : "text-right"}`}>
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

  const CallBadge = () => (
    <span className="rounded bg-accent/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-accent">
      Call
    </span>
  );

  if (!coins.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
      <div className="flex items-center gap-2.5 px-3 py-2 sm:px-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-2 text-left"
          aria-expanded={open}
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
              {counts.called ? ` · ${counts.called} called` : ""}
              {/* Not "tap to filter": a coin chip here opens that coin's call.
                  Only the Narratives row filters the desk, and saying the same
                  thing on both would make one of them a lie. */}
              {top ? " · tap to open" : ""}
            </span>
          </span>
        </button>
        <TopStrip rows={stripRows} onPick={openCoin} />
        <button
          type="button"
          onClick={onMore}
          className="shrink-0 rounded-md border border-ink/[0.12] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted hover:border-accent/40 hover:text-accent"
        >
          More
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink/[0.06] px-3 pb-3 pt-2.5 sm:px-3.5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <SegGroup
              size="sm"
              fill="mobile"
              aria-label="Which coins"
              value={scope}
              onChange={setScope}
              options={scopeOpts}
            />
            <SegGroup
              size="sm"
              aria-label="How many coins"
              value={String(count)}
              onChange={(k) => setCount(Number(k))}
              options={COUNT_OPTS}
            />
            <SegGroup
              size="sm"
              aria-label="Rows or bubbles"
              value={view}
              onChange={setView}
              options={[
                { key: "rows", label: "Rows" },
                { key: "bubbles", label: "Bubbles" },
              ]}
            />
            <p className="w-full text-[11px] leading-snug text-text-muted sm:w-auto sm:flex-1">
              Intensity = 24h volume ÷ market cap. Called = LuxQuant has called the coin in the
              last 7 days.
            </p>
          </div>

          {!rows.length ? (
            <p className="py-6 text-center text-[12.5px] text-text-muted">
              {scope === "called"
                ? "None of the coins in this snapshot has a call in the last 7 days."
                : "Every coin in this snapshot has a call in the last 7 days."}
            </p>
          ) : (
            view === "bubbles" ? (
            <>
              <BubbleField
                items={bubbleItems}
                activeIds={rows.filter((r) => r.called).map((r) => r.c.coin_id || r.c.symbol)}
                suffix="%"
                deltaScale={8}
                height={320}
                onOpen={(c) => openCoin(c)}
              />
              <p className="mt-1 text-[11px] leading-snug text-text-muted">
                Bigger means more dollars traded in 24h; green is up on the day, red is down. A gold
                ring is a coin LuxQuant has called. Tap one to open it.
              </p>
            </>
            ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-1 sm:hidden">
                {rows.map(({ c, sig, called, fromCall }, i) => {
                  const sm = sig ? statusMeta(sig.status) : null;
                  return (
                    <button
                      key={c.coin_id || c.symbol}
                      type="button"
                      onClick={() => openCoin(c)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                        called ? "bg-accent/[0.06]" : "hover:bg-ink/[0.03]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-[10px] text-text-muted">
                        {i + 1}
                      </span>
                      <CoinLogo pair={`${c.symbol}USDT`} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-text-primary">
                            {c.symbol}
                          </span>
                          {called ? <CallBadge /> : null}
                          {sm ? (
                            <span className={`rounded px-1 py-px text-[9px] font-medium ${sm.c}`}>
                              {sm.l}
                            </span>
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
              <div className="no-scrollbar -mx-1 hidden overflow-x-auto sm:block">
                {/* Capped, not full-width: a row of small figures spread across a
                    1900px desk puts a third of a screen between each number, and
                    the No call view drops to four columns where that is worse.
                    The cap follows the column count — and it is CENTRED, because
                    a capped block pinned left just moves the same dead space to
                    one side and makes the panel look half-loaded. */}
                <table
                  className={`mx-auto w-full min-w-[480px] border-collapse ${
                    showCallCols ? "max-w-[1100px]" : "max-w-[640px]"
                  }`}
                >
                  <thead>
                    <tr className="border-b border-ink/[0.06]">
                      <th className="w-6 py-1.5 pl-2 text-left font-mono text-[9px] text-text-muted">
                        #
                      </th>
                      <SortHead label="Coin" k="coin" align="left" />
                      <SortHead label="24h" k="chg" />
                      <SortHead label="Intensity" k="intensity" />
                      {showCallCols && <SortHead label="From call" k="fromcall" />}
                      {showCallCols && <SortHead label="Status" k="status" align="left" />}
                      {showCallCols && <SortHead label="Called" k="called" align="left" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ c, sig, called, fromCall }, i) => {
                      const sm = sig ? statusMeta(sig.status) : null;
                      return (
                        <tr
                          key={c.coin_id || c.symbol}
                          onClick={() => openCoin(c)}
                          className={`cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03] ${
                            called ? "bg-accent/[0.04]" : ""
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
                              {called ? <CallBadge /> : null}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-[12px]">
                            <Chg pct={c.price_change_24h} className="font-medium" />
                          </td>
                          <td className="px-2 py-2">
                            <IntensityCell value={c.flow_intensity} max={maxInt} />
                          </td>
                          {showCallCols && (
                            <td className="px-2 py-2 text-right text-[12px]">
                              <Chg pct={fromCall} className="font-medium" />
                            </td>
                          )}
                          {showCallCols && (
                            <td className="px-2 py-2">
                              {sm ? (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${sm.c}`}
                                >
                                  {sm.l}
                                </span>
                              ) : (
                                <span className="text-[11px] text-text-muted">—</span>
                              )}
                            </td>
                          )}
                          {showCallCols && (
                            <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] tabular-nums text-text-muted">
                              {sig?.created_at ? timeAgo(sig.created_at) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
