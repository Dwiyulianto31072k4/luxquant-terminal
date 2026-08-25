// src/components/admin/workspace/CreateOfferModal.jsx
// ════════════════════════════════════════════════════════════════
// Record a payment taken outside the web and hand the payer a link to
// claim it themselves.
//
// Why this is separate from ManualPaymentModal rather than a mode inside it:
// the two answer different questions. Recording applies access immediately and
// therefore needs the admin to already know the payer's account. An offer
// defers that to the payer, so the account picker becomes optional and a link
// comes out the other end.
//
// It borrows that modal's vocabulary on purpose — same <Modal> shell, same
// numbered steps, same Field/TextInput treatment — because an admin moving
// between the two should not feel they have changed products.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { financeApi } from "../../../services/financeApi";
import { CheckCircleIcon, CopyIcon, SearchIcon, AlertTriangleIcon } from "../Icons";
import Modal from "../../ui/Modal";
import { GoldButton, GhostButton } from "../../autotrade/AutoTradeUI";

const METHODS = [
  { id: "binance_uid", label: "Binance", hint: "UID or transfer reference" },
  { id: "onchain_bsc", label: "On-chain", hint: "USDT on BSC" },
  { id: "bank_transfer", label: "Bank", hint: "Transfer reference" },
  { id: "other", label: "Other", hint: "OVO, GoPay, cash…" },
];

// Presets cover what is asked for almost every time. The field beside them is
// the point of the feature, not a fallback — discounts and "just a few days"
// match no plan row.
const PRESETS = [
  { label: "Plan", value: "", title: "Use the plan's own length" },
  { label: "7d", value: "7" },
  { label: "14d", value: "14" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
  { label: "1y", value: "365" },
  { label: "∞", value: "0", title: "Lifetime" },
];

/* ── shared vocabulary with ManualPaymentModal ────────────────── */

const StepHeader = ({ num, title, complete, hint }) => (
  <div className="mb-2.5 flex items-center gap-2">
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
      style={{
        background: complete ? "rgb(var(--pos) / 0.18)" : "rgb(var(--accent) / 0.16)",
        color: complete ? "rgb(var(--pos-text))" : "rgb(var(--accent))",
        border: `1px solid ${complete ? "rgb(var(--pos) / 0.32)" : "rgb(var(--accent) / 0.3)"}`,
      }}
    >
      {complete ? "✓" : num}
    </span>
    <h4 className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "rgb(var(--fg))" }}>
      {title}
    </h4>
    {hint && (
      <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {hint}
      </span>
    )}
  </div>
);

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <label
      className="block text-[9.5px] font-semibold uppercase tracking-wider"
      style={{ color: "rgb(var(--ink) / 0.5)" }}
    >
      {label}
    </label>
    {children}
    {hint && (
      <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {hint}
      </p>
    )}
  </div>
);

