// src/components/autotrade/AutoTradeHelpModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Agent · Help & User Guide modal
// Two-pane layout mirroring ExchangeConnectModal: left = navigation,
// right = content for the selected section. Mobile collapses to one
// column with horizontal section chips. Self-contained, no extra
// dependencies beyond the existing AutoTradeUI primitives.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { FIELD_GUIDE, ENGINE_RULES } from "./autotradeFieldGuide";

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
  { id: "settings-reference", label: "Every setting, explained" },
  { id: "case-studies", label: "When something looks stuck" },
  { id: "faq", label: "FAQ" },
];

function H({ children }) {
  return <h3 className="text-base font-semibold text-text-primary">{children}</h3>;
}

function Sub({ children }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">{children}</p>
  );
}

function P({ children }) {
  return <p className="text-sm leading-6 text-text-secondary">{children}</p>;
}

function Code({ children }) {
  return (
    <code className="rounded bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[12px] text-text-primary/90">
      {children}
    </code>
  );
}

function Tip({ tone = "info", children }) {
  const palette =
    tone === "warn"
      ? "border-accent/30 bg-accent/[0.06]"
      : tone === "danger"
        ? "border-[#F6465D]/30 bg-[#F6465D]/[0.06]"
        : tone === "good"
          ? "border-[#0ECB81]/30 bg-[#0ECB81]/[0.05]"
          : "border-ink/[0.08] bg-ink/[0.02]";
  return (
    <div className={`rounded-lg border ${palette} px-4 py-3 text-xs leading-6 text-text-secondary`}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-ink/[0.06] bg-ink/[0.015] px-4 py-3.5">
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
        ? "border-accent/35"
        : "border-[#F6465D]/35";
  return (
    <div className={`rounded-lg border ${ring} bg-ink/[0.015] p-4`}>
      <p className="text-base font-semibold text-text-primary">{name}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-text-muted">{audience}</p>
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
        <H>How Agent decides</H>
        <P>
          Agent is an executor for LuxQuant signals. It never invents a trade — it only acts on
          signals you already see in the platform. Every signal flows through the same gates before
          any order is placed.
        </P>
      </div>

      <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.015] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Before any key
        </p>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
          <li>1. Sign the assistant notice</li>
          <li>2. Sign the live trading agreement — Connect stays hidden until this is done</li>
          <li>3. Link the helper (no keys yet)</li>
          <li>4. Connect one venue and paste the API key</li>
          <li>5. Set size and start dry-run, then live when you accept the risk</li>
        </ol>
      </div>

      <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.015] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Decision flow
        </p>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
          <li>1. Receive signal from LuxQuant</li>
          <li>2. Check signal risk level against your Risk Filter</li>
          <li>3. Check market — Spot or Futures enabled?</li>
          <li>4. Check Risk Limits — open positions, daily trades, cooldown</li>
          <li>5. Compute position size from your sizing rule</li>
          <li>6. Place a market entry on the exchange you connected</li>
          <li>7. Place protection: Fixed SL sends TP + stop; Trailing sends hard SL + trail (no TP order)</li>
          <li>8. Wait for those exchange orders — not the LuxQuant poster — to close the trade</li>
        </ol>
      </div>

      <Tip tone="info">
        Every block-decision is logged in the <b>Activity</b> tab so you can see why a signal was
        skipped. Agent only enters when every gate passes.
      </Tip>
    </div>
  );
}

