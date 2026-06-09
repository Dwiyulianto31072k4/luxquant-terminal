// src/components/autotrade/ConfigurationStudio.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Configure tab
// Execution rules for the Binance strategy. Grouped into clear
// sections: Execution · Sizing · Futures · Exit (TP/SL) · Risk.
// Payload/behaviour unchanged — visual + structure only.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  setBinanceStrategyActive,
  updateBinanceStrategyConfig,
} from "../../services/autotradeApi";
import {
  Card,
  SectionHeader,
  StatusBadge,
  Toggle,
  Field,
  Select,
  NumberInput,
  Segmented,
  PillToggle,
  GoldButton,
  GhostButton,
  Notice,
} from "./AutoTradeUI";

const RISK_LEVELS = ["low", "normal", "high"];
const LEVEL_OPTIONS = [1, 2, 3, 4].map((n) => ({ value: n, label: `TP${n}` }));
const SL_LEVEL_OPTIONS = [1, 2, 3, 4].map((n) => ({
  value: n,
  label: `${n}`,
}));

function toDraft(config) {
  return {
    spot_enabled: Boolean(config?.spot_enabled),
    futures_enabled: config?.futures_enabled ?? true,
    is_active: config?.is_active ?? false,
    dry_run: config?.dry_run ?? false,

    sizing_method: config?.sizing?.method || "fixed",
    sizing_value: config?.sizing?.value ?? 10,

    tp_level: config?.tp?.level ?? 1,
    sl_level: config?.sl?.level ?? 1,

    exit_mode: config?.exit?.mode || "fixed_sl",
    trailing_callback_rate: config?.exit?.trailing_callback_rate ?? 1,

    leverage: config?.futures?.leverage ?? 1,
    margin_mode: config?.futures?.margin_mode || "isolated",

    allowed_risk_levels: config?.allowed_risk_levels || [],
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
    dry_run: draft.dry_run,
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
  };
}

