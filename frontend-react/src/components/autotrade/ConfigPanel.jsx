// src/components/autotrade/ConfigPanel.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Config Panel v2 (Flowscan reskin)
// Sections: Position · TP Strategy · Filters · Trailing · Max Loss · Anti-Liq
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { getConfig, updateConfig } from "../../services/autotradeApi";

// ════════════════════════════════════════════════════════════════
// SECTION LABEL — matches sitewide reskin pattern
// ════════════════════════════════════════════════════════════════
const SectionLabel = ({ children, subtitle, step }) => (
  <div className="mb-4">
    <div className="flex items-center gap-3 mb-1.5">
      <span className="h-px w-6 bg-accent/40" />
      {step && (
        <>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-muted">
            {step}
          </span>
          <span className="h-px w-3 bg-ink/[0.08]" />
        </>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        {children}
      </span>
    </div>
    {subtitle && <p className="text-[11px] font-mono text-text-muted/70 ml-9">{subtitle}</p>}
  </div>
);

// ════════════════════════════════════════════════════════════════
// FORM PRIMITIVES
// ════════════════════════════════════════════════════════════════
const Toggle = ({ label, hint, checked, onChange, disabled }) => (
  <div className={`flex items-center justify-between gap-4 py-2.5 ${disabled ? "opacity-50" : ""}`}>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-text-primary font-medium">{label}</p>
      {hint && (
        <p className="text-[10px] font-mono text-text-muted/70 mt-0.5 leading-relaxed">{hint}</p>
      )}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-10 h-5 rounded-full transition-colors border ${
        checked ? "bg-accent/80 border-accent" : "bg-ink/[0.04] border-ink/[0.08]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
          checked ? "translate-x-[20px] bg-surface-raised" : "translate-x-0.5 bg-ink/40"
        }`}
      />
    </button>
  </div>
);

const NumberField = ({ label, value, onChange, min, max, step = 1, suffix = "", hint }) => (
  <div className="py-2">
    <label className="flex justify-between items-baseline mb-1.5">
      <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted">
        {label}
      </span>
      <span className="text-[11px] font-mono text-accent tabular-nums">
        {value ?? "—"}
        {suffix}
      </span>
    </label>
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-full px-3 py-2 bg-ink/[0.02] border border-ink/[0.06] rounded-md text-sm text-text-primary font-mono tabular-nums focus:outline-none focus:border-ink/15 transition-colors"
    />
    {hint && (
      <p className="text-[10px] font-mono text-text-muted/60 mt-1.5 leading-relaxed">{hint}</p>
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
      className="w-full px-3 py-2 bg-ink/[0.02] border border-ink/[0.06] rounded-md text-sm text-text-primary font-mono focus:outline-none focus:border-ink/15 transition-colors cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-surface-raised text-text-primary">
          {opt.label}
        </option>
      ))}
    </select>
    {hint && (
      <p className="text-[10px] font-mono text-text-muted/60 mt-1.5 leading-relaxed">{hint}</p>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════
// NESTED FIELDS WRAPPER (indented when toggle is enabled)
// ════════════════════════════════════════════════════════════════
const NestedFields = ({ children }) => (
  <div className="mt-2 ml-1 pl-4 border-l border-ink/10 space-y-1">{children}</div>
);

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
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

  // ── Loading ──
  if (!config) {
    return (
      <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-12 text-center">
        <div className="w-8 h-8 border-2 border-ink/10 border-t-accent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-text-muted text-[11px] font-mono uppercase tracking-[0.15em]">
          Loading config…
        </p>
      </div>
    );
  }

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md">
      {/* Top hairline */}

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-20 bg-surface-raised/95 backdrop-blur border-b border-ink/[0.06] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary tracking-tight capitalize">
              Configure {account.exchange_id}
            </h2>
            <p className="text-[11px] font-mono text-text-muted/80 mt-0.5">
              {account.label || "Unnamed"}
              {account.is_testnet && (
                <span className="ml-2 text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border bg-negative/10 text-loss border-negative/25">
                  Testnet
                </span>
              )}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {dirty && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Unsaved
              </span>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-md border border-ink/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-text-primary hover:border-ink/[0.15] transition-all"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={`group rounded-lg px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                dirty && !saving
                  ? "bg-accent text-accent-fg hover:opacity-90"
                  : "border border-ink/[0.08] bg-ink/[0.04] text-text-muted/50"
              }`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY (scrollable, max 70vh) ── */}
      <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
        {/* Error */}
        {error && (
          <div className="relative overflow-hidden bg-negative/[0.05] border border-negative/25 rounded-md p-3">
            <p className="text-[11px] font-mono text-loss leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Master toggle ── */}
        <div className="relative overflow-hidden bg-surface-secondary border border-ink/10 rounded-md p-4">
          <Toggle
            label="AutoTrade Enabled"
            hint="Master switch · turn off to pause execution without deleting config"
            checked={config.enabled}
            onChange={(v) => update({ enabled: v })}
          />
        </div>

        {/* ── Section 01: Position Sizing & Risk ── */}
        <section>
          <SectionLabel step="01" subtitle="Position size, leverage, daily loss cap">
            Position &amp; Risk
          </SectionLabel>
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
              min={0.1}
              max={100}
              step={0.5}
              suffix="%"
              hint="Max % of free balance per trade"
            />
            <NumberField
              label="Max Leverage"
              value={config.max_leverage}
              onChange={(v) => update({ max_leverage: v })}
              min={1}
              max={125}
              suffix="×"
              hint="Leverage cap for futures"
            />
            <NumberField
              label="Max Concurrent Trades"
              value={config.max_concurrent_trades}
              onChange={(v) => update({ max_concurrent_trades: v })}
              min={1}
              max={50}
            />
            <NumberField
              label="Daily Loss Limit"
              value={config.daily_loss_limit_pct}
              onChange={(v) => update({ daily_loss_limit_pct: v })}
              min={0.5}
              max={100}
              step={0.5}
              suffix="%"
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

        {/* ── Section 02: TP Strategy ── */}
        <section>
          <SectionLabel step="02" subtitle="How to split qty across TP1–TP4">
            Take Profit Strategy
          </SectionLabel>
          <SelectField
            label="TP Strategy"
            value={config.tp_strategy}
            onChange={(v) => update({ tp_strategy: v })}
            options={[
              { value: "equal_split", label: "Equal Split — 25/25/25/25" },
              { value: "front_loaded", label: "Front Loaded — 40/30/20/10" },
              { value: "back_loaded", label: "Back Loaded — 10/20/30/40" },
              { value: "tp1_only", label: "TP1 Only — exit all at TP1" },
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

        {/* ── Section 03: Signal Filters ── */}
        <section>
          <SectionLabel step="03" subtitle="Which signals to accept for execution">
            Signal Filters
          </SectionLabel>
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
            min={0}
            max={1000}
            hint="Skip signals below this volume rank · 0 = no filter"
          />
        </section>

        {/* ── Section 04: Trailing Stop ── */}
        <section>
          <SectionLabel step="04" subtitle="Auto-move SL in favor of profit">
            Trailing Stop
          </SectionLabel>
          <Toggle
            label="Enable Trailing Stop"
            hint="Automatically tightens SL as price moves in your favor"
            checked={config.trailing_stop_enabled}
            onChange={(v) => update({ trailing_stop_enabled: v })}
          />
          {config.trailing_stop_enabled && (
            <NestedFields>
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
                min={0.1}
                max={50}
                step={0.1}
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
                min={5}
                max={300}
                suffix="s"
                hint="How often to check &amp; update SL"
              />
            </NestedFields>
          )}
        </section>

        {/* ── Section 05: Max Loss Protection ── */}
        <section>
          <SectionLabel step="05" subtitle="Hard cap on loss per trade">
            Max Loss Protection
          </SectionLabel>
          <Toggle
            label="Enable Max Loss Protection"
            hint="Size qty so loss at SL ≤ max_loss_per_trade_pct of balance"
            checked={config.max_loss_protection_enabled}
            onChange={(v) => update({ max_loss_protection_enabled: v })}
          />
          {config.max_loss_protection_enabled && (
            <NestedFields>
              <NumberField
                label="Max Loss Per Trade"
                value={Number(config.max_loss_per_trade_pct)}
                onChange={(v) => update({ max_loss_per_trade_pct: v })}
                min={0.1}
                max={50}
                step={0.1}
                suffix="%"
              />
              <NumberField
                label="Emergency Close Trigger"
                value={Number(config.emergency_close_trigger_pct)}
                onChange={(v) => update({ emergency_close_trigger_pct: v })}
                min={0.1}
                max={50}
                step={0.1}
                suffix="%"
                hint="Auto-close if unrealized loss exceeds this"
              />
            </NestedFields>
          )}
        </section>

        {/* ── Section 06: Anti-Liquidation ── */}
        <section>
          <SectionLabel step="06" subtitle="Futures margin protection">
            Anti-Liquidation
          </SectionLabel>
          <NumberField
            label="Liquidation Buffer"
            value={Number(config.liquidation_buffer_pct)}
            onChange={(v) => update({ liquidation_buffer_pct: v })}
            min={100}
            max={500}
            suffix="%"
            hint="Trigger emergency action when margin ratio drops below this"
          />
          <NumberField
            label="Warning Threshold"
            value={Number(config.liquidation_warning_pct)}
            onChange={(v) => update({ liquidation_warning_pct: v })}
            min={100}
            max={500}
            suffix="%"
            hint="Send warning · must be greater than buffer"
          />
          <SelectField
            label="Emergency Action"
            value={config.emergency_action}
            onChange={(v) => update({ emergency_action: v })}
            options={[
              { value: "partial_close", label: "Partial Close — 40%" },
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
            <NestedFields>
              <NumberField
                label="Max Top-up"
                value={Number(config.auto_topup_max_pct)}
                onChange={(v) => update({ auto_topup_max_pct: v })}
                min={0}
                max={100}
                suffix="%"
                hint="Max % of initial margin to top up"
              />
            </NestedFields>
          )}
        </section>

        {/* ── STICKY FOOTER ── */}
        <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-surface-raised/95 backdrop-blur border-t border-ink/[0.06] flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-md border border-ink/[0.08] text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-text-primary hover:border-ink/[0.15] transition-all"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`group flex-1 rounded-lg px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
              dirty && !saving
                ? "bg-accent text-accent-fg hover:opacity-90"
                : "border border-ink/[0.08] bg-ink/[0.04] text-text-muted/50"
            }`}
          >
            {saving ? (
              "Saving…"
            ) : dirty ? (
              <span className="inline-flex items-center gap-2">
                Save Changes
                <span className="inline-block transition-transform group-enabled:group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            ) : (
              "No Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
