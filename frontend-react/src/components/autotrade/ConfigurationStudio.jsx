// src/components/autotrade/ConfigurationStudio.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Configuration Studio (demo data)
// Local-only configuration surface for the Configure tab
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";

const PRESETS = [
  {
    id: "balanced",
    label: "Balanced Flow",
    description: "Default demo profile for steady execution.",
    config: {
      enabled: true,
      default_market_type: "futures",
      margin_mode: "isolated",
      max_position_pct: 12,
      max_leverage: 8,
      max_concurrent_trades: 2,
      daily_loss_limit_pct: 4,
      tp_strategy: "front_loaded",
      sl_to_breakeven_after: "tp1",
      risk_filter: "low_medium",
      min_volume_rank: 120,
      trailing_stop_enabled: true,
      trailing_stop_type: "percent",
      trailing_stop_value: 1.8,
      trailing_activation: "after_tp1",
      trailing_update_interval: 30,
      anti_liq_enabled: true,
      anti_liq_buffer_pct: 2.5,
      cooldown_minutes: 20,
      signal_expiry_minutes: 15,
    },
  },
  {
    id: "conservative",
    label: "Conservative Guard",
    description: "Tighter filters and smaller position sizes.",
    config: {
      enabled: true,
      default_market_type: "spot",
      margin_mode: "isolated",
      max_position_pct: 7,
      max_leverage: 3,
      max_concurrent_trades: 1,
      daily_loss_limit_pct: 2.5,
      tp_strategy: "equal_split",
      sl_to_breakeven_after: "tp1",
      risk_filter: "low_only",
      min_volume_rank: 180,
      trailing_stop_enabled: false,
      trailing_stop_type: "percent",
      trailing_stop_value: 1.2,
      trailing_activation: "breakeven",
      trailing_update_interval: 45,
      anti_liq_enabled: true,
      anti_liq_buffer_pct: 3,
      cooldown_minutes: 40,
      signal_expiry_minutes: 20,
    },
  },
  {
    id: "aggressive",
    label: "Aggressive Burst",
    description: "Higher leverage and faster execution for demo only.",
    config: {
      enabled: false,
      default_market_type: "futures",
      margin_mode: "cross",
      max_position_pct: 18,
      max_leverage: 15,
      max_concurrent_trades: 4,
      daily_loss_limit_pct: 6,
      tp_strategy: "back_loaded",
      sl_to_breakeven_after: "tp2",
      risk_filter: "all",
      min_volume_rank: 60,
      trailing_stop_enabled: true,
      trailing_stop_type: "fixed_usdt",
      trailing_stop_value: 8,
      trailing_activation: "immediate",
      trailing_update_interval: 20,
      anti_liq_enabled: false,
      anti_liq_buffer_pct: 1.5,
      cooldown_minutes: 5,
      signal_expiry_minutes: 8,
    },
  },
];

const MARKET_TYPES = [
  { value: "spot", label: "Spot" },
  { value: "futures", label: "Futures" },
];

const MARGIN_MODES = [
  { value: "isolated", label: "Isolated" },
  { value: "cross", label: "Cross" },
];

const TP_STRATEGIES = [
  { value: "equal_split", label: "Equal Split" },
  { value: "front_loaded", label: "Front Loaded" },
  { value: "back_loaded", label: "Back Loaded" },
  { value: "tp1_only", label: "TP1 Only" },
  { value: "custom", label: "Custom" },
];

const RISK_FILTERS = [
  { value: "all", label: "All signals" },
  { value: "low_medium", label: "Low + Medium" },
  { value: "low_only", label: "Low only" },
];

const TRAILING_TYPES = [
  { value: "percent", label: "Percent" },
  { value: "fixed_usdt", label: "Fixed USDT" },
];

const TRAILING_ACTIVATION = [
  { value: "immediate", label: "Immediate" },
  { value: "breakeven", label: "After breakeven" },
  { value: "after_tp1", label: "After TP1" },
];

const StepHeader = ({ index, title, description }) => (
  <div className="mb-4">
    <div className="flex items-center gap-3 mb-1.5">
      <span className="h-px w-6 bg-gold-primary/40" />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/75">
        {String(index).padStart(2, "0")}
      </span>
      <span className="h-px w-3 bg-white/[0.08]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/85">
        {title}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
    </div>
    {description && (
      <p className="text-[11px] font-mono text-text-muted/70 ml-9">
        {description}
      </p>
    )}
  </div>
);

