// src/components/TipsPage.jsx
// ════════════════════════════════════════════════════════════════
// Tutorials — a course, laid out like one.
//
// Lives at /tips, the route the old Resources shelf held. `/learn` is taken by
// the public glossary: a separate, indexed SEO surface that answers "what does
// this word mean", where this answers "how do I use this product".
//
// Layout is the module navigator every course platform converges on — a spine
// of numbered modules on the left, the selected module's lessons on the right —
// because it answers the two questions a learner actually has at once: how much
// is there, and where am I in it. A stack of full-width cards answers neither,
// and reads as empty shelves when a module has nothing in it yet.
//
// The single most useful control in a course UI is "continue", so it sits at
// the top and points at the first unfinished lesson.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resourcesApi } from "../services/resourcesApi";
import ResourceReader from "./resources/ResourceReader";
import { useAuth } from "../context/AuthContext";

/* ── marks ──────────────────────────────────────────────────── */

const TypeMark = ({ type }) => {
  const d = {
    video: "M8 5v14l11-7z",
    pdf: "M7 3h7l5 5v13H7z M14 3v5h5",
    link: "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1 M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
  }[type];
  if (!d) return null;
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};

const Tick = ({ on, size = 18 }) => (
  <span
    className="inline-flex shrink-0 items-center justify-center rounded-full transition-colors"
    style={{
      width: size, height: size,
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
  <div className="h-[3px] w-full overflow-hidden rounded-full"
    style={{ background: "rgb(var(--ink) / 0.08)" }}>
    <div className="h-full rounded-full transition-all duration-500"
      style={{ width: `${pct}%`, background: done ? "rgb(var(--pos))" : "rgb(var(--accent))" }} />
  </div>
);

/* ── module spine ───────────────────────────────────────────── */

const ModuleButton = ({ track, n, active, onSelect }) => {
  const pct = track.lesson_count
    ? Math.round((track.completed_count / track.lesson_count) * 100)
    : 0;
  const done = track.lesson_count > 0 && track.completed_count === track.lesson_count;

  return (
    <button
      type="button"
      onClick={() => onSelect(track.slug)}
      aria-current={active ? "true" : undefined}
      className="w-full rounded-lg px-3 py-2.5 text-left transition-colors"
      style={{
        background: active ? "rgb(var(--accent) / 0.10)" : "transparent",
        border: `1px solid ${active ? "rgb(var(--accent) / 0.35)" : "transparent"}`,
      }}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[10px] tabular-nums"
          style={{ color: active ? "rgb(var(--accent))" : "rgb(var(--ink) / 0.32)" }}>
          {String(n).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
          style={{ color: active ? "rgb(var(--fg))" : "rgb(var(--fg-secondary))" }}>
          {track.title}
        </span>
        {done && <Tick on size={13} />}
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-[26px]">
        <Bar pct={pct} done={done} />
        <span className="shrink-0 font-mono text-[9.5px] tabular-nums"
          style={{ color: "rgb(var(--ink) / 0.32)" }}>
          {track.completed_count}/{track.lesson_count}
        </span>
      </div>
    </button>
  );
};

/* ── lesson ─────────────────────────────────────────────────── */

const LessonRow = ({ lesson, index, onOpen, onToggle, canTrack }) => (
  <div className="flex items-center gap-3 border-t px-1 py-2.5 transition-colors first:border-t-0 hover:bg-ink/[0.03]"
    style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
    <button
      type="button"
      onClick={() => canTrack && onToggle(lesson)}
      disabled={!canTrack}
      title={canTrack ? (lesson.completed ? "Mark as not done" : "Mark as done") : "Sign in to track your progress"}
      aria-label={lesson.completed ? "Mark as not done" : "Mark as done"}
      className="shrink-0 disabled:cursor-default"
    >
      <Tick on={lesson.completed} />
    </button>

    <button type="button" onClick={() => onOpen(lesson)}
      className="flex min-w-0 flex-1 items-baseline gap-2.5 text-left">
      <span className="shrink-0 font-mono text-[10.5px] tabular-nums"
        style={{ color: "rgb(var(--ink) / 0.3)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="truncate text-[13.5px]"
        style={{
          color: lesson.completed ? "rgb(var(--fg-muted))" : "rgb(var(--fg))",
          fontWeight: lesson.completed ? 400 : 500,
        }}>
        {lesson.title}
      </span>
      {lesson.level && (
        <span className="hidden shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider sm:inline"
          style={{ background: "rgb(var(--ink) / 0.05)", color: "rgb(var(--ink) / 0.42)" }}>
          {lesson.level}
        </span>
      )}
    </button>

    <span className="flex shrink-0 items-center gap-2 text-[10.5px]"
      style={{ color: "rgb(var(--fg-muted))" }}>
      <TypeMark type={lesson.type} />
      <span className="tabular-nums">{lesson.minutes}m</span>
    </span>
  </div>
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

  const load = useCallback(() => {
    resourcesApi.tracks().then(setData).catch(() => setError("Could not load lessons."));
  }, []);
  useEffect(load, [load]);

  // Memoised: a fresh [] each render would change the deps of every hook below
  // on every render, which turns the module-selection effect into churn.
  const tracks = useMemo(() => data?.tracks || [], [data]);

  // Open on the first module that still has something to do, so returning
  // lands where the work is rather than back at lesson one.
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

  // Deep-linkable — `/tips?lesson=slug` — so the app can send someone straight
  // to the explanation at the moment they are confused, which is worth more
  // than any amount of browsing.
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

  // Optimistic: the tick is the whole interaction, and waiting a round-trip to
  // see it move makes the page feel broken.
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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      {/* ── course header ─────────────────────────────────────── */}
      <header
        className="rounded-xl p-5 sm:p-6"
        style={{ background: "rgb(var(--surface-raised))", border: "1px solid rgb(var(--ink) / 0.08)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.18em]"
              style={{ color: "rgb(var(--fg-muted))" }}>
              LuxQuant · Tutorials
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Get more out of every call
            </h1>
            <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed"
              style={{ color: "rgb(var(--fg-secondary))" }}>
              Short lessons, in the order they are useful — from reading a call to
              knowing exactly what our numbers do and do not claim.
            </p>
          </div>

          {anyLessons && nextLesson && (
            <button
              type="button"
              onClick={() => {
                setActiveSlug(nextLesson.track.slug);
                openLesson(nextLesson.lesson);
              }}
              className="shrink-0 rounded-lg px-4 py-2.5 text-left transition-opacity hover:opacity-90"
              style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
            >
              <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
                {totals.completed ? "Continue" : "Start"}
              </span>
              <span className="mt-0.5 block max-w-[210px] truncate text-[12.5px] font-semibold">
                {nextLesson.lesson.title}
              </span>
            </button>
          )}
        </div>

        {anyLessons && (
          <div className="mt-5 flex items-center gap-3">
            <Bar pct={pct} done={pct === 100} />
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums"
              style={{ color: "rgb(var(--fg-muted))" }}>
              {totals.completed}/{totals.lessons}
            </span>
          </div>
        )}
      </header>

      {error && <p className="mt-6 text-[13px]" style={{ color: "rgb(var(--neg-text))" }}>{error}</p>}
      {!data && !error && (
        <p className="mt-6 text-[13px]" style={{ color: "rgb(var(--fg-muted))" }}>Loading…</p>
      )}

      {/* ── module navigator + lessons ────────────────────────── */}
      {data && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[248px_1fr]">
          <nav
            className="rounded-xl p-2 lg:sticky lg:top-[calc(var(--lq-header-h,64px)+16px)] lg:self-start"
            style={{ background: "rgb(var(--surface-raised))", border: "1px solid rgb(var(--ink) / 0.08)" }}
            aria-label="Modules"
          >
            <p className="px-3 pb-1.5 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "rgb(var(--ink) / 0.35)" }}>
              Modules
            </p>
            <div className="space-y-0.5">
              {tracks.map((t, i) => (
                <ModuleButton
                  key={t.slug}
                  track={t}
                  n={i + 1}
                  active={active?.slug === t.slug}
                  onSelect={setActiveSlug}
                />
              ))}
            </div>
          </nav>

          <section
            className="rounded-xl p-5"
            style={{ background: "rgb(var(--surface-raised))", border: "1px solid rgb(var(--ink) / 0.08)" }}
          >
            {active && (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[11px] tabular-nums"
                    style={{ color: "rgb(var(--accent))" }}>
                    {String(tracks.findIndex((t) => t.slug === active.slug) + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-[16px] font-semibold tracking-tight text-text-primary">
                    {active.title}
                  </h2>
                  {active.lesson_count > 0 && (
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums"
                      style={{ color: "rgb(var(--fg-muted))" }}>
                      {active.minutes} min total
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12.5px]" style={{ color: "rgb(var(--fg-muted))" }}>
                  {active.summary}
                </p>

                <div className="mt-4">
                  {active.lessons.length ? (
                    active.lessons.map((l, i) => (
                      <LessonRow
                        key={l.id}
                        lesson={l}
                        index={i}
                        onOpen={openLesson}
                        onToggle={toggle}
                        canTrack={isAuthenticated}
                      />
                    ))
                  ) : (
                    // Dignified rather than apologetic: this module is planned,
                    // not broken, and saying so is better than an empty box.
                    <div className="rounded-lg px-4 py-8 text-center"
                      style={{ background: "rgb(var(--ink) / 0.02)", border: "1px dashed rgb(var(--ink) / 0.12)" }}>
                      <p className="text-[13px] font-medium text-text-primary">
                        This module is being written.
                      </p>
                      <p className="mt-1 text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
                        {active.summary}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {data && anyLessons && !isAuthenticated && (
        <p className="mt-4 text-center text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
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
