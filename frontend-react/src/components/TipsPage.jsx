// src/components/TipsPage.jsx
// ════════════════════════════════════════════════════════════════
// Tutorials — an ordered path, not a library.
//
// Lives at /tips, the route the old Resources shelf held. `/learn` is taken by
// the public glossary: a separate, indexed SEO surface that answers "what does
// this word mean", where this answers "how do I use this product".
//
// This replaces Resources, which shelved things by format (Research, Videos,
// Guides, Links) and after months held two rows. That is what a format
// taxonomy earns: nobody looking for help thinks "I need a video", they think
// "how do I read a call". Format is now a property of a lesson; the shelf is a
// track.
//
// Lessons are rows, not cards. A curriculum is scanned top to bottom to find
// where you left off, and a card grid makes six half-full tracks look like a
// broken shop rather than a path with room to grow.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { resourcesApi } from "../services/resourcesApi";
import ResourceReader from "./resources/ResourceReader";
import { useAuth } from "../context/AuthContext";

/* ── type marks ─────────────────────────────────────────────── */

const TypeMark = ({ type }) => {
  const paths = {
    video: "M8 5v14l11-7z",
    pdf: "M7 3h7l5 5v13H7z M14 3v5h5",
    link: "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1 M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
  };
  const d = paths[type];
  if (!d) return null;
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
};

const Tick = ({ on }) => (
  <span
    className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors"
    style={{
      background: on ? "rgb(var(--pos) / 0.18)" : "transparent",
      border: `1px solid ${on ? "rgb(var(--pos) / 0.45)" : "rgb(var(--ink) / 0.18)"}`,
      color: on ? "rgb(var(--pos-text))" : "transparent",
    }}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  </span>
);

/* ── one lesson ─────────────────────────────────────────────── */

