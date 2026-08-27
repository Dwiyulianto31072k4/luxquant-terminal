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
import { resourcesApi, coverUrl, youtubeThumb } from "../services/resourcesApi";
import ResourceReader from "./resources/ResourceReader";
import { useAuth } from "../context/AuthContext";
import { PageHeader, SectionHeader } from "./ui/PageHeader";
import { MODULE_COVERS, TYPE_LABEL } from "../content/tutorialCovers";

const coverFor = (lesson, trackSlug) =>
  coverUrl(lesson) ||
  (lesson?.type === "video" ? youtubeThumb(lesson.source_url) : null) ||
  MODULE_COVERS[trackSlug] ||
  MODULE_COVERS.start;

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
  const cover = MODULE_COVERS[track.slug] || MODULE_COVERS.start;

  return (
    <button
      type="button"
      onClick={() => onSelect(track.slug)}
      aria-current={active ? "true" : undefined}
      className={`flex h-full w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border text-left transition-shadow sm:w-full ${
        active
          ? "border-accent/40 shadow-[0_8px_28px_rgb(var(--scrim)/0.18)]"
          : "border-ink/[0.08] hover:border-ink/15 hover:shadow-[0_8px_24px_rgb(var(--scrim)/0.12)]"
      } bg-surface-raised`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-ink/[0.06]">
        <img src={cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-scrim/55 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-md bg-surface-raised/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-text-primary backdrop-blur-sm">
          {String(n).padStart(2, "0")}
        </span>
        {done && (
          <span className="absolute right-3 top-3">
            <Tick on size={20} />
          </span>
        )}
        <div className="absolute inset-x-3 bottom-3">
          <Bar pct={pct} done={done} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-[16px] font-semibold tracking-tight text-text-primary">
          {track.title}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[40px] text-[13px] leading-snug text-text-secondary">
          {track.summary}
        </p>
        <p className="mt-3 font-mono text-[10.5px] tabular-nums text-text-muted">
          {track.completed_count}/{track.lesson_count} · {track.minutes} min
        </p>
      </div>
    </button>
  );
};

/* ── lesson card ────────────────────────────────────────────── */

const LessonCard = ({ lesson, index, trackSlug, onOpen, onToggle, canTrack }) => {
  const cover = coverFor(lesson, trackSlug);
  const kind = TYPE_LABEL[lesson.type] || "Lesson";

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-surface-raised transition-shadow ${
        lesson.completed
          ? "border-ink/[0.07]"
          : "border-ink/[0.08] hover:border-ink/15 hover:shadow-[0_10px_28px_rgb(var(--scrim)/0.12)]"
      }`}
    >
      <button type="button" onClick={() => onOpen(lesson)} className="text-left">
        <div className="relative aspect-[16/9] overflow-hidden bg-ink/[0.06]">
          <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-scrim/50 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 rounded-md bg-surface-raised/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-text-primary backdrop-blur-sm">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="absolute right-3 top-3 rounded-md bg-surface-raised/90 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-primary backdrop-blur-sm">
            {kind}
          </span>
        </div>
        <div className="p-4">
          <h3
            className={`font-display text-[16px] font-semibold tracking-tight ${
              lesson.completed ? "text-text-muted" : "text-text-primary"
            }`}
          >
            {lesson.title}
          </h3>
          {lesson.excerpt && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
              {lesson.excerpt}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3 text-[12px] text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <TypeMark type={lesson.type} />
              {kind}
            </span>
            <span className="tabular-nums">{lesson.minutes} min</span>
            {lesson.level && (
              <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                {lesson.level}
              </span>
            )}
            <span className="ml-auto font-medium text-accent">Open →</span>
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-ink/[0.06] px-4 py-2.5">
        <button
          type="button"
          onClick={() => canTrack && onToggle(lesson)}
          disabled={!canTrack}
          title={canTrack ? (lesson.completed ? "Mark as not done" : "Mark as done") : "Sign in to track your progress"}
          aria-label={lesson.completed ? "Mark as not done" : "Mark as done"}
          className="inline-flex items-center gap-2 text-[12px] text-text-muted disabled:cursor-default"
        >
          <Tick on={lesson.completed} size={18} />
          {lesson.completed ? "Completed" : "Mark done"}
        </button>
      </div>
    </article>
  );
};

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

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {active.lessons.length ? (
                    active.lessons.map((l, i) => (
                      <LessonCard
                        key={l.id}
                        lesson={l}
                        index={i}
                        trackSlug={active.slug}
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
