// src/components/admin/workspace/ManualPaymentModal.jsx
//
// Centered modal for admin to record a manually-paid TX.
// 4 sequential steps (all visible, but disabled until prior step complete):
//   1. Paste TX hash → backend verifies on BSCScan
//   2. Pick user (existing search OR create new)
//   3. Pick plan (auto-suggested by amount match)
//   4. Required admin note (audit trail)
//
// API: { isOpen, onClose, onSuccess, preselectedUserId? }
//   preselectedUserId: if set, skip step 2 picker and lock to that user
//   (used when triggered from UserDetailDrawer)

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { financeApi } from '../../../services/financeApi';
import {
  CloseIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  UserIcon,
  StarIcon,
  CopyIcon,
  SearchIcon,
} from '../Icons';
import { exchangeColor } from './finance/helpers';

/* ════════════════════════════════════════
   Constants
   ════════════════════════════════════════ */

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const NOTE_MIN_CHARS = 10;

/* ════════════════════════════════════════
   Inline primitives (modal-local)
   ════════════════════════════════════════ */

const StepHeader = ({ num, title, complete, locked }) => (
  <div className="flex items-center gap-2 mb-2.5">
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold tabular-nums"
      style={{
        background: complete
          ? 'rgba(52,211,153,0.18)'
          : locked
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(212,168,83,0.16)',
        color: complete ? '#34d399' : locked ? '#4a3f39' : '#d4a853',
        border: `1px solid ${
          complete
            ? 'rgba(52,211,153,0.32)'
            : locked
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(212,168,83,0.3)'
        }`,
      }}
    >
      {complete ? '✓' : num}
    </span>
    <h4
      className="text-[10.5px] uppercase tracking-wider font-bold"
      style={{ color: locked ? '#4a3f39' : '#fff' }}
    >
      {title}
    </h4>
  </div>
);

