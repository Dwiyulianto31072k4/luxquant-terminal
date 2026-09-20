// PlanLadder — where the price sits inside the trade that was published.
//
// The scatter answers "which of these are still worth looking at". This answers
// the question that follows, and no scatter can: for THIS call, how much of the
// plan is behind me. One track per call, drawn on the call's own scale —
// stop on the left, entry where the desk said to buy, target on the right, and
// a marker for what it costs right now.
//
// Each row is normalised to its own stop-to-target span rather than to a shared
// axis, and that is deliberate: these are not comparable distances, they are
// comparable POSITIONS. A 3% ladder and a 30% ladder are both "a quarter of the
// way to target", and that is the thing a reader is looking for.

import CoinLogo from "../../CoinLogo";
import { fmt } from "./screenMetrics";

function Track({ row }) {
  const { entry, price, target, stop } = row;
  if (entry == null || price == null || target == null) return null;
  const lo = Math.min(stop ?? entry, entry, price, target);
  const hi = Math.max(stop ?? entry, entry, price, target);
  const span = hi - lo || 1;
  const at = (v) => ((v - lo) / span) * 100;

  const past = row.roomTp3 != null && row.roomTp3 <= 0;
  const below = row.distEntry != null && row.distEntry < 0;

  return (
    <span className="relative flex h-5 min-w-0 flex-1 items-center">
      {/* the plan, stop to target */}
      <span className="absolute inset-x-0 h-1 rounded-full bg-ink/[0.07]" />
      {/* the part of the plan that is still ahead of the price */}
      <span
        className={`absolute h-1 rounded-full ${past ? "bg-ink/20" : "bg-profit/60"}`}
        style={{ left: `${at(price)}%`, width: `${Math.max(0, at(target) - at(price))}%` }}
      />
      {/* the part that would be lost to the stop */}
      {stop != null ? (
        <span
          className="absolute h-1 rounded-full bg-loss/45"
          style={{ left: `${at(stop)}%`, width: `${Math.max(0, at(price) - at(stop))}%` }}
        />
      ) : null}
      {/* entry — where the desk said to buy */}
      <span
        className="absolute h-3.5 w-px bg-text-primary/45"
        style={{ left: `${at(entry)}%` }}
        title={`entry ${entry}`}
      />
      {/* the price you can actually pay */}
      <span
        className={`absolute h-3 w-[3px] -translate-x-1/2 rounded-full ${
          below ? "bg-profit" : past ? "bg-text-muted" : "bg-accent"
        }`}
        style={{ left: `${at(price)}%` }}
        title={`now ${price}`}
      />
    </span>
  );
}

export default function PlanLadder({ rows, onOpen }) {
  if (!rows.length) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
          each row on its own scale
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-4 rounded-full bg-loss/45" />
          <span className="text-[10.5px] text-text-muted">to the stop</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-4 rounded-full bg-profit/60" />
          <span className="text-[10.5px] text-text-muted">left to target</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-text-primary/45" />
          <span className="text-[10.5px] text-text-muted">entry</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-accent" />
          <span className="text-[10.5px] text-text-muted">price now</span>
        </span>
      </div>

      <div className="max-h-[52vh] overflow-y-auto pr-1">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen?.(r.signal)}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-ink/[0.03]"
          >
            <CoinLogo pair={`${r.pair}USDT`} size={20} />
            <span className="w-[84px] shrink-0 truncate text-[12.5px] font-medium text-text-primary">
              {r.pair}
              {r.isTop ? <span className="ml-1 text-accent">★</span> : null}
            </span>
            <Track row={r} />
            <span className="w-[62px] shrink-0 text-right font-mono text-[11.5px] tabular-nums">
              <span className={r.distEntry != null && r.distEntry > 5 ? "text-text-muted" : "text-text-primary"}>
                {fmt.pct(r.distEntry)}
              </span>
            </span>
            <span className="w-[62px] shrink-0 text-right font-mono text-[11.5px] tabular-nums">
              <span className={r.roomTp3 != null && r.roomTp3 > 0 ? "text-profit" : "text-text-muted"}>
                {fmt.pct(r.roomTp3)}
              </span>
            </span>
            <span className="hidden w-[46px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-text-secondary sm:block">
              {fmt.mult(r.rr)}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
        Columns are how far past the entry the price is, how much is left to the target from here,
        and the reward for the risk at the price you would actually pay. A grey bar means the
        target is already behind the price.
      </p>
    </div>
  );
}
