// src/components/TipsPage.jsx
// ════════════════════════════════════════════════════════════════
// Tutorials — a course, laid out like one.
//
// Full-width catalog (the app shell is already 1600px). A narrow max-width
// left two empty gutters and made 24 lessons look like a stub. Layout is the
// catalog every course platform converges on: a hero with Continue, a grid of
// module cards so you can see the whole path, then lesson cards for the
// selected module. Mobile is a snap-scroll of those same cards, not a squeezed
// two-column.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resourcesApi } from "../services/resourcesApi";
import ResourceReader from "./resources/ResourceReader";
import { useAuth } from "../context/AuthContext";
import { PageHeader, SectionHeader } from "./ui/PageHeader";

/* ── marks ──────────────────────────────────────────────────── */

const TypeMark = ({ type }) => {
  const d = {
    video: "M8 5v14l11-7z",
    pdf: "M7 3h7l5 5v13H7z M14 3v5h5",
    link: "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1 M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
    article: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  }[type] || "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};

const MODULE_ICON = {
  start: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  "read-a-call": "M4 6h16M4 12h16M4 18h10",
  numbers: "M4 19V9 M10 19V5 M16 19v-7 M22 19V8",
  tools: "M4 8h6V4H4z M14 8h6V4h-6z M4 20h6v-8H4z M14 20h6v-8h-6z",
  automation: "M13 2L4 14h7l-1 8 10-14h-7l0-6z",
  account: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z M4 21c0-4 3.6-7 8-7s8 3 8 7",
};

const Tick = ({ on, size = 18 }) => (
  <span
    className="inline-flex shrink-0 items-center justify-center rounded-full transition-colors"
    style={{
      width: size,
      height: size,
      background: on ? "rgb(var(--pos) / 0.18)" : "transparent",
      border: `1px solid ${on ? "rgb(var(--pos) / 0.45)" : "rgb(var(--ink) / 0.18)"}`,
      color: on ? "rgb(var(--pos-text))" : "transparent",
    }}
  >
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3.2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  </span>
);

const Bar = ({ pct, done }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: done ? "rgb(var(--pos))" : "rgb(var(--accent))",
      }}
    />
  </div>
);

const Stat = ({ label, value }) => (
  <div className="min-w-[88px] rounded-xl border border-ink/[0.08] bg-surface-secondary/80 px-3 py-2.5">
    <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {label}
    </p>
    <p className="mt-0.5 font-display text-[17px] font-semibold tabular-nums text-text-primary">
      {value}
    </p>
  </div>
);

/* ── module card ────────────────────────────────────────────── */

