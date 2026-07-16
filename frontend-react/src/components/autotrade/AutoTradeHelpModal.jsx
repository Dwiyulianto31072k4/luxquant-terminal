// src/components/autotrade/AutoTradeHelpModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Help & User Guide modal
// Two-pane layout mirroring ExchangeConnectModal: left = navigation,
// right = content for the selected section. Mobile collapses to one
// column with horizontal section chips. Self-contained, no extra
// dependencies beyond the existing AutoTradeUI primitives.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "markets", label: "Markets" },
  { id: "sizing", label: "Position Sizing" },
  { id: "tp-sl", label: "Take Profit / Stop Loss" },
  { id: "futures", label: "Futures (Leverage & Margin)" },
  { id: "risk-filter", label: "Risk Filter" },
  { id: "risk-limits", label: "Risk Limits" },
  { id: "spot-vs-futures", label: "Spot vs Futures" },
  { id: "presets", label: "Preset profiles" },
  { id: "capital", label: "Capital guidance" },
  { id: "faq", label: "FAQ" },
];

function H({ children }) {
  return (
    <h3 className="text-base font-semibold text-text-primary">{children}</h3>
  );
}

function Sub({ children }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/80">
      {children}
    </p>
  );
}

function P({ children }) {
  return (
    <p className="text-sm leading-6 text-text-secondary">{children}</p>
  );
}

function Code({ children }) {
  return (
    <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[12px] text-text-primary/90">
      {children}
    </code>
  );
}

function Tip({ tone = "info", children }) {
  const palette =
    tone === "warn"
      ? "border-[#F3BA2F]/30 bg-[#F3BA2F]/[0.06]"
      : tone === "danger"
        ? "border-[#F6465D]/30 bg-[#F6465D]/[0.06]"
        : tone === "good"
          ? "border-[#0ECB81]/30 bg-[#0ECB81]/[0.05]"
          : "border-white/[0.08] bg-white/[0.02]";
  return (
    <div className={`rounded-lg border ${palette} px-4 py-3 text-xs leading-6 text-text-secondary`}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-3.5">
      <p className="text-[13px] font-semibold text-text-primary">{label}</p>
      <div className="text-xs leading-6 text-text-muted">{children}</div>
    </div>
  );
}

