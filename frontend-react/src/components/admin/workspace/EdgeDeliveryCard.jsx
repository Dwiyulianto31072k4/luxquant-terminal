// Cloudflare 522 / origin vs edge — Conversion tab.
// Numbers come from GET /api/v1/workspace/growth/edge-health (admin, VPS token).

import { useCallback, useEffect, useState } from "react";
import { growthApi } from "../../../services/growthApi";
import { Surface, Spinner } from "../primitives";

const num = (n) => Number(n || 0).toLocaleString("en-US");

export default function EdgeDeliveryCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await growthApi.getEdgeHealth();
      setData(res);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Could not load edge health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const bad =
    data &&
    (!data.delivery_ok || (data.http_522_last_hour || 0) >= 80 || (data.http_522_24h || 0) >= 400);
  const peak = Math.max(1, ...(data?.hourly_522 || []).map((h) => h.count || 0));

  return (
    <Surface
      variant="premium"
      hover={false}
      padding="p-5"
      className={bad ? "border-loss/30" : ""}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
            Website delivery
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Cloudflare 522 here looks like a dead app, not a Telegram/Google bug.
            Public check from the VPS is {data?.colo || "CF"} — not Indonesia/SIN.
          </p>
        </div>
        {loading && !data ? <Spinner size={14} /> : null}
      </div>

      {error ? (
        <p className="text-[12px] text-loss">{error}</p>
      ) : !data ? (
        <p className="text-[11px] text-text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="Origin HTML"
              value={data.origin?.html}
              ok={data.origin?.html === 200}
            />
            <Tile
              label={`CF HTML (${data.colo || "—"})`}
              value={data.public?.html}
              ok={data.public?.html === 200}
            />
            <Tile
              label="Origin JS"
              value={data.origin?.chunk}
              ok={data.origin?.chunk === 200}
            />
            <Tile
              label="CF JS"
              value={data.public?.chunk}
              ok={data.public?.chunk === 200}
            />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile
              label="522 last hour"
              value={num(data.http_522_last_hour)}
              ok={(data.http_522_last_hour || 0) < 80}
              warn
            />
            <Tile
              label="522 last 24h"
              value={num(data.http_522_24h)}
              ok={(data.http_522_24h || 0) < 400}
              warn
            />
            <Tile
              label="Requests 24h"
              value={num(data.requests_24h)}
              ok
            />
          </div>
          {data.hourly_522?.length > 0 ? (
            <div className="mt-3 flex h-10 items-end gap-0.5">
              {[...data.hourly_522].reverse().map((h) => (
                <div
                  key={h.hour}
                  title={`${h.hour}: ${h.count} × 522`}
                  className={`min-w-0 flex-1 rounded-t-sm ${
                    (h.count || 0) >= 80 ? "bg-loss/70" : "bg-ink/20"
                  }`}
                  style={{ height: `${Math.max(8, ((h.count || 0) / peak) * 100)}%` }}
                />
              ))}
            </div>
          ) : null}
          {data.analytics_error && !data.analytics_ok ? (
            <p className="mt-2 text-[10px] text-text-muted">{data.analytics_error}</p>
          ) : (
            <p className="mt-2 text-[10px] text-text-muted">
              Origin 200 + CF 522 → purge that file URL. Do not salt/rebuild.
              {data.cf_cache_status ? ` Cache ${data.cf_cache_status}.` : ""}
            </p>
          )}
        </>
      )}
    </Surface>
  );
}

function Tile({ label, value, ok, warn }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          ok ? "text-text-primary" : warn ? "text-loss" : "text-loss"
        }`}
      >
        {value == null || value === "" ? "—" : value}
      </p>
    </div>
  );
}