const ModuleCard = ({ track, n, active, onSelect }) => {
  const pct = track.lesson_count
    ? Math.round((track.completed_count / track.lesson_count) * 100)
    : 0;
  const done = track.lesson_count > 0 && track.completed_count === track.lesson_count;
  const icon = MODULE_ICON[track.slug] || MODULE_ICON.start;

  return (
    <button
      type="button"
      onClick={() => onSelect(track.slug)}
      aria-current={active ? "true" : undefined}
      className={`flex h-full w-[240px] shrink-0 snap-start flex-col rounded-2xl border p-4 text-left transition-colors sm:w-full ${
        active
          ? "border-accent/40 bg-accent/[0.08]"
          : "border-ink/[0.08] bg-surface-raised hover:border-ink/15 hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
            active ? "bg-accent/15 text-accent" : "bg-ink/[0.05] text-text-secondary"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icon} />
          </svg>
        </span>
        {done ? <Tick on size={18} /> : (
          <span className="font-mono text-[11px] tabular-nums text-text-muted">
            {String(n).padStart(2, "0")}
          </span>
        )}
      </div>
      <h3 className="mt-3 font-display text-[15px] font-semibold tracking-tight text-text-primary">
        {track.title}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[36px] text-[12.5px] leading-snug text-text-muted">
        {track.summary}
      </p>
      <div className="mt-auto pt-3">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-text-muted">
          <span>
            {track.completed_count}/{track.lesson_count} lessons
          </span>
          <span>{track.minutes}m</span>
        </div>
        <Bar pct={pct} done={done} />
      </div>
    </button>
  );
};

/* ── lesson card ────────────────────────────────────────────── */

const LessonCard = ({ lesson, index, onOpen, onToggle, canTrack }) => (
  <article
    className={`group flex gap-3 rounded-2xl border p-3.5 transition-colors sm:gap-4 sm:p-4 ${
      lesson.completed
        ? "border-ink/[0.07] bg-surface-raised"
        : "border-ink/[0.08] bg-surface-raised hover:border-ink/15 hover:bg-surface-hover"
    }`}
  >
    <button
      type="button"
      onClick={() => canTrack && onToggle(lesson)}
      disabled={!canTrack}
      title={canTrack ? (lesson.completed ? "Mark as not done" : "Mark as done") : "Sign in to track your progress"}
      aria-label={lesson.completed ? "Mark as not done" : "Mark as done"}
      className="mt-0.5 shrink-0 self-start disabled:cursor-default"
    >
      <Tick on={lesson.completed} size={22} />
    </button>

    <button type="button" onClick={() => onOpen(lesson)} className="min-w-0 flex-1 text-left">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10.5px] tabular-nums text-text-muted">
          {String(index + 1).padStart(2, "0")}
        </span>
        {lesson.level && (
          <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            {lesson.level}
          </span>
        )}
      </div>
      <h3
        className={`mt-1 font-display text-[15px] font-semibold tracking-tight sm:text-[16px] ${
          lesson.completed ? "text-text-muted" : "text-text-primary"
        }`}
      >
        {lesson.title}
      </h3>
      {lesson.excerpt && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
          {lesson.excerpt}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-3 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <TypeMark type={lesson.type} />
          <span className="capitalize">{lesson.type || "article"}</span>
        </span>
        <span className="tabular-nums">{lesson.minutes} min</span>
        <span className="ml-auto font-medium text-accent sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          Read →
        </span>
      </div>
    </button>
  </article>
);

/* ── page ───────────────────────────────────────────────────── */

export default function TipsPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);
  const lessonsRef = useRef(null);

  const load = useCallback(() => {
    resourcesApi.tracks().then(setData).catch(() => setError("Could not load lessons."));
  }, []);
  useEffect(load, [load]);

  const tracks = useMemo(() => data?.tracks || [], [data]);

  useEffect(() => {
    if (activeSlug || !tracks.length) return;
    const next = tracks.find((t) => t.completed_count < t.lesson_count);
    setActiveSlug((next || tracks[0]).slug);
  }, [tracks, activeSlug]);

  const active = useMemo(
    () => tracks.find((t) => t.slug === activeSlug) || tracks[0] || null,
    [tracks, activeSlug]
  );

  const totals = data?.totals || { lessons: 0, completed: 0 };
  const pct = totals.lessons ? Math.round((totals.completed / totals.lessons) * 100) : 0;
  const anyLessons = totals.lessons > 0;
  const totalMinutes = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.minutes || 0), 0),
    [tracks]
  );

  const nextLesson = useMemo(() => {
    for (const t of tracks) {
      const hit = t.lessons.find((l) => !l.completed);
      if (hit) return { lesson: hit, track: t };
    }
    return null;
  }, [tracks]);

  const playlist = useMemo(() => tracks.flatMap((t) => t.lessons), [tracks]);

  const goProduct = useCallback((path) => {
    setReading(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("lesson");
      return n;
    });
    navigate(path);
  }, [navigate, setParams]);

  const wanted = params.get("lesson");
  useEffect(() => {
    if (!wanted || !tracks.length || reading) return;
    for (const t of tracks) {
      const hit = t.lessons.find((l) => l.slug === wanted || String(l.id) === wanted);
      if (hit) {
        setActiveSlug(t.slug);
        setReading(hit);
        return;
      }
    }
  }, [wanted, tracks, reading]);

  const openLesson = useCallback((lesson) => {
    setReading(lesson);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("lesson", lesson.slug || String(lesson.id));
      return n;
    });
  }, [setParams]);

  const closeReader = useCallback(() => {
    setReading(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("lesson");
      return n;
    });
  }, [setParams]);

  const toggle = useCallback((lesson) => {
    const next = !lesson.completed;
    setData((d) => d && {
      ...d,
      tracks: d.tracks.map((t) => {
        const mine = t.lessons.some((l) => l.id === lesson.id);
        return {
          ...t,
          lessons: t.lessons.map((l) => (l.id === lesson.id ? { ...l, completed: next } : l)),
          completed_count: t.completed_count + (mine ? (next ? 1 : -1) : 0),
        };
      }),
      totals: { ...d.totals, completed: d.totals.completed + (next ? 1 : -1) },
    });
    resourcesApi.setComplete(lesson.id, next).catch(load);
  }, [load]);

  const selectModule = (slug) => {
    setActiveSlug(slug);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      lessonsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="w-full">
      <header className="rounded-2xl border border-ink/[0.08] bg-surface-raised p-4 sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="LuxQuant · Tutorials"
          title="Get more out of every call"
          subtitle="Short lessons, in the order they are useful — from reading a call to knowing exactly what our numbers do and do not claim."
          right={
            anyLessons && nextLesson ? (
              <button
                type="button"
                onClick={() => {
                  setActiveSlug(nextLesson.track.slug);
                  openLesson(nextLesson.lesson);
                }}
                className="inline-flex w-full items-center justify-between gap-4 rounded-xl bg-accent px-4 py-3 text-left text-accent-fg transition-opacity hover:opacity-90 sm:w-auto sm:min-w-[240px]"
              >
                <span>
                  <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
                    {totals.completed ? "Continue" : "Start"}
                  </span>
                  <span className="mt-0.5 block max-w-[220px] truncate text-[13.5px] font-semibold">
                    {nextLesson.lesson.title}
                  </span>
                </span>
                <span className="shrink-0 text-[16px]" aria-hidden>→</span>
              </button>
            ) : null
          }
        />

        {anyLessons && (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Stat label="Lessons" value={`${totals.completed}/${totals.lessons}`} />
              <Stat label="Complete" value={`${pct}%`} />
              <Stat label="Modules" value={tracks.length} />
              <Stat label="Time" value={`${totalMinutes}m`} />
            </div>
            <div className="min-w-0 flex-1 lg:pb-1">
              <Bar pct={pct} done={pct === 100} />
            </div>
          </div>
        )}
      </header>

      {error && <p className="mt-6 text-[13px] text-loss">{error}</p>}
      {!data && !error && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-ink/[0.04]" />
          ))}
        </div>
      )}

      {data && (
        <>
          <section className="mt-8">
            <SectionHeader
              title="Modules"
              desc="Pick a path. Progress saves when you are signed in."
            />
            <div className="-mx-3 mt-4 flex gap-3 overflow-x-auto px-3 pb-2 snap-x snap-mandatory [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
              {tracks.map((t, i) => (
                <ModuleCard
                  key={t.slug}
                  track={t}
                  n={i + 1}
                  active={active?.slug === t.slug}
                  onSelect={selectModule}
                />
              ))}
            </div>
          </section>

          <section ref={lessonsRef} className="mt-8 scroll-mt-24">
            {active && (
              <>
                <SectionHeader
                  title={`${String(tracks.findIndex((t) => t.slug === active.slug) + 1).padStart(2, "0")}  ${active.title}`}
                  desc={active.summary}
                  right={
                    active.lesson_count > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-text-muted">
                        {active.completed_count}/{active.lesson_count} · {active.minutes} min
                      </span>
                    ) : null
                  }
                />

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {active.lessons.length ? (
                    active.lessons.map((l, i) => (
                      <LessonCard
                        key={l.id}
                        lesson={l}
                        index={i}
                        onOpen={openLesson}
                        onToggle={toggle}
                        canTrack={isAuthenticated}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-ink/15 bg-ink/[0.02] px-4 py-10 text-center md:col-span-2">
                      <p className="text-[13px] font-medium text-text-primary">
                        This module is being written.
                      </p>
                      <p className="mt-1 text-[12px] text-text-muted">{active.summary}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {data && anyLessons && !isAuthenticated && (
        <p className="mt-6 text-center text-[12px] text-text-muted">
          Sign in to keep track of what you have read.
        </p>
      )}

      {reading && (
        <ResourceReader
          resource={reading}
          onClose={closeReader}
          onNavigate={goProduct}
          playlist={playlist}
          onOpenLesson={openLesson}
          onToggle={toggle}
          canTrack={isAuthenticated}
        />
      )}
    </div>
  );
}
