import { useCallback, useEffect, useMemo, useState } from "react";
import { learningApi } from "../../../services/learningApi";

const cx = (...parts) => parts.filter(Boolean).join(" ");
const blankCourse = {
  title: "",
  slug: "",
  short_title: "",
  summary: "",
  description: "",
  category: "LuxQuant",
  level: "beginner",
  access_tier: "free",
  status: "draft",
  is_featured: false,
  sort_order: 0,
  estimated_minutes: 0,
  cover_image: "",
  skills: [],
  outcomes: [],
};
const blankModule = {
  course_id: "",
  title: "",
  slug: "",
  summary: "",
  sort_order: 0,
  estimated_minutes: 0,
  is_preview: false,
};
const blankLesson = {
  module_id: "",
  title: "",
  slug: "",
  summary: "",
  lesson_type: "slides",
  level: "beginner",
  access_tier: "inherit",
  status: "draft",
  sort_order: 0,
  estimated_minutes: 4,
  content: [],
  transcript: "",
  youtube_url: "",
  source_url: "",
};

function MiniIcon({ name, size = 16 }) {
  const p = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4l11-11-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    course: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M7 9h10M7 13h6" />
      </>
    ),
    module: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    lesson: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 11h6M9 15h6" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
    preview: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {p[name]}
    </svg>
  );
}
function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-ink/[0.07] bg-surface-raised p-4">
      <p className="font-mono text-[9px] uppercase tracking-[.18em] text-text-muted">{label}</p>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="text-2xl font-semibold tabular-nums text-text-primary">{value ?? 0}</span>
        {sub && <span className="mb-1 text-[10px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}
function Badge({ children, tone = "neutral" }) {
  const map = {
    neutral: "bg-ink/[.045] text-text-muted",
    published: "bg-positive/[.09] text-positive",
    draft: "bg-accent/[.1] text-accent",
    premium: "bg-accent/[.1] text-accent",
  };
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-[9.5px] font-semibold capitalize",
        map[tone] || map.neutral
      )}
    >
      {children}
    </span>
  );
}
const input =
  "w-full rounded-xl border border-ink/[0.09] bg-surface-raised px-3 py-2.5 text-[12.5px] text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent/45";
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold text-text-secondary">
        {label}
        {hint && <small className="font-normal text-text-muted">{hint}</small>}
      </span>
      {children}
    </label>
  );
}

