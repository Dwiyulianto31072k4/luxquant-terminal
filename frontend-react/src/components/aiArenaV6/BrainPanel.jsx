// src/components/aiArenaV6/BrainPanel.jsx
// ────────────────────────────────────────────────────────────────
// "AI Brain" v2 — interactive Obsidian-style knowledge graph.
// • Pan (drag) + zoom (wheel / buttons), reset view
// • Hover tooltips on lessons and postmortems
// • Click a node (or a lesson card) to select + highlight
// • Node size scales with evidence; curved links; selection dimming
// Right rail: vault stats, clickable lesson cards, recent postmortems.
// Self-fetching via GET /ai-arena/v6/brain; graceful empty state.
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getBrain } from "../../services/aiArenaV6Api";
import { Card, SectionHeader, Tag, Tile, StateBox, GhostButton, COLOR } from "./_ui";

const STATUS_TONE = { core: "gold", validated: "up", candidate: "neutral", retired: "muted" };
const W = 720,
  H = 640,
  CX = W / 2,
  CY = H / 2;
const MIN_K = 0.5,
  MAX_K = 3.5;

function pretty(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyPrompt(line) {
  const raw = String(line || "").replaceAll("_", " ").trim();
  if (!raw) return "";
  const lowered = raw.replace(/\b([A-Z]{2,})\b/g, (word) => {
    if (/^\d/.test(word) || word === "AI" || word === "AB") return word;
    return word.toLowerCase();
  });
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

function shortLessonName(id) {
  return pretty(
    String(id)
      .replace(/^(bias|flag)_/, "")
      .replace(/_(trend_up|trend_down|flat|any)$/, "")
  );
}

function lessonHex(lesson) {
  const line = String(lesson.prompt_line || "");
  if (line.startsWith("AVOID")) return COLOR.loss;
  if (String(lesson.status) === "core") return COLOR.gold;
  return COLOR.profit;
}

/* ════════ layout: radial lessons + postmortem satellites ════════ */
function useGraphLayout(lessons, postmortems) {
  return useMemo(() => {
    const n = Math.max(lessons.length, 1);
    const R = 248;
    const nodes = lessons.map((lesson, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const evidence = Number(lesson.evidence_n) || 0;
      return {
        lesson,
        hex: lessonHex(lesson),
        r: Math.min(24, 11 + Math.sqrt(evidence) * 1.6),
        x: CX + R * Math.cos(angle),
        y: CY + R * Math.sin(angle),
        angle,
      };
    });
    const dots = [];
    postmortems.slice(0, 70).forEach((pm, j) => {
      const bias = String(pm.bias || "").toLowerCase();
      const host =
        nodes.find((node) => String(node.lesson.id || "").includes(bias)) ||
        nodes[j % Math.max(nodes.length, 1)];
      if (!host) return;
      const spread = ((j % 11) - 5) * 0.1;
      const dist = host.r + 22 + ((j * 11) % 28);
      const a = host.angle + spread;
      dots.push({
        pm,
        hostId: host.lesson.id,
        hex: host.hex,
        x: host.x + dist * Math.cos(a),
        y: host.y + dist * Math.sin(a),
        hx: host.x,
        hy: host.y,
      });
    });
    return { nodes, dots };
  }, [lessons, postmortems]);
}

/* ════════ interactive graph ════════ */
function BrainGraph({ regime, lessons, postmortems, selected, onSelect }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [tooltip, setTooltip] = useState(null); // {x, y, lines: []}
  const dragRef = useRef(null);
  const { nodes, dots } = useGraphLayout(lessons, postmortems);

  /* wheel zoom (non-passive so preventDefault works) */
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

  /* pan */
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
    const rect = wrapRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 10, lines });
  };

  const dimmed = (id) => selected && selected !== id;

  return (
    <div ref={wrapRef} className="relative h-full min-h-[380px] w-full overflow-hidden">
      {/* zoom controls */}
      <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
        {[
          { label: "+", fn: () => zoomBy(1.3), aria: "Zoom in" },
          { label: "−", fn: () => zoomBy(1 / 1.3), aria: "Zoom out" },
          { label: "⟲", fn: resetView, aria: "Reset view" },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.aria}
            onClick={b.fn}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.1] bg-surface-secondary/90 text-[14px] text-text-primary backdrop-blur transition hover:border-ink/18 hover:bg-ink/[0.06] md:h-9 md:w-9 md:text-[15px]"
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-4rem)] rounded-md border border-ink/[0.07] lq-well px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted backdrop-blur">
        <span className="md:hidden">drag · pinch · tap</span>
        <span className="hidden md:inline">drag to pan · scroll to zoom · click a node</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full min-h-[380px] w-full cursor-grab touch-none select-none rounded-xl border border-ink/[0.08] bg-surface-raised active:cursor-grabbing xl:min-h-0"
        role="img"
        aria-label="Interactive Compass brain graph"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onPointerUp();
          setTooltip(null);
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* postmortem satellites */}
          {dots.map((d, i) => (
            <g key={`pm-${i}`} opacity={dimmed(d.hostId) ? 0.12 : 1}>
              <path
                d={`M ${d.hx} ${d.hy} Q ${(d.hx + d.x) / 2 + 8} ${(d.hy + d.y) / 2 - 8} ${d.x} ${d.y}`}
                fill="none"
                stroke={d.hex}
                strokeOpacity="0.16"
                strokeWidth="1"
              />
              <circle
                cx={d.x}
                cy={d.y}
                r="3.4"
                fill={d.hex}
                fillOpacity="0.55"
                className="cursor-pointer"
                onMouseEnter={(e) =>
                  showTip(e, [
                    `Postmortem ${String(d.pm.id).slice(0, 18)}…`,
                    `${pretty(d.pm.bias)} · ${pretty(d.pm.market_mode)}`,
                    `Travelled ${d.pm.progress_to_target_pct ?? 0}% toward target before the stop`,
                  ])
                }
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          ))}

          {/* regime → lesson links */}
          {nodes.map((node) => (
            <path
              key={`l-${node.lesson.id}`}
              d={`M ${CX} ${CY} Q ${(CX + node.x) / 2 + 14} ${(CY + node.y) / 2 - 14} ${node.x} ${node.y}`}
              fill="none"
              stroke={node.hex}
              strokeOpacity={dimmed(node.lesson.id) ? 0.08 : 0.4}
              strokeWidth={selected === node.lesson.id ? 2.5 : 1.5}
            />
          ))}

          {/* lesson nodes */}
          {nodes.map((node) => {
            const isSel = selected === node.lesson.id;
            return (
              <g
                key={`n-${node.lesson.id}`}
                opacity={dimmed(node.lesson.id) ? 0.22 : 1}
                className="cursor-pointer"
                onClick={() => {
                  if (!dragRef.current?.moved) onSelect(isSel ? null : node.lesson.id);
                }}
                onMouseEnter={(e) =>
                  showTip(e, [
                    shortLessonName(node.lesson.id),
                    `${node.lesson.status} · ${node.lesson.hit_rate}% hit · n=${node.lesson.evidence_n}`,
                    String(node.lesson.prompt_line || "").slice(0, 90),
                  ])
                }
                onMouseLeave={() => setTooltip(null)}
              >
                {isSel && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 10}
                    fill="none"
                    stroke={node.hex}
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                )}
                <circle cx={node.x} cy={node.y} r={node.r + 7} fill={node.hex} fillOpacity="0.13" />
                <circle cx={node.x} cy={node.y} r={node.r} fill={node.hex} />
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill="#140b0d"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.lesson.hit_rate}%
                </text>
                <text
                  x={node.x}
                  y={node.y + (node.y >= CY ? node.r + 22 : -node.r - 14)}
                  textAnchor="middle"
                  fill="rgb(var(--ink) / 0.82)"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {shortLessonName(node.lesson.id)}
                </text>
                <text
                  x={node.x}
                  y={node.y + (node.y >= CY ? node.r + 36 : -node.r - 28) * (node.y >= CY ? 1 : 1)}
                  textAnchor="middle"
                  fill={node.hex}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.lesson.wins}W / {node.lesson.losses}L
                </text>
              </g>
            );
          })}

          {/* regime center */}
          <g
            className="cursor-pointer"
            onClick={() => {
              if (!dragRef.current?.moved) onSelect(null);
            }}
            onMouseEnter={(e) =>
              showTip(
                e,
                [
                  `Regime: ${pretty(regime?.regime || "any")}`,
                  regime?.sigma_1h_pct ? `σ 1h: ${regime.sigma_1h_pct}%` : null,
                  regime?.trend_72h_pct != null
                    ? `72h tape: ${regime.trend_72h_pct > 0 ? "+" : ""}${regime.trend_72h_pct}%`
                    : null,
                ].filter(Boolean)
              )
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <circle cx={CX} cy={CY} r="38" fill={COLOR.gold} fillOpacity="0.1" />
            <circle cx={CX} cy={CY} r="26" fill="#1a0f08" stroke={COLOR.gold} strokeWidth="2" />
            <text
              x={CX}
              y={CY - 4}
              textAnchor="middle"
              fill={COLOR.goldLight}
              fontSize="9.5"
              fontFamily="JetBrains Mono, monospace"
            >
              REGIME
            </text>
            <text
              x={CX}
              y={CY + 10}
              textAnchor="middle"
              /* Was "#fff" — the regime label vanished on the bright theme.
                 SVG fill takes the same token the rest of the page uses. */
              fill="rgb(var(--fg))"
              fontSize="10.5"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              {pretty(regime?.regime || "any")}
            </text>
          </g>
        </g>
      </svg>

      {/* tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-ink/12 bg-surface-secondary/95 px-3 py-2 shadow-[0_8px_30px_rgb(var(--scrim) / 0.35)] backdrop-blur"
          style={{
            left: Math.min(tooltip.x, (wrapRef.current?.clientWidth || 400) - 270),
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
    </div>
  );
}

/* ════════ main panel ════════ */
export default function BrainPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getBrain()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData({ available: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <StateBox text="Loading the Compass brain…" />;

  const lessons = data?.lessons || [];
  const postmortems = data?.postmortems || [];
  const regime = data?.regime || {};
  const validatedCount = lessons.filter((l) =>
    ["validated", "core"].includes(String(l.status))
  ).length;

  if (!data?.available) {
    return (
      <Card className="p-8 text-center">
        <div className="text-lg font-semibold text-text-primary">
          The brain vault is still empty
        </div>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">
          Lessons appear here after the daily reflection worker has scored enough resolved
          projections. Check back after the next cycle.
        </p>
      </Card>
    );
  }

  const selectedLesson = lessons.find((l) => l.id === selected) || null;
  const linkedPostmortems = selectedLesson
    ? postmortems.filter((pm) =>
        String(selectedLesson.id).includes(String(pm.bias || "").toLowerCase())
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-ink/[0.06]">
        <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Regime", value: pretty(regime?.regime || "any"), tone: "text-text-primary" },
            {
              label: "1h realized σ",
              value: regime?.sigma_1h_pct != null ? `${regime.sigma_1h_pct}%` : "—",
              tone: "text-text-primary",
            },
            {
              label: "72h tape",
              value:
                regime?.trend_72h_pct != null
                  ? `${regime.trend_72h_pct > 0 ? "+" : ""}${regime.trend_72h_pct}%`
                  : "—",
              tone: Number(regime?.trend_72h_pct) >= 0 ? "text-profit" : "text-loss",
            },
            { label: "Lessons", value: String(lessons.length), tone: "text-text-primary" },
            { label: "Validated", value: String(validatedCount), tone: "text-profit" },
            { label: "Postmortems", value: String(postmortems.length), tone: "text-loss" },
          ].map((cell) => (
            <div key={cell.label} className="bg-surface-raised px-3.5 py-3">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {cell.label}
              </p>
              <p className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${cell.tone}`}>
                {cell.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
        <Card className="flex min-h-0 flex-col p-3 md:p-4 xl:h-[min(72vh,680px)]">
            <SectionHeader
              label="Compass brain · knowledge graph"
              right={regime?.regime ? <Tag tone="gold">{pretty(regime.regime)}</Tag> : null}
            />
            <p className="mb-2 text-[12px] leading-snug text-text-muted">
              Nodes are lessons (bigger = more evidence). Small dots are losses. Click a node.
            </p>
            <div className="relative min-h-[380px] flex-1">
            <BrainGraph
              regime={regime}
              lessons={lessons}
              postmortems={postmortems}
              selected={selected}
              onSelect={setSelected}
            />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.profit }} />{" "}
                favor
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.loss }} />{" "}
                avoid
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.gold }} />{" "}
                core (human-pinned)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full opacity-60"
                  style={{ background: COLOR.loss }}
                />{" "}
                postmortem ({postmortems.length})
              </span>
              {selected && (
                <GhostButton size="sm" onClick={() => setSelected(null)}>
                  Clear selection
                </GhostButton>
              )}
            </div>

            {/* selection detail */}
            {selectedLesson && (
              <div className="mt-2 rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-text-primary">
                    {shortLessonName(selectedLesson.id)}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    {selectedLesson.wins}W / {selectedLesson.losses}L · {selectedLesson.hit_rate}%
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-text-muted">
                  {prettyPrompt(selectedLesson.prompt_line)}
                </p>
              </div>
            )}
          </Card>

        <Card className="flex min-h-0 flex-col p-3 md:p-4 xl:h-[min(72vh,680px)]">
            <SectionHeader label={`Operating lessons · ${lessons.length}`} />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 custom-scrollbar">
              {lessons.map((lesson) => {
                const scored = (lesson.wins ?? 0) + (lesson.losses ?? 0);
                const winPct = scored ? Math.round((100 * (lesson.wins ?? 0)) / scored) : 0;
                const isSel = selected === lesson.id;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setSelected(isSel ? null : lesson.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      isSel
                        ? "border-ink/25 bg-ink/[0.04]"
                        : "border-ink/[0.08] bg-surface-raised hover:border-ink/16"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-text-primary">
                        {pretty(String(lesson.id).replace(/^(bias|flag)_/, ""))}
                      </span>
                      <span
                        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                          String(lesson.status) === "validated" || String(lesson.status) === "core"
                            ? "border-positive/20 bg-positive/10 text-positive"
                            : String(lesson.status) === "retired"
                              ? "border-ink/10 bg-ink/[0.04] text-text-muted"
                              : "border-ink/10 bg-ink/[0.04] text-text-secondary"
                        }`}
                      >
                        {pretty(lesson.status)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[12px] leading-snug text-text-muted">
                      {prettyPrompt(lesson.prompt_line)}
                    </p>
                    <div className="mt-2 flex h-[5px] overflow-hidden rounded-full bg-ink/[0.06]">
                      <span
                        className="h-full"
                        style={{ width: `${winPct}%`, background: COLOR.profit }}
                      />
                      <span
                        className="h-full"
                        style={{ width: `${100 - winPct}%`, background: COLOR.loss, opacity: 0.7 }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-text-muted">
                      <span>
                        {lesson.wins}W / {lesson.losses}L · n={lesson.evidence_n}
                      </span>
                      {lesson.ab_with_wins != null &&
                      lesson.ab_with_wins + (lesson.ab_with_losses || 0) > 0 ? (
                        <span className="text-text-primary">
                          with lesson:{" "}
                          {Math.round(
                            (100 * lesson.ab_with_wins) /
                              Math.max(1, lesson.ab_with_wins + (lesson.ab_with_losses || 0))
                          )}
                          % hit
                        </span>
                      ) : (
                        <span>A/B collecting…</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {postmortems.length > 0 ? (
                <div className="pt-2">
                  <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Recent postmortems
                  </p>
                  <div className="space-y-1.5">
                    {postmortems.slice(0, 6).map((pm) => (
                      <div
                        key={pm.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-ink/[0.08] px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[11px] text-text-primary">{pm.id}</div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                            {pretty(pm.bias)} · {pretty(pm.market_mode)}
                          </div>
                        </div>
                        <div className="shrink-0 font-mono text-[12px] tabular-nums text-loss">
                          {pm.progress_to_target_pct ?? 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-2 border-t border-ink/[0.06] pt-2 text-[11px] leading-snug text-text-muted">
              <span className="font-medium text-text-primary">How it learns. </span>
              Nightly scores promote lessons that keep helping and retire the rest.
            </p>
          </Card>
      </div>
    </div>
  );
}
