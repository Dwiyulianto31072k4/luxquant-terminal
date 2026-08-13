// EdgeBrainGraph — Obsidian-style knowledge graph for Signals Edge playbook.
// Mirrors Compass BrainPanel: pan / zoom / select / dim / tooltips.
// Nodes = tag lessons (runner · prefer · caution); center = 90d edge hub.
// Satellite dots = co-occurrence weight on currently loaded open/recent signals.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../constants/zIndex";

const W = 900;
const H = 620; // taller canvas so left fills to match right rail
const CX = W / 2;
const CY = H / 2;
const MIN_K = 0.55;
const MAX_K = 3.2;

const HEX = {
  runner: "#c9a227", // accent gold
  prefer: "#22c55e",
  caution: "#ef4444",
  hub: "#d4a84b",
  mute: "rgb(var(--ink) / 0.55)",
};

function nice(tag) {
  return String(tag || "")
    .replace(/_H1$/i, "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function shortLabel(tag) {
  const s = nice(tag);
  return s.length > 18 ? s.slice(0, 16) + "…" : s;
}

function useLayout(nodesIn) {
  return useMemo(() => {
    // Partition into three arcs for readable clusters
    const runners = nodesIn.filter((n) => n.role === "runner");
    const prefer = nodesIn.filter((n) => n.role === "prefer");
    const caution = nodesIn.filter((n) => n.role === "caution");

    const place = (list, startAng, endAng, R) => {
      const n = Math.max(list.length, 1);
      return list.map((item, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1 || 1);
        const ang = startAng + (endAng - startAng) * t;
        const r =
          item.role === "runner"
            ? Math.min(28, 12 + Math.sqrt(item.n || 1) * 0.55 + (item.full || 0) * 0.08)
            : item.role === "prefer"
              ? Math.min(24, 11 + Math.sqrt(item.n || 1) * 0.45)
              : Math.min(20, 10 + Math.sqrt(item.n || 1) * 0.4);
        return {
          ...item,
          r,
          x: CX + R * Math.cos(ang),
          y: CY + R * Math.sin(ang),
          ang,
        };
      });
    };

    // runners: top-right arc, prefer: bottom arc, caution: left arc
    const nodes = [
      ...place(runners, -Math.PI * 0.72, -Math.PI * 0.08, 188),
      ...place(prefer, Math.PI * 0.15, Math.PI * 0.85, 175),
      ...place(caution, Math.PI * 0.95, Math.PI * 1.55, 168),
    ];

    // co-occurrence satellites around host nodes
    const dots = [];
    nodes.forEach((host) => {
      const c = Math.min(host.coCount || 0, 8);
      for (let j = 0; j < c; j++) {
        const spread = ((j % 7) - 3) * 0.14;
        const dist = host.r + 36 + ((j * 11) % 28);
        const a = host.ang + spread;
        dots.push({
          hostId: host.id,
          hex: host.hex,
          x: host.x + dist * Math.cos(a),
          y: host.y + dist * Math.sin(a),
          hx: host.x,
          hy: host.y,
        });
      }
    });

    // soft links between high co-occurrence pairs
    const links = [];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    nodes.forEach((a) => {
      (a.coTags || []).forEach(({ tag, count }) => {
        const b = byId[tag];
        if (!b || a.id >= b.id) return;
        if (count < 3) return;
        links.push({ a, b, count });
      });
    });

    return { nodes, dots, links };
  }, [nodesIn]);
}

