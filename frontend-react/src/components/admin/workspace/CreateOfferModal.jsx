// src/components/admin/workspace/CreateOfferModal.jsx
//
// Record a payment taken outside the web and hand the payer a link to claim it.
//
// Why this is separate from ManualPaymentModal rather than a mode inside it:
// the two answer different questions. Recording applies access immediately and
// therefore needs the admin to already know the payer's account. An offer
// defers that to the payer, so the account picker becomes optional and a link
// comes out the other end. Folding both into one flow would mean every step of
// that modal asking "which mode am I in".

import { useEffect, useMemo, useState } from "react";
import { financeApi } from "../../../services/financeApi";

const METHODS = [
  { id: "binance_uid", label: "Binance", hint: "UID or transfer reference" },
  { id: "onchain_bsc", label: "On-chain", hint: "USDT on BSC" },
  { id: "bank_transfer", label: "Bank", hint: "Transfer reference" },
  { id: "other", label: "Other", hint: "OVO, GoPay, cash…" },
];

// Presets cover what is asked for almost every time; the field underneath is
// what the presets exist to make optional, not to replace — discounts and
// "just a few days" are the reason this feature was built.
const DURATION_PRESETS = [
  { label: "Follow plan", value: "" },
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "Lifetime", value: "0" },
];

const Label = ({ children, hint }) => (
  <div className="mb-1.5 flex items-baseline gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {children}
    </span>
    {hint && <span className="text-[10.5px] text-text-muted/70">{hint}</span>}
  </div>
);

const input =
  "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-[13px] text-text-primary " +
  "placeholder:text-text-muted/60 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30";

