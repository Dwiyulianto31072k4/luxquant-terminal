// Soft account tease over open proof charts — chart stays open underneath.
// Sticky CTA is hidden while this is open (via lq-soft-gate-* events).

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUrl } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import { emitSoftGateClose, emitSoftGateOpen } from "../../landingSoftGate";
import { CTA } from "../../landingCopy";

const GOLD_BTN = {
  background:
    "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
  color: "rgb(var(--accent-fg))",
};

const symbolOf = (pair) => pair?.replace(/USDT$/i, "").replace(/^3A/, "") || null;

export default function LandingSoftGateSheet({ open, coinPair, meta = null, source = "landing_soft_gate", onClose }) {
  const navigate = useNavigate();

  // Only the open instance owns sticky-hide; closed mounts must not emit close
  // (multiple sections each render this sheet).
  useEffect(() => {
    if (!open) return undefined;
    emitSoftGateOpen();
    return () => emitSoftGateClose();
  }, [open]);

  if (!open) return null;

  const coin = symbolOf(coinPair);

  const goLogin = () => {
    trackFunnel("soft_gate_login_click", {
      source,
      path: "/",
      meta: meta || (coinPair ? { pair: coinPair } : null),
    });
    navigate(loginUrl("/home", { source }));
  };

  return (
    <div
      className="fixed inset-0 z-[100050] flex items-end justify-center bg-scrim/35 p-3 sm:items-end sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lq-soft-gate-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink/10 bg-surface p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          {CTA.gateEyebrow}
        </p>
        <h3 id="lq-soft-gate-title" className="mt-2 text-lg font-bold text-text-primary">
          {CTA.gateTitle(coin)}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{CTA.gateBody}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={goLogin}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold"
            style={GOLD_BTN}
          >
            {CTA.gatePrimary}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-ink/12 px-4 py-2.5 text-sm font-medium text-text-primary/80"
          >
            {CTA.gateSecondary}
          </button>
        </div>
      </div>
    </div>
  );
}
