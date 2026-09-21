// MissingTray — what a chart could not place, and why.
//
// Grouped by reason, because the reason is usually the same one: fourteen
// stablecoins each wearing "no turnover in this snapshot" made a tray longer
// than the chart it sat under on a phone. Said once, with the names after it,
// it is two lines. The overflow is a button that shows the rest — "+1 more"
// used to be plain text that looked like one.

import { useState } from "react";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function MissingTray({
  items,
  onOpen,
  nameOf = (m) => m.pair || m.name,
  payloadOf = (m) => m.raw,
  limit = 8,
}) {
  const [all, setAll] = useState(false);
  if (!items?.length) return null;

  const groups = new Map();
  for (const m of items) {
    const why = m.why || "no data";
    if (!groups.has(why)) groups.set(why, []);
    groups.get(why).push(m);
  }
  let budget = all ? Infinity : limit;
  const rows = [];
  for (const [why, list] of groups) {
    const shown = list.slice(0, Math.max(0, budget));
    budget -= shown.length;
    if (shown.length) rows.push({ why, shown });
  }
  const hidden = items.length - rows.reduce((n, r) => n + r.shown.length, 0);

  return (
    <div className="mt-2 rounded-lg bg-ink/[0.03] px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
        Not on this chart · {items.length}
      </p>
      <div className="mt-1.5 space-y-1.5">
        {rows.map((r) => (
          <div key={r.why} className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-muted">{`${cap(r.why)}:`}</span>
            {r.shown.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen?.(payloadOf(m))}
                className="inline-flex max-w-[160px] items-center rounded-full border border-ink/[0.1] px-2 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                <span className="truncate">{nameOf(m)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {hidden > 0 || (all && items.length > limit) ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
        >
          {all ? "Show fewer" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}