const TextInput = ({ value, onChange, placeholder, mono, autoFocus, numeric }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(numeric ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
    placeholder={placeholder}
    autoFocus={autoFocus}
    inputMode={numeric ? "numeric" : undefined}
    className={`w-full rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 ${mono ? "font-mono tabular-nums" : ""}`}
    style={{ background: "rgb(var(--surface-secondary))", border: "1px solid rgb(var(--ink) / 0.1)" }}
  />
);

const Choice = ({ active, onClick, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
    style={{
      background: active ? "rgb(var(--accent) / 0.14)" : "rgb(var(--surface-secondary))",
      border: `1px solid ${active ? "rgb(var(--accent) / 0.45)" : "rgb(var(--ink) / 0.1)"}`,
      color: active ? "rgb(var(--accent))" : "rgb(var(--fg-muted))",
    }}
  >
    {children}
  </button>
);

/* ── the modal ────────────────────────────────────────────────── */

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
        setPlanId((cur) => cur || (d.plans?.length ? String(d.plans[0].id) : ""));
      })
      .catch(() => setPlans([]));
  }, [isOpen]);

  // Debounced — typing a name should not fire a request per keystroke.
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

  const step1Done = Number(amount) > 0 && (method !== "other" || methodLabel.trim().length > 0);
  const step2Done = !!planId;
  const step3Done = note.trim().length >= 10;
  const canSubmit = step1Done && step2Done && step3Done && !busy;

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

  const closeAll = () => {
    reset();
    onClose();
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
      /* clipboard blocked — the link below is selectable */
    }
  };

  const header = (
    <div className="px-5 pt-5 pb-3">
      <p
        className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em]"
        style={{ color: "rgb(var(--fg-muted))" }}
      >
        Finance · Off-web payment
      </p>
      <h3 className="mt-0.5 font-display text-base font-semibold tracking-tight text-text-primary">
        {created ? "Link ready to send" : "Create claim link"}
      </h3>
      <p className="mt-0.5 text-[11.5px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {created
          ? "Send this to whoever paid. Their access starts when they open it."
          : "The payer activates it themselves, on the account they actually use."}
      </p>
    </div>
  );

  // A summary the admin reads before committing — the fields above are the
  // inputs, this is the outcome, and they should not have to assemble it
  // in their head from eight scattered controls.
  const footer = created ? (
    <div className="flex gap-2 px-5 py-4">
      <GhostButton onClick={reset} className="flex-1">
        Create another
      </GhostButton>
      <GoldButton onClick={closeAll} className="flex-1">
        Done
      </GoldButton>
    </div>
  ) : (
    <div className="px-5 py-4">
      <div
        className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-[11.5px]"
        style={{ background: "rgb(var(--surface-secondary))", border: "1px solid rgb(var(--ink) / 0.08)" }}
      >
        <span style={{ color: "rgb(var(--fg-muted))" }}>Grants</span>
        <span className="font-semibold text-text-primary">{plan?.label || "—"}</span>
        <span style={{ color: "rgb(var(--ink) / 0.3)" }}>·</span>
        <span className="font-semibold" style={{ color: "rgb(var(--accent))" }}>
          {durationLabel}
        </span>
        <span style={{ color: "rgb(var(--ink) / 0.3)" }}>·</span>
        <span className="font-mono tabular-nums text-text-primary">
          ${Number(amount || 0).toFixed(2)}
        </span>
        <span className="ml-auto" style={{ color: "rgb(var(--fg-muted))" }}>
          {boundUser ? `@${boundUser.username} only` : "anyone with the link"}
        </span>
      </div>

      {error && (
        <p
          className="mb-2.5 flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px]"
          style={{ background: "rgb(var(--neg) / 0.08)", color: "rgb(var(--neg-text))" }}
        >
          <AlertTriangleIcon size={11} />
          {error}
        </p>
      )}

      <GoldButton onClick={submit} disabled={!canSubmit} className="w-full">
        {busy ? "Creating…" : "Create link"}
      </GoldButton>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeAll}
      size="md"
      padded={false}
      header={header}
      footer={footer}
    >
      {created ? (
        <div className="space-y-4 px-5 pb-5">
          <div
            className="rounded-lg p-3.5"
            style={{ background: "rgb(var(--accent) / 0.07)", border: "1px solid rgb(var(--accent) / 0.28)" }}
          >
            <p
              className="text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ color: "rgb(var(--ink) / 0.5)" }}
            >
              Claim link
            </p>
            <p className="mt-1.5 break-all font-mono text-[11.5px] text-text-primary">
              {created.claim_url}
            </p>
            <button
              type="button"
              onClick={copy}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                background: copied ? "rgb(var(--pos) / 0.16)" : "rgb(var(--accent))",
                color: copied ? "rgb(var(--pos-text))" : "rgb(var(--accent-fg))",
              }}
            >
              {copied ? <CheckCircleIcon size={11} /> : <CopyIcon size={11} />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <dl className="text-[11.5px]">
            {[
              ["Plan", created.plan_label],
              ["Access", created.duration_label],
              ["Amount", `$${created.amount_usd}`],
              ["Claimable by", created.bound_username ? `@${created.bound_username}` : "anyone with the link"],
              [
                "Link expires",
                created.expires_at ? new Date(created.expires_at).toLocaleDateString() : "—",
              ],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-4 py-1.5"
                style={{ borderTop: "1px solid rgb(var(--ink) / 0.06)" }}
              >
                <dt style={{ color: "rgb(var(--fg-muted))" }}>{k}</dt>
                <dd className="text-right font-medium text-text-primary">{v}</dd>
              </div>
            ))}
          </dl>

          {created.is_open && (
            <p
              className="rounded-md px-3 py-2 text-[11px] leading-relaxed"
              style={{ background: "rgb(var(--ink) / 0.04)", color: "rgb(var(--fg-secondary))" }}
            >
              Not tied to an account — whoever opens it first gets the subscription. Send it
              straight to the payer, and cancel it if it goes astray.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5 px-5 pb-5">
          {/* ── 1 · what was paid ───────────────────────────────── */}
          <section>
            <StepHeader num={1} title="What was paid" complete={step1Done} />
            <div className="grid grid-cols-4 gap-1.5">
              {METHODS.map((m) => (
                <Choice
                  key={m.id}
                  active={method === m.id}
                  onClick={() => setMethod(m.id)}
                  title={m.hint}
                >
                  {m.label}
                </Choice>
              ))}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {method === "other" && (
                <div className="col-span-2">
                  <Field label="Method name">
                    <TextInput
                      value={methodLabel}
                      onChange={setMethodLabel}
                      placeholder="OVO, GoPay, cash…"
                    />
                  </Field>
                </div>
              )}
              <Field label="Amount (USD)">
                <TextInput value={amount} onChange={setAmount} placeholder="45" mono autoFocus />
              </Field>
              <Field label="Reference">
                <TextInput value={reference} onChange={setReference} placeholder="UID / tx / note" />
              </Field>
            </div>
          </section>

          {/* ── 2 · what they get ───────────────────────────────── */}
          <section>
            <StepHeader num={2} title="What they get" complete={step2Done} hint={durationLabel} />
            <Field label="Plan">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1"
                style={{
                  background: "rgb(var(--surface-secondary))",
                  border: "1px solid rgb(var(--ink) / 0.1)",
                }}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — ${p.price_usdt}
                  </option>
                ))}
              </select>
            </Field>

            <div className="mt-2.5">
              <Field label="Access length" hint="Overrides the plan — for discounts and short access.">
                <div className="grid grid-cols-7 gap-1.5">
                  {PRESETS.map((d) => (
                    <Choice
                      key={d.label}
                      active={duration === d.value}
                      onClick={() => setDuration(d.value)}
                      title={d.title}
                    >
                      {d.label}
                    </Choice>
                  ))}
                </div>
                <div className="mt-1.5">
                  <TextInput
                    value={duration}
                    onChange={setDuration}
                    placeholder="or any number of days"
                    numeric
                    mono
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* ── 3 · who can claim ───────────────────────────────── */}
          <section>
            <StepHeader
              num={3}
              title="Who can claim"
              complete={step3Done}
              hint={boundUser ? `@${boundUser.username}` : "open link"}
            />

            {boundUser ? (
              <div
                className="flex items-center justify-between rounded-md px-2.5 py-2"
                style={{
                  background: "rgb(var(--surface-secondary))",
                  border: "1px solid rgb(var(--ink) / 0.1)",
                }}
              >
                <span className="text-[11.5px] text-text-primary">
                  @{boundUser.username}
                  <span className="ml-2" style={{ color: "rgb(var(--fg-muted))" }}>
                    {boundUser.email}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setBoundUser(null)}
                  className="text-[10.5px] underline"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  clear
                </button>
              </div>
            ) : (
              <Field label="Lock to account" hint="Optional. Leave empty if you don't know their account.">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40">
                    <SearchIcon size={11} />
                  </span>
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search username or email…"
                    className="w-full rounded-md py-2 pl-7 pr-2.5 text-xs text-text-primary focus:outline-none focus:ring-1"
                    style={{
                      background: "rgb(var(--surface-secondary))",
                      border: "1px solid rgb(var(--ink) / 0.1)",
                    }}
                  />
                </div>
                {userResults.length > 0 && (
                  <div
                    className="mt-1 max-h-32 overflow-y-auto rounded-md"
                    style={{ border: "1px solid rgb(var(--ink) / 0.1)" }}
                  >
                    {userResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setBoundUser(u);
                          setUserQuery("");
                          setUserResults([]);
                        }}
                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-ink/[0.05]"
                      >
                        <span className="text-text-primary">@{u.username}</span>
                        <span style={{ color: "rgb(var(--fg-muted))" }}>{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            )}

            <div className="mt-2.5 grid grid-cols-[88px_1fr] gap-2.5">
              <Field label="Valid (days)">
                <TextInput value={ttlDays} onChange={setTtlDays} numeric mono />
              </Field>
              <Field label="Note" hint="Min 10 characters — kept in the audit trail.">
                <TextInput
                  value={note}
                  onChange={setNote}
                  placeholder="Paid 45 USDT via Binance UID 123456, 30 days at a discount"
                />
              </Field>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