const LessonRow = ({ lesson, index, onOpen, onToggle, canTrack }) => (
  <div
    className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink/[0.04]"
  >
    <button
      type="button"
      onClick={() => canTrack && onToggle(lesson)}
      disabled={!canTrack}
      title={
        canTrack
          ? lesson.completed
            ? "Mark as not done"
            : "Mark as done"
          : "Sign in to track your progress"
      }
      aria-label={lesson.completed ? "Mark as not done" : "Mark as done"}
      className="shrink-0 disabled:cursor-default"
    >
      <Tick on={lesson.completed} />
    </button>

    <button
      type="button"
      onClick={() => onOpen(lesson)}
      className="flex min-w-0 flex-1 items-baseline gap-2.5 text-left"
    >
      <span
        className="shrink-0 font-mono text-[10.5px] tabular-nums"
        style={{ color: "rgb(var(--ink) / 0.35)" }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span
        className={`truncate text-[13px] ${lesson.completed ? "" : "font-medium"}`}
        style={{ color: lesson.completed ? "rgb(var(--fg-muted))" : "rgb(var(--fg))" }}
      >
        {lesson.title}
      </span>
    </button>

    <span
      className="flex shrink-0 items-center gap-2 text-[10.5px]"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      <TypeMark type={lesson.type} />
      <span className="tabular-nums">{lesson.minutes} min</span>
    </span>
  </div>
);

/* ── one track ──────────────────────────────────────────────── */

const TrackSection = ({ track, onOpen, onToggle, canTrack }) => {
  const pct = track.lesson_count
    ? Math.round((track.completed_count / track.lesson_count) * 100)
    : 0;
  const done = track.lesson_count > 0 && track.completed_count === track.lesson_count;

  return (
    <section
      className="rounded-xl p-4 sm:p-5"
      style={{
        background: "rgb(var(--surface-raised))",
        border: "1px solid rgb(var(--ink) / 0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-text-primary">
            {track.title}
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
            {track.summary}
          </p>
        </div>
        {track.lesson_count > 0 && (
          <span
            className="shrink-0 font-mono text-[10.5px] tabular-nums"
            style={{ color: done ? "rgb(var(--pos-text))" : "rgb(var(--fg-muted))" }}
          >
            {track.completed_count}/{track.lesson_count} · {track.minutes}m
          </span>
        )}
      </div>

      {track.lesson_count > 0 && (
        <div
          className="mt-3 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: "rgb(var(--ink) / 0.07)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: done ? "rgb(var(--pos))" : "rgb(var(--accent))",
            }}
          />
        </div>
      )}

      <div className="mt-2 -mx-1">
        {track.lessons.length ? (
          track.lessons.map((l, i) => (
            <LessonRow
              key={l.id}
              lesson={l}
              index={i}
              onOpen={onOpen}
              onToggle={onToggle}
              canTrack={canTrack}
            />
          ))
        ) : (
          // Named rather than hidden: an empty track tells the reader what is
          // coming, and tells us what is missing.
          <p
            className="px-2.5 py-3 text-[12px] italic"
            style={{ color: "rgb(var(--ink) / 0.35)" }}
          >
            Nothing here yet.
          </p>
        )}
      </div>
    </section>
  );
};

/* ── page ───────────────────────────────────────────────────── */

export default function TipsPage() {
  const { isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  const load = useCallback(() => {
    resourcesApi
      .tracks()
      .then(setData)
      .catch(() => setError("Could not load lessons."));
  }, []);

  useEffect(load, [load]);

  // A lesson is deep-linkable — `/tips?lesson=slug` — so the app can send
  // someone straight to the explanation at the moment they are confused,
  // which is worth more than any amount of browsing.
  const wanted = params.get("lesson");
  useEffect(() => {
    if (!wanted || !data || reading) return;
    const all = data.tracks.flatMap((t) => t.lessons);
    const hit = all.find((l) => l.slug === wanted || String(l.id) === wanted);
    if (hit) setReading(hit);
  }, [wanted, data, reading]);

  const totals = data?.totals || { lessons: 0, completed: 0 };
  const pct = totals.lessons ? Math.round((totals.completed / totals.lessons) * 100) : 0;

  const openLesson = useCallback((lesson) => {
    setReading(lesson);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set("lesson", lesson.slug || String(lesson.id));
      return next;
    });
  }, [setParams]);

  const closeReader = useCallback(() => {
    setReading(null);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("lesson");
      return next;
    });
  }, [setParams]);

  // Optimistic: the tick is the whole interaction, and waiting a round-trip
  // to see it move makes the page feel broken.
  const toggle = useCallback(
    (lesson) => {
      const next = !lesson.completed;
      setData((d) =>
        d && {
          ...d,
          tracks: d.tracks.map((t) => ({
            ...t,
            lessons: t.lessons.map((l) =>
              l.id === lesson.id ? { ...l, completed: next } : l
            ),
            completed_count:
              t.completed_count +
              (t.lessons.some((l) => l.id === lesson.id) ? (next ? 1 : -1) : 0),
          })),
          totals: {
            ...d.totals,
            completed: d.totals.completed + (next ? 1 : -1),
          },
        }
      );
      resourcesApi.setComplete(lesson.id, next).catch(load);
    },
    [load]
  );

  const anyLessons = useMemo(
    () => (data?.tracks || []).some((t) => t.lesson_count > 0),
    [data]
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <header>
        <p
          className="font-mono text-[9.5px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "rgb(var(--fg-muted))" }}
        >
          LuxQuant · Tutorials
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Get more out of every call
        </h1>
        <p
          className="mt-2 max-w-xl text-[13.5px] leading-relaxed"
          style={{ color: "rgb(var(--fg-secondary))" }}
        >
          Short lessons, in the order they are useful — from reading a call to
          knowing exactly what our numbers do and do not claim.
        </p>

        {isAuthenticated && totals.lessons > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-[3px] w-40 overflow-hidden rounded-full"
              style={{ background: "rgb(var(--ink) / 0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "rgb(var(--accent))" }}
              />
            </div>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "rgb(var(--fg-muted))" }}
            >
              {totals.completed} of {totals.lessons} done
            </span>
          </div>
        )}
      </header>

      {error && (
        <p className="mt-8 text-[13px]" style={{ color: "rgb(var(--neg-text))" }}>
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="mt-8 text-[13px]" style={{ color: "rgb(var(--fg-muted))" }}>
          Loading…
        </p>
      )}

      {data && !anyLessons && (
        <div
          className="mt-8 rounded-xl px-5 py-8 text-center"
          style={{
            background: "rgb(var(--surface-raised))",
            border: "1px solid rgb(var(--ink) / 0.08)",
          }}
        >
          <p className="text-[14px] font-medium text-text-primary">
            The first lessons are being written.
          </p>
          <p className="mt-1.5 text-[12.5px]" style={{ color: "rgb(var(--fg-muted))" }}>
            The tracks below are where they will land.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(data?.tracks || []).map((t) => (
          <TrackSection
            key={t.slug}
            track={t}
            onOpen={openLesson}
            onToggle={toggle}
            canTrack={isAuthenticated}
          />
        ))}
      </div>

      {!isAuthenticated && anyLessons && (
        <p className="mt-6 text-center text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
          Sign in to keep track of what you have read.
        </p>
      )}

      {reading && <ResourceReader resource={reading} onClose={closeReader} />}
    </div>
  );
}
