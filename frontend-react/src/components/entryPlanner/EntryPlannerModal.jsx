// Entry planner — turn a call into orders you can type straight into your exchange.
//
// Asked for by a subscriber who was doing this by hand in a spreadsheet, and
// could not copy numbers out of Telegram: pick how much you are willing to lose
// if the stop is hit, how many entries, how to split them, and the leverage;
// get Entry 1 as a market order, the rest as limit orders towards SL1, one stop
// for the whole position, and a TP split — every number rounded to what YOUR
// exchange accepts, and one tap to copy.
//
// Live: Entry 1 is priced from the modal's own mark-price feed (the browser
// already streams it), so the plan moves with the market while it is open.
// Maths: ./entryPlanMath.js (tested). Venue rules + template:
// backend/app/api/routes/entry_planner.py.
import { useEffect, useMemo, useState } from "react";

import Modal from "../ui/Modal";
import CoinLogo from "../CoinLogo";
import { Z } from "../../constants/zIndex";
import { isShortSignal } from "../../utils/signalDirection";
import { buildPlan, decimalsOf, evenLadder, roundToStep } from "./entryPlanMath";

const API_BASE = import.meta.env.VITE_API_URL || "";
const authHeaders = () => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Top 10 USDT-M / perp desks by book (CoinGlass OI + volume, Sep 2026).
// Hyperliquid is the on-chain book in that set — size in coin, collateral USDC.
export const VENUES = [
  { id: "binance", label: "Binance", logo: "/exchanges/binance.png", collateral: "USDT" },
  { id: "bybit", label: "Bybit", logo: "/exchanges/bybit.png", collateral: "USDT" },
  { id: "okx", label: "OKX", logo: "/exchanges/okx.png", collateral: "USDT" },
  { id: "bitget", label: "Bitget", logo: "/exchanges/bitget.png", collateral: "USDT" },
  { id: "gate", label: "Gate", logo: "/exchanges/gate.png", collateral: "USDT" },
  { id: "mexc", label: "MEXC", logo: "/exchanges/mexc.png", collateral: "USDT" },
  { id: "hyperliquid", label: "Hyperliquid", logo: "/exchanges/hyperliquid.png", collateral: "USDC", kind: "dex" },
  { id: "bingx", label: "BingX", logo: "/exchanges/bingx.png", collateral: "USDT" },
  { id: "kucoin", label: "KuCoin", logo: "/exchanges/kucoin.png", collateral: "USDT" },
  { id: "htx", label: "HTX", logo: "/exchanges/htx.png", collateral: "USDT" },
];

