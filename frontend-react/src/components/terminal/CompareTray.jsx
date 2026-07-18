// src/components/terminal/CompareTray.jsx
// ════════════════════════════════════════════════════════════════
// Pin 2–4 setups and put them side by side. The screener answers "what is
// there?"; this answers the question that actually costs money — "of these,
// which one do I take?"
//
// Every row is a decision input, ordered by how much it should weigh:
// room left first (can I still catch it), then agreement, then risk.
// Best value per row is highlighted so the winner is readable at a glance.
// ════════════════════════════════════════════════════════════════
import { createPortal } from "react-dom";
import CoinLogo from "../CoinLogo";
import { POS, NEG, GOLD, MUTED, fmtPct, StatusTag } from "./vizShared";

import { tagHint } from "./tagGlossary";

const nice = (tag) => (tag || "").replaceAll("_", " ").toLowerCase();

// tag list where each term explains itself on hover
const TagList = ({ tags, className }) => (
  <span className={className}>
    {tags.map((t, i) => (
      <span key={t}>
        {i > 0 && " · "}
        <span
          title={tagHint(t) || undefined}
          className={
            tagHint(t)
              ? "cursor-help decoration-dotted underline-offset-2 hover:underline"
              : undefined
          }
        >
          {nice(t)}
        </span>
      </span>
    ))}
  </span>
);

// ── one comparison row ───────────────────────────────────────────
function Row({ label, hint, cells, best }) {
  return (
    <>
      <div
        className="border-t border-ink/[0.06] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted"
        title={hint}
      >
        {label}
      </div>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`border-t border-ink/[0.06] px-3 py-2 text-[12px] ${
            best === i ? "bg-accent/[0.07]" : ""
          }`}
          style={{ color: c.tone || "rgb(var(--fg))" }}
        >
          {c.node ?? c.text ?? "—"}
        </div>
      ))}
    </>
  );
}

// ── Which of these is actually the best? ─────────────────────────
// Deliberately built on room-vs-dip, NOT win rate. Win rate across this
// dataset sits ~85% for everything, and the tags that score highest on it
// (LATE_ENTRY, PARABOLIC) are the ones you least want to take — they attach
// to coins that already ran. Remaining upside measured against the typical
// drawdown is the honest question: "what do I stand to make here versus the
// pain I should expect, entering now?"
//
// Returns a winner plus the reasons it leads, and stays quiet when the data
// doesn't actually support a call.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function scoreOne(r) {
  // Remaining room against the dip this pair usually puts you through right
  // after a call (initial_mae_pct — NOT a stop distance, so not true R:R).
  const mae = r.room?.mae != null ? Math.abs(r.room.mae) : null;
  const rr = r.room && mae ? r.room.left / mae : null;

  let score = 0;
  if (rr != null)
    score += clamp(rr, -2, 4) * 2.5; // dominant term
  else if (r.pctLeft != null) score += (r.pctLeft / 100) * 4; // fallback: room only

  if (r.aligned) score += 2; // all timeframes agree
  if (r.htf) score += 1; // higher-timeframe trend behind it
  score -= r.warns.length * 1.5; // each warning is real risk
  if (r.room && r.room.left <= 0) score -= 4; // the move is already gone

  return { rr, score };
}

function buildVerdict(rows) {
  const scored = rows.map((r) => ({ ...r, ...scoreOne(r) }));
  const usable = scored.filter((r) => r.room != null);
  // Without post-call history there is nothing honest to compare on.
  if (usable.length < 2) return { scored, verdict: null };

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const win = ranked[0];
  const second = ranked[1];
  const margin = win.score - second.score;

  const maxRoom = Math.max(...scored.map((r) => r.room?.left ?? -Infinity));
  const maxRR = Math.max(...scored.map((r) => r.rr ?? -Infinity));
  const minWarn = Math.min(...scored.map((r) => r.warns.length));

  const reasons = [];
  if (win.room?.left != null && win.room.left === maxRoom)
    reasons.push(`most room left (+${win.room.left.toFixed(1)}%)`);
  if (win.rr != null && win.rr === maxRR) reasons.push(`best risk/reward (${win.rr.toFixed(1)}R)`);
  if (win.aligned) reasons.push("all timeframes agree");
  if (win.htf) reasons.push("higher-timeframe trend behind it");
  if (win.warns.length === minWarn && win.warns.length === 0) reasons.push("no warnings");

  // Be honest when it's not actually a clear call.
  const cautions = [];
  if (margin < 1.5) cautions.push(`${second.it.s.pair.replace(/USDT$/i, "")} is close behind`);
  if (win.warns.length)
    cautions.push(`it still carries ${win.warns.length} warning${win.warns.length > 1 ? "s" : ""}`);
  if (win.room && win.room.left <= 0) cautions.push("the usual move is already behind it");
  if (win.rr != null && win.rr < 1) cautions.push("the typical dip is bigger than the room left");

  return { scored, verdict: { win, reasons, cautions, weak: win.score <= 0 } };
}

