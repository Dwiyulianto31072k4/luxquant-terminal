// src/components/admin/workspace/ManualPaymentModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell <Modal> (sticky header/footer, portal/Esc/scroll
// lock handled by Modal). Footer buttons → GoldButton/GhostButton.
// Emoji (💡 📅 ✏️ ✓) replaced with SVG. All steps & logic unchanged.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { financeApi } from "../../../services/financeApi";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  StarIcon,
  CopyIcon,
  SearchIcon,
} from "../Icons";
import { exchangeColor } from "./finance/helpers";
import Modal from "../../ui/Modal";
import { GoldButton, GhostButton } from "../../autotrade/AutoTradeUI";

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const NOTE_MIN_CHARS = 10;

const CheckMini = ({ className = "" }) => (
  <svg
    className={className}
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── Inline primitives ── */

const StepHeader = ({ num, title, complete, locked }) => (
  <div className="mb-2.5 flex items-center gap-2">
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
      style={{
        background: complete
          ? "rgb(var(--pos) / 0.18)"
          : locked
            ? "rgb(var(--ink) / 0.04)"
            : "rgb(var(--accent) / 0.16)",
        color: complete
          ? "rgb(var(--pos-text))"
          : locked
            ? "rgb(var(--fg-muted))"
            : "rgb(var(--accent))",
        border: `1px solid ${complete ? "rgb(var(--pos) / 0.32)" : locked ? "rgb(var(--ink) / 0.06)" : "rgb(var(--accent) / 0.3)"}`,
      }}
    >
      {complete ? <CheckMini /> : num}
    </span>
    <h4
      className="text-[10.5px] font-bold uppercase tracking-wider"
      style={{ color: locked ? "rgb(var(--fg-muted))" : "rgb(var(--fg))" }}
    >
      {title}
    </h4>
  </div>
);

const Field = ({ label, hint, error, children }) => (
  <div className="space-y-1">
    <label
      className="block text-[9.5px] font-semibold uppercase tracking-wider"
      style={{ color: "rgb(var(--ink) / 0.5)" }}
    >
      {label}
    </label>
    {children}
    {hint && !error && (
      <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {hint}
      </p>
    )}
    {error && (
      <p className="flex items-center gap-1 text-[10px]" style={{ color: "rgb(var(--neg-text))" }}>
        <AlertTriangleIcon size={10} />
        {error}
      </p>
    )}
  </div>
);

const TextInput = ({ value, onChange, placeholder, mono, disabled, autoFocus }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    autoFocus={autoFocus}
    className={`w-full rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${mono ? "font-mono tabular-nums" : ""}`}
    style={{ background: "rgb(var(--scrim) / 0.3)", border: "1px solid rgb(var(--ink) / 0.1)" }}
  />
);

const Pill = ({ tone, children, Icon, pulse }) => {
  const tones = {
    green: {
      bg: "rgb(var(--pos) / 0.10)",
      color: "rgb(var(--pos-text))",
      border: "rgb(var(--pos) / 0.3)",
    },
    amber: {
      bg: "rgb(var(--accent) / 0.10)",
      color: "rgb(var(--warn))",
      border: "rgb(var(--accent) / 0.3)",
    },
    red: {
      bg: "rgb(var(--neg) / 0.10)",
      color: "rgb(var(--neg-text))",
      border: "rgb(var(--neg) / 0.3)",
    },
    gold: {
      bg: "rgb(var(--accent) / 0.10)",
      color: "rgb(var(--accent-text))",
      border: "rgb(var(--accent) / 0.3)",
    },
  };
  const t = tones[tone] || tones.gold;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pulse ? "animate-pulse" : ""}`}
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
};

/* ── Step 1: TX hash ── */

const TxStep = ({
  txHash,
  setTxHash,
  verifying,
  verifyResult,
  verifyError,
  onVerify,
  onReset,
  paymentDateOverride,
  setPaymentDateOverride,
}) => {
  const looksValid = TX_HASH_REGEX.test(txHash.trim());
  const tx = verifyResult?.tx_data;
  const blockers = verifyResult?.blockers || [];
  const warnings = verifyResult?.warnings || [];
  const exchange = verifyResult?.exchange_name;

  return (
    <section>
      <StepHeader num={1} title="Transaction" complete={!!verifyResult && blockers.length === 0} />
      {!verifyResult ? (
        <div className="space-y-3">
          <Field
            label="TX Hash"
            hint="Paste the 66-char BSC USDT transaction hash (0x…)"
            error={txHash && !looksValid ? "Invalid hash format" : null}
          >
            <TextInput
              value={txHash}
              onChange={(v) => setTxHash(v.trim())}
              placeholder="0x abc 123…"
              mono
              autoFocus
            />
          </Field>
          <button
            onClick={onVerify}
            disabled={!looksValid || verifying}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: looksValid
                ? "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent)))"
                : "rgb(var(--ink) / 0.04)",
              color: looksValid ? "rgb(var(--surface))" : "rgb(var(--fg-muted))",
            }}
          >
            {verifying && (
              <span
                className="h-3 w-3 animate-spin rounded-full border-2"
                style={{ borderColor: "rgba(10,5,6,0.3)", borderTopColor: "rgb(var(--surface))" }}
              />
            )}
            {verifying ? "Inspecting on BSC…" : "Verify on BSC"}
          </button>
          {verifyError && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
              style={{
                background: "rgb(var(--neg) / 0.08)",
                color: "rgb(var(--neg-text))",
                border: "1px solid rgb(var(--neg) / 0.28)",
              }}
            >
              <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {blockers.length === 0 ? (
              <Pill tone="green" Icon={CheckCircleIcon}>
                Verified on chain
              </Pill>
            ) : (
              <Pill tone="red" Icon={AlertCircleIcon}>
                Cannot proceed
              </Pill>
            )}
            {exchange && (
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `${exchangeColor(exchange)}14`,
                  color: exchangeColor(exchange),
                  border: `1px solid ${exchangeColor(exchange)}33`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: exchangeColor(exchange) }}
                />
                {exchange}
              </span>
            )}
            {tx?.confirmations !== null && (
              <Pill tone={tx.confirmations >= 12 ? "green" : "amber"}>
                {tx.confirmations} confirmations
              </Pill>
            )}
          </div>
          <div
            className="space-y-1.5 rounded-lg p-3 text-[11px]"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.05)",
            }}
          >
            <Row
              label="Amount"
              value={tx?.amount ? `${tx.amount} USDT` : "—"}
              mono
              valueColor="rgb(var(--accent))"
              big
            />
            <Row label="From" value={tx?.from} mono copyable />
            <Row label="To" value={tx?.to} mono copyable />
            {tx?.timestamp && (
              <Row
                label="Time"
                value={new Date(tx.timestamp).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            )}
            {tx?.block != null && <Row label="Block" value={tx.block} mono />}
            {tx?.tx_hash && (
              <Row
                label="TX"
                value={
                  <a
                    href={`https://bscscan.com/tx/${tx.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono hover:underline"
                    style={{ color: "#8a8a93" }}
                  >
                    {tx.tx_hash.slice(0, 10)}…{tx.tx_hash.slice(-8)}
                    <ExternalLinkIcon size={9} />
                  </a>
                }
              />
            )}
          </div>
          {blockers.map((b) => (
            <div
              key={b.code}
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgb(var(--neg) / 0.08)",
                color: "rgb(var(--neg-text))",
                border: "1px solid rgb(var(--neg) / 0.28)",
              }}
            >
              <AlertCircleIcon size={13} className="mt-0.5 shrink-0" />
              <span>{b.message}</span>
            </div>
          ))}
          {warnings.map((w) => (
            <div
              key={w.code}
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgb(var(--accent) / 0.08)",
                color: "rgb(var(--warn))",
                border: "1px solid rgb(var(--accent) / 0.28)",
              }}
            >
              <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
          <button
            onClick={onReset}
            className="text-[10.5px] underline"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            Use a different TX hash
          </button>
          {tx?.timestamp && (
            <PaymentDateOverride
              txTimestamp={tx.timestamp}
              value={paymentDateOverride}
              onChange={setPaymentDateOverride}
            />
          )}
        </div>
      )}
    </section>
  );
};

