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
// So no row here reads a service state. Green means work flowed recently, and
// a channel is only ever red when something is queued behind the silence —
// most of these are quiet at night, and colouring that red teaches everyone to
// ignore the colour.
import { useState, useEffect, useCallback, useRef } from "react";
import api from "../../../services/api";

const CSS = `
.bc-grid{display:grid;gap:10px}
.bc-row{display:grid;grid-template-columns:10px 1.6fr .8fr .8fr .9fr;gap:14px;align-items:center;
  padding:14px 16px;border:1px solid var(--border-subtle);border-radius:11px;background:var(--bg-elevated)}
.bc-dot{width:9px;height:9px;border-radius:50%;justify-self:center}
.bc-name{font-size:14px;font-weight:600;letter-spacing:-.01em}
.bc-note{font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.45}
.bc-lab{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--text-muted)}
.bc-val{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:3px}
.bc-sm{font-size:11.5px;color:var(--text-muted);margin-top:2px}
.bc-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--text-muted)}
.bc-pulse{width:7px;height:7px;border-radius:50%;background:#16a34a;animation:bcp 2s ease-in-out infinite}
@keyframes bcp{0%,100%{opacity:1}50%{opacity:.3}}
.bc-drop{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:11px;
  border:1px solid var(--border-subtle);background:var(--bg-subtle);margin-top:14px}
@media (max-width:820px){
  .bc-row{grid-template-columns:10px 1fr;row-gap:10px}
  .bc-row > :nth-child(n+3){grid-column:2}
}
`;

const TONE = {
  ok:      { dot: "#16a34a", word: "flowing" },
  idle:    { dot: "#94a3b8", word: "idle, nothing waiting" },
  slow:    { dot: "#d97706", word: "behind" },
  stalled: { dot: "#dc2626", word: "stalled" },
  unknown: { dot: "#94a3b8", word: "never delivered" },
};

function since(min) {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)} h ago`;
  return `${(h / 24).toFixed(1)} d ago`;
}

function Row({ r }) {
  const tone = TONE[r.verdict] || TONE.unknown;
  return (
    <div className="bc-row">
      <span className="bc-dot" style={{ background: tone.dot }} title={tone.word} />
      <div>
        <div className="bc-name">{r.name}</div>
        <div className="bc-note">{r.note}</div>
      </div>
      <div>
        <div className="bc-lab">Last out</div>
        <div className="bc-val">{since(r.age_min)}</div>
        <div className="bc-sm">{tone.word}</div>
      </div>
      <div>
        <div className="bc-lab">Waiting</div>
        <div className="bc-val" style={{ color: r.queue > 0 ? tone.dot : undefined }}>
          {r.queue > 0 ? r.queue : "—"}
        </div>
        <div className="bc-sm">{r.queue > 0 ? "not sent yet" : "nothing held"}</div>
      </div>
      <div>
        <div className="bc-lab">Throughput</div>
        <div className="bc-val">
          {r.last_hour !== null && r.last_hour !== undefined
            ? `${r.last_hour}/h` : `${r.last_day ?? 0}/day`}
        </div>
        <div className="bc-sm">{r.expect}</div>
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
  const bad = rows.filter((r) => r.verdict === "stalled" || r.verdict === "slow");

  return (
    <div style={{ padding: "4px 0 44px" }}>
      <style>{CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>
            Is anything actually going out
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 14, maxWidth: "64ch" }}>
            Every channel measured by its own output, not by whether a process exists.
            A service can run all day and publish nothing — that is what this catches.
          </p>
          <div className="bc-live" style={{ marginTop: 9 }}>
            <span className="bc-pulse" />
            live · refreshed {data?.generated_at ? since(0) : "—"}
          </div>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 9,
                      background: "rgba(220,38,38,.08)", color: "#dc2626", fontSize: 14 }}>{err}</div>
      ) : null}

      {bad.length ? (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 9, fontSize: 13.5,
                      background: "rgba(217,119,6,.09)", border: "1px solid rgba(217,119,6,.25)" }}>
          <strong>{bad.length} channel{bad.length > 1 ? "s" : ""} behind:</strong>{" "}
          {bad.map((b) => b.name).join(" · ")} — and something is queued behind the silence.
        </div>
      ) : null}

      <div className="bc-grid" style={{ marginTop: 18 }}>
        {rows.map((r) => <Row key={r.key} r={r} />)}
        {!rows.length && !err ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "10px 2px" }}>Loading…</div>
        ) : null}
      </div>

      {/* Not a channel, but the only number that represents work nobody will
          ever see. It was seven in two hours on 2026-09-08 — an outage counted
          as a defect in the posts themselves — so it gets its own line rather
          than living in a log tail. */}
      {data ? (
        <div className="bc-drop">
          <span className="bc-dot" style={{
            background: data.dropped_today > 0 ? "#dc2626" : "#94a3b8", marginTop: 6 }} />
          <div>
            <div className="bc-name">Given up on</div>
            <div className="bc-note">
              Milestones that hit the attempt ceiling and will never be published.
              An outage must never land here — if today's count moves, the failure
              was counted against the post instead of the provider.
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="bc-lab">Today</div>
            <div className="bc-val" style={{ color: data.dropped_today > 0 ? "#dc2626" : undefined }}>
              {data.dropped_today}
            </div>
            <div className="bc-sm">{data.dropped_total} all time</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BroadcastTab;