function PresetCard({ name, audience, accent, items }) {
  const ring =
    accent === "good"
      ? "border-[#0ECB81]/35"
      : accent === "warn"
        ? "border-[#F3BA2F]/35"
        : "border-[#F6465D]/35";
  return (
    <div className={`rounded-lg border ${ring} bg-white/[0.015] p-4`}>
      <p className="text-base font-semibold text-text-primary">{name}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-text-muted">
        {audience}
      </p>
      <div className="mt-3 space-y-1.5 font-mono text-[11px] leading-5 text-text-secondary">
        {items.map((item) => (
          <div key={item[0]} className="flex justify-between gap-3">
            <span className="text-text-muted">{item[0]}</span>
            <span className="text-text-primary/90">{item[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Section renderers
// ────────────────────────────────────────────────────────────────

function SectionHowItWorks() {
  return (
    <div className="space-y-5">
      <div>
        <Sub>Mental model</Sub>
        <H>How AutoTrade decides</H>
        <P>
          AutoTrade is an executor for LuxQuant signals. It never invents
          a trade — it only acts on signals you already see in the platform.
          Every signal flows through the same gates before any order is
          placed.
        </P>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-gold-primary/80">
          Decision flow
        </p>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
          <li>1. Receive signal from LuxQuant</li>
          <li>2. Check signal risk level against your Risk Filter</li>
          <li>3. Check market — Spot or Futures enabled?</li>
          <li>4. Check Risk Limits — open positions, daily trades, cooldown</li>
          <li>5. Compute position size from your sizing rule</li>
          <li>6. Place market entry + protective TP / SL on Binance</li>
          <li>7. Monitor until TP / SL fills, record the result</li>
        </ol>
      </div>

      <Tip tone="info">
        Every block-decision is logged in the <b>Activity</b> tab so you can
        see why a signal was skipped. AutoTrade only enters when every gate
        passes.
      </Tip>
    </div>
  );
}

function SectionMarkets() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Markets</Sub>
      <H>Choose where AutoTrade trades</H>

      <Field label="Spot trading">
        Trades the actual coin on Binance Spot — you receive the asset, no
        leverage, no liquidation risk. Best for users new to automated
        execution.
      </Field>

      <Field label="Futures trading">
        Trades USDⓈ-M perpetual futures with leverage. Requires Binance API
        key with Futures permission enabled. Higher reward potential, but
        also liquidation risk if leverage is misused.
      </Field>

      <Tip tone="warn">
        You can enable both — AutoTrade routes each signal to the market it
        belongs to. If a signal’s market is disabled here, it is skipped.
      </Tip>
    </div>
  );
}

function SectionSizing() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Position Sizing</Sub>
      <H>How much capital per trade</H>

      <Field label="Method: Fixed USDT">
        Every entry uses exactly the <Code>Amount</Code> in USDT, regardless
        of balance. Predictable, easy to reason about. Recommended when
        you’re learning what works for you.
      </Field>

      <Field label="Method: Percent of balance">
        Every entry uses a percentage of your current available USDT. Your
        position size auto-scales as your balance grows or shrinks. Good for
        compounding once you trust the system.
      </Field>

      <Field label="Amount">
        The numeric value for the chosen method — USDT for <Code>Fixed</Code>,
        percent for <Code>Percent</Code>.
      </Field>

      <Field label="Per trade cap (Risk Limits → Per trade cap)">
        Hard ceiling in USDT on a single trade. Regardless of what the
        sizing formula computes, no trade exceeds this cap. Acts as a
        safety net against misconfigured percentages.
      </Field>

      <Field label="Minimum reserve (Risk Limits → Minimum reserve)">
        Minimum USDT that must remain in your available balance after a
        trade. If executing a signal would drop available balance below this
        line, the signal is skipped.
      </Field>

      <Tip tone="info">
        <b>Rule of thumb:</b> keep size per trade at or below <b>2% of total
        capital</b>. With 5 trades a day and a 40% win rate, this keeps the
        realistic max drawdown survivable.
      </Tip>
    </div>
  );
}

function SectionTpSl() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Take Profit / Stop Loss</Sub>
      <H>When to exit</H>

      <Field label="Take Profit target">
        Each LuxQuant signal ships with multiple TP levels (TP1, TP2, TP3,
        TP4). Pick which one to use:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>TP1</b> — quickest fill, smaller reward, highest hit rate</li>
          <li><b>TP2</b> — balanced reward / hit rate</li>
          <li><b>TP3 / TP4</b> — bigger payoff if reached, but hits less often</li>
        </ul>
      </Field>

      <Field label="Stop Loss level">
        Same idea on the loss side. Most users keep this at SL1 — closer
        stop, smaller loss per trade.
      </Field>

      <Field label="Exit mode: Fixed SL">
        Stop Loss sits where it was placed at entry. Position exits at
        either TP or SL — two simple outcomes. Recommended for short-swing
        signals where the move plays out quickly.
      </Field>

      <Field label="Exit mode: Trailing stop">
        After the take-profit level is reached, a trailing stop begins
        following the price up (for longs). Locks in profit while letting
        winners run. Requires a <Code>Trailing callback</Code> percentage.
      </Field>

      <Field label="Trailing callback">
        Distance the trailing stop keeps from the highest price seen. Range
        on Binance Futures: <Code>0.1%</Code> to <Code>10%</Code>.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>0.5–1%</b> — tight, locks profit fast but exits prematurely on noise</li>
          <li><b>2–3%</b> — balanced, sweet spot for most crypto swings</li>
          <li><b>5–10%</b> — loose, lets profit run further but gives more back on reversal</li>
        </ul>
      </Field>

      <Tip tone="warn">
        Stop loss is always required — there is no “no SL” option. If
        Binance rejects the protective order, the reconciler marks the
        position as unprotected and blocks further entries until the issue
        clears.
      </Tip>
    </div>
  );
}

function SectionFutures() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Futures</Sub>
      <H>Leverage and margin mode</H>

      <Field label="Leverage (1× – 125×)">
        Multiplier on your exposure. A 10 USDT margin at 10× leverage opens
        a position worth 100 USDT.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>1×</b> — no leverage; behaves like spot inside futures (used for shorts)</li>
          <li><b>3–5×</b> — moderate, room for normal market noise</li>
          <li><b>10×</b> — common for swing trades on majors</li>
          <li><b>20×+</b> — aggressive, liquidation sits close — not recommended for automated execution</li>
        </ul>
      </Field>

      <Field label="Margin mode: Isolated">
        Each position has its own margin pool. If liquidated, only that
        position’s margin is lost. <b>Recommended for AutoTrade.</b>
      </Field>

      <Field label="Margin mode: Cross">
        All positions share your full futures wallet as collateral. More
        capital-efficient but a single bad trade can cascade across other
        positions. Only suitable for traders actively managing risk by hand.
      </Field>

      <Tip tone="danger">
        <b>Liquidation risk.</b> At 10× leverage, a –10% move against your
        position wipes out the margin. Most signals trigger their SL well
        before that, but gaps and slippage during extreme volatility can
        liquidate first. Never put capital into futures that you cannot
        afford to lose.
      </Tip>
    </div>
  );
}

