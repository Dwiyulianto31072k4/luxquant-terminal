// src/components/autotrade/LiveRiskAckModal.jsx
// Shown before LIVE trading. Dry-run never hits this. The point is not
// legal theatre — it is to make the user say, out loud, that they own
// the size, the leverage, and the losses.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { submitAgentDisclaimerAck } from "../../services/authApi";
import { LIVE_FORM, buildAckPayload } from "./agentDisclaimerCopy";
import { GoldButton, GhostButton } from "./AutoTradeUI";

const ITEMS = LIVE_FORM.checks;

export default function LiveRiskAckModal({
  open,
  firstTime = true,
  onCancel,
  onConfirm,
}) {
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setChecked({});
    setSaving(false);
    setError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const ready = firstTime ? ITEMS.every((item) => checked[item.id]) : true;

  const body = (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-ack-title"
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-ink/10 bg-surface-raised p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          Live trading
        </p>
        <h2 id="live-ack-title" className="mt-1 text-lg font-semibold tracking-tight text-text-primary">
          {firstTime ? "Before Agent places real orders" : "Start LIVE Agent?"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          Agent follows <span className="text-text-primary">your</span> rules on{" "}
          <span className="text-text-primary">your</span> exchange account. It is
          an assistant, not a promise, a managed account, or financial advice.
        </p>

        {firstTime ? (
          <ul className="mt-4 space-y-2.5">
            {ITEMS.map((item) => {
              const on = Boolean(checked[item.id]);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink/[0.08] bg-surface-secondary/60 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span className="text-[12.5px] leading-snug text-text-secondary">{item.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-ink/[0.08] bg-surface-secondary/60 px-3 py-2.5 text-[12.5px] leading-snug text-text-secondary">
            New matching signals may place real orders with real funds. Pause anytime —
            open positions keep their exchange protection (TP/SL or hard SL + trailing).
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {error ? (
            <p className="w-full text-[12px] leading-5 text-negative">{error}</p>
          ) : (
            <p className="w-full text-[11px] leading-5 text-text-muted">
              This confirmation is logged with time and IP, and can be printed as PDF in admin.
            </p>
          )}
          <GhostButton onClick={onCancel} disabled={saving}>
            Cancel
          </GhostButton>
          <GoldButton
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await submitAgentDisclaimerAck(buildAckPayload(LIVE_FORM, firstTime ? checked : Object.fromEntries(ITEMS.map((i) => [i.id, true]))));
                await onConfirm?.();
              } catch (err) {
                setError(err?.response?.data?.detail || err.message || "Could not save the signed form");
              } finally {
                setSaving(false);
              }
            }}
            disabled={!ready || saving}
          >
            {saving ? "Saving…" : "I understand — go live"}
          </GoldButton>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
