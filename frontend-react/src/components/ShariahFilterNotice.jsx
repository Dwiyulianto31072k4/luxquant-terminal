// src/components/ShariahFilterNotice.jsx
//
// Shown wherever a list is being filtered by Shariah screening.
//
// A filtered list that does not announce itself is the worst version of this
// feature: the user sees fewer signals than they paid for and has no way to
// know why, or that they switched it on three weeks ago. So it says what is
// hidden, how many, and where to change it — with the link, not just the name
// of the page.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ShariahFilterNotice({ hidden = 0, total = 0, strict = false, className = "" }) {
  const { t } = useTranslation();
  if (!hidden) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-ink/[0.09] bg-surface-raised px-3 py-2 text-[12px] leading-snug ${className}`}
      role="status"
    >
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {strict
          ? t("shariah.filter_strict", { defaultValue: "Shariah · strict" })
          : t("shariah.filter_on", { defaultValue: "Shariah" })}
      </span>

      <span className="text-text-secondary">
        {t("shariah.filter_hidden", {
          defaultValue: "{{hidden}} of {{total}} hidden by your screening setting.",
          hidden,
          total,
        })}
      </span>

      {/* The link matters more than the sentence. Telling someone a setting
          exists without taking them to it is how a filter becomes a trap. */}
      <Link
        to="/profile#shariah"
        className="font-medium text-accent-text underline decoration-accent-text/30 underline-offset-2 hover:decoration-accent-text"
      >
        {t("shariah.filter_change", { defaultValue: "Change this" })}
      </Link>
    </div>
  );
}
