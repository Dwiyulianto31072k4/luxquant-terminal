// First screen on Agent. Not a pitch. Users asked for help placing
// their own rules when they cannot sit at the desk. LuxQuant does not
// sell this as a money product. They still have to drive.

import { useState } from "react";
import { submitAgentDisclaimerAck } from "../../services/authApi";
import { ASSISTANT_FORM, buildAckPayload } from "./agentDisclaimerCopy";
import { Card, GoldButton, GhostButton, Notice } from "./AutoTradeUI";

const CHECKS = ASSISTANT_FORM.checks;

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">{title}</h3>
      <div className="space-y-2.5 text-[13.5px] leading-6 text-text-secondary">{children}</div>
    </section>
  );
}

export default function AgentDisclaimer({ onAccept, compact = false, onCollapse }) {
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = CHECKS.every((item) => checked[item.id]);

  const accept = async () => {
    setSaving(true);
    setError("");
    try {
      await submitAgentDisclaimerAck(buildAckPayload(ASSISTANT_FORM, checked));
      await onAccept?.();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Could not save the signed form");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-ink/[0.1] bg-surface-raised">
      <div className="mx-auto max-w-3xl space-y-7">
        <header>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Please read this first
          </p>
          <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-text-primary sm:text-[30px]">
            Agent is an assistant, not a money machine
          </h2>
          <p className="mt-3 text-[14px] leading-7 text-text-secondary">
            Before you connect an exchange, sit with this. It is long on purpose. If you
            skip it, you will expect something Agent cannot do — and you will be angry
            at the wrong person when a trade loses.
          </p>
        </header>

        <Section title="Why this exists">
          <p>
            Users asked for it. Some cannot watch every LuxQuant call — work, sleep,
            timezone, family. They wanted a way to apply{" "}
            <span className="text-text-primary">their own</span> size, stop, and
            take-profit to a signal without sitting on the exchange all day.
          </p>
          <p>
            LuxQuant built Agent as that helper. We do{" "}
            <span className="text-text-primary">not</span> commercialize it as a
            profit product. There is no “Agent package”, no performance fee, no
            promise that turning it on will make you money. It is a courtesy for
            people who already use the terminal and asked for execution help.
          </p>
        </Section>

        <Section title="What it actually does">
          <p>
            When you turn it on, Agent watches incoming signals and, if they match
            the rules you saved, it can place an order on{" "}
            <span className="text-text-primary">your</span> Binance, Bitget, or BingX
            account. Funds never leave that exchange. We never request withdraw
            permission.
          </p>
          <p>
            It will also skip trades — risk cap, daily loss limit, cooldown, invalid
            key, symbol not listed, you paused it. A skip is not a bug. A fill is
            not a gift. Both are just the rules you left running.
          </p>
        </Section>

        <Section title="What it is not">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Not a fund manager. Not a copy-trade leader. Not financial advice.</li>
            <li>Not “set and forget”. Markets change while you sleep.</li>
            <li>Not 100% controlled by Agent. You choose on/off, size, leverage, spot vs futures, dry-run vs live.</li>
            <li>
              Not a guarantee of profit. Plenty of correct process still loses —
              slippage, wicks, news, leverage, a stop that is simply hit.
            </li>
            <li>
              Not a substitute for you. If you cannot check it, it should be off or
              in dry-run.
            </li>
          </ul>
        </Section>

        <Section title="You still have to drive">
          <p>
            Pause it before high-impact news if you do not want to be in the market.
            Lower size when you are unsure. Keep dry-run on until you have watched
            it simulate. Turn LIVE off when you travel or cannot open the app.
            Open positions keep their exchange take-profit and stop-loss after you
            pause — check those too.
          </p>
          <p>
            If you are angry after a red trade, the honest question is: did{" "}
            <span className="text-text-primary">you</span> leave it live, at that
            size, on that market? Agent executed a rule. It did not owe you a win.
          </p>
        </Section>

        <Section title="Losses, including large ones">
          <p>
            Futures can liquidate. Spot can drop through a stop. A signal can be
            late. The exchange can reject a protective order. We try to fail safe,
            but software, networks, and venues fail. Only use money you can lose.
            If that sentence feels uncomfortable, do not connect keys.
          </p>
        </Section>

        <div className="space-y-2.5 border-t border-ink/[0.08] pt-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Confirm you read this — saved with time, IP, and form version
          </p>
          <ul className="space-y-2">
            {CHECKS.map((item) => {
              const on = Boolean(checked[item.id]);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink/[0.08] bg-surface-secondary/50 px-3.5 py-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span className="text-[13px] leading-5 text-text-secondary">{item.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex flex-wrap items-center gap-3">
          <GoldButton onClick={accept} disabled={!ready || saving}>
            {saving ? "Saving signed form…" : "I understand — continue"}
          </GoldButton>
          {compact && onCollapse ? (
            <GhostButton onClick={onCollapse}>Close</GhostButton>
          ) : (
            <p className="text-[12px] leading-5 text-text-muted">
              Connect buttons stay hidden until every box is checked.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AgentReminderStrip({ onReread }) {
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-surface-secondary/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-5 text-text-secondary">
          Agent is an assistant you switch on and off. It does not guarantee profit.
          Pause it when you cannot supervise.
        </p>
        <button
          type="button"
          onClick={onReread}
          className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent hover:text-accent-light"
        >
          Re-read the disclaimer
        </button>
      </div>
    </div>
  );
}
