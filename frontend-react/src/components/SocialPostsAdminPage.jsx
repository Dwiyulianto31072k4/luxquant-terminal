// src/components/SocialPostsAdminPage.jsx
// Admin review UI for AI-generated social post drafts.
// Grid of image-only cards; clicking one opens an Instagram-style modal
// (image left, caption right) as a mirror preview of the eventual post.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/authApi";
import { useDialog } from "../hooks/useDialog";

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
  draft: { bg: "rgb(var(--accent) / 0.16)", fg: "rgb(var(--accent-text))", label: "DRAFT" },
  approved: { bg: "rgb(var(--pos) / 0.16)", fg: "rgb(var(--pos-text))", label: "APPROVED" },
  posted: { bg: "rgb(var(--ink) / 0.08)", fg: "rgb(var(--fg-secondary))", label: "POSTED" },
  rejected: { bg: "rgb(var(--neg) / 0.16)", fg: "rgb(var(--neg-text))", label: "REJECTED" },
  error: { bg: "rgb(var(--neg) / 0.16)", fg: "rgb(var(--neg-text))", label: "ERROR" },
};

const Spinner = ({ className = "w-3.5 h-3.5" }) => (
  <span
    className={`${className} inline-block rounded-full border-2 border-ink/12 border-t-accent animate-spin`}
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
  const s = STATUS_STYLE[status] || {
    bg: "rgb(var(--ink) / 0.08)",
    fg: "rgb(var(--fg-muted))",
    label: (status || "").toUpperCase(),
  };
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
    <path
      d="M7.5 12.5l2.8 2.8 6.2-6.6"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const money = (n) => {
  const v = Number(n || 0);
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
};

// ── Cost dashboard (actual when API usage / billing schedule tracked) ─
const CostBar = ({ cost }) => {
  if (!cost) return null;
  const a = cost.all_time || {};
  const t = cost.today || {};
  const tokens = (a.prompt_tokens || 0) + (a.completion_tokens || 0);
  const tracking = a.tracking || t.tracking || "mixed";
  const trackLabel =
    tracking === "actual" ? "metered" : tracking === "mixed" ? "mixed" : "estimate";
  const cards = [
    {
      label: "Total cost",
      value: money(a.total_usd),
      sub: `${a.posts || 0} drafts · ${trackLabel}`,
    },
    { label: "Today", value: money(t.total_usd), sub: `${t.posts || 0} drafts` },
    { label: "Avg / draft", value: money(a.avg_usd), sub: trackLabel },
    { label: "Text", value: money(a.chat_usd), sub: `${tokens.toLocaleString()} tok · API` },
    { label: "Image", value: money(a.image_usd), sub: `${a.images || 0} imgs` },
    { label: "Search", value: money(a.search_usd), sub: `${a.searches || 0} · unit rate` },
  ];
  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
          Generation spend
        </p>
        <span
          className={`text-[9px] font-mono uppercase tracking-wide px-2 py-0.5 rounded border ${
            tracking === "actual"
              ? "bg-positive/10 text-positive border-positive/25"
              : "bg-ink/[0.04] text-text-muted border-ink/10"
          }`}
          title={cost.note || ""}
        >
          {tracking === "actual"
            ? "Actual (API usage + billing schedule)"
            : tracking === "mixed"
              ? "Mixed actual / schedule"
              : "Estimated"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {cards.map((c, i) => (
          <div key={i} className="rounded-lg bg-ink/[0.03] border border-ink/[0.08] px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-muted">
              {c.label}
            </p>
            <p className="text-text-primary text-[16px] font-semibold mt-0.5">{c.value}</p>
            {c.sub && <p className="text-[10px] text-text-muted/70 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>
      {cost.note && (
        <p className="text-[9px] text-text-muted/70 font-mono leading-relaxed">{cost.note}</p>
      )}
    </div>
  );
};

// The detailed inventory is the truth; the flat flag is a legacy summary that
// was set for every paused draft, which is every draft now. Prefer the
// inventory when it is present, so Approve is gated on something real.
const needsMaterials = (post) => {
  const vm = post?.gen_meta?.visual_materials;
  if (vm && typeof vm.needs_materials !== "undefined") return Boolean(vm.needs_materials);
  return Boolean(post?.gen_meta?.needs_materials);
};

const awaitingImage = (post) =>
  Boolean(
    post?.image_mode === "awaiting_materials" ||
    post?.gen_meta?.awaiting_image ||
    (needsMaterials(post) && !post?.image_url)
  );

// Every label is what the cost tracker actually records for that click, checked
// against it — including the prompt's own input tokens, which is why the mini
// tier reads 0.015 and not the 0.013 its output tokens alone would suggest.
// xAI bills flat per image; OpenAI bills by tokens, so quality moves the price
// more than the model does.
// The default is the one that wins the blind-vote arena, not the one that is
// cheapest: GPT Image 2 (high) is #1 on Artificial Analysis' text-to-image Elo
// board (1338), ahead of Reve 2.1 and both Nano Banana 2 models. The cheaper
// rungs stay as alternates — grok-imagine-image-quality is #12 (1203) and
// gpt-image-1-mini is #78 (1090), which is the difference you are paying for.
const AI_IMAGE_BEST = {
  key: "best",
  label: "GPT Image 2 · high",
  price: "$0.19",
  provider: "openai",
  model: "gpt-image-2",
  quality: "high",
};
const AI_IMAGE_TIERS = [
  { key: "cheap", label: "Mini", price: "$0.015", provider: "openai", model: "gpt-image-1-mini", quality: "medium" },
  { key: "grok", label: "Grok", price: "$0.02", provider: "xai", model: "grok-imagine-image" },
  { key: "std", label: "Standar", price: "$0.05", provider: "openai", model: "gpt-image-2", quality: "medium" },
];

// ── News picker modal: browse the crypto-news feed and click a story ──
const _timeAgo = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).replace(" ", "T"));
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

// One page per request. The picker used to ask for 48 stories and stop there,
// so anything older than roughly a day was unreachable even though it was still
// on the news page. The feed endpoint already paginates and returns `total`;
// this walks it instead of taking the first slice.
const NEWS_PAGE_SIZE = 24;

const NewsPickerModal = ({ onClose, onPick, currentId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const bodyRef = useRef(null);
  const reqRef = useRef(0);

  // `search` is passed in rather than read from state: a fresh search must load
  // page 0 in the same tick it resets the page, or the request would carry the
  // previous page's offset and land the reader somewhere in the middle.
  const load = useCallback(async (search, pageIndex) => {
    // Only the newest request may write state. Two quick clicks on Next fire two
    // requests, and if the first one answers last you end up looking at the
    // previous page while the pager says you moved on.
    const ticket = ++reqRef.current;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get("/api/v1/crypto-news-feed/feed", {
        params: {
          limit: NEWS_PAGE_SIZE,
          offset: pageIndex * NEWS_PAGE_SIZE,
          ...(search ? { search } : {}),
        },
      });
      if (ticket !== reqRef.current) return;
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setTotal(Number(res.data?.total) || 0);
    } catch {
      if (ticket === reqRef.current) setErr("Failed to load news feed");
    } finally {
      if (ticket === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("", 0);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));
  const go = useCallback(
    (next) => {
      const target = Math.min(Math.max(0, next), pages - 1);
      if (target === page) return;
      setPage(target);
      load(q.trim(), target);
      // Back to the top: landing mid-grid on a new page loses your place.
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    },
    [load, page, pages, q]
  );

  const search = useCallback(
    (term) => {
      setPage(0);
      load(term, 0);
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    },
    [load]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      // Arrows page through, but not while the reader is typing a search.
      if (e.target?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go, page]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-2xl border border-ink/15 overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(160deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink/10">
          <div className="min-w-0">
            <h3 className="text-text-primary text-[15px] font-semibold tracking-tight">Choose news</h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Click a story to turn it into a post
              {total > 0 && (
                <span className="tabular-nums"> · {total.toLocaleString()} in the feed</span>
              )}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(q.trim());
            }}
            className="ml-auto flex items-center rounded-lg border border-ink/[0.1] bg-ink/[0.04] overflow-hidden"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search headlines…"
              className="w-36 sm:w-52 px-3 py-2 bg-transparent text-text-primary text-[12px] placeholder:text-text-muted/50 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  search("");
                }}
                className="px-2 text-text-muted hover:text-text-primary text-[13px]"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            {/* A real submit button: a form whose only control is a text field
                does not reliably submit on Enter, and there was nothing to click
                either — the search silently did nothing. */}
            <button
              type="submit"
              className="px-2.5 self-stretch text-text-muted hover:text-accent transition-colors"
              aria-label="Search headlines"
              title="Search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4.5-4.5" strokeLinecap="round" />
              </svg>
            </button>
          </form>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-ink/[0.06] transition-colors shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div ref={bodyRef} className="overflow-y-auto p-4 flex-1">
          {loading && items.length === 0 ? (
            <div className="py-16 text-center text-text-muted text-[13px]">Loading news…</div>
          ) : err ? (
            <div className="py-16 text-center text-loss text-[13px]">{err}</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-text-muted text-[13px]">No stories found.</div>
          ) : (
            <div
              className={`grid grid-cols-2 sm:grid-cols-3 gap-3 transition-opacity ${
                loading ? "opacity-40" : "opacity-100"
              }`}
            >
              {items.map((it) => {
                const selected = String(it.id) === String(currentId);
                return (
                  <button
                    key={it.id}
                    onClick={() => onPick(it)}
                    className={`group text-left rounded-xl overflow-hidden border transition-all ${
                      selected
                        ? "border-accent ring-2 ring-accent/40"
                        : "border-ink/10 hover:border-accent/50 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="relative aspect-[16/10] bg-ink/10 overflow-hidden">
                      {it.image_url ? (
                        <img
                          src={it.image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                      <span className="absolute top-2 left-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/55 text-white/85">
                        #{it.id}
                      </span>
                      {it.content_type && it.content_type !== "article" && (
                        <span className="absolute top-2 right-2 text-[8px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/80 text-accent-fg">
                          {it.content_type}
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-2.5">
                        <p
                          className="text-white text-[12px] font-semibold leading-tight"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {it.title}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-ink/[0.03]">
                      <span className="text-[10px] text-text-muted truncate">{it.domain || "news"}</span>
                      <span className="ml-auto text-[10px] text-text-muted/70 shrink-0">
                        {_timeAgo(it.created_at) && `${_timeAgo(it.created_at)} ago`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* pager — the whole feed is reachable, one page at a time */}
        {total > NEWS_PAGE_SIZE && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-ink/10 bg-ink/[0.03]">
            <span className="text-[11px] text-text-muted tabular-nums">
              {page * NEWS_PAGE_SIZE + 1}–{Math.min((page + 1) * NEWS_PAGE_SIZE, total)} of{" "}
              {total.toLocaleString()}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => go(0)}
                disabled={page === 0 || loading}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-ink/[0.1] text-text-muted hover:text-text-primary hover:border-accent/45 disabled:opacity-35 disabled:hover:border-ink/[0.1] transition-colors"
                title="Newest"
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => go(page - 1)}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-ink/[0.1] bg-ink/[0.04] text-text-primary hover:border-accent/45 hover:bg-accent/[0.05] disabled:opacity-35 disabled:hover:border-ink/[0.1] disabled:hover:bg-ink/[0.04] transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[11px] text-text-muted tabular-nums px-1">
                {page + 1} / {pages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => go(page + 1)}
                disabled={page >= pages - 1 || loading}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-ink/[0.1] bg-ink/[0.04] text-text-primary hover:border-accent/45 hover:bg-accent/[0.05] disabled:opacity-35 disabled:hover:border-ink/[0.1] disabled:hover:bg-ink/[0.04] transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ── Spend by what you picked ───────────────────────────────────────
// The CostBar above already carries the totals. What it cannot answer is the
// question the price buttons create: where did the money actually go, and on
// which model? Read from each draft's recorded cost — nothing estimated here.
const ModelSpendBreakdown = () => {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/v1/admin/social-posts/cost-summary", { params: { days } })
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [days]);

  if (!data) return null;
  const usd = (n) => `$${Number(n || 0).toFixed(Number(n) >= 1 ? 2 : 4)}`;
  const peak = Math.max(1, ...(data.daily || []).map((d) => d.usd));

  return (
    <div className="mb-5 rounded-xl border border-ink/[0.08] bg-ink/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-ink/[0.03] transition-colors"
      >
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
          Rincian per model · {data.days}h
        </span>
        <span className="text-[13px] font-semibold text-text-primary tabular-nums">
          {usd(data.total_usd)}
        </span>
        <span className="text-[11px] text-text-muted tabular-nums truncate">
          {data.drafts} draft · {usd(data.avg_per_draft)}/draft · {data.paid_images} gambar berbayar
        </span>
        <span className="ml-auto text-[11px] font-mono text-text-muted shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-ink/[0.07]">
          <div className="flex items-center gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  days === d
                    ? "border-accent/45 bg-accent/10 text-accent"
                    : "border-ink/[0.1] text-text-muted hover:text-text-primary"
                }`}
              >
                {d}h
              </button>
            ))}
            <span className="ml-auto text-[10px] font-mono text-text-muted">
              gambar {usd(data.image_usd)} · teks {usd(data.chat_usd)} · search {usd(data.search_usd)}
            </span>
          </div>

          {(data.by_model || []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-ink/[0.07]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-text-muted text-[10px] uppercase tracking-wide">
                    <th className="text-left font-medium px-3 py-1.5">Model dipilih</th>
                    <th className="text-left font-medium px-3 py-1.5">Kualitas</th>
                    <th className="text-right font-medium px-3 py-1.5">Dipakai</th>
                    <th className="text-right font-medium px-3 py-1.5">Rata-rata</th>
                    <th className="text-right font-medium px-3 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_model.map((m) => (
                    <tr key={`${m.model}-${m.quality}`} className="border-t border-ink/[0.06]">
                      <td className="px-3 py-1.5 text-text-primary font-medium">{m.model}</td>
                      <td className="px-3 py-1.5 text-text-muted font-mono text-[11px]">{m.quality}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-muted">{m.count}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-muted">
                        {m.avg_usd ? usd(m.avg_usd) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-primary font-medium">
                        {usd(m.usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(data.daily || []).length > 1 && (
            <div>
              <p className="text-[10px] text-text-muted mb-1.5">Per hari</p>
              <div className="flex items-end gap-[3px] h-10">
                {data.daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day} · ${usd(d.usd)} · ${d.count} draft`}
                    className="flex-1 bg-accent/35 hover:bg-accent/60 rounded-sm transition-colors"
                    style={{ height: `${Math.max(6, (d.usd / peak) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedItem, setPickedItem] = useState(null);
  const pickedTitle =
    pickedItem && String(pickedItem.id) === String(newsId) ? pickedItem.title : "";

  // Live elapsed timer while running
  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);
  void tick;

  const borderTone = isError
    ? "border-negative/35"
    : isRunning
      ? "border-ink/35"
      : isDone
        ? "border-positive/30"
        : "border-ink/[0.08]";

  const glow = isRunning ? "shadow-[0_0_40px_-12px_rgb(var(--accent) / 0.45)]" : "";

  return (
    <>
    <div
      className={`relative mb-5 rounded-xl border ${borderTone} ${glow} overflow-hidden`}
      style={{
        background: "linear-gradient(145deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 100%)",
      }}
    >
      {/* subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--ink) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--ink) / 0.5) 1px, transparent 1px)",
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
                  ? "bg-accent/12 border-ink/15"
                  : isError
                    ? "bg-negative/15 border-negative/40"
                    : isDone
                      ? "bg-positive/15 border-positive/40"
                      : "bg-ink/[0.04] border-ink/10"
              }`}
            >
              {isRunning ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-text-primary text-[15px] font-semibold tracking-tight">
                  Generate Console
                </h2>
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-accent/12 text-accent border border-ink/12">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Live
                  </span>
                )}
                {isDone && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-positive/15 text-positive border border-positive/30">
                    Complete
                  </span>
                )}
                {isError && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-[0.14em] bg-negative/15 text-loss border border-negative/30">
                    Failed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                AI draft pipeline — progress is saved server-side, so refresh won&apos;t lose the
                run.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* News picker — click to browse the feed instead of pasting an ID */}
            {newsId ? (
              <div className="flex items-center gap-2 rounded-lg border border-accent/35 bg-accent/[0.07] pl-2 pr-1 py-1 max-w-[300px]">
                {pickedItem?.image_url && String(pickedItem.id) === String(newsId) ? (
                  <img
                    src={pickedItem.image_url}
                    alt=""
                    className="w-7 h-7 rounded object-cover shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="w-7 h-7 rounded bg-accent/15 text-accent flex items-center justify-center text-[11px] font-mono shrink-0">
                    #
                  </span>
                )}
                <span className="text-[11.5px] text-text-primary truncate min-w-0">
                  {pickedTitle || `News #${newsId}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewsId("");
                    setPickedItem(null);
                  }}
                  disabled={isRunning || starting}
                  className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-ink/10 shrink-0 disabled:opacity-50"
                  aria-label="Clear selected news"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={isRunning || starting}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ink/[0.1] bg-ink/[0.04] text-[12px] text-text-primary hover:border-accent/45 hover:bg-accent/[0.05] transition-colors disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 8h6M7 12h10M7 16h10" strokeLinecap="round" />
                </svg>
                Choose news
                <span className="text-text-muted text-[11px]">or auto</span>
              </button>
            )}

            <button
              onClick={onGenerate}
              disabled={isRunning || starting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-accent/15 text-accent hover:bg-accent hover:text-accent-fg disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_-6px_rgb(var(--accent) / 0.7)]"
            >
              {(isRunning || starting) && (
                <Spinner className="w-3 h-3 border-accent/30 border-t-accent" />
              )}
              {isRunning || starting ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </div>

        {/* Active / recent job panel */}
        {(isRunning || isDone || isError || job) && (
          <div className="rounded-lg border border-ink/[0.07] bg-ink/[0.04] p-3.5 sm:p-4 space-y-3.5">
            {/* Progress bar + meta */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[12px] text-text-primary font-medium truncate">
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
                      isError ? "text-loss" : isDone ? "text-positive" : "text-accent"
                    }`}
                  >
                    {isError ? "!" : `${progress}%`}
                  </p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-text-muted mt-1">
                    {job?.step_label || job?.step || "idle"}
                  </p>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    isError
                      ? "bg-negative"
                      : isDone
                        ? "bg-positive"
                        : "bg-gradient-to-r from-accent via-accent to-accent"
                  }`}
                  style={{
                    width: `${isError ? 100 : progress}%`,
                    boxShadow: isRunning ? "0 0 12px rgb(var(--accent) / 0.55)" : undefined,
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
                        ? "bg-negative/10 border-negative/30 text-loss"
                        : active
                          ? "bg-accent/12 border-ink/35 text-accent"
                          : done
                            ? "bg-positive/8 border-positive/20 text-positive/90"
                            : "bg-ink/[0.02] border-ink/[0.06] text-text-muted/70"
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold ${
                        failed
                          ? "bg-negative text-text-primary"
                          : active
                            ? "bg-accent text-accent-fg"
                            : done
                              ? "bg-positive text-text-primary"
                              : "bg-ink/10 text-text-muted"
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
              <div className="rounded-md bg-negative/10 border border-negative/25 px-3 py-2 text-[11px] text-loss">
                {job.error}
              </div>
            )}

            {isDone && Array.isArray(job?.result) && job.result.length > 0 && (
              <div className="rounded-md bg-positive/10 border border-positive/25 px-3 py-2 text-[11px] text-positive/95">
                Draft ready
                {job.result[0]?.id ? ` · post #${job.result[0].id}` : ""}
                {job.result[0]?.headline ? ` — ${job.result[0].headline}` : ""}
              </div>
            )}

            {isRunning && (
              <p className="text-[10px] text-text-muted/80 font-mono">
                Safe to refresh or leave this page — the job keeps running and this console will
                resume.
              </p>
            )}
          </div>
        )}

        {!job && !isRunning && (
          <div className="rounded-lg border border-dashed border-ink/[0.08] bg-ink/[0.03] px-3.5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {[
              "Pick news",
              "Extract & enrich",
              "AI caption",
              "Logos & faces",
              "AI image",
              "Save draft",
            ].map((label, i) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono text-text-muted/80"
              >
                <span className="w-4 h-4 rounded-full bg-ink/[0.05] border border-ink/10 flex items-center justify-center text-[8px] text-text-muted">
                  {i + 1}
                </span>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    {pickerOpen && (
      <NewsPickerModal
        currentId={newsId}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => {
          setNewsId(String(item.id));
          setPickedItem(item);
          setPickerOpen(false);
        }}
      />
    )}
    </>
  );
};

// ── Image-only card (default view) ──────────────────────────────
const ImageCard = ({ post, onOpen }) => {
  const waiting = awaitingImage(post);
  return (
    <button
      onClick={() => onOpen(post)}
      className="group relative rounded-lg overflow-hidden bg-ink/[0.04] border border-ink/[0.08] hover:border-ink/15 transition-colors text-left"
    >
      {post.image_url ? (
        <img
          src={post.image_url}
          alt=""
          loading="lazy"
          className="w-full aspect-[4/5] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-2 px-3 text-center bg-gradient-to-b from-ink/[0.05] to-ink/[0.10]">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-accent/90">
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
          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[9px] tracking-wide bg-accent/20 text-accent border border-accent/30">
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
  const [showManual, setShowManual] = useState(true);
  const [brief, setBrief] = useState(null);
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get(`/api/v1/admin/social-posts/${postId}/materials`);
      setData(res.data);
      return res.data;
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load materials");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const reRender = async (opt) => {
    setBusy("__render__");
    setErr(null);
    setStage({ at: Date.now(), text: `Mengirim ke ${opt?.provider === "xai" ? "Grok" : "OpenAI"}…` });
    const startedAt = Date.now();
    // 5 min. High quality renders 6,240 output tokens against medium's 1,584 —
    // about 4x the work — so the old 3.5 min ceiling could give up while the
    // image was still coming, on a call that had already been paid for.
    const MAX_MS = 300000;

    // The paid AI image edit can take 1–3 min, which blows past Cloudflare's ~100s
    // edge timeout (524). The backend keeps working and finishes anyway, so we don't
    // surface that error — we poll the post until the fresh image lands, then refresh.
    const direct = api
      .post(`/api/v1/admin/social-posts/${postId}/re-render`, null, { params: opt })
      .then((res) => res?.data?.post || null)
      .catch((e) => {
        // A real validation error (e.g. still-missing materials) should show; a
        // gateway timeout should not — fall through to polling for those.
        const status = e?.response?.status;
        const d = e?.response?.data?.detail;
        if (status && status !== 502 && status !== 503 && status !== 504 && status !== 524) {
          const msg =
            (typeof d === "object" && d?.message) || (typeof d === "string" ? d : null);
          if (msg) throw new Error(msg);
        }
        return null;
      });

    const findPost = async () => {
      try {
        const res = await api.get("/api/v1/admin/social-posts", { params: { limit: 80 } });
        const list = Array.isArray(res.data) ? res.data : [];
        return list.find((p) => String(p.id) === String(postId)) || null;
      } catch {
        return null;
      }
    };
    const isReady = (p) => Boolean(p && p.image_url && !awaitingImage(p));

    try {
      // Recompose (free) returns in ~2s; the AI path won't beat the 10s race → poll.
      let post = await Promise.race([
        direct,
        new Promise((r) => setTimeout(() => r(null), 10000)),
      ]);
      while (!isReady(post) && Date.now() - startedAt < MAX_MS) {
        await new Promise((r) => setTimeout(r, 4000));
        // The stage text is honest about what we can actually observe: we know
        // it was sent and we know it has not come back yet.
        setStage({
          at: startedAt,
          text: "Model sedang merender — poster belum kembali",
        });
        const p = await findPost();
        if (isReady(p)) {
          post = p;
          break;
        }
      }
      const fresh = await load();
      if (isReady(post)) {
        if (onUpdated) onUpdated(post);
      } else {
        // The backend writes the real reason onto the draft, because the
        // response itself often never survives the edge timeout.
        const logged = fresh?.last_image_error || (await load())?.last_image_error;
        setErr(
          logged
            ? `Gagal: ${logged}`
            : "Gambar masih diproses — kualitas tinggi bisa sampai ~4 menit. Klik Refresh sebentar lagi."
        );
      }
    } catch (e) {
      setErr(e?.message || "Re-render failed");
    } finally {
      setBusy(null);
      setStage(null);
    }
  };

  // A minute of silence looks like a hang. A counter that moves says otherwise.
  useEffect(() => {
    if (!stage?.at) return undefined;
    setElapsed(Math.round((Date.now() - stage.at) / 1000));
    const t = setInterval(() => setElapsed(Math.round((Date.now() - stage.at) / 1000)), 1000);
    return () => clearInterval(t);
  }, [stage?.at]);

  const loadBrief = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/admin/social-posts/${postId}/manual-brief`);
      setBrief(res.data);
      return res.data;
    } catch {
      setErr("Couldn't build the manual brief");
      return null;
    }
  }, [postId]);

  // The prompt is the whole point of this panel now — fetch it with the panel
  // rather than waiting for a click nobody has a reason to make. Declared after
  // loadBrief on purpose: the dependency array is read during render, so a
  // const declared below would be in its temporal dead zone.
  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

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

  const openManual = async () => {
    setShowManual((v) => !v);
    if (!brief) await loadBrief();
  };

  const copyPrompt = async () => {
    const b = brief || (await loadBrief());
    if (!b?.prompt) return;
    try {
      await navigator.clipboard.writeText(b.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Clipboard blocked — select the prompt text and copy manually.");
    }
  };

  const uploadManualImage = async (file) => {
    if (!file) return;
    setBusy("__manual__");
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/api/v1/admin/social-posts/${postId}/manual-image`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
      if (onUpdated && res.data?.post) onUpdated(res.data.post);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 413) {
        setErr("Image too large for the server — export a smaller file (under ~20MB) and try again.");
      } else {
        setErr(e?.response?.data?.detail || "Upload failed — must be an image file under 20MB.");
      }
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

  const statusStyle = (st) => {
    if (st === "resolved") return "bg-positive/15 text-positive border-positive/25";
    if (st === "needs_upload") return "bg-accent/15 text-accent border-accent/30";
    return "bg-negative/10 text-loss border-negative/25";
  };

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-b from-accent/[0.07] to-scrim/40 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-accent">
            Make the image · your Gemini
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
            Copy the prompt, generate it in Gemini, upload the result — we compose the
            headline and lockup for free. Any real logo or face below should be attached
            in Gemini so the mark stays accurate.
          </p>
        </div>
        {data.needs_materials ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wide bg-accent/20 text-accent border border-accent/35">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {data.missing_count} required
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wide bg-positive/15 text-positive border border-positive/30">
            Verified
          </span>
        )}
      </div>

      {(primaryName || (data.story_orgs || []).length > 0) && (
        <p className="text-[10px] font-mono text-text-muted leading-relaxed">
          Brands required:{" "}
          <span className="text-text-primary">
            {(data.story_orgs || [])
              .map((o) => o?.name)
              .filter(Boolean)
              .join(" · ") || primaryName}
          </span>
          {data.featured_person ? (
            <>
              {" "}
              · Face: <span className="text-text-primary">{data.featured_person}</span>
            </>
          ) : null}
        </p>
      )}

      {/* Bring-your-own image (e.g. Gemini) — an alternative to uploading assets + auto-gen */}
      <div className="rounded-lg border border-accent/30 bg-accent/[0.06] overflow-hidden">
        <button
          type="button"
          onClick={openManual}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/[0.04] transition-colors"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
            </svg>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-accent leading-tight">
                Gemini prompt — carries the LuxQuant colour signature
              </span>
              <span className="block text-[10px] text-text-muted leading-tight mt-0.5">
                Copy it, generate in Gemini, upload the image back here
              </span>
            </span>
          </span>
          <span className="text-[11px] font-mono text-accent shrink-0">{showManual ? "▲" : "▼"}</span>
        </button>
        {showManual && (
          <div className="px-3 pb-3 pt-3 space-y-2.5 border-t border-accent/15">
            <button
              type="button"
              onClick={copyPrompt}
              className="w-full px-3 py-2 rounded-lg text-[12px] font-semibold border border-ink/15 bg-ink/[0.04] text-text-primary hover:bg-ink/[0.08] transition-colors"
            >
              {copied ? "✓ Prompt copied — paste into Gemini" : "Copy Gemini prompt"}
            </button>
            {brief && (brief.face || (brief.brands || []).length > 0) ? (
              <div className="text-[10.5px] text-text-muted leading-relaxed">
                <span className="font-semibold text-text-primary">Attach in Gemini for accuracy:</span>{" "}
                <span className="inline-flex flex-wrap gap-1 align-middle">
                  {brief.face && (
                    <span className="px-1.5 py-0.5 rounded bg-accent/12 text-accent border border-accent/25">
                      {brief.face} · face
                    </span>
                  )}
                  {(brief.brands || []).map((b) => (
                    <span key={b} className="px-1.5 py-0.5 rounded bg-accent/12 text-accent border border-accent/25">
                      {b} · logo
                    </span>
                  ))}
                </span>
              </div>
            ) : brief ? (
              <p className="text-[10.5px] text-text-muted">
                No specific person or brand to match — just paste the prompt.
              </p>
            ) : null}
            {brief?.story && (
              <p className="text-[10px] text-text-muted/90 leading-relaxed bg-ink/[0.04] rounded-md p-2 border border-ink/5">
                <span className="font-semibold text-text-primary">Context:</span> {brief.story}
              </p>
            )}
            {brief?.prompt && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-text-muted hover:text-text-primary select-none">
                  Preview prompt
                </summary>
                <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-ink/[0.05] border border-ink/10 p-2 text-[10px] text-text-muted font-mono leading-relaxed">
                  {brief.prompt}
                </pre>
              </details>
            )}
            <label
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold border border-dashed border-accent/40 bg-accent/[0.05] text-accent cursor-pointer hover:bg-accent/[0.1] transition-colors ${
                busy ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {busy === "__manual__" ? "Composing your poster…" : "Upload your Gemini image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!busy}
                onChange={(e) => uploadManualImage(e.target.files?.[0])}
              />
            </label>
            <p className="text-[9px] font-mono text-text-muted/70 text-center leading-relaxed">
              We add the headline, the CTA and the lockup automatically · $0
            </p>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-lg bg-accent/[0.06] border border-accent/25 px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-accent">
            Attach in Gemini for accuracy ({pending.length}):
          </p>
          {pending.map((r, i) => (
            <p key={i} className="text-[11px] text-accent/90 leading-snug">
              • <span className="font-medium">{r.name}</span>
              <span className="text-accent/60 font-mono text-[10px]"> · {r.kind}</span>
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
                needAction ? "border-accent/30 bg-accent/[0.06]" : "border-ink/[0.07] bg-ink/[0.02]"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[12px] text-text-primary font-medium truncate">
                      {item.name}
                    </p>
                    <span className="text-text-muted font-mono text-[9px] uppercase">
                      {item.kind}
                    </span>
                  </div>
                  {item.role && (
                    <p className="text-[10px] text-text-muted truncate mt-0.5">{item.role}</p>
                  )}
                  {item.request && needAction && (
                    <p className="text-[10px] text-accent/85 mt-1 leading-snug">{item.request}</p>
                  )}
                  {item.trusted && (
                    <p className="text-[9px] font-mono text-positive/80 mt-0.5">
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
                  <label className="cursor-pointer px-2.5 py-1 rounded-md text-[10px] font-semibold bg-accent/15 text-accent hover:bg-accent hover:text-accent-fg transition-colors">
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
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium border border-ink/15 text-text-muted hover:text-text-primary hover:border-ink/25 disabled:opacity-40"
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
            No logo or face to match in this story — the prompt above is all you need.
          </p>
        )}
      </div>

      {/* Gemini first — it costs nothing. This is the fallback for when it argues
          with you, priced per click so the expensive tier is never the default. */}
      <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] p-2.5 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
          or let our AI draw it — you pay per click
        </p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            reRender({
              provider: AI_IMAGE_BEST.provider,
              model: AI_IMAGE_BEST.model,
              quality: AI_IMAGE_BEST.quality,
            })
          }
          className="w-full px-3 py-2.5 rounded-lg text-[12px] font-semibold border border-ink/15 bg-accent/15 text-accent hover:bg-accent hover:text-accent-fg disabled:opacity-40 transition-colors shadow-[0_0_18px_-6px_rgb(var(--accent) / 0.6)]"
          title={`${AI_IMAGE_BEST.model} · ${AI_IMAGE_BEST.quality}`}
        >
          {busy === "__render__"
            ? "Generating…"
            : `Generate · ${AI_IMAGE_BEST.label} · ${AI_IMAGE_BEST.price}`}
        </button>
        <p className="text-[9px] font-mono text-text-muted/70 text-center">
          #1 di arena blind-vote Artificial Analysis (Elo 1338)
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {AI_IMAGE_TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!!busy}
              onClick={() =>
                reRender({ provider: t.provider, model: t.model, quality: t.quality })
              }
              className="px-2 py-2 rounded-lg border border-ink/[0.1] bg-ink/[0.04] text-text-primary hover:border-accent/45 hover:bg-accent/[0.06] disabled:opacity-40 transition-colors text-left"
              title={[t.model, t.quality].filter(Boolean).join(" · ")}
            >
              <span className="block text-[11px] font-semibold leading-tight">{t.label}</span>
              <span className="block text-[10px] font-mono text-text-muted tabular-nums mt-0.5">
                {t.price}
              </span>
            </button>
          ))}
        </div>
        {busy === "__render__" ? (
          <div className="rounded-md border border-accent/25 bg-accent/[0.05] px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="text-[11px] text-text-primary leading-snug">{stage?.text}</span>
              <span className="ml-auto text-[11px] font-mono tabular-nums text-accent">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>
            <p className="text-[9px] font-mono text-text-muted/70 leading-relaxed">
              Aman ditinggal — tidak akan menagih dua kali. Biasanya 1–4 menit di kualitas tinggi.
            </p>
          </div>
        ) : (
          <p className="text-[9px] font-mono text-text-muted/70 text-center leading-relaxed">
            Alternatif lebih murah · gratis kalau background-nya sudah ada (cuma compose ulang)
          </p>
        )}
        {!busy && data?.last_image_error && (
          <details className="rounded-md border border-negative/30 bg-negative/[0.06] px-2.5 py-2">
            <summary className="cursor-pointer text-[11px] text-loss font-medium select-none">
              Percobaan terakhir gagal — lihat log
            </summary>
            <p className="mt-1.5 text-[10px] font-mono text-loss/90 leading-relaxed break-words">
              {data.last_image_error}
            </p>
            <p className="mt-1 text-[9px] font-mono text-text-muted">
              {data.last_image_attempt} · {data.last_image_error_at}
            </p>
          </details>
        )}
      </div>

      {err && <p className="text-[11px] text-loss">{err}</p>}
    </div>
  );
};

// ── Instagram-style detail modal ────────────────────────────────
const PostModal = ({ post, onClose, onStatus, onDelete, onPostUpdated, busy }) => {
  // 0 = the poster, 1 = the caption slide. Instagram reads them in that order.
  const [slide, setSlide] = useState(0);
  // Escape / background-scroll lock / focus trap / focus restore — hooks/useDialog.
  const dialogRef = useRef(null);
  useDialog({ isOpen: !!post, onClose: onClose, ref: dialogRef });

  const [showPrompt, setShowPrompt] = useState(false);
  const [copiedCap, setCopiedCap] = useState(false);
  if (!post) return null;
  const isXai = (post.image_mode || "").startsWith("ai_");

  // Both slides, numbered — Instagram uploads a carousel in filename order.
  const downloadImage = async () => {
    const slides = [post.image_url, post.slide2_url].filter(Boolean);
    if (!slides.length) return;
    for (let i = 0; i < slides.length; i += 1) {
      const src = slides[i];
      const name = `luxquant-${post.id}-${i + 1}.png`;
      try {
        const res = await fetch(src, { credentials: "include" });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        // Browsers drop a second download fired in the same tick.
        if (i < slides.length - 1) await new Promise((r) => setTimeout(r, 400));
      } catch {
        window.open(src, "_blank", "noopener");
      }
    }
  };

  const copyCaption = async () => {
    const text = [post.caption, post.hashtags && !String(post.caption || "").includes("#") ? post.hashtags : ""]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCap(true);
      setTimeout(() => setCopiedCap(false), 2000);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100000] bg-scrim/85 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-4 sm:top-4 sm:right-6 text-text-primary/80 hover:text-text-primary text-2xl leading-none z-10"
        aria-label="Close"
      >
        ✕
      </button>

      <div
        className="relative flex flex-col md:flex-row w-full max-w-[min(1180px,95vw)] max-h-[min(92dvh,100%)] rounded-t-3xl sm:rounded-xl overflow-hidden bg-surface-raised border-t border-ink/10 sm:border shadow-[0_-20px_60px_rgb(var(--scrim) / 0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute top-2.5 left-0 right-0 z-20 flex justify-center pointer-events-none sm:hidden"
          aria-hidden="true"
        >
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        {/* Left — post image (contained, never overflows) */}
        <div className="md:w-[50%] flex-shrink-0 bg-black flex items-center justify-center min-h-0 max-h-[42vh] md:max-h-none overflow-hidden relative">
          {post.image_url ? (
            <>
              <img
                src={slide === 1 && post.slide2_url ? post.slide2_url : post.image_url}
                alt=""
                className="max-w-full max-h-full w-auto h-auto object-contain"
              />
              {post.slide2_url && (
                <>
                  <button
                    type="button"
                    onClick={() => setSlide((v) => (v === 0 ? 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/75 text-white text-[15px] leading-none flex items-center justify-center transition-colors"
                    aria-label="Slide berikutnya"
                  >
                    {slide === 0 ? "›" : "‹"}
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                    {[0, 1].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSlide(i)}
                        aria-label={`Slide ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${
                          slide === i ? "w-5 bg-white/90" : "w-1.5 bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-accent/90">
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
        <div className="flex-1 min-w-0 flex flex-col bg-surface-raised border-t md:border-t-0 md:border-l border-ink/10 min-h-0">
          {/* account header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink/[0.08]">
            <img
              src={IG_AVATAR}
              alt=""
              className="w-8 h-8 rounded-full object-contain bg-ink/5 p-1 flex-shrink-0"
            />
            <div className="flex items-center gap-1 min-w-0 mr-auto">
              <span className="text-text-primary text-[13px] font-semibold truncate">
                {IG_HANDLE}
              </span>
              <VerifiedTick />
            </div>
            <StatusBadge status={post.status} />
          </div>

          {/* caption body (scrolls) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 space-y-3">
            <div className="text-[13px] leading-relaxed text-text-secondary/90 whitespace-pre-line break-words">
              <span className="text-text-primary font-semibold mr-1.5">{IG_HANDLE}</span>
              {post.caption}
            </div>

            {post.image_prompt && (
              <div>
                <button
                  onClick={() => setShowPrompt((v) => !v)}
                  className="text-[10px] font-mono text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPrompt ? "▾ hide image prompt" : "▸ image prompt"}
                </button>
                {showPrompt && (
                  <p className="mt-1 text-[11px] text-text-muted leading-relaxed bg-ink/[0.04] rounded p-2 border border-ink/5">
                    {post.image_prompt}
                  </p>
                )}
              </div>
            )}

            {Array.isArray(post.sources_json) &&
              post.sources_json.filter((s) => s && s.url && s.type === "reference").length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
                    Verify · references
                  </p>
                  {post.sources_json
                    .filter((s) => s && s.url && s.type === "reference")
                    .map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[11px] text-accent/90 hover:text-accent truncate"
                      >
                        {i + 1}.{" "}
                        {s.date ? <span className="text-text-muted/70">[{s.date}] </span> : null}
                        {s.label || s.url}
                      </a>
                    ))}
                </div>
              )}

            <div className="text-[10px] font-mono text-text-muted/80 pt-1">
              #{post.id} · {post.source_domain || "—"} · score {Math.round(post.score || 0)} ·{" "}
              {isXai ? "xAI" : post.image_mode || "img"}
            </div>

            {post.gen_meta && post.gen_meta.total_usd != null && (
              <div className="text-[10px] font-mono text-text-muted/80">
                cost{" "}
                {post.gen_meta.cost_source === "actual" || post.gen_meta.cost_actual ? "" : "≈ "}
                {money(post.gen_meta.total_usd)}
                {post.gen_meta.cost_source ? ` · ${post.gen_meta.cost_source}` : ""}
                {" · "}
                {(
                  (post.gen_meta.prompt_tokens || 0) + (post.gen_meta.completion_tokens || 0)
                ).toLocaleString()}{" "}
                tok
                {" · "}
                {post.gen_meta.image_count || 0} img
                {post.gen_meta.image_model ? ` · ${post.gen_meta.image_model}` : ""}
                {post.gen_meta.search_count ? ` · ${post.gen_meta.search_count} search` : ""}
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
          <div className="px-4 py-3 border-t border-ink/[0.08] flex items-center gap-x-3 gap-y-2 flex-wrap">
            <button
              disabled={busy}
              onClick={() => onDelete(post.id)}
              className="text-[11px] font-mono text-loss/70 hover:text-loss disabled:opacity-40 transition-colors"
            >
              Delete
            </button>
            {post.source_url && (
              <a
                href={post.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors"
              >
                source ↗
              </a>
            )}
            {post.image_url && (
              <button
                type="button"
                onClick={downloadImage}
                className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                download
              </button>
            )}
            <button
              type="button"
              onClick={copyCaption}
              className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" />
              </svg>
              {copiedCap ? "copied ✓" : "copy caption"}
            </button>
            <div className="ml-auto flex items-center gap-2">
              {post.status !== "approved" && (
                <button
                  disabled={busy || needsMaterials(post)}
                  title={needsMaterials(post) ? "Upload missing materials first" : undefined}
                  onClick={() => onStatus(post.id, "approved")}
                  className="px-4 py-1.5 rounded text-[12px] font-medium bg-positive/15 text-positive border border-positive/30 hover:bg-positive/25 disabled:opacity-40 transition-colors"
                >
                  Approve
                </button>
              )}
              {post.status !== "rejected" && (
                <button
                  disabled={busy}
                  onClick={() => onStatus(post.id, "rejected")}
                  className="px-4 py-1.5 rounded text-[12px] font-medium bg-negative/15 text-loss border border-negative/30 hover:bg-negative/25 disabled:opacity-40 transition-colors"
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
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
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
            Social Posts
          </h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            AI-generated drafts — click a card for the Instagram-style preview.
          </p>
        </div>
        {isGenRunning && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/12 border border-ink/12 text-accent text-[11px] font-mono">
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

      <ModelSpendBreakdown />

      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => setStatus(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${
              status === tab.key
                ? "bg-ink/[0.08] text-text-primary border-ink/15"
                : "bg-transparent text-text-muted border-transparent hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12px] text-text-muted hover:text-text-primary border border-ink/[0.08] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-negative/10 border border-negative/30 text-loss text-[12px]">
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
            ? {
                ...p,
                image_url: `${p.image_url}${p.image_url.includes("?") ? "&" : "?"}t=${Date.now()}`,
              }
            : p;
          setSelected((prev) => (prev && prev.id === busted.id ? { ...prev, ...busted } : prev));
          setPosts((list) => list.map((x) => (x.id === busted.id ? { ...x, ...busted } : x)));
        }}
      />
    </div>
  );
};

export default SocialPostsAdminPage;
