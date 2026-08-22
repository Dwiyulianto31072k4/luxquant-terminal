// src/components/LanguagePicker.jsx
//
// Language lives in the profile and the avatar menu, not in the header. The
// header pill was permanent chrome spent on a setting almost nobody changes
// twice, and on mobile it was crowding the things people actually press.
//
// Deliberately no flags: a flag is a country, not a language, and the moment a
// product uses one it has to answer which flag Chinese gets. Each option is
// written in its own language, which is also what a reader who cannot read the
// current one needs in order to escape.

import { useTranslation } from "react-i18next";

// `hint` is the English name, and is omitted where it would only repeat the
// native one — "English / English" is noise, "中文 / Chinese · Simplified" is not.
const LANGUAGES = [
  { code: "en", mark: "EN", native: "English", hint: null },
  { code: "zh", mark: "中", native: "中文", hint: "Chinese · Simplified" },
];

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

export default function LanguagePicker({ className = "", showHeading = true }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith("zh") ? "zh" : "en";

  return (
    <div className={className}>
      {showHeading ? (
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {t("userMenu.language", { defaultValue: "Language" })}
          </p>
        </div>
      ) : null}

      <div
        className="flex flex-col gap-1 rounded-xl border border-ink/[0.08] bg-surface-secondary/80 p-1.5"
        role="radiogroup"
        aria-label={t("userMenu.language", { defaultValue: "Language" })}
      >
        {LANGUAGES.map((lang) => {
          const on = current === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={on}
              lang={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className={[
                "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-all",
                on
                  ? "bg-surface-raised text-text-primary shadow-sm ring-1 ring-ink/[0.08]"
                  : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-10 w-14 shrink-0 items-center justify-center rounded-md border text-[13px] font-semibold",
                  on
                    ? "border-accent bg-accent/10 text-text-primary ring-2 ring-accent/30"
                    : "border-ink/[0.1] bg-surface text-text-secondary",
                ].join(" ")}
                aria-hidden
              >
                {lang.mark}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold leading-tight tracking-tight">
                    {lang.native}
                  </span>
                  {on ? (
                    <span className="rounded px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-accent-fg bg-accent">
                      On
                    </span>
                  ) : null}
                </span>
                {lang.hint ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
                    {lang.hint}
                  </span>
                ) : null}
              </span>

              <span
                className={[
                  "shrink-0 transition-colors",
                  on ? "text-accent" : "text-ink/20 group-hover:text-ink/40",
                ].join(" ")}
              >
                <CheckIcon className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
