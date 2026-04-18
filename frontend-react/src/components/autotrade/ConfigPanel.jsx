// src/components/autotrade/ConfigPanel.jsx
import { useState, useEffect } from "react";
import { getConfig, updateConfig } from "../../services/autotradeApi";

// Reusable sub-components
const SectionHeader = ({ title, subtitle }) => (
  <div className="mb-4">
    <h3 className="text-sm font-display font-bold text-white">{title}</h3>
    {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
  </div>
);

const Toggle = ({ label, hint, checked, onChange, disabled }) => (
  <label className={`flex items-center justify-between py-2.5 cursor-pointer ${disabled ? "opacity-50" : ""}`}>
    <div>
      <p className="text-sm font-medium text-white">{label}</p>
      {hint && <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${
        checked ? "bg-green-500" : "bg-white/10"
      }`}
      style={{ height: "22px" }}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  </label>
);

const NumberField = ({ label, value, onChange, min, max, step = 1, suffix = "", hint }) => (
  <div className="py-2">
    <label className="flex justify-between items-baseline mb-1.5">
      <span className="text-sm text-white">{label}</span>
      <span className="text-xs text-gold-primary font-mono">{value}{suffix}</span>
    </label>
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-full px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:border-gold-primary/30"
    />
    {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
  </div>
);

const SelectField = ({ label, value, onChange, options, hint }) => (
  <div className="py-2">
    <label className="block text-sm text-white mb-1.5">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:border-gold-primary/30"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
  </div>
);

export default function ConfigPanel({ account, onClose }) {
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!account) return;
    getConfig(account.id)
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [account?.id]);

  const update = (patch) => {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const r = await updateConfig(account.id, config);
      setConfig(r);
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!account) return null;

  if (!config) {
    return (
      <div className="bg-bg-card border border-white/5 rounded-2xl p-8 text-center">
        <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-2" />
        <p className="text-text-muted text-sm">Loading config…</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-white/5 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-bg-card/95 backdrop-blur z-10">
        <div>
          <h2 className="text-lg font-display font-bold text-white">
            Configure {account.exchange_id.toUpperCase()}
          </h2>
          <p className="text-xs text-text-muted">{account.label}</p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <span className="text-xs text-yellow-400 self-center">Unsaved changes</span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-text-secondary hover:bg-white/5"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
            style={{
              background: "linear-gradient(to right, #d4a853, #8b6914)",
              color: "#0a0506",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Master toggle */}
        <div className="bg-gradient-to-br from-gold-primary/5 to-transparent border border-gold-primary/10 rounded-xl p-4">
          <Toggle
            label="AutoTrade Enabled"
            hint="Master switch. Turn off to pause execution without deleting config."
            checked={config.enabled}
            onChange={(v) => update({ enabled: v })}
          />
        </div>

        {/* Position sizing */}
        <section>
          <SectionHeader title="Position Sizing & Risk" />
          <div className="space-y-1">
            <SelectField
              label="Default Market Type"
              value={config.default_market_type}
              onChange={(v) => update({ default_market_type: v })}
              options={[
                { value: "spot", label: "Spot" },
                { value: "futures", label: "Futures" },
              ]}
              hint="Which market type to use when signal arrives"
            />
            <NumberField
              label="Max Position Size"
              value={config.max_position_pct}
              onChange={(v) => update({ max_position_pct: v })}
              min={0.1} max={100} step={0.5} suffix="%"
              hint="Max % of free balance per trade"
            />
            <NumberField
              label="Max Leverage"
              value={config.max_leverage}
              onChange={(v) => update({ max_leverage: v })}
              min={1} max={125} suffix="x"
              hint="Leverage cap for futures"
            />
            <NumberField
              label="Max Concurrent Trades"
              value={config.max_concurrent_trades}
              onChange={(v) => update({ max_concurrent_trades: v })}
              min={1} max={50}
            />
            <NumberField
              label="Daily Loss Limit"
              value={config.daily_loss_limit_pct}
              onChange={(v) => update({ daily_loss_limit_pct: v })}
              min={0.5} max={100} step={0.5} suffix="%"
              hint="Auto-pause if today's loss exceeds this %"
            />
            <SelectField
              label="Margin Mode"
              value={config.margin_mode}
              onChange={(v) => update({ margin_mode: v })}
              options={[
                { value: "isolated", label: "Isolated (recommended)" },
                { value: "cross", label: "Cross" },
              ]}
            />
          </div>
        </section>

        {/* TP strategy */}
        <section>
          <SectionHeader title="Take Profit Strategy" subtitle="How to split qty across TP1-TP4" />
          <SelectField
            label="TP Strategy"
            value={config.tp_strategy}
            onChange={(v) => update({ tp_strategy: v })}
            options={[
              { value: "equal_split", label: "Equal Split (25/25/25/25)" },
              { value: "front_loaded", label: "Front Loaded (40/30/20/10)" },
              { value: "back_loaded", label: "Back Loaded (10/20/30/40)" },
              { value: "tp1_only", label: "TP1 Only (exit all at TP1)" },
              { value: "custom", label: "Custom" },
            ]}
          />
          <SelectField
            label="Move SL to Breakeven"
            value={config.sl_to_breakeven_after}
            onChange={(v) => update({ sl_to_breakeven_after: v })}
            options={[
              { value: "tp1", label: "After TP1 hit (recommended)" },
              { value: "tp2", label: "After TP2 hit" },
              { value: "never", label: "Never" },
            ]}
            hint="Auto-move stop loss to entry price after target TP"
          />
        </section>

        {/* Signal filters */}
        <section>
          <SectionHeader title="Signal Filters" subtitle="Which signals to accept for execution" />
          <SelectField
            label="Risk Filter"
            value={config.risk_filter}
            onChange={(v) => update({ risk_filter: v })}
            options={[
              { value: "all", label: "All signals" },
              { value: "low_medium", label: "Low + Medium only (no High)" },
              { value: "low_only", label: "Low risk only (most conservative)" },
            ]}
          />
          <NumberField
            label="Min Volume Rank"
            value={config.min_volume_rank}
            onChange={(v) => update({ min_volume_rank: v })}
            min={0} max={1000}
            hint="Skip signals below this volume rank (0 = no filter)"
          />
        </section>

        {/* Trailing stop */}
        <section>
          <SectionHeader title="Trailing Stop" subtitle="Auto-move SL in favor of profit" />
          <Toggle
            label="Enable Trailing Stop"
            hint="Automatically tightens SL as price moves in your favor"
            checked={config.trailing_stop_enabled}
            onChange={(v) => update({ trailing_stop_enabled: v })}
          />
          {config.trailing_stop_enabled && (
            <div className="mt-2 pl-3 border-l-2 border-gold-primary/20 space-y-1">
              <SelectField
                label="Trailing Type"
                value={config.trailing_stop_type}
                onChange={(v) => update({ trailing_stop_type: v })}
                options={[
                  { value: "percent", label: "Percentage" },
                  { value: "fixed_usdt", label: "Fixed USDT" },
                ]}
              />
              <NumberField
                label="Trailing Value"
                value={Number(config.trailing_stop_value)}
                onChange={(v) => update({ trailing_stop_value: v })}
                min={0.1} max={50} step={0.1}
                suffix={config.trailing_stop_type === "percent" ? "%" : " USDT"}
                hint="Distance from peak price"
              />
              <SelectField
                label="Activation"
                value={config.trailing_activation}
                onChange={(v) => update({ trailing_activation: v })}
                options={[
                  { value: "immediate", label: "Immediate (from entry)" },
                  { value: "breakeven", label: "After breakeven (recommended)" },
                  { value: "after_tp1", label: "After TP1 hit" },
                ]}
              />
              <NumberField
                label="Update Interval"
                value={config.trailing_update_interval}
                onChange={(v) => update({ trailing_update_interval: v })}
                min={5} max={300} suffix="s"
                hint="How often to check & update SL"
              />
            </div>
          )}
        </section>

        {/* Max loss protection */}
        <section>
          <SectionHeader title="Max Loss Protection" subtitle="Hard cap on loss per trade" />
          <Toggle
            label="Enable Max Loss Protection"
            hint="Size qty so loss at SL ≤ max_loss_per_trade_pct of balance"
            checked={config.max_loss_protection_enabled}
            onChange={(v) => update({ max_loss_protection_enabled: v })}
          />
          {config.max_loss_protection_enabled && (
            <div className="mt-2 pl-3 border-l-2 border-gold-primary/20 space-y-1">
              <NumberField
                label="Max Loss Per Trade"
                value={Number(config.max_loss_per_trade_pct)}
                onChange={(v) => update({ max_loss_per_trade_pct: v })}
                min={0.1} max={50} step={0.1} suffix="%"
              />
              <NumberField
                label="Emergency Close Trigger"
                value={Number(config.emergency_close_trigger_pct)}
                onChange={(v) => update({ emergency_close_trigger_pct: v })}
                min={0.1} max={50} step={0.1} suffix="%"
                hint="Auto-close if unrealized loss exceeds this"
              />
            </div>
          )}
        </section>

        {/* Anti-liquidation (futures only) */}
        <section>
          <SectionHeader title="Anti-Liquidation" subtitle="Futures margin protection" />
          <NumberField
            label="Liquidation Buffer"
            value={Number(config.liquidation_buffer_pct)}
            onChange={(v) => update({ liquidation_buffer_pct: v })}
            min={100} max={500} suffix="%"
            hint="Trigger emergency action when margin ratio drops below this"
          />
          <NumberField
            label="Warning Threshold"
            value={Number(config.liquidation_warning_pct)}
            onChange={(v) => update({ liquidation_warning_pct: v })}
            min={100} max={500} suffix="%"
            hint="Send warning (must be > buffer)"
          />
          <SelectField
            label="Emergency Action"
            value={config.emergency_action}
            onChange={(v) => update({ emergency_action: v })}
            options={[
              { value: "partial_close", label: "Partial Close (40%)" },
              { value: "tighten_sl", label: "Tighten SL" },
              { value: "full_close", label: "Full Close" },
              { value: "add_margin", label: "Add Margin (top-up)" },
            ]}
          />
          <Toggle
            label="Auto Top-up Margin"
            hint="Add margin from free balance to prevent liquidation"
            checked={config.auto_topup_margin}
            onChange={(v) => update({ auto_topup_margin: v })}
          />
          {config.auto_topup_margin && (
            <NumberField
              label="Max Top-up"
              value={Number(config.auto_topup_max_pct)}
              onChange={(v) => update({ auto_topup_max_pct: v })}
              min={0} max={100} suffix="%"
              hint="Max % of initial margin to top up"
            />
          )}
        </section>

        {/* Save button bottom */}
        <div className="sticky bottom-0 -mx-5 -mb-5 p-5 bg-bg-card/95 backdrop-blur border-t border-white/5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-text-secondary text-sm font-semibold"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{
              background: "linear-gradient(to right, #d4a853, #8b6914)",
              color: "#0a0506",
            }}
          >
            {saving ? "Saving…" : dirty ? "Save Changes" : "No Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
