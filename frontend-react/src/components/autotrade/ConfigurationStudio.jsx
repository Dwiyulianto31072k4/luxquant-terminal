// src/components/autotrade/ConfigurationStudio.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Configure tab
// Execution rules for the Binance strategy. Redesigned into clean
// full-width section cards (internal responsive grids keep them wide
// and short, not narrow and tall), with brighter section titles and
// field labels. Payload/behaviour unchanged — visual + structure only.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { updateBinanceStrategyConfig } from "../../services/autotradeApi";
import {
  Card,
  StatusDot,
  Toggle,
  Select,
  NumberInput,
  Segmented,
  PillToggle,
  GoldButton,
  GhostButton,
  Notice,
} from "./AutoTradeUI";

const RISK_LEVELS = ["low", "normal", "high"];
// Align with backend MIN_LIVE_ENTRY_NOTIONAL_USDT (futures-realistic floor).
const MIN_LIVE_ENTRY_USDT = 20;
const LEVEL_OPTIONS = [1, 2, 3, 4].map((n) => ({ value: n, label: `TP${n}` }));
const SL_LEVEL_OPTIONS = [1, 2].map((n) => ({ value: n, label: `SL${n}` }));

// ── Local presentation helpers (brighter than the shared dim variants) ──
function SectionTitle({ children, hint }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-1 rounded-full bg-gold-primary" />
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-light">
          {children}
        </h3>
      </div>
      {hint ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-secondary">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-text-muted">{hint}</p> : null}
    </div>
  );
}

