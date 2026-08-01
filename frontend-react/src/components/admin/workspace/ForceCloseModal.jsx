// src/components/admin/workspace/ForceCloseModal.jsx
// ════════════════════════════════════════════════════════════════
// Closing someone else's position, from the operator console.
//
// This exists for one situation: an account holding a position that is
// uncapped and drifting, whose owner cannot be reached. Without it the
// only options were to leave it, or to go hunting through Binance by hand.
//
// Everything here is friction on purpose. The symbol must be typed back,
// a reason is required, and the reason is shown to the account holder
// afterwards. The backend enforces all three again — this is the polite
// copy of the rule, not the rule itself.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { forceCloseUserPosition } from "../../../services/autotradeApi";

const DOWN = "var(--tone-down, #f87171)";

export default function ForceCloseModal({ position, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  if (!position) return null;

  const symbol = String(position.symbol || "").toUpperCase();
  const ready = typed.trim().toUpperCase() === symbol && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await forceCloseUserPosition(position.position_id, {
        confirmation: typed.trim(),
        reason: reason.trim(),
      });
      setResult(res);
      onDone?.();
    } catch (e) {
      // Show what the server actually said. A vague "failed" here would leave
      // the operator unsure whether the position is closed or not.
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={() => !busy && onClose?.()}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-ink/[0.08] bg-surface p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Force close ${symbol}`}
      >
        {result ? (
          <>
            <h3 className="text-base font-semibold text-text">Position closed</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              {symbol} was closed for {result.closed_for || position.subject}. The account
              holder's strategy has been paused so the bot does not re-enter behind you.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-md bg-ink/[0.08] py-2 text-[13px] font-medium text-text"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-text">
              Close {symbol} for {position.subject}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              This sells at market on someone else's account. It cannot be undone, and the
              reason you give is shown to them afterwards.
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-ink/[0.04] p-3 text-[12px]">
              <dt className="text-text-muted">Market</dt>
              <dd className="text-right text-text">
                {position.market_type}
                {position.leverage ? ` ${position.leverage}×` : ""}
              </dd>
              <dt className="text-text-muted">Side</dt>
              <dd className="text-right text-text">{position.side}</dd>
              <dt className="text-text-muted">Quantity</dt>
              <dd className="text-right tabular-nums text-text">{position.quantity}</dd>
              <dt className="text-text-muted">Entry</dt>
              <dd className="text-right tabular-nums text-text">{position.entry_price ?? "—"}</dd>
            </dl>

            {position.unprotected ? (
              <p className="mt-3 rounded-md px-3 py-2 text-[12px]" style={{ color: DOWN }}>
                This position has no stop-loss on the exchange, so its downside is uncapped.
              </p>
            ) : null}

            <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Type {symbol} to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-ink/[0.12] bg-transparent px-3 py-2 text-[13px] text-text"
            />

            <label className="mt-3 block text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Reason (shown to the account holder)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="e.g. no stop-loss, close to liquidation, could not reach you"
              className="mt-1 w-full rounded-md border border-ink/[0.12] bg-transparent px-3 py-2 text-[13px] text-text"
            />

            {error ? (
              <p className="mt-3 text-[12px]" style={{ color: DOWN }}>
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-md bg-ink/[0.06] py-2 text-[13px] font-medium text-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!ready || busy}
                className="flex-1 rounded-md py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                style={{ background: DOWN }}
              >
                {busy ? "Closing…" : "Close at market"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
