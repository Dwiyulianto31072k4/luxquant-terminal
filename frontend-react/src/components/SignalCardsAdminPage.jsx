// Signal Cards — admin control panel for the automated social-card pipeline.
// Mirrors the Social Posts tab: review AI drafts, approve, and publish. The render
// + humanized caption run on the VPS (card_poster.py); this is the control surface.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/authApi";

function fmtLeft(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return (d ? `${d}d ` : "") + `${p(h)}h ${p(m)}m ${p(sec)}s`;
}

const GOLD = "#F0B90B", GOLD_BRIGHT = "#FCD535", CREAM = "#F7F0E2", MUTED = "#a2938a";
const BASE = "/api/v1/admin/signal-cards";

const STATUS_COLOR = {
  draft: "#c3b5a6", approved: GOLD_BRIGHT, posted: "#16c784", rejected: "#f87171",
};

function DraftImage({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    api.get(`${BASE}/${id}/image`, { responseType: "blob" })
      .then((r) => { obj = URL.createObjectURL(r.data); setUrl(obj); })
      .catch(() => {});
    return () => obj && URL.revokeObjectURL(obj);
  }, [id]);
  if (!url) return <div style={{ aspectRatio: "4/5", background: "#160b0d", borderRadius: 10 }} />;
  return <img src={url} alt="card" style={{ width: "100%", borderRadius: 10, display: "block" }} />;
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
    try { const r = await api.get(`${BASE}/config`); setCfg(r.data); } catch (e) { /* noop */ }
  }, []);
  const loadDrafts = useCallback(async () => {
    try { const r = await api.get(BASE, { params: { status: filter } }); setDrafts(r.data.drafts || []); } catch (e) { /* noop */ }
  }, [filter]);

  useEffect(() => { loadCfg(); }, [loadCfg]);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  // tick every second for the live countdown
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // when a scheduled slot fires, give the poster ~15s then refresh (new post appears, next run recomputes)
  useEffect(() => {
    if (!cfg?.next_runs?.length) return;
    const soonest = Math.min(...cfg.next_runs.map((r) => new Date(r.at).getTime()));
    if (now >= soonest && firedRef.current !== soonest) {
      firedRef.current = soonest;
      setTimeout(() => { loadCfg(); loadDrafts(); }, 15000);
    }
  }, [now, cfg, loadCfg, loadDrafts]);

  const toggleMode = async () => {
    if (!cfg) return;
    const next = cfg.mode === "draft" ? "post" : "draft";
    if (next === "post" && !window.confirm("Switch to LIVE posting? Scheduled cards will auto-post to X + Telegram at 00:00 & 13:00 UTC.")) return;
    await api.post(`${BASE}/mode`, { mode: next });
    loadCfg();
  };
  const renderNow = async () => {
    setBusy("render");
    try { await api.post(`${BASE}/render`, { card_key: renderKey }); } catch (e) { /* noop */ }
    setTimeout(() => { loadDrafts(); setBusy(""); }, 9000);
  };
  const setStatus = async (id, status) => { await api.patch(`${BASE}/${id}/status`, { status }); loadDrafts(); };
  const postNow = async (id) => {
    if (!window.confirm("Publish this draft to X + Telegram now?")) return;
    setBusy(`post-${id}`);
    try { await api.post(`${BASE}/${id}/post`); } catch (e) { /* noop */ }
    setTimeout(() => { loadDrafts(); setBusy(""); }, 8000);
  };
  const del = async (id) => { if (window.confirm("Delete this draft?")) { await api.delete(`${BASE}/${id}`); loadDrafts(); } };

  const downloadCard = async (d) => {
    setBusy(`dl-${d.id}`);
    try {
      const r = await api.get(`${BASE}/${d.id}/image`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `luxquant-${d.card_key || "card"}-${d.post_date || d.id}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* ignore — image may not exist yet */ }
    finally { setBusy(null); }
  };

  const copyCaption = async (d) => {
    try {
      await navigator.clipboard.writeText(standardCaption(d));
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard blocked */ }
  };

  const btn = (bg, color = "#100809") => ({
    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 13, background: bg, color,
  });
  const chip = (active) => ({
    padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600,
    border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
    background: active ? "rgba(240,185,11,0.12)" : "transparent", color: active ? GOLD_BRIGHT : MUTED,
  });

  const live = cfg?.mode === "post";
  const runs = (cfg?.next_runs || [])
    .map((r) => ({ ...r, ms: new Date(r.at).getTime() - now }))
    .sort((a, b) => a.ms - b.ms);
  const nextRun = runs[0];

  return (
    <div style={{ color: CREAM }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Signal Cards</h2>
      <p style={{ color: MUTED, margin: "0 0 20px", fontSize: 14 }}>
        Automated daily/weekly social cards — rendered from live data with a humanized Claude caption. Review drafts, then publish.
      </p>

      {/* mode + render controls */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: "1 1 320px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>PIPELINE MODE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: live ? "#16c784" : GOLD_BRIGHT }}>
              {live ? "LIVE — auto-posting" : "DRAFT — review only"}
            </span>
            <button onClick={toggleMode} style={btn(live ? "#f87171" : GOLD)}>
              {live ? "Switch to Draft" : "Go Live"}
            </button>
          </div>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 8 }}>
            {live ? "Scheduled cards post automatically to X + Telegram." : "Scheduled cards are saved as drafts only. Nothing posts until you go live or press Post."}
          </div>
          {nextRun && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>
                {live ? "NEXT AUTO-POST IN" : "NEXT SCHEDULED RENDER IN"}
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: live ? "#16c784" : GOLD_BRIGHT, fontVariantNumeric: "tabular-nums", letterSpacing: 0.5, marginTop: 3 }}>
                {fmtLeft(nextRun.ms)}
              </div>
              <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>
                {nextRun.label} · Slot {nextRun.slot} · {new Date(nextRun.at).toUTCString().slice(17, 22)} UTC
                {runs[1] && <>{"  ·  then "}{runs[1].label} in {fmtLeft(runs[1].ms)}</>}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 320px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>RENDER NOW</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <select value={renderKey} onChange={(e) => setRenderKey(e.target.value)}
              style={{ flex: 1, minWidth: 180, background: "#160b0d", color: CREAM, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px" }}>
              {(cfg?.cards || []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button onClick={renderNow} disabled={busy === "render"} style={btn(GOLD)}>
              {busy === "render" ? "Rendering…" : "Generate draft"}
            </button>
          </div>
          {runs.length > 0 && (
            <div style={{ color: MUTED, fontSize: 13, marginTop: 12, fontVariantNumeric: "tabular-nums" }}>
              Auto-runs: {runs.map((r) => `${r.label} in ${fmtLeft(r.ms)}`).join("   ·   ")}
            </div>
          )}
        </div>
      </div>

      {/* schedule */}
      {cfg?.schedule && (
        <details style={{ marginBottom: 18, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 16px" }}>
          <summary style={{ cursor: "pointer", color: MUTED, fontWeight: 700, fontSize: 13 }}>
            Schedule · next 7 days
            {cfg.slots ? ` (${(cfg.slot_order || Object.keys(cfg.slots)).map((s) => `${s} ${cfg.slots[s]}`).join(" · ")})` : ""}
          </summary>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Day</th>
                  {(cfg.slot_order || ["A", "B"]).map((s) => (
                    <th key={s} style={{ padding: 6, fontWeight: 600 }}>
                      {s} <span style={{ opacity: 0.6 }}>{cfg.slots?.[s]?.replace(" UTC", "") || ""}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfg.schedule.map((d) => (
                  <tr key={d.date || d.day} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: 6, fontWeight: 700 }}>
                      {d.day}
                      {d.date ? <span style={{ color: MUTED, fontWeight: 400 }}> {d.date.slice(8)}</span> : null}
                    </td>
                    {(cfg.slot_order || ["A", "B"]).map((s) => (
                      <td key={s} style={{ padding: 6, color: d[s] ? undefined : MUTED }}>
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
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        {["all", "draft", "approved", "posted", "rejected"].map((s) => (
          <span key={s} style={chip(filter === s)} onClick={() => setFilter(s)}>{s[0].toUpperCase() + s.slice(1)}</span>
        ))}
        <button onClick={loadDrafts} style={{ ...btn("transparent", MUTED), border: "1px solid rgba(255,255,255,0.12)", marginLeft: "auto" }}>↻ Refresh</button>
      </div>

      {/* grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
        {drafts.length === 0 && <div style={{ color: MUTED, gridColumn: "1/-1", padding: 30, textAlign: "center" }}>No drafts yet — press “Generate draft”.</div>}
        {drafts.map((d) => (
          <div key={d.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{d.label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: STATUS_COLOR[d.status] || MUTED, textTransform: "uppercase" }}>{d.status}</span>
            </div>
            {d.has_image ? <DraftImage id={d.id} /> : <div style={{ aspectRatio: "4/5", background: "#160b0d", borderRadius: 10 }} />}
            <p style={{ fontSize: 13, color: CREAM, margin: "10px 2px 8px", lineHeight: 1.4 }}>{d.caption}</p>
            {/* manual posting kit — grab the PNG + one caption that works on X and IG */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button
                onClick={() => downloadCard(d)}
                disabled={!d.has_image || busy === `dl-${d.id}`}
                style={{ ...btn("transparent", CREAM), flex: 1, border: "1px solid rgba(255,255,255,0.14)", opacity: d.has_image ? 1 : 0.4 }}
              >
                {busy === `dl-${d.id}` ? "…" : "↓ Download"}
              </button>
              <button
                onClick={() => copyCaption(d)}
                style={{ ...btn("transparent", copied === d.id ? "#16c784" : CREAM), flex: 1, border: "1px solid rgba(255,255,255,0.14)" }}
              >
                {copied === d.id ? "✓ Copied" : "⧉ Copy caption"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {d.status !== "posted" && d.status !== "approved" && <button onClick={() => setStatus(d.id, "approved")} style={btn(GOLD_BRIGHT)}>Approve</button>}
              {d.status !== "posted" && <button onClick={() => postNow(d.id)} disabled={busy === `post-${d.id}`} style={btn("#16c784", "#04120b")}>{busy === `post-${d.id}` ? "Posting…" : "Post now"}</button>}
              {d.status !== "posted" && d.status !== "rejected" && <button onClick={() => setStatus(d.id, "rejected")} style={btn("transparent", "#f87171")}>Reject</button>}
              {d.tweet_url && <a href={d.tweet_url} target="_blank" rel="noreferrer" style={{ ...btn("transparent", GOLD), textDecoration: "none" }}>View ↗</a>}
              {d.status !== "posted" && <button onClick={() => del(d.id)} style={{ ...btn("transparent", MUTED), marginLeft: "auto" }}>Delete</button>}
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