const Field = ({ label, hint, error, children }) => (
  <div className="space-y-1">
    <label
      className="block text-[9.5px] uppercase tracking-wider font-semibold"
      style={{ color: 'rgba(255,255,255,0.5)' }}
    >
      {label}
    </label>
    {children}
    {hint && !error && (
      <p className="text-[10px]" style={{ color: '#6b5c52' }}>
        {hint}
      </p>
    )}
    {error && (
      <p
        className="text-[10px] flex items-center gap-1"
        style={{ color: '#f87171' }}
      >
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
    className={`w-full px-2.5 py-2 rounded-md text-xs text-white focus:outline-none focus:ring-1 disabled:opacity-50 disabled:cursor-not-allowed ${
      mono ? 'font-mono tabular-nums' : ''
    }`}
    style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}
  />
);

const Pill = ({ tone, children, Icon, pulse }) => {
  const tones = {
    green: { bg: 'rgba(52,211,153,0.10)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
    amber: { bg: 'rgba(251,191,36,0.10)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
    red:   { bg: 'rgba(248,113,113,0.10)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
    gold:  { bg: 'rgba(212,168,83,0.10)', color: '#d4a853', border: 'rgba(212,168,83,0.3)' },
  };
  const t = tones[tone] || tones.gold;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
        pulse ? 'animate-pulse' : ''
      }`}
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
};

/* ════════════════════════════════════════
   Step 1 — TX hash + verify preview
   ════════════════════════════════════════ */

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
            error={txHash && !looksValid ? 'Invalid hash format' : null}
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
            className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
            style={{
              background: looksValid
                ? 'linear-gradient(135deg, #d4a853, #8b6914)'
                : 'rgba(255,255,255,0.04)',
              color: looksValid ? '#0a0506' : '#6b5c52',
            }}
          >
            {verifying && (
              <span
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'rgba(10,5,6,0.3)',
                  borderTopColor: '#0a0506',
                }}
              />
            )}
            {verifying ? 'Inspecting on BSC…' : 'Verify on BSC'}
          </button>

          {verifyError && (
            <div
              className="text-xs px-3 py-2.5 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.28)',
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              <span>{verifyError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {blockers.length === 0 ? (
              <Pill tone="green" Icon={CheckCircleIcon}>Verified on chain</Pill>
            ) : (
              <Pill tone="red" Icon={AlertCircleIcon}>Cannot proceed</Pill>
            )}
            {exchange && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: `${exchangeColor(exchange)}14`,
                  color: exchangeColor(exchange),
                  border: `1px solid ${exchangeColor(exchange)}33`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: exchangeColor(exchange) }}
                />
                {exchange}
              </span>
            )}
            {tx?.confirmations !== null && (
              <Pill tone={tx.confirmations >= 12 ? 'green' : 'amber'}>
                {tx.confirmations} confirmations
              </Pill>
            )}
          </div>

          {/* TX data card */}
          <div
            className="rounded-lg p-3 space-y-1.5 text-[11px]"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <Row label="Amount" value={tx?.amount ? `${tx.amount} USDT` : '—'} mono valueColor="#d4a853" big />
            <Row label="From" value={tx?.from} mono copyable />
            <Row label="To" value={tx?.to} mono copyable />
            {tx?.timestamp && (
              <Row
                label="Time"
                value={new Date(tx.timestamp).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
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
                    className="inline-flex items-center gap-1 hover:underline font-mono"
                    style={{ color: '#60a5fa' }}
                  >
                    {tx.tx_hash.slice(0, 10)}…{tx.tx_hash.slice(-8)}
                    <ExternalLinkIcon size={9} />
                  </a>
                }
              />
            )}
          </div>

          {/* Blockers (hard stop) */}
          {blockers.map((b) => (
            <div
              key={b.code}
              className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.28)',
              }}
            >
              <AlertCircleIcon size={13} className="shrink-0 mt-0.5" />
              <span>{b.message}</span>
            </div>
          ))}

          {/* Warnings (soft, no override here — handled at submit) */}
          {warnings.map((w) => (
            <div
              key={w.code}
              className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(251,191,36,0.08)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.28)',
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}

          <button
            onClick={onReset}
            className="text-[10.5px] underline"
            style={{ color: '#6b5c52' }}
          >
            Use a different TX hash
          </button>

          {/* Payment date override (date-only) */}
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

/* ── Payment Date Override sub-component ── */

const PaymentDateOverride = ({ txTimestamp, value, onChange }) => {
  const [overriding, setOverriding] = useState(!!value);

  // Default display = TX date in YYYY-MM-DD
  const txDateStr = txTimestamp
    ? new Date(txTimestamp).toISOString().slice(0, 10)
    : null;

  const handleToggle = () => {
    if (overriding) {
      // Cancelling override → clear
      onChange('');
      setOverriding(false);
    } else {
      // Start override → prefill with TX date
      onChange(txDateStr || '');
      setOverriding(true);
    }
  };

  // Compute how the effective date differs from TX date
  const effectiveDate = value || txDateStr;
  const txDate = txDateStr ? new Date(txDateStr) : null;
  const eff = effectiveDate ? new Date(effectiveDate) : null;
  const diffDays =
    txDate && eff
      ? Math.round((eff - txDate) / (1000 * 60 * 60 * 24))
      : 0;

  return (
    <div
      className="rounded-lg p-2.5 mt-3"
      style={{
        background: overriding
          ? 'rgba(212,168,83,0.04)'
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${
          overriding
            ? 'rgba(212,168,83,0.22)'
            : 'rgba(255,255,255,0.05)'
        }`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9.5px] uppercase tracking-wider font-semibold"
            style={{ color: '#d4a853' }}
          >
            📅 Payment Date
          </span>
          {!overriding && (
            <span className="text-[10px]" style={{ color: '#8a7a6e' }}>
              (uses TX date — subscription starts from here)
            </span>
          )}
        </div>
        <button
          onClick={handleToggle}
          className="text-[9.5px] uppercase tracking-wider font-semibold transition-colors"
          style={{ color: overriding ? '#f87171' : '#d4a853' }}
        >
          {overriding ? '✕ Reset to TX date' : '✏️ Override'}
        </button>
      </div>

      {!overriding ? (
        <p
          className="text-xs tabular-nums font-mono"
          style={{ color: '#fff' }}
        >
          {txDateStr || '—'}
        </p>
      ) : (
        <>
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(212,168,83,0.25)',
              colorScheme: 'dark',
            }}
          />
          {diffDays !== 0 && txDateStr && (
            <p
              className="text-[10px] mt-1.5 flex items-center gap-1"
              style={{ color: '#fbbf24' }}
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

const Row = ({ label, value, mono, valueColor, big, copyable }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: '#6b5c52' }}>
      {label}
    </span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`truncate ${mono ? 'font-mono tabular-nums' : ''} ${big ? 'text-sm font-semibold' : ''}`}
        style={{ color: valueColor || '#fff' }}
      >
        {value || '—'}
      </span>
      {copyable && value && (
        <button
          onClick={() => navigator.clipboard?.writeText(String(value)).catch(() => {})}
          className="p-1 rounded hover:bg-white/5"
          style={{ color: '#8a7a6e' }}
          title="Copy"
        >
          <CopyIcon size={10} />
        </button>
      )}
    </div>
  </div>
);

/* ════════════════════════════════════════
   Step 2 — User picker (existing / create)
   ════════════════════════════════════════ */

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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState(null);

  // Auto-fetch suggested user if backend returned an ID
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

  // Debounced search
  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) {
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

  const complete =
    (mode === 'existing' && !!selectedUser) ||
    (mode === 'new' && newUser.username?.trim().length >= 3);

  return (
    <section>
      <StepHeader num={2} title="Link to User" complete={complete} locked={locked} />

      {!locked && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            {[
              { id: 'existing', label: 'Existing user' },
              { id: 'new', label: 'Create new' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className="flex-1 py-2 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background:
                    mode === opt.id
                      ? 'rgba(212,168,83,0.12)'
                      : 'rgba(255,255,255,0.02)',
                  color: mode === opt.id ? '#d4a853' : '#8a7a6e',
                  border: `1px solid ${
                    mode === opt.id
                      ? 'rgba(212,168,83,0.32)'
                      : 'rgba(255,255,255,0.06)'
                  }`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Suggested user hint */}
          {mode === 'existing' && suggested && !selectedUser && (
            <button
              onClick={() => setSelectedUser(suggested)}
              className="w-full mb-3 px-3 py-2.5 rounded-lg text-left transition-all hover:scale-[1.01]"
              style={{
                background: 'rgba(212,168,83,0.06)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '14px' }}>💡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">
                    Link to @{suggested.username}?
                  </p>
                  <p className="text-[10px]" style={{ color: '#8a7a6e' }}>
                    This wallet previously paid for them.
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* Existing user search */}
          {mode === 'existing' && (
            <div className="space-y-2">
              {!selectedUser ? (
                <>
                  <div className="relative">
                    <SearchIcon
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: '#6b5c52' }}
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search username, email, or telegram…"
                      className="w-full pl-9 pr-3 py-2 rounded-md text-xs text-white focus:outline-none"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    />
                  </div>
                  {searching && (
                    <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                      Searching…
                    </p>
                  )}
                  {!searching && results.length > 0 && (
                    <div
                      className="rounded-lg overflow-hidden max-h-56 overflow-y-auto"
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {results.map((u, i) => (
                        <button
                          key={u.id}
                          onClick={() => setSelectedUser(u)}
                          className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-2.5"
                          style={
                            i > 0
                              ? { borderTop: '1px solid rgba(255,255,255,0.04)' }
                              : {}
                          }
                        >
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              background: 'rgba(212,168,83,0.12)',
                              color: '#d4a853',
                            }}
                          >
                            {u.username[0].toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11.5px] font-semibold text-white truncate">
                              @{u.username}
                              <span className="text-[9px] ml-1 font-normal" style={{ color: '#6b5c52' }}>
                                #{u.id}
                              </span>
                            </p>
                            <p className="text-[10px] truncate" style={{ color: '#8a7a6e' }}>
                              {u.email}
                            </p>
                          </div>
                          <span
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background:
                                u.role === 'subscriber'
                                  ? 'rgba(52,211,153,0.12)'
                                  : 'rgba(107,92,82,0.12)',
                              color: u.role === 'subscriber' ? '#34d399' : '#8a7a6e',
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
                <SelectedUserCard
                  user={selectedUser}
                  onClear={() => setSelectedUser(null)}
                />
              )}
            </div>
          )}

          {/* New user form */}
          {mode === 'new' && (
            <div className="space-y-2.5">
              <Field
                label="Username *"
                hint="Letters, numbers, underscore (min 3 chars)"
              >
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
    className="rounded-lg p-3 flex items-center gap-3"
    style={{
      background: 'rgba(52,211,153,0.06)',
      border: '1px solid rgba(52,211,153,0.22)',
    }}
  >
    <span
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}
    >
      {user.username[0].toUpperCase()}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[12px] font-semibold text-white truncate">
          @{user.username}
        </p>
        <CheckCircleIcon size={11} style={{ color: '#34d399' }} />
      </div>
      <p className="text-[10px] truncate" style={{ color: '#8a7a6e' }}>
        {user.email} · #{user.id} · {user.role}
      </p>
    </div>
    <button
      onClick={onClear}
      className="text-[10px] underline shrink-0"
      style={{ color: '#6b5c52' }}
    >
      Change
    </button>
  </div>
);

/* ════════════════════════════════════════
   Step 3 — Plan picker
   ════════════════════════════════════════ */

const PlanStep = ({ locked, plans, selectedPlanId, setSelectedPlanId, suggestedPlanId, txAmount }) => {
  const complete = !!selectedPlanId;
  return (
    <section>
      <StepHeader num={3} title="Subscription Plan" complete={complete} locked={locked} />

      {!locked && (
        <div className="space-y-2">
          {plans.length === 0 ? (
            <p className="text-[11px]" style={{ color: '#6b5c52' }}>
              Loading plans…
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plans.map((p) => {
                const isSelected = selectedPlanId === p.id;
                const isSuggested = suggestedPlanId === p.id;
                const amountMatch =
                  txAmount && Math.abs(Number(p.price_usdt) - Number(txAmount)) < 0.5;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className="text-left p-2.5 rounded-lg transition-all"
                    style={{
                      background: isSelected
                        ? 'rgba(212,168,83,0.10)'
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${
                        isSelected
                          ? 'rgba(212,168,83,0.40)'
                          : 'rgba(255,255,255,0.05)'
                      }`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p
                        className="text-[12px] font-semibold tracking-tight"
                        style={{ color: isSelected ? '#d4a853' : '#fff' }}
                      >
                        {p.label}
                      </p>
                      {isSuggested && !isSelected && (
                        <Pill tone="green">Match</Pill>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-base font-light tabular-nums"
                        style={{ color: isSelected ? '#d4a853' : '#fff' }}
                      >
                        ${Number(p.price_usdt).toFixed(2)}
                      </span>
                      <span className="text-[10px]" style={{ color: '#6b5c52' }}>
                        {p.is_lifetime ? 'lifetime' : `${p.duration_days} days`}
                      </span>
                    </div>
                    {amountMatch && txAmount && (
                      <p
                        className="text-[9.5px] mt-1 flex items-center gap-1"
                        style={{ color: '#34d399' }}
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
};

/* ════════════════════════════════════════
   Step 4 — Admin note (required)
   ════════════════════════════════════════ */

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
            className="w-full px-2.5 py-2 rounded-md text-xs text-white focus:outline-none resize-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <p
            className="text-[9.5px] mt-1 text-right tabular-nums"
            style={{ color: complete ? '#34d399' : 'rgba(255,255,255,0.4)' }}
          >
            {note.length} / {NOTE_MIN_CHARS}+
          </p>
        </Field>
      )}
    </section>
  );
};

/* ════════════════════════════════════════
   Main modal
   ════════════════════════════════════════ */

export const ManualPaymentModal = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedUserId = null,
  preselectedUser = null,
}) => {
  /* ── Step 1 state ── */
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [paymentDateOverride, setPaymentDateOverride] = useState('');

  /* ── Step 2 state ── */
  const [userMode, setUserMode] = useState('existing');
  const [selectedUser, setSelectedUser] = useState(preselectedUser);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    telegram_username: '',
    discord_handle: '',
  });

  /* ── Step 3 state ── */
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  /* ── Step 4 state ── */
  const [note, setNote] = useState('');

  /* ── Submit state ── */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  /* ── Acknowledgment overrides ── */
  const [acceptAmountMismatch, setAcceptAmountMismatch] = useState(false);
  const [acceptWalletNotInPool, setAcceptWalletNotInPool] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTxHash('');
      setVerifyResult(null);
      setVerifyError(null);
      setVerifying(false);
      setPaymentDateOverride('');
      setUserMode('existing');
      setSelectedUser(preselectedUser);
      setNewUser({ username: '', email: '', telegram_username: '', discord_handle: '' });
      setSelectedPlanId(null);
      setNote('');
      setSubmitError(null);
      setSubmitting(false);
      setAcceptAmountMismatch(false);
      setAcceptWalletNotInPool(false);
    }
  }, [isOpen, preselectedUser]);

  // Load plans once
  useEffect(() => {
    if (isOpen && plans.length === 0) {
      financeApi
        .getPlans()
        .then((d) => setPlans(d.plans || []))
        .catch((e) => console.error('Failed to load plans:', e));
    }
  }, [isOpen, plans.length]);

  // Auto-pick suggested plan when verify result arrives
  useEffect(() => {
    if (verifyResult?.suggested_plan_id && !selectedPlanId) {
      setSelectedPlanId(verifyResult.suggested_plan_id);
    }
  }, [verifyResult, selectedPlanId]);

  // Escape close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  /* ── Step state derived ── */
  const blockers = verifyResult?.blockers || [];
  const warnings = verifyResult?.warnings || [];
  const step1Done = !!verifyResult && blockers.length === 0;
  const step2Done =
    step1Done &&
    ((userMode === 'existing' && !!selectedUser) ||
      (userMode === 'new' && newUser.username?.trim().length >= 3));
  const step3Done = step2Done && !!selectedPlanId;
  const step4Done = step3Done && note.trim().length >= NOTE_MIN_CHARS;

  const txAmount = verifyResult?.tx_data?.amount;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const planPrice = selectedPlan ? Number(selectedPlan.price_usdt) : null;
  const hasAmountMismatch =
    planPrice !== null &&
    txAmount &&
    Math.abs(Number(txAmount) - planPrice) > 0.5;
  const hasWalletNotInPoolWarning = warnings.some(
    (w) => w.code === 'wallet_not_in_pool'
  );

  const canSubmit =
    step4Done &&
    (!hasAmountMismatch || acceptAmountMismatch) &&
    (!hasWalletNotInPoolWarning || acceptWalletNotInPool) &&
    !submitting;

  /* ── Handlers ── */
  const handleVerify = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await financeApi.verifyTx(txHash.trim());
      setVerifyResult(result);
    } catch (e) {
      setVerifyError(e.response?.data?.detail || 'Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  }, [txHash, verifying]);

  const handleResetTx = () => {
    setVerifyResult(null);
    setVerifyError(null);
    setSelectedPlanId(null);
    setPaymentDateOverride('');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        tx_hash: txHash.trim().toLowerCase(),
        plan_id: selectedPlanId,
        admin_note: note.trim(),
        accept_amount_mismatch: acceptAmountMismatch,
        accept_wallet_not_in_pool: acceptWalletNotInPool,
      };

      // Only send override if user actually changed it (different from TX date)
      const txDateStr = verifyResult?.tx_data?.timestamp
        ? new Date(verifyResult.tx_data.timestamp).toISOString().slice(0, 10)
        : null;
      if (paymentDateOverride && paymentDateOverride !== txDateStr) {
        payload.payment_date_override = paymentDateOverride;
      }

      if (userMode === 'existing') {
        payload.user_id = selectedUser.id;
      } else {
        payload.new_user = {
          username: newUser.username.trim(),
          email: newUser.email.trim() || undefined,
          telegram_username: newUser.telegram_username.trim() || undefined,
          discord_handle: newUser.discord_handle.trim() || undefined,
        };
      }
      const result = await financeApi.createManualPayment(payload);
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (e) {
      setSubmitError(e.response?.data?.detail || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2147483646,
      }}
    >
      <div
        className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200"
        style={{
          background: '#0a0506',
          border: '1px solid rgba(212,168,83,0.25)',
          boxShadow:
            '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(212,168,83,0.08), 0 0 80px -10px rgba(212,168,83,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0 relative"
          style={{
            background: 'linear-gradient(180deg, #14080d, #12090d)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.35), transparent)',
            }}
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(212,168,83,0.1)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <StarIcon size={14} style={{ color: '#d4a853' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
                Record Manual Payment
              </h2>
              <p className="text-[10px] leading-tight" style={{ color: '#6b5c52' }}>
                For users who paid out-of-band (Telegram support, etc.)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105 shrink-0"
            style={{
              color: '#d4a853',
              background: 'rgba(212,168,83,0.08)',
              border: '1px solid rgba(212,168,83,0.22)',
            }}
            title="Close (Esc)"
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* BODY (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 min-h-0">
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

          <div style={{ opacity: step1Done ? 1 : 0.4, pointerEvents: step1Done ? 'auto' : 'none' }}>
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

          <div style={{ opacity: step2Done ? 1 : 0.4, pointerEvents: step2Done ? 'auto' : 'none' }}>
            <PlanStep
              locked={!step2Done}
              plans={plans}
              selectedPlanId={selectedPlanId}
              setSelectedPlanId={setSelectedPlanId}
              suggestedPlanId={verifyResult?.suggested_plan_id}
              txAmount={txAmount}
            />
          </div>

          {/* Amount mismatch override (between step 3 and 4) */}
          {step3Done && hasAmountMismatch && (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                background: 'rgba(251,146,60,0.06)',
                border: '1px solid rgba(251,146,60,0.25)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangleIcon
                  size={13}
                  className="shrink-0 mt-0.5"
                  style={{ color: '#fb923c' }}
                />
                <div className="text-[11px]" style={{ color: '#fb923c' }}>
                  <strong>Amount mismatch:</strong> TX is{' '}
                  <span className="tabular-nums">{txAmount} USDT</span>, but{' '}
                  {selectedPlan?.label} is{' '}
                  <span className="tabular-nums">${planPrice.toFixed(2)}</span>{' '}
                  (diff {(Number(txAmount) - planPrice).toFixed(2)}).
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: '#fb923c' }}>
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

          {/* Wallet not in pool override */}
          {step3Done && hasWalletNotInPoolWarning && (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.28)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangleIcon
                  size={13}
                  className="shrink-0 mt-0.5"
                  style={{ color: '#f87171' }}
                />
                <div className="text-[11px]" style={{ color: '#f87171' }}>
                  <strong>Out-of-pool wallet:</strong> recipient address is not
                  registered in the receiving wallet pool. This is unusual.
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: '#f87171' }}>
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

          <div style={{ opacity: step3Done ? 1 : 0.4, pointerEvents: step3Done ? 'auto' : 'none' }}>
            <NoteStep locked={!step3Done} note={note} setNote={setNote} />
          </div>

          {submitError && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.28)',
              }}
            >
              <AlertCircleIcon size={14} className="shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          className="px-5 py-3 shrink-0 flex gap-2"
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider disabled:opacity-40"
            style={{
              color: '#8a7a6e',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            style={{
              background: canSubmit
                ? 'linear-gradient(135deg, #d4a853, #8b6914)'
                : 'rgba(255,255,255,0.04)',
              color: canSubmit ? '#0a0506' : '#6b5c52',
            }}
          >
            {submitting && (
              <span
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'rgba(10,5,6,0.3)',
                  borderTopColor: '#0a0506',
                }}
              />
            )}
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