const FieldLabel = ({ label, value, suffix = "" }) => (
  <label className="flex items-center justify-between gap-4 mb-1.5">
    <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted">
      {label}
    </span>
    <span className="text-[11px] font-mono text-gold-primary tabular-nums">
      {value}
      {suffix}
    </span>
  </label>
);

const Toggle = ({ label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white font-medium">{label}</p>
      {hint && (
        <p className="text-[10px] font-mono text-text-muted/70 mt-0.5 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-10 h-5 rounded-full transition-colors border ${
        checked
          ? "bg-gold-primary/80 border-gold-primary"
          : "bg-white/[0.04] border-white/[0.08]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
          checked
            ? "translate-x-[20px] bg-[#0a0805]"
            : "translate-x-0.5 bg-white/40"
        }`}
      />
    </button>
  </div>
);

const NumberField = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
}) => (
  <div className="py-2">
    <FieldLabel label={label} value={value ?? "—"} suffix={suffix} />
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
      min={min}
      max={max}
      step={step}
      className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-white font-mono tabular-nums focus:outline-none focus:border-gold-primary/40 transition-colors"
    />
    {hint && (
      <p className="text-[10px] font-mono text-text-muted/60 mt-1.5 leading-relaxed">
        {hint}
      </p>
    )}
  </div>
);

const SelectField = ({ label, value, onChange, options, hint }) => (
  <div className="py-2">
    <label className="block text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted mb-1.5">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-white font-mono focus:outline-none focus:border-gold-primary/40 transition-colors cursor-pointer"
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          className="bg-[#0a0805] text-white"
        >
          {opt.label}
        </option>
      ))}
    </select>
    {hint && (
      <p className="text-[10px] font-mono text-text-muted/60 mt-1.5 leading-relaxed">
        {hint}
      </p>
    )}
  </div>
);

const DUMMY_CONNECTIONS = [
  {
    exchange_id: "binance",
    label: "Primary Futures",
    mode: "futures",
    status: "active",
  },
  {
    exchange_id: "bybit",
    label: "Momentum Spot",
    mode: "spot",
    status: "paused",
  },
  {
    exchange_id: "okx",
    label: "Hedge Wallet",
    mode: "futures",
    status: "watch",
  },
];

export default function ConfigurationStudio({
  accounts = [],
  selectedAccountId,
  onSelectAccount,
}) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [draft, setDraft] = useState(PRESETS[0].config);
  const [savedAt, setSavedAt] = useState(null);
  const [notes, setNotes] = useState(
    "Demo account uses signal-based execution with conservative defaults.",
  );

  const activePreset = useMemo(
    () => PRESETS.find((preset) => preset.id === presetId) || PRESETS[0],
    [presetId],
  );
  const selectedAccount =
    accounts.find(
      (account) => String(account.id) === String(selectedAccountId),
    ) || null;
  const activeConnections = accounts.length > 0 ? accounts : DUMMY_CONNECTIONS;

  const applyPreset = (preset) => {
    setPresetId(preset.id);
    setDraft(preset.config);
    setSavedAt(null);
  };

  const patch = (changes) => {
    setDraft((current) => ({ ...current, ...changes }));
    setSavedAt(null);
  };

  const handleReset = () => {
    setPresetId(PRESETS[0].id);
    setDraft(PRESETS[0].config);
    setNotes(
      "Demo account uses signal-based execution with conservative defaults.",
    );
    setSavedAt(null);
  };

  const handleSave = () => {
    setSavedAt(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
  };

  const targetLabel = selectedAccount
    ? `${selectedAccount.exchange_id} · ${selectedAccount.label || "Unnamed"}`
    : "Demo profile";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/35 to-transparent" />

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gold-primary/10 border border-gold-primary/20 text-[10px] font-mono uppercase tracking-[0.18em] text-gold-primary">
                  Demo mode
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                  {selectedAccount ? "Focused account" : "No exchange selected"}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                Configuration Studio
              </h2>
              <p className="text-text-muted text-sm mt-1.5 font-mono">
                Configure execution, risk and trailing rules for {targetLabel}{" "}
                using local dummy data.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-md border border-white/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-white hover:border-white/[0.15] transition-all"
              >
                Reset demo
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="group px-4 py-2 rounded-md font-mono text-[10px] uppercase tracking-[0.2em] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
                style={{
                  background:
                    "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                  color: "#0a0506",
                }}
              >
                Save draft
              </button>
            </div>
          </div>

          {savedAt && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[11px] font-mono text-emerald-400">
              Demo settings saved locally at {savedAt}.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PRESETS.map((preset) => {
                  const active = preset.id === presetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`relative overflow-hidden rounded-md border p-4 text-left transition-all ${
                        active
                          ? "border-gold-primary/35 bg-gold-primary/[0.08]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                      }`}
                    >
                      <div
                        className={`absolute top-0 inset-x-0 h-px ${active ? "bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" : "bg-gradient-to-r from-transparent via-white/0 to-transparent"}`}
                      />
                      <p className="text-white font-semibold text-sm">
                        {preset.label}
                      </p>
                      <p className="text-[10px] font-mono text-text-muted/70 mt-1 leading-relaxed">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <StepHeader
                index={1}
                title="Execution"
                description="Main profile settings and exchange selection"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField
                  label="Target exchange"
                  value={selectedAccountId || "demo"}
                  onChange={(value) =>
                    onSelectAccount(value === "demo" ? "" : value)
                  }
                  options={[
                    { value: "demo", label: "Demo profile" },
                    ...activeConnections.map((account) => ({
                      value: String(account.id || account.exchange_id),
                      label: `${account.exchange_id} · ${account.label || account.mode || "Unnamed"}`,
                    })),
                  ]}
                />
                <SelectField
                  label="Market type"
                  value={draft.default_market_type}
                  onChange={(value) => patch({ default_market_type: value })}
                  options={MARKET_TYPES}
                />
                <SelectField
                  label="Margin mode"
                  value={draft.margin_mode}
                  onChange={(value) => patch({ margin_mode: value })}
                  options={MARGIN_MODES}
                />
                <SelectField
                  label="TP strategy"
                  value={draft.tp_strategy}
                  onChange={(value) => patch({ tp_strategy: value })}
                  options={TP_STRATEGIES}
                />
                <NumberField
                  label="Max position size"
                  value={draft.max_position_pct}
                  onChange={(value) => patch({ max_position_pct: value })}
                  min={0.1}
                  max={100}
                  step={0.5}
                  suffix="%"
                  hint="Maximum percentage of free balance used per trade"
                />
                <NumberField
                  label="Max leverage"
                  value={draft.max_leverage}
                  onChange={(value) => patch({ max_leverage: value })}
                  min={1}
                  max={125}
                  suffix="x"
                />
                <NumberField
                  label="Concurrent trades"
                  value={draft.max_concurrent_trades}
                  onChange={(value) => patch({ max_concurrent_trades: value })}
                  min={1}
                  max={25}
                />
                <NumberField
                  label="Daily loss limit"
                  value={draft.daily_loss_limit_pct}
                  onChange={(value) => patch({ daily_loss_limit_pct: value })}
                  min={0.5}
                  max={100}
                  step={0.5}
                  suffix="%"
                />
              </div>

              <StepHeader
                index={2}
                title="Risk Controls"
                description="Filters, cooldowns and execution guard rails"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField
                  label="Risk filter"
                  value={draft.risk_filter}
                  onChange={(value) => patch({ risk_filter: value })}
                  options={RISK_FILTERS}
                />
                <NumberField
                  label="Min volume rank"
                  value={draft.min_volume_rank}
                  onChange={(value) => patch({ min_volume_rank: value })}
                  min={0}
                  max={1000}
                  hint="0 means no minimum rank filter"
                />
                <NumberField
                  label="Signal expiry"
                  value={draft.signal_expiry_minutes}
                  onChange={(value) => patch({ signal_expiry_minutes: value })}
                  min={1}
                  max={240}
                  suffix=" min"
                />
                <NumberField
                  label="Cooldown"
                  value={draft.cooldown_minutes}
                  onChange={(value) => patch({ cooldown_minutes: value })}
                  min={0}
                  max={480}
                  suffix=" min"
                />
              </div>

              <Toggle
                label="AutoTrade enabled"
                hint="Master switch for the demo configuration"
                checked={draft.enabled}
                onChange={(value) => patch({ enabled: value })}
              />
              <Toggle
                label="Anti-liquidity guard"
                hint="Keeps a margin buffer around liquidation risk"
                checked={draft.anti_liq_enabled}
                onChange={(value) => patch({ anti_liq_enabled: value })}
              />
              {draft.anti_liq_enabled && (
                <div className="pl-4 border-l border-gold-primary/15">
                  <NumberField
                    label="Buffer"
                    value={draft.anti_liq_buffer_pct}
                    onChange={(value) => patch({ anti_liq_buffer_pct: value })}
                    min={0.5}
                    max={20}
                    step={0.1}
                    suffix="%"
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <StepHeader
                index={3}
                title="Trailing"
                description="Dynamic stop loss controls"
              />

              <Toggle
                label="Trailing stop"
                hint="Automatically tightens stops as profit develops"
                checked={draft.trailing_stop_enabled}
                onChange={(value) => patch({ trailing_stop_enabled: value })}
              />
              {draft.trailing_stop_enabled && (
                <div className="space-y-1.5 pl-4 border-l border-gold-primary/15">
                  <SelectField
                    label="Trailing type"
                    value={draft.trailing_stop_type}
                    onChange={(value) => patch({ trailing_stop_type: value })}
                    options={TRAILING_TYPES}
                  />
                  <NumberField
                    label="Trailing value"
                    value={draft.trailing_stop_value}
                    onChange={(value) => patch({ trailing_stop_value: value })}
                    min={0.1}
                    max={50}
                    step={0.1}
                    suffix={
                      draft.trailing_stop_type === "percent" ? "%" : " USDT"
                    }
                  />
                  <SelectField
                    label="Activation"
                    value={draft.trailing_activation}
                    onChange={(value) => patch({ trailing_activation: value })}
                    options={TRAILING_ACTIVATION}
                  />
                  <NumberField
                    label="Update interval"
                    value={draft.trailing_update_interval}
                    onChange={(value) =>
                      patch({ trailing_update_interval: value })
                    }
                    min={5}
                    max={300}
                    suffix=" s"
                  />
                </div>
              )}

              <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">
                  Active profile preview
                </p>
                <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                  <div className="rounded-md border border-white/[0.05] bg-black/20 p-2.5">
                    <p className="text-text-muted/60 uppercase tracking-[0.15em] text-[9px] mb-1">
                      Preset
                    </p>
                    <p className="text-white">{activePreset.label}</p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-black/20 p-2.5">
                    <p className="text-text-muted/60 uppercase tracking-[0.15em] text-[9px] mb-1">
                      Mode
                    </p>
                    <p className="text-white capitalize">
                      {draft.default_market_type}
                    </p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-black/20 p-2.5">
                    <p className="text-text-muted/60 uppercase tracking-[0.15em] text-[9px] mb-1">
                      Risk filter
                    </p>
                    <p className="text-white capitalize">
                      {draft.risk_filter.replace("_", " ")}
                    </p>
                  </div>
                  <div className="rounded-md border border-white/[0.05] bg-black/20 p-2.5">
                    <p className="text-text-muted/60 uppercase tracking-[0.15em] text-[9px] mb-1">
                      Trailing
                    </p>
                    <p className="text-white">
                      {draft.trailing_stop_enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </div>
                <div className="rounded-md border border-gold-primary/15 bg-gold-primary/[0.03] p-3.5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gold-primary/70 mb-1">
                    Notes
                  </p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full resize-none bg-transparent text-sm text-white/90 focus:outline-none placeholder:text-text-muted/40"
                    placeholder="Write a short note for the demo config"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <MetricCard
                  label="Position cap"
                  value={`${draft.max_position_pct}%`}
                />
                <MetricCard label="Leverage" value={`${draft.max_leverage}x`} />
                <MetricCard
                  label="Drawdown"
                  value={`${draft.daily_loss_limit_pct}%`}
                />
              </div>

              <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted mb-3">
                  Connected exchanges
                </p>
                <div className="space-y-2">
                  {activeConnections.map((account) => {
                    const accountId = String(account.id || account.exchange_id);
                    const selected =
                      String(selectedAccountId || "") === accountId;
                    return (
                      <button
                        key={accountId}
                        type="button"
                        onClick={() =>
                          onSelectAccount(selected ? "" : accountId)
                        }
                        className={`w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-all ${
                          selected
                            ? "border-gold-primary/35 bg-gold-primary/[0.07]"
                            : "border-white/[0.06] bg-black/10 hover:border-white/[0.12]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white capitalize truncate">
                            {account.exchange_id}
                            <span className="text-text-muted/50 mx-1.5">·</span>
                            <span className="text-text-muted font-mono text-[11px]">
                              {account.label || account.mode || "Unnamed"}
                            </span>
                          </p>
                          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 mt-1">
                            {account.mode || account.trading_mode || "futures"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[9px] font-mono uppercase tracking-[0.18em] px-2 py-1 rounded border ${
                            selected
                              ? "bg-gold-primary/10 text-gold-primary border-gold-primary/25"
                              : "bg-white/[0.03] text-text-muted border-white/[0.06]"
                          }`}
                        >
                          {selected ? "Selected" : "Use"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MetricCard = ({ label, value }) => (
  <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
    <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60 mb-1">
      {label}
    </p>
    <p className="text-white font-mono text-sm tabular-nums">{value}</p>
  </div>
);
