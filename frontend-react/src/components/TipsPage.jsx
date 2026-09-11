import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { learningApi } from "../services/learningApi";
import { trackGrowth } from "../utils/growthAnalytics";
import { MODULE_COVERS } from "../content/tutorialCovers";
import AssistantWidget from "./assistant/AssistantWidget";
import "./learning/Learning.css";

const COURSE_COVERS = {
  "luxquant-essentials": MODULE_COVERS["read-a-call"],
  "signal-decision-lab": MODULE_COVERS.numbers,
  "luxquant-workflow": MODULE_COVERS.tools,
};
const TYPE_LABEL = {
  slides: "Interactive slides",
  video: "Video",
  reading: "Reading",
  case: "Case lab",
  quiz: "Knowledge check",
  action: "Product practice",
};
const cx = (...parts) => parts.filter(Boolean).join(" ");

function Icon({ name, size = 18, className = "" }) {
  const paths = {
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    note: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
        <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="m15 9 5-5" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

function Progress({ value, className = "" }) {
  return (
    <div className={cx("learning-progress", className)}>
      <span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}
function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-ink/10 bg-ink/[0.035] text-text-muted",
    gold: "border-accent/25 bg-accent/[0.09] text-accent",
    green: "border-positive/25 bg-positive/[0.08] text-positive",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
function CourseCover({ course, className = "" }) {
  const cover = course.cover_image || COURSE_COVERS[course.slug] || MODULE_COVERS.start;
  return (
    <div className={cx("learning-cover", className)}>
      <img src={cover} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-scrim/70 via-transparent to-transparent" />
      <div className="absolute left-3 top-3 flex gap-1.5">
        <Pill tone={course.access_tier === "premium" ? "gold" : "green"}>
          {course.access_tier === "premium" ? "Premium" : "Free"}
        </Pill>
        <Pill>{course.level}</Pill>
      </div>
    </div>
  );
}
function CourseCard({ course, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(course)}
      className="learning-card learning-course-card overflow-hidden text-left"
    >
      <CourseCover course={course} className="aspect-[16/9]" />
      <div className="p-4 sm:p-5">
        <p className="learning-eyebrow">{course.category}</p>
        <h3 className="mt-1.5 font-display text-lg font-semibold leading-tight tracking-tight text-text-primary">
          {course.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
          {course.summary}
        </p>
        <div className="mt-4 flex items-center justify-between text-[11px] text-text-muted">
          <span>
            {course.module_count} modules · {course.lesson_count} lessons
          </span>
          <span>{course.estimated_minutes} min</span>
        </div>
        <Progress value={course.progress_pct} className="mt-2.5" />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-text-muted">
            {course.progress_pct ? `${course.progress_pct}% complete` : "Ready to start"}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            View course <Icon name="arrow" size={14} />
          </span>
        </div>
      </div>
    </button>
  );
}
function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="aspect-[4/3] animate-pulse rounded-[18px] bg-ink/[0.045]" />
      ))}
    </div>
  );
}

