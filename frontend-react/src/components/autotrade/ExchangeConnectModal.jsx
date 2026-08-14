// Connect keys. Form first. Permissions and IP sit beside it, compact.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { checkExchangeKeys, saveExchangeKeys } from "../../services/autotradeApi";
import { Notice, GoldButton, GhostButton } from "./AutoTradeUI";
import {
  AUTOTRADE_SERVER_IP,
  EXCHANGE_LIST,
  EXCHANGE_VENUES,
  VenueLogo,
  whitelistCopyText,
  whitelistIpsFor,
} from "./exchangeVenues";

const INITIAL_FORM = { label: "", api_key: "", api_secret: "", passphrase: "" };

function copyText(value) {
  return navigator.clipboard.writeText(value);
}

function ServerIpList({ venueId }) {
  const rows = whitelistIpsFor(venueId);
  const [copied, setCopied] = useState("");
  const mark = (id) => {
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1600);
  };
  const copyOne = async (row) => {
    try {
      await copyText(row.ip);
      mark(row.id);
    } catch {
      /* ignore */
    }
  };
  const copyAll = async () => {
    try {
      await copyText(whitelistCopyText(venueId));
      mark("all");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.ip}
          className="flex items-center justify-between gap-3 rounded-lg border border-ink/[0.08] bg-surface-secondary px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {row.label}
              {row.note ? <span className="font-sans font-medium normal-case tracking-normal"> · {row.note}</span> : null}
            </p>
            <p className="mt-0.5 select-all font-mono text-[13px] font-semibold text-text-primary">
              {row.ip}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyOne(row)}
            className="shrink-0 rounded-md border border-ink/[0.1] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary hover:text-text-primary"
          >
            {copied === row.id ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
      {rows.length > 1 ? (
        <button
          type="button"
          onClick={copyAll}
          className="w-full rounded-md border border-ink/[0.1] bg-surface-raised px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary hover:text-text-primary"
        >
          {copied === "all" ? "Both IPs copied" : "Copy both IPs"}
        </button>
      ) : null}
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-text-secondary">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-ink/[0.1] bg-surface-secondary px-3.5 py-2.5 pr-14 font-mono text-sm text-text-primary placeholder:text-text-muted/45 focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/[0.05]"
        />
        <button
          type="button"
          onClick={() => setVisible((c) => !c)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:text-text-primary"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function ExchangeConnectModal({ isOpen, onClose, onSuccess, exchange = "binance" }) {
  const [venueId, setVenueId] = useState(EXCHANGE_VENUES[exchange] ? exchange : "binance");
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const venue = EXCHANGE_VENUES[venueId] || EXCHANGE_VENUES.binance;

  useEffect(() => {
    if (!isOpen) return;
    setVenueId(EXCHANGE_VENUES[exchange] ? exchange : "binance");
    setForm(INITIAL_FORM);
    setSaving(false);
    setError("");
    setResult(null);
  }, [isOpen, exchange]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit =
    form.api_key.trim() &&
    form.api_secret.trim() &&
    (!venue.needsPassphrase || form.passphrase.trim());

  const switchVenue = (id) => {
    setVenueId(id);
    setError("");
    setResult(null);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        api_key: form.api_key.trim(),
        api_secret: form.api_secret.trim(),
        label: form.label.trim() || undefined,
      };
      if (venue.needsPassphrase) payload.passphrase = form.passphrase.trim();
      await saveExchangeKeys(venue.id, payload);
      const check = await checkExchangeKeys(venue.id);
      setResult(check);
      if (!check.valid) {
        const hints = Array.isArray(check.hints) ? check.hints.filter(Boolean) : [];
        const ips = whitelistIpsFor(venue.id).map((row) => row.ip);
        const detail =
          check.message || hints.join(" ") || `Saved, but ${venue.name} rejected the key.`;
        const ipHint =
          ips.length > 1
            ? ` Whitelist both ${ips.join(" and ")} if the key is IP-restricted.`
            : ` Whitelist ${ips[0] || AUTOTRADE_SERVER_IP} if the key is IP-restricted.`;
        throw new Error(`${detail}${detail.toLowerCase().includes("ip") ? "" : ipHint}`);
      }
      onSuccess?.();
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err.message || `Could not save ${venue.name} keys`);
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="lq-scrim" onClick={onClose} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="lq-sheet relative z-10 flex max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-ink/[0.07] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <VenueLogo venue={venue} className="h-10 w-10" />
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">
                Connect {venue.name}
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {venue.markets}
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap gap-1.5">
                {EXCHANGE_LIST.map((item) => {
                  const on = item.id === venue.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => switchVenue(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        on
                          ? "bg-ink text-surface-raised"
                          : "bg-surface-secondary text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <VenueLogo venue={item} className="h-4 w-4" />
                      {item.name}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-medium text-text-secondary">Label</label>
                  <input
                    value={form.label}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, label: event.target.value }))
                    }
                    placeholder={venue.placeholderLabel}
                    className="w-full rounded-lg border border-ink/[0.1] bg-surface-secondary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/[0.05]"
                  />
                </div>
                <SecretField
                  label="API key"
                  value={form.api_key}
                  placeholder={venue.keyPlaceholder}
                  onChange={(value) => setForm((c) => ({ ...c, api_key: value }))}
                />
                <SecretField
                  label="API secret"
                  value={form.api_secret}
                  placeholder={venue.secretPlaceholder}
                  onChange={(value) => setForm((c) => ({ ...c, api_secret: value }))}
                />
                {venue.needsPassphrase ? (
                  <SecretField
                    label="Passphrase"
                    value={form.passphrase}
                    placeholder="The passphrase you typed when creating the key"
                    onChange={(value) => setForm((c) => ({ ...c, passphrase: value }))}
                  />
                ) : null}
              </div>

              {result ? (
                <Notice tone={result.valid ? "success" : "error"}>
                  {result.valid
                    ? `${venue.name} accepted the key.`
                    : `${venue.name} rejected validation. Check permissions and IP whitelist.`}
                </Notice>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}

              <div className="flex gap-2 pt-1">
                <GhostButton onClick={onClose} disabled={saving} className="flex-1">
                  Cancel
                </GhostButton>
                <GoldButton
                  onClick={handleSubmit}
                  disabled={!canSubmit || saving}
                  className="flex-1"
                >
                  {saving ? "Checking…" : "Save & validate"}
                </GoldButton>
              </div>
            </div>

            <aside className="space-y-4 border-t border-ink/[0.07] bg-surface-secondary/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Key permissions
                </p>
                <ul className="mt-2.5 space-y-2">
                  {venue.permissions.map((perm) => (
                    <li key={perm.label} className="flex items-center gap-2 text-[13px]">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                          perm.state === "no"
                            ? "bg-[#F6465D]/12 text-negative"
                            : "bg-[#0ECB81]/12 text-profit"
                        }`}
                      >
                        {perm.state === "no" ? "✕" : "✓"}
                      </span>
                      <span className={perm.state === "no" ? "text-negative" : "text-text-primary"}>
                        {perm.label}
                        {perm.state === "no" ? (
                          <span className="font-normal text-negative/80"> · never</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  IP whitelist
                </p>
                <p className="mt-2 text-[12px] leading-5 text-text-secondary">{venue.ipHint}</p>
                <div className="mt-2.5">
                  <ServerIpList venueId={venue.id} />
                </div>
              </div>

              <p className="text-[12px] leading-5 text-text-muted">
                One venue at a time. Dry-run first. You turn it off.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