const PaymentDateOverride = ({ txTimestamp, value, onChange }) => {
  const [overriding, setOverriding] = useState(!!value);
  const txDateStr = txTimestamp ? new Date(txTimestamp).toISOString().slice(0, 10) : null;
  const handleToggle = () => {
    if (overriding) {
      onChange("");
      setOverriding(false);
    } else {
      onChange(txDateStr || "");
      setOverriding(true);
    }
  };
  const effectiveDate = value || txDateStr;
  const txDate = txDateStr ? new Date(txDateStr) : null;
  const eff = effectiveDate ? new Date(effectiveDate) : null;
  const diffDays = txDate && eff ? Math.round((eff - txDate) / 86400000) : 0;

  return (
    <div
      className="mt-3 rounded-lg p-2.5"
      style={{
        background: overriding ? "rgb(var(--accent) / 0.04)" : "rgb(var(--ink) / 0.02)",
        border: `1px solid ${overriding ? "rgb(var(--accent) / 0.22)" : "rgb(var(--ink) / 0.05)"}`,
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider"
            style={{ color: "rgb(var(--accent-text))" }}
          >
            <CalendarMini /> Payment Date
          </span>
          {!overriding && (
            <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
              (uses TX date — subscription starts from here)
            </span>
          )}
        </div>
        <button
          onClick={handleToggle}
          className="text-[9.5px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: overriding ? "rgb(var(--neg-text))" : "rgb(var(--accent))" }}
        >
          {overriding ? "Reset to TX date" : "Override"}
        </button>
      </div>
      {!overriding ? (
        <p className="font-mono text-xs tabular-nums" style={{ color: "rgb(var(--fg))" }}>
          {txDateStr || "—"}
        </p>
      ) : (
        <>
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md px-2.5 py-1.5 font-mono text-xs text-text-primary focus:outline-none"
            style={{
              background: "rgb(var(--scrim) / 0.3)",
              border: "1px solid rgb(var(--line) / 0.25)",
              colorScheme: "dark",
            }}
          />
          {diffDays !== 0 && txDateStr && (
            <p
              className="mt-1.5 flex items-center gap-1 text-[10px]"
              style={{ color: "rgb(var(--warn))" }}
            >
              <AlertTriangleIcon size={10} />
              {diffDays > 0
                ? `${diffDays} day(s) AFTER TX date — subscription will start later than the on-chain payment`
                : `${Math.abs(diffDays)} day(s) BEFORE TX date — unusual, double-check`}
            </p>
          )}
        </>
      )}
    </div>
  );
};

const CalendarMini = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const Row = ({ label, value, mono, valueColor, big, copyable }) => (
  <div className="flex items-center justify-between gap-3">
    <span
      className="text-[9.5px] font-semibold uppercase tracking-wider"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      {label}
    </span>
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`truncate ${mono ? "font-mono tabular-nums" : ""} ${big ? "text-sm font-semibold" : ""}`}
        style={{ color: valueColor || "rgb(var(--fg))" }}
      >
        {value || "—"}
      </span>
      {copyable && value && (
        <button
          onClick={() => navigator.clipboard?.writeText(String(value)).catch(() => {})}
          className="rounded p-1 hover:bg-ink/5"
          style={{ color: "rgb(var(--fg-muted))" }}
          title="Copy"
        >
          <CopyIcon size={10} />
        </button>
      )}
    </div>
  </div>
);

/* ── Step 2: User picker ── */

const UserStep = ({
  locked,
  mode,
  setMode,
  selectedUser,
  setSelectedUser,
  newUser,
  setNewUser,
  suggestedUserId,
  onSuggestUserResolved,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState(null);

  useEffect(() => {
    if (suggestedUserId && !suggested) {
      financeApi
        .searchUsers(`#${suggestedUserId}`)
        .then((d) => {
          const u = (d.users || []).find((u) => u.id === suggestedUserId);
          if (u) {
            setSuggested(u);
            if (onSuggestUserResolved) onSuggestUserResolved(u);
          }
        })
        .catch(() => {});
    }
  }, [suggestedUserId, suggested, onSuggestUserResolved]);

  useEffect(() => {
    if (mode !== "existing" || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await financeApi.searchUsers(query.trim());
        setResults(d.users || []);
      } catch (e) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  return (
    <section>
      <StepHeader
        num={2}
        title="Link to User"
        complete={
          (mode === "existing" && !!selectedUser) ||
          (mode === "new" && newUser.username?.trim().length >= 3)
        }
        locked={locked}
      />
      {!locked && (
        <>
          <div className="mb-3 flex gap-2">
            {[
              { id: "existing", label: "Existing user" },
              { id: "new", label: "Create new" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className="flex-1 rounded-md py-2 text-[11px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background:
                    mode === opt.id ? "rgb(var(--accent) / 0.12)" : "rgb(var(--ink) / 0.02)",
                  color: mode === opt.id ? "rgb(var(--accent))" : "rgb(var(--fg-muted))",
                  border: `1px solid ${mode === opt.id ? "rgb(var(--accent) / 0.32)" : "rgb(var(--ink) / 0.06)"}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === "existing" && suggested && !selectedUser && (
            <button
              onClick={() => setSelectedUser(suggested)}
              className="mb-3 w-full rounded-lg px-3 py-2.5 text-left transition-all hover:scale-[1.01]"
              style={{
                background: "rgb(var(--accent) / 0.06)",
                border: "1px solid rgb(var(--line) / 0.22)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{
                    background: "rgb(var(--accent) / 0.14)",
                    color: "rgb(var(--accent-text))",
                    boxShadow: "inset 0 0 0 1px rgb(var(--accent) / 0.3)",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .8 1.6v.7h6.4v-.7c0-.6.3-1.2.8-1.6A7 7 0 0 0 12 2z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-text-primary">
                    Link to @{suggested.username}?
                  </p>
                  <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    This wallet previously paid for them.
                  </p>
                </div>
              </div>
            </button>
          )}
          {mode === "existing" && (
            <div className="space-y-2">
              {!selectedUser ? (
                <>
                  <div className="relative">
                    <SearchIcon
                      size={13}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: "rgb(var(--fg-muted))" }}
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search username, email, or telegram…"
                      className="w-full rounded-md py-2 pl-9 pr-3 text-xs text-text-primary focus:outline-none"
                      style={{
                        background: "rgb(var(--scrim) / 0.3)",
                        border: "1px solid rgb(var(--ink) / 0.1)",
                      }}
                    />
                  </div>
                  {searching && (
                    <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                      Searching…
                    </p>
                  )}
                  {!searching && results.length > 0 && (
                    <div
                      className="max-h-56 overflow-y-auto rounded-lg"
                      style={{
                        background: "rgb(var(--scrim) / 0.2)",
                        border: "1px solid rgb(var(--ink) / 0.05)",
                      }}
                    >
                      {results.map((u, i) => (
                        <button
                          key={u.id}
                          onClick={() => setSelectedUser(u)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ink/5"
                          style={i > 0 ? { borderTop: "1px solid rgb(var(--ink) / 0.04)" } : {}}
                        >
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: "rgb(var(--accent) / 0.12)",
                              color: "rgb(var(--accent-text))",
                            }}
                          >
                            {u.username[0].toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-semibold text-text-primary">
                              @{u.username}
                              <span
                                className="ml-1 text-[9px] font-normal"
                                style={{ color: "rgb(var(--fg-muted))" }}
                              >
                                #{u.id}
                              </span>
                            </p>
                            <p
                              className="truncate text-[10px]"
                              style={{ color: "rgb(var(--fg-muted))" }}
                            >
                              {u.email}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                            style={{
                              background:
                                u.role === "subscriber"
                                  ? "rgb(var(--pos) / 0.12)"
                                  : "rgba(107,92,82,0.12)",
                              color:
                                u.role === "subscriber"
                                  ? "rgb(var(--pos-text))"
                                  : "rgb(var(--fg-muted))",
                            }}
                          >
                            {u.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <SelectedUserCard user={selectedUser} onClear={() => setSelectedUser(null)} />
              )}
            </div>
          )}
          {mode === "new" && (
            <div className="space-y-2.5">
              <Field label="Username *" hint="Letters, numbers, underscore (min 3 chars)">
                <TextInput
                  value={newUser.username}
                  onChange={(v) => setNewUser({ ...newUser, username: v })}
                  placeholder="lianprotrader"
                />
              </Field>
              <Field
                label="Email"
                hint="Optional — leave blank to auto-generate (manual_<username>@manual.luxquant.tw)"
              >
                <TextInput
                  value={newUser.email}
                  onChange={(v) => setNewUser({ ...newUser, email: v })}
                  placeholder="user@example.com"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Telegram" hint="Without @">
                  <TextInput
                    value={newUser.telegram_username}
                    onChange={(v) => setNewUser({ ...newUser, telegram_username: v })}
                    placeholder="lianpro"
                  />
                </Field>
                <Field label="Discord" hint="Username or ID">
                  <TextInput
                    value={newUser.discord_handle}
                    onChange={(v) => setNewUser({ ...newUser, discord_handle: v })}
                    placeholder="lianpro#1234"
                  />
                </Field>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const SelectedUserCard = ({ user, onClear }) => (
  <div
    className="flex items-center gap-3 rounded-lg p-3"
    style={{ background: "rgb(var(--pos) / 0.06)", border: "1px solid rgb(var(--pos) / 0.22)" }}
  >
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
      style={{ background: "rgb(var(--accent) / 0.15)", color: "rgb(var(--accent-text))" }}
    >
      {user.username[0].toUpperCase()}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[12px] font-semibold text-text-primary">@{user.username}</p>
        <CheckCircleIcon size={11} style={{ color: "rgb(var(--pos-text))" }} />
      </div>
      <p className="truncate text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {user.email} · #{user.id} · {user.role}
      </p>
    </div>
    <button
      onClick={onClear}
      className="shrink-0 text-[10px] underline"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      Change
    </button>
  </div>
);

/* ── Step 3: Plan ── */

const PlanStep = ({
  locked,
  plans,
  selectedPlanId,
  setSelectedPlanId,
  suggestedPlanId,
  txAmount,
}) => (
  <section>
    <StepHeader num={3} title="Subscription Plan" complete={!!selectedPlanId} locked={locked} />
    {!locked && (
      <div className="space-y-2">
        {plans.length === 0 ? (
          <p className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
            Loading plans…
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {plans.map((p) => {
              const isSelected = selectedPlanId === p.id;
              const isSuggested = suggestedPlanId === p.id;
              const amountMatch =
                txAmount && Math.abs(Number(p.price_usdt) - Number(txAmount)) < 0.5;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className="rounded-lg p-2.5 text-left transition-all"
                  style={{
                    background: isSelected ? "rgb(var(--accent) / 0.10)" : "rgb(var(--ink) / 0.02)",
                    border: `1px solid ${isSelected ? "rgb(var(--accent) / 0.40)" : "rgb(var(--ink) / 0.05)"}`,
                  }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p
                      className="text-[12px] font-semibold tracking-tight"
                      style={{ color: isSelected ? "rgb(var(--accent))" : "rgb(var(--fg))" }}
                    >
                      {p.label}
                    </p>
                    {isSuggested && !isSelected && <Pill tone="green">Match</Pill>}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span
                      className="text-base font-light tabular-nums"
                      style={{ color: isSelected ? "rgb(var(--accent))" : "rgb(var(--fg))" }}
                    >
                      ${Number(p.price_usdt).toFixed(2)}
                    </span>
                    <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                      {p.is_lifetime ? "lifetime" : `${p.duration_days} days`}
                    </span>
                  </div>
                  {amountMatch && txAmount && (
                    <p
                      className="mt-1 flex items-center gap-1 text-[9.5px]"
                      style={{ color: "rgb(var(--pos-text))" }}
                    >
                      <CheckCircleIcon size={9} />
                      Matches TX amount
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    )}
  </section>
);

/* ── Step 4: Note ── */

const NoteStep = ({ locked, note, setNote }) => {
  const complete = note.trim().length >= NOTE_MIN_CHARS;
  return (
    <section>
      <StepHeader num={4} title="Admin Note (required)" complete={complete} locked={locked} />
      {!locked && (
        <Field
          label="Reason / context"
          hint={`Min ${NOTE_MIN_CHARS} chars. Why is this being recorded manually?`}
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="User contacted on Telegram, paid directly to wallet before invoice was generated…"
            className="w-full resize-none rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none"
            style={{
              background: "rgb(var(--scrim) / 0.3)",
              border: "1px solid rgb(var(--ink) / 0.1)",
            }}
          />
          <p
            className="mt-1 text-right text-[9.5px] tabular-nums"
            style={{ color: complete ? "rgb(var(--pos-text))" : "rgb(var(--ink) / 0.4)" }}
          >
            {note.length} / {NOTE_MIN_CHARS}+
          </p>
        </Field>
      )}
    </section>
  );
};

/* ── Payment method ── */

const PAYMENT_METHODS = [
  { id: "onchain_bsc", label: "On-chain" },
  { id: "binance_uid", label: "Binance UID" },
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "other", label: "Other" },
];

const MethodSelector = ({ method, setMethod }) => (
  <div>
    <StepHeader num={1} title="Payment method" complete={false} locked={false} />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PAYMENT_METHODS.map((m) => {
        const active = method === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className="rounded-lg py-2 text-[11px] font-semibold uppercase tracking-wider transition-all"
            style={{
              background: active ? "rgb(var(--accent) / 0.16)" : "rgb(var(--ink) / 0.02)",
              color: active ? "rgb(var(--accent))" : "rgb(var(--fg-muted))",
              border: `1px solid ${active ? "rgb(var(--accent) / 0.4)" : "rgb(var(--ink) / 0.08)"}`,
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  </div>
);

const OffchainStep = ({
  method,
  offAmount,
  setOffAmount,
  idrAmount,
  setIdrAmount,
  idrRate,
  idrUsd,
  reference,
  setReference,
  methodLabel,
  setMethodLabel,
  paymentDateOverride,
  setPaymentDateOverride,
}) => (
  <div>
    <StepHeader num={2} title="Payment details" complete={false} locked={false} />
    <div className="space-y-3">
      {method === "other" && (
        <Field label="Method name" hint="e.g. OVO, GoPay, Cash, PayPal">
          <TextInput
            value={methodLabel}
            onChange={setMethodLabel}
            placeholder="Method name"
            autoFocus
          />
        </Field>
      )}
      {method === "bank_transfer" ? (
        <Field
          label="Amount (IDR)"
          hint={
            idrRate
              ? idrUsd
                ? `\u2248 $${idrUsd.toFixed(2)} USD \u00b7 live rate ${Math.round(idrRate).toLocaleString()} IDR/USDT`
                : `Live rate ${Math.round(idrRate).toLocaleString()} IDR/USDT`
              : "Loading live rate\u2026"
          }
        >
          <TextInput
            value={idrAmount}
            onChange={(v) => setIdrAmount(v.replace(/[^0-9.]/g, ""))}
            placeholder="800000"
            mono
            autoFocus
          />
        </Field>
      ) : (
        <Field label={method === "binance_uid" ? "Amount (USDT)" : "Amount (USD)"}>
          <TextInput
            value={offAmount}
            onChange={(v) => setOffAmount(v.replace(/[^0-9.]/g, ""))}
            placeholder="50"
            mono
            autoFocus={method !== "other"}
          />
        </Field>
      )}
      <Field
        label={method === "binance_uid" ? "Binance UID / reference" : "Reference"}
        hint={
          method === "binance_uid"
            ? "Sender Binance UID (+ order id if any)"
            : method === "bank_transfer"
              ? "Sender name / date / bank ref"
              : "Any reference for the audit trail"
        }
      >
        <TextInput value={reference} onChange={setReference} placeholder="Reference" />
      </Field>
      <Field label="Payment date (optional)" hint="Leave blank = today">
        <input
          type="date"
          value={paymentDateOverride || ""}
          onChange={(e) => setPaymentDateOverride(e.target.value)}
          className="w-full rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1"
          style={{
            background: "rgb(var(--scrim) / 0.3)",
            border: "1px solid rgb(var(--ink) / 0.1)",
          }}
        />
      </Field>
    </div>
  </div>
);

/* ════════════════════════════════════════ Main ════════════════════════════════════════ */

export const ManualPaymentModal = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedUserId = null,
  preselectedUser = null,
}) => {
  const [txHash, setTxHash] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [paymentDateOverride, setPaymentDateOverride] = useState("");
  const [userMode, setUserMode] = useState("existing");
  const [selectedUser, setSelectedUser] = useState(preselectedUser);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    telegram_username: "",
    discord_handle: "",
  });
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("onchain_bsc");
  const [offAmount, setOffAmount] = useState("");
  const [idrAmount, setIdrAmount] = useState("");
  const [reference, setReference] = useState("");
  const [methodLabel, setMethodLabel] = useState("");
  const [idrRate, setIdrRate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [acceptAmountMismatch, setAcceptAmountMismatch] = useState(false);
  const [acceptWalletNotInPool, setAcceptWalletNotInPool] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTxHash("");
      setVerifyResult(null);
      setVerifyError(null);
      setVerifying(false);
      setPaymentDateOverride("");
      setUserMode("existing");
      setSelectedUser(preselectedUser);
      setNewUser({ username: "", email: "", telegram_username: "", discord_handle: "" });
      setSelectedPlanId(null);
      setNote("");
      setSubmitError(null);
      setSubmitting(false);
      setAcceptAmountMismatch(false);
      setAcceptWalletNotInPool(false);
      setMethod("onchain_bsc");
      setOffAmount("");
      setIdrAmount("");
      setReference("");
      setMethodLabel("");
    }
  }, [isOpen, preselectedUser]);

  useEffect(() => {
    if (isOpen && plans.length === 0) {
      financeApi
        .getPlans()
        .then((d) => setPlans(d.plans || []))
        .catch((e) => console.error("Failed to load plans:", e));
    }
  }, [isOpen, plans.length]);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/v1/fx/rates")
      .then((r) => r.json())
      .then((d) => setIdrRate(d?.rates?.IDR ?? null))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (verifyResult?.suggested_plan_id && !selectedPlanId)
      setSelectedPlanId(verifyResult.suggested_plan_id);
  }, [verifyResult, selectedPlanId]);

  const blockers = verifyResult?.blockers || [];
  const warnings = verifyResult?.warnings || [];
  const isOnchain = method === "onchain_bsc";
  const idrUsd =
    method === "bank_transfer" && idrAmount && idrRate ? Number(idrAmount) / idrRate : null;
  const offchainUsd = method === "bank_transfer" ? idrUsd : offAmount ? Number(offAmount) : null;
  const offchainStep1Done =
    !isOnchain &&
    !!offchainUsd &&
    offchainUsd > 0 &&
    (method !== "other" || methodLabel.trim().length > 0) &&
    (method !== "bank_transfer" || !!idrRate);
  const step1Done = isOnchain ? !!verifyResult && blockers.length === 0 : offchainStep1Done;
  const step2Done =
    step1Done &&
    ((userMode === "existing" && !!selectedUser) ||
      (userMode === "new" && newUser.username?.trim().length >= 3));
  const step3Done = step2Done && !!selectedPlanId;
  const step4Done = step3Done && note.trim().length >= NOTE_MIN_CHARS;
  const txAmount = isOnchain ? verifyResult?.tx_data?.amount : offchainUsd;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const planPrice = selectedPlan ? Number(selectedPlan.price_usdt) : null;
  const hasAmountMismatch =
    planPrice !== null && txAmount && Math.abs(Number(txAmount) - planPrice) > 0.5;
  const hasWalletNotInPoolWarning = warnings.some((w) => w.code === "wallet_not_in_pool");
  const canSubmit =
    step4Done &&
    (!isOnchain || !hasAmountMismatch || acceptAmountMismatch) &&
    (!isOnchain || !hasWalletNotInPoolWarning || acceptWalletNotInPool) &&
    !submitting;

  const handleVerify = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      setVerifyResult(await financeApi.verifyTx(txHash.trim()));
    } catch (e) {
      setVerifyError(e.response?.data?.detail || "Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  }, [txHash, verifying]);

  const handleResetTx = () => {
    setVerifyResult(null);
    setVerifyError(null);
    setSelectedPlanId(null);
    setPaymentDateOverride("");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = { method, plan_id: selectedPlanId, admin_note: note.trim() };
      if (isOnchain) {
        payload.tx_hash = txHash.trim().toLowerCase();
        payload.accept_amount_mismatch = acceptAmountMismatch;
        payload.accept_wallet_not_in_pool = acceptWalletNotInPool;
        const txDateStr = verifyResult?.tx_data?.timestamp
          ? new Date(verifyResult.tx_data.timestamp).toISOString().slice(0, 10)
          : null;
        if (paymentDateOverride && paymentDateOverride !== txDateStr)
          payload.payment_date_override = paymentDateOverride;
      } else {
        payload.amount_usd = Number(offchainUsd);
        payload.reference = reference.trim() || undefined;
        if (method === "bank_transfer") {
          payload.paid_currency = "IDR";
          payload.paid_amount = Number(idrAmount);
          payload.fx_rate = idrRate;
        } else if (method === "binance_uid") {
          payload.paid_currency = "USDT";
          payload.paid_amount = Number(offAmount);
        } else if (method === "other") {
          payload.method_label = methodLabel.trim() || undefined;
          payload.paid_currency = "USD";
          payload.paid_amount = Number(offAmount);
        }
        if (paymentDateOverride) payload.payment_date_override = paymentDateOverride;
      }
      if (userMode === "existing") payload.user_id = selectedUser.id;
      else
        payload.new_user = {
          username: newUser.username.trim(),
          email: newUser.email.trim() || undefined,
          telegram_username: newUser.telegram_username.trim() || undefined,
          discord_handle: newUser.discord_handle.trim() || undefined,
        };
      const result = await financeApi.createManualPayment(payload);
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (e) {
      setSubmitError(e.response?.data?.detail || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "rgb(var(--accent) / 0.1)",
          border: "1px solid rgb(var(--line) / 0.22)",
        }}
      >
        <StarIcon size={14} style={{ color: "rgb(var(--accent-text))" }} />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-bold leading-tight tracking-tight text-text-primary">
          Record Manual Payment
        </h2>
        <p className="text-[10px] leading-tight" style={{ color: "rgb(var(--fg-muted))" }}>
          For users who paid out-of-band (Telegram support, etc.)
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={onClose} disabled={submitting} className="flex-1">
        Cancel
      </GhostButton>
      <GoldButton
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex-1 flex items-center justify-center gap-2"
      >
        {submitting && (
          <span
            className="h-3 w-3 animate-spin rounded-full border-2"
            style={{ borderColor: "rgba(10,5,6,0.3)", borderTopColor: "rgb(var(--surface))" }}
          />
        )}
        {submitting ? "Recording…" : "Record Payment"}
      </GoldButton>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      padded={false}
      header={header}
      footer={footer}
    >
      <div className="space-y-6 px-5 py-5">
        <MethodSelector method={method} setMethod={setMethod} />

        {isOnchain ? (
          <TxStep
            txHash={txHash}
            setTxHash={setTxHash}
            verifying={verifying}
            verifyResult={verifyResult}
            verifyError={verifyError}
            onVerify={handleVerify}
            onReset={handleResetTx}
            paymentDateOverride={paymentDateOverride}
            setPaymentDateOverride={setPaymentDateOverride}
          />
        ) : (
          <OffchainStep
            method={method}
            offAmount={offAmount}
            setOffAmount={setOffAmount}
            idrAmount={idrAmount}
            setIdrAmount={setIdrAmount}
            idrRate={idrRate}
            idrUsd={idrUsd}
            reference={reference}
            setReference={setReference}
            methodLabel={methodLabel}
            setMethodLabel={setMethodLabel}
            paymentDateOverride={paymentDateOverride}
            setPaymentDateOverride={setPaymentDateOverride}
          />
        )}

        <div style={{ opacity: step1Done ? 1 : 0.4, pointerEvents: step1Done ? "auto" : "none" }}>
          <UserStep
            locked={!step1Done && !preselectedUser}
            mode={userMode}
            setMode={setUserMode}
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
            newUser={newUser}
            setNewUser={setNewUser}
            suggestedUserId={verifyResult?.suggested_user_id}
          />
        </div>

        <div style={{ opacity: step2Done ? 1 : 0.4, pointerEvents: step2Done ? "auto" : "none" }}>
          <PlanStep
            locked={!step2Done}
            plans={plans}
            selectedPlanId={selectedPlanId}
            setSelectedPlanId={setSelectedPlanId}
            suggestedPlanId={verifyResult?.suggested_plan_id}
            txAmount={txAmount}
          />
        </div>

        {isOnchain && step3Done && hasAmountMismatch && (
          <div
            className="space-y-2 rounded-lg p-3"
            style={{
              background: "rgb(var(--accent) / 0.06)",
              border: "1px solid rgb(var(--accent) / 0.25)",
            }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangleIcon
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: "rgb(var(--accent-text))" }}
              />
              <div className="text-[11px]" style={{ color: "rgb(var(--accent-text))" }}>
                <strong>Amount mismatch:</strong> TX is{" "}
                <span className="tabular-nums">{txAmount} USDT</span>, but {selectedPlan?.label} is{" "}
                <span className="tabular-nums">${planPrice.toFixed(2)}</span> (diff{" "}
                {(Number(txAmount) - planPrice).toFixed(2)}).
              </div>
            </div>
            <label
              className="flex cursor-pointer items-center gap-2 text-[11px]"
              style={{ color: "rgb(var(--accent-text))" }}
            >
              <input
                type="checkbox"
                checked={acceptAmountMismatch}
                onChange={(e) => setAcceptAmountMismatch(e.target.checked)}
                className="cursor-pointer"
              />
              Accept anyway and log the discrepancy.
            </label>
          </div>
        )}

        {isOnchain && step3Done && hasWalletNotInPoolWarning && (
          <div
            className="space-y-2 rounded-lg p-3"
            style={{
              background: "rgb(var(--neg) / 0.06)",
              border: "1px solid rgb(var(--neg) / 0.28)",
            }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangleIcon
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: "rgb(var(--neg-text))" }}
              />
              <div className="text-[11px]" style={{ color: "rgb(var(--neg-text))" }}>
                <strong>Out-of-pool wallet:</strong> recipient address is not registered in the
                receiving wallet pool. This is unusual.
              </div>
            </div>
            <label
              className="flex cursor-pointer items-center gap-2 text-[11px]"
              style={{ color: "rgb(var(--neg-text))" }}
            >
              <input
                type="checkbox"
                checked={acceptWalletNotInPool}
                onChange={(e) => setAcceptWalletNotInPool(e.target.checked)}
                className="cursor-pointer"
              />
              I verified this — accept anyway.
            </label>
          </div>
        )}

        <div style={{ opacity: step3Done ? 1 : 0.4, pointerEvents: step3Done ? "auto" : "none" }}>
          <NoteStep locked={!step3Done} note={note} setNote={setNote} />
        </div>

        {submitError && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-xs"
            style={{
              background: "rgb(var(--neg) / 0.08)",
              color: "rgb(var(--neg-text))",
              border: "1px solid rgb(var(--neg) / 0.28)",
            }}
          >
            <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
            {submitError}
          </div>
        )}
      </div>
    </Modal>
  );
};
