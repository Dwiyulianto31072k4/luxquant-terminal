// First screen on Agent. Scroll the notice, then sign. Users asked for
// this helper — it is not a money product. They still have to drive.

import { useEffect, useRef, useState } from "react";
import { submitAgentDisclaimerAck } from "../../services/authApi";
import { ASSISTANT_FORM, buildAckPayload } from "./agentDisclaimerCopy";
import { GoldButton, GhostButton, Notice } from "./AutoTradeUI";

const CHECKS = ASSISTANT_FORM.checks;

export default function AgentDisclaimer({ onAccept, compact = false, onCollapse }) {
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [progress, setProgress] = useState(0);
  const scrollerRef = useRef(null);
  const ready = scrolledEnd && CHECKS.every((item) => checked[item.id]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max <= 8 ? 1 : el.scrollTop / max;
    setProgress(Math.min(1, Math.max(0, ratio)));
    if (max <= 8 || el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledEnd(true);
    }
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    onScroll();
    const id = requestAnimationFrame(onScroll);
    return () => cancelAnimationFrame(id);
  }, []);

  const accept = async () => {
    setSaving(true);
    setError("");
    try {
      await submitAgentDisclaimerAck(buildAckPayload(ASSISTANT_FORM, checked));
      await onAccept?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        (typeof detail === "string" && detail) || err.message || "Could not save the signed form"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-h-[min(78vh,820px)] flex-col overflow-hidden rounded-xl border border-ink/[0.1] bg-surface-raised">
      <header className="shrink-0 border-b border-ink/[0.08] px-5 py-4 sm:px-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          User request · please read this first
        </p>
        <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight text-text-primary sm:text-[26px]">
          Agent is an assistant, not a money machine
        </h2>
        <p className="mt-1.5 text-[13px] leading-6 text-text-secondary">
          Scroll the whole notice. Boxes unlock at the bottom. This form is saved
          with time, IP, and version.
        </p>
        <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-ink/[0.08]">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7"
        >
          <div className="mx-auto max-w-3xl space-y-7 pb-4">
            {ASSISTANT_FORM.sections.map((section) => (
              <section key={section.title} className="space-y-2">
                <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
                  {section.title}
                </h3>
                <p className="text-[13.5px] leading-7 text-text-secondary">{section.body}</p>
              </section>
            ))}

            <section className="rounded-lg border border-ink/[0.08] bg-surface-secondary/50 px-4 py-3.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Why so many people asked
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-6 text-text-secondary">
                <li>Desk is open while they are at work, asleep, or in another timezone.</li>
                <li>India / blocked-KYC users wanted BingX, not another lecture about Binance.</li>
                <li>Canada / Bitget users wanted the same rules they already set in the terminal.</li>
                <li>
                  Repeated message: “just apply my size and stop when I cannot sit on the
                  exchange.”
                </li>
              </ul>
            </section>

            <div className="space-y-2.5 border-t border-ink/[0.08] pt-5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {scrolledEnd
                  ? "Confirm — saved with time, IP, and form version"
                  : "Scroll to the end to unlock these boxes"}
              </p>
              <ul className="space-y-2">
                {CHECKS.map((item) => {
                  const on = Boolean(checked[item.id]);
                  return (
                    <li key={item.id}>
                      <label
                        className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 ${
                          scrolledEnd
                            ? "cursor-pointer border-ink/[0.08] bg-surface-secondary/50"
                            : "cursor-not-allowed border-ink/[0.06] bg-ink/[0.02] opacity-55"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!scrolledEnd}
                          onChange={() => setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                        />
                        <span className="text-[12.5px] leading-5 text-text-secondary">
                          {item.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
        {!scrolledEnd ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-surface-raised via-surface-raised/90 to-transparent pb-3 pt-10">
            <span className="rounded-full border border-ink/[0.08] bg-surface-raised px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Scroll to continue
            </span>
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-ink/[0.08] bg-surface-raised px-5 py-3.5 sm:px-7">
        {error ? <div className="mb-3"><Notice tone="error">{error}</Notice></div> : null}
        <div className="flex flex-wrap items-center gap-3">
          <GoldButton onClick={accept} disabled={!ready || saving}>
            {saving ? "Saving signed form…" : "I understand — continue"}
          </GoldButton>
          {compact && onCollapse ? (
            <GhostButton onClick={onCollapse}>Close</GhostButton>
          ) : (
            <p className="text-[12px] leading-5 text-text-muted">
              {scrolledEnd
                ? "Tick every box above, then continue. Connect stays hidden until then."
                : "Scroll the notice first — this is a user-requested helper, not a profit product."}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

export function AgentReminderStrip({ onReread }) {
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-surface-secondary/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-5 text-text-secondary">
          Agent exists because users asked for help. It is an assistant you switch
          off. It does not guarantee profit.
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
