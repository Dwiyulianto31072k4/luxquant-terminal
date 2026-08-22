// src/components/ShariahModePicker.jsx
//
// Shariah screening preference, in the avatar menu and on Profile — the same
// two places Appearance and Language live.
//
// Off by default, deliberately. Nobody is shown a religious judgement they did
// not ask for, and the stricter reading is never assumed on someone's behalf.
//
// The wording here never says halal or haram. What the engine produces is a
// screening result assembled from published sources and a rules pass; it is
// not a fatwa, and most of the catalogue has never been read by a human. The
// card that opens from a coin says so too — this picker must not promise more
// than that card delivers.

import { useTranslation } from "react-i18next";
import useUiPrefs from "../hooks/useUiPrefs";

function CheckIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8.2l2 2 4-4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Row({ mark, title, body, on, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={[
        "group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-all",
        on
          ? "bg-surface-raised text-text-primary shadow-sm ring-1 ring-ink/[0.08]"
          : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary",
      ].join(" ")}
    >
      <span
        className={[
          "mt-px flex h-10 w-14 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold uppercase tracking-wider",
          on
            ? "border-accent bg-accent/10 text-text-primary ring-2 ring-accent/30"
            : "border-ink/[0.1] bg-surface text-text-secondary",
        ].join(" ")}
        aria-hidden
      >
        {mark}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold leading-tight tracking-tight">{title}</span>
          {on ? (
            <span className="rounded bg-accent px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-accent-fg">
              On
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">{body}</span>
      </span>
      <span
        className={[
          "mt-1 shrink-0 transition-colors",
          on ? "text-accent" : "text-ink/20 group-hover:text-ink/40",
        ].join(" ")}
      >
        <CheckIcon className="h-4 w-4" />
      </span>
    </button>
  );
}

export default function ShariahModePicker({ className = "", showHeading = true }) {
  const { t } = useTranslation();
  const { prefs, setPref } = useUiPrefs({ shariah_mode: false, shariah_strict: false });
  const on = prefs.shariah_mode === true;
  const strict = prefs.shariah_strict === true;

  return (
    <div className={className}>
      {showHeading ? (
        <p className="mb-2 px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {t("userMenu.shariah", { defaultValue: "Shariah screening" })}
        </p>
      ) : null}

      <div
        className="flex flex-col gap-1 rounded-xl border border-ink/[0.08] bg-surface-secondary/80 p-1.5"
        role="radiogroup"
        aria-label={t("userMenu.shariah", { defaultValue: "Shariah screening" })}
      >
        <Row
          mark="Off"
          title={t("userMenu.shariah_off", { defaultValue: "Off" })}
          body={t("userMenu.shariah_off_hint", {
            defaultValue: "No screening result shown on coins.",
          })}
          on={!on}
          onClick={() => setPref("shariah_mode", false)}
        />
        <Row
          mark="All"
          title={t("userMenu.shariah_moderate", { defaultValue: "Show results" })}
          body={t("userMenu.shariah_moderate_hint", {
            defaultValue: "Passed and disputed coins both count as tradeable.",
          })}
          on={on && !strict}
          onClick={() => {
            setPref("shariah_mode", true);
            setPref("shariah_strict", false);
          }}
        />
        <Row
          mark="Str"
          title={t("userMenu.shariah_strict", { defaultValue: "Strict" })}
          body={t("userMenu.shariah_strict_hint", {
            defaultValue: "Only coins that passed screening count.",
          })}
          on={on && strict}
          onClick={() => {
            setPref("shariah_mode", true);
            setPref("shariah_strict", true);
          }}
        />
      </div>

      {/* Says what it is before anyone relies on it. The per-coin card repeats
          this; a preference screen is where the expectation gets set. */}
      <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-text-muted">
        {t("userMenu.shariah_note", {
          defaultValue:
            "A screening result assembled from published sources — not a fatwa. Most coins have not been reviewed by a person yet, and each result says so.",
        })}
      </p>
    </div>
  );
}
