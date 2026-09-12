// NarrativeCallsModal — the calls behind one bubble.
//
// Tapping a narrative asks "what did we actually call in there", so this lists
// the desk's own calls for that narrative's coins: newest first, the same
// columns the table uses, and a row opens the full call. Filtering the desk is
// still one tap away at the bottom — the modal answers the question, the filter
// changes what you are working on, and conflating the two is how a drill-down
// turns into a detour.

import { useMemo } from "react";
import Modal from "./ui/Modal";
import CoinLogo from "./CoinLogo";

const fmtAgo = (iso) => {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

function statusMeta(st) {
  const s = String(st || "").toLowerCase();
  if (s === "sl" || s === "closed_loss") return { l: "SL", c: "bg-loss/12 text-loss" };
  if (s === "closed_win") return { l: "Win", c: "bg-profit/12 text-profit" };
  if (s.startsWith("tp")) return { l: s.toUpperCase(), c: "bg-profit/12 text-profit" };
  return { l: "Open", c: "bg-accent/12 text-accent" };
}

export default function NarrativeCallsModal({
  narrative,
  signals = [],
  isOpen,
  onClose,
  onOpenSignal,
  onFilterDesk,
}) {
  const rows = useMemo(() => {
    if (!narrative) return [];
    const pairs = new Set(narrative.pairs || []);
    return signals
      .filter((s) => pairs.has(s.pair))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [narrative, signals]);

  if (!narrative) return null;

  const rs = narrative.__rs;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      eyebrow="Narrative"
      title={narrative.name}
      subtitle={
        `${narrative.coins_called} coins called · ${narrative.n} resolved · WR ${
          narrative.wr != null ? `${narrative.wr.toFixed(1)}%` : "—"
        }` + (rs != null ? ` · ${rs >= 0 ? "+" : ""}${rs.toFixed(1)}pp vs market` : "")
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">
            {rows.length} of these are in the last 7 days
          </span>
          <button
            type="button"
            onClick={() => {
              onFilterDesk?.(narrative);
              onClose?.();
            }}
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-fg"
          >
            Filter the desk
          </button>
        </div>
      }
    >
      {!rows.length ? (
        <p className="py-8 text-center text-[12.5px] text-text-muted">
          No calls from the last 7 days in this narrative. The table&apos;s figures cover a longer
          window than the desk keeps loaded.
        </p>
      ) : (
        <div className="max-h-[56vh] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-raised">
              <tr className="border-b border-ink/[0.06]">
                <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Pair
                </th>
                <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Entry
                </th>
                <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Status
                </th>
                <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Called
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const sm = statusMeta(s.status);
                return (
                  <tr
                    key={s.signal_id}
                    onClick={() => {
                      onOpenSignal?.(s);
                      onClose?.();
                    }}
                    className="cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03]"
                  >
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <CoinLogo pair={s.pair} size={20} />
                        <span className="text-[12.5px] font-medium text-text-primary">
                          {String(s.pair || "").replace(/USDT$/i, "")}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11.5px] tabular-nums text-text-secondary">
                      {s.entry ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${sm.c}`}>
                        {sm.l}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] tabular-nums text-text-muted">
                      {fmtAgo(s.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