function SectionMarkets() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Markets</Sub>
      <H>Choose where Agent trades</H>

      <Field label="Spot trading">
        Trades the actual coin on the venue’s spot book — you receive the asset, no leverage, no
        liquidation risk. Best for users new to automated execution.
      </Field>

      <Field label="Futures trading">
        Trades USDT-margined perpetual futures with leverage. The API key must have futures
        permission. Higher reward potential, but also liquidation risk if leverage is misused.
      </Field>

      <Tip tone="warn">
        You can enable both — Agent routes each signal to the market it belongs to. If a
        signal’s market is disabled here, it is skipped.
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
        Every entry uses exactly the <Code>Amount</Code> in USDT, regardless of balance.
        Predictable, easy to reason about. Recommended when you’re learning what works for you.
      </Field>

      <Field label="Method: Percent of balance">
        Every entry uses a percentage of your current available USDT. Your position size auto-scales
        as your balance grows or shrinks. Good for compounding once you trust the system.
      </Field>

      <Field label="Amount">
        The numeric value for the chosen method — USDT for <Code>Fixed</Code>, percent for{" "}
        <Code>Percent</Code>. This is the margin you commit, not the position size: live entries
        floor at <b>5 USDT</b>, which leverage multiplies up (5 USDT at 10× opens a 50 USDT
        position). 5 USDT is Agent’s live floor so venues do not reject the order.
      </Field>

      <Field label="Per trade cap (Risk Limits → Per trade cap)">
        Hard ceiling in USDT on a single trade. Regardless of what the sizing formula computes, no
        trade exceeds this cap. Acts as a safety net against misconfigured percentages.
      </Field>

      <Field label="Minimum reserve (Risk Limits → Minimum reserve)">
        Minimum USDT that must remain in your available balance after a trade. If executing a signal
        would drop available balance below this line, the signal is skipped.
      </Field>

      <Tip tone="info">
        <b>Rule of thumb:</b> keep size per trade at or below <b>2% of total capital</b>. With 5
        trades a day and a 40% win rate, this keeps the realistic max drawdown survivable.
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
        Each LuxQuant signal ships with multiple TP levels (TP1, TP2, TP3, TP4). Pick which one to
        use:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>TP1</b> — quickest fill, smaller reward, highest hit rate
          </li>
          <li>
            <b>TP2</b> — balanced reward / hit rate
          </li>
          <li>
            <b>TP3 / TP4</b> — bigger payoff if reached, but hits less often
          </li>
        </ul>
      </Field>

      <Field label="Stop Loss level">
        Same idea on the loss side. Most users keep this at SL1 — closer stop, smaller loss per
        trade.
      </Field>

      <Field label="Exit mode: Fixed SL">
        Agent places a take-profit at your chosen TP and a hard stop at your chosen SL. The
        position exits at whichever fills first. When LuxQuant marks that TP, the exchange order
        should already be closing the trade.
      </Field>

      <Field label="Exit mode: Trailing stop">
        Agent places two close orders at the fill: a hard stop at your SL, and a trailing stop at
        the callback you set. It does <b>not</b> place a take-profit. The trail is live from the
        fill — it does not wait for TP. Requires a <Code>Trailing callback</Code> percentage.
        Futures only; spot silently uses Fixed SL.
      </Field>

      <Field label="Trailing callback">
        How far price must pull back from the high (long) before the trail exits. Range{" "}
        <Code>0.1%</Code> to <Code>10%</Code>.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>0.5–1%</b> — tight. Often closes on noise, and cannot lock a TP1 smaller than the
            callback.
          </li>
          <li>
            <b>2–3%</b> — usual swing range
          </li>
          <li>
            <b>5–10%</b> — loose, gives more back on a reversal
          </li>
        </ul>
      </Field>

      <Tip tone="warn">
        On Trailing, your exchange often shows two close orders and labels the hard stop “TP/SL”.
        That is the stop, not a take-profit. LuxQuant marking TP1 does not close the BingX / Binance
        position. There is no trailing-only option — the hard SL stays as a floor. If the venue
        rejects protection, the fill is force-closed rather than left naked.
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
        Multiplier on your exposure. A 10 USDT margin at 10× leverage opens a position worth 100
        USDT.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>1×</b> — no leverage; behaves like spot inside futures (used for shorts)
          </li>
          <li>
            <b>3–5×</b> — moderate, room for normal market noise
          </li>
          <li>
            <b>10×</b> — common for swing trades on majors
          </li>
          <li>
            <b>20×+</b> — aggressive, liquidation sits close — not recommended for automated
            execution
          </li>
        </ul>
      </Field>

      <Field label="Margin mode: Isolated">
        Each position has its own margin pool. If liquidated, only that position’s margin is lost.{" "}
        <b>Recommended for Agent.</b>
      </Field>

      <Field label="Margin mode: Cross">
        All positions share your full futures wallet as collateral. More capital-efficient but a
        single bad trade can cascade across other positions. Only suitable for traders actively
        managing risk by hand.
      </Field>

      <Tip tone="danger">
        <b>Liquidation risk.</b> At 10× leverage, a –10% move against your position wipes out the
        margin. Most signals trigger their SL well before that, but gaps and slippage during extreme
        volatility can liquidate first. Never put capital into futures that you cannot afford to
        lose.
      </Tip>
    </div>
  );
}

