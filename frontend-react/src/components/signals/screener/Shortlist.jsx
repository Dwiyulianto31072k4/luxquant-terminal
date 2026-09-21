// Shortlist — the ranked answer to "which of these do I take".
//
// This is the screener's primary view, and the scatter is the secondary one.
// That is the opposite of where this started, and the reason is what the tool is
// actually for: a scatter is how you explore a RELATIONSHIP across a cloud, and
// nobody picks a trade out of a cloud. Picking is ranking — sort by the thing
// that matters, read down until something stops you, open it. Every professional
// screener from Finviz to Koyfin puts the ranked table first for this reason and
// keeps the plot as a second opinion.
//
// What earns the width here is the plan track. Each call is drawn on ITS OWN
// scale — stop, entry, target, and a marker for the live price — because these
// are not comparable distances, they are comparable POSITIONS. A 3% ladder and a
// 30% ladder are both "a quarter of the way to target", and that is the thing a
// reader is scanning for.

import CoinLogo from "../../CoinLogo";
import usePhone from "../usePhone";
import { fmt } from "./screenMetrics";

const STATUS = (st) => {
  const s = String(st || "").toLowerCase();
  if (s === "sl" || s === "closed_loss") return { l: "SL", c: "bg-loss/12 text-loss" };
  if (s === "closed_win") return { l: "Win", c: "bg-profit/12 text-profit" };
  if (s.startsWith("tp")) return { l: s.toUpperCase(), c: "bg-profit/12 text-profit" };
  return null;
};

function Track({ row }) {
  const { entry, price, target, stop } = row;
  if (entry == null || price == null || target == null) {
    return <span className="block h-1 rounded-full bg-ink/[0.05]" />;
  }
  const lo = Math.min(stop ?? entry, entry, price, target);
  const hi = Math.max(stop ?? entry, entry, price, target);
  const span = hi - lo || 1;
  const at = (v) => ((v - lo) / span) * 100;
  const past = row.roomTp3 != null && row.roomTp3 <= 0;

  return (
    <span className="relative flex h-5 w-full items-center">
      <span className="absolute inset-x-0 h-1 rounded-full bg-ink/[0.06]" />
      {stop != null ? (
        <span
          className="absolute h-1 rounded-l-full bg-loss/40"
          style={{ left: `${at(stop)}%`, width: `${Math.max(0, at(price) - at(stop))}%` }}
        />
      ) : null}
      <span
        className={`absolute h-1 rounded-r-full ${past ? "bg-ink/15" : "bg-profit/65"}`}
        style={{ left: `${at(price)}%`, width: `${Math.max(0, at(target) - at(price))}%` }}
      />
      <span className="absolute h-3 w-px bg-text-primary/40" style={{ left: `${at(entry)}%` }} />
      <span
        className={`absolute h-3.5 w-[3px] -translate-x-1/2 rounded-full ${
          past ? "bg-text-muted" : "bg-accent"
        }`}
        style={{ left: `${at(price)}%` }}
      />
    </span>
  );
}

/** A number and, behind it, how it compares to the rest of the column. Reading
 *  a figure and ranking it are two jobs, and a bare column of digits only does
 *  the first. */
function Cell({ value, text, max, tone = "accent", align = "right" }) {
  const w = value == null || !max ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  const fill =
    tone === "profit" ? "bg-profit/20" : tone === "loss" ? "bg-loss/20" : "bg-accent/20";
  return (
    <span className="relative block px-2 py-1">
      <span className={`absolute inset-y-0.5 right-0 rounded-sm ${fill}`} style={{ width: `${w}%` }} />
      <span className={`relative block font-mono text-[11.5px] tabular-nums text-${align}`}>
        {text}
      </span>
    </span>
  );
}

const COLS = [
  { key: "distEntry", label: "Past call", w: "w-[76px]" },
  { key: "roomTp3", label: "Room", w: "w-[76px]" },
  { key: "rr", label: "R ÷ R", w: "w-[62px]" },
  { key: "vol24", label: "Vol 24h", w: "w-[78px] hidden md:table-cell" },
  { key: "ageH", label: "Age", w: "w-[58px] hidden sm:table-cell" },
];

// What the list is ranked by, printed large at the right of each phone row —
// the number the reader chose to sort on is the one they are scanning for.
const LEAD = {
  rr: { label: "R ÷ R", text: (r) => fmt.mult(r.rr), tone: () => "text-text-primary" },
  roomTp3: {
    label: "Room",
    text: (r) => fmt.pct(r.roomTp3),
    tone: (r) => (r.roomTp3 != null && r.roomTp3 > 0 ? "text-profit" : "text-loss"),
  },
  distEntry: {
    label: "Past call",
    text: (r) => fmt.pct(r.distEntry),
    tone: (r) => (r.distEntry != null && r.distEntry > 5 ? "text-loss" : "text-text-primary"),
  },
  ageH: { label: "Age", text: (r) => fmt.hours(r.ageH), tone: () => "text-text-primary" },
  vol24: { label: "Vol 24h", text: (r) => fmt.usd(r.vol24), tone: () => "text-text-primary" },
};

