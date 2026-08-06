// Soft account tease AFTER the proof modal closes (never stacked on the chart).
// Portaled to document.body so fixed positioning is never clipped by
// section transform/overflow (marquee, sticky parents, etc.).
// Sticky CTA is hidden while this is open (via lq-soft-gate-* events).

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { loginUrl } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import { emitSoftGateClose, emitSoftGateOpen } from "../../landingSoftGate";
import { CTA } from "../../landingCopy";
import { PrimaryButton, SecondaryButton } from "./LandingButtons";

const symbolOf = (pair) => pair?.replace(/USDT$/i, "").replace(/^3A/, "") || null;

export default function LandingSoftGateSheet({
  open,
  coinPair,
  gainPct = null,
  meta = null,
  source = "landing_soft_gate",
  onClose,
}) {
  const navigate = useNavigate();

  // Only the open instance owns sticky-hide; closed mounts must not emit close
  // (multiple sections each render this sheet).
  useEffect(() => {
    if (!open) return undefined;
    emitSoftGateOpen();
    return () => emitSoftGateClose();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const coin = symbolOf(coinPair);
  const gain = gainPct ?? meta?.gain_pct ?? null;

  const goLogin = () => {
    trackFunnel("soft_gate_login_click", {
      source,
      path: "/",
      meta: meta || (coinPair ? { pair: coinPair } : null),
    });
    navigate(loginUrl("/home", { source }));
  };

  return createPortal(
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
          {CTA.gateTitle(coin, gain)}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{CTA.gateBody}</p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <PrimaryButton size="md" width="full" onClick={goLogin} className="sm:flex-1">
            {CTA.gatePrimary}
          </PrimaryButton>
          <SecondaryButton size="md" width="full" onClick={onClose} className="sm:flex-1">
            {CTA.gateSecondary}
          </SecondaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
