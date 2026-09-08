// src/components/admin/workspace/BroadcastTab.jsx
//
// LuxQuant — Management System › Broadcast tab.
//
// The System tab answers "is the unit running". This answers the question that
// one cannot: is the work actually coming out the other end.
//
// On 2026-09-08 Telegram's DC5 went down and delivery to the signal channel
// stopped for three and a half hours while every service stayed green — nothing
// had crashed, so nothing looked wrong. The tell was not a process, it was a
// clock: how long since this channel last carried anything, and how much is
// waiting behind it.
//
// So no card here reads a service state. Green means work flowed recently, and
// a channel only turns red when something is queued behind the silence — most
// of these are quiet at night, and colouring that red teaches everyone to
// ignore the colour.
import { useState, useEffect, useCallback, useRef } from "react";
import api from "../../../services/api";
import {
  TelegramIcon,
  DiscordIcon,
  ActivityIcon,
  BroadcastConeIcon,
} from "../Icons";

const CSS = `
.bc-cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(310px,1fr))}
.bc-card{position:relative;display:flex;flex-direction:column;gap:14px;padding:18px;
  border:1px solid var(--border-subtle);border-radius:14px;background:var(--bg-elevated);
  transition:border-color .18s ease, transform .18s ease}
.bc-card:hover{transform:translateY(-1px)}
.bc-card::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;border-radius:14px 0 0 14px;
  background:var(--bc-tone)}
.bc-head{display:flex;align-items:flex-start;gap:12px}
.bc-ico{flex:none;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;
  background:var(--bc-wash);color:var(--bc-tone)}
.bc-ico svg{width:19px;height:19px}
.bc-title{font-size:14.5px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.bc-note{font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.45}
.bc-pill{flex:none;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
  font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  background:var(--bc-wash);color:var(--bc-tone)}
.bc-pip{width:6px;height:6px;border-radius:50%;background:currentColor}
.bc-hero{display:flex;align-items:baseline;gap:9px}
.bc-hero b{font-size:26px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.bc-hero span{font-size:12px;color:var(--text-muted)}
.bc-feet{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:13px;
  border-top:1px solid var(--border-subtle)}
.bc-lab{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)}
.bc-val{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}
.bc-sub{font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4}
.bc-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--text-muted)}
.bc-pulse{width:7px;height:7px;border-radius:50%;background:#16a34a;animation:bcp 2s ease-in-out infinite}
@keyframes bcp{0%,100%{opacity:1}50%{opacity:.25}}
.bc-drop{display:flex;align-items:center;gap:16px;padding:18px;border-radius:14px;margin-top:14px;
  border:1px solid var(--border-subtle);background:var(--bg-subtle)}
`;

// Tone carries the whole visual state — border stripe, icon wash, pill.
const TONE = {
  ok:      { c: "#16a34a", w: "rgba(22,163,74,.10)",  word: "flowing" },
  idle:    { c: "#94a3b8", w: "rgba(148,163,184,.14)", word: "idle" },
  slow:    { c: "#d97706", w: "rgba(217,119,6,.12)",  word: "behind" },
  stalled: { c: "#dc2626", w: "rgba(220,38,38,.10)",  word: "stalled" },
  unknown: { c: "#94a3b8", w: "rgba(148,163,184,.14)", word: "no data" },
};

// X ships no icon in the set, and the wordmark is the only thing anyone
// recognises it by, so it is drawn rather than substituted.
const XIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M13.9 10.6 21.3 2h-1.8l-6.4 7.5L8 2H2.2l7.8 11.4L2.2 22H4l6.8-7.9L16.2 22H22l-8.1-11.4Zm-2.4 2.8-.8-1.1L4.6 3.3h2.7l5.1 7.3.8 1.1 6.6 9.4h-2.7l-5.6-7.7Z" />
  </svg>
);

const ICONS = {
  ingest: BroadcastConeIcon,
  tg_channel: TelegramIcon,
  tg_vip: TelegramIcon,
  discord: DiscordIcon,
  x_main: XIcon,
  x_feed: XIcon,
};

function since(min) {
  if (min === null || min === undefined) return ["—", ""];
  if (min < 1) return ["just", "now"];
  if (min < 60) return [String(Math.round(min)), "min ago"];
  const h = min / 60;
  if (h < 48) return [h.toFixed(1), "h ago"];
  return [(h / 24).toFixed(1), "d ago"];
}

