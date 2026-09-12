// SignalsNarrativeRotation — which narratives capital moved INTO this week.
//
// The first attempt at this panel drew our own calls flowing into TP/SL levels.
// That is the desk's hit rate wearing a flow diagram's clothes; it says nothing
// about where money went. This measures the market.
//
// The metric is RELATIVE strength, not raw change, because raw change mostly
// measures the tide. Measured 2026-09-12: the market was down 2.04% on the week,
// so a narrative up 1.5% looks weak and is in fact three and a half points ahead
// of everything else. Rotation is what a narrative did against the market, and
// the baseline is the only thing that separates the two.
//
// What this is NOT: net capital inflow. Nothing here tracks money entering the
// asset class — market cap moves when price moves, with no new buyer required.
// Honest reading: "this narrative gained value faster than the market did".
//
// Dollars ride alongside the percentage because 12% of a $20B narrative and 12%
// of a $2T one are the same number and nothing like the same event.

import { useMemo } from "react";
import { InfoTip } from "./GuideInfo";

const money = (v) => {
  const n = Math.abs(Number(v) || 0);
  const sign = Number(v) < 0 ? "−" : "+";
  if (n >= 1e12) return `${sign}$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(0)}M`;
  return `${sign}$${n.toFixed(0)}`;
};

const EXPLAIN =
  "Where capital rotated over the last 7 days, measured against the market's own move.\n\n" +
  "The bar is relative strength: the narrative's market-cap change minus the change across " +
  "every narrative on this desk. Zero means it moved exactly with the market. That subtraction " +
  "is the whole point — in a week the market is down 2%, a narrative down 1% is OUTPERFORMING, " +
  "and raw percentages would have called it a loser.\n\n" +
  "The dollar figure is the actual change in that narrative's market cap, which is why a small " +
  "percentage on a huge narrative can still be billions.\n\n" +
  "This is not net inflow. Market cap rises when price rises, with no new money required — read " +
  "it as 'gained value faster than the market', not 'this much cash arrived'.";

function Row({ item, maxAbs, market, rank, active, onPick }) {
  const rs = (item.mcap_change_7d ?? 0) - (market ?? 0);
  const pos = rs >= 0;
  const width = maxAbs > 0 ? Math.min(100, (Math.abs(rs) / maxAbs) * 100) : 0;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick?.(item)}
      title={`${item.name} — tap to filter the desk`}
      className={`group flex w-full items-center gap-2 rounded-md py-[5px] pl-1 pr-1 text-left transition-colors ${
        active ? "bg-accent/[0.12]" : "hover:bg-ink/[0.04]"
      }`}
    >
      {/* The rank ties this row to the table beside it. Without it the two
          panels read as different lists — the top mover is often row 29, and a
          reader who does not scroll that far assumes it is missing. */}
      <span className="w-5 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-text-muted">
        {rank ? `${rank}` : ""}
      </span>
      <span
        className={`w-[92px] shrink-0 truncate text-[11.5px] sm:w-[118px] ${
          active ? "text-text-primary" : "text-text-secondary"
        }`}
        title={item.name}
      >
        {item.name}
      </span>

      {/* Two halves around a shared centre, so a glance reads direction before
          it reads any number. */}
      <span className="relative flex h-3.5 min-w-0 flex-1 items-center">
        <span className="absolute inset-y-0 left-1/2 w-px bg-ink/[0.12]" aria-hidden="true" />
        <span className="flex h-full w-1/2 justify-end">
          {!pos ? (
            <span
              className="h-full rounded-l-sm bg-loss/70"
              style={{ width: `${width}%` }}
            />
          ) : null}
        </span>
        <span className="flex h-full w-1/2">
          {pos ? (
            <span
              className="h-full rounded-r-sm bg-profit/70"
              style={{ width: `${width}%` }}
            />
          ) : null}
        </span>
      </span>

      <span className="w-[54px] shrink-0 text-right font-mono text-[11px] tabular-nums">
        <span className={pos ? "text-profit" : "text-loss"}>
          {pos ? "+" : "−"}
          {Math.abs(rs).toFixed(1)}
          <span className="text-[9px]">pp</span>
        </span>
      </span>
      <span className="w-[62px] shrink-0 text-right font-mono text-[10.5px] tabular-nums text-text-muted">
        {item.flow_usd_7d != null ? money(item.flow_usd_7d) : "—"}
      </span>
    </button>
  );
}