export default function CreateOfferModal({ isOpen, onClose, onCreated }) {
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [method, setMethod] = useState("binance_uid");
  const [methodLabel, setMethodLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [duration, setDuration] = useState("");
  const [ttlDays, setTtlDays] = useState("7");
  const [note, setNote] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [boundUser, setBoundUser] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    financeApi
      .getPlans()
      .then((d) => {
        setPlans(d.plans || []);
        if (d.plans?.length && !planId) setPlanId(String(d.plans[0].id));
      })
      .catch(() => setPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Debounced so typing a name does not fire a request per keystroke.
  useEffect(() => {
    if (!userQuery || userQuery.length < 2) {
      setUserResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      financeApi
        .searchUsers(userQuery)
        .then((d) => setUserResults(d.users || []))
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery]);

  const plan = useMemo(
    () => plans.find((p) => String(p.id) === String(planId)) || null,
    [plans, planId]
  );

  const durationLabel = useMemo(() => {
    if (duration === "0") return "Lifetime";
    if (duration) return `${duration} days`;
    if (!plan) return "—";
    return plan.is_lifetime ? "Lifetime" : `${plan.duration_days} days`;
  }, [duration, plan]);

  const canSubmit =
    planId && Number(amount) > 0 && note.trim().length >= 10 && !busy &&
    (method !== "other" || methodLabel.trim().length > 0);

  const reset = () => {
    setCreated(null);
    setError(null);
    setCopied(false);
    setAmount("");
    setReference("");
    setDuration("");
    setNote("");
    setBoundUser(null);
    setUserQuery("");
    setMethodLabel("");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await financeApi.createOffer({
        plan_id: Number(planId),
        amount_usd: Number(amount),
        method,
        method_label: method === "other" ? methodLabel.trim() : null,
        reference: reference.trim() || null,
        duration_days: duration === "" ? null : Number(duration),
        user_id: boundUser?.id ?? null,
        ttl_days: Number(ttlDays) || 7,
        admin_note: note.trim(),
      });
      setCreated(res.offer);
      onCreated?.(res.offer);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.claim_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the field below is selectable */
    }
  };

  if (!isOpen) return null;

  return (
    <div className="lq-scrim fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-ink/10 bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              {created ? "Link ready" : "Create claim link"}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-text-muted">
              {created
                ? "Send this to whoever paid. Access starts when they open it."
                : "For a payment made in chat — the payer claims it themselves."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-ink/[0.06] hover:text-text-primary"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {created ? (
          <div className="px-5 py-5">
            <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Claim link
              </p>
              <p className="mt-2 break-all font-mono text-[12px] text-text-primary">
                {created.claim_url}
              </p>
              <button
                type="button"
                onClick={copy}
                className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-fg transition hover:brightness-95"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              <dt className="text-text-muted">Plan</dt>
              <dd className="text-right text-text-primary">{created.plan_label}</dd>
              <dt className="text-text-muted">Access</dt>
              <dd className="text-right text-text-primary">{created.duration_label}</dd>
              <dt className="text-text-muted">Amount</dt>
              <dd className="text-right font-mono text-text-primary">${created.amount_usd}</dd>
              <dt className="text-text-muted">Claimable by</dt>
              <dd className="text-right text-text-primary">
                {created.bound_username ? `@${created.bound_username}` : "anyone with the link"}
              </dd>
              <dt className="text-text-muted">Link expires</dt>
              <dd className="text-right text-text-primary">
                {created.expires_at ? new Date(created.expires_at).toLocaleDateString() : "—"}
              </dd>
            </dl>

            {created.is_open && (
              <p className="mt-4 rounded-lg border border-ink/10 bg-ink/[0.04] px-3 py-2 text-[11.5px] leading-relaxed text-text-secondary">
                This link is not tied to an account, so whoever opens it first gets the
                subscription. Send it directly to the payer, and cancel it if it goes astray.
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-[12px] font-medium text-text-primary transition hover:bg-ink/[0.06]"
              >
                Create another
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="flex-1 rounded-lg bg-ink/[0.1] px-3 py-2 text-[12px] font-medium text-text-primary transition hover:bg-ink/[0.14]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div>
              <Label>Paid via</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    title={m.hint}
                    className={`rounded-lg border px-2 py-2 text-[11.5px] font-medium transition ${
                      method === m.id
                        ? "border-accent bg-accent/10 text-text-primary"
                        : "border-ink/12 text-text-muted hover:bg-ink/[0.05]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {method === "other" && (
              <div>
                <Label>Method name</Label>
                <input
                  className={input}
                  value={methodLabel}
                  onChange={(e) => setMethodLabel(e.target.value)}
                  placeholder="OVO, GoPay, cash…"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label hint="what they paid">Amount (USD)</Label>
                <input
                  className={input}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="45"
                />
              </div>
              <div>
                <Label>Reference</Label>
                <input
                  className={input}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UID / tx / note"
                />
              </div>
            </div>

            <div>
              <Label>Plan</Label>
              <select className={input} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — ${p.price_usdt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label hint={`grants ${durationLabel}`}>Access length</Label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] transition ${
                      duration === d.value
                        ? "border-accent bg-accent/10 text-text-primary"
                        : "border-ink/12 text-text-muted hover:bg-ink/[0.05]"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <input
                className={`${input} mt-2`}
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="or type any number of days"
              />
            </div>

            <div>
              <Label hint="optional — leave empty if you don't know their account">
                Lock to account
              </Label>
              {boundUser ? (
                <div className="flex items-center justify-between rounded-lg border border-ink/12 px-3 py-2">
                  <span className="text-[12.5px] text-text-primary">
                    @{boundUser.username}
                    <span className="ml-2 text-text-muted">{boundUser.email}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBoundUser(null)}
                    className="text-[11px] text-text-muted underline hover:text-text-primary"
                  >
                    clear
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className={input}
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search username or email…"
                  />
                  {userResults.length > 0 && (
                    <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-ink/12">
                      {userResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setBoundUser(u);
                            setUserQuery("");
                            setUserResults([]);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition hover:bg-ink/[0.05]"
                        >
                          <span className="text-text-primary">@{u.username}</span>
                          <span className="text-text-muted">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label hint="days">Link valid for</Label>
                <input
                  className={input}
                  value={ttlDays}
                  onChange={(e) => setTtlDays(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div>
              <Label hint="min 10 characters — kept in the audit trail">Note</Label>
              <textarea
                className={`${input} min-h-[64px] resize-y`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Paid 45 USDT via Binance UID 123456, agreed 30 days at a discount"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-loss/30 bg-loss/[0.07] px-3 py-2 text-[12px] text-loss">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-fg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