function SectionRiskFilter() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Risk Filter</Sub>
      <H>Which signals AutoTrade accepts</H>

      <P>
        Every LuxQuant signal carries a risk tier. The Risk Filter chooses
        which tiers AutoTrade is allowed to execute.
      </P>

      <Field label="All signals">
        Most permissive. Highest volume, exposes you to high-risk plays.
        Pair this with a higher <Code>Trades per day</Code> limit or you’ll
        burn the daily quota on speculative entries before the better
        signals arrive.
      </Field>

      <Field label="Low + Medium only (no High)">
        Balanced default. Skips the highest-risk signals while keeping the
        bulk of normal signal flow.
      </Field>

      <Field label="Low risk only">
        Most conservative. Far fewer signals, higher average hit rate. Best
        when you’re still building confidence in the system.
      </Field>
    </div>
  );
}

function SectionRiskLimits() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Risk Limits</Sub>
      <H>Capital protection layers</H>

      <P>
        Each limit is evaluated before every order. A signal is skipped at
        the first failing gate and the reason is logged in <b>Activity</b>.
      </P>

      <Field label="One position per symbol">
        Prevents stacking exposure on the same coin. If a BTCUSDT position
        is already open, another BTCUSDT signal is skipped.
      </Field>

      <Field label="Open positions">
        Maximum concurrent open positions across all symbols. When this cap
        is reached, new signals wait until a position closes.
      </Field>

      <Field label="Trades per day">
        Cap on new entries per UTC calendar day. Resets at <Code>00:00 UTC</Code>.
        Not a rolling 24h window — it’s a hard reset on date change.
      </Field>

      <Field label="Loss limit">
        Maximum realized loss for the current UTC day in USDT. When the
        day’s cumulative realized PnL hits this floor, new entries stop
        until the next reset.
      </Field>

      <Field label="Per trade cap">
        Hard ceiling per trade in USDT (also referenced under sizing).
      </Field>

      <Field label="Minimum reserve">
        Minimum USDT to keep in available balance after a trade.
      </Field>

      <Field label="After loss (cooldown)">
        After a losing trade closes, blocks new entries for this many
        minutes. Prevents automated revenge-trading right after a loss.
      </Field>

      <Field label="After error (cooldown)">
        After a Binance error blocks an execution, pauses new entries for
        this many minutes. Prevents error storms when something
        infrastructural is wrong.
      </Field>

      <Tip tone="info">
        If you see many signals skipped with reasons like{" "}
        <Code>max_daily_trades</Code> or <Code>loss_cooldown</Code>, that is
        AutoTrade protecting you correctly. Raise limits gradually — never
        jump from 5 to 20.
      </Tip>
    </div>
  );
}