// The same ranking on a phone. Eight columns do not fit 358px, so it was a
// table you scrolled sideways inside a box you scrolled down inside a sheet you
// scrolled — three scrollers, one thumb. Here every row is one tap target, the
// track gets the full width it needs to be read, and the list scrolls with the
// sheet instead of inside it.
function PhoneList({ rows, sortKey, onOpen }) {
  const lead = LEAD[sortKey] || LEAD.rr;
  // Two figures fit a phone line at any width; the third wrapped onto a line
  // of its own and made every row a third taller. Age is not a figure you
  // compare so much as a fact about the call, so it rides with the name.
  const rest = ["distEntry", "roomTp3", "rr"].filter((k) => k !== sortKey).slice(0, 2);
  return (
    <ol className="-mx-4 border-y border-ink/[0.06]">
      {rows.map((r, i) => {
        const st = STATUS(r.status);
        return (
          <li key={r.id} className="border-b border-ink/[0.05] last:border-0">
            <button
              type="button"
              onClick={() => onOpen?.(r.signal)}
              className={`block w-full px-4 py-3 text-left transition-colors active:bg-ink/[0.05] ${
                r.atPlan ? "bg-profit/[0.05]" : ""
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted">
                  {i + 1}
                </span>
                <CoinLogo pair={`${r.pair}USDT`} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-text-primary">{r.pair}</span>
                    {r.isTop ? (
                      <span className="shrink-0 rounded bg-accent/15 px-1 py-px font-mono text-[9px] uppercase tracking-wider text-accent">
                        ★ Top
                      </span>
                    ) : null}
                    {st ? (
                      <span className={`shrink-0 rounded px-1 py-px text-[10px] font-medium ${st.c}`}>{st.l}</span>
                    ) : null}
                    {sortKey !== "ageH" && r.ageH != null ? (
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-text-muted">
                        {fmt.hours(r.ageH)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] tabular-nums text-text-muted">
                    {rest.map((k) => (
                      <span key={k}>
                        <span className="text-text-muted/80">{LEAD[k].label}</span>{" "}
                        <span className={LEAD[k].tone(r)}>{LEAD[k].text(r)}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-mono text-[17px] font-medium tabular-nums leading-tight ${lead.tone(r)}`}>
                    {lead.text(r)}
                  </span>
                  <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                    {lead.label}
                  </span>
                </span>
              </span>
              <span className="mt-2 block pl-[30px]">
                <Track row={r} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-5 rounded-full bg-loss/40" />
        <span className="text-[10.5px] text-text-muted">down to the stop</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-5 rounded-full bg-profit/65" />
        <span className="text-[10.5px] text-text-muted">left to the target</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-px bg-text-primary/40" />
        <span className="text-[10.5px] text-text-muted">the published entry</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-[3px] rounded-full bg-accent" />
        <span className="text-[10.5px] text-text-muted">what it costs now</span>
      </span>
      <span className="text-[10.5px] text-text-muted">· a green row is still at the plan</span>
    </div>
  );
}

export default function Shortlist({ rows, sortKey, onSort, onOpen }) {
  const phone = usePhone();
  if (!rows.length) return null;
  if (phone) {
    return (
      <div className="min-w-0">
        <PhoneList rows={rows} sortKey={sortKey} onOpen={onOpen} />
        <Legend />
      </div>
    );
  }
  const maxOf = (k) => Math.max(...rows.map((r) => Math.abs(r[k] ?? 0)), 0.0001);
  const maxes = Object.fromEntries(COLS.map((c) => [c.key, maxOf(c.key)]));

  return (
    <div className="min-w-0">
      <div className="no-scrollbar max-h-[54vh] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[1] bg-surface-raised">
            <tr className="border-b border-ink/[0.08]">
              <th className="w-7 py-1.5 pl-1 text-left font-mono text-[9px] text-text-muted">#</th>
              <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                Pair
              </th>
              <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                Stop · entry · price · target
              </th>
              {COLS.map((c) => (
                <th key={c.key} className={`px-2 py-1.5 text-right ${c.w}`}>
                  <button
                    type="button"
                    onClick={() => onSort?.(c.key)}
                    className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
                      sortKey === c.key ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {c.label}
                    <span className="text-[8px] opacity-70">{sortKey === c.key ? "↓" : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = STATUS(r.status);
              return (
                <tr
                  key={r.id}
                  onClick={() => onOpen?.(r.signal)}
                  className={`cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03] ${
                    r.atPlan ? "bg-profit/[0.04]" : ""
                  }`}
                >
                  <td className="py-2 pl-1 font-mono text-[10px] tabular-nums text-text-muted">
                    {i + 1}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <CoinLogo pair={`${r.pair}USDT`} size={20} />
                      <span className="text-[12.5px] font-medium text-text-primary">{r.pair}</span>
                      {r.isTop ? (
                        <span className="rounded bg-accent/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-accent">
                          ★ Top
                        </span>
                      ) : null}
                      {st ? (
                        <span className={`rounded px-1 py-px text-[9.5px] font-medium ${st.c}`}>
                          {st.l}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="min-w-[140px] px-2 py-2">
                    <Track row={r} />
                  </td>
                  <td className="py-1">
                    <Cell
                      value={r.distEntry}
                      max={maxes.distEntry}
                      text={fmt.pct(r.distEntry)}
                      tone={r.distEntry != null && r.distEntry > 5 ? "loss" : "accent"}
                    />
                  </td>
                  <td className="py-1">
                    <Cell
                      value={r.roomTp3}
                      max={maxes.roomTp3}
                      text={fmt.pct(r.roomTp3)}
                      tone={r.roomTp3 != null && r.roomTp3 > 0 ? "profit" : "loss"}
                    />
                  </td>
                  <td className="py-1">
                    <Cell value={r.rr} max={maxes.rr} text={fmt.mult(r.rr)} tone="profit" />
                  </td>
                  <td className="hidden py-1 md:table-cell">
                    <Cell value={r.vol24} max={maxes.vol24} text={fmt.usd(r.vol24)} />
                  </td>
                  <td className="hidden py-1 sm:table-cell">
                    <span className="block px-2 py-1 text-right font-mono text-[11.5px] tabular-nums text-text-secondary">
                      {fmt.hours(r.ageH)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legend />
    </div>
  );
}
