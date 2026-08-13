// src/components/autotrade/ConfigurationStudio.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Agent · Configure tab
// Execution rules for the Binance strategy. Redesigned into clean
// full-width section cards (internal responsive grids keep them wide
// and short, not narrow and tall), with brighter section titles and
// field labels. Payload/behaviour unchanged — visual + structure only.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { updateStrategyConfig } from "../../services/autotradeApi";
import { FIELD_GUIDE, ENGINE_RULES, MIN_LIVE_ENTRY_USDT } from "./autotradeFieldGuide";
import LiveRiskAckModal from "./LiveRiskAckModal";
import { useUiPrefs } from "../../hooks/useUiPrefs";
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
const LEVEL_OPTIONS = [1, 2, 3, 4].map((n) => ({ value: n, label: `TP${n}` }));
const SL_LEVEL_OPTIONS = [1, 2].map((n) => ({ value: n, label: `SL${n}` }));

// ── Local presentation helpers (brighter than the shared dim variants) ──
function SectionTitle({ children, hint }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-1 rounded-full bg-accent" />
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
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

// ── Per-field guidance ──────────────────────────────────────────
// Every setting can explain itself: what it does, a worked example with
// real numbers, and the behaviour that is real but invisible in the UI.
// Collapsed by default so the page stays scannable.
function ExplainPanel({ guide }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-accent/20 bg-accent/[0.04] px-3 py-2.5">
      <p className="text-[11px] leading-[1.5] text-text-secondary">{guide.what}</p>
      <p className="text-[11px] leading-[1.5] text-text-muted">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          Example
        </span>
        <br />
        {guide.example}
      </p>
      {guide.watch ? (
        <p className="text-[11px] leading-[1.5] text-text-muted">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-warn">
            Watch out
          </span>
          <br />
          {guide.watch}
        </p>
      ) : null}
    </div>
  );
}

function ExplainToggle({ open, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} explanation for ${label}`}
      className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition-colors ${
        open
          ? "border-accent bg-accent text-surface-primary"
          : "border-ink/25 text-text-muted hover:border-accent hover:text-accent"
      }`}
    >
      ?
    </button>
  );
}

