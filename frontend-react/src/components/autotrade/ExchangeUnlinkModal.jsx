// Unlink or switch venue. Server still fail-closes on open bot positions.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getExchangeUnlinkPreview, setStrategyActive, unlinkExchange } from "../../services/autotradeApi";
import { useDialog } from "../../hooks/useDialog";
import { Notice, GoldButton, GhostButton } from "./AutoTradeUI";
import { EXCHANGE_VENUES, VenueLogo } from "./exchangeVenues";

function venueName(id) {
  return EXCHANGE_VENUES[id]?.name || id || "exchange";
}

export default function ExchangeUnlinkModal({
  isOpen,
  onClose,
  exchange,
  targetExchange = null,
  onUnlinked,
  onOpenPositions,
}) {
  const dialogRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);

  useDialog({ isOpen, onClose, ref: dialogRef });

  const fromName = venueName(exchange);
  const toName = targetExchange ? venueName(targetExchange) : null;
  const switching = Boolean(targetExchange);

  useEffect(() => {
    if (!isOpen || !exchange) return undefined;
    let alive = true;
    setPreview(null);
    setError("");
    setAck(false);
    setLoading(true);
    getExchangeUnlinkPreview(exchange)
      .then((data) => {
        if (!alive) return;
        setPreview(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || `Could not check ${fromName}`);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, exchange, fromName]);

  if (!isOpen) return null;

  const blockers = preview?.blockers || [];
  const blocked = Boolean(preview && !preview.can_unlink);
  const engineOn = Boolean(preview?.engine?.is_active);
  const dryRun = preview?.engine?.dry_run !== false;
  const openPositions = preview?.open_bot_positions || [];

  const confirm = async () => {
    setWorking(true);
    setError("");
    try {
      if (engineOn) {
        try {
          await setStrategyActive(exchange, false);
        } catch {
          // DELETE also pauses this venue; do not flip dry-run here.
        }
      }
      await unlinkExchange(exchange);
      onUnlinked?.({ exchange, targetExchange });
      onClose?.();
    } catch (err) {
      const detail = err?.detail || {};
      setPreview((current) => ({
        ...(current || {}),
        can_unlink: false,
        blockers: detail.blockers || current?.blockers || [],
        open_bot_positions: detail.open_bot_positions || current?.open_bot_positions || [],
      }));
      setError(err.message || `Could not unlink ${fromName}`);
    } finally {
      setWorking(false);
    }
  };

  const modal = (
    <div className="lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="lq-scrim" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlink-venue-title"
        onClick={(event) => event.stopPropagation()}
        className="lq-sheet relative z-10 flex max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-ink/[0.07] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <VenueLogo venue={exchange} className="h-10 w-10" />
            {switching ? (
              <>
                <span className="text-text-muted" aria-hidden>
                  →
                </span>
                <VenueLogo venue={targetExchange} className="h-10 w-10" />
              </>
            ) : null}
            <div className="min-w-0">
              <h2
                id="unlink-venue-title"
                className="text-[18px] font-semibold tracking-tight text-text-primary"
              >
                {switching ? `Switch to ${toName}` : `Unlink ${fromName}`}
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                One venue at a time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/[0.08] text-text-muted hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {loading ? (
            <p className="text-sm text-text-muted">Checking {fromName}…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-6 text-text-secondary">
                {switching
                  ? `Yes — unlink ${fromName} first, then connect ${toName}. Agent runs one desk at a time so size is not doubled.`
                  : `${fromName} keys are removed from Agent. The exchange account itself is untouched.`}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-ink/[0.08] bg-surface-secondary px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">Assistant</p>
                  <p className="mt-0.5 text-[13px] font-medium text-text-primary">
                    {engineOn ? "Will pause" : "Already paused"}
                  </p>
                </div>
                <div className="rounded-lg border border-ink/[0.08] bg-surface-secondary px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">Dry run</p>
                  <p className="mt-0.5 text-[13px] font-medium text-text-primary">
                    {dryRun ? "Kept on" : "Left as live (still paused)"}
                  </p>
                </div>
              </div>

              {blocked ? (
                <Notice tone="error">
                  {blockers[0]?.message || `Cannot unlink ${fromName} yet.`}
                </Notice>
              ) : null}

              {openPositions.length ? (
                <div className="rounded-lg border border-[#F6465D]/25 bg-[#F6465D]/[0.05] px-3 py-3">
                  <p className="text-[13px] font-medium text-text-primary">
                    Open Agent positions on {fromName}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {openPositions.map((row) => (
                      <li key={row.id} className="font-mono text-[12px] text-text-secondary">
                        {row.symbol} · {row.market_type} · {row.status}
                      </li>
                    ))}
                  </ul>
                  {onOpenPositions ? (
                    <button
                      type="button"
                      onClick={onOpenPositions}
                      className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent"
                    >
                      Open Positions tab →
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Kept
                </p>
                <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-text-secondary">
                  {(preview?.keeps || []).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Removed
                </p>
                <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-text-secondary">
                  {(preview?.removes || []).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>

              {switching ? (
                <p className="text-[12px] leading-5 text-text-muted">
                  {toName} starts paused in dry-run. You turn it on.
                </p>
              ) : null}

              {!blocked ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink/[0.08] bg-surface-secondary/60 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(event) => setAck(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-[13px] leading-5 text-text-secondary">
                    {switching
                      ? `Unlink ${fromName}, then I will paste ${toName} keys myself.`
                      : `Remove the ${fromName} API key from Agent.`}
                  </span>
                </label>
              ) : null}

              {error ? <Notice tone="error">{error}</Notice> : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-ink/[0.07] px-5 py-4 sm:px-6">
          <GhostButton onClick={onClose} disabled={working} className="flex-1">
            Cancel
          </GhostButton>
          {blocked ? (
            <GoldButton onClick={onOpenPositions || onClose} className="flex-1">
              {onOpenPositions ? "Go to Positions" : "Close"}
            </GoldButton>
          ) : (
            <GhostButton
              tone="danger"
              onClick={confirm}
              disabled={working || loading || !ack || !preview?.can_unlink}
              className="flex-1"
            >
              {working
                ? switching
                  ? "Switching…"
                  : "Unlinking…"
                : switching
                  ? `Unlink ${fromName}`
                  : `Unlink ${fromName}`}
            </GhostButton>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