function BlockComposer({ blocks, onChange }) {
  const add = (type) => {
    const defaults = {
      hero: { type, title: "New concept", eyebrow: "Concept", body: "" },
      callout: { type, tone: "info", title: "Important note", body: "" },
      compare: {
        type,
        title: "Compare",
        left: { label: "Evidence A", items: [] },
        right: { label: "Evidence B", items: [] },
      },
      steps: { type, title: "Workflow", items: [] },
      check: {
        type,
        question: "Decision question",
        options: ["Option A", "Option B"],
        answer: 0,
        explanation: "",
      },
      product: {
        type,
        title: "Practise in LuxQuant",
        body: "",
        path: "/signals",
        cta: "Open tool",
      },
    };
    onChange([...blocks, defaults[type]]);
  };
  const patch = (i, key, value) =>
    onChange(blocks.map((b, n) => (n === i ? { ...b, [key]: value } : b)));
  const move = (i, d) => {
    const n = i + d;
    if (n < 0 || n >= blocks.length) return;
    const copy = [...blocks];
    [copy[i], copy[n]] = [copy[n], copy[i]];
    onChange(copy);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-text-primary">Lesson blocks</p>
          <p className="text-[10px] text-text-muted">Each block becomes one focused slide.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            ["hero", "Concept"],
            ["callout", "Callout"],
            ["compare", "Compare"],
            ["steps", "Steps"],
            ["check", "Decision"],
            ["product", "Product action"],
          ].map(([id, l]) => (
            <button
              key={id}
              type="button"
              onClick={() => add(id)}
              className="rounded-lg border border-ink/[.08] px-2 py-1 text-[9.5px] font-semibold text-text-muted hover:border-accent/30 hover:text-text-primary"
            >
              + {l}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {blocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/[.12] p-6 text-center text-[11px] text-text-muted">
            Add the first block. Short lessons with 3–6 blocks work best.
          </div>
        )}
        {blocks.map((b, i) => (
          <div key={i} className="rounded-xl border border-ink/[.08] bg-ink/[.018] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 font-mono text-[9px] text-accent">
                  {i + 1}
                </span>
                <Badge>{b.type}</Badge>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  className="px-1.5 text-[10px] text-text-muted"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  className="px-1.5 text-[10px] text-text-muted"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(blocks.filter((_, n) => n !== i))}
                  className="px-1.5 text-[10px] text-loss"
                >
                  Remove
                </button>
              </div>
            </div>
            {(b.type === "hero" || b.type === "callout" || b.type === "product") && (
              <div className="grid gap-2">
                <input
                  className={input}
                  value={b.title || ""}
                  onChange={(e) => patch(i, "title", e.target.value)}
                  placeholder="Slide title"
                />
                <textarea
                  className={input}
                  rows={3}
                  value={b.body || ""}
                  onChange={(e) => patch(i, "body", e.target.value)}
                  placeholder="Explain one idea in plain language…"
                />
                {b.type === "hero" && (
                  <input
                    className={input}
                    value={b.eyebrow || ""}
                    onChange={(e) => patch(i, "eyebrow", e.target.value)}
                    placeholder="Eyebrow"
                  />
                )}
                {b.type === "callout" && (
                  <select
                    className={input}
                    value={b.tone || "info"}
                    onChange={(e) => patch(i, "tone", e.target.value)}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Invalidation / danger</option>
                  </select>
                )}
                {b.type === "product" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={input}
                      value={b.path || ""}
                      onChange={(e) => patch(i, "path", e.target.value)}
                      placeholder="/signals"
                    />
                    <input
                      className={input}
                      value={b.cta || ""}
                      onChange={(e) => patch(i, "cta", e.target.value)}
                      placeholder="Open Signals"
                    />
                  </div>
                )}
              </div>
            )}
            {b.type === "steps" && (
              <div className="grid gap-2">
                <input
                  className={input}
                  value={b.title || ""}
                  onChange={(e) => patch(i, "title", e.target.value)}
                  placeholder="Workflow title"
                />
                <textarea
                  className={input}
                  rows={5}
                  value={(b.items || [])
                    .map((x) => (typeof x === "string" ? x : x.label))
                    .join("\n")}
                  onChange={(e) => patch(i, "items", e.target.value.split("\n").filter(Boolean))}
                  placeholder="One step per line"
                />
              </div>
            )}
            {b.type === "compare" && (
              <div className="grid gap-2">
                <input
                  className={input}
                  value={b.title || ""}
                  onChange={(e) => patch(i, "title", e.target.value)}
                  placeholder="Comparison title"
                />
                <div className="grid grid-cols-2 gap-2">
                  {["left", "right"].map((side) => (
                    <div key={side} className="space-y-2">
                      <input
                        className={input}
                        value={b[side]?.label || ""}
                        onChange={(e) =>
                          patch(i, side, { ...(b[side] || {}), label: e.target.value })
                        }
                      />
                      <textarea
                        className={input}
                        rows={4}
                        value={(b[side]?.items || []).join("\n")}
                        onChange={(e) =>
                          patch(i, side, {
                            ...(b[side] || {}),
                            items: e.target.value.split("\n").filter(Boolean),
                          })
                        }
                        placeholder="One point per line"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {b.type === "check" && (
              <div className="grid gap-2">
                <textarea
                  className={input}
                  rows={2}
                  value={b.question || ""}
                  onChange={(e) => patch(i, "question", e.target.value)}
                  placeholder="Question"
                />
                <textarea
                  className={input}
                  rows={3}
                  value={(b.options || [])
                    .map((x) => (typeof x === "string" ? x : x.label))
                    .join("\n")}
                  onChange={(e) => patch(i, "options", e.target.value.split("\n").filter(Boolean))}
                  placeholder="One option per line"
                />
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <input
                    className={input}
                    type="number"
                    min="1"
                    value={(b.answer ?? 0) + 1}
                    onChange={(e) => patch(i, "answer", Math.max(0, Number(e.target.value) - 1))}
                  />
                  <input
                    className={input}
                    value={b.explanation || ""}
                    onChange={(e) => patch(i, "explanation", e.target.value)}
                    placeholder="Why this answer is correct"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor({ kind, item, context, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    kind === "course"
      ? { ...blankCourse, ...item, skills: item?.skills || [], outcomes: item?.outcomes || [] }
      : kind === "module"
        ? { ...blankModule, ...item, course_id: item?.course_id || context?.course?.id || "" }
        : {
            ...blankLesson,
            ...item,
            module_id: item?.module_id || context?.module?.id || "",
            content: item?.content || [],
          }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let saved;
      if (kind === "course")
        saved = item?.id
          ? await learningApi.updateCourse(item.id, form)
          : await learningApi.createCourse(form);
      else if (kind === "module")
        saved = item?.id
          ? await learningApi.updateModule(item.id, { ...form, course_id: Number(form.course_id) })
          : await learningApi.createModule({ ...form, course_id: Number(form.course_id) });
      else
        saved = item?.id
          ? await learningApi.updateLesson(item.id, { ...form, module_id: Number(form.module_id) })
          : await learningApi.createLesson({ ...form, module_id: Number(form.module_id) });
      onSaved(saved);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save this item.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-scrim/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className={cx(
          "max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-ink/[.1] bg-bg-secondary shadow-2xl sm:rounded-2xl",
          kind === "lesson" ? "max-w-4xl" : "max-w-2xl"
        )}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/[.08] bg-bg-secondary/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.18em] text-text-muted">
              Learning Studio
            </p>
            <h2 className="mt-1 text-base font-semibold text-text-primary">
              {item?.id ? "Edit" : "New"} {kind}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-ink/[.08] text-text-muted"
          >
            ×
          </button>
        </header>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input
                className={input}
                required
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </Field>
            <Field label="Slug" hint="auto if blank">
              <input
                className={input}
                value={form.slug || ""}
                onChange={(e) => update("slug", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Summary">
            <textarea
              className={input}
              rows={2}
              value={form.summary || ""}
              onChange={(e) => update("summary", e.target.value)}
            />
          </Field>
          {kind === "course" && (
            <>
              <Field label="Description">
                <textarea
                  className={input}
                  rows={4}
                  value={form.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Category">
                  <select
                    className={input}
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    <option>LuxQuant</option>
                    <option>Case Lab</option>
                    <option>Foundations</option>
                  </select>
                </Field>
                <Field label="Level">
                  <select
                    className={input}
                    value={form.level}
                    onChange={(e) => update("level", e.target.value)}
                  >
                    <option>beginner</option>
                    <option>intermediate</option>
                    <option>advanced</option>
                  </select>
                </Field>
                <Field label="Access">
                  <select
                    className={input}
                    value={form.access_tier}
                    onChange={(e) => update("access_tier", e.target.value)}
                  >
                    <option>free</option>
                    <option>premium</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Skills" hint="one per line">
                  <textarea
                    className={input}
                    rows={4}
                    value={(form.skills || []).join("\n")}
                    onChange={(e) => update("skills", e.target.value.split("\n").filter(Boolean))}
                  />
                </Field>
                <Field label="Learning outcomes" hint="one per line">
                  <textarea
                    className={input}
                    rows={4}
                    value={(form.outcomes || []).join("\n")}
                    onChange={(e) => update("outcomes", e.target.value.split("\n").filter(Boolean))}
                  />
                </Field>
              </div>
            </>
          )}
          {kind === "module" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Course">
                <select
                  className={input}
                  value={form.course_id}
                  onChange={(e) => update("course_id", e.target.value)}
                >
                  {context.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Order">
                <input
                  className={input}
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => update("sort_order", Number(e.target.value))}
                />
              </Field>
              <Field label="Preview">
                <select
                  className={input}
                  value={String(form.is_preview)}
                  onChange={(e) => update("is_preview", e.target.value === "true")}
                >
                  <option value="false">Premium rules apply</option>
                  <option value="true">Free preview</option>
                </select>
              </Field>
            </div>
          )}
          {kind === "lesson" && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Module">
                  <select
                    className={input}
                    value={form.module_id}
                    onChange={(e) => update("module_id", e.target.value)}
                  >
                    {context.modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.courseTitle} / {m.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Format">
                  <select
                    className={input}
                    value={form.lesson_type}
                    onChange={(e) => update("lesson_type", e.target.value)}
                  >
                    {["slides", "video", "reading", "case", "quiz", "action"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Minutes">
                  <input
                    className={input}
                    type="number"
                    min="1"
                    value={form.estimated_minutes}
                    onChange={(e) => update("estimated_minutes", Number(e.target.value))}
                  />
                </Field>
                <Field label="Access">
                  <select
                    className={input}
                    value={form.access_tier}
                    onChange={(e) => update("access_tier", e.target.value)}
                  >
                    <option>inherit</option>
                    <option>free</option>
                    <option>premium</option>
                  </select>
                </Field>
              </div>
              {form.lesson_type === "video" && (
                <Field label="YouTube URL">
                  <input
                    className={input}
                    value={form.youtube_url || ""}
                    onChange={(e) => update("youtube_url", e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                  />
                </Field>
              )}
              <div className="border-t border-ink/[.08] pt-5">
                <BlockComposer blocks={form.content || []} onChange={(v) => update("content", v)} />
              </div>
            </>
          )}
          <div className="grid gap-4 border-t border-ink/[.08] pt-5 sm:grid-cols-3">
            <Field label="Order">
              <input
                className={input}
                type="number"
                value={form.sort_order || 0}
                onChange={(e) => update("sort_order", Number(e.target.value))}
              />
            </Field>
            {kind !== "module" && (
              <Field label="Status">
                <select
                  className={input}
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  <option>draft</option>
                  <option>published</option>
                  <option>archived</option>
                </select>
              </Field>
            )}
            {kind === "course" && (
              <Field label="Featured">
                <select
                  className={input}
                  value={String(form.is_featured)}
                  onChange={(e) => update("is_featured", e.target.value === "true")}
                >
                  <option value="false">Normal</option>
                  <option value="true">Featured</option>
                </select>
              </Field>
            )}
          </div>
          {error && (
            <p className="rounded-xl border border-negative/20 bg-negative/[.06] p-3 text-[12px] text-loss">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-ink/[.09] px-4 py-2.5 text-[12px] font-semibold text-text-muted"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="rounded-xl bg-accent px-5 py-2.5 text-[12px] font-semibold text-accent-fg disabled:opacity-50"
            >
              {busy ? "Saving…" : form.status === "published" ? "Save & publish" : "Save draft"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function LearningStudioTab() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [view, setView] = useState("curriculum");
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      learningApi
        .adminCatalog()
      .then((d) => {
        setData(d);
        setSelected((s) => d.courses.find((course) => course.id === s?.id) || d.courses[0] || null);
      })
        .catch(() => setError("Could not load Learning Studio.")),
    []
  );
  useEffect(load, [load]);
  const courses = useMemo(() => data?.courses || [], [data]);
  const modules = useMemo(
    () => courses.flatMap((c) => c.modules.map((m) => ({ ...m, courseTitle: c.title }))),
    [courses]
  );
  const lessons = useMemo(
    () =>
      courses.flatMap((c) =>
        c.modules.flatMap((m) =>
          m.lessons.map((l) => ({ ...l, moduleTitle: m.title, courseTitle: c.title }))
        )
      ),
    [courses]
  );
  const filtered = lessons.filter(
    (l) =>
      !query ||
      `${l.title} ${l.summary} ${l.courseTitle}`.toLowerCase().includes(query.toLowerCase())
  );
  const openEdit = async (kind, item, context = {}) => {
    if (kind === "lesson" && item?.id) {
      try {
        const full = await learningApi.lesson(item.id);
        setEditor({ kind, item: { ...item, ...full }, context });
      } catch {
        setError("Could not open lesson editor.");
      }
    } else setEditor({ kind, item, context });
  };
  const context = { courses, modules, course: selected?.id ? selected : null, module: null };
  if (error && !data)
    return (
      <div className="rounded-2xl border border-negative/20 p-8 text-center text-sm text-loss">
        {error}
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Courses" value={data?.stats?.courses} />
        <Stat label="Modules" value={data?.stats?.modules} />
        <Stat label="Lessons" value={data?.stats?.lessons} />
        <Stat label="Published" value={data?.stats?.published} />
        <Stat label="Drafts" value={data?.stats?.drafts} />
        <Stat
          label="Learners"
          value={data?.stats?.learners}
          sub={`${data?.stats?.completions || 0} completions`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-ink/[.08] bg-ink/[.025] p-1">
          {[
            ["curriculum", "Curriculum"],
            ["lessons", "All lessons"],
            ["analytics", "Readiness"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cx(
                "rounded-lg px-3 py-2 text-[11px] font-semibold",
                view === id ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <MiniIcon name="search" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${input} pl-9`}
            placeholder="Search lessons, courses, skills…"
          />
        </div>
        <button
          onClick={() => openEdit("course", null, context)}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[12px] font-semibold text-accent-fg"
        >
          <MiniIcon name="plus" />
          New course
        </button>
      </div>
      {view === "curriculum" && (
        <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-ink/[.08] bg-surface-raised lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-ink/[.08] bg-ink/[.018] p-3 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-2 py-2">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.18em] text-text-muted">
                  Course map
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  Drag ordering comes next; edit order now.
                </p>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={cx(
                    "w-full rounded-xl border p-3 text-left",
                    selected?.id === c.id
                      ? "border-accent/30 bg-accent/[.07]"
                      : "border-transparent hover:border-ink/[.08] hover:bg-ink/[.025]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-text-primary">
                        {c.title}
                      </p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        {c.module_count} modules · {c.lesson_count} lessons
                      </p>
                    </div>
                    <Badge tone={c.status}>{c.status}</Badge>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/[.08]">
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${c.progress_pct || 0}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <main className="min-w-0 p-4 sm:p-5">
            {selected && (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/[.08] pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={selected.status}>{selected.status}</Badge>
                      <Badge tone={selected.access_tier}>{selected.access_tier}</Badge>
                      <Badge>{selected.level}</Badge>
                    </div>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
                      {selected.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-muted">
                      {selected.summary}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/tips/course/${selected.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-ink/[.09] px-3 py-2 text-[11px] font-semibold text-text-muted"
                    >
                      <MiniIcon name="preview" />
                      Preview
                    </a>
                    <button
                      onClick={() => openEdit("course", selected, context)}
                      className="inline-flex items-center gap-2 rounded-xl border border-ink/[.09] px-3 py-2 text-[11px] font-semibold text-text-primary"
                    >
                      <MiniIcon name="edit" />
                      Edit course
                    </button>
                    <button
                      onClick={() => openEdit("module", null, { ...context, course: selected })}
                      className="inline-flex items-center gap-2 rounded-xl bg-text-primary px-3 py-2 text-[11px] font-semibold text-bg-primary"
                    >
                      <MiniIcon name="plus" />
                      Module
                    </button>
                  </div>
                </header>
                <div className="mt-5 space-y-3">
                  {selected.modules.map((m, i) => (
                    <section
                      key={m.id}
                      className="rounded-2xl border border-ink/[.08] bg-ink/[.012]"
                    >
                      <header className="flex flex-wrap items-center gap-3 border-b border-ink/[.07] px-4 py-3">
                        <span className="font-mono text-[10px] text-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[13px] font-semibold text-text-primary">{m.title}</h3>
                          <p className="mt-0.5 text-[10px] text-text-muted">
                            {m.lesson_count} lessons · {m.estimated_minutes} min{" "}
                            {m.is_preview && "· Free preview"}
                          </p>
                        </div>
                        <button
                          onClick={() => openEdit("module", m, { ...context, course: selected })}
                          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-text-muted hover:bg-ink/[.04]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            openEdit("lesson", null, { ...context, course: selected, module: m })
                          }
                          className="rounded-lg border border-ink/[.08] px-2 py-1 text-[10px] font-semibold text-text-primary"
                        >
                          + Lesson
                        </button>
                      </header>
                      <div className="divide-y divide-ink/[.06]">
                        {m.lessons.map((l, n) => (
                          <button
                            key={l.id}
                            onClick={() =>
                              openEdit("lesson", l, { ...context, course: selected, module: m })
                            }
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[.018]"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink/[.08] bg-surface-raised font-mono text-[9px] text-text-muted">
                              {n + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-medium text-text-primary">
                                {l.title}
                              </p>
                              <p className="mt-0.5 text-[9.5px] text-text-muted">
                                {l.lesson_type} · {l.estimated_minutes} min · v{l.version}
                              </p>
                            </div>
                            <Badge tone={l.status}>{l.status}</Badge>
                            <MiniIcon name="edit" />
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      )}
      {view === "lessons" && (
        <div className="overflow-hidden rounded-2xl border border-ink/[.08] bg-surface-raised">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(160px,.7fr)_110px_90px_70px] gap-3 border-b border-ink/[.08] bg-ink/[.025] px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-text-muted">
            <span>Lesson</span>
            <span>Course / module</span>
            <span>Format</span>
            <span>Status</span>
            <span></span>
          </div>
          {filtered.map((l) => (
            <button
              key={l.id}
              onClick={() => openEdit("lesson", l, context)}
              className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(160px,.7fr)_110px_90px_70px] items-center gap-3 border-b border-ink/[.055] px-4 py-3 text-left hover:bg-ink/[.018]"
            >
              <span className="truncate text-[12px] font-medium text-text-primary">{l.title}</span>
              <span className="truncate text-[10px] text-text-muted">
                {l.courseTitle} / {l.moduleTitle}
              </span>
              <span>
                <Badge>{l.lesson_type}</Badge>
              </span>
              <span>
                <Badge tone={l.status}>{l.status}</Badge>
              </span>
              <span className="text-right text-[10px] text-text-muted">v{l.version}</span>
            </button>
          ))}
        </div>
      )}
      {view === "analytics" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-ink/[.08] bg-surface-raised p-5 lg:col-span-2">
            <p className="font-mono text-[9px] uppercase tracking-[.18em] text-text-muted">
              Readiness map
            </p>
            <div className="mt-5 space-y-5">
              {courses.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-text-primary">{c.title}</span>
                    <span className="text-text-muted">
                      {c.completed_count}/{c.lesson_count} completions in your current preview
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/[.07]">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${c.progress_pct || 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent/[.055] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[.18em] text-accent">
              Editorial quality
            </p>
            <h3 className="mt-2 text-lg font-semibold text-text-primary">Publish checklist</h3>
            <ul className="mt-4 space-y-3 text-[11.5px] leading-relaxed text-text-muted">
              <li>• One learning goal per lesson</li>
              <li>• 3–6 focused slides or a short YouTube video</li>
              <li>• At least one retrieval or decision prompt</li>
              <li>• Current product paths and definitions verified</li>
              <li>• Premium safety essentials have a free preview</li>
            </ul>
          </div>
        </div>
      )}
      {editor && (
        <Editor
          {...editor}
          context={{
            ...context,
            ...editor.context,
            modules,
            course: editor.context?.course,
            module: editor.context?.module,
          }}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default LearningStudioTab;
