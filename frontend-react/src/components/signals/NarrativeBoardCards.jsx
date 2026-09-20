// NarrativeBoardCards — the three things worth knowing before reading the table.
//
// This replaces a thin strip carrying a half gauge, a donut and a percentage.
// Three problems with that, in order of how much they cost a reader:
//
//  1. It stated three facts and made no statement. "83% breadth" is a number,
//     not a finding. The interesting thing about a high breadth reading is WHY,
//     and the data answers it: the baseline is cap-weighted, and on the live
//     week the five biggest narratives sit within a point of it while the
//     unweighted mean runs nine points ahead. Breadth is high because the SMALL
//     narratives ran. That is a sentence, and the card now says it.
//  2. The donut drew the outcome mix one way while every row of the table below
//     drew the same mix as a 100% stacked bar. One product, one visual language:
//     the bar wins because it is also easier to compare against.
//  3. Nothing said what "1913" counted or over what window, and the window is a
//     control sitting right above it.
//
// The outcome counts are FRACTIONAL by design — a call is split 1/k across the
// narratives it belongs to, so the totals conserve to the number of calls
// rather than counting one call in five narratives five times.

import { useMemo } from "react";
import CoinLogo from "../CoinLogo";
import { InfoTip } from "../GuideInfo";

const OUT = [
  { key: "tp4", label: "TP4", token: "--viz-tp4" },
  { key: "tp3", label: "TP3", token: "--viz-tp3" },
  { key: "tp2", label: "TP2", token: "--viz-tp2" },
  { key: "tp1", label: "TP1", token: "--viz-tp1" },
  { key: "sl", label: "SL", token: null },
];

const money = (v) => {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
};

function Card({ label, children, tip }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-ink/[0.07] bg-ink/[0.02] px-3.5 py-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
          {label}
        </span>
        {tip ? <span className="ml-auto">{tip}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Every narrative as one tick, sorted, around the market's own line.
 *
 *  A gauge can only say what share cleared the bar. This says the SHAPE: a wall
 *  of green leaning hard right is a different week from a few long spikes and a
 *  flat middle, and the two read the same on a gauge. */
function BreadthStrip({ values }) {
  if (!values.length) return null;
  const max = Math.max(...values.map(Math.abs), 0.001);
  return (
    <span className="mt-2 flex h-9 w-full items-center gap-[1.5px]" aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(8, (Math.abs(v) / max) * 100);
        return (
          <span key={i} className="relative flex h-full min-w-0 flex-1 items-center">
            <span
              className={`absolute w-full rounded-[1px] ${v >= 0 ? "bg-profit/70" : "bg-loss/70"}`}
              style={{ height: `${h}%`, [v >= 0 ? "bottom" : "top"]: "50%" }}
            />
            <span className="absolute inset-x-0 top-1/2 h-px bg-ink/[0.12]" />
          </span>
        );
      })}
    </span>
  );
}

