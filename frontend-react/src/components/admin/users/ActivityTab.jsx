/**
 * Everything this user did, with real timestamps.
 *
 * The drawer used to show a session count and a "last seen" day, which answers
 * whether someone is alive and nothing else. What support actually asks is
 * narrower and harder: what were they doing right before they wrote in, did
 * they ever reach the page they are asking about, did they come back after we
 * replied. That needs the rows, in order, with the clock attached.
 *
 * Gaps are shown rather than hidden. A five-second hop between four features is
 * someone clicking around; a two-hour gap is a different visit, and reading the
 * list without that distinction gives the wrong picture of how long they stayed.
 */
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../../services/adminApi";

// Below this, two events are the same burst of clicking rather than a return.
const NEW_VISIT_GAP_MS = 30 * 60 * 1000;

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const fmtGap = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

export const ActivityTab = ({ userId }) => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(300);

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    setLoading(true);
    adminApi
      .getUserActivity(userId, limit)
      .then((d) => !dead && setData(d))
      .catch((e) => !dead && setErr(e?.response?.data?.detail || "Could not load activity"))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [userId, limit]);

  // Group into days, and inside a day mark where a new visit begins.
  const days = useMemo(() => {
    const events = data?.events || [];
    const out = [];
    let currentDay = null;
    events.forEach((ev, i) => {
      const dayKey = new Date(ev.occurred_at).toDateString();
      if (!currentDay || currentDay.key !== dayKey) {
        currentDay = { key: dayKey, iso: ev.occurred_at, rows: [] };
        out.push(currentDay);
      }
      // events are newest-first, so the "next" one is the earlier event
      const prev = events[i + 1];
      const gapMs = prev
        ? new Date(ev.occurred_at).getTime() - new Date(prev.occurred_at).getTime()
        : null;
      currentDay.rows.push({ ...ev, gapMs, startsVisit: gapMs === null || gapMs > NEW_VISIT_GAP_MS });
    });
    return out;
  }, [data]);

  if (loading) return <p className="text-[12px] text-text-muted">Loading activity…</p>;
  if (err) return <p className="text-[12px] text-[#F6465D]">{err}</p>;

  const events = data?.events || [];
  if (events.length === 0) {
    return (
      <p className="text-[12px] text-text-muted">
        Nothing recorded for this user yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-text-muted">
          <span className="text-text-primary">{data.total_events}</span> events recorded
          {data.truncated ? ` · showing the most recent ${data.returned}` : ""}
        </p>
        {data.truncated ? (
          <button
            type="button"
            onClick={() => setLimit((n) => Math.min(1000, n + 300))}
            className="rounded-lg border border-ink/12 px-3 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
          >
            Load more
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(data.by_feature || []).map((f) => (
          <span
            key={f.feature}
            className="rounded-full border border-ink/[0.08] bg-surface-raised px-2.5 py-1 font-mono text-[10px] text-text-secondary"
            title={f.last_at ? `last ${fmtDay(f.last_at)} ${fmtTime(f.last_at)}` : ""}
          >
            {f.feature} <span className="text-text-primary">{f.count}</span>
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {days.map((day) => (
          <div key={day.key} className="rounded-xl border border-ink/[0.08] bg-surface-raised">
            <p className="border-b border-ink/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              {fmtDay(day.iso)} · {day.rows.length}
            </p>
            <div className="divide-y divide-ink/[0.04]">
              {day.rows.map((row, i) => (
                <div
                  key={`${row.occurred_at}-${i}`}
                  className="flex items-baseline gap-3 px-3 py-1.5"
                >
                  <span className="w-[68px] shrink-0 font-mono text-[11px] text-text-muted">
                    {fmtTime(row.occurred_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                    {row.feature}
                  </span>
                  {row.startsVisit ? (
                    <span className="shrink-0 rounded-full border border-accent/30 px-2 py-0.5 font-mono text-[9px] text-accent">
                      visit start
                    </span>
                  ) : row.gapMs != null && row.gapMs >= 60000 ? (
                    <span className="shrink-0 font-mono text-[10px] text-text-muted">
                      +{fmtGap(row.gapMs)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
