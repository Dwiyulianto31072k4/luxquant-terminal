// src/components/TipsPage.jsx
// Compact course catalog. Hero stays a preamble, not a dashboard.
// Modules are a picker; the selected module owns the lesson list.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resourcesApi, coverUrl, youtubeThumb } from "../services/resourcesApi";
import ResourceReader from "./resources/ResourceReader";
import { useAuth } from "../context/AuthContext";
import { MODULE_COVERS, TYPE_LABEL } from "../content/tutorialCovers";

const coverFor = (lesson, trackSlug) =>
  coverUrl(lesson) ||
  (lesson?.type === "video" ? youtubeThumb(lesson.source_url) : null) ||
  MODULE_COVERS[trackSlug] ||
  MODULE_COVERS.start;

const Tick = ({ on, size = 16 }) => (
  <span
    className="inline-flex shrink-0 items-center justify-center rounded-full"
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
  <div className="h-1 w-full overflow-hidden rounded-full bg-ink/[0.08]">
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: done ? "rgb(var(--pos))" : "rgb(var(--accent))",
      }}
    />
  </div>
);

const SectionHead = ({ kicker, title, lede, right }) => (
  <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      {kicker ? (
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          {kicker}
        </p>
      ) : null}
      <h2 className="mt-1 font-display text-[17px] font-semibold tracking-tight text-text-primary sm:text-xl">
        {title}
      </h2>
      {lede ? (
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-text-secondary">{lede}</p>
      ) : null}
    </div>
    {right ? <div className="hidden shrink-0 sm:block">{right}</div> : null}
  </div>
);

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
      className={`flex h-full flex-col overflow-hidden rounded-xl border text-left transition-colors ${
        active
          ? "border-accent/45 bg-surface-raised"
          : "border-ink/[0.08] bg-surface-raised hover:border-ink/16"
      }`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-ink/[0.06]">
        <img src={cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-scrim/50 to-transparent" />
        <span className="absolute left-2 top-2 rounded bg-surface-raised/90 px-1.5 py-px font-mono text-[9.5px] font-semibold tabular-nums text-text-primary">
          {String(n).padStart(2, "0")}
        </span>
        {done && (
          <span className="absolute right-2 top-2">
            <Tick on size={16} />
          </span>
        )}
        <div className="absolute inset-x-2 bottom-2">
          <Bar pct={pct} done={done} />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-2.5 py-2.5 sm:px-3 sm:py-3">
        <h3 className="font-display text-[13.5px] font-semibold leading-snug tracking-tight text-text-primary sm:text-[15px]">
          {track.title}
        </h3>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-text-muted">
          {track.completed_count}/{track.lesson_count} · {track.minutes}m
        </p>
      </div>
    </button>
  );
};

const LessonRow = ({ lesson, index, trackSlug, onOpen, onToggle, canTrack }) => {
  const cover = coverFor(lesson, trackSlug);
  const kind = TYPE_LABEL[lesson.type] || "Lesson";

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-xl border bg-surface-raised ${
        lesson.completed ? "border-ink/[0.07]" : "border-ink/[0.08]"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(lesson)}
        className="flex min-w-0 flex-1 items-stretch text-left"
      >
        <div className="relative w-[88px] shrink-0 overflow-hidden bg-ink/[0.06] sm:w-[132px]">
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {kind}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {lesson.minutes}m
            </span>
          </div>
          <h3
            className={`mt-0.5 truncate font-display text-[14.5px] font-semibold tracking-tight sm:text-[15.5px] ${
              lesson.completed ? "text-text-muted" : "text-text-primary"
            }`}
          >
            {lesson.title}
          </h3>
          {lesson.excerpt && (
            <p className="mt-0.5 hidden line-clamp-1 text-[12.5px] text-text-secondary sm:block">
              {lesson.excerpt}
            </p>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={() => canTrack && onToggle(lesson)}
        disabled={!canTrack}
        title={canTrack ? (lesson.completed ? "Mark as not done" : "Mark as done") : "Sign in to track progress"}
        aria-label={lesson.completed ? "Mark as not done" : "Mark as done"}
        className="flex w-11 shrink-0 items-center justify-center border-l border-ink/[0.06] disabled:cursor-default sm:w-12"
      >
        <Tick on={lesson.completed} size={18} />
      </button>
    </div>
  );
};

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
  const activeIndex = tracks.findIndex((t) => t.slug === active?.slug);

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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      lessonsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="w-full pb-4">
      <header className="max-w-3xl">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Tutorials
        </p>
        <h1 className="mt-1.5 font-display text-[1.65rem] font-semibold leading-tight tracking-tight text-text-primary sm:text-3xl">
          Read the terminal before you size a call
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary sm:text-[14.5px]">
          This is the course for <em className="not-italic text-text-primary">this</em> product —
          not generic trading school. Six short modules: what a call is, what the numbers
          actually claim, then the tools, the Agent, and your account. Open any module.
          The order is the useful one, not a lock.
        </p>
      </header>

      {anyLessons && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {nextLesson && (
            <button
              type="button"
              onClick={() => {
                setActiveSlug(nextLesson.track.slug);
                openLesson(nextLesson.lesson);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-fg"
            >
              <span>{totals.completed ? "Continue" : "Start"}</span>
              <span className="max-w-[180px] truncate font-medium opacity-80 sm:max-w-[260px]">
                {nextLesson.lesson.title}
              </span>
              <span aria-hidden>→</span>
            </button>
          )}
          <p className="font-mono text-[11px] tabular-nums text-text-muted">
            {totals.completed}/{totals.lessons} · {totalMinutes} min
          </p>
          <div className="min-w-[120px] max-w-xs flex-1">
            <Bar pct={pct} done={pct === 100} />
          </div>
        </div>
      )}

      {error && <p className="mt-5 text-[13px] text-loss">{error}</p>}
      {!data && !error && (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-ink/[0.04]" />
          ))}
        </div>
      )}

      {data && (
        <>
          <section className="mt-7 sm:mt-9">
            <SectionHead
              kicker="The path"
              title="Choose a module"
              lede="Tap one to open its lessons. Start here if you are new; skip ahead if you already know the ladder."
            />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
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

          <section ref={lessonsRef} className="mt-8 scroll-mt-[calc(var(--lq-header-h,56px)+12px)] sm:mt-10">
            {active && (
              <>
                <SectionHead
                  kicker={`Module ${String(activeIndex + 1).padStart(2, "0")} of ${String(tracks.length).padStart(2, "0")}`}
                  title={active.title}
                  lede={active.summary}
                  right={
                    <span className="font-mono text-[11px] tabular-nums text-text-muted">
                      {active.completed_count}/{active.lesson_count} · {active.minutes} min
                    </span>
                  }
                />
                <p className="mt-1 font-mono text-[11px] tabular-nums text-text-muted sm:hidden">
                  {active.completed_count}/{active.lesson_count} · {active.minutes} min
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  {active.lessons.length ? (
                    active.lessons.map((l, i) => (
                      <LessonRow
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
                    <div className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center">
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
        <p className="mt-5 text-[12px] text-text-muted">
          Sign in to keep your place.
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
