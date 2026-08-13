// ════════════════════════════════════════════════════════════════════
// ConversionTab — visitor → login acquisition funnel (User Management orbit)
// Backed by GET /api/v1/workspace/growth/conversion
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { lazy, Suspense } from "react";

import { countryName, flagEmoji, isUnknownCountry } from "./countries";
const WorldMapPanel = lazy(() => import("./WorldMapPanel"));
import { growthApi } from "../../../services/growthApi";
import { StatTile, Surface, Spinner } from "../primitives";
import { RefreshIcon, GoogleIcon, TelegramIcon, DiscordIcon } from "../Icons";

// The API treats anything at or beyond 3650 days as "all time"; the exact
// number never reaches the reader. Declared here because the range picker on
// the signups chart is defined further up the file than the tab's own control.
const ALL_TIME = 3650;

const num = (n) => Number(n || 0).toLocaleString("en-US");
const pct = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : `${(Number(n) * 100).toFixed(1)}%`);

const ExpandIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
  </svg>
);

// `onExpand` turns a panel into a doorway. The card keeps whatever fits at a
// glance; the full set, and any breakdown too heavy for the card, lives one
// click deeper. Panels without it render exactly as before.
const Panel = ({ title, sub, children, right, onExpand, className = "" }) => (
  <Surface variant="premium" hover={false} padding="p-5" className={className}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">{title}</h3>
        {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {right}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title={`Expand ${title}`}
            aria-label={`Expand ${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink/[0.07] text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
          >
            <ExpandIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
    {children}
  </Surface>
);

// Stages drawn to scale, so the shape of the loss is visible before any number
// is read. Widths are relative to the first stage — not to each other — because
// the question is always "how much of the top survived to here".
const FunnelFlow = ({ steps }) => {
  const top = steps[0]?.value || 0;
  return (
    <div>
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const lost = prev == null ? null : Math.max(prev - s.value, 0);
        // A stage with people in it never renders as nothing — a hairline still
        // reads as "almost none", an empty track reads as a broken chart.
        const width = top > 0 ? Math.max((s.value / top) * 100, s.value > 0 ? 1.5 : 0) : 0;
        return (
          <div
            key={s.label}
            className="flex items-center gap-2 border-t border-ink/[0.05] py-2 first:border-t-0 sm:gap-3"
          >
            <p className="w-20 shrink-0 text-[10px] font-medium uppercase leading-tight tracking-wider text-text-muted sm:w-32">
              {s.label}
            </p>
            <div className="min-w-0 flex-1">
              <div
                className="h-6 rounded-r-[4px] bg-accent/75"
                style={{ width: `${width}%` }}
                aria-hidden
              />
            </div>
            <p className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums text-text-primary sm:w-16">
              {num(s.value)}
            </p>
            <div className="w-20 shrink-0 text-right sm:w-28">
              {s.sub && (
                <p className="text-[10px] leading-tight text-text-muted">{s.sub}</p>
              )}
              {lost != null && lost > 0 && (
                <p className="text-[10px] leading-tight text-loss">−{num(lost)} lost</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// The full list, when the capped one is not enough. Deliberately plain: it is
// the same rows with the lid off, not a second design to keep in step.
const AuthDetailDialog = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="lq-scrim absolute inset-0 bg-scrim/60 backdrop-blur-sm"
    />
    <div className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-ink/[0.08] bg-surface-raised shadow-2xl sm:rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-ink/[0.07] px-4 py-3">
        <p className="text-[13px] font-semibold text-text-primary">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-ink/[0.06] hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  </div>
);

// A section header that says how many there are and offers the full set. The
// count lives here rather than in the list, so capping the list never hides
// how much was capped.
const ListHeader = ({ label, total, shown, onExpand }) => (
  <div className="mb-2 flex items-baseline justify-between gap-2">
    <p className="text-[11px] font-semibold text-text-muted">{label}</p>
    {total > shown && (
      <button
        type="button"
        onClick={onExpand}
        className="text-[10px] font-semibold text-accent transition-opacity hover:opacity-70"
      >
        View all {num(total)}
      </button>
    )}
  </div>
);

// Sign-in health. Providers are compared, not summed: a single error count
// hides the case where one door is broken and the others are fine, which is
// exactly the case that happened.
const AuthHealth = ({ health, win }) => {
  const [expanded, setExpanded] = useState(null); // "messages" | "recent" | null
  const providers = health?.by_provider || [];
  const messages = health?.by_message || [];
  const recent = health?.recent || [];
  const lost = health?.lost || 0;
  // What fits without pushing the funnel below off the screen. Everything past
  // this is one click away, never dropped.
  const CAP = 5;

  if (!providers.length && !messages.length) {
    return (
      <p className="py-6 text-center text-[11px] text-text-muted">
        No sign-in attempts recorded in this window.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {providers.map((p) => {
          const rate = p.success_rate;
          // A provider with attempts but no successes still gets a visible
          // sliver, so "0%" and "no data" never look the same.
          const width = rate != null ? Math.max(rate * 100, p.started > 0 ? 1.5 : 0) : 0;
          // Below two thirds a door is failing, not merely imperfect. Stated as
          // a colour AND the word next to it — never colour alone.
          const bad = rate != null && rate < 0.66;
          return (
            <div
              key={p.provider}
              className="flex items-center gap-2 border-t border-ink/[0.05] py-2 first:border-t-0 sm:gap-3"
            >
              <p className="w-16 shrink-0 text-[11px] font-semibold capitalize text-text-primary sm:w-24">
                {p.provider}
              </p>
              <div className="min-w-0 flex-1">
                <div
                  className={`h-5 rounded-r-[4px] ${bad ? "bg-loss/70" : "bg-profit/60"}`}
                  style={{ width: `${width}%` }}
                  aria-hidden
                />
              </div>
              <p
                className={`w-12 shrink-0 text-right text-[13px] font-bold tabular-nums ${
                  bad ? "text-loss" : "text-text-primary"
                }`}
              >
                {rate != null ? `${Math.round(rate * 100)}%` : "—"}
              </p>
              <p className="w-24 shrink-0 text-right text-[10px] leading-tight text-text-muted sm:w-32">
                {num(p.success)}/{num(p.started)} people in
                {p.errors > 0 ? (
                  <>
                    {" · "}
                    <span className="text-loss">{num(p.errors)} hit error</span>
                  </>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Visitors hit</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
            {num(health?.visitors_hit)}
          </p>
        </div>
        <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Came back</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
            {num(health?.recovered)}
          </p>
        </div>
        <div
          className={`rounded-xl px-3 py-2.5 ${
            lost > 0
              ? "border border-loss/25 bg-loss/[0.06]"
              : "border border-ink/[0.06] bg-surface-secondary/40"
          }`}
        >
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Never got in</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              lost > 0 ? "text-loss" : "text-text-primary"
            }`}
          >
            {num(lost)}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-text-muted">
        Counted in people, not events, over the {win} window. "Came back" means that visitor
        signed in successfully at some point — including after this window, so a late success is
        never counted as a loss.
      </p>

      {messages.length > 0 && (
        <div>
          <ListHeader
            label="What failed · client's own words"
            total={messages.length}
            shown={CAP}
            onExpand={() => setExpanded("messages")}
          />
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {messages.slice(0, CAP).map((m, i) => (
              <div
                key={`${m.provider}-${m.message}-${i}`}
                className="flex items-start gap-2 rounded-lg bg-surface-secondary/40 px-2.5 py-1.5"
              >
                <span className="mt-[1px] w-16 shrink-0 text-[10px] capitalize text-text-muted">
                  {m.provider}
                </span>
                <span className="min-w-0 flex-1 break-words text-[11px] text-text-primary">
                  {m.message}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-[11px] font-semibold text-text-primary">
                    {num(m.visitors ?? m.n)} people
                  </span>
                  {(m.events || 0) > (m.visitors ?? m.n ?? 0) && (
                    <span className="block text-[9px] text-text-muted">
                      {num(m.events)} events
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <ListHeader
            label="Most recent"
            total={recent.length}
            shown={CAP}
            onExpand={() => setExpanded("recent")}
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {recent.slice(0, CAP).map((r, i) => (
              <div
                key={`${r.at}-${i}`}
                className="flex items-center gap-2 border-t border-ink/[0.04] py-1 first:border-t-0 text-[10px]"
              >
                <span className="w-28 shrink-0 tabular-nums text-text-muted">
                  {r.at ? new Date(r.at).toLocaleString() : "—"}
                </span>
                <span className="w-14 shrink-0 capitalize text-text-muted">{r.provider}</span>
                <span className="min-w-0 flex-1 truncate text-text-primary" title={r.message || ""}>
                  {r.message || "(no message)"}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-right text-text-muted sm:block">
                  {r.path}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded === "messages" && (
        <AuthDetailDialog title="What failed · all messages" onClose={() => setExpanded(null)}>
          <div className="space-y-1">
            {messages.map((m, i) => (
              <div
                key={`all-${m.provider}-${m.message}-${i}`}
                className="flex items-start gap-2 rounded-lg bg-surface-secondary/40 px-2.5 py-1.5"
              >
                <span className="mt-[1px] w-16 shrink-0 text-[10px] capitalize text-text-muted">
                  {m.provider}
                </span>
                <span className="min-w-0 flex-1 break-words text-[11px] text-text-primary">
                  {m.message}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-[11px] font-semibold text-text-primary">
                    {num(m.visitors ?? m.n)} people
                  </span>
                  {(m.events || 0) > (m.visitors ?? m.n ?? 0) && (
                    <span className="block text-[9px] text-text-muted">
                      {num(m.events)} events
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </AuthDetailDialog>
      )}

      {expanded === "recent" && (
        <AuthDetailDialog title="Most recent sign-in failures" onClose={() => setExpanded(null)}>
          <div className="space-y-0.5">
            {recent.map((r, i) => (
              <div
                key={`all-${r.at}-${i}`}
                className="flex items-center gap-2 border-t border-ink/[0.04] py-1.5 text-[10px] first:border-t-0"
              >
                <span className="w-32 shrink-0 tabular-nums text-text-muted">
                  {r.at ? new Date(r.at).toLocaleString() : "—"}
                </span>
                <span className="w-16 shrink-0 capitalize text-text-muted">{r.provider}</span>
                <span className="min-w-0 flex-1 break-words text-text-primary">
                  {r.message || "(no message)"}
                </span>
                <span className="w-40 shrink-0 truncate text-right text-text-muted">{r.path}</span>
              </div>
            ))}
          </div>
        </AuthDetailDialog>
      )}
    </div>
  );
};

// ── Signups over time ────────────────────────────────────────────────────
// Its own range, its own fetch. The tab window drives everything else on the
// page; making this chart share it meant a reader could never ask "what does
// the year look like" without moving every other number at the same time.

const SERIES = [
  { key: "google", label: "Google", color: "var(--viz-1)" },
  { key: "telegram", label: "Telegram", color: "var(--viz-2)" },
  { key: "discord", label: "Discord", color: "var(--viz-3)" },
  // A remainder, not a category: accounts old enough to predate auth_provider.
  // Grey keeps it visibly out of the comparison.
  { key: "other", label: "Other", color: "var(--viz-muted)" },
];

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: ALL_TIME },
];

const fmtBucket = (iso, bucket) => {
  const d = new Date(`${iso}T00:00:00Z`);
  // The apostrophe is load-bearing. A month bucket rendered "Feb 26" is
  // indistinguishable from a day bucket rendered "Aug 8" — the reader has no
  // way to know 26 is a year. "Feb '26" can only be read one way.
  if (bucket === "month") {
    return `${d.toLocaleDateString([], { month: "short", timeZone: "UTC" })} '${String(
      d.getUTCFullYear()
    ).slice(-2)}`;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
};

const SegBtn = ({ active, onClick, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
      active
        ? "bg-accent/15 text-text-primary"
        : "text-text-muted hover:bg-ink/[0.05] hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

const SignupsChart = () => {
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState("bar");
  const [split, setSplit] = useState(false);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    growthApi
      .getSignupsSeries(days)
      .then((d) => alive && (setRes(d), setErr(null)))
      .catch((e) => alive && setErr(e?.message || "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  // Real pixel geometry rather than percentage boxes: the line mode needs true
  // coordinates, and the hover has to map a mouse x back to a bucket exactly.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const series = res?.series || [];
  const bucket = res?.bucket || "day";
  const H = 190;
  const PAD_L = 30;
  const PAD_B = 20;
  const PAD_T = 10;
  const plotW = Math.max(w - PAD_L - 4, 10);
  const plotH = H - PAD_T - PAD_B;
  const max = Math.max(...series.map((p) => p.total), 1);
  // A round ceiling so the gridline labels are numbers a person would say.
  const ceil = (() => {
    const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
    return Math.ceil(max / (step / 2 || 1)) * (step / 2 || 1) || 1;
  })();
  const n = series.length;
  const bw = n ? plotW / n : 0;
  const xAt = (i) => PAD_L + bw * i + bw / 2;
  const yAt = (v) => PAD_T + plotH - (v / ceil) * plotH;
  // One accessor for both line modes: "total" when drawing a single line,
  // the provider key when drawing the split.
  const p_ = (pt, key) => (key === "total" ? pt?.total : pt?.[key]) || 0;

  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD_L;
    const i = Math.floor(x / bw);
    setHover(i >= 0 && i < n ? i : null);
  };

  const hp = hover != null ? series[hover] : null;
  // The final bucket is still being filled. On a month view that is the
  // difference between "growth collapsed" and "it is the 9th".
  const lastIdx = n - 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-ink/[0.04] p-0.5">
          {RANGES.map((r) => (
            <SegBtn key={r.label} active={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </SegBtn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/[0.04] p-0.5">
            <SegBtn active={mode === "bar"} onClick={() => setMode("bar")} title="Bars">
              Bar
            </SegBtn>
            <SegBtn active={mode === "line"} onClick={() => setMode("line")} title="Line">
              Line
            </SegBtn>
          </div>
          <SegBtn active={split} onClick={() => setSplit((s) => !s)} title="Split by auth provider">
            By provider
          </SegBtn>
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        {loading && !n ? (
          <div className="flex h-[190px] items-center justify-center">
            <Spinner />
          </div>
        ) : err ? (
          <p className="py-12 text-center text-[11px] text-loss">{err}</p>
        ) : !n ? (
          <p className="py-12 text-center text-[11px] text-text-muted">No signups in this range.</p>
        ) : (
          <>
            <svg
              width={w || 300}
              height={H}
              className="block select-none"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              {[0, 0.5, 1].map((t) => {
                const y = PAD_T + plotH - t * plotH;
                return (
                  <g key={t}>
                    <line
                      x1={PAD_L}
                      x2={w}
                      y1={y}
                      y2={y}
                      stroke="rgb(var(--ink) / 0.08)"
                      strokeWidth="1"
                    />
                    <text
                      x={PAD_L - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-text-muted text-[9px] tabular-nums"
                    >
                      {Math.round(ceil * t)}
                    </text>
                  </g>
                );
              })}

              {mode === "bar" &&
                series.map((p, i) => {
                  const gap = bw > 6 ? 2 : 0.5;
                  const x = PAD_L + bw * i + gap / 2;
                  const bwid = Math.max(bw - gap, 1);
                  if (!split) {
                    const h = (p.total / ceil) * plotH;
                    return (
                      <rect
                        key={p.bucket}
                        x={x}
                        y={PAD_T + plotH - h}
                        width={bwid}
                        height={Math.max(h, p.total > 0 ? 1.5 : 0)}
                        rx={Math.min(2, bwid / 2)}
                        fill="rgb(var(--accent))"
                        opacity={hover == null || hover === i ? (i === lastIdx ? 0.55 : 0.85) : 0.35}
                      />
                    );
                  }
                  // Stacked: a 2px surface gap between segments so adjacent
                  // fills never read as one solid block.
                  let acc = 0;
                  const dim = hover == null || hover === i ? 1 : 0.4;
                  return (
                    <g key={p.bucket} opacity={i === lastIdx ? dim * 0.6 : dim}>
                      {SERIES.map((s) => {
                        const v = p[s.key] || 0;
                        if (!v) return null;
                        const h = (v / ceil) * plotH;
                        const y = PAD_T + plotH - (acc / ceil) * plotH - h;
                        acc += v;
                        return (
                          <rect
                            key={s.key}
                            x={x}
                            y={y}
                            width={bwid}
                            height={Math.max(h - (bw > 6 ? 1.5 : 0), 1)}
                            fill={s.color}
                          />
                        );
                      })}
                    </g>
                  );
                })}

              {/* The run to the final point is dashed, because that bucket is
                  still filling. Bars show this by going pale; a solid line into
                  a half-finished day draws a cliff that is not there. */}
              {mode === "line" &&
                (split ? SERIES : [{ key: "total", color: "rgb(var(--accent))" }]).map((s) => {
                  const at = (i) => `${xAt(i)},${yAt(p_(series[i], s.key))}`;
                  const solid = series.slice(0, Math.max(n - 1, 1)).map((_, i) => `${i ? "L" : "M"}${at(i)}`).join(" ");
                  const tail = n > 1 ? `M${at(n - 2)} L${at(n - 1)}` : "";
                  return (
                    <g key={s.key}>
                      <path
                        d={solid}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {tail && (
                        <path
                          d={tail}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="2"
                          strokeDasharray="3 3"
                          strokeLinecap="round"
                        />
                      )}
                    </g>
                  );
                })}

              {hover != null && (
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={PAD_T}
                  y2={PAD_T + plotH}
                  stroke="rgb(var(--ink) / 0.25)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

              {series.map((p, i) => {
                // Label only what fits. Crowding every bucket produces a grey
                // smear that reads as texture, not as dates.
                const every = Math.max(1, Math.ceil(n / Math.max(Math.floor(plotW / 46), 2)));
                if (i % every !== 0 && i !== lastIdx) return null;
                return (
                  <text
                    key={p.bucket}
                    x={xAt(i)}
                    y={H - 6}
                    textAnchor="middle"
                    className="fill-text-muted text-[9px]"
                  >
                    {fmtBucket(p.bucket, bucket)}
                  </text>
                );
              })}
            </svg>

            {hp && (
              <div
                className="pointer-events-none absolute z-10 min-w-[132px] rounded-lg border border-ink/[0.1] bg-surface-raised p-2 shadow-xl"
                style={{
                  left: Math.min(Math.max(xAt(hover) - 66, 0), Math.max(w - 140, 0)),
                  top: 4,
                }}
              >
                <p className="text-[10px] font-semibold text-text-primary">
                  {fmtBucket(hp.bucket, bucket)}
                  {hover === lastIdx && (
                    <span className="ml-1 font-normal text-text-muted">· in progress</span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[15px] font-bold leading-none text-text-primary">
                  {num(hp.total)}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {SERIES.filter((s) => hp[s.key] > 0).map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="flex-1 text-[10px] text-text-muted">{s.label}</span>
                      <span className="font-mono text-[10px] font-semibold text-text-primary">
                        {num(hp[s.key])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Identity is never colour alone — the legend names every series, which
          is also what the light-mode aqua's sub-3:1 contrast obliges. */}
      {split && n > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              <span className="text-[10px] text-text-muted">{s.label}</span>
            </span>
          ))}
        </div>
      )}

      {n > 0 && (
        <p className="mt-2 text-[10px] text-text-muted/70">
          {num(res.total)} in view · {bucket === "day" ? "daily" : bucket === "week" ? "weekly" : "monthly"} buckets
          {" · last bucket still filling"}
        </p>
      )}
    </div>
  );
};

const CountryRows = ({ rows = [], unknown = 0, noun = "signups", emptyNote }) => {
  const known = rows.filter((r) => !isUnknownCountry(r.country));
  // SUM the unlocatable rows, don't take the first. More than one key lands
  // here -- "(unknown)" from our own backfill, plus Cloudflare's "T1" (Tor
  // exit) and "XX" -- and .find() would have dropped every one after the
  // first from both totals, quietly shrinking the denominator.
  const unknownRows = rows.filter((r) => isUnknownCountry(r.country));
  const unknownN = unknownRows.length
    ? unknownRows.reduce((a, r) => a + (r.n || 0), 0)
    : unknown || 0;

  const knownTotal = known.reduce((a, r) => a + (r.n || 0), 0);
  const grand = knownTotal + unknownN;
  const coverage = grand > 0 ? knownTotal / grand : null;

  if (!known.length) {
    return (
      <p className="py-4 text-center text-[11px] text-text-muted">
        {emptyNote || "Nothing recorded yet."}
      </p>
    );
  }

  // Scale to the largest COUNTRY, not to the unknown bucket.
  const max = Math.max(...known.map((r) => r.n || 0), 1);

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-2 text-[10.5px] text-text-muted">
        <span>
          <span className="font-semibold tabular-nums text-text-primary">
            {num(knownTotal)}
          </span>{" "}
          located · {known.length} countries
        </span>
        {unknownN > 0 && (
          <span
            title={`${num(unknownN)} ${noun} have no country. Geo is read from the request IP at the time of the event, so anything recorded before it shipped has none.`}
          >
            {coverage != null ? pct(coverage) : "—"} coverage
          </span>
        )}
      </div>

      {/* Every country, in a fixed-height scroller. Paging to 10 with a
          "show more" button pushed the rest of the tab down the screen once
          opened, and the three columns ended up wildly different heights. */}
      <div className="max-h-[19rem] space-y-1.5 overflow-y-auto pr-1.5">
        {known.map((r) => {
          const name = countryName(r.country);
          const share = knownTotal ? r.n / knownTotal : 0;
          return (
            <div key={r.country} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-[12px] leading-none" aria-hidden="true">
                {flagEmoji(r.country)}
              </span>
              <p
                className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-text-primary"
                title={`${name} (${r.country})`}
              >
                {name}
                <span className="ml-1 text-[9.5px] text-text-muted">{r.country}</span>
              </p>
              <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink/[0.06] sm:w-24">
                <div
                  className="h-full rounded-full bg-accent/60"
                  style={{ width: `${Math.max((r.n / max) * 100, 3)}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-text-primary">
                {num(r.n)}
              </span>
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
                {pct(share)}
              </span>
            </div>
          );
        })}
      </div>

      {unknownN > 0 && (
        <p className="mt-2 border-t border-ink/[0.06] pt-2 text-[10px] leading-snug text-text-muted">
          <span className="font-semibold tabular-nums">{num(unknownN)}</span> with no
          country — kept out of the ranking above so it cannot set the scale.
        </p>
      )}
    </div>
  );
};

const XMark = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// A logo where we have one, a neutral dot where we do not. The mark is a
// second channel beside the name — it is never the only thing identifying a
// row, so an unrecognised source is not a worse row, just a plainer one.
const SOURCE_MARKS = {
  telegram: TelegramIcon,
  google: GoogleIcon,
  discord: DiscordIcon,
  x: XMark,
  twitter: XMark,
};

// Display names for raw source keys, matching the labels the API already
// returns on signups-by-source so the two lists agree.
const SOURCE_LABELS = {
  telegram: "Telegram",
  google: "Google",
  discord: "Discord",
  x: "X (Twitter)",
  twitter: "X (Twitter)",
};

// The backend's placeholders for "nothing was recorded". Shown as "Other" —
// this is the untagged residue (someone typed the address, or arrived without a
// UTM), not a source we know and are declining to name.
const EMPTY_KEYS = new Set(["(unknown)", "(none)", "unknown", "none", "", "null"]);
const OTHER = "Other";
const sourceLabel = (raw) => {
  const s = String(raw ?? "").trim();
  if (EMPTY_KEYS.has(s.toLowerCase())) return OTHER;
  return SOURCE_LABELS[s.toLowerCase()] || s;
};

// ── CTA style keys ───────────────────────────────────────────────────────
// utm_content arrives as "<coin>_<style>" — caption_builder._startapp writes
// "{event}_{coin}_{key}" into the Telegram start_param, and telegram_auth
// splits the event off as the campaign, leaving coin+key behind. Grouping by
// the style answers the question the per-coin rows cannot: which wording works.
//
// This must be a KNOWN key list matched as a suffix, never "strip the first
// underscore token". Half these keys contain an underscore themselves, so the
// naive split turns a bare "wr_coin" into "coin" and "how_far" into "far" —
// filing the same button under two different names. Longest match wins so
// "cetus_wr_coin" resolves to wr_coin rather than any shorter tail.
//
// Source of truth: FREE_CTA_RECORD / FREE_CTA_PLAIN / ASK_ADMIN_* / BUY_CTA in
// /root/luxquant-x-poster/caption_builder.py (the live poster) plus the older
// backend/scripts copy. Labels are the buttons' own text, so a reader of this
// panel sees what the button actually said.
// Short enough for the name column, and with the templates resolved: the raw
// button text carries "${coin} {wr}%" placeholders that the poster fills at
// send time, and printing those unrendered here looks like a broken string.
// The "— free" tail is on almost every free-row button, so it distinguishes
// nothing and only costs width.
const CTA_STYLE_LABELS = {
  results: "See full results",
  wr_coin: "Coin win rate",
  how_far: "How far winners run",
  terminal: "Open free terminal",
  record: "Open track record",
  one_tap: "Free account · record",
  how_call: "How we call these",
  ask_coin: "Message us about coin",
  why_coin: "Ask why we called it",
  q_coin: "Questions on coin?",
  ask_call: "Message us about this",
  ask_admin: "Questions? Message us",
  entries: "VIP — live entry + data",
  full_rt: "VIP: realtime data",
  next_live: "Join VIP — next run",
  how_works: "See how it works",
  vip_what: "What VIP actually gets you",
  vip_inside: "Inside VIP",
  vip_gets: "What members get",
  vip_see: "See what VIP gets",
};
const CTA_STYLES = Object.keys(CTA_STYLE_LABELS).sort((a, b) => b.length - a.length);

const splitContent = (raw) => {
  const s = String(raw ?? "").trim().toLowerCase();
  const style = CTA_STYLES.find((k) => s === k || s.endsWith(`_${k}`));
  if (!style) return { style: s, coin: null, known: false };
  return {
    style,
    coin: s === style ? null : s.slice(0, -(style.length + 1)).toUpperCase(),
    known: true,
  };
};

const SourceMark = ({ source }) => {
  const key = String(source || "").toLowerCase().split(/[\s·(]/)[0];
  const Mark = SOURCE_MARKS[key];
  if (!Mark) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-ink/[0.18]" aria-hidden />;
  }
  return <Mark size={13} colored className="h-3.5 w-3.5 shrink-0" aria-hidden />;
};

// Three bare number tiles said which provider was biggest only if you did the
// arithmetic. A share bar says it before you read a digit — and this is the
// panel where that matters most, since Telegram converts ~2.2x Google.
const ProviderSplit = ({ byProvider = {}, referred = 0 }) => {
  const rows = [
    { k: "google", label: "Google", Icon: GoogleIcon, color: "var(--viz-1)" },
    { k: "telegram", label: "Telegram", Icon: TelegramIcon, color: "var(--viz-2)" },
    { k: "discord", label: "Discord", Icon: DiscordIcon, color: "var(--viz-3)" },
  ].map((r) => ({ ...r, n: Number(byProvider?.[r.k] || 0) }));
  const total = rows.reduce((a, r) => a + r.n, 0);
  const max = Math.max(...rows.map((r) => r.n), 1);

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center gap-2.5">
            <r.Icon size={15} colored className="h-4 w-4 shrink-0" aria-hidden />
            <p className="w-16 shrink-0 text-[11.5px] font-medium text-text-primary">{r.label}</p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max((r.n / max) * 100, r.n > 0 ? 2 : 0)}%`, background: r.color }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[12px] font-semibold text-text-primary">
              {num(r.n)}
            </span>
            <span className="w-9 text-right text-[10px] tabular-nums text-text-muted">
              {total ? `${Math.round((r.n / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-ink/[0.05] pt-2.5">
        <span className="text-[11px] text-text-muted">Referred signups</span>
        <span className="font-mono text-[13px] font-semibold text-text-primary">{num(referred)}</span>
      </div>
    </div>
  );
};

const SourceRows = ({ rows = [], limit = null, emptyNote }) => {
  if (!rows.length) {
    return (
      <p className="py-4 text-center text-[11px] text-text-muted">
        {emptyNote || "No CTA clicks tracked yet."}
      </p>
    );
  }
  // Scale to the largest row in the FULL set, not the capped slice, so a bar's
  // length means the same thing on the card as it does in the dialog.
  const max = Math.max(...rows.map((r) => r.n), 1);
  const total = rows.reduce((a, r) => a + (r.n || 0), 0);
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="space-y-2">
      {shown.map((r) => (
        <div key={r.source} className="flex items-center gap-2.5">
          <SourceMark source={r.source} />
          <div className="w-28 min-w-0 sm:w-36">
            <p
              className="truncate text-[11.5px] font-medium text-text-primary"
              title={r.title || r.source}
            >
              {r.source}
            </p>
            {r.note && (
              <p className="truncate text-[10px] text-text-muted" title={r.title || r.note}>
                {r.note}
              </p>
            )}
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full bg-accent/60"
              style={{ width: `${Math.max((r.n / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-9 text-right text-[12px] font-semibold tabular-nums text-text-primary">
            {num(r.n)}
          </span>
          <span className="w-10 text-right text-[10px] tabular-nums text-text-muted">
            {total ? `${Math.round((r.n / total) * 100)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

export const ConversionTab = () => {
  const [days, setDays] = useState(30);
  const [geoView, setGeoView] = useState("visitors");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Which drill-down dialog is open, by key. One slot: opening a second closes
  // the first, so dialogs can never stack up behind each other.
  const [drill, setDrill] = useState(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await growthApi.getConversion(days);
        setData(res);
      } catch (e) {
        console.error("Failed to load conversion:", e);
        setError(e?.response?.data?.detail || e?.message || "Failed to load conversion data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} />
      </div>
    );
  }

  const u = data?.users || {};
  const fun = data?.funnel_events || {};
  const rates = data?.rates || {};
  const act = data?.activity || {};
  const ctaSources = data?.cta_by_source || [];
  const daily = u.daily_signups || [];
  const authHealth = data?.auth_health || {};
  const acq = data?.acquisition || {};
  const acqBySource = acq.by_source || [];
  const acqByCampaign = acq.by_campaign || [];
  const acqByContent = acq.by_content || [];
  const acqLand = acq.land_by_source || [];
  const acqLandByButton = acq.land_by_button || [];

  // Clicks that ARRIVED, grouped by the button that sent them. This is the only
  // measurement the VIP button can ever have: apply_acq_to_user writes acq_*
  // once, on first touch, and the VIP button exists to convert people who
  // already have an account — so a VIP click can never show up in signup
  // attribution however well it works.
  const landByStyle = (() => {
    const m = new Map();
    acqLandByButton.forEach((r) => {
      const { style, coin, known } = splitContent(r.content);
      const e = m.get(style) || { style, known, n: 0, coins: new Set() };
      e.n += r.n || 0;
      if (coin) e.coins.add(coin);
      m.set(style, e);
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  })();

  const landRows = landByStyle.map((e) => {
    const label = CTA_STYLE_LABELS[e.style] || e.style;
    const parts = [];
    if (label !== e.style) parts.push(e.style);
    if (e.coins.size) parts.push(`${e.coins.size} coins`);
    return {
      source: label,
      note: parts.join(" · ") || null,
      title: e.coins.size ? `${e.style} — ${[...e.coins].join(", ")}` : e.style,
      n: e.n,
    };
  });

  const landRawRows = acqLandByButton.map((r) => ({
    source: r.content,
    note: r.campaign && r.campaign !== "(none)" ? r.campaign : null,
    n: r.n,
  }));

  // One shape for all four acquisition lists, so the card, the "view all"
  // header and the drill-down dialog all read from the same place and cannot
  // drift apart.
  // Landing-CTA ids are already human ("sticky_mobile"); this only catches the
  // empty placeholders so they read as Other here too.
  const ctaRows = ctaSources.map((r) => ({ source: sourceLabel(r.source), n: r.n }));

  const ACQ_CAP = 6;

  // Every per-coin variant of the same button folded onto its style. Fifteen
  // rows that each said "1" could not answer which wording earns the click;
  // five rows that say "5, 4, 2, 1, 1" can.
  const contentByStyle = (() => {
    const m = new Map();
    acqByContent.forEach((r) => {
      const { style, coin, known } = splitContent(r.content);
      const e = m.get(style) || { style, known, n: 0, coins: [] };
      e.n += r.n || 0;
      if (coin) e.coins.push(coin);
      m.set(style, e);
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  })();

  const contentRows = contentByStyle.map((e) => {
    const label = CTA_STYLE_LABELS[e.style] || e.style;
    // The raw key stays visible under the label: it is what the poster writes
    // and what anyone grepping caption_builder will search for. When there is
    // no friendly label the key is already the name, so repeating it as a
    // subtitle just prints the same word twice.
    const parts = [];
    if (label !== e.style) parts.push(e.style);
    if (e.coins.length) parts.push(`${e.coins.length} coins`);
    return {
      source: label,
      note: parts.join(" · ") || null,
      title: e.coins.length ? `${e.style} — ${e.coins.join(", ")}` : e.style,
      n: e.n,
    };
  });

  // The ungrouped truth, for the dialog. Same rows, lid off.
  const contentRawRows = acqByContent.map((r) => ({
    source: r.content,
    note: r.campaign && r.campaign !== "(none)" ? sourceLabel(r.campaign) : null,
    n: r.n,
  }));

  const ACQ_LISTS = [
    {
      key: "acq-source",
      label: "Signups by source",
      empty: "No attributed signups yet — starts after deploy + UTM traffic.",
      rows: acqBySource.map((r) => ({ source: sourceLabel(r.label || r.source), n: r.n })),
    },
    {
      key: "acq-land",
      label: "Visits before signup",
      empty: "No tagged visits yet.",
      // Signups-by-source carries a display label from the API; this list only
      // has the raw key, so "telegram" sat directly beside "Telegram" one
      // column over and read as two different things.
      rows: acqLand.map((r) => ({ source: sourceLabel(r.source), n: r.n })),
    },
    {
      key: "acq-campaign",
      label: "By campaign (utm_campaign)",
      empty: "No campaign-tagged signups yet.",
      rows: acqByCampaign.map((r) => ({
        source: `${r.campaign}${r.source ? ` · ${sourceLabel(r.source)}` : ""}`,
        n: r.n,
      })),
    },
    {
      key: "acq-land-button",
      label: "Clicks by button",
      empty: "No tagged landings yet.",
      rows: landRows,
      drillRows: landRawRows,
      drillLabel: "Every button click · by campaign",
    },
    {
      key: "acq-content",
      label: "Signups by button style",
      empty: "No content-tagged signups yet.",
      rows: contentRows,
      drillRows: contentRawRows,
      drillLabel: "Button style · every coin variant",
    },
  ];
  const drillList = ACQ_LISTS.find((l) => l.key === drill);
  const geo = data?.geo || {};
  const geoSignups = geo.signups_by_country || [];
  const geoVisitors = geo.visitors_by_country || [];
  const geoLanding = geo.landing_by_country || [];

  // Three different units. Labelled as such, and never added together.
  const GEO_VIEWS = [
    {
      key: "visitors",
      label: "All visits",
      tip: "visitors",
      rows: geoVisitors,
      note:
        "Unique visitors by IP hash across every tracked event — landing views included. " +
        "This is the widest view of who reached us.",
    },
    {
      key: "landing",
      label: "Landing views",
      tip: "landing views",
      rows: geoLanding,
      note:
        "Raw landing_view / acq_land events — page opens, not people, so one visitor can " +
        "appear several times. A subset of the events behind All visits, which is why the " +
        "two are never added together.",
    },
    {
      key: "signups",
      label: "Signups",
      tip: "signups",
      rows: geoSignups,
      note: "Accounts created in the window, by first-touch country.",
    },
  ];
  const geoActive = GEO_VIEWS.find((v) => v.key === geoView) || GEO_VIEWS[0];
  const isAllTime = days >= ALL_TIME;
  // "3650d window" would be nonsense on screen.
  const win = isAllTime ? "all time" : `${days}d`;
  const geoActiveUnknown = (geoActive.rows || [])
    .filter((r) => isUnknownCountry(r.country))
    .reduce((a, r) => a + (r.n || 0), 0);

  // Sessions, not raw events. One visitor refreshing five times used to move
  // these numbers; now they cannot.
  const gf = data?.global_funnel || {};
  const gfr = gf.rates || {};
  const rails = gf.rails || [];
  const thr = data?.funnel_threaded || {};
  const fsess = data?.funnel_sessions || {};
  const fwin = data?.funnel_window || {};

  const softShown = fsess.soft_gate_shown || 0;
  const softClick = fsess.soft_gate_login_click || 0;
  const softCtr = softShown > 0 ? softClick / softShown : null;
  // A rate off a handful of observations is mostly noise: at n=9 the 95%
  // interval on "55.6%" spans roughly 25–85%. Printed to one decimal it reads
  // as a firm measurement and invites decisions it cannot support. Below this
  // many observations the tile leads with the raw ratio and keeps the percent
  // as a footnote — nothing hidden, nothing overstated.
  const RATE_MIN_N = 30;
  const softThin = softShown > 0 && softShown < RATE_MIN_N;

  // Signups vs the equal window before it. Guarded on a zero base, where a
  // percentage change has no meaning (any growth from nothing is infinite).
  const prevSignups = u.prev_signups;
  const signupDelta =
    prevSignups == null || prevSignups === 0
      ? null
      : { pct: (u.signups - prevSignups) / prevSignups, note: `vs prior ${days}d · ${num(prevSignups)}` };
  const signupTrend = daily.map((d) => d.signups);

  // The tiles above really do cover `days`; funnel_events only has history
  // since tracking shipped. Saying so is the difference between a reader
  // comparing like with like and one comparing 30 days against 34 hours.
  const funnelScope = (() => {
    if (!fwin.first_at) return "No events collected in this window yet.";
    const since = new Date(fwin.first_at).toLocaleString([], {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const span =
      fwin.hours >= 48
        ? `${Math.round(fwin.hours / 24)}d of data`
        : `${fwin.hours}h of data`;
    return fwin.covers_full_window
      ? `Unique sessions followed through the sequence · data since ${since} (${span}).`
      : `Unique sessions followed through the sequence · data since ${since} — only ${span}, shorter than the ${win} window above.`;
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Users · Acquisition quality
          </p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Login conversion
          </h2>
          <p className="mt-0.5 max-w-xl text-[12px] text-text-muted">
            Landing → CTA → auth → account quality. First-touch UTM (Telegram channel, X, etc.) on new signups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-ink/[0.08] bg-surface-raised p-0.5"
            role="group"
            aria-label="Window"
          >
            {[
              { d: 7, label: "7d" },
              { d: 14, label: "14d" },
              { d: 30, label: "30d" },
              { d: ALL_TIME, label: "All time" },
            ].map(({ d, label }) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  days === d
                    ? "bg-ink/[0.08] text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
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
      </div>

      {error && (
        <div className="rounded-xl border border-loss/25 bg-loss/10 px-4 py-3 text-[12px] text-loss">
          {error}
        </div>
      )}

      {/* Headline KPIs — five tiles, not six, and not all the same weight.
          Signups leads because every other figure here is a fraction of it, so
          it gets the wide slot, the trend and the comparison.

          "One-shot rate" and "multi-login rate" used to sit side by side as
          equals; they are complements that always sum to 100%, so the pair spent
          a third of the row saying one thing twice. Merged into "Came back",
          which states the fact once and keeps both counts underneath.

          The icons are gone. Three of the six were the same person glyph and two
          were the same up-arrow — they distinguished nothing, and an up-arrow on
          a rate that is not a trend actively misleads. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Signups"
          value={num(u.signups)}
          accent="muted"
          emphasis
          delta={signupDelta}
          trend={signupTrend}
          sub={`${win} window`}
          className="col-span-2"
        />
        <StatTile
          label="Came back"
          value={pct(u.multi_login_rate)}
          accent="muted"
          sub={`${num(u.signups_multi_login)} returned · ${num(u.signups_one_shot)} one-shot`}
        />
        <StatTile
          label="Active accounts"
          value={num(u.any_login_window)}
          accent="muted"
          sub={`${num(u.login_7d)} in 7d · ${num(u.login_24h)} in 24h`}
        />
        <StatTile
          label="WAU activity"
          value={num(act.wau)}
          accent="muted"
          sub={`DAU ${num(act.dau)} · MAU ${num(act.mau)}`}
        />
        <StatTile
          label="Soft-gate CTR"
          value={softThin ? `${num(softClick)} / ${num(softShown)}` : pct(softCtr)}
          accent="muted"
          sub={
            softThin
              ? `${pct(softCtr)} — too few to rate yet`
              : `${num(softClick)} of ${num(softShown)} shown`
          }
        />
      </div>

      {/* Client funnel steps */}
      <Panel title="Client funnel" sub={funnelScope}>
        <FunnelFlow
          steps={[
            { label: "Landed", value: thr.landed },
            {
              label: "Clicked CTA",
              value: thr.cta,
              sub: rates.cta_per_landing != null ? `${pct(rates.cta_per_landing)} of landed` : null,
            },
            {
              label: "Auth start",
              value: thr.started,
              sub:
                rates.auth_start_per_cta != null
                  ? `${pct(rates.auth_start_per_cta)} of clickers`
                  : null,
            },
            {
              // Was labelled "Account created". It never was: auth_success
              // fires on every successful authentication from seven call sites,
              // returning users included. Measured 2026-08-09 — 41 accounts
              // actually created against 72 sessions reporting success.
              label: "Signed in",
              value: thr.success,
              sub:
                rates.auth_success_per_start != null
                  ? `${pct(rates.auth_success_per_start)} of starts`
                  : null,
            },
            {
              label: "New account",
              value: thr.new_account ?? 0,
              sub:
                thr.success > 0
                  ? `${pct((thr.new_account || 0) / thr.success)} of sign-ins`
                  : null,
            },
          ]}
        />
        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          {rates.account_per_landing != null && (
            <>
              End to end:{" "}
              <span className="font-semibold tabular-nums text-text-primary">
                {pct(rates.account_per_landing)}
              </span>{" "}
              of landing sessions reached a sign-in.{" "}
            </>
          )}
          New-account tracking starts 9 Aug — earlier sessions carry no flag and
          count as zero here, so this stage fills in from today forward.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Auth page views</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(fun.auth_page_view)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Visitors with auth error
            </p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(authHealth?.visitors_hit)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Post-login land</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(fun.post_login_land)}
            </p>
          </div>
        </div>
      </Panel>

      {/* Sign-in health sits here, between the funnel step it belongs to and
          the money panel: an auth failure is the last thing that happens before
          an account exists, so a broken door shows up as a funnel that narrows
          at "account created" and nowhere else. */}
      <Panel
        title="Sign-in health"
        sub={`Per provider · ${win} window. One broken door is invisible in a single error count — compare them.`}
      >
        <AuthHealth health={authHealth} win={win} />
      </Panel>

      {/* Where the money actually leaks. Kept as its own panel, and measured in
          ACCOUNTS over the `days` window — the panel above counts anonymous
          SESSIONS over however much history funnel_events has. Chaining the two
          into one end-to-end percentage would be the same error as dividing
          event counts by event counts: a number that looks conclusive and is
          not comparable. The seam is stated instead of hidden. */}
      <Panel
        title="Global funnel · accounts to revenue"
        sub={`Accounts, not sessions · ${win} window. Separate measurement from the panel above — do not multiply the two.`}
      >
        <FunnelFlow
          steps={[
            { label: "Signed up", value: gf.signups },
            {
              label: "Came back (2+ logins)",
              value: gf.activated,
              sub:
                gfr.activated_per_signup != null
                  ? `${pct(gfr.activated_per_signup)} of signups`
                  : null,
            },
            {
              label: "Tried to pay",
              value: gf.intent_users,
              sub:
                gfr.intent_per_signup != null ? `${pct(gfr.intent_per_signup)} of signups` : null,
            },
            {
              label: "Paid",
              value: gf.paid_users,
              sub:
                gfr.paid_per_intent != null
                  ? `${pct(gfr.paid_per_intent)} of those who tried`
                  : null,
            },
          ]}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Collected · {win}
            </p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-profit">
              ${num(Math.round(gf.revenue_usdt || 0))}
            </p>
          </div>
          <div className="rounded-xl border border-loss/25 bg-loss/[0.06] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Abandoned · {win}
            </p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-loss">
              ${num(Math.round(gf.abandoned_usdt || 0))}
            </p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {num(gf.failed_attempts)} expired or cancelled attempts
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Paid twice · lifetime
            </p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(gf.repeat_payers_lifetime)} / {num(gf.ever_paid_lifetime)}
            </p>
            {!isAllTime && (
              <p className="mt-0.5 text-[10px] text-text-muted">
                Lifetime, not {days}d — plans run monthly or longer, so a 30-day
                renewal count would read zero by construction.
              </p>
            )}
          </div>
        </div>

        {rails.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
              Payment rails
            </p>
            <div className="space-y-1.5">
              {rails.map((r) => {
                const total = (r.paid || 0) + (r.failed || 0);
                const ok = total ? r.paid / total : 0;
                return (
                  <div
                    key={`${r.method}-${r.network}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2"
                  >
                    <span className="font-mono text-[11px] text-text-primary">
                      {r.method} · {r.network}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-text-muted">
                      <span className="text-profit">{num(r.paid)}</span> paid ·{" "}
                      <span className="text-loss">{num(r.failed)}</span> failed ·{" "}
                      {pct(ok)}
                    </span>
                  </div>
                );
              })}
            </div>
            {rails.length === 1 && (
              <p className="mt-2 text-[11px] leading-snug text-text-muted">
                One rail only. Everyone who wants to pay must hold USDT on this
                exact network and send it themselves — there is no fallback, so
                every failure above had nowhere else to go.
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* Geo — CF-IPCountry: accounts + anonymous landing */}
      <Panel
        title="Location (auto from IP)"
        sub="Cloudflare CF-IPCountry — no profile form. Covers landing visitors and signed-up users."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-ink/[0.08] bg-surface-raised p-0.5"
            role="group"
            aria-label="Map data"
          >
            {GEO_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setGeoView(v.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  geoView === v.key
                    ? "bg-ink/[0.08] text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="max-w-xl text-[10.5px] leading-snug text-text-muted">
            {geoActive.note}
          </p>
        </div>

        <div className="mb-4">
          <Suspense
            fallback={
              <div className="flex h-[340px] items-center justify-center rounded-xl border border-ink/[0.06] bg-surface-secondary/30">
                <span className="text-[11px] text-text-muted">Loading map…</span>
              </div>
            }
          >
            <WorldMapPanel
              key={geoActive.key}
              rows={geoActive.rows}
              unknown={geoActiveUnknown}
              title={geoActive.tip}
            />
          </Suspense>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Signups known</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(geo.signups_known)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Signups unknown</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(geo.signups_unknown)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Visitors known</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(geo.visitors_known)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Window</p>
            {/* The geo block can cover less than the tab's range — showing the
                tab's number here would claim a month of data over a few days. */}
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {geo.clamped ? "since tracking" : isAllTime ? "All" : `${days}d`}
            </p>
          </div>
        </div>

        {geo.clamped && (
          <p className="mb-4 text-[11px] leading-snug text-text-muted">
            Location capture started{" "}
            <span className="font-semibold text-text-primary">{geo.tracking_started}</span>, so this
            panel covers only from that date — every visit in it has a country. Visits before then
            were never geolocated and cannot be recovered, which is why they are excluded rather
            than shown as unknown. Coverage widens on its own as the {isAllTime ? "" : `${days}-day `}
            window moves past that date.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-[11px] font-semibold text-text-muted">
              Signups by country
            </p>
            <CountryRows
              rows={geoSignups}
              unknown={geo.signups_unknown || 0}
              noun="signups"
              emptyNote="No signup geo yet — fills on login /auth/me after deploy."
            />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold text-text-muted">
              Unique visitors (any page)
            </p>
            <CountryRows
              rows={geoVisitors}
              noun="visitors"
              emptyNote="No funnel visitor geo yet."
            />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold text-text-muted">
              Landing / acq events
            </p>
            <CountryRows
              rows={geoLanding}
              noun="events"
              emptyNote="No landing_view/acq_land with country yet."
            />
          </div>
        </div>
      </Panel>

      {/* Acquisition — TG channel buttons, X profile, landing UTM */}
      <Panel
        title="Acquisition sources"
        sub="First-touch on signup (utm_source / social referrer). TG free buttons tag utm_source=telegram."
      >
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Attributed</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(acq.attributed)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            {/* Same 248 as the "Other" row in the list below — labelling the
                tile "Unknown" and the row "Other" made one number look like
                two. */}
            <p className="text-[10px] uppercase tracking-wider text-text-muted">{OTHER}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(acq.unknown)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Tagged visits</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {num(fun.acq_land)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Window</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">
              {isAllTime ? "All" : `${days}d`}
            </p>
          </div>
        </div>
        {/* Four lists, one grid, every list capped to the same depth. Before,
            each column ran to its natural length: "by content" had fifteen rows
            and "by campaign" three, so the left half of the panel was a third
            content and two thirds blank. Capping equally is what makes the
            quadrants square — the remainder is not dropped, it moves one click
            deeper and the header says how many are waiting there. */}
        {/* Columns, not a grid. A 2x2 grid forces both cells in a row to the
            height of the taller one, so a three-row list beside a six-row list
            leaves three rows of nothing. Multi-column flow packs the blocks
            instead, and the panel ends where the content does. */}
        <div className="gap-x-6 sm:columns-2">
          {ACQ_LISTS.map((l) => (
            <div key={l.key} className="mb-5 break-inside-avoid last:mb-0">
              {/* Count the rows the dialog would show, not the rows on the
                  card. The grouped style list is five rows long but stands for
                  fifteen, and "View all 5" beside five visible rows is an
                  offer to see nothing. */}
              <ListHeader
                label={l.label}
                total={(l.drillRows || l.rows).length}
                shown={Math.min(ACQ_CAP, l.rows.length)}
                onExpand={() => setDrill(l.key)}
              />
              <SourceRows rows={l.rows} limit={ACQ_CAP} emptyNote={l.empty} />
            </div>
          ))}
        </div>
      </Panel>

      {/* The chart carries its own range control, so it is deliberately NOT
          labelled with the tab's window — it is the one thing on this page that
          does not answer to it. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Signups over time" sub="New accounts · own range">
          <SignupsChart />
        </Panel>
        <Panel
          title="CTA sources"
          sub="Where landing clicks come from"
          onExpand={ctaSources.length ? () => setDrill("cta") : undefined}
        >
          <SourceRows rows={ctaRows} limit={8} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Signup by provider" sub="Auth method on new accounts">
          <ProviderSplit byProvider={u.by_provider} referred={u.referred} />
        </Panel>

        <Panel title="Soft gate" sub="Top Gainers free preview limit (landing)">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Shown</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{num(softShown)}</p>
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Login click</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{num(softClick)}</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full bg-accent/60"
              style={{ width: `${Math.min((softCtr || 0) * 100, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
            {softThin
              ? `Only ${num(softShown)} impressions so far — too few to judge against the 25% target.`
              : "Target CTR ≥ 25%. Low CTR → improve offer copy; high shown + low signups → auth friction."}
          </p>
        </Panel>
      </div>

      {drillList && (
        <AuthDetailDialog
          title={drillList.drillLabel || drillList.label}
          onClose={() => setDrill(null)}
        >
          <SourceRows
            rows={drillList.drillRows || drillList.rows}
            emptyNote={drillList.empty}
          />
        </AuthDetailDialog>
      )}
      {drill === "cta" && (
        <AuthDetailDialog title="CTA sources" onClose={() => setDrill(null)}>
          <SourceRows rows={ctaRows} />
        </AuthDetailDialog>
      )}

      <p className="text-center text-[10px] text-text-muted">
        As of {data?.as_of ? new Date(data.as_of).toLocaleString() : "—"} · window{" "}
        {data?.all_time ? "all time" : `${data?.window_days ?? days}d`}
        · SQL pack: docs/growth/conversion-weekly.sql
      </p>
    </div>
  );
};

export default ConversionTab;
