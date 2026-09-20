// CoinDetailModal — everything the desk knows about one coin, in one place.
//
// Before this, a ticker in Coin flow was a dead end: tapping it either opened a
// call or navigated off the page entirely, and the panel's own columns — how
// long the move has been running, how busy the coin is against the other 249,
// which narratives it sits in — were nowhere. A flow panel whose rows cannot be
// opened is a leaderboard, not a desk.
//
// Order follows the question a trader actually asks, which is never "what is
// the market cap": is this moving, has it been moving, is it busy, who else is
// in this story, and did we call it.

import { useMemo } from "react";
import Modal from "../ui/Modal";
import CoinLogo from "../CoinLogo";
import { Delta, VolCell, BandTag } from "./FlowUI";
import {
  fmtMultiple,
  num,
  price as fmtPrice,
  statusMeta,
  turnoverBand,
  usdShort,
} from "./flowMetrics";

const HORIZONS = [
  { key: "price_change_24h", label: "24h" },
  { key: "price_change_7d", label: "7d" },
  { key: "price_change_30d", label: "30d" },
];

const ago = (iso) => {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function Cell({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-lg bg-ink/[0.03] px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <div className="mt-0.5 font-mono text-[14px] font-medium tabular-nums text-text-primary">
        {children}
      </div>
      {hint ? <p className="mt-px text-[10px] leading-snug text-text-muted">{hint}</p> : null}
    </div>
  );
}

export default function CoinDetailModal({
  row,
  rows = [],
  narratives = [],
  signals = [],
  isOpen,
  onClose,
  onOpenSignal,
  onPickNarrative,
}) {
  const c = row?.c;
  const sym = String(c?.symbol || "").toUpperCase();

  // Where this coin sits among every coin in the snapshot, not among the ten
  // on screen. "3rd busiest" is a fact about the market; "3rd in this table"
  // is a fact about the filter, and only one of them is worth reading.
  const standing = useMemo(() => {
    if (!c) return null;
    const withInt = rows.filter((r) => num(r.c.flow_intensity) != null);
    const sorted = [...withInt].sort(
      (a, b) => (num(b.c.flow_intensity) || 0) - (num(a.c.flow_intensity) || 0)
    );
    const idx = sorted.findIndex((r) => r.c.coin_id === c.coin_id || r.c.symbol === c.symbol);
    if (idx < 0) return null;
    return { rank: idx + 1, of: sorted.length };
  }, [rows, c]);

  const inNarratives = useMemo(() => {
    if (!sym) return [];
    return narratives.filter((n) =>
      (n.pairs || []).some((p) => String(p).replace(/USDT$/i, "").toUpperCase() === sym)
    );
  }, [narratives, sym]);

  const calls = useMemo(() => {
    if (!sym) return [];
    return signals
      .filter((s) => String(s.pair || "").replace(/USDT$/i, "").toUpperCase() === sym)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [signals, sym]);

  if (!row || !c) return null;

  const band = turnoverBand(c.flow_intensity);
  const moves = HORIZONS.map((h) => ({ ...h, v: num(c[h.key]) })).filter((h) => h.v != null);
  const maxMove = Math.max(...moves.map((m) => Math.abs(m.v)), 1);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      eyebrow="Coin flow"
      title={sym}
      subtitle={`${fmtPrice(c.price)} · ${usdShort(c.market_cap)} market cap${
        standing ? ` · ${standing.rank} of ${standing.of} by turnover` : ""
      }`}
      icon={<CoinLogo pair={`${sym}USDT`} size={30} />}
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="24h" hint="price, last day">
            <Delta value={c.price_change_24h} />
          </Cell>
          <Cell label="Turnover" hint="24h volume ÷ market cap">
            <span className="flex items-baseline gap-1.5">
              {c.flow_intensity == null ? "—" : Number(c.flow_intensity).toFixed(2)}
              <BandTag band={band} />
            </span>
          </Cell>
          <Cell label="24h volume" hint="dollars traded in the last day">
            {usdShort(c.volume_24h)}
          </Cell>
          <Cell label="vs a week ago" hint="today's volume against its own level">
            <VolCell x={row.volX} />
          </Cell>
        </div>

        {/* Three horizons on ONE scale, so "up 4% today" and "up 78% this
            month" cannot look like the same event. */}
        {moves.length ? (
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-text-primary">
              How long this has been running
            </p>
            <div className="space-y-1 rounded-lg bg-ink/[0.02] px-3 py-2.5">
              {moves.map((m) => {
                const w = (Math.abs(m.v) / maxMove) * 100;
                const pos = m.v >= 0;
                return (
                  <div key={m.key} className="flex items-center gap-2">
                    <span className="w-7 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {m.label}
                    </span>
                    <span className="relative flex h-3 min-w-0 flex-1 items-center">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-ink/[0.12]" aria-hidden="true" />
                      <span className="flex h-full w-1/2 justify-end">
                        {!pos ? (
                          <span className="h-full rounded-l-sm bg-loss/70" style={{ width: `${w}%` }} />
                        ) : null}
                      </span>
                      <span className="flex h-full w-1/2">
                        {pos ? (
                          <span className="h-full rounded-r-sm bg-profit/70" style={{ width: `${w}%` }} />
                        ) : null}
                      </span>
                    </span>
                    <span className="w-[76px] shrink-0 text-right text-[12px]">
                      <Delta value={m.v} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3.5 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 text-[12.5px] font-medium text-text-primary">
              Stories it belongs to
              {inNarratives.length ? (
                <span className="ml-1.5 font-mono text-[10px] text-text-muted">
                  {inNarratives.length}
                </span>
              ) : null}
            </p>
            {inNarratives.length ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {inNarratives.map((n) => (
                    <button
                      key={n.category_id}
                      type="button"
                      onClick={() => {
                        onPickNarrative?.(n);
                        onClose?.();
                      }}
                      title={`${n.coins_called} coins called here · tap to filter the desk`}
                      className="flex items-center gap-1.5 rounded-full border border-ink/[0.1] py-1 pl-2.5 pr-2 transition-colors hover:border-accent/40 hover:bg-accent/[0.06]"
                    >
                      <span className="max-w-[150px] truncate text-[11.5px] text-text-primary">
                        {n.name}
                      </span>
                      <Delta value={n.mcap_change_24h} digits={1} className="text-[10.5px]" />
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
                  Narratives we have three or more calls in. Tap one to filter the desk to it.
                </p>
              </>
            ) : (
              <p className="text-[11.5px] leading-snug text-text-muted">
                None of the narratives we track has three or more of our calls in it — this coin is
                on its own here.
              </p>
            )}
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 text-[12.5px] font-medium text-text-primary">
              Our calls
              <span className="ml-1.5 font-mono text-[10px] text-text-muted">last 7 days</span>
            </p>
            {calls.length ? (
              <div className="space-y-1">
                {calls.slice(0, 6).map((s) => {
                  const sm = statusMeta(s.status);
                  return (
                    <button
                      key={s.signal_id || s.id || s.created_at}
                      type="button"
                      onClick={() => {
                        onOpenSignal?.(s);
                        onClose?.();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink/[0.03]"
                    >
                      <span className={`rounded px-1.5 py-px text-[10px] font-medium ${sm.c}`}>
                        {sm.l}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] tabular-nums text-text-secondary">
                        {/* The raw column is a full-precision float —
                            "entry 0.0627375" is not a price anybody reads. */}
                        entry {s.entry == null ? "—" : fmtPrice(s.entry)}
                      </span>
                      <span className="shrink-0 text-right text-[12px]">
                        <Delta value={row.fromCall} />
                      </span>
                      <span className="w-[60px] shrink-0 text-right font-mono text-[10.5px] text-text-muted">
                        {ago(s.created_at)}
                      </span>
                    </button>
                  );
                })}
                <p className="mt-1 text-[11px] leading-snug text-text-muted">
                  The move shown is from our entry to the price in this snapshot, not what a trade
                  returned.
                </p>
              </div>
            ) : (
              <p className="text-[11.5px] leading-snug text-text-muted">
                No call on {sym} in the last seven days. It is in this panel because of how it is
                trading, not because the desk is on it.
              </p>
            )}
          </div>
        </div>

        <p className="border-t border-ink/[0.06] pt-2.5 text-[11px] leading-snug text-text-muted">
          Turnover is 24h volume divided by market cap — how much of a coin changed hands today.
          It is churn, not direction: a busy coin is contested, not necessarily going anywhere.
          Volume against a week ago is {fmtMultiple(row.volX)} here. Snapshot refreshes every four
          hours.
        </p>
      </div>
    </Modal>
  );
}
