// src/components/SocialPostsAdminPage.jsx
// Admin review UI for AI-generated social post drafts.
// Grid of image-only cards; clicking one opens an Instagram-style modal
// (image left, caption right) as a mirror preview of the eventual post.

import { useCallback, useEffect, useState } from "react";
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

const STATUS_STYLE = {
  draft: { bg: "rgba(212,168,83,0.16)", fg: "#e2b45c", label: "DRAFT" },
  approved: { bg: "rgba(34,197,94,0.16)", fg: "#22c55e", label: "APPROVED" },
  posted: { bg: "rgba(59,130,246,0.16)", fg: "#3b82f6", label: "POSTED" },
  rejected: { bg: "rgba(239,68,68,0.16)", fg: "#ef4444", label: "REJECTED" },
  error: { bg: "rgba(239,68,68,0.16)", fg: "#ef4444", label: "ERROR" },
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

// ── Image-only card (default view) ──────────────────────────────
const ImageCard = ({ post, onOpen }) => (
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
      <div className="w-full aspect-[4/5] flex items-center justify-center text-text-muted text-[11px] font-mono">
        no image
      </div>
    )}
    <span className="absolute top-2 left-2">
      <StatusBadge status={post.status} />
    </span>
    <div className="absolute inset-x-0 bottom-0 p-2.5 pt-8 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
      <p className="text-white text-[12px] font-semibold leading-snug line-clamp-2">{post.headline}</p>
      <p className="text-white/50 text-[9.5px] font-mono mt-0.5">#{post.id} · {post.source_domain || "—"}</p>
    </div>
  </button>
);

// ── Instagram-style detail modal ────────────────────────────────
const PostModal = ({ post, onClose, onStatus, busy }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!post) return null;
  const isXai = post.image_mode === "ai_xai";

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
            <div className="w-full aspect-[4/5] flex items-center justify-center text-text-muted text-[12px] font-mono">
              no image
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
                        {i + 1}. {s.label || s.url}
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
          </div>

          {/* actions */}
          <div className="px-4 py-3 border-t border-white/[0.08] flex items-center gap-2">
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
  const [selected, setSelected] = useState(null);
  const [cost, setCost] = useState(null);

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

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-white text-xl font-semibold">Social Posts</h1>
          <p className="text-text-muted text-[12px]">AI-generated drafts — click a card for the Instagram-style preview.</p>
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
          No posts yet. Use “Generate draft” to create one.
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
        busy={busyId === selected?.id}
      />
    </div>
  );
};

export default SocialPostsAdminPage;