export default function SignalsNarrativeRotation({
  narratives = [],
  marketChange7d = null,
  activeIds = [],
  rankOf = null,
  onPick = null,
  perSide = 6,
}) {
  const { inflow, outflow, maxAbs, up, down, moved } = useMemo(() => {
    const active = new Set(activeIds || []);
    const pool = (active.size
      ? narratives.filter((x) => active.has(x.category_id))
      : narratives
    ).filter((x) => x.mcap_change_7d != null);

    const withRs = pool
      .map((x) => ({ ...x, rs: (x.mcap_change_7d ?? 0) - (marketChange7d ?? 0) }))
      .sort((a, b) => b.rs - a.rs);

    // Both ends, not a top-N: a leaderboard of winners hides the other half of
    // a rotation, and the money leaving is the same story as the money arriving.
    const inflow = withRs.filter((x) => x.rs > 0).slice(0, perSide);
    const outflow = withRs.filter((x) => x.rs < 0).slice(-perSide).reverse();
    const maxAbs = Math.max(...withRs.map((x) => Math.abs(x.rs)), 0.001);
    // Counted over EVERY narrative, not the twelve drawn: a summary of the
    // rows that happen to be on screen is not a summary of the rotation.
    const up = withRs.filter((x) => x.rs > 0);
    const down = withRs.filter((x) => x.rs < 0);
    const moved = withRs.reduce((t, x) => t + Math.abs(x.flow_usd_7d || 0), 0);
    return { inflow, outflow, maxAbs, up: up.length, down: down.length, moved };
  }, [narratives, marketChange7d, activeIds, perSide]);

  if (!inflow.length && !outflow.length) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">Capital rotation</span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
          7 days
        </span>
        {marketChange7d != null ? (
          <span className="text-[11px] text-text-muted">
            market{" "}
            <span
              className={`font-mono tabular-nums ${
                marketChange7d >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {marketChange7d >= 0 ? "+" : ""}
              {marketChange7d.toFixed(2)}%
            </span>
          </span>
        ) : null}
        <span className="ml-auto">
          <InfoTip side="bottom" title="Capital rotation" text={EXPLAIN} />
        </span>
      </div>

      <p className="mb-2 text-[11px] text-text-muted">
        <span className="font-mono tabular-nums text-profit">{up}</span> ahead of the market,{" "}
        <span className="font-mono tabular-nums text-loss">{down}</span> behind ·{" "}
        <span className="font-mono tabular-nums">{money(moved).replace(/^[+−]/, "")}</span> of market
        cap changed hands
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {inflow.length ? (
          <>
            <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-profit">
              Money moved in
            </p>
            {inflow.map((x) => (
              <Row
                key={x.category_id}
                item={x}
                maxAbs={maxAbs}
                market={marketChange7d}
                rank={rankOf?.get?.(x.category_id)}
                active={(activeIds || []).includes(x.category_id)}
                onPick={onPick}
              />
            ))}
          </>
        ) : null}

        {outflow.length ? (
          <>
            <p className="mb-0.5 mt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-loss">
              Money moved out
            </p>
            {outflow.map((x) => (
              <Row
                key={x.category_id}
                item={x}
                maxAbs={maxAbs}
                market={marketChange7d}
                rank={rankOf?.get?.(x.category_id)}
                active={(activeIds || []).includes(x.category_id)}
                onPick={onPick}
              />
            ))}
          </>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-text-muted">
        Bars are each narrative&apos;s 7-day market-cap change minus the market&apos;s own, so zero
        means it moved with everything else. Dollars are the change in market cap, not cash
        arriving.
      </p>
    </div>
  );
}
