// src/components/subscription/OpenInvoiceCard.jsx
// ════════════════════════════════════════════════════════════════
// A standing reminder that the customer has an unpaid invoice.
//
// 188 invoices have already lapsed unpaid with no transaction hash ever
// submitted. Until now nothing told those people anything: the invoice lived
// in one tab's router state, and the worker flipped it to `expired` in
// silence. This is the in-app half of fixing that; the Telegram DM from
// subscription_worker is the other half, for the people who have left.
//
// Deliberately NOT a modal. Someone mid-way through the product should be able
// to keep going — a sheet that must be dismissed to read the page turns a
// helpful reminder into a toll gate.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";

// Pages where the reminder is noise: the customer is already looking at the
// thing it would be pointing them to.
const MUTED_PATHS = ["/payment", "/pricing", "/login", "/register"];

const DISMISS_KEY = "lq:open-invoice:dismissed";

const fmtLeft = (expiresAt) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m left`;
  return `${Math.floor(ms / 60000)}m left`;
};

export default function OpenInvoiceCard() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [invoice, setInvoice] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1"
  );
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setInvoice(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const open = await subscriptionApi.getPendingInvoice();
        if (!cancelled) setInvoice(open);
      } catch {
        // A reminder that cannot load is not worth an error state.
        if (!cancelled) setInvoice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-checked when the role changes: paying is exactly what should make
    // this disappear without a reload.
  }, [isAuthenticated, user?.role]);

  const expiresAt = invoice?.expires_at || invoice?.payment?.expires_at;

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setLeft(fmtLeft(expiresAt));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!invoice || dismissed || !left) return null;
  if (MUTED_PATHS.some((p) => pathname.startsWith(p))) return null;

  const amount =
    invoice.final_amount_usdt ?? invoice.amount_usdt ?? invoice.payment?.final_amount;
  const planLabel = invoice.plan?.label || invoice.plan?.name || "Subscription";

  const close = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-accent/25 bg-surface-raised/95 p-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">
            {planLabel} is waiting
          </p>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {amount} USDT · {left}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/payment")}
          className="flex-shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Hide until next visit"
          className="flex-shrink-0 rounded-md p-1.5 text-text-muted/70 transition-colors hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