function LearningHome() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    learningApi
      .catalog()
      .then(setData)
      .catch(() => setError("Learning is temporarily unavailable."));
  }, []);

  // The denominator. learning_progress only ever recorded a finished step, so
  // the tutorials looked like a feature 10 people use rather than one that
  // some number of people open and abandon. Fired once per mount, not per
  // render, and fire-and-forget like every other funnel event.
  useEffect(() => {
    trackGrowth("tutorial_viewed", { path: "/tips" });
  }, []);
  const courses = data?.courses || [];
  const visible = filter === "all" ? courses : courses.filter((c) => c.category === filter);
  const nextCourse = courses.find((c) => c.started_count > 0 && c.progress_pct < 100) || courses[0];
  const nextLesson = data?.next_lesson;
  const completed = data?.totals?.completed || 0;
  const total = data?.totals?.lessons || 0;
  const readiness = total ? Math.round((completed / total) * 100) : 0;
  const openCourse = (course) => navigate(`/tips/course/${course.slug}`);
  const continueLearning = () =>
    nextLesson ? navigate(`/tips/lesson/${nextLesson.slug}`) : nextCourse && openCourse(nextCourse);
  return (
    <div className="learning-shell space-y-8 pb-8" data-learning-build="studio-v1">
      <section className="learning-hero grid gap-7 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10 lg:py-10">
        <div className="relative z-[1] max-w-3xl">
          <p className="learning-eyebrow">LuxQuant Learning</p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-text-primary sm:text-[2.55rem]">
            Turn every signal into a decision you can explain.
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-7 text-text-secondary sm:text-[15px]">
            Product walkthroughs, market foundations, and frozen case labs built around the real
            questions LuxQuant users face—from TP ladders to retests and invalidation.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={continueLearning}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg shadow-[0_10px_24px_rgb(var(--accent)/0.18)]"
            >
              <Icon name="play" size={16} />
              {completed ? "Continue learning" : "Start the essentials"}
            </button>
            <button
              type="button"
              onClick={() =>
                document.getElementById("learning-catalog")?.scrollIntoView({ behavior: "smooth" })
              }
              className="rounded-xl border border-ink/10 bg-surface-raised/70 px-4 py-2.5 text-[13px] font-semibold text-text-primary"
            >
              Browse courses
            </button>
          </div>
          <p className="mt-4 text-[11px] text-text-muted">
            Education, not financial advice. Progress measures product understanding—not trading
            certification.
          </p>
        </div>
        <div className="relative z-[1] self-stretch rounded-2xl border border-ink/10 bg-surface-raised/90 p-5 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <p className="learning-eyebrow">Your readiness</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
                {readiness}%
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent">
              <Icon name="target" />
            </div>
          </div>
          <Progress value={readiness} className="mt-4" />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink/[0.07] pt-4 text-center">
            <div>
              <b className="text-base text-text-primary">{data?.totals?.courses || 0}</b>
              <div className="text-[10px] text-text-muted">Courses</div>
            </div>
            <div>
              <b className="text-base text-text-primary">{completed}</b>
              <div className="text-[10px] text-text-muted">Completed</div>
            </div>
            <div>
              <b className="text-base text-text-primary">{data?.totals?.minutes || 0}</b>
              <div className="text-[10px] text-text-muted">Minutes</div>
            </div>
          </div>
          {!isAuthenticated && (
            <p className="mt-4 rounded-xl bg-ink/[0.035] px-3 py-2 text-[11px] leading-relaxed text-text-muted">
              Sign in to save notes, scores, and progress across devices.
            </p>
          )}
        </div>
      </section>
      {nextCourse && (
        <section className="learning-card grid overflow-hidden lg:grid-cols-[1.2fr_.8fr]">
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Pill tone="gold">Continue</Pill>
              <span className="text-[11px] text-text-muted">Your next useful step</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-semibold text-text-primary">
              {nextLesson?.title || nextCourse.title}
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-text-secondary">
              {nextLesson?.summary || nextCourse.summary}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={continueLearning}
                className="rounded-xl bg-text-primary px-4 py-2.5 text-[12px] font-semibold text-bg-primary"
              >
                Resume lesson
              </button>
              <span className="text-[11px] text-text-muted">
                {nextLesson?.estimated_minutes || 4} min
              </span>
            </div>
          </div>
          <div className="border-t border-ink/[0.07] bg-ink/[0.018] p-5 lg:border-l lg:border-t-0 sm:p-6">
            <p className="learning-eyebrow">Why this next</p>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              The path moves from reading the published setup to judging current validity. You can
              skip ahead, but this sequence prevents the most common interpretation mistakes.
            </p>
            <Progress value={nextCourse.progress_pct} className="mt-5" />
            <p className="mt-2 text-[10.5px] text-text-muted">
              {nextCourse.completed_count}/{nextCourse.lesson_count} lessons complete
            </p>
          </div>
        </section>
      )}
      <section id="learning-catalog" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="learning-eyebrow">The curriculum</p>
            <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-text-primary">
              Choose what you need to decide better
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
              Start product-first, then deepen the market concepts inside real LuxQuant cases.
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.025] p-1">
            {[
              ["all", "All"],
              ["LuxQuant", "Product"],
              ["Case Lab", "Case labs"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-[11px] font-semibold",
                  filter === id
                    ? "bg-surface-raised text-text-primary shadow-sm"
                    : "text-text-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="mt-5 rounded-xl border border-negative/20 bg-negative/5 p-4 text-sm text-loss">
            {error}
          </p>
        )}
        {!data && !error ? (
          <div className="mt-5">
            <LoadingCards />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => (
              <CourseCard key={c.id} course={c} onOpen={openCourse} />
            ))}
          </div>
        )}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="learning-card p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon name="spark" />
            </div>
            <div>
              <p className="learning-eyebrow">How learning works</p>
              <h2 className="mt-0.5 font-display text-lg font-semibold text-text-primary">
                Explain → inspect → decide → practise
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ["01", "Short concept"],
              ["02", "Visual example"],
              ["03", "Frozen decision"],
              ["04", "Product action"],
            ].map(([n, t]) => (
              <div key={n} className="rounded-xl border border-ink/[0.07] bg-ink/[0.02] p-3">
                <span className="font-mono text-[10px] text-accent">{n}</span>
                <p className="mt-2 text-[12px] font-semibold text-text-primary">{t}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="learning-card p-5 sm:p-6">
          <p className="learning-eyebrow">Skill map</p>
          <div className="mt-4 space-y-4">
            {(data?.skills || []).slice(0, 3).map((s) => (
              <div key={`${s.course_slug}-${s.name}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-text-primary">{s.name}</span>
                  <span className="text-text-muted">{s.readiness}%</span>
                </div>
                <Progress value={s.readiness} className="mt-2" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <AssistantWidget pageId="tips" />
    </div>
  );
}

function LessonLine({ lesson }) {
  return (
    <Link
      to={lesson.locked ? "/pricing" : `/tips/lesson/${lesson.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-ink/[0.07] bg-surface-raised px-3 py-3 transition hover:border-accent/30"
    >
      <span
        className={cx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          lesson.completed
            ? "border-positive/30 bg-positive/10 text-positive"
            : "border-ink/10 bg-ink/[0.025] text-text-muted"
        )}
      >
        <Icon name={lesson.completed ? "check" : lesson.locked ? "lock" : "play"} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-text-primary">{lesson.title}</p>
          {lesson.lesson_type === "case" && <Pill tone="gold">Case</Pill>}
        </div>
        <p className="mt-0.5 text-[10.5px] text-text-muted">
          {TYPE_LABEL[lesson.lesson_type] || lesson.lesson_type} · {lesson.estimated_minutes} min
        </p>
      </div>
      <Icon
        name="arrow"
        size={15}
        className="text-text-muted transition group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function CourseDetail({ slug }) {
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    learningApi
      .course(slug)
      .then(setCourse)
      .catch(() => setError("Course not found."));
  }, [slug]);

  // Keyed on the slug, so moving between courses is counted as two opens
  // rather than one. Which course people actually pick is the part that says
  // where the curriculum is working.
  useEffect(() => {
    trackGrowth("tutorial_course_opened", {
      path: `/tips/${slug}`,
      entity_type: "course",
      entity_id: slug,
    });
  }, [slug]);
  if (error)
    return (
      <div className="learning-card p-8 text-center">
        <p className="text-loss">{error}</p>
        <Link to="/tips" className="mt-4 inline-block text-sm text-accent">
          Back to Learning
        </Link>
      </div>
    );
  if (!course) return <LoadingCards />;
  const first =
    course.modules.flatMap((m) => m.lessons).find((l) => !l.completed && !l.locked) ||
    course.modules.flatMap((m) => m.lessons).find((l) => !l.locked);
  return (
    <div className="learning-shell space-y-7 pb-8">
      <button
        onClick={() => navigate("/tips")}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted hover:text-text-primary"
      >
        <Icon name="back" size={15} />
        Learning home
      </button>
      <section className="learning-hero grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_430px]">
        <div className="relative z-[1] p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap gap-2">
            <Pill tone="gold">{course.category}</Pill>
            <Pill>{course.level}</Pill>
            <Pill tone={course.access_tier === "free" ? "green" : "gold"}>
              {course.access_tier}
            </Pill>
          </div>
          <h1 className="mt-5 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-text-primary sm:text-4xl">
            {course.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-7 text-text-secondary">
            {course.description || course.summary}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => first && navigate(`/tips/lesson/${first.slug}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg"
            >
              <Icon name="play" size={16} />
              {course.progress_pct ? "Continue course" : "Start course"}
            </button>
            <span className="text-[11px] text-text-muted">
              {course.module_count} modules · {course.lesson_count} lessons ·{" "}
              {course.estimated_minutes} min
            </span>
          </div>
          <Progress value={course.progress_pct} className="mt-6 max-w-lg" />
        </div>
        <CourseCover
          course={course}
          className="min-h-[260px] border-t border-ink/[0.07] lg:border-l lg:border-t-0"
        />
      </section>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div>
            <p className="learning-eyebrow">Course content</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text-primary">
              Build the skill in sequence
            </h2>
          </div>
          {course.modules.map((m, i) => (
            <details
              key={m.id}
              open={i === 0 || m.completed_count < m.lesson_count}
              className="learning-card overflow-hidden"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 p-4 sm:p-5">
                <span className="font-mono text-[11px] text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-text-primary">{m.title}</h3>
                  <p className="mt-1 text-[11.5px] text-text-muted">
                    {m.lesson_count} lessons · {m.estimated_minutes} min
                    {m.is_preview ? " · Free preview" : ""}
                  </p>
                </div>
                <span className="text-[11px] text-text-muted">
                  {m.completed_count}/{m.lesson_count}
                </span>
              </summary>
              <div className="space-y-2 border-t border-ink/[0.07] bg-ink/[0.015] p-3 sm:p-4">
                {m.lessons.map((l) => (
                  <LessonLine key={l.id} lesson={l} />
                ))}
              </div>
            </details>
          ))}
        </div>
        <aside className="space-y-4">
          <div className="learning-card p-5">
            <p className="learning-eyebrow">You will be able to</p>
            <ul className="learning-checklist mt-4 space-y-3 pl-5 text-[12.5px] leading-relaxed text-text-secondary">
              {course.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
          <div className="learning-card p-5">
            <p className="learning-eyebrow">Skills</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {course.skills.map((s) => (
                <Pill key={s}>{s}</Pill>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] p-5">
            <p className="text-[13px] font-semibold text-text-primary">Not a certification</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
              Completion means you understand the LuxQuant workflow and definitions. It does not
              certify profitability.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Block({ block, answer, setAnswer }) {
  if (!block) return null;
  if (block.type === "hero")
    return (
      <div>
        <p className="learning-eyebrow text-accent">{block.eyebrow}</p>
        <h2 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-[-0.025em] text-text-primary sm:text-4xl">
          {block.title}
        </h2>
        <p className="mt-5 max-w-3xl text-[15px] leading-8 text-text-secondary">{block.body}</p>
      </div>
    );
  if (block.type === "callout") {
    const tone =
      block.tone === "danger"
        ? "border-negative/25 bg-negative/[0.06]"
        : block.tone === "warning"
          ? "border-accent/25 bg-accent/[0.07]"
          : "border-positive/20 bg-positive/[0.05]";
    return (
      <div className={cx("rounded-2xl border p-5 sm:p-6", tone)}>
        <p className="learning-eyebrow">{block.tone || "Note"}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-text-primary">
          {block.title}
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-text-secondary">{block.body}</p>
      </div>
    );
  }
  if (block.type === "compare")
    return (
      <div>
        <p className="learning-eyebrow">Compare</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-text-primary">
          {block.title}
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[block.left, block.right].map((s, i) => (
            <div
              key={s.label}
              className={cx(
                "rounded-2xl border p-5",
                i ? "border-accent/20 bg-accent/[0.045]" : "border-ink/[0.08] bg-ink/[0.025]"
              )}
            >
              <p className="text-[13px] font-semibold text-text-primary">{s.label}</p>
              <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-text-secondary">
                {s.items.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  if (block.type === "steps" || block.type === "timeline")
    return (
      <div>
        <p className="learning-eyebrow">{block.type === "steps" ? "Workflow" : "Sequence"}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-text-primary">
          {block.title}
        </h2>
        <div className="mt-5 space-y-3">
          {block.items.map((raw, i) => {
            const item = typeof raw === "string" ? { label: raw } : raw;
            return (
              <div
                key={`${i}-${item.label}`}
                className="flex gap-3 rounded-xl border border-ink/[0.07] bg-ink/[0.02] p-3.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/12 font-mono text-[10px] font-bold text-accent">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">{item.label}</p>
                  {item.body && <p className="mt-1 text-[11.5px] text-text-muted">{item.body}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  if (block.type === "check" || block.type === "decision") {
    const opts = (block.options || []).map((o) => (typeof o === "string" ? { label: o } : o));
    return (
      <div>
        <p className="learning-eyebrow">Decision point</p>
        <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-text-primary">
          {block.question || block.prompt || block.title}
        </h2>
        <div className="mt-5 space-y-2">
          {opts.map((o, i) => (
            <button
              key={o.label}
              data-selected={answer === i}
              onClick={() => setAnswer(i)}
              className="learning-option text-[13px] font-medium text-text-primary"
            >
              <span className="mr-3 font-mono text-[10px] text-text-muted">
                {String.fromCharCode(65 + i)}
              </span>
              {o.label}
            </button>
          ))}
        </div>
        {answer !== null && (
          <div
            className={cx(
              "mt-4 rounded-xl border p-4 text-[12.5px] leading-relaxed",
              answer === block.answer
                ? "border-positive/25 bg-positive/[0.06] text-text-primary"
                : "border-accent/25 bg-accent/[0.06] text-text-secondary"
            )}
          >
            <strong>{answer === block.answer ? "Good judgement. " : "Look again. "}</strong>
            {opts[answer]?.result || block.explanation}
          </div>
        )}
      </div>
    );
  }
  if (block.type === "product")
    return (
      <div>
        <p className="learning-eyebrow">Practice in LuxQuant</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-text-primary">
          {block.title}
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-7 text-text-secondary">{block.body}</p>
        <Link
          to={block.path || "/signals"}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg"
        >
          {block.cta || "Open tool"}
          <Icon name="arrow" size={15} />
        </Link>
      </div>
    );
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-text-primary">{block.title}</h2>
      <p className="mt-3 text-[14px] leading-7 text-text-secondary">{block.body}</p>
    </div>
  );
}

function LessonPlayer({ slug }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [lesson, setLesson] = useState(null);
  const [course, setCourse] = useState(null);
  const [slide, setSlide] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [supportTab, setSupportTab] = useState("notes");
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setLesson(null);
    setSlide(0);
    setAnswer(null);
    setError("");
    learningApi
      .lesson(slug)
      .then((row) => {
        setLesson(row);
        learningApi.course(row.course.slug).then(setCourse);
        if (isAuthenticated)
          learningApi
            .notes(row.id)
            .then(setNotes)
            .catch(() => {});
      })
      .catch((e) =>
        setError(
          e?.response?.status === 403 ? "This lesson is included in Premium." : "Lesson not found."
        )
      );
  }, [slug, isAuthenticated]);
  const playlist = useMemo(() => course?.modules.flatMap((m) => m.lessons) || [], [course]);
  const index = playlist.findIndex((x) => x.id === lesson?.id);
  const previous = index > 0 ? playlist[index - 1] : null;
  const next = index >= 0 && index < playlist.length - 1 ? playlist[index + 1] : null;
  const blocks = lesson?.content || [];
  const pct = blocks.length ? Math.round(((slide + 1) / blocks.length) * 100) : 0;
  const persist = useCallback(
    (progress) => {
      if (lesson && isAuthenticated)
        learningApi
          .progress(lesson.id, {
            progress_pct: progress,
            last_position: `slide:${slide}`,
            state: {},
          })
          .catch(() => {});
    },
    [lesson, isAuthenticated, slide]
  );
  const goNext = () => {
    if (slide < blocks.length - 1) {
      const n = slide + 1;
      setSlide(n);
      setAnswer(null);
      if (isAuthenticated)
        learningApi
          .progress(lesson.id, {
            progress_pct: Math.max(
              lesson.progress_pct || 0,
              Math.round(((n + 1) / blocks.length) * 95)
            ),
            last_position: `slide:${n}`,
            state: {},
          })
          .catch(() => {});
    } else {
      persist(100);
      if (next && !next.locked) navigate(`/tips/lesson/${next.slug}`);
      else navigate(`/tips/course/${lesson.course.slug}`);
    }
  };
  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      const row = await learningApi.addNote(lesson.id, {
        body: note.trim(),
        anchor: `slide:${slide + 1}`,
      });
      setNotes((x) => [row, ...x]);
      setNote("");
    } catch {}
  };
  if (error)
    return (
      <div className="learning-card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name="lock" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">{error}</h1>
        <p className="mt-2 text-sm text-text-muted">
          Preview the first module for free or unlock the complete case lab.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            to="/tips"
            className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-text-primary"
          >
            Back
          </Link>
          <Link
            to="/pricing"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
          >
            See Premium
          </Link>
        </div>
      </div>
    );
  if (!lesson) return <LoadingCards />;
  return (
    <div className="learning-shell learning-player overflow-hidden">
      <div className="flex h-14 items-center justify-between border-b border-ink/[0.08] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => navigate(`/tips/course/${lesson.course.slug}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-ink/[0.04]"
          >
            <Icon name="back" size={17} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-text-primary">{lesson.title}</p>
            <p className="truncate text-[9.5px] text-text-muted">
              {lesson.course.title} · {lesson.module.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10.5px] text-text-muted sm:inline">
            Slide {slide + 1} of {Math.max(blocks.length, 1)}
          </span>
          <div className="w-20 sm:w-28">
            <Progress value={pct} />
          </div>
          <button
            onClick={() => navigate(`/tips/course/${lesson.course.slug}`)}
            className="hidden rounded-lg border border-ink/10 px-3 py-1.5 text-[11px] font-medium text-text-primary sm:block"
          >
            Course overview
          </button>
        </div>
      </div>
      <div className="learning-player-grid">
        <aside className="learning-player-rail overflow-y-auto p-3">
          <p className="learning-eyebrow px-2 py-2">Curriculum</p>
          <div className="mt-1 space-y-3">
            {course?.modules.map((m) => (
              <div key={m.id}>
                <p className="px-2 text-[10px] font-semibold text-text-muted">{m.title}</p>
                <div className="mt-1 space-y-1">
                  {m.lessons.map((l) => (
                    <button
                      key={l.id}
                      disabled={l.locked}
                      onClick={() => !l.locked && navigate(`/tips/lesson/${l.slug}`)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                        l.id === lesson.id
                          ? "bg-accent/10 text-text-primary"
                          : "text-text-muted hover:bg-ink/[0.035]"
                      )}
                    >
                      <span
                        className={cx(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          l.completed ? "border-positive/30 text-positive" : "border-ink/10"
                        )}
                      >
                        <Icon name={l.completed ? "check" : l.locked ? "lock" : "play"} size={10} />
                      </span>
                      <span className="line-clamp-2 text-[10.5px] leading-tight">{l.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex min-w-0 flex-col px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-2">
              <Pill tone={lesson.lesson_type === "case" ? "gold" : "neutral"}>
                {TYPE_LABEL[lesson.lesson_type]}
              </Pill>
              <Pill>{lesson.estimated_minutes} min</Pill>
            </div>
            <button
              onClick={() => setSupportTab("notes")}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted lg:hidden"
            >
              <Icon name="note" size={14} />
              Notes
            </button>
          </div>
          {lesson.youtube_url ? (
            <div className="aspect-video overflow-hidden rounded-2xl border border-ink/10">
              <iframe
                title={lesson.title}
                src={lesson.youtube_url.replace("watch?v=", "embed/")}
                className="h-full w-full"
                allowFullScreen
              />
            </div>
          ) : (
            <article className="learning-slide flex-1 p-5 sm:p-8 lg:p-10">
              <Block
                block={
                  blocks[slide] || {
                    type: "hero",
                    eyebrow: "Lesson",
                    title: lesson.title,
                    body: lesson.summary,
                  }
                }
                answer={answer}
                setAnswer={setAnswer}
              />
            </article>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              disabled={slide === 0 && !previous}
              onClick={() =>
                slide > 0
                  ? (setSlide(slide - 1), setAnswer(null))
                  : previous && navigate(`/tips/lesson/${previous.slug}`)
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 px-3.5 py-2 text-[12px] font-medium text-text-primary disabled:opacity-30"
            >
              <Icon name="back" size={14} />
              Previous
            </button>
            <div className="hidden text-[10.5px] text-text-muted sm:block">
              {isAuthenticated ? "Progress saved automatically" : "Sign in to save progress"}
            </div>
            <button
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12px] font-semibold text-accent-fg"
            >
              {slide < blocks.length - 1 ? "Next slide" : next ? "Next lesson" : "Finish course"}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </main>
        <aside className="learning-player-support overflow-y-auto p-4">
          <div className="flex rounded-lg border border-ink/[0.08] bg-ink/[0.025] p-1">
            {[
              ["notes", "Notes"],
              ["glossary", "Key terms"],
              ["research", "Research"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSupportTab(id)}
                className={cx(
                  "flex-1 rounded-md px-2 py-1.5 text-[10.5px] font-semibold",
                  supportTab === id
                    ? "bg-surface-raised text-text-primary shadow-sm"
                    : "text-text-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {supportTab === "notes" && (
            <div className="mt-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isAuthenticated ? "Capture your reasoning…" : "Sign in to save notes"}
                disabled={!isAuthenticated}
                rows={4}
                className="w-full resize-none rounded-xl border border-ink/10 bg-surface-raised p-3 text-[12px] text-text-primary outline-none focus:border-accent/40 disabled:opacity-50"
              />
              <button
                onClick={saveNote}
                disabled={!note.trim()}
                className="mt-2 w-full rounded-lg bg-text-primary px-3 py-2 text-[11px] font-semibold text-bg-primary disabled:opacity-30"
              >
                Save note
              </button>
              <div className="mt-4 space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3"
                  >
                    <p className="text-[11.5px] leading-relaxed text-text-secondary">{n.body}</p>
                    <p className="mt-2 font-mono text-[9px] text-text-muted">{n.anchor}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {supportTab === "glossary" && (
            <div className="mt-4 space-y-3">
              {[
                [
                  "Invalidation",
                  "The price or condition that makes the original thesis no longer valid.",
                ],
                [
                  "Retest",
                  "Price revisits a prior level; the reaction matters more than the label.",
                ],
                ["Confluence", "Independent evidence pointing in the same direction."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3">
                  <p className="text-[11px] font-semibold text-text-primary">{t}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-text-muted">{b}</p>
                </div>
              ))}
            </div>
          )}
          {supportTab === "research" && (
            <div className="mt-4 space-y-3">
              <p className="text-[11.5px] leading-relaxed text-text-muted">
                Check the current market before applying an old case to a live setup.
              </p>
              <Link
                to="/ai-arena"
                className="flex items-center justify-between rounded-xl border border-ink/[0.08] bg-surface-raised p-3 text-[11.5px] font-semibold text-text-primary"
              >
                AI Research <Icon name="arrow" size={14} />
              </Link>
              <Link
                to="/signals"
                className="flex items-center justify-between rounded-xl border border-ink/[0.08] bg-surface-raised p-3 text-[11.5px] font-semibold text-text-primary"
              >
                Signals <Icon name="arrow" size={14} />
              </Link>
              <a
                href="https://x.com/search"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-ink/[0.08] bg-surface-raised p-3 text-[11.5px] font-semibold text-text-primary"
              >
                Research on X <Icon name="arrow" size={14} />
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function TipsPage() {
  const { courseSlug, lessonSlug } = useParams();
  if (lessonSlug) return <LessonPlayer slug={lessonSlug} />;
  if (courseSlug) return <CourseDetail slug={courseSlug} />;
  return <LearningHome />;
}