function SectionSpotVsFutures() {
  return (
    <div className="space-y-5">
      <Sub>Choosing your market</Sub>
      <H>Spot vs Futures</H>

      <div className="overflow-hidden rounded-lg border border-white/[0.06]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <th className="px-3 py-2.5">Aspect</th>
              <th className="px-3 py-2.5">Spot</th>
              <th className="px-3 py-2.5">Futures</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            {[
              ["What you hold", "Actual coin", "Derivative contract"],
              ["Worst case", "Capital can go to zero", "Liquidation, faster"],
              ["Leverage", "None (1×)", "1× – 125×"],
              ["Shorts", "Not supported", "Yes"],
              ["Funding fee", "None", "Every 8 hours"],
              ["Best for", "Swing 1–3 days, longs", "Scalps & swings, longs or shorts"],
              ["Minimum useful capital", "$50+", "$20+ (because of leverage)"],
            ].map((row) => (
              <tr key={row[0]} className="border-b border-white/[0.04] last:border-0">
                <td className="px-3 py-2.5 text-text-muted">{row[0]}</td>
                <td className="px-3 py-2.5">{row[1]}</td>
                <td className="px-3 py-2.5">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H>When to pick Spot</H>
      <P>
        You’re new to AutoTrade. You want to learn without liquidation risk.
        You prefer holding the asset and riding momentum.
      </P>

      <H>When to pick Futures</H>
      <P>
        You have limited capital and want larger exposure. You want to take
        short signals. You already understand position sizing under
        leverage and SL discipline.
      </P>
    </div>
  );
}

function SectionPresets() {
  return (
    <div className="space-y-5">
      <Sub>Starting points</Sub>
      <H>Preset profiles</H>
      <P>
        These are starting points, not magic numbers. Copy the values into
        Settings, run for two weeks, then adjust based on your results.
      </P>

      <div className="grid gap-3 lg:grid-cols-3">
        <PresetCard
          name="Conservative"
          audience="New to AutoTrade · $50–200"
          accent="good"
          items={[
            ["Spot trading", "ON"],
            ["Futures trading", "OFF"],
            ["Method", "Fixed USDT"],
            ["Amount", "5"],
            ["Per trade cap", "5"],
            ["Minimum reserve", "10"],
            ["Risk filter", "Low only"],
            ["Take Profit", "TP1"],
            ["Stop Loss", "SL1"],
            ["Exit mode", "Fixed SL"],
            ["Open positions", "2"],
            ["Trades per day", "3"],
            ["Loss limit", "5"],
            ["After loss", "90 min"],
          ]}
        />
        <PresetCard
          name="Balanced"
          audience="Comfortable trader · $200–1000"
          accent="warn"
          items={[
            ["Spot trading", "ON"],
            ["Futures trading", "OFF"],
            ["Method", "Percent of balance"],
            ["Amount", "2"],
            ["Per trade cap", "15"],
            ["Minimum reserve", "20"],
            ["Risk filter", "Low + Medium"],
            ["Take Profit", "TP2"],
            ["Stop Loss", "SL1"],
            ["Exit mode", "Fixed SL"],
            ["Open positions", "3"],
            ["Trades per day", "5"],
            ["Loss limit", "10"],
            ["After loss", "60 min"],
          ]}
        />
        <PresetCard
          name="Aggressive"
          audience="Experienced · $1000+"
          accent="danger"
          items={[
            ["Spot trading", "ON"],
            ["Futures trading", "ON"],
            ["Method", "Percent of balance"],
            ["Amount", "3"],
            ["Per trade cap", "50"],
            ["Risk filter", "All signals"],
            ["Futures TP", "TP2"],
            ["Futures exit", "Trailing stop"],
            ["Trailing callback", "2.5%"],
            ["Leverage", "5×"],
            ["Margin mode", "Isolated"],
            ["Open positions", "6"],
            ["Trades per day", "10"],
            ["Loss limit", "50"],
            ["After loss", "30 min"],
          ]}
        />
      </div>

      <Tip tone="warn">
        Aggressive only makes sense when you’re emotionally ready to see
        30%+ drawdowns without panic-pausing. If you’re not sure, drop back
        to Balanced.
      </Tip>
    </div>
  );
}

function SectionCapital() {
  return (
    <div className="space-y-5">
      <Sub>Capital guidance</Sub>
      <H>How much should you start with?</H>

      <Field label="Below $30 — not recommended">
        Binance fees (0.1% spot, 0.04% futures) eat too much of the small
        PnL on tiny trades. A $5 trade earning $0.05 after $0.02 fees is
        barely net positive — and a single loss undoes days of work.
      </Field>

      <Field label="$50–300 — learning zone">
        Big enough to absorb fees and run 3–5 trades per day at $5–10
        each. A 10% drawdown is $5–30 — emotionally manageable.
      </Field>

      <Field label="$500–1500 — Balanced sweet spot">
        Percent-based sizing of 2% gives $10–30 trades. Daily loss limit
        of $10–30 sits at 2% of capital — meaningful protection without
        being overly restrictive.
      </Field>

      <Field label="$2000+ — power user">
        Room for spot + futures in parallel, multiple open positions, and a
        more aggressive risk filter. Can absorb 1–2 unlucky weeks without
        the system being unable to recover.
      </Field>

      <Tip tone="info">
        <b>Simple sizing rule:</b> only put in capital equal to <i>five times</i>
        the amount you would be okay losing. If $100 is what you’re ready
        to lose, start with $500 — that’s a 20% drawdown buffer at 1% sizing.
      </Tip>
    </div>
  );
}

function SectionFAQ() {
  const qa = [
    {
      q: "Why are so many signals skipped today?",
      a: "Check the Activity tab — each skip has a reason (max_daily_trades, loss_cooldown, max_open_positions). These are protections you configured. If you want more trades, raise the relevant limit slowly.",
    },
    {
      q: "AutoTrade paused itself. What happened?",
      a: "Three possibilities: (1) you toggled it off; (2) after the first live entry, AutoTrade auto-pauses as a safety canary — resume manually; (3) an emergency action like sell-all triggered a pause. The Activity log shows the exact event.",
    },
    {
      q: "My winning trade was recorded as a loss?",
      a: "Check fees. A $5 trade with thin profit can be net-negative after entry + exit fees. Use TP2+ or a wider custom TP percentage so profit comfortably exceeds fees.",
    },
    {
      q: "My futures position quantity is way larger than my margin?",
      a: "That’s leverage, not a bug. A $10 margin at 10× opens a $100 notional position; quantity = $100 / coin price. Your wallet only holds $10 — Binance is sizing the position by notional.",
    },
    {
      q: "AutoTrade can’t turn on Futures — canTrade: false?",
      a: "Your Binance API key doesn’t have Futures permission enabled. Go to your Binance API management, edit the key, enable Futures, and save with 2FA. Some keys also need IP whitelisting before Futures can be enabled.",
    },
    {
      q: "If I change my Binance API key, do I lose my settings?",
      a: "No. Strategy and history are tied to your LuxQuant account, not to a specific API key. Replacing the key only updates the credentials — strategy, positions, and trade history stay intact.",
    },
    {
      q: "What should I check every morning?",
      a: "(1) Trade History — yesterday’s PnL. (2) Activity — anything blocked for unexpected reasons? (3) Positions — any reconciliation_required? That needs attention. (4) Daily loss — within your comfort zone?",
    },
    {
      q: "Can I run AutoTrade unattended for weeks?",
      a: "Yes, if your API key is valid, the IP whitelist (if any) hasn’t changed, USDT balance stays above your minimum reserve, and there are no unresolved positions. Still review weekly — markets shift and signal quality drifts.",
    },
  ];
  return (
    <div className="space-y-4">
      <Sub>Frequently asked</Sub>
      <H>FAQ</H>
      <div className="space-y-3">
        {qa.map((item) => (
          <div
            key={item.q}
            className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-3.5"
          >
            <p className="text-[13px] font-semibold text-text-primary">{item.q}</p>
            <p className="mt-1.5 text-xs leading-6 text-text-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const RENDERERS = {
  "how-it-works": SectionHowItWorks,
  markets: SectionMarkets,
  sizing: SectionSizing,
  "tp-sl": SectionTpSl,
  futures: SectionFutures,
  "risk-filter": SectionRiskFilter,
  "risk-limits": SectionRiskLimits,
  "spot-vs-futures": SectionSpotVsFutures,
  presets: SectionPresets,
  capital: SectionCapital,
  faq: SectionFAQ,
};

// ────────────────────────────────────────────────────────────────
// Modal shell
// ────────────────────────────────────────────────────────────────
export default function AutoTradeHelpModal({ isOpen, onClose }) {
  const [active, setActive] = useState("how-it-works");

  useEffect(() => {
    if (!isOpen) return;
    setActive("how-it-works");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const Renderer = RENDERERS[active] || SectionHowItWorks;

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 flex w-full max-w-[940px] max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08] bg-surface-raised shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:rounded-2xl sm:border sm:shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative w-full">
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
            {/* LEFT pane — navigation */}
            <div className="border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r lg:p-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-primary/80">
                Guide
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-primary/10 text-gold-primary">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                  AutoTrade Guide
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Everything you need to configure, run, and review AutoTrade
                safely — written in the same language you see in the UI.
              </p>

              {/* Mobile: horizontal scrolling pills */}
              <div className="mt-6 -mx-1 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActive(section.id)}
                    className={`whitespace-nowrap rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                      active === section.id
                        ? "border-gold-primary/35 bg-gold-primary/10 text-gold-primary"
                        : "border-white/[0.07] text-text-muted"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              {/* Desktop: vertical list */}
              <ul className="mt-7 hidden space-y-1 lg:block">
                {SECTIONS.map((section) => {
                  const selected = active === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        onClick={() => setActive(section.id)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "bg-gold-primary/10 text-gold-primary"
                            : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                        }`}
                      >
                        <span>{section.label}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
                          {selected ? "▸" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-7 space-y-3 border-t border-white/[0.06] pt-5">
                <p className="text-xs leading-5 text-text-muted">
                  All numbers in the guide reflect the actual fields shown
                  in your Settings panel.
                </p>
                <p className="text-xs leading-5 text-text-muted">
                  Press <Code>Esc</Code> or click outside to close.
                </p>
              </div>
            </div>

            {/* RIGHT pane — content */}
            <div className="max-h-[min(70dvh,78vh)] overflow-y-auto p-6 lg:p-8" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
              <Renderer />
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
