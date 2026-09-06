// Management System › Delivery
// Cloudflare 522 vs origin. Token never leaves the VPS. Times shown in WIB.

import { useCallback, useEffect, useState } from "react";
import { growthApi } from "../../../services/growthApi";
import { RefreshIcon } from "../Icons";
import { Spinner } from "../primitives";

const num = (n) => Number(n || 0).toLocaleString("id-ID");
const WIB = "Asia/Jakarta";

function wibParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { hour: "—", day: "", stamp: iso || "—" };
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const day = new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return { hour, day, stamp: `${day} · ${hour}` };
}

export function EdgeHealthTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await growthApi.getEdgeHealth();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to load delivery health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} />
      </div>
    );
  }

  const rows = [...(data?.hourly_522 || [])]
    .map((h) => ({ ...h, ...wibParts(h.hour) }))
    .reverse();
  const peak = Math.max(1, ...rows.map((h) => h.count || 0));
  const yTicks = [peak, Math.round(peak / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  const bad =
    data &&
    (!data.delivery_ok ||
      (data.http_522_last_hour || 0) >= 80 ||
      (data.http_522_24h || 0) >= 400);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Platform · Cloudflare edge
          </p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Website delivery
          </h2>
          <p className="mt-0.5 max-w-xl text-[12px] text-text-muted">
            522 kelihatan seperti app mati, bukan bug login. Probe VPS lewat colo{" "}
            {data?.colo || "CF"}, bukan SIN. Origin 200 + CF 522 → purge URL file
            itu — jangan salt/rebuild. Jam di halaman ini: WIB (UTC+7).
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-ink/14 disabled:opacity-50"
        >
          <RefreshIcon size={12} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-loss/25 bg-loss/10 px-4 py-3 text-[12px] text-loss">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div
            className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 ${
              bad ? "rounded-2xl ring-1 ring-loss/30 p-1" : ""
            }`}
          >
            <Tile label="Origin HTML" value={data.origin?.html} ok={data.origin?.html === 200} />
            <Tile
              label={`CF HTML (${data.colo || "—"})`}
              value={data.public?.html}
              ok={data.public?.html === 200}
            />
            <Tile label="Origin JS" value={data.origin?.chunk} ok={data.origin?.chunk === 200} />
            <Tile label="CF JS" value={data.public?.chunk} ok={data.public?.chunk === 200} />
            <Tile
              label="522 jam ini"
              value={num(data.http_522_last_hour)}
              ok={(data.http_522_last_hour || 0) < 80}
            />
            <Tile
              label="522 24 jam"
              value={num(data.http_522_24h)}
              ok={(data.http_522_24h || 0) < 400}
            />
          </div>

          <div className="rounded-2xl border border-ink/[0.08] bg-surface-raised p-5">
            <p className="text-[14px] font-semibold text-text-primary">522 per jam · WIB</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {num(data.requests_24h)} request Cloudflare dalam 24 jam
              {data.cf_cache_status ? ` · cache ${data.cf_cache_status}` : ""}
            </p>

            {rows.length > 0 ? (
              <>
                <div className="mt-5 flex gap-3">
                  <div className="flex h-44 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[10px] tabular-nums text-text-muted">
                    {yTicks.map((t) => (
                      <span key={t}>{num(t)}</span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 overflow-x-auto">
                    <div className="flex h-44 min-w-[520px] items-end gap-1.5 border-b border-ink/[0.08] pb-0">
                      {rows.map((h) => {
                        const hot = (h.count || 0) >= 80;
                        const pct = Math.max(h.count ? 6 : 2, ((h.count || 0) / peak) * 100);
                        return (
                          <div
                            key={h.hour}
                            className="flex min-w-0 flex-1 flex-col items-center justify-end"
                            title={`${h.stamp} WIB · ${num(h.count)} × 522`}
                          >
                            {(h.count || 0) > 0 ? (
                              <span
                                className={`mb-1 font-mono text-[9px] tabular-nums ${
                                  hot ? "font-semibold text-loss" : "text-text-muted"
                                }`}
                              >
                                {num(h.count)}
                              </span>
                            ) : (
                              <span className="mb-1 h-[13px]" />
                            )}
                            <div
                              className={`w-full max-w-[28px] rounded-t-md ${
                                hot ? "bg-loss/80" : "bg-ink/25"
                              }`}
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex min-w-[520px] gap-1.5 pt-2">
                      {rows.map((h, i) => {
                        const showDay = i === 0 || h.day !== rows[i - 1].day;
                        return (
                          <div key={h.hour} className="min-w-0 flex-1 text-center">
                            <p className="font-mono text-[10px] tabular-nums text-text-secondary">
                              {h.hour}
                            </p>
                            {showDay ? (
                              <p className="mt-0.5 text-[9px] leading-tight text-text-muted">{h.day}</p>
                            ) : (
                              <p className="mt-0.5 h-[13px]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                        <th className="py-2 font-medium">Waktu (WIB)</th>
                        <th className="py-2 font-medium text-right">Jumlah 522</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rows].reverse().map((h) => (
                        <tr key={h.hour} className="border-t border-ink/[0.06]">
                          <td className="py-2 text-text-secondary">{h.stamp}</td>
                          <td
                            className={`py-2 text-right font-semibold tabular-nums ${
                              (h.count || 0) >= 80 ? "text-loss" : "text-text-primary"
                            }`}
                          >
                            {num(h.count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="mt-3 text-[12px] text-text-muted">
                {data.analytics_error || "Belum ada data per jam."}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-ink/[0.08] bg-surface-raised p-5">
            <p className="text-[14px] font-semibold text-text-primary">
              522 per colo × path (25 menit)
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              SIN + file /assets/ di-purge otomatis kalau origin 200 (loker Andika).
              Path /api/ tidak di-purge — itu jalur colo→VPS, bukan cache.
            </p>
            {(data.sin_hotspots || []).length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                      <th className="py-2 font-medium">Colo</th>
                      <th className="py-2 font-medium">Path</th>
                      <th className="py-2 font-medium text-right">522</th>
                      <th className="py-2 font-medium">Unstick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sin_hotspots.slice(0, 15).map((h) => (
                      <tr key={`${h.colo}-${h.path}`} className="border-t border-ink/[0.06]">
                        <td className="py-2 font-mono text-[11px] text-text-secondary">{h.colo}</td>
                        <td className="max-w-[420px] truncate py-2 font-mono text-[11px] text-text-primary" title={h.path}>
                          {h.path}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-loss">
                          {num(h.count)}
                        </td>
                        <td className="py-2 text-[11px] text-text-muted">
                          {h.purgeable ? "aset → auto purge" : "API → skip"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-text-muted">Belum ada hotspot (cron 5 menit).</p>
            )}
            {(data.unstick_recent || []).length ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Purge otomatis terakhir
                </p>
                <ul className="mt-1 space-y-1 text-[11px] text-text-secondary">
                  {data.unstick_recent.slice(0, 8).map((u, i) => (
                    <li key={i} className="font-mono">
                      {u.ts} {u.action} {u.colo} n={u.count} {u.path}{" "}
                      {u.ok === false ? "FAIL" : u.ok ? "OK" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Tile({ label, value, ok }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-surface-raised px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${ok ? "text-text-primary" : "text-loss"}`}
      >
        {value == null || value === "" ? "—" : value}
      </p>
    </div>
  );
}

export default EdgeHealthTab;
