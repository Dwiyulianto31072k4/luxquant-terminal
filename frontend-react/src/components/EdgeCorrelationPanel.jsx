// EdgeCorrelationPanel — LEARN FROM THE PAST → score live desk calls.
// UX: progressive disclosure — simple story first, full numbers on expand.
// API: GET /analytics/edge-correlation + edge-score-backtest (Redis ~10m).

import { useEffect, useMemo, useState } from "react";
import EChart from "./charts/EChart";
import CoinLogo from "./CoinLogo";

const API_BASE = import.meta.env.VITE_API_URL || "";

function niceTag(t) {
  return String(t || "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function baseSymbol(pair) {
  return String(pair || "")
    .replace(/USDT$/i, "")
    .replace(/\/.*$/, "")
    .toUpperCase();
}

function authHeaders() {
  try {
    const tok =
      localStorage.getItem("access_token") || localStorage.getItem("token");
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

const RANK_STATUS = [
  { id: "open", label: "Open now", hint: "Live calls you can still take" },
  { id: "tp1", label: "TP1+", hint: "Already hit at least TP1" },
  { id: "tp2", label: "TP2+", hint: "Hit TP2 / TP3 / TP4" },
  { id: "full", label: "Full TP", hint: "TP3 or TP4" },
  { id: "sl", label: "SL", hint: "Stopped out" },
  { id: "all", label: "All on desk", hint: "Every scored desk row" },
];

const RANK_SORT = [
  { id: "edge_desc", label: "Edge ↓", hint: "Highest Edge first" },
  { id: "edge_asc", label: "Edge ↑", hint: "Lowest Edge first" },
  { id: "lift_desc", label: "Better than avg", hint: "Best tag lift" },
  { id: "full_desc", label: "Full targets", hint: "Historically fuller TP" },
  { id: "called_desc", label: "Newest", hint: "Most recent calls" },
  { id: "pair_asc", label: "A–Z", hint: "Pair name" },
];

const HISTORY_OPTS = [
  { id: 0, label: "Full history", short: "Full" },
  { id: 90, label: "Last 90 days", short: "90d" },
  { id: 30, label: "Last 30 days", short: "30d" },
];

function statusMatches(status, filter) {
  const st = String(status || "").toLowerCase();
  if (filter === "all") return true;
  if (filter === "open") return st === "open";
  if (filter === "tp1") return ["tp1", "tp2", "tp3", "tp4"].includes(st);
  if (filter === "tp2") return ["tp2", "tp3", "tp4"].includes(st);
  if (filter === "full") return st === "tp3" || st === "tp4";
  if (filter === "sl") return st === "sl" || st === "closed_loss";
  return true;
}

function statusBadgeCls(status) {
  const st = String(status || "").toLowerCase();
  if (st === "open") return "bg-accent/12 text-accent border-accent/25";
  if (st === "tp4" || st === "tp3") return "bg-positive/12 text-positive border-positive/25";
  if (st === "tp1" || st === "tp2") return "bg-positive/8 text-positive/90 border-positive/20";
  if (st === "sl" || st === "closed_loss") return "bg-loss/12 text-loss border-loss/25";
  return "bg-ink/[0.05] text-text-muted border-ink/10";
}

const WIN = new Set(["closed_win", "tp1", "tp2", "tp3", "tp4"]);
const LOSS = new Set(["closed_loss", "sl"]);

function isResolvedWin(status) {
  return WIN.has(String(status || "").toLowerCase());
}
function isResolvedLoss(status) {
  return LOSS.has(String(status || "").toLowerCase());
}
function isResolved(status) {
  const st = String(status || "").toLowerCase();
  return WIN.has(st) || LOSS.has(st);
}

function pct(n, d) {
  if (!d) return null;
  return Math.round((1000 * n) / d) / 10;
}

function verdictUi(v) {
  if (v === "holds")
    return {
      label: "Works",
      cls: "border-positive/30 bg-positive/12 text-positive",
      card: "border-positive/25 bg-positive/[0.06]",
    };
  if (v === "partial")
    return {
      label: "Partial",
      cls: "border-accent/30 bg-accent/12 text-accent",
      card: "border-accent/20 bg-accent/[0.05]",
    };
  if (v === "fails")
    return {
      label: "Weak",
      cls: "border-loss/30 bg-loss/12 text-loss",
      card: "border-loss/20 bg-loss/[0.05]",
    };
  return {
    label: "Mixed",
    cls: "border-ink/15 bg-ink/[0.04] text-text-muted",
    card: "border-ink/[0.08] bg-ink/[0.02]",
  };
}

/** Collapsible detail block — closed by default for progressive disclosure. */
function DetailFold({ title, subtitle, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.015] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold text-text-primary">{title}</span>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-text-muted leading-snug">{subtitle}</p>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {open ? "Hide" : "Details"}
        </span>
      </button>
      {open && <div className="border-t border-ink/[0.06] px-3.5 py-3">{children}</div>}
    </div>
  );
}

/**
 * Validate: historical prefer/caution still separate this week's closed desk?
 */
function validatePastOnDesk(deskSignals, signalTags, preferTags, cautionTags, allHistTags) {
  const preferSet = new Set((preferTags || []).map((t) => t.tag));
  const cautionSet = new Set((cautionTags || []).map((t) => t.tag));
  const histLookup = Object.fromEntries((allHistTags || []).map((t) => [t.tag, t]));

  const resolved = (deskSignals || []).filter((s) => isResolved(s.status));
  if (resolved.length < 10) {
    return { ok: false, reason: "Not enough closed trades this week to double-check." };
  }

  const rows = resolved.map((s) => {
    const tags = signalTags?.[s.signal_id] || s.important_tags || [];
    const tagList = Array.isArray(tags) ? tags : [];
    const hasPrefer = tagList.some((t) => preferSet.has(t));
    const hasCaution = tagList.some((t) => cautionSet.has(t));
    const matched = tagList.map((t) => histLookup[t]).filter(Boolean);
    let score = null;
    if (matched.length) {
      score = matched.reduce((a, m) => a + (Number(m.win_rate) || 0), 0) / matched.length;
    }
    return {
      win: isResolvedWin(s.status),
      loss: isResolvedLoss(s.status),
      hasPrefer,
      hasCaution,
      score,
    };
  });

  const group = (pred) => {
    const sub = rows.filter(pred);
    const w = sub.filter((r) => r.win).length;
    const l = sub.filter((r) => r.loss).length;
    const n = sub.length;
    return { n, wins: w, losses: l, winPct: pct(w, n), lossPct: pct(l, n) };
  };

  const all = group(() => true);
  const withPrefer = group((r) => r.hasPrefer);
  const noPrefer = group((r) => !r.hasPrefer);
  const withCaution = group((r) => r.hasCaution);
  const noCaution = group((r) => !r.hasCaution);

  const scored = rows.filter((r) => r.score != null).sort((a, b) => b.score - a.score);
  let top = { n: 0, wins: 0, losses: 0, winPct: null, lossPct: null };
  let bot = { n: 0, wins: 0, losses: 0, winPct: null, lossPct: null };
  if (scored.length >= 12) {
    const k = Math.max(3, Math.floor(scored.length / 3));
    const g = (arr) => {
      const w = arr.filter((r) => r.win).length;
      const l = arr.filter((r) => r.loss).length;
      const n = arr.length;
      return { n, wins: w, losses: l, winPct: pct(w, n), lossPct: pct(l, n) };
    };
    top = g(scored.slice(0, k));
    bot = g(scored.slice(-k));
  }

  const preferDelta =
    withPrefer.winPct != null && noPrefer.winPct != null
      ? Math.round((withPrefer.winPct - noPrefer.winPct) * 10) / 10
      : null;
  const cautionDelta =
    withCaution.lossPct != null && noCaution.lossPct != null
      ? Math.round((withCaution.lossPct - noCaution.lossPct) * 10) / 10
      : null;
  const scoreDelta =
    top.winPct != null && bot.winPct != null
      ? Math.round((top.winPct - bot.winPct) * 10) / 10
      : null;

  const preferHolds =
    withPrefer.n >= 8 && noPrefer.n >= 8 && preferDelta != null ? preferDelta > 0 : null;
  const cautionHolds =
    withCaution.n >= 8 && noCaution.n >= 8 && cautionDelta != null ? cautionDelta > 0 : null;
  const scoreHolds = top.n >= 5 && bot.n >= 5 && scoreDelta != null ? scoreDelta > 0 : null;

  let verdict = "mixed";
  let verdictText = "Mixed — not a clear split on this week’s closed trades.";
  let simpleText = "Mixed signal this week — use Edge as a soft prior.";
  const holds = [preferHolds, cautionHolds, scoreHolds].filter((x) => x != null);
  const yes = holds.filter(Boolean).length;
  if (holds.length >= 2 && yes === holds.length) {
    verdict = "holds";
    simpleText = "Yes — strong setups still win more on this week’s closed trades.";
    verdictText =
      "Past prefer tags and higher scores still separate winners on the recent desk. Useful for ranking.";
  } else if (holds.length >= 2 && yes === 0) {
    verdict = "fails";
    simpleText = "Not this week — past patterns didn’t separate well. Be extra careful.";
    verdictText =
      "Prefer / caution / score bands did not separate this week’s desk. Regime may have shifted.";
  } else if (yes > 0) {
    verdict = "partial";
    simpleText = "Partly — some patterns still help; treat as a soft prior.";
    verdictText =
      "Some historical signals still separate the desk, others don’t. Use as a prior, not a hard rule.";
  }

  return {
    ok: true,
    deskN: resolved.length,
    all,
    withPrefer,
    noPrefer,
    withCaution,
    noCaution,
    top,
    bot,
    preferDelta,
    cautionDelta,
    scoreDelta,
    preferHolds,
    cautionHolds,
    scoreHolds,
    verdict,
    verdictText,
    simpleText,
    preferCount: preferSet.size,
    cautionCount: cautionSet.size,
  };
}

function simpleBacktestLine(bt) {
  if (!bt?.ok) return null;
  const d = bt.summary?.q5_vs_q1_win_pp;
  if (d == null) return bt.verdict_text;
  const sign = d >= 0 ? "+" : "";
  if (bt.verdict === "holds") {
    return `Yes — high Edge groups won more (${sign}${d}% wins vs lowest scores). Useful for prioritizing.`;
  }
  if (bt.verdict === "fails") {
    return `Not reliable here — high Edge did not beat low Edge (${sign}${d}% wins).`;
  }
  return `Mild edge — high scores were slightly better (${sign}${d}% wins). Soft prior only.`;
}

export default function EdgeCorrelationPanel({
  defaultOpen = false,
  onFilterTag,
  onSelectPair,
  onShowOpenOnDesk,
  onApplyToTable,
  onEdgeData,
  deskSignals = [],
  signalTags = {},
  edgeScoreMap = {},
  embedded = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [days, setDays] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [rankStatus, setRankStatus] = useState("open");
  const [rankSort, setRankSort] = useState("edge_desc");
  const [backtest, setBacktest] = useState(null);
  const [btLoading, setBtLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const url = `${API_BASE}/api/v1/analytics/edge-correlation?days=${days}&min_n=40`;
    fetch(url, { headers: { ...authHeaders() } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        setData(j);
        setLastFetched(new Date());
        try {
          onEdgeData?.(j);
        } catch {
          /* ignore */
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    if (!open && !embedded) return undefined;
    let cancelled = false;
    setBtLoading(true);
    const url = `${API_BASE}/api/v1/analytics/edge-score-backtest?days=${days}&min_n_tag=15&warm_n=300`;
    fetch(url, { headers: { ...authHeaders() } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setBacktest(j);
      })
      .catch(() => {
        if (!cancelled) setBacktest(null);
      })
      .finally(() => {
        if (!cancelled) setBtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, open, embedded]);

  const baseline = data?.baseline || {};
  const prefer = data?.prefer_tags || [];
  const caution = data?.caution_tags || [];
  const risk = data?.risk || [];
  const openScored = data?.open_scored || [];
  const insights = data?.insights || [];
  const tags = data?.tags || [];

  const historyLabel =
    days === 0 ? "Full history" : days === 90 ? "Last 90 days" : `Last ${days} days`;

  const validation = useMemo(() => {
    if (!data || loading) return null;
    return validatePastOnDesk(deskSignals, signalTags, prefer, caution, tags);
  }, [data, loading, deskSignals, signalTags, prefer, caution, tags]);

  const preferChart = useMemo(() => {
    const rows = [...prefer].slice(0, 8).reverse();
    return {
      grid: { left: 4, right: 44, top: 6, bottom: 2, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (items) => {
          const i = items?.[0]?.dataIndex;
          const t = rows[i];
          if (!t) return "";
          return `<b>${niceTag(t.tag)}</b><br/>Win rate ${t.win_rate}% · Full targets ${t.full_tp_rate ?? "—"}% · Stops ${t.loss_rate}% · samples ${t.n}` +
            (t.lift_pp != null
              ? `<br/>vs average ${t.lift_pp >= 0 ? "+" : ""}${t.lift_pp}%`
              : "");
        },
      },
      xAxis: {
        type: "value",
        max: 100,
        axisLabel: { formatter: "{value}%", fontSize: 10, color: "rgb(var(--fg-muted))" },
        splitLine: { lineStyle: { color: "rgb(var(--ink) / 0.06)" } },
      },
      yAxis: {
        type: "category",
        data: rows.map((t) => niceTag(t.tag)),
        axisLabel: {
          fontSize: 11,
          color: "rgb(var(--fg))",
          width: 120,
          overflow: "truncate",
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 16,
          data: rows.map((t) => t.win_rate || 0),
          itemStyle: { color: "#22c55e", borderRadius: [0, 5, 5, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 11,
            fontWeight: 600,
            color: "rgb(var(--fg))",
            formatter: (p) => `${p.value}%`,
          },
        },
      ],
    };
  }, [prefer]);

  const cautionChart = useMemo(() => {
    const rows = [...caution].slice(0, 6).reverse();
    return {
      grid: { left: 4, right: 44, top: 6, bottom: 2, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (items) => {
          const i = items?.[0]?.dataIndex;
          const t = rows[i];
          if (!t) return "";
          return `<b>${niceTag(t.tag)}</b><br/>Stop rate ${t.loss_rate}% · Win ${t.win_rate}% · samples ${t.n}<br/><span style="opacity:.75">Often late / extended — high past % can mislead</span>`;
        },
      },
      xAxis: {
        type: "value",
        max: 100,
        axisLabel: { formatter: "{value}%", fontSize: 10, color: "rgb(var(--fg-muted))" },
        splitLine: { lineStyle: { color: "rgb(var(--ink) / 0.06)" } },
      },
      yAxis: {
        type: "category",
        data: rows.map((t) => niceTag(t.tag)),
        axisLabel: {
          fontSize: 11,
          color: "rgb(var(--fg))",
          width: 120,
          overflow: "truncate",
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 16,
          data: rows.map((t) => t.loss_rate || 0),
          itemStyle: { color: "#ef4444", borderRadius: [0, 5, 5, 0] },
          label: {
            show: true,
            position: "right",
            fontSize: 11,
            fontWeight: 600,
            color: "rgb(var(--fg))",
            formatter: (p) => `${p.value}%`,
          },
        },
      ],
    };
  }, [caution]);

  const quintileChart = useMemo(() => {
    const qs = backtest?.quintiles || [];
    if (!qs.length) return null;
    return {
      grid: { left: 8, right: 12, top: 28, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (items) => {
          const i = items?.[0]?.dataIndex;
          const q = qs[i];
          if (!q) return "";
          return `<b>${q.label}</b><br/>Win ${q.win_rate}% · Full TP ${q.full_tp_rate}% · Stop ${q.sl_rate}% · n=${q.n}`;
        },
      },
      legend: {
        data: ["Win rate", "Full targets"],
        top: 0,
        textStyle: { fontSize: 10, color: "rgb(var(--fg-muted))" },
      },
      xAxis: {
        type: "category",
        data: qs.map((q) =>
          q.quintile === 1 ? "Lowest\nEdge" : q.quintile === 5 ? "Highest\nEdge" : `Group ${q.quintile}`
        ),
        axisLabel: { fontSize: 10, color: "rgb(var(--fg-muted))", lineHeight: 14 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: (v) => Math.max(0, Math.floor((v.min || 70) - 5)),
        max: 100,
        axisLabel: { formatter: "{value}%", fontSize: 10, color: "rgb(var(--fg-muted))" },
        splitLine: { lineStyle: { color: "rgb(var(--ink) / 0.06)" } },
      },
      series: [
        {
          name: "Win rate",
          type: "bar",
          barMaxWidth: 22,
          data: qs.map((q, i) => ({
            value: q.win_rate,
            itemStyle: {
              color:
                i === qs.length - 1
                  ? "#22c55e"
                  : i === 0
                    ? "#f87171"
                    : "rgb(var(--accent) / 0.65)",
              borderRadius: [4, 4, 0, 0],
            },
          })),
        },
        {
          name: "Full targets",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: qs.map((q) => q.full_tp_rate),
          lineStyle: { color: "#c9a227", width: 2 },
          itemStyle: { color: "#c9a227" },
        },
      ],
    };
  }, [backtest]);

  const apiScoreById = useMemo(() => {
    const m = {};
    for (const r of openScored || []) {
      if (r?.signal_id != null) m[String(r.signal_id)] = r;
    }
    return m;
  }, [openScored]);

  const deskOpenCount = useMemo(() => {
    let n = 0;
    for (const s of deskSignals || []) {
      if (String(s.status || "").toLowerCase() === "open") n += 1;
    }
    return n;
  }, [deskSignals]);

  const rankedRows = useMemo(() => {
    const list = [];
    for (const s of deskSignals || []) {
      if (!s?.signal_id) continue;
      if (!statusMatches(s.status, rankStatus)) continue;
      const id = String(s.signal_id);
      const api = apiScoreById[id];
      const client = edgeScoreMap?.[id] || edgeScoreMap?.[s.signal_id];
      const score = api?.score ?? client?.score ?? null;
      if (score == null) continue;
      list.push({
        signal_id: id,
        pair: s.pair || api?.pair,
        status: s.status,
        created_at: s.created_at || api?.created_at,
        score: Number(score),
        avg_lift_pp: api?.avg_lift_pp ?? client?.avgLift ?? client?.avg_lift_pp ?? null,
        avg_full_tp: api?.avg_full_tp ?? client?.avgFull ?? client?.avg_full_tp ?? null,
        best_tag: api?.best_tag ?? client?.bestTag ?? null,
        best_tag_wr: api?.best_tag_wr ?? client?.bestTagWr ?? null,
        caution_tags: api?.caution_tags ?? client?.caution ?? [],
        reason: api?.reason ?? client?.reason ?? client?.plainWhy ?? "",
        plainWhy: client?.plainWhy || null,
      });
    }
    const dir = rankSort.endsWith("_asc") ? 1 : -1;
    const key = rankSort.replace(/_asc$|_desc$/, "");
    list.sort((a, b) => {
      if (key === "pair") {
        return (
          String(a.pair || "").localeCompare(String(b.pair || "")) *
          (rankSort === "pair_asc" ? 1 : -1)
        );
      }
      if (key === "called") {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (tb - ta) * (rankSort === "called_desc" ? 1 : -1);
      }
      let va = 0;
      let vb = 0;
      if (key === "edge") {
        va = a.score ?? -999;
        vb = b.score ?? -999;
      } else if (key === "lift") {
        va = a.avg_lift_pp ?? -999;
        vb = b.avg_lift_pp ?? -999;
      } else if (key === "full") {
        va = a.avg_full_tp ?? -999;
        vb = b.avg_full_tp ?? -999;
      }
      if (va === vb) return (b.score ?? 0) - (a.score ?? 0);
      return va > vb ? dir : va < vb ? -dir : 0;
    });
    return list.slice(0, 30);
  }, [deskSignals, rankStatus, rankSort, apiScoreById, edgeScoreMap]);

  const applyRankToTable = () => {
    const statusMap = {
      open: "open",
      tp1: "tp1_plus",
      tp2: "tp2_plus",
      full: "full_tp",
      sl: "sl",
      all: "all",
    };
    const payload = {
      statusFilter: statusMap[rankStatus] || "all",
      sortBy: "edge_score",
      sortOrder: rankSort === "edge_asc" ? "asc" : "desc",
      clearSearch: true,
      clearTags: true,
    };
    if (onApplyToTable) onApplyToTable(payload);
    else if (onShowOpenOnDesk && rankStatus === "open") onShowOpenOnDesk();
  };

  const btUi = backtest?.ok ? verdictUi(backtest.verdict) : null;
  const valUi = validation?.ok ? verdictUi(validation.verdict) : null;
  const btSimple = simpleBacktestLine(backtest);

  const refreshedLabel = lastFetched
    ? `Updated ${lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ~10 min cache`
    : "Updates automatically · ~10 min";

  const inner = (
    <div
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 border-t border-ink/[0.06] px-3 pb-4 pt-3.5 sm:px-5"
      }
    >
      {/* ── Toolbar: history + refresh note (quiet) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-text-muted">
          {loading && "Loading…"}
          {!loading && err && <span className="text-loss">{err}</span>}
          {!loading && !err && (
            <span title="Backend refreshes scores as new trades resolve">
              {refreshedLabel}
              {baseline?.n != null && (
                <>
                  {" "}
                  ·{" "}
                  <span className="tabular-nums text-text-secondary">
                    {baseline.n.toLocaleString()}
                  </span>{" "}
                  past setups
                </>
              )}
            </span>
          )}
        </p>
        <div className="inline-flex rounded-lg border border-ink/[0.1] bg-ink/[0.02] p-0.5">
          {HISTORY_OPTS.map((d) => (
            <button
              key={d.id}
              type="button"
              title={d.label}
              onClick={() => setDays(d.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                days === d.id
                  ? "bg-ink/[0.09] font-semibold text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {d.short}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero: two plain-language health cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border p-3.5 sm:p-4 ${btUi?.card || "border-ink/[0.08] bg-ink/[0.02]"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-text-primary">Does Edge work?</p>
            {btLoading ? (
              <span className="font-mono text-[10px] text-text-muted">…</span>
            ) : btUi ? (
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${btUi.cls}`}
              >
                {btUi.label}
              </span>
            ) : null}
          </div>
          <p className="text-[12.5px] leading-relaxed text-text-primary/90">
            {btLoading
              ? "Checking past scores vs real results…"
              : btSimple ||
                (backtest && !backtest.ok
                  ? backtest.reason || "Not enough history yet."
                  : "Open this panel’s details for the full check.")}
          </p>
          {backtest?.ok && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-raised/80 px-2.5 py-2 border border-ink/[0.06]">
                <p className="text-[10px] text-text-muted">Extra wins (high vs low)</p>
                <p
                  className={`mt-0.5 font-mono text-[17px] font-semibold tabular-nums ${
                    (backtest.summary?.q5_vs_q1_win_pp ?? 0) >= 0
                      ? "text-positive"
                      : "text-loss"
                  }`}
                >
                  {backtest.summary?.q5_vs_q1_win_pp != null
                    ? `${backtest.summary.q5_vs_q1_win_pp >= 0 ? "+" : ""}${backtest.summary.q5_vs_q1_win_pp}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-surface-raised/80 px-2.5 py-2 border border-ink/[0.06]">
                <p className="text-[10px] text-text-muted">Extra full targets</p>
                <p
                  className={`mt-0.5 font-mono text-[17px] font-semibold tabular-nums ${
                    (backtest.summary?.q5_vs_q1_full_pp ?? 0) >= 0
                      ? "text-positive"
                      : "text-loss"
                  }`}
                >
                  {backtest.summary?.q5_vs_q1_full_pp != null
                    ? `${backtest.summary.q5_vs_q1_full_pp >= 0 ? "+" : ""}${backtest.summary.q5_vs_q1_full_pp}%`
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className={`rounded-2xl border p-3.5 sm:p-4 ${valUi?.card || "border-ink/[0.08] bg-ink/[0.02]"}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-text-primary">Still useful this week?</p>
            {valUi ? (
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${valUi.cls}`}
              >
                {valUi.label}
              </span>
            ) : null}
          </div>
          <p className="text-[12.5px] leading-relaxed text-text-primary/90">
            {validation?.ok
              ? validation.simpleText
              : validation?.reason ||
                (loading ? "Checking recent closed trades…" : "Waiting for desk data…")}
          </p>
          {validation?.ok && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-raised/80 px-2.5 py-2 border border-ink/[0.06]">
                <p className="text-[10px] text-text-muted">Strong tags win rate</p>
                <p className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums text-positive">
                  {validation.withPrefer.winPct != null
                    ? `${validation.withPrefer.winPct}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-surface-raised/80 px-2.5 py-2 border border-ink/[0.06]">
                <p className="text-[10px] text-text-muted">Top score vs bottom</p>
                <p
                  className={`mt-0.5 font-mono text-[17px] font-semibold tabular-nums ${
                    (validation.scoreDelta ?? 0) >= 0 ? "text-positive" : "text-loss"
                  }`}
                >
                  {validation.scoreDelta != null
                    ? `${validation.scoreDelta >= 0 ? "+" : ""}${validation.scoreDelta}%`
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Insight blurbs (short) ── */}
      {!loading && insights.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {insights.slice(0, 4).map((ins) => (
            <div
              key={ins.title}
              className={`rounded-xl border px-3 py-2.5 ${
                ins.tone === "good"
                  ? "border-positive/20 bg-positive/[0.05]"
                  : ins.tone === "warn"
                    ? "border-loss/15 bg-loss/[0.04]"
                    : "border-ink/[0.07] bg-ink/[0.02]"
              }`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  ins.tone === "good"
                    ? "text-positive"
                    : ins.tone === "warn"
                      ? "text-loss"
                      : "text-text-muted"
                }`}
              >
                {ins.title
                  .replace(/HISTORICALLY /i, "")
                  .replace(/PAST \d+D BASELINE/i, "Baseline")
                  .replace(/EDGE SCORE V2/i, "Edge Score")
                  .replace(/BEST-SCORING OPEN NOW \(V2\)/i, "Best open now")}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-text-primary/90 line-clamp-3">
                {ins.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Prefer / Caution charts ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/[0.08] bg-surface-raised p-3.5">
          <p className="text-[13px] font-semibold text-text-primary">Setups that often worked</p>
          <p className="mb-2 text-[11.5px] text-text-muted">
            Higher win rate in history · click a chip to filter the table
          </p>
          {prefer.length > 0 ? (
            <EChart option={preferChart} height={220} className="w-full" />
          ) : (
            <p className="py-10 text-center text-[12px] text-text-muted">
              {loading ? "…" : "No strong setups yet"}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {prefer.slice(0, 6).map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onFilterTag?.(t.tag)}
                className="rounded-lg border border-positive/25 bg-positive/10 px-2 py-1 text-[11px] text-text-primary hover:border-positive/40"
                title="Add to table filters"
              >
                <span className="text-positive">+</span> {niceTag(t.tag)}{" "}
                <span className="font-mono tabular-nums text-text-muted">{t.win_rate}%</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/[0.08] bg-surface-raised p-3.5">
          <p className="text-[13px] font-semibold text-text-primary">Treat carefully</p>
          <p className="mb-2 text-[11.5px] text-text-muted">
            Higher stop rate or already-extended entries · not an automatic ban
          </p>
          {caution.length > 0 ? (
            <EChart option={cautionChart} height={200} className="w-full" />
          ) : (
            <p className="py-10 text-center text-[12px] text-text-muted">
              {loading ? "…" : "No caution setups"}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {caution.slice(0, 4).map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onFilterTag?.(t.tag)}
                className="rounded-lg border border-loss/20 bg-loss/10 px-2 py-1 text-[11px] text-text-primary hover:border-loss/35"
              >
                {niceTag(t.tag)}{" "}
                <span className="font-mono tabular-nums text-loss">{t.loss_rate}% stops</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Rank live desk (action first) ── */}
      <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-3.5 sm:p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">Pick live calls by Edge</p>
            <p className="text-[11.5px] text-text-muted">
              Same Edge Score as the table · Open + Edge ↓ to prioritize fresh calls
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tabular-nums text-text-muted">
              {rankedRows.length} shown
              {deskOpenCount ? ` · ${deskOpenCount} open` : ""}
            </span>
            <button
              type="button"
              onClick={applyRankToTable}
              className="rounded-lg border border-accent/35 bg-accent/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-text-primary hover:bg-accent/25"
            >
              Show in table
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-wider text-text-muted">
            Status
          </span>
          {RANK_STATUS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => setRankStatus(s.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                rankStatus === s.id
                  ? "border-accent/40 bg-accent/15 font-semibold text-text-primary"
                  : "border-ink/[0.1] bg-surface-raised text-text-muted hover:text-text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-wider text-text-muted">Sort</span>
          {RANK_SORT.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => setRankSort(s.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                rankSort === s.id
                  ? "border-accent/40 bg-accent/15 font-semibold text-text-primary"
                  : "border-ink/[0.1] bg-surface-raised text-text-muted hover:text-text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {loading && (
          <p className="py-6 text-center text-[12px] text-text-muted">Scoring desk…</p>
        )}
        {!loading && rankedRows.length === 0 && (
          <p className="py-6 text-center text-[12px] text-text-muted">
            No scored rows for this filter. Try <strong>All on desk</strong>.
          </p>
        )}
        {!loading && rankedRows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-ink/[0.06] bg-surface-raised">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink/[0.06] text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="px-2.5 py-2 font-medium">#</th>
                  <th className="px-2.5 py-2 font-medium">Pair</th>
                  <th className="px-2.5 py-2 font-medium">Status</th>
                  <th className="px-2.5 py-2 font-medium">Edge</th>
                  <th className="px-2.5 py-2 font-medium">vs avg / full</th>
                  <th className="px-2.5 py-2 font-medium">Best setup</th>
                  <th className="px-2.5 py-2 font-medium">Why</th>
                  <th className="px-2.5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, i) => (
                  <tr
                    key={row.signal_id}
                    className="border-t border-ink/[0.05] text-[12.5px] transition-colors hover:bg-accent/[0.04]"
                  >
                    <td className="px-2.5 py-2 font-mono text-[11px] tabular-nums text-text-muted">
                      {i + 1}
                    </td>
                    <td className="px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => onSelectPair?.(row.pair, row.signal_id)}
                        className="inline-flex items-center gap-2 font-medium hover:text-accent"
                      >
                        <CoinLogo pair={row.pair} size={22} />
                        <span>
                          {baseSymbol(row.pair)}
                          <span className="text-text-muted">/USDT</span>
                        </span>
                      </button>
                      {row.caution_tags?.length > 0 && (
                        <span className="ml-1.5 rounded bg-loss/10 px-1 py-px text-[9px] text-loss">
                          caution
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      <span
                        className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${statusBadgeCls(
                          row.status
                        )}`}
                      >
                        {String(row.status || "—").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 font-mono text-[13px] font-semibold tabular-nums text-accent">
                      {row.score != null ? row.score.toFixed(1) : "—"}
                    </td>
                    <td className="px-2.5 py-2 font-mono text-[11px] tabular-nums text-text-muted">
                      {row.avg_lift_pp != null ? (
                        <span className={row.avg_lift_pp >= 0 ? "text-positive" : "text-loss"}>
                          {row.avg_lift_pp >= 0 ? "+" : ""}
                          {Number(row.avg_lift_pp).toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                      {row.avg_full_tp != null && (
                        <span className="text-text-muted">
                          {" "}
                          · {Number(row.avg_full_tp).toFixed(0)}% full
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-[11px]">
                      {row.best_tag ? (
                        <>
                          {niceTag(row.best_tag)}
                          {row.best_tag_wr != null && (
                            <span className="text-text-muted"> · {row.best_tag_wr}%</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="max-w-[180px] truncate px-2.5 py-2 text-[11px] text-text-muted"
                      title={row.plainWhy || row.reason}
                    >
                      {row.plainWhy || row.reason}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectPair?.(row.pair, row.signal_id)}
                          className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20"
                        >
                          Open
                        </button>
                        {row.best_tag && (
                          <button
                            type="button"
                            onClick={() => onFilterTag?.(row.best_tag)}
                            className="rounded-md border border-ink/12 px-1.5 py-0.5 text-[10px] text-text-muted hover:border-accent/30 hover:text-accent"
                          >
                            + tag
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════ DETAILS (progressive) ══════════ */}

      <DetailFold
        title="How it works"
        subtitle="Simple steps · no jargon required"
      >
        <div className="space-y-3 text-[12.5px] leading-relaxed text-text-primary/90">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              <strong>Learn</strong> from past closed setups (patterns / tags that hit TP more
              often).
            </li>
            <li>
              <strong>Score</strong> each live call with that history (Edge) — without using that
              call’s own result.
            </li>
            <li>
              <strong>Check</strong> that higher scores really won more in the past, and that it
              still helps on this week’s closed trades.
            </li>
            <li>
              <strong>Pick</strong> open calls with higher Edge (or filter strong setups above).
            </li>
          </ol>
          <p className="text-[11.5px] text-text-muted">
            Past results are not a guarantee. Size risk yourself.
          </p>
        </div>
      </DetailFold>

      <DetailFold
        title="Score groups — full numbers"
        subtitle="Win rate from weakest Edge → strongest Edge"
        badge={
          backtest?.ok ? (
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${btUi.cls}`}>
              {btUi.label}
            </span>
          ) : null
        }
      >
        {btLoading && (
          <p className="text-[12px] text-text-muted">Loading score-group check…</p>
        )}
        {!btLoading && backtest && !backtest.ok && (
          <p className="text-[12px] text-text-muted">{backtest.reason}</p>
        )}
        {!btLoading && backtest?.ok && (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-snug text-text-primary/90">
              {backtest.verdict_text}
            </p>
            {quintileChart && (
              <EChart option={quintileChart} height={200} className="w-full" />
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  l: "Extra wins",
                  v:
                    backtest.summary?.q5_vs_q1_win_pp != null
                      ? `${backtest.summary.q5_vs_q1_win_pp >= 0 ? "+" : ""}${backtest.summary.q5_vs_q1_win_pp}%`
                      : "—",
                  good: (backtest.summary?.q5_vs_q1_win_pp ?? 0) >= 0,
                },
                {
                  l: "Extra full TP",
                  v:
                    backtest.summary?.q5_vs_q1_full_pp != null
                      ? `${backtest.summary.q5_vs_q1_full_pp >= 0 ? "+" : ""}${backtest.summary.q5_vs_q1_full_pp}%`
                      : "—",
                  good: (backtest.summary?.q5_vs_q1_full_pp ?? 0) >= 0,
                },
                {
                  l: "Avg Edge on wins",
                  v: backtest.summary?.mean_score_wins ?? "—",
                  good: true,
                },
                {
                  l: "Setups checked",
                  v: backtest.n_scored?.toLocaleString?.() ?? backtest.n_scored,
                  good: true,
                },
              ].map((k) => (
                <div
                  key={k.l}
                  className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2 text-center"
                >
                  <p className="text-[10px] text-text-muted">{k.l}</p>
                  <p
                    className={`mt-0.5 font-mono text-[15px] font-semibold tabular-nums ${
                      k.good ? "text-positive" : "text-loss"
                    }`}
                  >
                    {k.v}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="py-1.5 pr-2 font-medium">Group</th>
                    <th className="py-1.5 pr-2 font-medium">Edge range</th>
                    <th className="py-1.5 pr-2 font-medium">n</th>
                    <th className="py-1.5 pr-2 font-medium">Win %</th>
                    <th className="py-1.5 pr-2 font-medium">Full TP %</th>
                    <th className="py-1.5 pr-2 font-medium">Stop %</th>
                    <th className="py-1.5 font-medium">Med peak</th>
                  </tr>
                </thead>
                <tbody>
                  {(backtest.quintiles || []).map((q) => (
                    <tr
                      key={q.quintile}
                      className={`border-t border-ink/[0.06] ${
                        q.quintile === 5
                          ? "bg-positive/[0.06]"
                          : q.quintile === 1
                            ? "bg-loss/[0.04]"
                            : ""
                      }`}
                    >
                      <td className="py-1.5 pr-2 font-medium">
                        {q.quintile === 1
                          ? "Lowest Edge"
                          : q.quintile === 5
                            ? "Highest Edge"
                            : q.label}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-text-muted">
                        {q.score_min}–{q.score_max}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-text-muted">
                        {q.n}
                      </td>
                      <td className="py-1.5 pr-2 font-mono font-semibold tabular-nums text-positive">
                        {q.win_rate != null ? `${q.win_rate}%` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-accent">
                        {q.full_tp_rate != null ? `${q.full_tp_rate}%` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-loss">
                        {q.sl_rate != null ? `${q.sl_rate}%` : "—"}
                      </td>
                      <td className="py-1.5 font-mono tabular-nums text-text-muted">
                        {q.median_peak_pct != null ? `${q.median_peak_pct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-snug text-text-muted">
              <strong className="font-medium text-text-primary/75">Expert:</strong>{" "}
              {backtest.how_to_read ||
                "Each past call is scored with only history before it (no look-ahead), then grouped by score."}{" "}
              Method: {backtest.method} · {backtest.score_version}.
            </p>
          </div>
        )}
      </DetailFold>

      {validation && (
        <DetailFold
          title="This week — health details"
          subtitle={`${validation.ok ? validation.deskN : "—"} closed on desk`}
          badge={
            validation.ok ? (
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${valUi.cls}`}>
                {valUi.label}
              </span>
            ) : null
          }
        >
          {!validation.ok && (
            <p className="text-[12.5px] text-text-muted">{validation.reason}</p>
          )}
          {validation.ok && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-snug text-text-primary/90">
                {validation.verdictText}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-positive">
                    Strong tags this week
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-semibold tabular-nums">
                    {validation.withPrefer.winPct != null
                      ? `${validation.withPrefer.winPct}%`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    win rate · n={validation.withPrefer.n}
                  </p>
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Without: {validation.noPrefer.winPct ?? "—"}% (n={validation.noPrefer.n})
                    {validation.preferDelta != null && (
                      <span
                        className={
                          validation.preferDelta > 0 ? " text-positive" : " text-loss"
                        }
                      >
                        {" "}
                        · {validation.preferDelta >= 0 ? "+" : ""}
                        {validation.preferDelta}%
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-loss">
                    Caution tags this week
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-semibold tabular-nums">
                    {validation.withCaution.lossPct != null
                      ? `${validation.withCaution.lossPct}%`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    stop rate · n={validation.withCaution.n}
                  </p>
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Without: {validation.noCaution.lossPct ?? "—"}% (n={validation.noCaution.n})
                    {validation.cautionDelta != null && (
                      <span
                        className={
                          validation.cautionDelta > 0 ? " text-loss" : " text-positive"
                        }
                      >
                        {" "}
                        · {validation.cautionDelta >= 0 ? "+" : ""}
                        {validation.cautionDelta}% stops
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Top third Edge
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-semibold tabular-nums">
                    {validation.top.winPct != null ? `${validation.top.winPct}%` : "—"}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    win rate · n={validation.top.n}
                  </p>
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Bottom third: {validation.bot.winPct ?? "—"}% (n={validation.bot.n})
                    {validation.scoreDelta != null && (
                      <span
                        className={
                          validation.scoreDelta > 0 ? " text-positive" : " text-loss"
                        }
                      >
                        {" "}
                        · {validation.scoreDelta >= 0 ? "+" : ""}
                        {validation.scoreDelta}%
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-3 py-2.5">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
                    Win % · strong tags vs rest
                  </p>
                  {[
                    {
                      label: "With strong tags",
                      v: validation.withPrefer.winPct,
                      n: validation.withPrefer.n,
                      c: "#22c55e",
                    },
                    {
                      label: "Without",
                      v: validation.noPrefer.winPct,
                      n: validation.noPrefer.n,
                      c: "#94a3b8",
                    },
                    {
                      label: "All closed",
                      v: validation.all.winPct,
                      n: validation.all.n,
                      c: "#c9a227",
                    },
                  ].map((row) => (
                    <div key={row.label} className="mb-1.5 flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-[11px] text-text-muted">
                        {row.label}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.v ?? 0)}%`,
                            background: row.c,
                          }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums">
                        {row.v != null ? `${row.v}%` : "—"}
                        <span className="text-text-muted"> ·{row.n}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-3 py-2.5">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
                    Stop % · caution vs rest
                  </p>
                  {[
                    {
                      label: "With caution",
                      v: validation.withCaution.lossPct,
                      n: validation.withCaution.n,
                      c: "#ef4444",
                    },
                    {
                      label: "Without",
                      v: validation.noCaution.lossPct,
                      n: validation.noCaution.n,
                      c: "#94a3b8",
                    },
                    {
                      label: "All closed",
                      v: validation.all.lossPct,
                      n: validation.all.n,
                      c: "#c9a227",
                    },
                  ].map((row) => (
                    <div key={row.label} className="mb-1.5 flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-[11px] text-text-muted">
                        {row.label}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.v ?? 0)}%`,
                            background: row.c,
                          }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums">
                        {row.v != null ? `${row.v}%` : "—"}
                        <span className="text-text-muted"> ·{row.n}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DetailFold>
      )}

      {risk.length > 0 && (
        <DetailFold title="Risk level × past results" subtitle="Win rate by signal risk band">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {risk.map((r) => (
              <div
                key={r.risk}
                className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{r.risk}</p>
                <p className="mt-0.5 font-mono text-[16px] font-semibold tabular-nums text-positive">
                  {r.win_rate != null ? `${r.win_rate}%` : "—"}
                </p>
                <p className="text-[10px] text-text-muted">
                  stop {r.loss_rate ?? "—"}% · n={r.n}
                </p>
              </div>
            ))}
          </div>
        </DetailFold>
      )}

      <DetailFold
        title="History window & raw stats"
        subtitle={`${historyLabel} · full technical snapshot`}
      >
        <div className="space-y-2 text-[12px] leading-relaxed text-text-primary/90">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2">
              <p className="text-[10px] text-text-muted">Resolved</p>
              <p className="font-mono text-[15px] font-semibold tabular-nums">
                {baseline.n?.toLocaleString?.() ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2">
              <p className="text-[10px] text-text-muted">Win rate</p>
              <p className="font-mono text-[15px] font-semibold tabular-nums text-positive">
                {baseline.win_rate != null ? `${baseline.win_rate}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2">
              <p className="text-[10px] text-text-muted">Stop rate</p>
              <p className="font-mono text-[15px] font-semibold tabular-nums text-loss">
                {baseline.loss_rate != null ? `${baseline.loss_rate}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-ink/[0.07] bg-surface-raised px-2.5 py-2">
              <p className="text-[10px] text-text-muted">Full TP / TP4</p>
              <p className="font-mono text-[15px] font-semibold tabular-nums">
                {baseline.full_tp_rate ?? "—"}% / {baseline.tp4_rate ?? "—"}%
              </p>
            </div>
          </div>
          <p className="text-[11px] text-text-muted">
            <strong className="font-medium text-text-primary/80">Expert:</strong> Learning uses
            resolved signals with tags
            {data?.window?.start && data?.window?.end
              ? ` (${data.window.start} → ${data.window.end})`
              : ""}
            {data?.tag_era_start ? ` · tag era from ${data.tag_era_start}` : ""}. Desk list is the
            live 7-day feed; scores are long history, not “learned only from 7d”. Redis cache
            ~10 minutes; rates update as new outcomes resolve.{" "}
            {tags.length > 0 && `${tags.length} tag cohorts.`}
          </p>
        </div>
      </DetailFold>

      <p className="text-center text-[11px] text-text-muted">
        Edge uses past outcomes only · not a guarantee · manage your own risk
      </p>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Learn from the past</p>
          <p className="text-[11.5px] text-text-muted">
            Score live calls from history · details when you expand
          </p>
        </div>
        {inner}
      </div>
    );
  }

  return (
    <section
      id="edge-learn"
      className="mb-5 scroll-mt-24 overflow-hidden rounded-2xl border border-ink/[0.09] bg-surface-raised shadow-[0_1px_0_rgb(var(--ink)/0.04)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.02] sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold tracking-tight text-text-primary">
              Learn from the past
            </span>
            <span className="rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 text-[10px] text-text-muted">
              history → score live calls
            </span>
            {backtest?.ok && (
              <span
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                  verdictUi(backtest.verdict).cls
                }`}
              >
                Edge {verdictUi(backtest.verdict).label}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-text-muted">
            See which setups worked before · rank open calls by Edge · expand for full numbers
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-ink/[0.1] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && inner}
    </section>
  );
}