function SectionRiskFilter() {
  return (
    <div className="space-y-5">
      <Sub>Settings panel · Risk Filter</Sub>
      <H>Which signals Agent accepts</H>

      <P>
        Every LuxQuant signal carries a risk tier. The Risk Filter chooses which tiers Agent is
        allowed to execute.
      </P>

      <Field label="All signals">
        Most permissive. Highest volume, exposes you to high-risk plays. Pair this with a higher{" "}
        <Code>Trades per day</Code> limit or you’ll burn the daily quota on speculative entries
        before the better signals arrive.
      </Field>

      <Field label="Low + Medium only (no High)">
        Balanced default. Skips the highest-risk signals while keeping the bulk of normal signal
        flow.
      </Field>

      <Field label="Low risk only">
        Most conservative. Far fewer signals, higher average hit rate. Best when you’re still
        building confidence in the system.
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
        Each limit is evaluated before every order. A signal is skipped at the first failing gate
        and the reason is logged in <b>Activity</b>.
      </P>

      <Field label="One position per symbol">
        Prevents stacking exposure on the same coin. If a BTCUSDT position is already open, another
        BTCUSDT signal is skipped.
      </Field>

      <Field label="Open positions">
        Maximum concurrent open positions across all symbols. When this cap is reached, new signals
        wait until a position closes.
      </Field>

      <Field label="Trades per day">
        Cap on new entries per UTC calendar day. Resets at <Code>00:00 UTC</Code>. Not a rolling 24h
        window — it’s a hard reset on date change.
      </Field>

      <Field label="Loss limit">
        Maximum realized loss for the current UTC day in USDT. When the day’s cumulative realized
        PnL hits this floor, new entries stop until the next reset.
      </Field>

      <Field label="Per trade cap">
        Hard ceiling per trade in USDT (also referenced under sizing).
      </Field>

      <Field label="Minimum reserve">
        Minimum USDT to keep in available balance after a trade.
      </Field>

      <Field label="After loss (cooldown)">
        After a losing trade closes, blocks new entries for this many minutes. Prevents automated
        revenge-trading right after a loss.
      </Field>

      <Field label="After error (cooldown)">
        After an exchange error blocks an execution, pauses new entries for this many minutes.
        Prevents error storms when something infrastructural is wrong.
      </Field>

      <Tip tone="info">
        If you see many signals skipped with reasons like <Code>max_daily_trades</Code> or{" "}
        <Code>loss_cooldown</Code>, that is Agent protecting you correctly. Raise limits
        gradually — never jump from 5 to 20.
      </Tip>
    </div>
  );
}

