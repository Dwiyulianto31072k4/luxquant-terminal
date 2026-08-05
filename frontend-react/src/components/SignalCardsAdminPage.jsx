// Signal Cards — admin control panel for the automated social-card pipeline.
// Mirrors the Social Posts tab: review AI drafts, approve, and publish. The render
// + humanized caption run on the VPS (card_poster.py); this is the control surface.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/authApi";

function fmtLeft(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return (d ? `${d}d ` : "") + `${p(h)}h ${p(m)}m ${p(sec)}s`;
}

const BASE = "/api/v1/admin/signal-cards";

const STATUS_CLASS = {
  draft: "text-text-muted",
  approved: "text-accent",
  posted: "text-profit",
  rejected: "text-loss",
};

// A bundle is several slides under one draft, so the preview pages through them
// rather than showing only the lead card and hiding the receipts behind it.
function DraftImage({ id, count = 1 }) {
  const [url, setUrl] = useState(null);
  const [n, setN] = useState(0);
  const total = Math.max(1, count);
  useEffect(() => {
    setN(0);
  }, [id]);
  useEffect(() => {
    let obj;
    let dead = false;
    api
      // Ask for a thumbnail, not the 4.8MB publish-resolution PNG. The grid was
      // pulling ~40MB to fill a dozen 300px boxes, which is why it crawled.
      .get(`${BASE}/${id}/image`, { params: { n, w: 640 }, responseType: "blob" })
      .then((r) => {
        if (dead) return;
        obj = URL.createObjectURL(r.data);
        setUrl(obj);
      })
      .catch(() => {});
    return () => {
      dead = true;
      obj && URL.revokeObjectURL(obj);
    };
  }, [id, n]);
  if (!url)
    return (
      <div className="aspect-[4/5] rounded-[10px] border border-ink/[0.07] bg-ink/[0.04]" />
    );
  return (
    <div className="relative">
      <img src={url} alt={`slide ${n + 1} of ${total}`} className="block w-full rounded-[10px]" />
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setN((v) => (v - 1 + total) % total)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-[13px] font-bold text-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setN((v) => (v + 1) % total)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-[13px] font-bold text-white"
          >
            ›
          </button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            {n + 1} / {total}
          </div>
        </>
      )}
    </div>
  );
}

// One standard caption for X and Instagram: the humanized line, the CTA that carries the
// link, then IG-facing tags (X ignores them fine, IG needs them for reach).
const IG_TAGS = "#crypto #bitcoin #altcoins #cryptotrading #tradingsignals #luxquant";
function standardCaption(d) {
  return [d.caption, d.reply_text, IG_TAGS].filter(Boolean).join("\n\n").trim();
}