function Card({ r }) {
  const t = TONE[r.verdict] || TONE.unknown;
  const Icon = ICONS[r.key] || ActivityIcon;
  const [n, unit] = since(r.age_min);
  const flow = r.last_hour !== null && r.last_hour !== undefined
    ? `${r.last_hour}/h` : `${r.last_day ?? 0}/day`;

  return (
    <div className="bc-card" style={{ "--bc-tone": t.c, "--bc-wash": t.w }}>
      <div className="bc-head">
        <span className="bc-ico"><Icon /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bc-title">{r.name}</div>
          <div className="bc-note">{r.note}</div>
        </div>
        <span className="bc-pill"><span className="bc-pip" />{t.word}</span>
      </div>

      <div className="bc-hero">
        <b>{n}</b><span>{unit || "last out"}</span>
      </div>

      <div className="bc-feet">
        <div>
          <div className="bc-lab">Waiting</div>
          <div className="bc-val" style={{ color: r.queue > 0 ? t.c : undefined }}>
            {r.queue > 0 ? r.queue : "—"}
          </div>
          <div className="bc-sub">{r.queue > 0 ? "not sent yet" : "nothing held"}</div>
        </div>
        <div>
          <div className="bc-lab">Throughput</div>
          <div className="bc-val">{flow}</div>
          <div className="bc-sub">{r.expect}</div>
        </div>
      </div>
    </div>
  );
}

export function BroadcastTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/broadcast");
      setData(r.data);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || "Could not load");
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000);
    return () => timer.current && clearInterval(timer.current);
  }, [load]);

  const rows = data?.rows || [];
  // Two different problems, and the banner used to conflate them: a channel can
  // be late with nothing waiting (quiet market) or hold a queue while still
  // moving. Saying "something is queued behind the silence" about a row with an
  // empty queue is simply untrue, and a banner that overstates gets dismissed.
  const late = rows.filter((r) => r.verdict === "slow" || r.verdict === "stalled");
  const held = rows.filter((r) => r.queue > 0);

  return (
    <div style={{ padding: "4px 0 44px" }}>
      <style>{CSS}</style>

      <div style={{ maxWidth: "66ch" }}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.55 }}>
          Every channel measured by its own output, not by whether a process exists.
          A service can run all day and publish nothing — that is what this catches.
        </p>
        <div className="bc-live" style={{ marginTop: 10 }}>
          <span className="bc-pulse" />
          live · refreshes every 30s
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10,
                      background: "rgba(220,38,38,.08)", color: "#dc2626", fontSize: 14 }}>{err}</div>
      ) : null}

      {late.length || held.length ? (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, fontSize: 13.5,
                      lineHeight: 1.5, background: "rgba(217,119,6,.09)",
                      border: "1px solid rgba(217,119,6,.22)" }}>
          {late.length ? (
            <div>
              <strong>Quiet longer than usual:</strong> {late.map((r) => r.name).join(" · ")}
            </div>
          ) : null}
          {held.length ? (
            <div style={{ marginTop: late.length ? 5 : 0 }}>
              <strong>Waiting to go out:</strong>{" "}
              {held.map((r) => `${r.name} (${r.queue})`).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="bc-cards" style={{ marginTop: 18 }}>
        {rows.map((r) => <Card key={r.key} r={r} />)}
        {!rows.length && !err ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "10px 2px" }}>Loading…</div>
        ) : null}
      </div>

      {/* Not a channel, but the only number that stands for work nobody will
          ever see. It was seven in two hours on 2026-09-08 — an outage counted
          as a defect in the posts themselves — so it gets its own row rather
          than living in a log tail. */}
      {data ? (
        <div className="bc-drop" style={{
          "--bc-tone": data.dropped_today > 0 ? "#dc2626" : "#94a3b8",
          "--bc-wash": data.dropped_today > 0 ? "rgba(220,38,38,.10)" : "rgba(148,163,184,.14)",
        }}>
          <span className="bc-ico"><ActivityIcon /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc-title">Given up on</div>
            <div className="bc-note" style={{ maxWidth: "72ch" }}>
              Milestones that hit the attempt ceiling and will never be published.
              An outage must never land here — if today's count moves, the failure
              was counted against the post instead of the provider.
            </div>
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <div className="bc-lab">Today</div>
            <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-.02em", lineHeight: 1,
                          marginTop: 4, fontVariantNumeric: "tabular-nums",
                          color: data.dropped_today > 0 ? "#dc2626" : undefined }}>
              {data.dropped_today}
            </div>
            <div className="bc-sub">{data.dropped_total} all time</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BroadcastTab;
