// src/components/SocialPostsAdminPage.jsx
// Admin review UI for AI-generated social post drafts.
// Grid of image-only cards; clicking one opens an Instagram-style modal
// (image left, caption right) as a mirror preview of the eventual post.

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/authApi";

const IG_AVATAR = "/logo.png";
const IG_HANDLE = "luxquant.tw";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "posted", label: "Posted" },
  { key: "rejected", label: "Rejected" },
];

const DEFAULT_GEN_STEPS = [
  { id: "queued", label: "Queued" },
  { id: "pick_news", label: "Picking news" },
  { id: "extract", label: "Extracting article" },
  { id: "search", label: "Enriching sources" },
  { id: "editorial", label: "Writing caption (AI)" },
  { id: "entities", label: "Detecting logos & people" },
  { id: "image", label: "Generating image (AI)" },
  { id: "compose", label: "Composing card" },
  { id: "save", label: "Saving draft" },
  { id: "done", label: "Done" },
];

const STATUS_STYLE = {
  draft: { bg: "rgba(212,168,83,0.16)", fg: "#e2b45c", label: "DRAFT" },
  approved: { bg: "rgba(34,197,94,0.16)", fg: "#22c55e", label: "APPROVED" },
  posted: { bg: "rgba(59,130,246,0.16)", fg: "#3b82f6", label: "POSTED" },
  rejected: { bg: "rgba(239,68,68,0.16)", fg: "#ef4444", label: "REJECTED" },
  error: { bg: "rgba(239,68,68,0.16)", fg: "#ef4444", label: "ERROR" },
};

const Spinner = ({ className = "w-3.5 h-3.5" }) => (
  <span
    className={`${className} inline-block rounded-full border-2 border-gold-primary/25 border-t-gold-primary animate-spin`}
    aria-hidden
  />
);

const elapsedLabel = (startedAt) => {
  if (!startedAt) return null;
  try {
    const t = new Date(startedAt).getTime();
    if (Number.isNaN(t)) return null;
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  } catch {
    return null;
  }
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || { bg: "rgba(255,255,255,0.08)", fg: "#9ca3af", label: (status || "").toUpperCase() };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] tracking-[0.12em]"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.fg}33` }}
    >
      {s.label}
    </span>
  );
};

const VerifiedTick = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#3b82f6" />
    <path d="M7.5 12.5l2.8 2.8 6.2-6.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const money = (n) => {
  const v = Number(n || 0);
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
};

