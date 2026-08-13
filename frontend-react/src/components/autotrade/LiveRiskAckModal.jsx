// src/components/autotrade/LiveRiskAckModal.jsx
// Shown before LIVE trading. Dry-run never hits this. The point is not
// legal theatre — it is to make the user say, out loud, that they own
// the size, the leverage, and the losses.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoldButton, GhostButton } from "./AutoTradeUI";

const ITEMS = [
  {
    id: "own",
    label: "I choose the size, leverage, markets, and when the assistant is on. LuxQuant does not manage my money.",
  },
  {
    id: "loss",
    label: "I can lose money, including all margin on a trade. Nothing here guarantees profit.",
  },
  {
    id: "watch",
    label: "I will pause LIVE when I cannot supervise it. Agent is not a set-and-forget money machine.",
  },
  {
    id: "self",
    label: "Matching signals may place real exchange orders. Those outcomes are mine, win or lose.",
  },
];

export default function LiveRiskAckModal({
  open,
  firstTime = true,
  onCancel,
  onConfirm,
}) {
  const [checked, setChecked] = useState({});

  useEffect(() => {
    if (!open) return undefined;
    setChecked({});
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
            open positions keep their take-profit and stop-loss on the exchange.
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <GoldButton onClick={onConfirm} disabled={!ready}>
            I understand — go live
          </GoldButton>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
