import { useEffect, useMemo, useState } from "react";
import {
  setBinanceStrategyActive,
  updateBinanceStrategyConfig,
} from "../../services/autotradeApi";

const RISK_LEVELS = ["low", "normal", "high"];

// function toDraft(config) {
//   return {
//     spot_enabled: Boolean(config?.spot_enabled),
//     futures_enabled: config?.futures_enabled ?? true,
//     is_active: config?.is_active ?? false,
//     dry_run: config?.dry_run ?? false,
//     sizing_method: config?.sizing?.method || "fixed",
//     sizing_value: config?.sizing?.value ?? 10,
//     tp_source: "signal_level",
//     tp_level: Number(draft.tp_level),
//     tp_custom_pct: null,

//     sl_source: "signal_level",
//     sl_level: Number(draft.sl_level),
//     sl_custom_pct: null,
//     exit_mode: config?.exit?.mode || "fixed_sl",
//     trailing_callback_rate: config?.exit?.trailing_callback_rate ?? 1,
//     leverage: config?.futures?.leverage ?? 1,
//     margin_mode: config?.futures?.margin_mode || "isolated",
//     allowed_risk_levels: config?.allowed_risk_levels || [],
//   };
// }

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

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-10 rounded-full border transition-colors ${
          checked
            ? "border-gold-primary bg-gold-primary/80"
            : "border-white/[0.08] bg-white/[0.04]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${
            checked
              ? "translate-x-[20px] bg-[#0a0805]"
              : "translate-x-0.5 bg-white/40"
          }`}
        />
      </button>
    </div>
  );
}

function InputGroup({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-muted/70">{hint}</p> : null}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-primary/40"
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          className="bg-[#0a0805]"
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-primary/40"
    />
  );
}

export default function ConfigurationStudio({
  config,
  hasConnectedAccount,
  onSaved,
}) {
  const [draft, setDraft] = useState(() => toDraft(config));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setDraft(toDraft(config));
  }, [config]);

  const statusText = useMemo(() => {
    if (!hasConnectedAccount) return "Connect Binance keys first.";
    if (draft.is_active) return "AutoTrade is active.";
    return "Strategy saved but inactive.";
  }, [draft.is_active, hasConnectedAccount]);

  const patch = (changes) =>
    setDraft((current) => ({
      ...current,
      ...changes,
    }));

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
    setSaving(true);
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
      setSaving(false);
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
      <div className="rounded-md border border-white/[0.06] bg-[#0a0805] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary/80">
              Binance Strategy Config
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Configure execution rules
            </h2>
            <p className="mt-1 text-sm text-text-muted">{statusText}</p>
          </div>
          <button
            type="button"
            onClick={handleQuickToggle}
            disabled={!hasConnectedAccount || saving}
            className="rounded-md border border-gold-primary/25 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-gold-primary hover:bg-gold-primary/[0.08] disabled:opacity-40"
          >
            {draft.is_active ? "Pause Strategy" : "Enable Strategy"}
          </button>
        </div>
      </div>

      {!hasConnectedAccount ? (
        <div className="rounded-md border border-gold-primary/20 bg-gold-primary/[0.04] p-4 text-sm text-gold-primary/80">
          The strategy API is available, but it needs a saved Binance account
          before the backend can trade.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.05] p-3 text-sm text-emerald-400">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-md border border-white/[0.06] bg-[#0a0805] p-5">
          <Toggle
            label="Strategy active"
            hint="Master on/off switch from `is_active`."
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
            label="Spot enabled"
            hint="Allow spot execution for supported signals."
            checked={draft.spot_enabled}
            onChange={(value) => patch({ spot_enabled: value })}
          />
          <Toggle
            label="Futures enabled"
            hint="Allow futures execution and leverage settings."
            checked={draft.futures_enabled}
            onChange={(value) => patch({ futures_enabled: value })}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <InputGroup label="Sizing method">
              <Select
                value={draft.sizing_method}
                onChange={(value) => patch({ sizing_method: value })}
                options={[
                  { value: "fixed", label: "Fixed USDT" },
                  { value: "percent", label: "Percent of balance" },
                ]}
              />
            </InputGroup>

            <InputGroup
              label="Sizing value"
              hint={
                draft.sizing_method === "fixed"
                  ? "USDT per trade."
                  : "0-100% of available balance."
              }
            >
              <NumberInput
                value={draft.sizing_value}
                onChange={(value) => patch({ sizing_value: value })}
                min={0}
                max={draft.sizing_method === "fixed" ? 1000000 : 100}
                step={0.1}
              />
            </InputGroup>
          </div>

          {draft.futures_enabled ? (
            <div className="grid gap-4 md:grid-cols-2">
              <InputGroup label="Leverage">
                <NumberInput
                  value={draft.leverage}
                  onChange={(value) => patch({ leverage: value })}
                  min={1}
                  max={125}
                />
              </InputGroup>
              <InputGroup label="Margin mode">
                <Select
                  value={draft.margin_mode}
                  onChange={(value) => patch({ margin_mode: value })}
                  options={[
                    { value: "isolated", label: "Isolated" },
                    { value: "cross", label: "Cross" },
                  ]}
                />
              </InputGroup>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-md border border-white/[0.06] bg-[#0a0805] p-5">
          <InputGroup
            label="Take Profit Level"
            hint="Use TP level from the signal"
          >
            <NumberInput
              value={draft.tp_level}
              onChange={(value) => patch({ tp_level: value })}
              min={1}
              max={4}
            />
          </InputGroup>

          <InputGroup
            label="Stop Loss Level"
            hint="Use SL level from the signal"
          >
            <NumberInput
              value={draft.sl_level}
              onChange={(value) => patch({ sl_level: value })}
              min={1}
              max={4}
            />
          </InputGroup>

          <div className="grid gap-4 md:grid-cols-2">
            <InputGroup label="Exit mode">
              <Select
                value={draft.exit_mode}
                onChange={(value) => patch({ exit_mode: value })}
                options={[
                  { value: "fixed_sl", label: "Fixed SL" },
                  { value: "trailing_stop", label: "Trailing stop" },
                ]}
              />
            </InputGroup>
            <InputGroup
              label="Trailing callback"
              hint="Required only when exit mode is trailing stop."
            >
              <NumberInput
                value={draft.trailing_callback_rate}
                onChange={(value) => patch({ trailing_callback_rate: value })}
                min={0.1}
                max={10}
                step={0.1}
              />
            </InputGroup>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
              Allowed risk levels
            </p>
            <div className="flex flex-wrap gap-2">
              {RISK_LEVELS.map((level) => {
                const active = draft.allowed_risk_levels.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleRisk(level)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] ${
                      active
                        ? "border-gold-primary/30 bg-gold-primary/10 text-gold-primary"
                        : "border-white/[0.08] bg-white/[0.02] text-text-muted"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-text-muted/70">
              Leave all unselected to trade every risk level.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasConnectedAccount || saving}
          className="rounded-md px-5 py-2.5 text-[11px] font-mono uppercase tracking-[0.2em] text-black disabled:opacity-40"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
          }}
        >
          {saving ? "Saving..." : "Save Strategy"}
        </button>
      </div>
    </div>
  );
}
