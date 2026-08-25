// src/components/ClaimPage.jsx
//
// The payer's side of an admin-created offer.
//
// Someone paid in a chat and was sent a link. They arrive here knowing they
// paid and hoping this is real — so the page leads with what they are getting,
// shows the amount and reference they can check against their own transfer,
// and only then asks them to sign in. Bouncing straight to a login wall is how
// a legitimate link gets mistaken for a phishing attempt.

import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { loginUrl } from "../utils/postLoginRedirect";

const METHOD_LABELS = {
  binance_uid: "Binance",
  onchain_bsc: "On-chain (BSC)",
  bank_transfer: "Bank transfer",
  other: "Other",
};

// Each of these needs a different next step from the reader, which is why the
// server returns which one it is rather than a bare "unavailable".
const BLOCKED = {
  already_claimed: {
    title: "This link has already been used",
    body: "The subscription it carried is now on an account. If that wasn't you, contact support and we'll sort it out.",
  },
  expired: {
    title: "This link has expired",
    body: "Links are short-lived on purpose. Your payment is still on record — ask support for a fresh link.",
  },
  cancelled: {
    title: "This link was cancelled",
    body: "It was withdrawn before it was used. Ask support for a new one.",
  },
  unavailable: {
    title: "This link is no longer available",
    body: "Contact support and we'll issue a new one.",
  },
};

const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 border-t border-ink/[0.08] py-2.5 first:border-t-0">
    <span className="text-[12px] text-text-muted">{label}</span>
    <span className="text-right text-[13px] font-medium text-text-primary">{children}</span>
  </div>
);

export default function ClaimPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshUser } = useAuth();

  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get(`/api/v1/subscription/claim/${token}`)
      .then((r) => alive && setOffer(r.data.offer))
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    try {
      const r = await api.post(`/api/v1/subscription/claim/${token}`);
      // The session in memory still says `free`; without this the app would
      // keep the upgrade wall up on the page they just paid to get past.
      await refreshUser();
      setDone(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not activate this. Please contact support.");
    } finally {
      setAccepting(false);
    }
  }, [token, refreshUser]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[13px] text-text-muted">
        Checking this link…
      </div>
    );
  }

  const blocked = notFound
    ? { title: "This link is not valid", body: "Check the link you were sent, or contact support." }
    : offer?.reason
      ? BLOCKED[offer.reason] || BLOCKED.unavailable
      : null;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10">
      {done ? (
        <div className="rounded-2xl border border-profit/30 bg-profit/[0.06] p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-profit/15">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-profit">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-4 text-[19px] font-semibold text-text-primary">
            {done.plan_label} is active
          </h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            {done.is_lifetime
              ? "Your access does not expire."
              : `Your access runs until ${new Date(done.expires_at).toLocaleDateString()}.`}
          </p>
          <button
            type="button"
            onClick={() => navigate("/signals")}
            className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg transition hover:brightness-95"
          >
            Open Signals
          </button>
        </div>
      ) : blocked ? (
        <div className="rounded-2xl border border-ink/10 bg-surface-raised p-6 text-center">
          <h1 className="text-[17px] font-semibold text-text-primary">{blocked.title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{blocked.body}</p>
          <a
            href="https://t.me/luxquantadmin"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block rounded-xl border border-ink/15 px-4 py-2 text-[12.5px] font-medium text-text-primary transition hover:bg-ink/[0.06]"
          >
            Contact support
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-ink/10 bg-surface-raised p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Payment received
          </p>
          <h1 className="mt-2 text-[21px] font-semibold leading-tight text-text-primary">
            {offer.plan_label} — {offer.duration_label}
          </h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            Confirm below and it starts on your account right away.
          </p>

          <div className="mt-5">
            <Row label="Access">{offer.duration_label}</Row>
            <Row label="Amount paid">${offer.amount_usd}</Row>
            <Row label="Paid via">
              {offer.method_label || METHOD_LABELS[offer.method] || offer.method}
            </Row>
            {offer.reference && <Row label="Reference">{offer.reference}</Row>}
          </div>

          {isAuthenticated ? (
            <>
              <button
                type="button"
                disabled={accepting}
                onClick={accept}
                className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg transition hover:brightness-95 disabled:opacity-50"
              >
                {accepting ? "Activating…" : "Activate on my account"}
              </button>
              <p className="mt-2.5 text-center text-[11.5px] text-text-muted">
                Signing in as @{user?.username}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate(loginUrl(`/claim/${token}`, { source: "claim_link" }))}
                className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg transition hover:brightness-95"
              >
                Sign in to activate
              </button>
              <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-text-muted">
                Your access attaches to the account you sign in with. Use the one you
                want to trade from.
              </p>
            </>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-loss/30 bg-loss/[0.07] px-3 py-2 text-center text-[12px] text-loss">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
