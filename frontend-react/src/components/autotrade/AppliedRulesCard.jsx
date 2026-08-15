// Renders describeAppliedRules() — if/then copy from the user's own settings.
// Same card on Overview (saved rules) and Configure (live draft).

import { describeAppliedRules } from "./autotradeFieldGuide";

export default function AppliedRulesCard({ config, className = "" }) {
  if (!config) return null;
  const { headline, scenarios } = describeAppliedRules(config);
  if (!scenarios.length) return null;

  return (
    <div className={`rounded-lg border border-accent/25 bg-accent/[0.04] px-4 py-3.5 ${className}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
        With the rules you applied
      </p>
      <p className="mt-1 text-[13px] font-medium leading-5 text-text-primary">{headline}</p>
      <ul className="mt-3 space-y-2.5">
        {scenarios.map((row) => (
          <li key={row.id}>
            <p className="text-[11px] leading-4 text-text-muted">If {row.if}</p>
            <p
              className={`mt-0.5 text-[12px] leading-5 ${
                row.tone === "warn" ? "text-warn" : "text-text-secondary"
              }`}
            >
              then {row.then}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
