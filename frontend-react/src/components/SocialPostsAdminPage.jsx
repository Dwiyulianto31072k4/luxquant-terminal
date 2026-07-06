// src/components/SocialPostsAdminPage.jsx
// Admin review UI for AI-generated social post drafts.
// Lists drafts with image preview + caption, and lets an admin
// generate / approve / reject. Publishing stays a separate step.

import { useCallback, useEffect, useState } from "react";
import api from "../services/authApi";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "posted", label: "Posted" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_STYLE = {
  draft: { bg: "rgba(212,168,83,0.14)", fg: "#d4a24e", label: "DRAFT" },
  approved: { bg: "rgba(34,197,94,0.14)", fg: "#22c55e", label: "APPROVED" },
  posted: { bg: "rgba(59,130,246,0.14)", fg: "#3b82f6", label: "POSTED" },
  rejected: { bg: "rgba(239,68,68,0.14)", fg: "#ef4444", label: "REJECTED" },
  error: { bg: "rgba(239,68,68,0.14)", fg: "#ef4444", label: "ERROR" },
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

const PostCard = ({ post, onStatus, busy }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const isAiImage = post.image_mode === "ai_xai";
  return (
    <article className="rounded-lg overflow-hidden bg-black/25 border border-white/[0.08] flex flex-col lg:flex-row">
      {/* Image */}
      <div className="relative w-full lg:w-[300px] flex-shrink-0 bg-black/40 flex items-center justify-center">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt=""
            loading="lazy"
            className="w-full h-auto lg:h-full object-cover"
          />
        ) : (
          <div className="w-full aspect-[4/5] flex items-center justify-center text-text-muted text-[11px] font-mono">
            no image
          </div>
        )}
        <span className="absolute top-2 left-2 font-mono text-[9px] tracking-[0.12em] px-1.5 py-0.5 rounded bg-black/60 text-white/80">
          {isAiImage ? "xAI" : (post.image_mode || "img").toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={post.status} />
          <span className="text-text-muted text-[10px] font-mono">
            #{post.id} · {post.source_domain || "—"} · score {Math.round(post.score || 0)}
          </span>
        </div>

        <h3 className="text-white text-[15px] leading-snug font-semibold">
          {post.headline}
        </h3>

        <p className="text-text-secondary/85 text-[12.5px] leading-relaxed whitespace-pre-line max-h-52 overflow-y-auto pr-1">
          {post.caption}
        </p>

        {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((h, i) => (
              <span key={i} className="text-[10px] font-mono text-gold-primary/80">{h}</span>
            ))}
          </div>
        )}

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

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-2">
          {post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-text-muted hover:text-gold-primary transition-colors mr-auto"
            >
              source ↗
            </a>
          )}
          {post.status !== "approved" && (
            <button
              disabled={busy}
              onClick={() => onStatus(post.id, "approved")}
              className="px-3 py-1.5 rounded text-[12px] font-medium bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 disabled:opacity-40 transition-colors"
            >
              Approve
            </button>
          )}
          {post.status !== "rejected" && (
            <button
              disabled={busy}
              onClick={() => onStatus(post.id, "rejected")}
              className="px-3 py-1.5 rounded text-[12px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-40 transition-colors"
            >
              Reject
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const SocialPostsAdminPage = () => {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [newsId, setNewsId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 50 };
      if (status) params.status = status;
      const res = await api.get("/api/v1/admin/social-posts", { params });
      setPosts(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load social posts");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatus = async (id, next) => {
    setBusyId(id);
    try {
      await api.patch(`/api/v1/admin/social-posts/${id}/status`, { status: next });
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: next } : p)));
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const body = { limit: 1 };
      if (newsId.trim()) body.news_id = Number(newsId.trim());
      await api.post("/api/v1/admin/social-posts/generate-draft", body);
      setNewsId("");
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-white text-xl font-semibold">Social Posts</h1>
          <p className="text-text-muted text-[12px]">AI-generated drafts — review, approve, reject.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newsId}
            onChange={(e) => setNewsId(e.target.value)}
            placeholder="news id (optional)"
            className="w-36 px-3 py-2 rounded-lg bg-black/25 border border-white/[0.08] text-white text-[12px] placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40"
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-[12px] font-medium bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/25 disabled:opacity-40 transition-colors"
          >
            {generating ? "Generating…" : "Generate draft"}
          </button>
        </div>
      </div>

      {/* Status filter */}
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
          No posts yet. Use “Generate draft” to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              busy={busyId === post.id}
              onStatus={handleStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SocialPostsAdminPage;