export default function SignalCardsAdminPage() {
  const [cfg, setCfg] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [renderKey, setRenderKey] = useState("daily_recap");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(null);
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(null);

  const loadCfg = useCallback(async () => {
    try {
      const r = await api.get(`${BASE}/config`);
      setCfg(r.data);
    } catch (e) {
      /* noop */
    }
  }, []);
  const loadDrafts = useCallback(async () => {
    try {
      const r = await api.get(BASE, { params: { status: filter } });
      setDrafts(r.data.drafts || []);
    } catch (e) {
      /* noop */
    }
  }, [filter]);

  useEffect(() => {
    loadCfg();
  }, [loadCfg]);
  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // tick every second for the live countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // when a scheduled slot fires, give the poster ~15s then refresh (new post appears, next run recomputes)
  useEffect(() => {
    if (!cfg?.next_runs?.length) return;
    const soonest = Math.min(...cfg.next_runs.map((r) => new Date(r.at).getTime()));
    if (now >= soonest && firedRef.current !== soonest) {
      firedRef.current = soonest;
      setTimeout(() => {
        loadCfg();
        loadDrafts();
      }, 15000);
    }
  }, [now, cfg, loadCfg, loadDrafts]);

  const toggleMode = async () => {
    if (!cfg) return;
    const next = cfg.mode === "draft" ? "post" : "draft";
    if (
      next === "post" &&
      !window.confirm(
        "Switch to LIVE posting? Scheduled cards will auto-post to X + Telegram at 00:00 & 13:00 UTC."
      )
    )
      return;
    await api.post(`${BASE}/mode`, { mode: next });
    loadCfg();
  };
  const renderNow = async () => {
    setBusy("render");
    try {
      await api.post(`${BASE}/render`, { card_key: renderKey });
    } catch (e) {
      /* noop */
    }
    setTimeout(() => {
      loadDrafts();
      setBusy("");
    }, 9000);
  };
  const setStatus = async (id, status) => {
    await api.patch(`${BASE}/${id}/status`, { status });
    loadDrafts();
  };
  const postNow = async (id) => {
    if (!window.confirm("Publish this draft to X + Telegram now?")) return;
    setBusy(`post-${id}`);
    try {
      await api.post(`${BASE}/${id}/post`);
    } catch (e) {
      /* noop */
    }
    setTimeout(() => {
      loadDrafts();
      setBusy("");
    }, 8000);
  };
  const del = async (id) => {
    if (window.confirm("Delete this draft?")) {
      await api.delete(`${BASE}/${id}`);
      loadDrafts();
    }
  };

  // One slide comes down as a PNG; a bundle comes down as a zip of every slide in
  // post order plus the caption, so a carousel can go straight to Instagram.
  const downloadCard = async (d) => {
    setBusy(`dl-${d.id}`);
    const many = (d.slide_count || 1) > 1;
    const stem = `luxquant-${d.card_key || "card"}-${d.post_date || d.id}`;
    try {
      const r = await api.get(`${BASE}/${d.id}/${many ? "download" : "image"}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}.${many ? "zip" : "png"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* ignore — image may not exist yet */
    } finally {
      setBusy(null);
    }
  };

  const copyCaption = async (d) => {
    try {
      await navigator.clipboard.writeText(standardCaption(d));
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const live = cfg?.mode === "post";
  const runs = (cfg?.next_runs || [])
    .map((r) => ({ ...r, ms: new Date(r.at).getTime() - now }))
    .sort((a, b) => a.ms - b.ms);
  const nextRun = runs[0];

  return (
    <div className="text-text-primary">
      <h2 className="m-0 mb-1 text-[26px] font-extrabold tracking-tight">Signal Cards</h2>
      <p className="mb-5 text-sm text-text-muted">
        Automated daily/weekly social cards — rendered from live data with a humanized Claude
        caption. Review drafts, then publish.
      </p>

      {/* mode + render controls */}
      <div className="mb-[18px] flex flex-wrap gap-4">
        <div className="min-w-[320px] flex-1 rounded-xl border border-ink/[0.08] bg-surface-raised p-[18px]">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Pipeline mode
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3.5">
            <span
              className={`text-[22px] font-extrabold ${live ? "text-profit" : "text-accent"}`}
            >
              {live ? "LIVE — auto-posting" : "DRAFT — review only"}
            </span>
            <button
              type="button"
              onClick={toggleMode}
              className={`rounded-xl px-3 py-1.5 text-[13px] font-bold transition-colors ${
                live
                  ? "bg-negative text-white hover:opacity-90"
                  : "bg-accent text-accent-fg hover:opacity-90"
              }`}
            >
              {live ? "Switch to Draft" : "Go Live"}
            </button>
          </div>
          <div className="mt-2 text-[13px] text-text-muted">
            {live
              ? "Scheduled cards post automatically to X + Telegram."
              : "Scheduled cards are saved as drafts only. Nothing posts until you go live or press Post."}
          </div>
          {nextRun && (
            <div className="mt-3.5 border-t border-ink/[0.07] pt-3.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                {live ? "Next auto-post in" : "Next scheduled render in"}
              </div>
              <div
                className={`mt-1 text-[34px] font-extrabold tabular-nums tracking-wide ${
                  live ? "text-profit" : "text-accent"
                }`}
              >
                {fmtLeft(nextRun.ms)}
              </div>
              <div className="mt-0.5 text-[13px] text-text-muted">
                {nextRun.label} · Slot {nextRun.slot} ·{" "}
                {new Date(nextRun.at).toUTCString().slice(17, 22)} UTC
                {runs[1] && (
                  <>
                    {"  ·  then "}
                    {runs[1].label} in {fmtLeft(runs[1].ms)}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-[320px] flex-1 rounded-xl border border-ink/[0.08] bg-surface-raised p-[18px]">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Render now
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            <select
              value={renderKey}
              onChange={(e) => setRenderKey(e.target.value)}
              className="min-w-[180px] flex-1 rounded-xl border border-ink/[0.08] bg-surface-raised px-2.5 py-2 text-[13px] text-text-primary focus:border-ink/15 focus:outline-none"
            >
              {(cfg?.cards || []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={renderNow}
              disabled={busy === "render"}
              className="rounded-xl bg-accent px-3 py-1.5 text-[13px] font-bold text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy === "render" ? "Rendering…" : "Generate draft"}
            </button>
          </div>
          {runs.length > 0 && (
            <div className="mt-3 text-[13px] tabular-nums text-text-muted">
              Auto-runs: {runs.map((r) => `${r.label} in ${fmtLeft(r.ms)}`).join("   ·   ")}
            </div>
          )}
        </div>
      </div>

      {/* schedule */}
      {cfg?.schedule && (
        <details className="mb-[18px] rounded-xl border border-ink/[0.07] bg-surface-raised px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-bold text-text-muted">
            Schedule · next 7 days
            {cfg.slots
              ? ` (${(cfg.slot_order || Object.keys(cfg.slots))
                  .map((s) => `${s} ${cfg.slots[s]}`)
                  .join(" · ")})`
              : ""}
          </summary>
          <div className="overflow-x-auto">
            <table className="mt-2.5 w-full border-collapse whitespace-nowrap text-[13px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="p-1.5 font-medium">Day</th>
                  {(cfg.slot_order || ["A", "B"]).map((s) => (
                    <th key={s} className="p-1.5 font-semibold">
                      {s}{" "}
                      <span className="opacity-60">
                        {cfg.slots?.[s]?.replace(" UTC", "") || ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfg.schedule.map((d) => (
                  <tr key={d.date || d.day} className="border-t border-ink/[0.06]">
                    <td className="p-1.5 font-bold text-text-primary">
                      {d.day}
                      {d.date ? (
                        <span className="font-normal text-text-muted"> {d.date.slice(8)}</span>
                      ) : null}
                    </td>
                    {(cfg.slot_order || ["A", "B"]).map((s) => (
                      <td
                        key={s}
                        className={`p-1.5 ${d[s] ? "text-text-primary" : "text-text-muted"}`}
                      >
                        {d[s] ? CARD_LABEL(cfg, d[s]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* filters */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {["all", "draft", "approved", "posted", "rejected"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              filter === s
                ? "border-accent/30 bg-accent/15 text-accent"
                : "border-ink/[0.08] text-text-muted hover:text-text-secondary"
            }`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          type="button"
          onClick={loadDrafts}
          className="ml-auto rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-1.5 text-[13px] font-semibold text-text-muted hover:text-text-primary"
        >
          ↻ Refresh
        </button>
      </div>

      {/* grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {drafts.length === 0 && (
          <div className="col-span-full p-[30px] text-center text-text-muted">
            No drafts yet — press “Generate draft”.
          </div>
        )}
        {drafts.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-text-primary">{d.label}</span>
              <span
                className={`text-[11px] font-extrabold uppercase tracking-wide ${
                  STATUS_CLASS[d.status] || "text-text-muted"
                }`}
              >
                {d.status}
              </span>
            </div>
            {d.has_image ? (
              <DraftImage id={d.id} count={d.slide_count} />
            ) : (
              <div className="aspect-[4/5] rounded-[10px] border border-ink/[0.07] bg-ink/[0.04]" />
            )}
            <p className="mx-0.5 my-2.5 text-[13px] leading-snug text-text-primary">{d.caption}</p>
            {/* manual posting kit — grab the PNG + one caption that works on X and IG */}
            <div className="mb-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => downloadCard(d)}
                disabled={!d.has_image || busy === `dl-${d.id}`}
                className="flex-1 rounded-xl border border-ink/[0.08] px-3 py-1.5 text-[13px] font-bold text-text-primary disabled:opacity-40"
              >
                {busy === `dl-${d.id}`
                  ? "…"
                  : (d.slide_count || 1) > 1
                    ? `↓ Download ${d.slide_count} (zip)`
                    : "↓ Download"}
              </button>
              <button
                type="button"
                onClick={() => copyCaption(d)}
                className={`flex-1 rounded-xl border border-ink/[0.08] px-3 py-1.5 text-[13px] font-bold ${
                  copied === d.id ? "text-profit" : "text-text-primary"
                }`}
              >
                {copied === d.id ? "✓ Copied" : "⧉ Copy caption"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {d.status !== "posted" && d.status !== "approved" && (
                <button
                  type="button"
                  onClick={() => setStatus(d.id, "approved")}
                  className="rounded-xl bg-accent px-3 py-1.5 text-[13px] font-bold text-accent-fg hover:opacity-90"
                >
                  Approve
                </button>
              )}
              {d.status !== "posted" && (
                <button
                  type="button"
                  onClick={() => postNow(d.id)}
                  disabled={busy === `post-${d.id}`}
                  className="rounded-xl bg-profit px-3 py-1.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy === `post-${d.id}` ? "Posting…" : "Post now"}
                </button>
              )}
              {d.status !== "posted" && d.status !== "rejected" && (
                <button
                  type="button"
                  onClick={() => setStatus(d.id, "rejected")}
                  className="rounded-xl border border-negative/25 px-3 py-1.5 text-[13px] font-bold text-loss"
                >
                  Reject
                </button>
              )}
              {d.tweet_url && (
                <a
                  href={d.tweet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-ink/[0.08] px-3 py-1.5 text-[13px] font-bold text-accent no-underline"
                >
                  View ↗
                </a>
              )}
              {d.status !== "posted" && (
                <button
                  type="button"
                  onClick={() => del(d.id)}
                  className="ml-auto rounded-xl px-3 py-1.5 text-[13px] font-bold text-text-muted hover:text-text-primary"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CARD_LABEL(cfg, key) {
  const c = (cfg?.cards || []).find((x) => x.key === key);
  return c ? c.label : key;
}
