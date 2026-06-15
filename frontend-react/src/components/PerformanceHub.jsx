// src/components/PerformanceHub.jsx
// ════════════════════════════════════════════════════════════════
// Unified Performance hub — one page, three sub-views.
//   · Overview  → AnalyzePage          (lifetime track record)
//   · Daily     → DailyPerformancePage (single-day snapshot)
//   · Research  → EdgeLabPage          (multi-day deep dive)
//
// Only the ACTIVE view is mounted (the three pages each fetch on mount and
// are heavy — 900-1400 lines), so switching tabs is what triggers a fetch,
// never all three at once. Active view is mirrored in the URL (?view=)
// so tabs are shareable and the browser back button works.
//
// The three page components are imported untouched — this is a shell only.
// ════════════════════════════════════════════════════════════════
import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const AnalyzePage = lazy(() => import("./AnalyzePage"));
const DailyPerformancePage = lazy(() => import("./DailyPerformancePage"));
const EdgeLabPage = lazy(() => import("./EdgeLabPage"));

const VIEWS = [
  { id: "overview", label: "Overview", note: "Lifetime track record" },
  { id: "daily", label: "Daily", note: "Today's signals" },
  { id: "research", label: "Research", note: "Deep dive — multi-day patterns" },
];

const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        Loading…
      </span>
    </div>
  </div>
);

const PerformanceHub = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const raw = (params.get("view") || "overview").toLowerCase();
  const active = VIEWS.some((v) => v.id === raw) ? raw : "overview";
  const activeNote = VIEWS.find((v) => v.id === active)?.note;

  const setView = (id) => {
    const next = new URLSearchParams(params);
    next.set("view", id);
    setParams(next, { replace: false });
  };

  return (
    <div className="space-y-5">
      {/* hub header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          Performance
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
        {activeNote && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/70">
            {activeNote}
          </span>
        )}
      </div>

      {/* sub-tab switcher */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] overflow-x-auto">
        {VIEWS.map((v) => {
          const on = active === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`relative px-4 py-3 text-[12px] font-mono uppercase tracking-wider transition whitespace-nowrap ${
                on ? "text-gold-primary" : "text-white/40 hover:text-white/70"
              }`}
            >
              {v.label}
              {on && <span className="absolute bottom-0 inset-x-3 h-[2px] bg-gold-primary" />}
            </button>
          );
        })}
      </div>

      {/* active view — only one mounted at a time */}
      <Suspense fallback={<ViewLoader />}>
        {active === "overview" && <AnalyzePage />}
        {active === "daily" && <DailyPerformancePage />}
        {active === "research" && <EdgeLabPage />}
      </Suspense>
    </div>
  );
};

export default PerformanceHub;