export default function NarrativeBoardCards({ narratives = [], marketChange7d = null, days = 30 }) {
  const model = useMemo(() => {
    const m = Number(marketChange7d) || 0;
    const withRs = narratives
      .filter((x) => x.mcap_change_7d != null)
      .map((x) => ({ ...x, rs: x.mcap_change_7d - m }))
      .sort((a, b) => b.rs - a.rs);

    const ahead = withRs.filter((x) => x.rs > 0).length;
    const moved = withRs.reduce((t, x) => t + Math.abs(x.flow_usd_7d || 0), 0);

    // Why breadth is what it is. The baseline is cap-weighted, so comparing it
    // against the UNWEIGHTED mean says whether the week belongs to the big
    // narratives or the small ones — which is the part a share cannot carry.
    const meanRs = withRs.length ? withRs.reduce((t, x) => t + x.rs, 0) / withRs.length : 0;
    const biggest = [...withRs]
      .filter((x) => x.market_cap != null)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 5);
    const bigSpread = biggest.length ? Math.max(...biggest.map((x) => Math.abs(x.rs))) : null;

    // Fractional by design — see the header note.
    const totals = {};
    let resolved = 0;
    for (const x of narratives) {
      for (const o of OUT) {
        const v = Number(x.outcome_flow?.[o.key] || 0);
        totals[o.key] = (totals[o.key] || 0) + v;
        resolved += v;
      }
    }
    // Win rate and the ladder depth from the SAME conserved totals the bar is
    // drawn from, so the headline and the bar can never disagree.
    //
    // A note on why this is legitimate here while the table refuses to rank on
    // it: the finding is that win rate cannot separate one narrative from
    // another — 40 small samples whose confidence bands all overlap. As a
    // single aggregate over the whole window it rests on every resolved call
    // and is perfectly solid. Different question, different sample.
    const stopped = resolved ? (totals.sl || 0) / resolved : null;
    const winRate = stopped == null ? null : 1 - stopped;
    const fullTp = resolved ? ((totals.tp3 || 0) + (totals.tp4 || 0)) / resolved : null;

    const byCoins = [...narratives]
      .filter((x) => x.coins_called)
      .sort((a, b) => b.coins_called - a.coins_called);
    const pairs = new Set(narratives.flatMap((x) => x.pairs || [])).size;

    return {
      withRs, ahead, moved, meanRs, biggest, bigSpread,
      totals, resolved, fullTp, winRate, stopped, byCoins, pairs, market: m,
    };
  }, [narratives, marketChange7d]);

  if (!model.withRs.length) return null;

  const { ahead, withRs, moved, meanRs, bigSpread, totals, resolved, fullTp, winRate, stopped, byCoins, pairs, market } = model;
  const topCoins = byCoins[0]?.coins_called || 1;

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      <Card
        label={`The market · 7 days`}
        tip={
          <InfoTip
            side="bottom"
            title="This week"
            text={
              "The change across every narrative on this desk, weighted by size — the baseline everything " +
              "else is measured against.\n\nEach tick below is one narrative's move against that baseline, " +
              "sorted. The shape matters: a wall leaning one way is a different week from a few long spikes " +
              "over a flat middle, and a single breadth percentage reads the same for both.\n\n" +
              "Dollars are the change in market cap, not cash arriving — market cap moves when price moves, " +
              "with no new buyer required."
            }
          />
        }
      >
        <p className="font-mono text-[26px] font-medium leading-none tabular-nums">
          <span className={market >= 0 ? "text-profit" : "text-loss"}>
            {market >= 0 ? "+" : "−"}
            {Math.abs(market).toFixed(2)}%
          </span>
        </p>
        <p className="mt-1 text-[11.5px] text-text-muted">
          {money(moved)} of market cap changed hands
        </p>
        <BreadthStrip values={withRs.map((x) => x.rs)} />
        <p className="mt-1.5 text-[11.5px] leading-snug text-text-secondary">
          <span className="font-mono tabular-nums text-profit">{ahead}</span> of {withRs.length}{" "}
          narratives beat it
          {bigSpread != null && bigSpread < 3 && meanRs > 3 ? (
            <>
              {" "}— but the five biggest sit within{" "}
              <span className="font-mono tabular-nums">{bigSpread.toFixed(1)}</span> points of it.
              The week is in the small narratives.
            </>
          ) : (
            <>
              , and the average narrative ran{" "}
              <span className="font-mono tabular-nums">
                {meanRs >= 0 ? "+" : "−"}
                {Math.abs(meanRs).toFixed(1)}
              </span>{" "}
              points against it.
            </>
          )}
        </p>
      </Card>

      <Card
        label={`How our calls ended · ${days} days`}
        tip={
          <InfoTip
            side="bottom"
            title="How they ended"
            text={
              "Every resolved call in the window, split by the level it reached.\n\nA coin sits in several " +
              "narratives at once, so each call is divided evenly across the ones it belongs to. The totals " +
              "therefore come to the NUMBER OF CALLS rather than counting one call five times.\n\n" +
              "WIN RATE HERE MEANS THE HIGHEST LEVEL A CALL REACHED WAS TP1 OR BETTER. It is not profit, " +
              "and it is not what a trade returned: a call that tagged its stop before running to target " +
              "still counts as a win, and a call that touched TP1 and fell back counts the same as one that " +
              "ran to TP4. The bar underneath is where the difference lives.\n\n" +
              "This is a single figure over every resolved call in the window, which is why it is quoted " +
              "here while the table below refuses to rank narratives on it — forty small samples with " +
              "overlapping confidence bands cannot be ordered, and one large one is perfectly solid."
            }
          />
        }
      >
        <p className="font-mono text-[26px] font-medium leading-none tabular-nums text-profit">
          {winRate == null ? "—" : `${(winRate * 100).toFixed(1)}%`}
        </p>
        <p className="mt-1 text-[11.5px] text-text-muted">
          {/* Named precisely, because this number is the one people misread.
              It is the level a call TOUCHED, not what a trade returned. */}
          reached TP1 or better ·{" "}
          <span className="font-mono tabular-nums">{Math.round(resolved).toLocaleString()}</span>{" "}
          calls resolved
        </p>
        <span className="mt-2 flex h-9 w-full overflow-hidden rounded-md bg-ink/[0.06]">
          {OUT.map((o) =>
            totals[o.key] ? (
              <span
                key={o.key}
                className="flex items-center justify-center"
                style={{
                  width: `${(totals[o.key] / resolved) * 100}%`,
                  background: o.token ? `var(${o.token})` : "rgb(var(--neg))",
                }}
                title={`${o.label} ${Math.round((totals[o.key] / resolved) * 100)}%`}
              >
                {totals[o.key] / resolved > 0.1 ? (
                  <span
                    className="font-mono text-[9.5px] font-semibold tabular-nums"
                    style={{ color: o.key === "tp1" || o.key === "tp2" ? "rgb(var(--accent-fg))" : "#fff" }}
                  >
                    {Math.round((totals[o.key] / resolved) * 100)}
                  </span>
                ) : null}
              </span>
            ) : null
          )}
        </span>
        <p className="mt-1.5 text-[11.5px] leading-snug text-text-secondary">
          <span className="font-mono tabular-nums text-profit">
            {fullTp == null ? "—" : `${(fullTp * 100).toFixed(0)}%`}
          </span>{" "}
          ran on to TP3 or beyond ·{" "}
          <span className="font-mono tabular-nums text-loss">
            {stopped == null ? "—" : `${(stopped * 100).toFixed(0)}%`}
          </span>{" "}
          took the stop. Levels touched, not what a trade returned.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
          {OUT.map((o) =>
            totals[o.key] ? (
              <span key={o.key} className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: o.token ? `var(${o.token})` : "rgb(var(--neg))" }}
                />
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                  {o.label}
                </span>
              </span>
            ) : null
          )}
        </div>
      </Card>

      <Card
        label="Where the desk is pointed"
        tip={
          <InfoTip
            side="bottom"
            title="Where the desk is pointed"
            text={
              "How many distinct coins we called inside each narrative in this window, biggest first.\n\n" +
              "Narratives OVERLAP — a coin belongs to about five of them — so these counts deliberately do " +
              "not add up to the book. Read a row as 'how much of this narrative we are on', never as a " +
              "share of anything.\n\nThe table below is ranked by how far a call RUNS there, which is a " +
              "different question from where the book is concentrated. This card is the only place that " +
              "second question is answered."
            }
          />
        }
      >
        <p className="font-mono text-[26px] font-medium leading-none tabular-nums text-text-primary">
          {pairs}
        </p>
        <p className="mt-1 text-[11.5px] text-text-muted">
          coins called across{" "}
          <span className="font-mono tabular-nums">{narratives.length}</span> narratives
        </p>
        <div className="mt-2 space-y-[3px]">
          {byCoins.slice(0, 5).map((x) => (
            <span key={x.category_id} className="flex items-center gap-2">
              <span className="flex shrink-0 items-center">
                {(x.pairs || []).slice(0, 2).map((p, i) => (
                  <span key={p} style={{ marginLeft: i ? -5 : 0, zIndex: 2 - i }}>
                    <CoinLogo pair={p} size={14} />
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary" title={x.name}>
                {x.name}
              </span>
              <span className="h-1.5 w-[64px] shrink-0 overflow-hidden rounded-full bg-ink/[0.07]">
                <span
                  className="block h-full rounded-full bg-accent/60"
                  style={{ width: `${(x.coins_called / topCoins) * 100}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-text-primary">
                {x.coins_called}
              </span>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