export function CompareTray({ items, onRemove, onClear, onOpen, open, setOpen }) {
  if (!items.length) return null;

  const cols = items.length;
  const grid = { gridTemplateColumns: `120px repeat(${cols}, minmax(0,1fr))` };

  // ── derive every comparison input once ──
  const baseRows = items.map((it) => {
    const v3 = it.s.v3 || {};
    const tags = v3.tags || [];
    const room = it.room; // {peak,left,mae,n} | null
    const pctLeft = room && room.peak > 0 ? (room.left / room.peak) * 100 : null;
    const aligned =
      (v3.h4 && v3.h1 && v3.m15 && v3.h4 === v3.h1 && v3.h1 === v3.m15) ||
      tags.includes("MTF_FULL_ALIGNED");
    return {
      it,
      tags,
      room,
      pctLeft,
      aligned,
      warns: it.warnings || [],
      fc: it.fc,
      dir: v3.direction || it.s.signal_direction || null,
      htf: v3.h4_strength === "STRONG" || tags.includes("HTF_TREND_STRONG"),
      reasons: it.reasons || [],
    };
  });
  const { scored: rows, verdict } = buildVerdict(baseRows);

  const argMax = (vals) => {
    let bi = -1,
      bv = -Infinity;
    vals.forEach((v, i) => {
      if (v != null && v > bv) {
        bv = v;
        bi = i;
      }
    });
    return bi;
  };
  const argMin = (vals) => {
    let bi = -1,
      bv = Infinity;
    vals.forEach((v, i) => {
      if (v != null && v < bv) {
        bv = v;
        bi = i;
      }
    });
    return bi;
  };

  const panel = (
    <div
      className="fixed inset-0 z-[200000] flex items-end justify-center bg-scrim/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Compare setups"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-[1120px] flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl shadow-black/60 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/[0.07] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-text-primary">Compare setups</div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              Most room left and full agreement win. Highlight = best of the group.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/12 text-text-muted transition-colors hover:border-ink/25 hover:text-text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {verdict && (
          <div className="shrink-0 border-b border-ink/[0.07] bg-accent/[0.05] px-4 py-2.5">
            {verdict.weak ? (
              <div className="text-[12px] text-text-secondary">
                <span className="font-medium text-warning">Nothing here looks good.</span> Every
                pinned setup is either out of room or carrying too much risk — sitting this one out
                is a position too.
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                  Best of these
                </span>
                <span className="font-mono text-[14px] font-semibold text-accent">
                  {verdict.win.it.s.pair.replace(/USDT$/i, "")}
                </span>
                {verdict.reasons.length > 0 && (
                  <span className="text-text-secondary">— {verdict.reasons.join(" · ")}</span>
                )}
                {verdict.cautions.length > 0 && (
                  <span className="w-full text-[11px] text-warning">
                    Caveat: {verdict.cautions.join(" · ")}.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid min-w-[560px] items-stretch" style={grid}>
            {/* header */}
            <div className="sticky left-0 bg-surface-raised px-3 py-2.5" />
            {rows.map((r, i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <CoinLogo pair={r.it.s.pair} size={20} />
                  <span className="truncate font-mono text-[13px] text-text-primary">
                    {r.it.s.pair.replace(/USDT$/i, "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(r.it.s.signal_id)}
                    title="Remove"
                    aria-label={`Remove ${r.it.s.pair}`}
                    className="ml-auto text-text-muted transition-colors hover:text-loss"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1.5">
                  <StatusTag status={r.it.s.status} />
                </div>
              </div>
            ))}

            <Row
              label="Room left"
              hint="Typical peak after a call, minus the distance already travelled. The single best guide to whether you can still catch it."
              best={argMax(rows.map((r) => r.room?.left ?? null))}
              cells={rows.map((r) => ({
                text:
                  r.room == null ? "—" : r.room.left > 0 ? `+${r.room.left.toFixed(1)}%` : "none",
                tone:
                  r.pctLeft == null ? MUTED : r.pctLeft >= 60 ? POS : r.pctLeft >= 25 ? GOLD : NEG,
              }))}
            />
            <Row
              label="Typical peak"
              hint="How far this pair usually runs after a call."
              best={argMax(rows.map((r) => r.room?.peak ?? null))}
              cells={rows.map((r) => ({
                text: r.room?.peak ? `+${r.room.peak.toFixed(1)}%` : "—",
              }))}
            />
            <Row
              label="From call"
              hint="How far price has already moved since the call."
              cells={rows.map((r) => ({
                text: r.fc == null ? "—" : fmtPct(r.fc),
                tone: r.fc == null ? MUTED : r.fc >= 0 ? POS : NEG,
              }))}
            />
            <Row
              label="Room vs dip"
              hint="For every 1% this pair typically dips against you just after a call, how many % of upside are still ahead. Higher = the remaining move is large relative to the usual wobble. NOTE: this is not stop-based R:R — your real risk is wherever you place your stop."
              best={argMax(rows.map((r) => r.rr ?? null))}
              cells={rows.map((r) => ({
                text: r.rr == null ? "—" : `${r.rr.toFixed(1)}×`,
                tone: r.rr == null ? MUTED : r.rr >= 1.5 ? POS : r.rr >= 1 ? GOLD : NEG,
              }))}
            />
            <Row
              label="Typical drawdown"
              hint="Average move against you after a call — the pain to expect before it works. Lower is better."
              best={argMin(rows.map((r) => (r.room?.mae != null ? Math.abs(r.room.mae) : null)))}
              cells={rows.map((r) => ({
                text: r.room?.mae != null ? `${r.room.mae.toFixed(1)}%` : "—",
                tone: r.room?.mae != null ? NEG : MUTED,
              }))}
            />
            <Row
              label="Direction"
              cells={rows.map((r) => ({
                text: r.dir ? r.dir.toLowerCase() : "—",
                tone: r.dir === "BULLISH" ? POS : r.dir === "BEARISH" ? NEG : MUTED,
              }))}
            />
            <Row
              label="Timeframes"
              hint="4H / 1H / 15m agreement. All three pointing the same way is the cleanest read."
              best={argMax(rows.map((r) => (r.aligned ? 1 : 0)))}
              cells={rows.map((r) => ({
                text: r.aligned ? "all aligned" : "mixed",
                tone: r.aligned ? POS : MUTED,
              }))}
            />
            <Row
              label="HTF trend"
              cells={rows.map((r) => ({
                text: r.htf ? "strong" : "—",
                tone: r.htf ? POS : MUTED,
              }))}
            />
            <Row
              label="Why it fired"
              cells={rows.map((r) => ({
                node: r.reasons.length ? (
                  <TagList
                    tags={r.reasons}
                    className="text-[11px] leading-snug text-text-secondary"
                  />
                ) : (
                  "—"
                ),
              }))}
            />
            <Row
              label="Warnings"
              hint="Fewer is better — these are the reasons to be careful."
              best={argMin(rows.map((r) => r.warns.length))}
              cells={rows.map((r) => ({
                node: r.warns.length ? (
                  <TagList tags={r.warns} className="text-[11px] leading-snug text-warning" />
                ) : (
                  <span className="text-[11px]" style={{ color: POS }}>
                    none
                  </span>
                ),
              }))}
            />

            {/* open actions */}
            <div className="border-t border-ink/[0.06] px-3 py-2.5" />
            {rows.map((r, i) => (
              <div key={i} className="border-t border-ink/[0.06] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpen?.(r.it.s);
                  }}
                  className="w-full rounded-lg border border-ink/12 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* docked tray */}
      <div className="sticky bottom-2 z-30 mx-auto flex w-fit max-w-full items-center gap-2 rounded-xl border border-ink/[0.1] bg-surface-raised/95 px-2.5 py-1.5 shadow-2xl shadow-black/40 backdrop-blur">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
          Compare
        </span>
        <div className="flex items-center gap-1">
          {items.map((it) => (
            <button
              key={it.s.signal_id}
              type="button"
              onClick={() => onRemove(it.s.signal_id)}
              title={`Remove ${it.s.pair}`}
              className="flex items-center gap-1 rounded-md border border-ink/10 bg-ink/[0.03] px-1.5 py-1 text-[10px] text-text-secondary transition-colors hover:border-loss/40 hover:text-loss"
            >
              <CoinLogo pair={it.s.pair} size={14} />
              <span className="font-mono">{it.s.pair.replace(/USDT$/i, "")}</span>
              <span className="text-text-muted">✕</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={items.length < 2}
          className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
          title={items.length < 2 ? "Pin at least two setups" : "Compare side by side"}
        >
          Compare {items.length}
        </button>
        <button
          type="button"
          onClick={onClear}
          title="Clear all"
          className="px-1 font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          Clear
        </button>
      </div>
      {open && createPortal(panel, document.body)}
    </>
  );
}

export default CompareTray;