function VenueMark({ venue, size = 16 }) {
  if (venue.logo) {
    return (
      <img
        src={venue.logo}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${venue.kind === "dex" ? "rounded-md object-contain" : "rounded-full object-cover"}`}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-black"
      style={{ width: size, height: size, background: venue.color, fontSize: size * 0.42 }}
    >
      {venue.mono}
    </span>
  );
}

const WEIGHT_PRESETS = {
  1: [[100]],
  2: [[50, 50], [60, 40], [40, 60]],
  3: [[40, 30, 30], [34, 33, 33], [50, 25, 25], [20, 30, 50]],
  4: [[25, 25, 25, 25], [40, 20, 20, 20], [10, 20, 30, 40]],
};
const TP_PRESETS = [[40, 30, 20, 10], [25, 25, 25, 25], [50, 30, 20, 0], [100, 0, 0, 0]];

const DEFAULTS = {
  size_by: "risk",
  risk_usd: 10,
  margin_usd: 100,
  balance_usd: 0,
  leverage: 5,
  entries: 3,
  weights: [40, 30, 30],
  sl_mode: "buffer",
  sl_buffer_pct: 0.2,
  tp_split: [40, 30, 20, 10],
  exchange: "binance",
  include_fees: true,
  entry1_price: "live",
};

// How each venue's order form wants the plan typed. Only what is stable in
// their UIs: the market, the size unit the numbers below are in, and a stop
// that covers the whole position (so entries filling later are protected too).
const VENUE_GUIDE = {
  binance: {
    market: "Futures → USDⓈ-M",
    unit: (c) => `Size unit ${c}. Prefer capital? Switch unit to USDT → Initial margin and type the Margin column.`,
    stop: "Stop Market with Close Position ticked, trigger by Mark price",
    tp: "Limit orders with Reduce-only at each TP. Scale down if not every entry filled.",
  },
  bybit: {
    market: "Derivatives → USDT Perpetual",
    unit: (c) => `Qty in ${c}. Prefer capital? Switch unit to USDT → By cost and type the Margin column.`,
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Position TP/SL partials, or Reduce-only limits at each TP.",
  },
  okx: {
    market: "Trade → Perpetual (USDT)",
    unit: () => "Size unit Contracts (Cont) — the quantities here are contracts, not coins.",
    stop: "TP/SL on the position → Entire position, trigger by Mark price",
    tp: "TP/SL partials, or Reduce-only limits. Contracts, not coins.",
  },
  bitget: {
    market: "Futures → USDT-M",
    unit: (c) => `Size unit ${c} — type the Quantity column.`,
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Reduce-only limits at each TP, or Position TP/SL partials.",
  },
  gate: {
    market: "Futures → USDT perpetual",
    unit: () => "Size unit Contracts (Cont) — the quantities here are contracts, not coins.",
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Reduce-only limits. Sizes are contracts.",
  },
  mexc: {
    market: "Futures → USDT-M",
    unit: () => "Size is in contracts. One contract is a fraction of the coin — use the Quantity column as printed.",
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Reduce-only limits at each TP. Contract sizes, not coins.",
  },
  hyperliquid: {
    market: "app.hyperliquid.xyz → Perps",
    collateral: "USDC",
    wallet: "Hyperliquid perps account (USDC)",
    unit: (c) => `Size is in ${c}, not dollars. Collateral is USDC in the perps account — not a USDT futures wallet.`,
    stop: "Positions → TP/SL → Stop Market, trigger by Mark, size = entire position",
    tp: "From the position, set TP Limit (reduce-only) at each target. TP Market if you want the fill more than the exact price.",
    extra: "Isolated and leverage are the chip above the order ticket. Max leverage is per coin (often 3–40×), not 125×.",
  },
  bingx: {
    market: "Futures → USDT-M Perpetual",
    unit: (c) => `Qty in ${c} — type the Quantity column.`,
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Reduce-only limits at each TP.",
  },
  kucoin: {
    market: "Futures → USDT Perpetual",
    unit: () => "Size unit Lots (contracts). BTC is listed as XBT — the quantities here are already in lots.",
    stop: "Position TP/SL → Entire position, trigger by Mark price",
    tp: "Reduce-only limits. Lots, not coins.",
  },
  htx: {
    market: "USDT-M Linear Swap",
    unit: () => "Size unit Contracts. Type the contract count, not the coin amount.",
    stop: "TP/SL on the position → Entire position, trigger by Mark price",
    tp: "Reduce-only limits at each TP. Contract count.",
  },
};

const sym = (pair) => String(pair || "").replace(/USDT$/i, "");
// Text inputs, not type=number: a number input renders in the browser's locale
// ("0,1867" on an Indonesian machine), which reads differently from the price
// on the exchange and turns a typed "1,5" into NaN. Accept either separator.
const dec = (v) => String(v ?? "").replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const n = (v) => {
  const f = Number(v);
  return Number.isFinite(f) && f > 0 ? f : null;
};
const money = (v) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `$${Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)}`;

// A TP can sit below the average entry when price has already run past the
// call and Entry 1 is bought at the live price — then it closes at a loss, and
// "+$-2177" hid that. Sign and colour follow the number.
const signed = (v) => (Number.isFinite(v) && v < 0 ? `−${money(-v)}` : `+${money(v)}`);
const pnlCls = (v) => (Number.isFinite(v) && v < 0 ? "text-negative" : "text-profit");

function priceFmt(v, tick) {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = tick ? decimalsOf(tick) : Math.min(8, Math.max(2, 4 - Math.floor(Math.log10(Math.abs(v)))));
  return v.toFixed(d);
}
function qtyFmt(v, step) {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = step ? decimalsOf(step) : v >= 100 ? 0 : 4;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── small pieces ───────────────────────────────────────────────────────
function CopyValue({ value, display, strong }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setDone(true);
      setTimeout(() => setDone(false), 1100);
    } catch {
      /* clipboard blocked — the number is still on screen */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Tap to copy"
      className={`group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono tabular-nums transition-colors hover:bg-accent/10 ${
        strong ? "font-semibold text-text-primary" : "text-text-primary"
      }`}
    >
      <span>{display ?? value}</span>
      <span className={`text-[10px] ${done ? "text-profit" : "text-text-muted opacity-40 group-hover:opacity-100"}`}>
        {done ? "✓" : "⧉"}
      </span>
    </button>
  );
}

// A div, not a <label>: a label wrapping several buttons forwards a click on its
// text to the first one, which silently switched the exchange.
function Field({ label, hint, children }) {
  return (
    <div className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-text-primary">{label}</span>
        {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink/[0.1] bg-surface-raised px-3 py-2 font-mono text-[14px] text-text-primary tabular-nums focus:border-accent/60 focus:outline-none";

function Seg({ options, value, onChange, small }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-ink/[0.04] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={o.disabled}
          aria-pressed={value === o.value}
          title={o.title}
          className={`flex-1 whitespace-nowrap rounded-md px-2 ${small ? "py-1 text-[11px]" : "py-1.5 text-[12px]"} font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
            value === o.value ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
          }`}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function VenuePicker({ venues, value, onChange, listed, pair }) {
  const known = listed.length > 0;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
      {venues.map((v) => {
        const on = !known || listed.includes(v.id);
        const sel = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => on && onChange(v.id)}
            disabled={!on}
            title={!on ? `${pair} is not listed on ${v.label}` : v.kind === "dex" ? `${v.label} · on-chain perps, USDC collateral` : v.label}
            className={`flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border px-2 py-2 text-left text-[11px] font-medium sm:text-[12px] ${
              sel
                ? "border-ink/25 bg-surface-raised text-text-primary shadow-sm"
                : "border-ink/[0.08] bg-ink/[0.02] text-text-secondary hover:border-ink/16 hover:text-text-primary"
            } disabled:cursor-not-allowed disabled:opacity-35`}
          >
            <VenueMark venue={v} size={16} />
            <span className="min-w-0 truncate leading-tight">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const WARN_TEXT = {
  liquidation_before_stop: (p, lev) =>
    `At ${lev}x the position would be liquidated near ${p} — before your stop. Lower the leverage.`,
  leg_below_minimum: () =>
    "At least one order is below this exchange's minimum and would be rejected. Raise the loss budget or use fewer entries.",
};

// ── the modal ──────────────────────────────────────────────────────────
export default function EntryPlannerModal({ isOpen, onClose, signal, livePrice, zIndex = Z.nestedModal }) {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [saved, setSaved] = useState(null); // null unknown, true/false
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState(null);
  const [rulesErr, setRulesErr] = useState("");
  const [customPrices, setCustomPrices] = useState(null); // strings for entries 2..n, null = even ladder
  const [copiedAll, setCopiedAll] = useState(false);

  const side = isShortSignal(signal || {}) ? "short" : "long";
  const long = side === "long";
  const callEntry = n(signal?.entry);
  const sl1 = n(signal?.stop1);
  const sl2 = n(signal?.stop2);
  const targets = [signal?.target1, signal?.target2, signal?.target3, signal?.target4].map(n);
  const pair = String(signal?.pair || "").toUpperCase();

  // Template: load once per open; a failure just leaves the defaults.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetch(`${API_BASE}/api/v1/entry-planner/template`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (!alive || !t) return;
        setCfg((c) => ({ ...c, ...t }));
        setSaved(!!t.saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isOpen]);

  // Venue rules for this coin.
  useEffect(() => {
    if (!isOpen || !pair) return;
    let alive = true;
    setRules(null);
    setRulesErr("");
    fetch(`${API_BASE}/api/v1/entry-planner/rules?symbol=${encodeURIComponent(pair)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => alive && setRules(d))
      .catch((e) => alive && setRulesErr(e.message || "failed"));
    return () => {
      alive = false;
    };
  }, [isOpen, pair]);

  useEffect(() => {
    setCustomPrices(null);
  }, [signal?.signal_id, cfg.entries]);

  // A saved venue that does not list this coin would silently fall back to
  // generic rounding; move to the first venue that does, without saving.
  useEffect(() => {
    const ls = rules?.listed || [];
    if (ls.length && !ls.includes(cfg.exchange)) setCfg((c) => ({ ...c, exchange: ls[0] }));
  }, [rules, cfg.exchange]);

  const rule = rules?.rules?.[cfg.exchange] || null;
  const listed = rules?.listed || [];
  const tick = rule?.tick || null;
  const stepCoin = rule?.step ? String(Number(rule.step) * Number(rule.contract_size || 1)) : null;

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const setEntries = (count) => {
    const w = WEIGHT_PRESETS[count][0];
    setCfg((c) => ({ ...c, entries: count, weights: w }));
  };

  const entry1 = cfg.entry1_price === "live" && n(livePrice) ? n(livePrice) : callEntry;
  const ladder = useMemo(() => {
    if (!entry1 || !sl1) return [];
    const even = evenLadder(entry1, sl1, cfg.entries);
    if (!customPrices) return even;
    return even.map((v, i) => (i === 0 ? v : n(customPrices[i]) ?? v));
  }, [entry1, sl1, cfg.entries, customPrices]);

  const slFinal = useMemo(() => {
    if (cfg.sl_mode === "sl2" && sl2) return sl2;
    if (!sl1) return null;
    const b = Math.max(0, Number(cfg.sl_buffer_pct) || 0) / 100;
    return long ? sl1 * (1 - b) : sl1 * (1 + b);
  }, [cfg.sl_mode, cfg.sl_buffer_pct, sl1, sl2, long]);

  const plan = useMemo(() => {
    if (!ladder.length || !slFinal) return null;
    return buildPlan({
      side,
      entryPrices: ladder,
      sl: slFinal,
      targets,
      sizeBy: cfg.size_by,
      riskUsd: cfg.risk_usd,
      marginUsd: cfg.margin_usd,
      leverage: cfg.leverage,
      weights: cfg.weights,
      tpSplit: cfg.tp_split,
      includeFees: cfg.include_fees,
      rule,
    });
    // targets is rebuilt each render from the same signal fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladder, slFinal, side, cfg, rule, signal?.target1, signal?.target2, signal?.target3, signal?.target4]);

  // Market-context warnings the maths cannot see.
  const liveWarnings = [];
  const lp = n(livePrice);
  if (lp && sl1 && (long ? lp <= sl1 : lp >= sl1)) liveWarnings.push("Price is already through SL1 — this call is invalidated.");
  else if (lp && targets[0] && (long ? lp >= targets[0] : lp <= targets[0]))
    liveWarnings.push("Price is already at or past TP1 — entering now chases the move.");
  if (lp && plan?.ok) {
    plan.legs.slice(1).forEach((l) => {
      if (long ? l.price >= lp : l.price <= lp)
        liveWarnings.push(`Entry ${l.index} is ${long ? "above" : "below"} the current price — a limit order there fills immediately.`);
    });
  }

  if (plan?.ok) {
    const under = plan.tps.filter((t) => t.qty > 0 && t.profit < 0).map((t) => `TP${t.index}`);
    if (under.length)
      liveWarnings.push(`${under.join(", ")} ${under.length > 1 ? "are" : "is"} ${long ? "below" : "above"} your average entry, so ${under.length > 1 ? "they close" : "it closes"} at a loss. Use the call price for Entry 1, or put the split on the targets still ahead.`);
  }
  const balance = n(cfg.balance_usd);
  const walletNeed = plan?.ok ? plan.margin + plan.feesAtSl : null;
  if (plan?.ok && balance && walletNeed > balance)
    liveWarnings.push(`This plan needs about ${money(walletNeed)} in your futures wallet (margin + fees) — your balance is ${money(balance)}.`);
  else if (plan?.ok && balance && plan.lossAtSl / balance > 0.05)
    liveWarnings.push(`A stop-out costs ${((plan.lossAtSl / balance) * 100).toFixed(1)}% of your balance. Most traders keep it at 1–2% per trade.`);
  const pctOf = (v) => (balance && Number.isFinite(v) ? ` · ${((v / balance) * 100).toFixed(1)}% of balance` : "");
  const venue = VENUES.find((v) => v.id === cfg.exchange) || VENUES[0];
  const guide = VENUE_GUIDE[venue.id] || VENUE_GUIDE.binance;
  const collateral = venue.collateral || guide.collateral || "USDT";

  const unitLabel = (qtyCoin, qtyUnit) =>
    plan?.unit === "contract"
      ? { value: qtyFmt(qtyUnit, rule?.step), label: "ct", note: `= ${qtyFmt(qtyCoin, stepCoin)} ${sym(pair)}` }
      : { value: qtyFmt(qtyCoin, stepCoin), label: sym(pair), note: null };

  const copyAll = async () => {
    if (!plan?.ok) return;
    const u = plan.unit === "contract" ? "contracts" : sym(pair);
    const lines = [
      `${pair} ${side.toUpperCase()} · ${venue.label} · Isolated ${cfg.leverage}x · margin ${money(plan.margin)} ${collateral} · max loss ${money(plan.lossAtSl)}`,
      ...plan.legs.map((l) => `Entry ${l.index} (${l.type}): ${priceFmt(l.price, tick)} × ${plan.unit === "contract" ? qtyFmt(l.qtyUnit, rule?.step) : qtyFmt(l.qty, stepCoin)} ${u} · margin ${money(l.margin)}`),
      `Stop (all): ${priceFmt(plan.sl, tick)}`,
      ...plan.tps.filter((t) => t.qty > 0).map((t) => `TP${t.index}: ${priceFmt(t.price, tick)} × ${plan.unit === "contract" ? qtyFmt(t.qtyUnit, rule?.step) : qtyFmt(t.qty, stepCoin)} ${u}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1400);
    } catch {
      /* blocked */
    }
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const body = { ...cfg, weights: cfg.weights.map(Number), tp_split: cfg.tp_split.map(Number) };
      const r = await fetch(`${API_BASE}/api/v1/entry-planner/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      setSaved(r.ok);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const weightSum = cfg.weights.reduce((a, b) => a + (Number(b) || 0), 0);
  const tpSum = cfg.tp_split.reduce((a, b) => a + (Number(b) || 0), 0);
  const missing = !callEntry || !sl1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        pair ? (
          <span className="inline-flex items-center gap-2.5">
            <CoinLogo pair={pair} size={28} />
            <span>
              Plan your entries on <span className="font-mono">${sym(pair)}</span>
            </span>
          </span>
        ) : (
          "Plan your entries"
        )
      }
      subtitle={`${long ? "Long" : "Short"} · size by your max loss or your capital — every number fits your exchange`}
      size="desk"
      zIndex={zIndex}
    >
      {missing ? (
        <p className="py-10 text-center text-[13px] text-text-muted">
          This call has no entry or SL1 to plan from.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(420px,0.4fr)_minmax(0,1fr)] xl:grid-cols-[minmax(460px,0.38fr)_minmax(0,1fr)]">
          {/* ── Settings ─────────────────────────────────────────── */}
          {/* On a phone the plan comes first: the settings usually arrive from
              the saved template, and the orders are what the trader came for. */}
          <section className="order-2 space-y-4 lg:order-1">
            <Field
              label="Exchange"
              hint={rulesErr ? "rules unavailable — generic rounding" : rules ? "own tick, step and minimum" : "loading rules…"}
            >
              <VenuePicker
                venues={VENUES}
                value={cfg.exchange}
                onChange={(v) => set("exchange", v)}
                listed={listed}
                pair={sym(pair)}
              />
              <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
                Top 10 perp desks by liquidity. Hyperliquid is on-chain — size in coin, collateral USDC.
              </p>
            </Field>

            <Field label="Size the position by" hint={cfg.size_by === "margin" ? "capital you put in" : "what a stop-out may cost"}>
              <Seg
                small
                value={cfg.size_by}
                onChange={(v) => set("size_by", v)}
                options={[
                  { value: "risk", label: "Max loss" },
                  { value: "margin", label: "Capital (margin)" },
                ]}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              {cfg.size_by === "margin" ? (
                <Field label="Capital to use" hint="USDT">
                  <input
                    type="text" inputMode="decimal" className={inputCls}
                    value={cfg.margin_usd}
                    onChange={(e) => set("margin_usd", dec(e.target.value))}
                  />
                </Field>
              ) : (
                <Field label="Max loss if stopped" hint="USDT">
                  <input
                    type="text" inputMode="decimal" className={inputCls}
                    value={cfg.risk_usd}
                    onChange={(e) => set("risk_usd", dec(e.target.value))}
                  />
                </Field>
              )}
              <Field label="Leverage" hint={rule?.max_leverage ? `max ${rule.max_leverage}× here` : "×"}>
                <input
                  type="text" inputMode="decimal" min="1" max="125" step="1" className={inputCls}
                  value={cfg.leverage}
                  onChange={(e) => set("leverage", dec(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Futures balance" hint="optional · for % of account">
              <input
                type="text" inputMode="decimal" placeholder="e.g. 500" className={inputCls}
                value={cfg.balance_usd || ""}
                onChange={(e) => set("balance_usd", dec(e.target.value))}
              />
            </Field>

            <Field label="Entries" hint={Math.abs(weightSum - 100) > 0.5 ? `split adds to ${weightSum}%` : "split of the position"}>
              <Seg value={cfg.entries} onChange={setEntries} options={[1, 2, 3, 4].map((x) => ({ value: x, label: String(x) }))} />
              {cfg.entries > 1 && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {WEIGHT_PRESETS[cfg.entries].map((p) => (
                      <button
                        key={p.join("-")}
                        type="button"
                        onClick={() => set("weights", p)}
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                          p.join() === cfg.weights.join() ? "border-ink/20 bg-surface-raised text-text-primary shadow-sm" : "border-ink/10 text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {p.join("/")}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${cfg.entries}, minmax(0,1fr))` }}>
                    {cfg.weights.map((w, i) => (
                      <input
                        key={i}
                        aria-label={`Entry ${i + 1} share`}
                        type="text" inputMode="decimal" min="0" max="100" className={inputCls}
                        value={w}
                        onChange={(e) => set("weights", cfg.weights.map((x, j) => (j === i ? dec(e.target.value) : x)))}
                      />
                    ))}
                  </div>
                </>
              )}
            </Field>

            <Field label="Entry 1 (market)" hint={lp ? `live ${priceFmt(lp, tick)}` : "no live price yet"}>
              <Seg
                small
                value={cfg.entry1_price}
                onChange={(v) => set("entry1_price", v)}
                options={[
                  { value: "live", label: "At live price", disabled: !lp },
                  { value: "call", label: `At call ${priceFmt(callEntry, tick)}` },
                ]}
              />
            </Field>

            {cfg.entries > 1 && (
              <Field label="Limit entries" hint={customPrices ? "edited" : "evenly spaced to SL1"}>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cfg.entries - 1}, minmax(0,1fr))` }}>
                  {ladder.slice(1).map((v, i) => (
                    <input
                      key={i}
                      aria-label={`Entry ${i + 2} price`}
                      type="text" inputMode="decimal" className={inputCls}
                      value={customPrices?.[i + 1] ?? priceFmt(tick ? roundToStep(v, tick, long ? "down" : "up") : v, tick)}
                      onChange={(e) => {
                        const next = customPrices ? [...customPrices] : ladder.map((x) => priceFmt(x, tick));
                        next[i + 1] = dec(e.target.value);
                        setCustomPrices(next);
                      }}
                    />
                  ))}
                </div>
                {customPrices && (
                  <button type="button" onClick={() => setCustomPrices(null)} className="mt-1 text-[11px] text-text-muted underline underline-offset-2 hover:text-text-primary">
                    Reset to even spacing
                  </button>
                )}
              </Field>
            )}

            <Field label="Stop for the whole position" hint={`SL1 ${priceFmt(sl1, tick)}${sl2 ? ` · SL2 ${priceFmt(sl2, tick)}` : ""}`}>
              <Seg
                small
                value={cfg.sl_mode}
                onChange={(v) => set("sl_mode", v)}
                options={[
                  { value: "buffer", label: `Just ${long ? "below" : "above"} SL1` },
                  { value: "sl2", label: "At SL2", disabled: !sl2 },
                ]}
              />
              {cfg.sl_mode === "buffer" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    aria-label="Buffer beyond SL1 in percent"
                    type="text" inputMode="decimal" min="0" max="10" step="0.05" className={`${inputCls} max-w-[110px]`}
                    value={cfg.sl_buffer_pct}
                    onChange={(e) => set("sl_buffer_pct", dec(e.target.value))}
                  />
                  <span className="text-[12px] text-text-muted">% beyond SL1</span>
                </div>
              )}
            </Field>

            <Field label="Take profit split" hint={Math.abs(tpSum - 100) > 0.5 ? `adds to ${tpSum}%` : "% of the position per TP"}>
              <div className="mb-2 flex flex-wrap gap-1">
                {TP_PRESETS.map((p) => (
                  <button
                    key={p.join("-")}
                    type="button"
                    onClick={() => set("tp_split", p)}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                      p.join() === cfg.tp_split.join() ? "border-ink/20 bg-surface-raised text-text-primary shadow-sm" : "border-ink/10 text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {p.join("/")}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {cfg.tp_split.map((v, i) => (
                  <input
                    key={i}
                    aria-label={`TP${i + 1} share`}
                    type="text" inputMode="decimal" min="0" max="100" className={inputCls}
                    value={v}
                    disabled={!targets[i]}
                    onChange={(e) => set("tp_split", cfg.tp_split.map((x, j) => (j === i ? dec(e.target.value) : x)))}
                  />
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2 text-[12px] text-text-primary">
              <input type="checkbox" checked={!!cfg.include_fees} onChange={(e) => set("include_fees", e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              Pay fees out of the loss budget
              <span className="text-text-muted">(0.05% market · 0.02% limit)</span>
            </label>

            <button
              type="button"
              onClick={saveTemplate}
              disabled={saving}
              className="w-full rounded-lg border border-ink/[0.12] px-3 py-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-ink/[0.04] disabled:opacity-50"
            >
              {saving ? "Saving…" : saved ? "✓ Saved as my default — update" : "Save these settings as my default"}
            </button>
          </section>

          {/* ── Plan ─────────────────────────────────────────────── */}
          <section className="order-1 min-w-0 space-y-4 lg:order-2">
            {!plan ? null : !plan.ok ? (
              <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-[13px] text-negative">{plan.error}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Capital (margin)", money(plan.margin), `Isolated ${cfg.leverage}x${pctOf(plan.margin)}`],
                    ["Loss if stopped", money(plan.lossAtSl), plan.sizeBy === "margin" ? `from ${money(Number(cfg.margin_usd))} capital${pctOf(plan.lossAtSl)}` : `budget ${money(Number(cfg.risk_usd))}${pctOf(plan.lossAtSl)}`],
                    ["Average entry", priceFmt(plan.avg, tick), `if every entry fills · liq ≈ ${priceFmt(plan.liq, tick)}`],
                    ["Position", `${unitLabel(plan.totalQty, plan.totalUnit).value} ${unitLabel(plan.totalQty, plan.totalUnit).label}`, `≈ ${money(plan.notional)} order value`],
                  ].map(([k, v, s]) => (
                    <div key={k} className="rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2.5">
                      <p className="text-[11px] text-text-muted">{k}</p>
                      <p className="mt-0.5 font-mono text-[16px] font-semibold text-text-primary">{v}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted">{s}</p>
                    </div>
                  ))}
                </div>

                {(plan.warnings.length > 0 || liveWarnings.length > 0) && (
                  <ul className="space-y-1.5">
                    {plan.warnings.map((w) => (
                      <li key={w} className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-[12px] text-text-primary">
                        ⚠ {WARN_TEXT[w]?.(priceFmt(plan.liq, tick), cfg.leverage) || w}
                      </li>
                    ))}
                    {liveWarnings.map((w) => (
                      <li key={w} className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-[12px] text-text-primary">⚠ {w}</li>
                    ))}
                  </ul>
                )}

                <div className="overflow-hidden rounded-xl border border-ink/[0.08]">
                  <div className="flex items-center justify-between gap-2 border-b border-ink/[0.08] bg-surface-secondary/40 px-3 py-2">
                    <p className="text-[12px] font-semibold text-text-primary">
                      <span className="inline-flex items-center gap-1.5 align-middle">
                        <VenueMark venue={venue} size={16} />
                        Orders on {venue.label}
                      </span>
                      {plan.unit === "contract" && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent-text">
                          quantities in CONTRACTS (1 ct = {plan.contractSize} {sym(pair)})
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={copyAll}
                      className="lq-cta-md shrink-0 px-3 py-1.5 text-[12px]"
                    >
                      {copiedAll ? "✓ Copied" : "Copy plan"}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] sm:min-w-[480px]">
                      <thead>
                        <tr className="text-left text-[11px] text-text-muted">
                          <th className="px-2 py-2 font-medium sm:px-3">Order</th>
                          <th className="px-2 py-2 font-medium">Price</th>
                          <th className="px-2 py-2 font-medium">Quantity</th>
                          <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Order value</th>
                          <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/[0.06]">
                        {plan.legs.map((l) => {
                          const q = unitLabel(l.qty, l.qtyUnit);
                          return (
                            <tr key={l.index}>
                              <td className="px-2 py-2 sm:px-3">
                                <span className="font-medium text-text-primary">Entry {l.index}</span>
                                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${l.type === "market" ? "bg-accent/15 text-accent-text" : "bg-ink/[0.06] text-text-muted"}`}>
                                  {l.type}
                                </span>
                                <span className="ml-1.5 hidden text-[11px] text-text-muted sm:inline">{Math.round(l.weight)}%</span>
                                {l.warnings.length > 0 && <span className="ml-1.5 text-[11px] text-negative">below min</span>}
                              </td>
                              <td className="px-2 py-2">{l.type === "market" ? <span className="px-1.5 font-mono text-text-muted">~{priceFmt(l.price, tick)}</span> : <CopyValue value={priceFmt(l.price, tick)} />}</td>
                              <td className="px-2 py-2">
                                <CopyValue value={q.value.replace(/,/g, "")} display={`${q.value} ${q.label}`} strong />
                                {q.note && <span className="block px-1.5 text-[10px] text-text-muted">{q.note}</span>}
                                <span className="block px-1.5 text-[10px] text-text-muted sm:hidden">margin {money(l.margin)} · value {money(l.notional)}</span>
                              </td>
                              <td className="hidden px-2 py-2 text-right font-mono text-text-muted md:table-cell">{money(l.notional)}</td>
                              <td className="hidden px-3 py-2 text-right sm:table-cell">
                                <CopyValue value={l.margin.toFixed(2)} display={money(l.margin)} />
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-negative/[0.05]">
                          <td className="px-2 py-2 sm:px-3">
                            <span className="font-medium text-text-primary">Stop</span>
                            <span className="ml-1.5 text-[11px] text-text-muted">whole position</span>
                          </td>
                          <td className="px-2 py-2"><CopyValue value={priceFmt(plan.sl, tick)} strong /></td>
                          <td className="px-2 py-2 text-[12px]">
                            <span className="font-mono text-negative sm:hidden">−{money(plan.lossAtSl)}</span>
                            <span className="hidden text-text-muted sm:inline">all filled size</span>
                          </td>
                          <td className="hidden md:table-cell" />
                          <td className="hidden px-3 py-2 text-right font-mono text-negative sm:table-cell">−{money(plan.lossAtSl)}</td>
                        </tr>
                        {plan.tps.filter((t) => t.qty > 0).map((t) => {
                          const q = unitLabel(t.qty, t.qtyUnit);
                          return (
                            <tr key={`tp${t.index}`} className="bg-profit/[0.04]">
                              <td className="px-2 py-2 sm:px-3">
                                <span className="font-medium text-text-primary">TP{t.index}</span>
                                <span className="ml-1.5 text-[11px] text-text-muted">{Math.round(t.pct)}%</span>
                                <span className={`ml-1.5 text-[11px] sm:hidden ${pnlCls(t.profit)}`}>{signed(t.profit)}</span>
                              </td>
                              <td className="px-2 py-2"><CopyValue value={priceFmt(t.price, tick)} /></td>
                              <td className="px-2 py-2"><CopyValue value={q.value.replace(/,/g, "")} display={`${q.value} ${q.label}`} /></td>
                              <td className="hidden md:table-cell" />
                              <td className={`hidden px-3 py-2 text-right font-mono sm:table-cell ${pnlCls(t.profit)}`}>{signed(t.profit)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-ink/[0.1] bg-surface-secondary/40 text-[12px]">
                          <td className="px-2 py-2 font-medium text-text-primary sm:px-3" colSpan={3}>
                            Wallet needed
                            <span className="ml-1.5 hidden font-normal text-text-muted sm:inline">
                              margin + est. fees, {collateral} in {guide.wallet || "your futures wallet"}
                            </span>
                            <span className="float-right font-mono font-semibold sm:hidden">{money(walletNeed)}</span>
                          </td>
                          <td className="hidden md:table-cell" />
                          <td className="hidden px-3 py-2 text-right font-mono font-semibold text-text-primary sm:table-cell">{money(walletNeed)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {guide && (
                  <div className="rounded-xl border border-ink/[0.08] px-3 py-2.5">
                    <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
                      <VenueMark venue={venue} size={15} />
                      How to place it on {venue.label}
                    </p>
                    <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-text-secondary">
                      {[
                        <>Open <b className="text-text-primary">{guide.market}</b> → {sym(pair)} perpetual. Set <b className="text-text-primary">Isolated</b> and leverage <b className="text-text-primary">{cfg.leverage}×</b>{rule?.max_leverage ? ` (this coin max ${rule.max_leverage}×)` : ""} before the first order.</>,
                        <>{guide.unit(sym(pair))}</>,
                        <><b className="text-text-primary">{long ? "Buy / Long" : "Sell / Short"}</b> Entry 1 as a <b className="text-text-primary">Market</b> order{plan.legs.length > 1 ? <>, then Entries 2–{plan.legs.length} as <b className="text-text-primary">Limit</b> orders at their prices</> : null}.</>,
                        <>Stop at <b className="font-mono text-text-primary">{priceFmt(plan.sl, tick)}</b>: {guide.stop} — it covers entries that fill later.</>,
                        <>Take profits: {guide.tp}</>,
                        <>Keep at least <b className="font-mono text-text-primary">{money(walletNeed)}</b> {collateral} in {guide.wallet || "the futures wallet"}{balance ? pctOf(walletNeed) : ""}.</>,
                        guide.extra ? <>{guide.extra}</> : null,
                      ].filter(Boolean).map((c, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] font-mono text-[10px] text-text-muted">{i + 1}</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {plan.scenarios.length > 1 && (
                  <div className="rounded-xl border border-ink/[0.08] px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-text-primary">If not every entry fills</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Price often leaves before the lower entries fill. A smaller position loses less at the stop — and makes less at the targets.
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-[12px]">
                        <thead>
                          <tr className="text-left text-[11px] text-text-muted">
                            <th className="py-1 pr-2 font-medium">Filled</th>
                            <th className="px-2 py-1 font-medium">Average</th>
                            <th className="px-2 py-1 text-right font-medium">Margin</th>
                            <th className="px-2 py-1 text-right font-medium">Loss at stop</th>
                            <th className="px-2 py-1 text-right font-medium">If the TP plan completes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.scenarios.map((sc) => (
                            <tr key={sc.fills} className="border-t border-ink/[0.06]">
                              <td className="py-1.5 pr-2 text-text-primary">Entry 1{sc.fills > 1 ? `–${sc.fills}` : " only"}</td>
                              <td className="px-2 py-1.5 font-mono text-text-muted">{priceFmt(sc.avg, tick)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-text-muted">{money(sc.margin)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-negative">−{money(sc.lossAtSl)}</td>
                              <td className={`px-2 py-1.5 text-right font-mono ${pnlCls(sc.profitAllTps)}`}>{signed(sc.profitAllTps)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <p className="text-[11px] leading-relaxed text-text-muted">
                  Prices and sizes are rounded to {venue.label}'s own rules for {sym(pair)}; quantities round down so the
                  loss stays inside your budget. Liquidation is an estimate for isolated margin — your exchange's figure is the one that counts. Slippage on a fast
                  market can add to the loss. This is a sizing tool, not advice.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