function GuardCard({ title, children }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function toDraft(config) {
  return {
    spot_enabled: Boolean(config?.spot_enabled),
    futures_enabled: config?.futures_enabled ?? true,
    is_active: config?.is_active ?? false,

    sizing_method: config?.sizing?.method || "fixed",
    sizing_value: config?.sizing?.value ?? 10,

    tp_level: config?.tp?.level ?? 1,
    sl_level: config?.sl?.level ?? 1,

    exit_mode: config?.exit?.mode || "fixed_sl",
    trailing_callback_rate: config?.exit?.trailing_callback_rate ?? 1,

    leverage: config?.futures?.leverage ?? 1,
    margin_mode: config?.futures?.margin_mode || "isolated",

    allowed_risk_levels: config?.allowed_risk_levels || [],
    one_open_position_per_symbol:
      config?.risk_limits?.one_open_position_per_symbol ?? true,
    max_open_positions: config?.risk_limits?.max_open_positions ?? 3,
    max_daily_trades: config?.risk_limits?.max_daily_trades ?? 5,
    max_trade_notional_usdt:
      config?.risk_limits?.max_trade_notional_usdt ?? 50,
    min_available_usdt: config?.risk_limits?.min_available_usdt ?? 5,
    daily_loss_limit_usdt:
      config?.risk_limits?.daily_loss_limit_usdt ?? 50,
    cooldown_after_loss_minutes:
      config?.risk_limits?.cooldown_after_loss_minutes ?? 60,
    cooldown_after_error_minutes:
      config?.risk_limits?.cooldown_after_error_minutes ?? 15,
  };
}

function toPayload(draft) {
  const normalizeNumber = (value) =>
    value === "" || value === null || value === undefined
      ? null
      : Number(value);

  return {
    spot_enabled: draft.spot_enabled,
    futures_enabled: draft.futures_enabled,
    is_active: draft.is_active,
    dry_run: false,
    sizing_method: draft.sizing_method,
    sizing_value: Number(draft.sizing_value),
    tp_source: "signal_level",
    tp_level: Number(draft.tp_level),
    tp_custom_pct: null,
    sl_source: "signal_level",
    sl_level: Number(draft.sl_level),
    sl_custom_pct: null,
    exit_mode: draft.exit_mode,
    trailing_callback_rate:
      draft.exit_mode === "trailing_stop"
        ? normalizeNumber(draft.trailing_callback_rate)
        : null,
    leverage: draft.futures_enabled ? Number(draft.leverage) : null,
    margin_mode: draft.futures_enabled ? draft.margin_mode : null,
    allowed_risk_levels:
      draft.allowed_risk_levels.length > 0 ? draft.allowed_risk_levels : null,
    one_open_position_per_symbol: draft.one_open_position_per_symbol,
    max_open_positions: Number(draft.max_open_positions),
    max_daily_trades: Number(draft.max_daily_trades),
    max_trade_notional_usdt: Number(draft.max_trade_notional_usdt),
    min_available_usdt: Number(draft.min_available_usdt),
    daily_loss_limit_usdt: Number(draft.daily_loss_limit_usdt),
    cooldown_after_loss_minutes: Number(draft.cooldown_after_loss_minutes),
    cooldown_after_error_minutes: Number(draft.cooldown_after_error_minutes),
  };
}

export default function ConfigurationStudio({
  config,
  hasConnectedAccount,
  onSaved,
}) {
  const [draft, setDraft] = useState(() => toDraft(config));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!dirty && !saving) {
      setDraft(toDraft(config));
    }
  }, [config, dirty, saving]);

  const statusText = useMemo(() => {
    if (!hasConnectedAccount) return "Connect Binance keys to start trading.";
    return "Configure how future Binance entries are sized, protected and limited.";
  }, [hasConnectedAccount]);

  const patch = (changes) => {
    setDirty(true);
    setError("");
    setSuccess("");
    setDraft((current) => ({ ...current, ...changes }));
  };

  const effectiveFixedNotional =
    draft.sizing_method === "fixed"
      ? Math.max(MIN_LIVE_ENTRY_USDT, Number(draft.sizing_value) || 0)
      : null;
  const sizingLimitError =
    effectiveFixedNotional !== null &&
    Number(draft.max_trade_notional_usdt) < effectiveFixedNotional
      ? `Per trade cap must be at least ${effectiveFixedNotional.toFixed(
          2,
        )} USDT. Live orders use a minimum execution size of ${MIN_LIVE_ENTRY_USDT.toFixed(
          2,
        )} USDT.`
      : "";

  const toggleRisk = (level) => {
    setDirty(true);
    setError("");
    setSuccess("");
    setDraft((current) => {
      const exists = current.allowed_risk_levels.includes(level);
      return {
        ...current,
        allowed_risk_levels: exists
          ? current.allowed_risk_levels.filter((item) => item !== level)
          : [...current.allowed_risk_levels, level],
      };
    });
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    if (sizingLimitError) {
      setError(sizingLimitError);
      return;
    }
    setSaving(true);
    try {
      const response = await updateBinanceStrategyConfig(toPayload(draft));
      if (response?.config) {
        setDraft(toDraft(response.config));
      }
      setDirty(false);
      await onSaved?.({ background: true });
      setSuccess(
        `Strategy saved. Amount: ${Number(draft.sizing_value)} ${
          draft.sizing_method === "fixed" ? "USDT" : "%"
        }; per trade cap: ${Number(draft.max_trade_notional_usdt)} USDT.`,
      );
    } catch (err) {
      setError(err.message || "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(toDraft(config));
    setDirty(false);
    setError("");
    setSuccess("");
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <Card>
        <div className="flex items-center gap-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-light">
            Trading policy
          </p>
          <StatusDot tone={draft.is_active ? "good" : "warn"} pulse={draft.is_active}>
            {draft.is_active ? "Active" : "Paused"}
          </StatusDot>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white lg:text-2xl">
          Strategy configuration
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{statusText}</p>
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-text-muted">
          Start and pause AutoTrade from the engine control at the top of the page.
        </p>
      </Card>

      {!hasConnectedAccount ? (
        <Notice tone="warn">
          The strategy can be configured now, but a saved Binance account is
          required before the engine can place trades.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}
      {sizingLimitError && error !== sizingLimitError ? (
        <Notice tone="warn">{sizingLimitError}</Notice>
      ) : null}

      {/* ── Markets ── */}
      <Card>
        <SectionTitle>Markets</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Spot trading"
            hint="Execute spot orders for supported signals."
            checked={draft.spot_enabled}
            onChange={(value) => patch({ spot_enabled: value })}
          />
          <Toggle
            label="Futures trading"
            hint="Execute leveraged futures orders."
            checked={draft.futures_enabled}
            onChange={(value) => patch({ futures_enabled: value })}
          />
        </div>
      </Card>

      {/* ── Position sizing (+ futures) ── */}
      <Card>
        <SectionTitle hint="Per-entry capital">Position sizing</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Method">
            <Select
              value={draft.sizing_method}
              onChange={(value) => patch({ sizing_method: value })}
              options={[
                { value: "fixed", label: "Fixed USDT" },
                { value: "percent", label: "Percent of balance" },
              ]}
            />
          </Row>
          <Row
            label="Amount"
            hint={
              draft.sizing_method === "fixed"
                ? `USDT per trade. Live minimum: ${MIN_LIVE_ENTRY_USDT} USDT.`
                : "0–100% of available balance."
            }
          >
            <NumberInput
              value={draft.sizing_value}
              onChange={(value) => patch({ sizing_value: value })}
              min={draft.sizing_method === "fixed" ? MIN_LIVE_ENTRY_USDT : 0}
              max={draft.sizing_method === "fixed" ? 1000000 : 100}
              step={0.1}
              suffix={draft.sizing_method === "fixed" ? "USDT" : "%"}
            />
          </Row>
        </div>

        {draft.futures_enabled ? (
          <div className="mt-5 border-t border-white/[0.06] pt-5">
            <SectionTitle>Futures</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Leverage" hint="1×–125×">
                <NumberInput
                  value={draft.leverage}
                  onChange={(value) => patch({ leverage: value })}
                  min={1}
                  max={125}
                  suffix="×"
                />
              </Row>
              <Row label="Margin mode">
                <Select
                  value={draft.margin_mode}
                  onChange={(value) => patch({ margin_mode: value })}
                  options={[
                    { value: "isolated", label: "Isolated" },
                    { value: "cross", label: "Cross" },
                  ]}
                />
              </Row>
            </div>
          </div>
        ) : null}
      </Card>

      {/* ── Take profit / Stop loss ── */}
      <Card>
        <SectionTitle>Take profit / Stop loss</SectionTitle>
        <div className="space-y-4">
          <Row label="Take profit target" hint="Which TP level from the signal to exit on.">
            <Segmented
              value={draft.tp_level}
              onChange={(value) => patch({ tp_level: value })}
              options={LEVEL_OPTIONS}
            />
          </Row>
          <Row label="Stop loss level" hint="Which SL level from the signal to use.">
            <Segmented
              value={draft.sl_level}
              onChange={(value) => patch({ sl_level: value })}
              options={SL_LEVEL_OPTIONS}
            />
          </Row>
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="Exit mode">
              <Select
                value={draft.exit_mode}
                onChange={(value) => patch({ exit_mode: value })}
                options={[
                  { value: "fixed_sl", label: "Fixed SL" },
                  { value: "trailing_stop", label: "Trailing stop" },
                ]}
              />
            </Row>
            <Row label="Trailing callback" hint="Used only for trailing stop.">
              <NumberInput
                value={draft.trailing_callback_rate}
                onChange={(value) => patch({ trailing_callback_rate: value })}
                min={0.1}
                max={10}
                step={0.1}
                suffix="%"
              />
            </Row>
          </div>
        </div>
      </Card>

      {/* ── Risk filter ── */}
      <Card>
        <SectionTitle>Risk filter</SectionTitle>
        <p className="mb-3 text-sm text-text-secondary">
          Only trade signals matching these risk levels.
        </p>
        <div className="flex flex-wrap gap-2">
          {RISK_LEVELS.map((level) => (
            <PillToggle
              key={level}
              active={draft.allowed_risk_levels.includes(level)}
              onClick={() => toggleRisk(level)}
            >
              {level}
            </PillToggle>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Leave all unselected to trade every risk level.
        </p>
      </Card>

      {/* ── Risk limits ── */}
      <Card className="border-gold-primary/15">
        <SectionTitle hint="Server-enforced before every live entry">
          Risk limits
        </SectionTitle>

        <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-white">
              Portfolio protection
            </h4>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">
              These limits are stored per user and checked by the execution
              engine before an order reaches Binance.
            </p>
          </div>
          <div className="w-full sm:w-[360px]">
            <Toggle
              label="One position per symbol"
              hint="Prevent duplicate exposure on the same asset."
              checked={draft.one_open_position_per_symbol}
              onChange={(value) => patch({ one_open_position_per_symbol: value })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <GuardCard title="Exposure">
            <Row label="Open positions" hint="Maximum concurrent positions.">
              <NumberInput
                value={draft.max_open_positions}
                onChange={(value) => patch({ max_open_positions: value })}
                min={1}
                max={100}
              />
            </Row>
            <Row
              label="Per trade cap"
              hint={
                draft.sizing_method === "fixed"
                  ? `Must cover the effective ${effectiveFixedNotional.toFixed(
                      2,
                    )} USDT entry. Protected spot orders may need a slightly higher cap.`
                  : "Maximum entry notional."
              }
            >
              <NumberInput
                value={draft.max_trade_notional_usdt}
                onChange={(value) => patch({ max_trade_notional_usdt: value })}
                min={effectiveFixedNotional || 0.01}
                max={1000000}
                step={0.1}
                suffix="USDT"
              />
            </Row>
          </GuardCard>

          <GuardCard title="Daily guard">
            <Row label="Trades per day" hint="Resets at 00:00 UTC.">
              <NumberInput
                value={draft.max_daily_trades}
                onChange={(value) => patch({ max_daily_trades: value })}
                min={1}
                max={1000}
              />
            </Row>
            <Row label="Loss limit" hint="Pause after realized losses.">
              <NumberInput
                value={draft.daily_loss_limit_usdt}
                onChange={(value) => patch({ daily_loss_limit_usdt: value })}
                min={0.01}
                max={1000000}
                step={0.1}
                suffix="USDT"
              />
            </Row>
          </GuardCard>

          <GuardCard title="Capital guard">
            <Row
              label="Minimum reserve"
              hint="USDT that must remain free after a new entry."
            >
              <NumberInput
                value={draft.min_available_usdt}
                onChange={(value) => patch({ min_available_usdt: value })}
                min={0}
                max={1000000}
                step={0.1}
                suffix="USDT"
              />
            </Row>
            <div className="rounded-md border border-gold-primary/15 bg-gold-primary/[0.05] px-3 py-2.5 text-xs leading-5 text-text-secondary">
              Reconciliation issues always block new live entries regardless of
              these values.
            </div>
          </GuardCard>

          <GuardCard title="Recovery">
            <Row label="After loss" hint="Wait before the next entry.">
              <NumberInput
                value={draft.cooldown_after_loss_minutes}
                onChange={(value) => patch({ cooldown_after_loss_minutes: value })}
                min={0}
                max={10080}
                suffix="min"
              />
            </Row>
            <Row label="After error" hint="Wait after execution failure.">
              <NumberInput
                value={draft.cooldown_after_error_minutes}
                onChange={(value) => patch({ cooldown_after_error_minutes: value })}
                min={0}
                max={10080}
                suffix="min"
              />
            </Row>
          </GuardCard>
        </div>

        <p className="mt-4 text-xs text-text-muted">
          Skipped signals do not consume the daily trade quota.
        </p>
      </Card>

      {/* ── Save bar ── */}
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border border-gold-primary/20 bg-[#0a0805]/95 px-4 py-3 shadow-2xl backdrop-blur">
        <div>
          <p
            className={`text-xs font-semibold ${
              dirty ? "text-gold-light" : "text-text-secondary"
            }`}
          >
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <p className="hidden text-[11px] text-text-muted sm:block">
            Background refresh will not overwrite values while you are editing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <GhostButton onClick={handleReset} disabled={saving}>
              Discard
            </GhostButton>
          ) : null}
          <GoldButton
            onClick={handleSave}
            disabled={
              !hasConnectedAccount ||
              saving ||
              !dirty ||
              Boolean(sizingLimitError)
            }
          >
            {saving ? "Saving…" : "Save strategy"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