function Row({ label, hint, guide, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-secondary">
          {label}
        </label>
        {guide ? (
          <ExplainToggle open={open} onClick={() => setOpen((v) => !v)} label={label} />
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-text-muted">{hint}</p> : null}
      {guide && open ? <ExplainPanel guide={guide} /> : null}
    </div>
  );
}

// Toggle renders a <button>, so its explanation cannot nest inside it.
function WithGuide({ guide, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {children}
      <div className="mt-1.5 flex items-center gap-1.5">
        <ExplainToggle open={open} onClick={() => setOpen((v) => !v)} label={guide.title} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted transition-colors hover:text-accent"
        >
          {open ? "Hide" : "Explain"}
        </button>
      </div>
      {open ? <ExplainPanel guide={guide} /> : null}
    </div>
  );
}

// ── Live worked example ─────────────────────────────────────────
// Settings are abstract until you see what they do to one trade. This
// walks the user's own current values through the same order the engine
// applies them in, so a misconfiguration is visible before it costs money.
function WorkedExample({ draft, availableUsdt }) {
  const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
  const isPercent = draft.sizing_method === "percent";
  // The engine sizes percent trades off FREE USDT; dry run substitutes a
  // fixed 1,000 rather than reading the account.
  const balance = draft.dry_run ? 1000 : Number(availableUsdt) || 0;
  const knownBalance = draft.dry_run || Number(availableUsdt) > 0;
  const raw = isPercent ? balance * (Number(draft.sizing_value) || 0) / 100 : Number(draft.sizing_value) || 0;
  const margin = Math.max(MIN_LIVE_ENTRY_USDT, raw);
  const leverage = draft.futures_enabled ? Math.max(1, Number(draft.leverage) || 1) : 1;
  const cap = Number(draft.max_trade_notional_usdt) || 0;
  const reserve = Number(draft.min_available_usdt) || 0;

  const steps = [];
  if (isPercent && !knownBalance) {
    steps.push(["Entry size", `${draft.sizing_value}% of your free USDT — connect an account to preview the amount`]);
  } else {
    steps.push([
      "Entry size",
      isPercent
        ? `${draft.sizing_value}% of ${usd(balance)}${draft.dry_run ? " (dry-run stand-in)" : " free"} = ${usd(raw)}${raw < MIN_LIVE_ENTRY_USDT ? ` → raised to ${usd(margin)} minimum` : ""}`
        : `${usd(margin)} of margin`,
    ]);
  }
  if (draft.futures_enabled) {
    steps.push([
      "Position on futures",
      `${usd(margin)} × ${leverage}× = ${usd(margin * leverage)} of exposure. A 10% coin move is ${usd(margin * leverage * 0.1)} — ${((leverage * 10)).toFixed(0)}% of your margin.`,
    ]);
  }
  if (draft.spot_enabled) {
    steps.push([
      "On spot",
      margin < 10
        ? `${usd(margin)} buys ${usd(margin)} of coin — but the protective stop is a separate order with its own $5 minimum, so the engine may raise this entry (up to ${usd(margin * 2)}) or skip the signal.`
        : `${usd(margin)} buys ${usd(margin)} of coin, with room for the protective stop order.`,
    ]);
  }
  steps.push([
    "Per trade cap",
    cap < margin
      ? `${usd(cap)} is BELOW the ${usd(margin)} entry — every signal will skip as max_trade_notional.`
      : `${usd(cap)} — the ${usd(margin)} entry passes.`,
  ]);
  if (knownBalance && !isPercent) {
    steps.push([
      "Minimum reserve",
      balance - margin < reserve
        ? `${usd(balance)} − ${usd(margin)} = ${usd(balance - margin)}, below the ${usd(reserve)} reserve — this entry would be blocked.`
        : `${usd(balance)} − ${usd(margin)} = ${usd(balance - margin)} left, clearing the ${usd(reserve)} reserve.`,
    ]);
  }
  steps.push([
    "Then",
    `Up to ${draft.max_open_positions} open at once, ${draft.max_daily_trades} entries per day, pausing at ${usd(Number(draft.daily_loss_limit_usdt) || 0)} of realised loss.`,
  ]);

  const broken = steps.some(([, text]) => text.includes("BELOW") || text.includes("blocked"));

  return (
    <Card className={broken ? "border-danger/30" : undefined}>
      <SectionTitle hint="Your current values">What one trade looks like</SectionTitle>
      <ol className="space-y-2.5">
        {steps.map(([label, text]) => (
          <li key={label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <span className="w-full flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent sm:w-40">
              {label}
            </span>
            <span className="text-[12px] leading-5 text-text-secondary">{text}</span>
          </li>
        ))}
      </ol>
      {draft.dry_run ? (
        <p className="mt-4 text-[11px] leading-4 text-text-muted">
          Dry run is on — nothing reaches Binance, and percent sizing is simulated against a
          fixed $1,000 rather than your real balance.
        </p>
      ) : null}
    </Card>
  );
}

function GuardCard({ title, children }) {
  return (
    <div className="rounded-lg border border-ink/[0.07] bg-ink/[0.02] p-4">
      <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
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
    // Default new configs to dry-run until user explicitly enables live.
    dry_run: config?.dry_run !== false ? true : false,

    sizing_method: config?.sizing?.method || "fixed",
    sizing_value: config?.sizing?.value ?? 10,

    tp_level: config?.tp?.level ?? 1,
    sl_level: config?.sl?.level ?? 1,

    exit_mode: config?.exit?.mode || "fixed_sl",
    trailing_callback_rate: config?.exit?.trailing_callback_rate ?? 1,

    leverage: config?.futures?.leverage ?? 1,
    margin_mode: config?.futures?.margin_mode || "isolated",
    leverage_fallback: config?.futures?.leverage_fallback || "clamp",

    allowed_risk_levels: config?.allowed_risk_levels || [],
    one_open_position_per_symbol: config?.risk_limits?.one_open_position_per_symbol ?? true,
    max_open_positions: config?.risk_limits?.max_open_positions ?? 3,
    max_daily_trades: config?.risk_limits?.max_daily_trades ?? 5,
    max_trade_notional_usdt: config?.risk_limits?.max_trade_notional_usdt ?? 50,
    min_available_usdt: config?.risk_limits?.min_available_usdt ?? 5,
    daily_loss_limit_usdt: config?.risk_limits?.daily_loss_limit_usdt ?? 50,
    cooldown_after_loss_minutes: config?.risk_limits?.cooldown_after_loss_minutes ?? 60,
    cooldown_after_error_minutes: config?.risk_limits?.cooldown_after_error_minutes ?? 15,
  };
}

function toPayload(draft) {
  const normalizeNumber = (value) =>
    value === "" || value === null || value === undefined ? null : Number(value);

  return {
    spot_enabled: draft.spot_enabled,
    futures_enabled: draft.futures_enabled,
    is_active: draft.is_active,
    dry_run: Boolean(draft.dry_run),
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
      draft.exit_mode === "trailing_stop" ? normalizeNumber(draft.trailing_callback_rate) : null,
    leverage: draft.futures_enabled ? Number(draft.leverage) : null,
    margin_mode: draft.futures_enabled ? draft.margin_mode : null,
    leverage_fallback: draft.futures_enabled ? draft.leverage_fallback : null,
    allowed_risk_levels: draft.allowed_risk_levels.length > 0 ? draft.allowed_risk_levels : null,
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

export default function ConfigurationStudio({ config, hasConnectedAccount, onSaved, portfolio }) {
  const [draft, setDraft] = useState(() => toDraft(config));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ackOpen, setAckOpen] = useState(false);
  const { prefs, setPref } = useUiPrefs({ agent_live_ack: false });

  useEffect(() => {
    if (!dirty && !saving) {
      setDraft(toDraft(config));
    }
  }, [config, dirty, saving]);

  const venue = config?.exchange || "binance";
  const venueName =
    venue === "okx"
      ? "OKX"
      : venue === "bybit"
        ? "Bybit"
        : venue === "gate"
          ? "Gate"
          : venue === "bitget"
            ? "Bitget"
            : venue === "bingx"
              ? "BingX"
              : "Binance";
  const statusText = useMemo(() => {
    if (!hasConnectedAccount) return `Connect ${venueName} keys to start trading.`;
    return `These are your rules. Agent only follows them. It does not make ${venueName} profitable by itself.`;
  }, [hasConnectedAccount, venueName]);

  const patch = (changes) => {
    setDirty(true);
    setError("");
    setSuccess("");
    setDraft((current) => ({ ...current, ...changes }));
  };

  // Percent sizing gets the bare floor: we can't resolve a percentage into USDT
  // without the live balance, but the backend still rejects any live cap under
  // the floor, so mirroring it here keeps Save from failing server-side.
  const effectiveFixedNotional =
    draft.sizing_method === "fixed"
      ? Math.max(MIN_LIVE_ENTRY_USDT, Number(draft.sizing_value) || 0)
      : MIN_LIVE_ENTRY_USDT;
  const sizingLimitError =
    Number(draft.max_trade_notional_usdt) < effectiveFixedNotional
      ? `Per trade cap must be at least ${effectiveFixedNotional.toFixed(
          2
        )} USDT. Live orders use a minimum execution size of ${MIN_LIVE_ENTRY_USDT.toFixed(
          2
        )} USDT.`
      : "";

  // Spot's real floor is not the entry — it's the protective stop leg. The OCO
  // sells slightly less than filled (fee reserve) at a stop-limit price below
  // entry, and that leg must still clear Binance's 5 USDT notional. So an entry
  // sized right at the floor fails as soon as the stop is more than a few
  // percent away, with a confusing exchange error. Warn rather than block:
  // the exact threshold depends on the signal's stop distance.
  const spotSizeWarning =
    draft.spot_enabled && draft.sizing_method === "fixed" && Number(draft.sizing_value) < 10
      ? "On spot, the protective stop leg — not your entry — sets the real minimum. Below about 10 USDT per trade, wider stops push that leg under Binance's minimum and the exchange rejects the protection. Consider 10–15 USDT for spot."
      : "";

  // resolve_exit_plan downgrades trailing_stop to fixed_sl for spot without
  // raising, so a spot-only user picking it gets a plain stop loss and no
  // indication anywhere that their choice was ignored.
  const trailingOnSpotWarning =
    draft.exit_mode === "trailing_stop" && draft.spot_enabled && !draft.futures_enabled
      ? "Trailing stop is futures-only. With just spot enabled, the engine will use a fixed stop loss instead — this setting will have no effect."
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
      const payload = toPayload(draft);
      const response = await updateStrategyConfig(venue, payload);
      if (response?.config) {
        setDraft(toDraft(response.config));
      }
      setDirty(false);
      await onSaved?.({ background: true });
      setSuccess(
        `Strategy saved. Amount: ${Number(draft.sizing_value)} ${
          draft.sizing_method === "fixed" ? "USDT" : "%"
        }; per trade cap: ${Number(draft.max_trade_notional_usdt)} USDT.`
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
      <LiveRiskAckModal
        open={ackOpen}
        firstTime={!prefs.agent_live_ack}
        onCancel={() => setAckOpen(false)}
        onConfirm={() => {
          setPref("agent_live_ack", true);
          setAckOpen(false);
          patch({ dry_run: false });
        }}
      />
      {/* ── Header ── */}
      <Card>
        <div className="flex items-center gap-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            Trading policy
          </p>
          <StatusDot tone={draft.is_active ? "good" : "warn"} pulse={draft.is_active}>
            {draft.is_active ? "Active" : "Paused"}
          </StatusDot>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-text-primary lg:text-2xl">
          Strategy configuration
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{statusText}</p>
        <p className="mt-3 border-t border-ink/[0.06] pt-3 text-xs text-text-muted">
          Start and pause Agent from the engine control at the top of the page.
        </p>
      </Card>

      {!hasConnectedAccount ? (
        <Notice tone="warn">
          The strategy can be configured now, but a saved {venueName} account is required before the
          engine can place trades.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}
      {sizingLimitError && error !== sizingLimitError ? (
        <Notice tone="warn">{sizingLimitError}</Notice>
      ) : null}
      {trailingOnSpotWarning ? <Notice tone="warn">{trailingOnSpotWarning}</Notice> : null}
      {spotSizeWarning && !sizingLimitError ? (
        <Notice tone="warn">{spotSizeWarning}</Notice>
      ) : null}

      {/* ── Markets + execution mode ── */}
      <Card>
        <SectionTitle>Markets</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <WithGuide guide={FIELD_GUIDE.spot_enabled}>
            <Toggle
              label="Spot trading"
              hint="Execute spot orders for supported signals."
              checked={draft.spot_enabled}
              onChange={(value) => patch({ spot_enabled: value })}
            />
          </WithGuide>
          <WithGuide guide={FIELD_GUIDE.futures_enabled}>
            <Toggle
              label="Futures trading"
              hint="Execute leveraged futures orders."
              checked={draft.futures_enabled}
              onChange={(value) => patch({ futures_enabled: value })}
            />
          </WithGuide>
        </div>
        <div className="mt-4 border-t border-ink/[0.06] pt-4">
          <WithGuide guide={FIELD_GUIDE.dry_run}>
            <Toggle
              label="Dry run (simulation)"
              hint={
                draft.dry_run
                  ? "ON — bot follows signals but places no real Binance orders."
                  : "OFF — LIVE mode. Matching signals may place real orders when the engine is started."
              }
              checked={Boolean(draft.dry_run)}
              onChange={(value) => {
                if (draft.dry_run && !value) {
                  setAckOpen(true);
                  return;
                }
                patch({ dry_run: value });
              }}
            />
          </WithGuide>
        </div>
      </Card>

      {/* ── Position sizing (+ futures) ── */}
      <Card>
        <SectionTitle hint="Per-entry capital">Position sizing</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row guide={FIELD_GUIDE.sizing_method} label="Method">
            <Select
              value={draft.sizing_method}
              onChange={(value) => patch({ sizing_method: value })}
              options={[
                { value: "fixed", label: "Fixed USDT" },
                { value: "percent", label: "Percent of balance" },
              ]}
            />
          </Row>
          <Row guide={FIELD_GUIDE.sizing_value}
            label="Amount"
            hint={
              draft.sizing_method === "fixed"
                ? `Margin per trade — leverage multiplies it into position size. Live minimum: ${MIN_LIVE_ENTRY_USDT} USDT.`
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
          <div className="mt-5 border-t border-ink/[0.06] pt-5">
            <SectionTitle>Futures</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row guide={FIELD_GUIDE.leverage} label="Leverage" hint="1×–125×">
                <NumberInput
                  value={draft.leverage}
                  onChange={(value) => patch({ leverage: value })}
                  min={1}
                  max={125}
                  suffix="×"
                />
              </Row>
              <Row
                guide={FIELD_GUIDE.leverage_fallback}
                label="If a coin caps leverage"
                hint="Binance limits leverage per coin, and the limit is often below your setting."
              >
                <Select
                  value={draft.leverage_fallback}
                  onChange={(value) => patch({ leverage_fallback: value })}
                  options={[
                    { value: "clamp", label: "Trade at the coin's maximum" },
                    { value: "keep_size", label: "Keep position size (uses more margin)" },
                    { value: "skip", label: "Skip that coin" },
                  ]}
                />
              </Row>
              <Row guide={FIELD_GUIDE.margin_mode} label="Margin mode">
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
          <Row guide={FIELD_GUIDE.tp_level} label="Take profit target" hint="Which TP level from the signal to exit on.">
            <Segmented
              value={draft.tp_level}
              onChange={(value) => patch({ tp_level: value })}
              options={LEVEL_OPTIONS}
            />
          </Row>
          <Row guide={FIELD_GUIDE.sl_level} label="Stop loss level" hint="Which SL level from the signal to use.">
            <Segmented
              value={draft.sl_level}
              onChange={(value) => patch({ sl_level: value })}
              options={SL_LEVEL_OPTIONS}
            />
          </Row>
          <div className="grid gap-4 sm:grid-cols-2">
            <Row guide={FIELD_GUIDE.exit_mode} label="Exit mode">
              <Select
                value={draft.exit_mode}
                onChange={(value) => patch({ exit_mode: value })}
                options={[
                  { value: "fixed_sl", label: "Fixed SL" },
                  { value: "trailing_stop", label: "Trailing stop" },
                ]}
              />
            </Row>
            <Row guide={FIELD_GUIDE.trailing_callback_rate} label="Trailing callback" hint="Used only for trailing stop.">
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
        <WithGuide guide={FIELD_GUIDE.allowed_risk_levels}>
          <span />
        </WithGuide>
      </Card>

      {/* ── Risk limits ── */}
      <Card className="border-ink/10">
        <SectionTitle hint="Server-enforced before every live entry">Risk limits</SectionTitle>

        <div className="mb-5 flex flex-col gap-3 border-b border-ink/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-text-primary">Portfolio protection</h4>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">
              These limits are stored per user and checked by the execution engine before an order
              reaches Binance.
            </p>
          </div>
          <div className="w-full sm:w-[360px]">
            <WithGuide guide={FIELD_GUIDE.one_open_position_per_symbol}>
              <Toggle
                label="One position per symbol"
                hint="Prevent duplicate exposure on the same asset."
                checked={draft.one_open_position_per_symbol}
                onChange={(value) => patch({ one_open_position_per_symbol: value })}
              />
            </WithGuide>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <GuardCard title="Exposure">
            <Row guide={FIELD_GUIDE.max_open_positions} label="Open positions" hint="Maximum concurrent positions.">
              <NumberInput
                value={draft.max_open_positions}
                onChange={(value) => patch({ max_open_positions: value })}
                min={1}
                max={100}
              />
            </Row>
            <Row guide={FIELD_GUIDE.max_trade_notional_usdt}
              label="Per trade cap"
              hint={
                draft.sizing_method === "fixed"
                  ? `Must cover the effective ${effectiveFixedNotional.toFixed(
                      2
                    )} USDT entry (≥${MIN_LIVE_ENTRY_USDT} USDT live min). Caps below the entry size → all entries skipped as max_trade_notional.`
                  : `Maximum margin per entry (USDT). Live floor ${MIN_LIVE_ENTRY_USDT} USDT — keep cap ≥ floor or every signal skips.`
              }
            >
              <NumberInput
                value={draft.max_trade_notional_usdt}
                onChange={(value) => patch({ max_trade_notional_usdt: value })}
                min={effectiveFixedNotional}
                max={1000000}
                step={0.1}
                suffix="USDT"
              />
            </Row>
          </GuardCard>

          <GuardCard title="Daily guard">
            <Row guide={FIELD_GUIDE.max_daily_trades} label="Trades per day" hint="Resets at 00:00 UTC.">
              <NumberInput
                value={draft.max_daily_trades}
                onChange={(value) => patch({ max_daily_trades: value })}
                min={1}
                max={1000}
              />
            </Row>
            <Row guide={FIELD_GUIDE.daily_loss_limit_usdt} label="Loss limit" hint="Pause after realized losses.">
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
            <Row guide={FIELD_GUIDE.min_available_usdt} label="Minimum reserve" hint="USDT that must remain free after a new entry.">
              <NumberInput
                value={draft.min_available_usdt}
                onChange={(value) => patch({ min_available_usdt: value })}
                min={0}
                max={1000000}
                step={0.1}
                suffix="USDT"
              />
            </Row>
            <div className="rounded-md border border-ink/10 bg-surface-secondary px-3 py-2.5 text-xs leading-5 text-text-secondary">
              Reconciliation issues always block new live entries regardless of these values.
            </div>
          </GuardCard>

          <GuardCard title="Recovery">
            <Row guide={FIELD_GUIDE.cooldown_after_loss_minutes} label="After loss" hint="Wait before the next entry.">
              <NumberInput
                value={draft.cooldown_after_loss_minutes}
                onChange={(value) => patch({ cooldown_after_loss_minutes: value })}
                min={0}
                max={10080}
                suffix="min"
              />
            </Row>
            <Row guide={FIELD_GUIDE.cooldown_after_error_minutes} label="After error" hint="Wait after execution failure.">
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

      <WorkedExample
        draft={draft}
        availableUsdt={portfolio?.spot?.available_usdt ?? portfolio?.futures?.available_usdt}
      />

      {/* ── Rules the engine enforces that are not settings ── */}
      <Card>
        <SectionTitle hint="Not settings — always on">How the engine decides</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {ENGINE_RULES.map((rule) => (
            <div
              key={rule.title}
              className="rounded-lg border border-ink/[0.07] bg-ink/[0.02] p-3.5"
            >
              <p className="text-[12px] font-semibold text-text-primary">{rule.title}</p>
              <p className="mt-1.5 text-[11px] leading-[1.55] text-text-muted">{rule.body}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Save bar ── */}
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-surface-raised/95 px-4 py-3 shadow-2xl backdrop-blur">
        <div>
          <p className={`text-xs font-semibold ${dirty ? "text-accent" : "text-text-secondary"}`}>
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
            disabled={!hasConnectedAccount || saving || !dirty || Boolean(sizingLimitError)}
          >
            {saving ? "Saving…" : "Save strategy"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