function SectionSpotVsFutures() {
  return (
    <div className="space-y-5">
      <Sub>Choosing your market</Sub>
      <H>Spot vs Futures</H>

      <div className="overflow-hidden rounded-lg border border-ink/[0.06]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink/[0.06] bg-ink/[0.02] text-left font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
              <tr key={row[0]} className="border-b border-ink/[0.04] last:border-0">
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
        You’re new to Agent. You want to learn without liquidation risk. You prefer holding the
        asset and riding momentum.
      </P>

      <H>When to pick Futures</H>
      <P>
        You have limited capital and want larger exposure. You want to take short signals. You
        already understand position sizing under leverage and SL discipline.
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
        These are starting points, not magic numbers. Copy the values into Settings, run for two
        weeks, then adjust based on your results.
      </P>

      <div className="grid gap-3 lg:grid-cols-3">
        <PresetCard
          name="Conservative"
          audience="New to Agent · $50–200"
          accent="good"
          items={[
            ["Spot trading", "ON"],
            ["Futures trading", "OFF"],
            ["Method", "Fixed USDT"],
            ["Amount", "12"],
            ["Per trade cap", "15"],
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
        Aggressive only makes sense when you’re emotionally ready to see 30%+ drawdowns without
        panic-pausing. If you’re not sure, drop back to Balanced.
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
        Binance fees (0.1% spot, 0.04% futures) eat too much of the small PnL on tiny trades. A $5
        trade earning $0.05 after $0.02 fees is barely net positive — and a single loss undoes days
        of work.
      </Field>

      <Field label="$50–300 — learning zone">
        Big enough to absorb fees and run 3–5 trades per day at $5–10 each. A 10% drawdown is $5–30
        — emotionally manageable.
      </Field>

      <Field label="$500–1500 — Balanced sweet spot">
        Percent-based sizing of 2% gives $10–30 trades. Daily loss limit of $10–30 sits at 2% of
        capital — meaningful protection without being overly restrictive.
      </Field>

      <Field label="$2000+ — power user">
        Room for spot + futures in parallel, multiple open positions, and a more aggressive risk
        filter. Can absorb 1–2 unlucky weeks without the system being unable to recover.
      </Field>

      <Tip tone="info">
        <b>Simple sizing rule:</b> only put in capital equal to <i>five times</i>
        the amount you would be okay losing. If $100 is what you’re ready to lose, start with $500 —
        that’s a 20% drawdown buffer at 1% sizing.
      </Tip>
    </div>
  );
}

function SectionFAQ() {
  const qa = [
    {
      q: "Why can’t I connect my exchange yet?",
      a: "The live trading agreement must be signed first. Connect is hidden until that form is saved. Unsigned keys are disconnected. Signing is not going live — you still choose dry-run vs live after the key is in.",
    },
    {
      q: "Why are so many signals skipped today?",
      a: "Check the Activity tab — each skip has a reason (max_daily_trades, loss_cooldown, max_open_positions). These are protections you configured. If you want more trades, raise the relevant limit slowly.",
    },
    {
      q: "Agent paused itself. What happened?",
      a: "Three possibilities: (1) you toggled it off; (2) after the first live entry, Agent auto-pauses as a safety canary — resume manually; (3) an emergency action like sell-all triggered a pause. The Activity log shows the exact event.",
    },
    {
      q: "My winning trade was recorded as a loss?",
      a: "Check fees. A $5 trade with thin profit can be net-negative after entry + exit fees. Use TP2+ or a wider custom TP percentage so profit comfortably exceeds fees.",
    },
    {
      q: "Why do I see two SL / “TP/SL” plus a trailing stop?",
      a: "Trailing mode places a hard stop at your SL and a trailing close. The venue often labels the stop “TP/SL” even though it is not a take-profit. That is expected — not a duplicate bug. There is no trailing-only option.",
    },
    {
      q: "LuxQuant shows TP1 but my exchange position is still open?",
      a: "On Trailing stop, Agent does not place a take-profit order. TP1 on the signal / poster is a price status, not a fill. The position closes only when the hard SL or the trailing pullback hits. Switch to Fixed SL if you want that TP to take profit on the venue.",
    },
    {
      q: "Position TP/SL columns on BingX are empty?",
      a: "We send standalone close orders, not TP/SL attached to the position row. Open the Current / Open orders tab — the stop and the trail are there.",
    },
    {
      q: "My futures position quantity is way larger than my margin?",
      a: "That’s leverage, not a bug. A $10 margin at 10× opens a $100 notional position; quantity = $100 / coin price. Your wallet only holds $10 — the exchange is sizing the position by notional.",
    },
    {
      q: "Agent can’t turn on Futures — canTrade: false?",
      a: "The API key does not have futures permission. Edit the key on the exchange, enable futures, and save with 2FA. If the key is IP-restricted, whitelist both 187.127.135.84 (primary) and 103.197.189.58 (backup). Agent uses the second IP when the first is rate-limited.",
    },
    {
      q: "If I change my exchange API key, do I lose my settings?",
      a: "No. Strategy and history are tied to your LuxQuant account, not to a specific API key. Replacing the key only updates the credentials — strategy, positions, and trade history stay intact.",
    },
    {
      q: "What should I check every morning?",
      a: "(1) Trade History — yesterday’s PnL. (2) Activity — anything blocked for unexpected reasons? (3) Positions — any reconciliation_required? That needs attention. (4) Daily loss — within your comfort zone?",
    },
    {
      q: "Can I run Agent unattended for weeks?",
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
            className="rounded-lg border border-ink/[0.06] bg-ink/[0.015] px-4 py-3.5"
          >
            <p className="text-[13px] font-semibold text-text-primary">{item.q}</p>
            <p className="mt-1.5 text-xs leading-6 text-text-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// The same content the "?" buttons show on the Configure tab, laid out for
// reading end to end. One source (autotradeFieldGuide.js) so they cannot drift.
const REFERENCE_GROUPS = [
  { heading: "Engine", keys: ["is_active"] },
  { heading: "Markets", keys: ["spot_enabled", "futures_enabled", "dry_run"] },
  {
    heading: "Position sizing",
    keys: ["sizing_method", "sizing_value", "leverage", "margin_mode"],
  },
  {
    heading: "Take profit / Stop loss",
    keys: ["tp_level", "sl_level", "exit_mode", "trailing_callback_rate"],
  },
  { heading: "Risk filter", keys: ["allowed_risk_levels"] },
  {
    heading: "Risk limits",
    keys: [
      "one_open_position_per_symbol",
      "max_open_positions",
      "max_trade_notional_usdt",
      "max_daily_trades",
      "daily_loss_limit_usdt",
      "min_available_usdt",
      "cooldown_after_loss_minutes",
      "cooldown_after_error_minutes",
    ],
  },
];

function SectionSettingsReference() {
  return (
    <div className="space-y-6">
      <Sub>Full reference</Sub>
      <H>Every setting, explained</H>
      <P>
        Each entry says what the setting does, shows a worked example with real numbers, and
        flags the behaviour that is real but not visible in the interface. The same text sits
        behind the <b>?</b> next to every field on the Configure tab.
      </P>

      {REFERENCE_GROUPS.map((group) => (
        <div key={group.heading} className="space-y-3">
          <H>{group.heading}</H>
          {group.keys.map((key) => {
            const guide = FIELD_GUIDE[key];
            if (!guide) return null;
            return (
              <div
                key={key}
                className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] p-4"
              >
                <p className="text-sm font-semibold text-text-primary">{guide.title}</p>
                <p className="mt-1.5 text-[13px] leading-6 text-text-secondary">{guide.what}</p>
                <p className="mt-2.5 text-[12px] leading-6 text-text-muted">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    Example
                  </span>
                  <br />
                  {guide.example}
                </p>
                {guide.watch ? (
                  <p className="mt-2 text-[12px] leading-6 text-text-muted">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
                      Watch out
                    </span>
                    <br />
                    {guide.watch}
                  </p>
                ) : null}
                {Array.isArray(guide.scenarios) && guide.scenarios.length ? (
                  <div className="mt-3 space-y-2 border-t border-ink/[0.06] pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                      Scenarios
                    </p>
                    {guide.scenarios.map((item) => (
                      <p key={item.title} className="text-[12px] leading-6 text-text-muted">
                        <span className="font-medium text-text-secondary">{item.title}. </span>
                        {item.body}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      <H>Rules you cannot configure</H>
      <P>These are always on. They are the reasons an entry can be blocked even when every setting above is correct.</P>
      {ENGINE_RULES.map((rule) => (
        <Field key={rule.title} label={rule.title}>
          {rule.body}
        </Field>
      ))}
    </div>
  );
}

function SectionCaseStudies() {
  return (
    <div className="space-y-5">
      <Sub>Real situations</Sub>
      <H>When something looks stuck</H>
      <P>
        These are the cases support actually sees. Each one starts with what you’d notice on screen,
        because the symptom rarely names the cause.
      </P>

      <Field label="Case 1 — “Every signal says reconciliation required”">
        One of your positions could not be matched against the exchange, and that pauses <i>all</i>{" "}
        new entries until it clears — it is a gate, not a per-signal skip. The usual cause is that
        the coin left your wallet outside the bot: you sold, converted or transferred it on the
        exchange directly. Any of those cancels the protective orders first, which is exactly what
        leaves the bot with a position it can no longer see or protect. The reconciler now detects
        this on its own — once it confirms the balance is really gone, it closes the position and
        the gate lifts. Nothing for you to do but wait a minute.
      </Field>

      <Field label="Case 1b — “Force sell keeps failing”">
        If you press force-sell and get <i>No free balance available after cancelling protection</i>,
        the coin is already gone from your spot wallet. Force-sell has nothing to sell, so it fails,
        and — this is the part that used to trap people — a failed force-sell records no exit, so it
        cannot clear the position either. Pressing it repeatedly will not help. Leave it; the
        reconciler resolves this case automatically now.
      </Field>

      <Field label="Case 2 — “The block cleared but nothing trades”">
        Clearing a stuck position only removes the gate. If your spot wallet holds no USDT, entries
        still cannot be placed — the bot buys with USDT, and coins you already hold do not count.
        Check free USDT before assuming something is still broken.
      </Field>

      <Field label="Case 3 — “Every signal skips with max trade notional”">
        Your Per-trade cap sits below the size the signal needs. The live minimum is 5 USDT of{" "}
        <i>margin</i>, and on futures leverage multiplies that into the actual position — Amount is
        margin, not position size. A cap under your Amount skips every single signal, silently.
      </Field>

      <Field label="Case 4 — “Spot entries fail at the minimum size”">
        On spot the binding constraint is not your entry, it’s the protective stop leg: quantity ×
        stop-limit price must clear the venue’s minimum notional. Because the stop sits below your
        entry, a 5 USDT spot entry lands under that threshold as soon as the stop is more than a few
        percent away. Give spot 10–15 USDT per trade so the stop leg fits comfortably.
      </Field>

      <Tip tone="info">
        The Activity tab now spells out every risk-limit reason with the live numbers behind it, and
        marks the ones that pause everything versus the ones that held back a single signal.
      </Tip>
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
  "settings-reference": SectionSettingsReference,
  "case-studies": SectionCaseStudies,
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
    <div className="lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="lq-scrim" onClick={onClose} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 flex w-full max-w-[940px] max-h-[min(var(--lq-modal-maxh),100%)] flex-col overflow-hidden rounded-t-3xl border-t border-ink/[0.08] bg-surface-raised shadow-[0_-20px_60px_rgb(var(--scrim) / 0.35)] sm:rounded-2xl sm:border sm:shadow-[0_30px_80px_rgb(var(--scrim) / 0.35)]"
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="relative w-full">
            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-ink/[0.06] hover:text-text-primary"
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
              <div className="border-b border-ink/[0.06] p-6 lg:border-b-0 lg:border-r lg:p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
                  Guide
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/12 text-accent">
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
                    Agent Guide
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Everything you need to configure, run, and review Agent safely — written in
                  the same language you see in the UI.
                </p>

                {/* Mobile: horizontal scrolling pills */}
                <div className="mt-6 -mx-1 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
                  {SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActive(section.id)}
                      className={`whitespace-nowrap rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                        active === section.id
                          ? "border-ink/35 bg-accent/12 text-accent"
                          : "border-ink/[0.07] text-text-muted"
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
                              ? "bg-accent/12 text-accent"
                              : "text-text-secondary hover:bg-ink/[0.03] hover:text-text-primary"
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

                <div className="mt-7 space-y-3 border-t border-ink/[0.06] pt-5">
                  <p className="text-xs leading-5 text-text-muted">
                    All numbers in the guide reflect the actual fields shown in your Settings panel.
                  </p>
                  <p className="text-xs leading-5 text-text-muted">
                    Press <Code>Esc</Code> or click outside to close.
                  </p>
                </div>
              </div>

              {/* RIGHT pane — content */}
              <div
                className="max-h-[min(70dvh,78vh)] overflow-y-auto p-6 lg:p-8"
                style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
              >
                <Renderer />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