export default function EdgeBrainGraph({
  runners = [],
  prefer = [],
  caution = [],
  verdictCounts = { worth: 0, avoid: 0 },
  signalTags = {},
  selectedTag = null,
  onSelectTag,
  onFilterTag,
  onClearFilter,
  onScreenRunners,
  activeFilterTag = null, // legacy single
  activeFilterTags = null, // multi-select preferred
  edgeFilterActive = false,
}) {
  const filterTagSet = useMemo(() => {
    if (Array.isArray(activeFilterTags) && activeFilterTags.length) {
      return new Set(activeFilterTags);
    }
    if (activeFilterTag) return new Set([activeFilterTag]);
    return new Set();
  }, [activeFilterTags, activeFilterTag]);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [tooltip, setTooltip] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef(null);
  const lastTapRef = useRef({ id: null, t: 0 });

  // Lock body scroll when expanded
  useEffect(() => {
    if (!expanded) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  // Build co-occurrence from currently loaded signals' important tags
  const coMap = useMemo(() => {
    const pairCount = {}; // "A||B" -> n
    const tagActive = {}; // tag -> how many open-ish signals in bulk set
    const lists = Object.values(signalTags || {});
    for (const tags of lists) {
      if (!Array.isArray(tags) || tags.length < 1) continue;
      const uniq = [...new Set(tags)];
      for (const t of uniq) tagActive[t] = (tagActive[t] || 0) + 1;
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i];
          const b = uniq[j];
          const key = a < b ? `${a}||${b}` : `${b}||${a}`;
          pairCount[key] = (pairCount[key] || 0) + 1;
        }
      }
    }
    const neighbors = {};
    for (const [key, count] of Object.entries(pairCount)) {
      const [a, b] = key.split("||");
      if (!neighbors[a]) neighbors[a] = [];
      if (!neighbors[b]) neighbors[b] = [];
      neighbors[a].push({ tag: b, count });
      neighbors[b].push({ tag: a, count });
    }
    for (const k of Object.keys(neighbors)) {
      neighbors[k].sort((x, y) => y.count - x.count);
    }
    return { neighbors, tagActive };
  }, [signalTags]);

  const nodesIn = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (t, role) => {
      if (!t?.tag || seen.has(t.tag)) return;
      // Prefer runner role over prefer if both
      seen.add(t.tag);
      const peak = Number(t.median_peak_wins ?? t.median_peak) || 0;
      const full = Number(t.full_tp_rate) || 0;
      const tp4 = Number(t.tp4_rate) || 0;
      const wr = Number(t.win_rate) || 0;
      const coTags = (coMap.neighbors[t.tag] || []).slice(0, 5);
      out.push({
        id: t.tag,
        role,
        hex: HEX[role] || HEX.prefer,
        n: t.n || 0,
        wr,
        full,
        tp4,
        peak,
        coCount: coMap.tagActive[t.tag] || 0,
        coTags,
        raw: t,
      });
    };
    runners.forEach((t) => push(t, "runner"));
    prefer.forEach((t) => push(t, "prefer"));
    caution.forEach((t) => push(t, "caution"));
    return out;
  }, [runners, prefer, caution, coMap]);

  const { nodes, dots, links } = useLayout(nodesIn);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const sy = ((e.clientY - rect.top) / rect.height) * H;
      setView((v) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
        const wx = (sx - v.x) / v.k;
        const wy = (sy - v.y) / v.k;
        return { k, x: sx - wx * k, y: sy - wy * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    dragRef.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.px) / rect.width) * W;
    const dy = ((e.clientY - d.py) / rect.height) * H;
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
    setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const zoomBy = (factor) =>
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const wx = (CX - v.x) / v.k;
      const wy = (CY - v.y) / v.k;
      return { k, x: CX - wx * k, y: CY - wy * k };
    });
  const resetView = () => setView({ x: 0, y: 0, k: 1 });

  const showTip = (e, lines) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 10, lines });
  };

  const dimmed = (id) => selectedTag && selectedTag !== id && !filterTagSet.has(id);
  const selectedNode = nodes.find((n) => n.id === selectedTag) || null;
  const isFiltered = (id) => filterTagSet.has(id);

  const handleNodeActivate = (nodeId) => {
    if (dragRef.current?.moved) return;
    const now = Date.now();
    const last = lastTapRef.current;
    // Double-click / double-tap → toggle into multi-filter set
    if (last.id === nodeId && now - last.t < 380) {
      onSelectTag?.(nodeId);
      onFilterTag?.(nodeId); // parent toggles multi-set
      lastTapRef.current = { id: null, t: 0 };
      return;
    }
    lastTapRef.current = { id: nodeId, t: now };
    onSelectTag?.(selectedTag === nodeId ? null : nodeId);
  };

  /** Toggle tag into multi-filter (does not wipe other tags). */
  const applyFilter = (tag) => {
    if (!tag) return;
    onSelectTag?.(tag);
    onFilterTag?.(tag);
  };

  if (nodesIn.length === 0) {
    return (
      <div className="rounded-xl border border-ink/[0.07] bg-ink/[0.02] px-4 py-10 text-center">
        <p className="text-[13px] font-medium text-text-primary">Edge graph waiting on tag stats</p>
        <p className="mt-1 text-[12px] text-text-muted">
          90d tag-wr needs enough resolved samples — check back after the next refresh.
        </p>
      </div>
    );
  }

  // Fill parent height so left canvas matches right rail (no empty gap under graph).
  const canvasH = expanded
    ? "h-full min-h-[min(70vh,640px)]"
    : "h-full min-h-[480px] sm:min-h-[520px] md:min-h-[560px]";

  const graphShell = (
        <div
          ref={wrapRef}
          className={`relative flex h-full min-h-[480px] w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,rgb(var(--ink)/0.04)_0%,transparent_68%)] sm:min-h-[520px] md:min-h-[560px] ${
            expanded
              ? "min-h-[min(70vh,640px)] rounded-xl border border-ink/[0.08]"
              : "rounded-2xl border border-ink/[0.08]"
          }`}
        >
          <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
            {[
              { label: "+", fn: () => zoomBy(1.3), aria: "Zoom in" },
              { label: "−", fn: () => zoomBy(1 / 1.3), aria: "Zoom out" },
              { label: "⟲", fn: resetView, aria: "Reset view" },
              {
                label: expanded ? "✕" : "⛶",
                fn: () => setExpanded((v) => !v),
                aria: expanded ? "Close expanded graph" : "Expand graph",
              },
            ].map((b) => (
              <button
                key={b.aria}
                type="button"
                aria-label={b.aria}
                onClick={b.fn}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.1] bg-surface-raised/95 text-[14px] text-text-primary shadow-sm backdrop-blur transition hover:border-ink/18 hover:bg-ink/[0.06]"
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-5rem)] rounded-lg border border-ink/[0.07] bg-surface-raised/90 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted shadow-sm backdrop-blur">
            <span className="md:hidden">tap · double-tap filter</span>
            <span className="hidden md:inline">
              drag · scroll · click select · double-click filter
            </span>
          </div>

          <div
            className={`absolute left-2.5 z-10 flex flex-wrap gap-2.5 rounded-lg border border-ink/[0.07] bg-surface-raised/95 px-2.5 py-1.5 shadow-sm backdrop-blur ${
              selectedNode ? "bottom-[4.25rem]" : "bottom-2.5"
            }`}
          >
            {[
              { c: HEX.runner, l: "Runner · fuller TP" },
              { c: HEX.prefer, l: "Prefer · high WR" },
              { c: HEX.caution, l: "Caution" },
            ].map((x) => (
              <span
                key={x.l}
                className="inline-flex items-center gap-1.5 font-mono text-[9.5px] text-text-muted"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: x.c }} />
                {x.l}
              </span>
            ))}
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid slice"
            className={`block w-full flex-1 cursor-grab touch-none select-none active:cursor-grabbing ${canvasH}`}
            role="img"
            aria-label="Signals edge brain graph — 90 day tag lessons"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              onPointerUp();
              setTooltip(null);
            }}
          >
            <defs>
              <radialGradient id="edgeHubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={HEX.hub} stopOpacity="0.22" />
                <stop offset="100%" stopColor={HEX.hub} stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {/* co-occurrence links */}
              {links.map((L, i) => (
                <path
                  key={`co-${i}`}
                  d={`M ${L.a.x} ${L.a.y} Q ${CX} ${CY} ${L.b.x} ${L.b.y}`}
                  fill="none"
                  stroke="rgb(var(--ink) / 0.12)"
                  strokeWidth={Math.min(2.5, 0.6 + L.count * 0.15)}
                  opacity={
                    selectedTag && selectedTag !== L.a.id && selectedTag !== L.b.id ? 0.08 : 0.55
                  }
                />
              ))}

              {/* hub → node */}
              {nodes.map((node) => (
                <path
                  key={`spoke-${node.id}`}
                  d={`M ${CX} ${CY} Q ${(CX + node.x) / 2 + 12} ${(CY + node.y) / 2 - 12} ${node.x} ${node.y}`}
                  fill="none"
                  stroke={node.hex}
                  strokeOpacity={dimmed(node.id) ? 0.07 : 0.38}
                  strokeWidth={selectedTag === node.id ? 2.4 : 1.35}
                />
              ))}

              {/* satellites */}
              {dots.map((d, i) => (
                <g key={`dot-${i}`} opacity={dimmed(d.hostId) ? 0.1 : 0.85}>
                  <path
                    d={`M ${d.hx} ${d.hy} Q ${(d.hx + d.x) / 2 + 6} ${(d.hy + d.y) / 2 - 6} ${d.x} ${d.y}`}
                    fill="none"
                    stroke={d.hex}
                    strokeOpacity="0.14"
                    strokeWidth="1"
                  />
                  <circle cx={d.x} cy={d.y} r="2.8" fill={d.hex} fillOpacity="0.5" />
                </g>
              ))}

              {/* nodes */}
              {nodes.map((node) => {
                const isSel = selectedTag === node.id;
                const filtered = isFiltered(node.id);
                const labelY = node.y >= CY ? node.y + node.r + 16 : node.y - node.r - 12;
                const subY = node.y >= CY ? labelY + 13 : labelY - 13;
                return (
                  <g
                    key={node.id}
                    opacity={dimmed(node.id) ? 0.2 : 1}
                    className="cursor-pointer"
                    onClick={() => handleNodeActivate(node.id)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      applyFilter(node.id);
                    }}
                    onMouseEnter={(e) =>
                      showTip(e, [
                        nice(node.id),
                        `${node.role} · ${node.wr.toFixed(0)}% WR · n=${node.n}`,
                        node.full
                          ? `${node.full.toFixed(0)}% full (TP3+) · ${node.tp4.toFixed(0)}% TP4`
                          : null,
                        node.peak ? `med peak +${node.peak.toFixed(0)}%` : null,
                        "Double-click to toggle in multi-drill",
                        filtered ? "● In drill set" : null,
                      ].filter(Boolean))
                    }
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {(isSel || filtered) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r + 9}
                        fill="none"
                        stroke={filtered ? "#c9a227" : node.hex}
                        strokeWidth={filtered ? 2.2 : 1.5}
                        strokeDasharray={filtered ? "0" : "4 3"}
                      />
                    )}
                    <circle cx={node.x} cy={node.y} r={node.r + 6} fill={node.hex} fillOpacity="0.12" />
                    <circle cx={node.x} cy={node.y} r={node.r} fill={node.hex} />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fill="#140b0d"
                      fontSize="10.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, ui-monospace, monospace"
                    >
                      {node.role === "runner"
                        ? `${Math.round(node.full || node.wr)}%`
                        : `${Math.round(node.wr)}%`}
                    </text>
                    <text
                      x={node.x}
                      y={labelY}
                      textAnchor="middle"
                      fill="rgb(var(--ink) / 0.88)"
                      fontSize="11"
                      fontWeight={isSel ? "600" : "500"}
                      fontFamily="JetBrains Mono, ui-monospace, monospace"
                    >
                      {shortLabel(node.id)}
                    </text>
                    {/* Sub-label only when selected — less clutter */}
                    {isSel && (
                      <text
                        x={node.x}
                        y={subY}
                        textAnchor="middle"
                        fill={node.hex}
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, ui-monospace, monospace"
                      >
                        {node.role === "runner" && node.peak
                          ? `+${node.peak.toFixed(0)}% peak · n=${node.n}`
                          : `n=${node.n}`}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* hub */}
              <g
                className="cursor-pointer"
                onClick={() => {
                  if (!dragRef.current?.moved) onSelectTag?.(null);
                }}
                onMouseEnter={(e) =>
                  showTip(e, [
                    "Edge brain · 90 days",
                    `${runners.length} runners · ${prefer.length} prefer · ${caution.length} caution`,
                    verdictCounts.worth
                      ? `Worth it pairs in desk: ${verdictCounts.worth}`
                      : "Resolved tag outcomes → lessons",
                  ])
                }
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={CX} cy={CY} r="58" fill="url(#edgeHubGlow)" />
                <circle cx={CX} cy={CY} r="36" fill="#1a1208" stroke={HEX.hub} strokeWidth="2.4" />
                <text
                  x={CX}
                  y={CY - 6}
                  textAnchor="middle"
                  fill={HEX.hub}
                  fontSize="9"
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                  letterSpacing="0.12em"
                >
                  EDGE
                </text>
                <text
                  x={CX}
                  y={CY + 10}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                >
                  90d
                </text>
              </g>
            </g>
          </svg>

          {tooltip && (
            <div
              className="pointer-events-none absolute z-20 max-w-[270px] rounded-lg border border-ink/12 bg-surface-raised/95 px-3 py-2 shadow-[0_8px_30px_rgb(var(--scrim)/0.35)] backdrop-blur"
              style={{
                left: Math.min(tooltip.x, (wrapRef.current?.clientWidth || 400) - 280),
                top: tooltip.y,
              }}
            >
              {tooltip.lines.map((line, i) => (
                <div
                  key={i}
                  className={
                    i === 0
                      ? "text-[12px] font-semibold text-text-primary"
                      : "mt-0.5 text-[11px] leading-4 text-text-muted"
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Floating filter bar when a node is selected */}
          {selectedNode && (
            <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/12 bg-surface-raised/95 px-3 py-2 shadow-lg backdrop-blur sm:inset-x-3">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold capitalize text-text-primary">
                  {nice(selectedNode.id)}
                </p>
                <p className="font-mono text-[10px] text-text-muted">
                  {selectedNode.role} · {selectedNode.wr.toFixed(0)}% WR
                  {selectedNode.full ? ` · ${selectedNode.full.toFixed(0)}% full` : ""}
                  {filterTagSet.size > 0
                    ? ` · drill ${filterTagSet.size} tag${filterTagSet.size > 1 ? "s" : ""}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyFilter(selectedNode.id)}
                  className="rounded-lg border border-accent/35 bg-accent/15 px-3 py-1.5 text-[12px] font-semibold text-text-primary transition-colors hover:bg-accent/25"
                >
                  {isFiltered(selectedNode.id) ? "Remove from drill" : "Add to drill"}
                </button>
                {(edgeFilterActive || filterTagSet.size > 0) && (
                  <button
                    type="button"
                    onClick={() => onClearFilter?.()}
                    className="rounded-lg border border-ink/[0.1] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
  );

  const detailRail = (
      <div className="flex h-full min-h-0 xl:col-span-4">
        <div className="flex h-full w-full min-h-[480px] flex-col space-y-3 rounded-2xl border border-ink/[0.08] bg-ink/[0.02] p-3.5 sm:min-h-[520px] sm:p-4 md:min-h-[560px]">
          <div>
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Lesson detail
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-text-muted">
              Click to inspect.{" "}
              <strong className="font-medium text-text-primary/80">Filter / double-click</strong> adds
              or removes that tag from your drill (combine many). ⛶ expands the graph.
            </p>
            {filterTagSet.size > 0 && (
              <p className="mt-1 font-mono text-[10px] text-accent">
                {filterTagSet.size} tag{filterTagSet.size > 1 ? "s" : ""} in drill
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "Runners", v: runners.length, c: "text-accent" },
              { l: "Prefer", v: prefer.length, c: "text-positive" },
              { l: "Caution", v: caution.length, c: "text-loss" },
            ].map((x) => (
              <div
                key={x.l}
                className="rounded-lg border border-ink/[0.06] bg-surface-raised px-2 py-2 text-center"
              >
                <div className={`font-mono text-[16px] font-semibold tabular-nums ${x.c}`}>{x.v}</div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  {x.l}
                </div>
              </div>
            ))}
          </div>

          {selectedNode ? (
            <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold capitalize text-text-primary">
                    {nice(selectedNode.id)}
                  </p>
                  <p
                    className="mt-0.5 font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: selectedNode.hex }}
                  >
                    {selectedNode.role}
                    {isFiltered(selectedNode.id) ? " · filtering" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectTag?.(null)}
                  className="font-mono text-[10px] text-text-muted hover:text-text-primary"
                >
                  Deselect
                </button>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
                <div>
                  <dt className="text-text-muted">Win rate</dt>
                  <dd className="tabular-nums text-text-primary">{selectedNode.wr.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Samples</dt>
                  <dd className="tabular-nums text-text-primary">{selectedNode.n}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Full TP3+</dt>
                  <dd className="tabular-nums text-text-primary">
                    {selectedNode.full ? `${selectedNode.full.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">TP4</dt>
                  <dd className="tabular-nums text-text-primary">
                    {selectedNode.tp4 ? `${selectedNode.tp4.toFixed(1)}%` : "—"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-text-muted">Median peak (wins)</dt>
                  <dd className="tabular-nums text-text-primary">
                    {selectedNode.peak ? `+${selectedNode.peak.toFixed(1)}%` : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => applyFilter(selectedNode.id)}
                  className="w-full rounded-lg border border-accent/35 bg-accent/15 px-3 py-2 text-[12.5px] font-semibold text-text-primary transition-colors hover:bg-accent/25"
                >
                  {isFiltered(selectedNode.id)
                    ? "Remove tag from drill"
                    : "Add tag to drill (combine)"}
                </button>
                {selectedNode.role === "runner" && onScreenRunners && (
                  <button
                    type="button"
                    onClick={() => {
                      const tags = runners.map((r) => r.tag).filter(Boolean);
                      onScreenRunners(tags.length ? tags : [selectedNode.id]);
                    }}
                    className="w-full rounded-lg border border-ink/12 bg-ink/[0.03] px-3 py-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-ink/[0.06]"
                  >
                    Screen all high-runners
                  </button>
                )}
                {(edgeFilterActive || filterTagSet.size > 0) && (
                  <button
                    type="button"
                    onClick={() => onClearFilter?.()}
                    className="w-full rounded-lg border border-ink/[0.1] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                  >
                    Clear all drill filters
                  </button>
                )}
              </div>
              {selectedNode.coTags?.length > 0 && (
                <div className="mt-2 border-t border-ink/[0.06] pt-2">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                    Often co-occurs · click to select
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedNode.coTags.slice(0, 4).map((c) => (
                      <button
                        key={c.tag}
                        type="button"
                        onClick={() => onSelectTag?.(c.tag)}
                        onDoubleClick={() => applyFilter(c.tag)}
                        className="rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-text-primary/85 hover:border-ink/16"
                      >
                        {nice(c.tag)}
                        <span className="ml-1 text-text-muted">{c.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-ink/[0.1] px-3 py-4 text-center">
              <p className="text-[12px] text-text-muted">
                Select a node, then filter the table from here — or double-click the node.
              </p>
            </div>
          )}

          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            {nodes
              .slice()
              .sort((a, b) => {
                const order = { runner: 0, prefer: 1, caution: 2 };
                return (order[a.role] ?? 9) - (order[b.role] ?? 9);
              })
              .map((n) => (
                <li key={n.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectTag?.(selectedTag === n.id ? null : n.id)}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                        selectedTag === n.id || isFiltered(n.id)
                          ? "bg-ink/[0.07]"
                          : "hover:bg-ink/[0.04]"
                      }`}
                    >
                      <span className="min-w-0 truncate font-mono text-[11px] text-text-primary/90">
                        <span
                          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: n.hex }}
                        />
                        {nice(n.id)}
                        {isFiltered(n.id) ? (
                          <span className="ml-1 text-accent">●</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
                        {n.role === "runner" && n.full
                          ? `${n.full.toFixed(0)}%f`
                          : `${n.wr.toFixed(0)}%`}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={isFiltered(n.id) ? "Remove from drill" : "Add to multi-drill"}
                      onClick={() => applyFilter(n.id)}
                      className={`shrink-0 rounded-md border px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                        isFiltered(n.id)
                          ? "border-accent/35 bg-accent/15 text-accent"
                          : "border-ink/[0.08] text-text-muted hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
                      }`}
                    >
                      {isFiltered(n.id) ? "On" : "+"}
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>
  );

  // Equal-height columns: graph fills left to match right rail.
  const layout = (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
      <div className="flex min-h-0 min-w-0 xl:col-span-8">{graphShell}</div>
      {detailRail}
    </div>
  );

  if (expanded) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5">
          <p className="text-[12.5px] text-text-primary">
            <span className="font-semibold">Graph expanded</span>
            <span className="text-text-muted"> — filter from nodes; Esc or Close to exit</span>
          </p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-lg border border-ink/15 bg-surface-raised px-3 py-1.5 text-[12px] font-semibold text-text-primary"
          >
            Close expand
          </button>
        </div>
        {createPortal(
          <div
            className="fixed inset-0 flex flex-col bg-scrim/60 p-2 backdrop-blur-sm sm:p-4"
            style={{ zIndex: Z.lightbox }}
            role="dialog"
            aria-modal="true"
            aria-label="Expanded edge knowledge graph"
          >
            <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-ink/12 bg-surface-raised shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.08] px-4 py-3">
                <div>
                  <p className="text-[14px] font-semibold text-text-primary">
                    Edge knowledge graph
                  </p>
                  <p className="text-[12px] text-text-muted">
                    Double-click a node or press Filter table — updates the signals list below
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(edgeFilterActive || filterTagSet.size > 0) && (
                    <button
                      type="button"
                      onClick={() => onClearFilter?.()}
                      className="rounded-lg border border-ink/[0.1] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                    >
                      Clear drill
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="rounded-lg border border-ink/15 bg-ink/[0.05] px-3 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-ink/[0.08]"
                  >
                    Close ✕
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{layout}</div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return layout;
}