export default function ConfigurationStudio({
  config,
  hasConnectedAccount,
  onSaved,
}) {
  const [draft, setDraft] = useState(() => toDraft(config));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setDraft(toDraft(config));
  }, [config]);

  const statusText = useMemo(() => {
    if (!hasConnectedAccount) return "Connect Binance keys to start trading.";
    if (draft.is_active) return "AutoTrade is running on incoming signals.";
    return "Strategy saved but paused.";
  }, [draft.is_active, hasConnectedAccount]);

  const patch = (changes) =>
    setDraft((current) => ({ ...current, ...changes }));

  const toggleRisk = (level) => {
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

  const handleQuickToggle = async () => {
    setToggling(true);
    setError("");
    setSuccess("");
    try {
      const response = await setBinanceStrategyActive(!draft.is_active);
      patch({ is_active: response.active });
      setSuccess(`Strategy ${response.active ? "enabled" : "paused"}.`);
      onSaved?.();
    } catch (err) {
      setError(err.message || "Failed to toggle strategy");
    } finally {
      setToggling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateBinanceStrategyConfig(toPayload(draft));
      setSuccess("Strategy configuration saved.");
      onSaved?.();
    } catch (err) {
      setError(err.message || "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header: status + quick enable/pause ── */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/80">
                Strategy
              </p>
              <StatusBadge
                tone={draft.is_active ? "good" : "warn"}
                dot={draft.is_active}
              >
                {draft.is_active ? "Active" : "Paused"}
              </StatusBadge>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white lg:text-2xl">
              Execution rules
            </h2>
            <p className="mt-1 text-sm text-text-muted">{statusText}</p>
          </div>
          <GhostButton
            tone="gold"
            onClick={handleQuickToggle}
            disabled={!hasConnectedAccount || toggling}
          >
            {toggling
              ? "Working…"
              : draft.is_active
                ? "Pause strategy"
                : "Enable strategy"}
          </GhostButton>
        </div>
      </Card>

      {!hasConnectedAccount ? (
        <Notice tone="warn">
          The strategy can be configured now, but a saved Binance account is
          required before the engine can place trades.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── LEFT: execution + sizing + futures ── */}
        <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader label="Execution" />
            <Toggle
              label="Strategy active"
              hint="Master on/off for automated trading."
              checked={draft.is_active}
              onChange={(value) => patch({ is_active: value })}
            />
            <Toggle
              label="Dry run"
              hint="Simulate orders without sending them to Binance."
              checked={draft.dry_run}
              onChange={(value) => patch({ dry_run: value })}
            />
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

          <div className="space-y-3">
            <SectionHeader label="Position Sizing" />
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Method">
                  <Select
                    value={draft.sizing_method}
                    onChange={(value) => patch({ sizing_method: value })}
                    options={[
                      { value: "fixed", label: "Fixed USDT" },
                      { value: "percent", label: "Percent of balance" },
                    ]}
                  />
                </Field>
                <Field
                  label="Amount"
                  hint={
                    draft.sizing_method === "fixed"
                      ? "USDT per trade."
                      : "0–100% of available balance."
                  }
                >
                  <NumberInput
                    value={draft.sizing_value}
                    onChange={(value) => patch({ sizing_value: value })}
                    min={0}
                    max={draft.sizing_method === "fixed" ? 1000000 : 100}
                    step={0.1}
                    suffix={draft.sizing_method === "fixed" ? "USDT" : "%"}
                  />
                </Field>
              </div>
            </Card>
          </div>

          {draft.futures_enabled ? (
            <div className="space-y-3">
              <SectionHeader label="Futures" />
              <Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Leverage" hint="1×–125×">
                    <NumberInput
                      value={draft.leverage}
                      onChange={(value) => patch({ leverage: value })}
                      min={1}
                      max={125}
                      suffix="×"
                    />
                  </Field>
                  <Field label="Margin mode">
                    <Select
                      value={draft.margin_mode}
                      onChange={(value) => patch({ margin_mode: value })}
                      options={[
                        { value: "isolated", label: "Isolated" },
                        { value: "cross", label: "Cross" },
                      ]}
                    />
                  </Field>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        {/* ── RIGHT: exit (TP/SL) + risk filter ── */}
        <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader label="Take Profit / Stop Loss" />
            <Card>
              <div className="space-y-4">
                <Field
                  label="Take Profit target"
                  hint="Which TP level from the signal to exit on."
                >
                  <Segmented
                    value={draft.tp_level}
                    onChange={(value) => patch({ tp_level: value })}
                    options={LEVEL_OPTIONS}
                  />
                </Field>
                <Field
                  label="Stop Loss level"
                  hint="Which SL level from the signal to use."
                >
                  <Segmented
                    value={draft.sl_level}
                    onChange={(value) => patch({ sl_level: value })}
                    options={SL_LEVEL_OPTIONS}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Exit mode">
                    <Select
                      value={draft.exit_mode}
                      onChange={(value) => patch({ exit_mode: value })}
                      options={[
                        { value: "fixed_sl", label: "Fixed SL" },
                        { value: "trailing_stop", label: "Trailing stop" },
                      ]}
                    />
                  </Field>
                  <Field
                    label="Trailing callback"
                    hint="Used only for trailing stop."
                  >
                    <NumberInput
                      value={draft.trailing_callback_rate}
                      onChange={(value) =>
                        patch({ trailing_callback_rate: value })
                      }
                      min={0.1}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                  </Field>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            <SectionHeader label="Risk Filter" />
            <Card>
              <p className="mb-3 text-sm text-text-muted">
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
              <p className="mt-3 text-xs text-text-muted/70">
                Leave all unselected to trade every risk level.
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Save bar ── */}
      <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] pt-4">
        <GoldButton
          onClick={handleSave}
          disabled={!hasConnectedAccount || saving}
        >
          {saving ? "Saving…" : "Save strategy"}
        </GoldButton>
      </div>
    </div>
  );
}