// ── Cost dashboard (generation spend monitoring) ────────────────
const CostBar = ({ cost }) => {
  if (!cost) return null;
  const a = cost.all_time || {};
  const t = cost.today || {};
  const tokens = (a.prompt_tokens || 0) + (a.completion_tokens || 0);
  const cards = [
    { label: "Total cost", value: money(a.total_usd), sub: `${a.posts || 0} drafts` },
    { label: "Today", value: money(t.total_usd), sub: `${t.posts || 0} drafts` },
    { label: "Avg / draft", value: money(a.avg_usd), sub: "estimate" },
    { label: "Text", value: money(a.chat_usd), sub: `${tokens.toLocaleString()} tokens` },
    { label: "Image", value: money(a.image_usd), sub: `${a.images || 0} images` },
    { label: "Search", value: money(a.search_usd), sub: `${a.searches || 0} searches` },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
      {cards.map((c, i) => (
        <div key={i} className="rounded-lg bg-black/25 border border-white/[0.08] px-3 py-2.5">
          <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-muted">{c.label}</p>
          <p className="text-white text-[16px] font-semibold mt-0.5">{c.value}</p>
          {c.sub && <p className="text-[10px] text-text-muted/70 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
};

const needsMaterials = (post) =>
  Boolean(post?.gen_meta?.needs_materials || post?.gen_meta?.visual_materials?.needs_materials);

const awaitingImage = (post) =>
  Boolean(
    post?.image_mode === "awaiting_materials" ||
      post?.gen_meta?.awaiting_image ||
      (needsMaterials(post) && !post?.image_url)
  );

// ── Generation console: durable progress that survives refresh ──
const GenerationConsole = ({
  job,
  newsId,
  setNewsId,
  onGenerate,
  starting,
  platform,
  setPlatform,
}) => {
  const isRunning = job?.status === "running";
  const isDone = job?.status === "done";
  const isError = job?.status === "error";
  const steps = job?.steps?.length ? job.steps : DEFAULT_GEN_STEPS;
  const stepIds = steps.map((s) => s.id);
  const activeIdx = Math.max(0, stepIds.indexOf(job?.step || "queued"));
  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? 0)));
  const elapsed = elapsedLabel(job?.started_at);
  const [tick, setTick] = useState(0);

  // Live elapsed timer while running
  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);
  void tick;

  const borderTone = isError
    ? "border-red-500/35"
    : isRunning
      ? "border-gold-primary/35"
      : isDone
        ? "border-green-500/30"
        : "border-white/[0.08]";

  const glow = isRunning
    ? "shadow-[0_0_40px_-12px_rgba(212,168,83,0.45)]"
    : "";

  return (
    <div
      className={`relative mb-5 rounded-xl border ${borderTone} ${glow} overflow-hidden`}
      style={{
        background:
          "linear-gradient(145deg, rgba(18,18,22,0.95) 0%, rgba(10,10,14,0.98) 100%)",
      }}
    >
      {/* subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative p-4 sm:p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center border ${
                isRunning
                  ? "bg-gold-primary/15 border-gold-primary/40"
                  : isError
                    ? "bg-red-500/15 border-red-500/40"
                    : isDone
                      ? "bg-green-500/15 border-green-500/40"
                      : "bg-white/[0.04] border-white/10"
              }`}
            >
              {isRunning ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white text-[15px] font-semibold tracking-tight">
                  Generate Console
                </h2>
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-gold-primary/15 text-gold-primary border border-gold-primary/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-pulse" />
                    Live
                  </span>
                )}
                {isDone && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-green-500/15 text-green-400 border border-green-500/30">
                    Complete
                  </span>
                )}
                {isError && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-red-500/15 text-red-400 border border-red-500/30">
                    Failed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                AI draft pipeline — progress is saved server-side, so refresh won&apos;t lose the run.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-black/30 overflow-hidden">
              <label className="sr-only" htmlFor="gen-news-id">News ID</label>
              <input
                id="gen-news-id"
                value={newsId}
                onChange={(e) => setNewsId(e.target.value)}
                disabled={isRunning || starting}
                placeholder="News ID (optional)"
                className="w-32 sm:w-36 px-3 py-2 bg-transparent text-white text-[12px] placeholder:text-text-muted/50 focus:outline-none disabled:opacity-50"
              />
              <div className="w-px self-stretch bg-white/[0.08]" />
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                disabled={isRunning || starting}
                className="px-2.5 py-2 bg-transparent text-text-muted text-[11px] font-mono focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                <option value="x">X / Twitter</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <button
              onClick={onGenerate}
              disabled={isRunning || starting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-gold-primary text-black hover:bg-gold-light disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_-6px_rgba(212,168,83,0.7)]"
            >
              {(isRunning || starting) && <Spinner className="w-3 h-3 border-black/25 border-t-black" />}
              {isRunning || starting ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </div>

        {/* Active / recent job panel */}
        {(isRunning || isDone || isError || job) && (
          <div className="rounded-lg border border-white/[0.07] bg-black/35 p-3.5 sm:p-4 space-y-3.5">
            {/* Progress bar + meta */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[12px] text-white font-medium truncate">
                    {job?.message || job?.step_label || (isRunning ? "Working…" : "—")}
                  </p>
                  <p className="text-[10px] font-mono text-text-muted mt-0.5">
                    {job?.id ? `Job ${job.id}` : "—"}
                    {job?.news_id ? ` · news #${job.news_id}` : ""}
                    {job?.platform ? ` · ${job.platform}` : ""}
                    {elapsed ? ` · ${elapsed}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-[18px] font-semibold tabular-nums leading-none ${
                      isError ? "text-red-400" : isDone ? "text-green-400" : "text-gold-primary"
                    }`}
                  >
                    {isError ? "!" : `${progress}%`}
                  </p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-text-muted mt-1">
                    {job?.step_label || job?.step || "idle"}
                  </p>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    isError
                      ? "bg-red-500"
                      : isDone
                        ? "bg-green-500"
                        : "bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light"
                  }`}
                  style={{
                    width: `${isError ? 100 : progress}%`,
                    boxShadow: isRunning ? "0 0 12px rgba(212,168,83,0.55)" : undefined,
                  }}
                />
              </div>
            </div>

            {/* Step rail */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {steps.map((s, i) => {
                const done = isDone || i < activeIdx || (isError && i < activeIdx);
                const active = isRunning && i === activeIdx;
                const failed = isError && i === activeIdx;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] font-mono transition-colors ${
                      failed
                        ? "bg-red-500/10 border-red-500/30 text-red-300"
                        : active
                          ? "bg-gold-primary/10 border-gold-primary/35 text-gold-primary"
                          : done
                            ? "bg-green-500/8 border-green-500/20 text-green-400/90"
                            : "bg-white/[0.02] border-white/[0.06] text-text-muted/70"
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold ${
                        failed
                          ? "bg-red-500 text-white"
                          : active
                            ? "bg-gold-primary text-black"
                            : done
                              ? "bg-green-500 text-white"
                              : "bg-white/10 text-text-muted"
                      }`}
                    >
                      {failed ? "!" : done ? "✓" : active ? "·" : i + 1}
                    </span>
                    <span className="truncate leading-tight">{s.label}</span>
                  </div>
                );
              })}
            </div>

            {isError && job?.error && (
              <div className="rounded-md bg-red-500/10 border border-red-500/25 px-3 py-2 text-[11px] text-red-300">
                {job.error}
              </div>
            )}

            {isDone && Array.isArray(job?.result) && job.result.length > 0 && (
              <div className="rounded-md bg-green-500/10 border border-green-500/25 px-3 py-2 text-[11px] text-green-300/95">
                Draft ready
                {job.result[0]?.id ? ` · post #${job.result[0].id}` : ""}
                {job.result[0]?.headline ? ` — ${job.result[0].headline}` : ""}
              </div>
            )}

            {isRunning && (
              <p className="text-[10px] text-text-muted/80 font-mono">
                Safe to refresh or leave this page — the job keeps running and this console will resume.
              </p>
            )}
          </div>
        )}

        {!job && !isRunning && (
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/20 px-3.5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {[
              "Pick news",
              "Extract & enrich",
              "AI caption",
              "Logos & faces",
              "AI image",
              "Save draft",
            ].map((label, i) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[10px] font-mono text-text-muted/80">
                <span className="w-4 h-4 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-[8px] text-text-muted">
                  {i + 1}
                </span>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Image-only card (default view) ──────────────────────────────
const ImageCard = ({ post, onOpen }) => {
  const waiting = awaitingImage(post);
  return (
    <button
      onClick={() => onOpen(post)}
      className="group relative rounded-lg overflow-hidden bg-black/30 border border-white/[0.08] hover:border-gold-primary/40 transition-colors text-left"
    >
      {post.image_url ? (
        <img
          src={post.image_url}
          alt=""
          loading="lazy"
          className="w-full aspect-[4/5] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-2 px-3 text-center bg-gradient-to-b from-black/40 to-black/70">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-300/90">
            {waiting ? "Waiting for assets" : "No image"}
          </span>
          <p className="text-[11px] text-text-muted leading-snug line-clamp-3">
            {post.headline || "Draft"}
          </p>
          {waiting && (
            <span className="text-[9px] text-text-muted/80 font-mono">
              Image not generated yet — saves cost
            </span>
          )}
        </div>
      )}
      <span className="absolute top-2 left-2 flex flex-col gap-1">
        <StatusBadge status={post.status} />
        {needsMaterials(post) && (
          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[9px] tracking-wide bg-amber-500/20 text-amber-300 border border-amber-400/30">
            {waiting ? "UPLOAD ASSETS" : "NEEDS ASSETS"}
          </span>
        )}
      </span>
    </button>
  );
};

// ── Materials panel: safe mode — admin upload before AI image ──
const MaterialsPanel = ({ postId, onUpdated }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get(`/api/v1/admin/social-posts/${postId}/materials`);
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load materials");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (item, file) => {
    if (!file) return;
    setBusy(item.name);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("name", item.name);
      fd.append("kind", item.kind || "logo");
      fd.append("file", file);
      await api.post(`/api/v1/admin/social-posts/${postId}/materials`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const confirmAsset = async (item) => {
    setBusy(`confirm:${item.name}`);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("name", item.name);
      fd.append("kind", item.kind || "logo");
      await api.post(`/api/v1/admin/social-posts/${postId}/materials/confirm`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Confirm failed — try uploading a file instead");
    } finally {
      setBusy(null);
    }
  };

  const reRender = async () => {
    setBusy("__render__");
    setErr(null);
    try {
      const res = await api.post(`/api/v1/admin/social-posts/${postId}/re-render`);
      await load();
      if (onUpdated && res.data?.post) onUpdated(res.data.post);
    } catch (e) {
      const d = e?.response?.data?.detail;
      setErr(
        (typeof d === "object" && d?.message) ||
          (typeof d === "string" ? d : null) ||
          "Re-render failed"
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="text-[11px] font-mono text-text-muted">Checking required assets…</p>;
  }
  if (!data) return null;

  const inv = data.inventory || [];
  const requests = data.requests || [];
  const primaryName = data.primary_org?.name;
  const pending = inv.filter((i) => i.status === "missing" || i.status === "needs_upload");
  const ready = inv.filter((i) => i.status === "resolved");

  const statusStyle = (st) => {
    if (st === "resolved") return "bg-green-500/15 text-green-400 border-green-500/25";
    if (st === "needs_upload") return "bg-amber-500/15 text-amber-300 border-amber-400/30";
    return "bg-red-500/10 text-red-300 border-red-500/25";
  };

  return (
    <div className="rounded-xl border border-amber-400/20 bg-gradient-to-b from-amber-500/[0.07] to-black/40 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-gold-primary">
            Safe materials · all story brands
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
            Every brand in the story (Coinbase, Hyperliquid, Circle, banks…) + face must be
            admin-uploaded before AI image. Unverified marks are forbidden — no invented HYPE logos.
          </p>
        </div>
        {data.needs_materials ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-400/35">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {data.missing_count} required
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wide bg-green-500/15 text-green-400 border border-green-500/30">
            Verified
          </span>
        )}
      </div>

      {(primaryName || (data.story_orgs || []).length > 0) && (
        <p className="text-[10px] font-mono text-text-muted leading-relaxed">
          Brands required:{" "}
          <span className="text-white">
            {(data.story_orgs || [])
              .map((o) => o?.name)
              .filter(Boolean)
              .join(" · ") || primaryName}
          </span>
          {data.featured_person ? (
            <>
              {" "}
              · Face: <span className="text-white">{data.featured_person}</span>
            </>
          ) : null}
        </p>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg bg-black/35 border border-amber-400/25 px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-200">
            Upload before generate ({pending.length}):
          </p>
          {pending.map((r, i) => (
            <p key={i} className="text-[11px] text-amber-100/90 leading-snug">
              • <span className="font-medium">{r.name}</span>
              <span className="text-amber-200/60 font-mono text-[10px]"> · {r.kind}</span>
              {r.request ? ` — ${r.request.split(".")[0]}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {inv.map((item) => {
          const needAction = item.status === "missing" || item.status === "needs_upload";
          return (
            <div
              key={`${item.type}-${item.name}`}
              className={`rounded-lg border px-2.5 py-2 ${
                needAction
                  ? "border-amber-400/30 bg-amber-500/[0.06]"
                  : "border-white/[0.07] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[12px] text-white font-medium truncate">{item.name}</p>
                    <span className="text-text-muted font-mono text-[9px] uppercase">
                      {item.kind}
                    </span>
                  </div>
                  {item.role && (
                    <p className="text-[10px] text-text-muted truncate mt-0.5">{item.role}</p>
                  )}
                  {item.request && needAction && (
                    <p className="text-[10px] text-amber-200/85 mt-1 leading-snug">{item.request}</p>
                  )}
                  {item.trusted && (
                    <p className="text-[9px] font-mono text-green-400/80 mt-0.5">
                      trusted · {item.source || "admin"}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${statusStyle(
                    item.status
                  )}`}
                >
                  {item.status === "needs_upload"
                    ? "upload req"
                    : item.status === "resolved"
                      ? "ok"
                      : "missing"}
                </span>
              </div>
              {needAction && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <label className="cursor-pointer px-2.5 py-1 rounded-md text-[10px] font-semibold bg-gold-primary text-black hover:bg-gold-light transition-colors">
                    {busy === item.name ? "Uploading…" : "Upload official file"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!!busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(item, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {item.status === "needs_upload" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => confirmAsset(item)}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium border border-white/15 text-text-muted hover:text-white hover:border-white/25 disabled:opacity-40"
                    >
                      {busy === `confirm:${item.name}` ? "…" : "Confirm library file"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {inv.length === 0 && (
          <p className="text-[11px] text-text-muted py-2">
            No logo/face required for this story — you can generate the image.
          </p>
        )}
      </div>

      {ready.length > 0 && data.needs_materials && (
        <p className="text-[9px] font-mono text-text-muted">
          {ready.length} verified · {pending.length} still need admin action
        </p>
      )}

      <button
        type="button"
        disabled={!!busy || data.needs_materials}
        onClick={reRender}
        className={`w-full px-3 py-2.5 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-40 ${
          data.needs_materials
            ? "bg-white/[0.04] text-text-muted border-white/10"
            : "bg-gold-primary text-black border-gold-primary/40 hover:bg-gold-light shadow-[0_0_18px_-6px_rgba(212,168,83,0.6)]"
        }`}
        title={data.needs_materials ? "Upload / confirm all materials first" : undefined}
      >
        {busy === "__render__"
          ? "Generating cinematic poster…"
          : data.needs_materials
            ? "Upload assets to unlock AI image"
            : "Generate image with verified assets"}
      </button>
      <p className="text-[9px] font-mono text-text-muted/80 text-center leading-relaxed">
        {data.needs_materials
          ? "Image AI is paused until uploads are complete — saves cost & keeps marks accurate."
          : "Assets verified · one AI call · brand integrated into the scene."}
      </p>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </div>
  );
};

// ── Instagram-style detail modal ────────────────────────────────
const PostModal = ({ post, onClose, onStatus, onDelete, onPostUpdated, busy }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!post) return null;
  const isXai = (post.image_mode || "").startsWith("ai_");

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-4 sm:top-4 sm:right-6 text-white/80 hover:text-white text-2xl leading-none z-10"
        aria-label="Close"
      >
        ✕
      </button>

      <div
        className="flex flex-col md:flex-row w-full max-w-[880px] max-h-[90vh] rounded-xl overflow-hidden bg-[#0c0a10] border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left — post image (contained, never overflows) */}
        <div className="md:w-[55%] flex-shrink-0 bg-black flex items-center justify-center min-h-0 max-h-[42vh] md:max-h-none overflow-hidden">
          {post.image_url ? (
            <img
              src={post.image_url}
              alt=""
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          ) : (
            <div className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-amber-300/90">
                {awaitingImage(post) ? "Image paused" : "No image"}
              </p>
              <p className="text-[12px] text-text-muted leading-snug">
                {awaitingImage(post)
                  ? "Upload logos/faces below, then generate the cinematic poster once."
                  : "No image on this draft yet."}
              </p>
            </div>
          )}
        </div>

        {/* Right — IG-style caption column (flexes to remaining width) */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#0c0a10] border-t md:border-t-0 md:border-l border-white/10 min-h-0">
          {/* account header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08]">
            <img src={IG_AVATAR} alt="" className="w-8 h-8 rounded-full object-contain bg-white/5 p-1 flex-shrink-0" />
            <div className="flex items-center gap-1 min-w-0 mr-auto">
              <span className="text-white text-[13px] font-semibold truncate">{IG_HANDLE}</span>
              <VerifiedTick />
            </div>
            <StatusBadge status={post.status} />
          </div>

          {/* caption body (scrolls) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-3">
            <div className="text-[13px] leading-relaxed text-text-secondary/90 whitespace-pre-line break-words">
              <span className="text-white font-semibold mr-1.5">{IG_HANDLE}</span>
              {post.caption}
            </div>

            {post.image_prompt && (
              <div>
                <button
                  onClick={() => setShowPrompt((v) => !v)}
                  className="text-[10px] font-mono text-text-muted hover:text-white transition-colors"
                >
                  {showPrompt ? "▾ hide image prompt" : "▸ image prompt"}
                </button>
                {showPrompt && (
                  <p className="mt-1 text-[11px] text-text-muted leading-relaxed bg-black/30 rounded p-2 border border-white/5">
                    {post.image_prompt}
                  </p>
                )}
              </div>
            )}

            {Array.isArray(post.sources_json) &&
              post.sources_json.filter((s) => s && s.url && s.type === "reference").length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">Verify · references</p>
                  {post.sources_json
                    .filter((s) => s && s.url && s.type === "reference")
                    .map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[11px] text-blue-400/90 hover:text-blue-300 truncate"
                      >
                        {i + 1}. {s.date ? <span className="text-text-muted/70">[{s.date}] </span> : null}{s.label || s.url}
                      </a>
                    ))}
                </div>
              )}

            <div className="text-[10px] font-mono text-text-muted/80 pt-1">
              #{post.id} · {post.source_domain || "—"} · score {Math.round(post.score || 0)} · {isXai ? "xAI" : (post.image_mode || "img")}
            </div>

            {post.gen_meta && post.gen_meta.total_usd != null && (
              <div className="text-[10px] font-mono text-text-muted/80">
                cost ≈ {money(post.gen_meta.total_usd)} · {((post.gen_meta.prompt_tokens || 0) + (post.gen_meta.completion_tokens || 0)).toLocaleString()} tok · {post.gen_meta.image_count || 0} img{post.gen_meta.search_count ? ` · ${post.gen_meta.search_count} search` : ""}
              </div>
            )}

            {/* AI asks for missing logos / faces — admin upload + re-render */}
            <MaterialsPanel
              postId={post.id}
              onUpdated={(p) => {
                if (onPostUpdated) onPostUpdated(p);
              }}
            />
          </div>

          {/* actions */}
          <div className="px-4 py-3 border-t border-white/[0.08] flex items-center gap-3">
            <button
              disabled={busy}
              onClick={() => onDelete(post.id)}
              className="text-[11px] font-mono text-red-400/70 hover:text-red-400 disabled:opacity-40 transition-colors"
            >
              Delete
            </button>
            {post.source_url && (
              <a
                href={post.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-text-muted hover:text-gold-primary transition-colors"
              >
                source ↗
              </a>
            )}
            <div className="ml-auto flex items-center gap-2">
              {post.status !== "approved" && (
                <button
                  disabled={busy || needsMaterials(post)}
                  title={needsMaterials(post) ? "Upload missing materials first" : undefined}
                  onClick={() => onStatus(post.id, "approved")}
                  className="px-4 py-1.5 rounded text-[12px] font-medium bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 disabled:opacity-40 transition-colors"
                >
                  Approve
                </button>
              )}
              {post.status !== "rejected" && (
                <button
                  disabled={busy}
                  onClick={() => onStatus(post.id, "rejected")}
                  className="px-4 py-1.5 rounded text-[12px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-40 transition-colors"
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SocialPostsAdminPage = () => {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [newsId, setNewsId] = useState("");
  const [platform, setPlatform] = useState("x");
  const [selected, setSelected] = useState(null);
  const [cost, setCost] = useState(null);
  const [genJob, setGenJob] = useState(null);
  const prevJobStatus = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 60 };
      if (status) params.status = status;
      const res = await api.get("/api/v1/admin/social-posts", { params });
      setPosts(Array.isArray(res.data) ? res.data : []);
      try {
        const c = await api.get("/api/v1/admin/social-posts/cost-summary");
        setCost(c.data);
      } catch {
        /* cost summary is best-effort */
      }
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load social posts");
    } finally {
      setLoading(false);
    }
  }, [status]);

  const pollGenerationStatus = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/admin/social-posts/generation-status");
      const job = res.data?.job || null;
      setGenJob(job);
      return job;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Resume progress after refresh + keep polling while job is running
  useEffect(() => {
    let cancelled = false;
    let timer;

    const tick = async () => {
      if (cancelled) return;
      const job = await pollGenerationStatus();
      if (cancelled) return;

      const st = job?.status || "idle";
      const prev = prevJobStatus.current;
      // When a run finishes, refresh the draft grid + cost bar
      if (prev === "running" && (st === "done" || st === "error")) {
        load();
      }
      prevJobStatus.current = st;

      const keepPolling = st === "running";
      timer = setTimeout(tick, keepPolling ? 2000 : 8000);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollGenerationStatus, load]);

  const handleStatus = async (id, next) => {
    setBusyId(id);
    try {
      await api.patch(`/api/v1/admin/social-posts/${id}/status`, { status: next });
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: next } : p)));
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status: next } : prev));
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this draft permanently?")) return;
    setBusyId(id);
    try {
      await api.delete(`/api/v1/admin/social-posts/${id}`);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setSelected(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to delete draft");
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerate = async () => {
    if (genJob?.status === "running" || starting) return;
    setStarting(true);
    setError(null);
    try {
      const body = { limit: 1, platform: platform || "x" };
      if (newsId.trim()) body.news_id = Number(newsId.trim());
      const res = await api.post("/api/v1/admin/social-posts/generate-draft", body);
      setNewsId("");
      if (res.data?.job) {
        setGenJob(res.data.job);
        prevJobStatus.current = "running";
      } else {
        await pollGenerationStatus();
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail?.job) {
        setGenJob(detail.job);
        setError("A generation job is already running — showing live progress.");
      } else {
        const msg =
          (typeof detail === "object" && detail?.message) ||
          (typeof detail === "string" ? detail : null) ||
          "Failed to start generation";
        setError(msg);
      }
    } finally {
      setStarting(false);
    }
  };

  const isGenRunning = genJob?.status === "running";

  return (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-white text-xl font-semibold tracking-tight">Social Posts</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            AI-generated drafts — click a card for the Instagram-style preview.
          </p>
        </div>
        {isGenRunning && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-primary/10 border border-gold-primary/30 text-gold-primary text-[11px] font-mono">
            <Spinner className="w-3 h-3" />
            Generation in progress
            {typeof genJob?.progress === "number" ? ` · ${genJob.progress}%` : ""}
          </div>
        )}
      </div>

      <GenerationConsole
        job={genJob}
        newsId={newsId}
        setNewsId={setNewsId}
        platform={platform}
        setPlatform={setPlatform}
        onGenerate={handleGenerate}
        starting={starting}
      />

      <CostBar cost={cost} />

      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => setStatus(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${
              status === tab.key
                ? "bg-white/[0.08] text-white border-white/15"
                : "bg-transparent text-text-muted border-transparent hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12px] text-text-muted hover:text-white border border-white/[0.08] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[12px]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-[13px] py-16 text-center">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="text-text-muted text-[13px] py-16 text-center">
          No posts yet. Use Generate draft above to create one.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {posts.map((post) => (
            <ImageCard key={post.id} post={post} onOpen={setSelected} />
          ))}
        </div>
      )}

      <PostModal
        post={selected}
        onClose={() => setSelected(null)}
        onStatus={handleStatus}
        onDelete={handleDelete}
        busy={busyId === selected?.id}
        onPostUpdated={(p) => {
          const busted = p.image_url
            ? { ...p, image_url: `${p.image_url}${p.image_url.includes("?") ? "&" : "?"}t=${Date.now()}` }
            : p;
          setSelected((prev) => (prev && prev.id === busted.id ? { ...prev, ...busted } : prev));
          setPosts((list) => list.map((x) => (x.id === busted.id ? { ...x, ...busted } : x)));
        }}
      />
    </div>
  );
};

export default SocialPostsAdminPage;
