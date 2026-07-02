// src/components/aiArenaV6/BrainPanel.jsx
// ────────────────────────────────────────────────────────────────
// "AI Brain" — public window into the Compass self-learning vault.
// Left: Obsidian-style constellation graph (regime → lessons →
// postmortems) rendered as pure SVG with a deterministic radial layout.
// Right: lesson cards with status, evidence, and prompt rule.
// Self-fetching via GET /ai-arena/v6/brain; hides itself if vault empty.
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { getBrain } from "../../services/aiArenaV6Api";
import { Card, SectionHeader, Tag, StateBox, COLOR } from "./_ui";

const STATUS_TONE = { core: "gold", validated: "up", candidate: "neutral", retired: "muted" };

function pretty(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function lessonHex(lesson) {
  const line = String(lesson.prompt_line || "");
  if (line.startsWith("AVOID")) return COLOR.loss;
  if (String(lesson.status) === "core") return COLOR.gold;
  return COLOR.profit;
}

/* ── constellation graph: regime center → lesson nodes → postmortem dots ── */
function BrainGraph({ regime, lessons, postmortems }) {
  const W = 640, H = 420, CX = W / 2, CY = H / 2;
  const layout = useMemo(() => {
    const n = Math.max(lessons.length, 1);
    const R = 130;
    const nodes = lessons.map((lesson, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return {
        lesson,
        hex: lessonHex(lesson),
        x: CX + R * Math.cos(angle),
        y: CY + R * Math.sin(angle),
        angle,
      };
    });
    // attach each postmortem to its bias lesson (fallback: nearest node)
    const dots = [];
    postmortems.slice(0, 60).forEach((pm, j) => {
      const bias = String(pm.bias || "").toLowerCase();
      const host =
        nodes.find((node) => String(node.lesson.id || "").includes(bias)) ||
        nodes[j % Math.max(nodes.length, 1)];
      if (!host) return;
      const spread = ((j % 9) - 4) * 0.16;
      const dist = 62 + ((j * 13) % 34);
      const a = host.angle + spread;
      dots.push({
        x: host.x + dist * Math.cos(a),
        y: host.y + dist * Math.sin(a),
        hx: host.x,
        hy: host.y,
        hex: host.hex,
      });
    });
    return { nodes, dots };
  }, [lessons, postmortems]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Compass brain graph: lessons connected to the current market regime and loss postmortems"
    >
      {/* postmortem links + dots */}
      {layout.dots.map((d, i) => (
        <g key={`pm-${i}`}>
          <line x1={d.hx} y1={d.hy} x2={d.x} y2={d.y} stroke={d.hex} strokeOpacity="0.14" strokeWidth="1" />
          <circle cx={d.x} cy={d.y} r="2.6" fill={d.hex} fillOpacity="0.5" />
        </g>
      ))}
      {/* lesson links */}
      {layout.nodes.map((node) => (
        <line
          key={`l-${node.lesson.id}`}
          x1={CX} y1={CY} x2={node.x} y2={node.y}
          stroke={node.hex} strokeOpacity="0.35" strokeWidth="1.5"
        />
      ))}
      {/* lesson nodes */}
      {layout.nodes.map((node) => (
        <g key={`n-${node.lesson.id}`}>
          <circle cx={node.x} cy={node.y} r="17" fill={node.hex} fillOpacity="0.14" />
          <circle cx={node.x} cy={node.y} r="9" fill={node.hex} />
          <text
            x={node.x}
            y={node.y + (node.y >= CY ? 34 : -26)}
            textAnchor="middle"
            fill="rgba(255,255,255,0.75)"
            fontSize="10.5"
            fontFamily="JetBrains Mono, monospace"
          >
            {pretty(String(node.lesson.id).replace(/^(bias|flag)_/, "").replace(/_(trend_up|trend_down|flat|any)$/, ""))}
          </text>
          <text
            x={node.x}
            y={node.y + (node.y >= CY ? 47 : -13)}
            textAnchor="middle"
            fill={node.hex}
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
          >
            {node.lesson.hit_rate}% · n={node.lesson.evidence_n}
          </text>
        </g>
      ))}
      {/* regime center */}
      <circle cx={CX} cy={CY} r="34" fill={COLOR.gold} fillOpacity="0.12" />
      <circle cx={CX} cy={CY} r="24" fill="#1a0f08" stroke={COLOR.gold} strokeWidth="2" />
      <text x={CX} y={CY - 1} textAnchor="middle" fill={COLOR.goldLight} fontSize="9" fontFamily="JetBrains Mono, monospace">
        REGIME
      </text>
      <text x={CX} y={CY + 11} textAnchor="middle" fill="#fff" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
        {pretty(regime?.regime || "any")}
      </text>
    </svg>
  );
}

export default function BrainPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getBrain()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ available: false }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <StateBox text="Loading the Compass brain…" />;

  const lessons = data?.lessons || [];
  const postmortems = data?.postmortems || [];
  const regime = data?.regime || {};

  if (!data?.available) {
    return (
      <Card className="p-8 text-center">
        <div className="text-lg font-semibold text-white/80">The brain vault is still empty</div>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">
          Lessons appear here after the daily reflection worker has scored enough resolved
          projections. Check back after the next cycle.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* graph */}
      <div className="xl:col-span-7">
        <Card className="p-5 md:p-6">
          <SectionHeader
            label="Compass brain · knowledge graph"
            right={regime?.regime ? <Tag tone="gold">{pretty(regime.regime)}</Tag> : null}
          />
          <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-text-muted">
            The AI audits every projection it makes. Losses become postmortems (small dots),
            recurring patterns become lessons (large nodes), and validated lessons are fed
            back into the next forecast. This is its memory, live.
          </p>
          <BrainGraph regime={regime} lessons={lessons} postmortems={postmortems} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-text-muted/70">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.profit }} /> lesson: favor</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.loss }} /> lesson: avoid</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full opacity-60" style={{ background: COLOR.loss }} /> postmortem ({postmortems.length})</span>
          </div>
        </Card>
      </div>

      {/* lesson cards */}
      <div className="space-y-3 xl:col-span-5">
        <Card className="p-5">
          <SectionHeader label={`Operating lessons · ${lessons.length}`} />
          <div className="space-y-2.5">
            {lessons.map((lesson) => {
              const scored = (lesson.wins ?? 0) + (lesson.losses ?? 0);
              const winPct = scored ? Math.round((100 * (lesson.wins ?? 0)) / scored) : 0;
              return (
                <div key={lesson.id} className="rounded-lg border border-white/[0.05] bg-[#140b0d] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-white/90">
                      {pretty(String(lesson.id).replace(/^(bias|flag)_/, ""))}
                    </span>
                    <Tag tone={STATUS_TONE[String(lesson.status)] || "muted"}>{lesson.status}</Tag>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-5 text-text-muted">{lesson.prompt_line}</p>
                  <div className="mt-2.5 flex h-[6px] overflow-hidden rounded-full bg-white/[0.05]">
                    <span className="h-full" style={{ width: `${winPct}%`, background: COLOR.profit }} />
                    <span className="h-full" style={{ width: `${100 - winPct}%`, background: COLOR.loss, opacity: 0.7 }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-text-muted/70">
                    <span>{lesson.wins}W / {lesson.losses}L · n={lesson.evidence_n}</span>
                    {lesson.ab_with_wins != null && (lesson.ab_with_wins + (lesson.ab_with_losses || 0)) > 0 ? (
                      <span className="text-gold-light">
                        with lesson: {Math.round((100 * lesson.ab_with_wins) / Math.max(1, lesson.ab_with_wins + (lesson.ab_with_losses || 0)))}% hit
                      </span>
                    ) : (
                      <span>A/B collecting…</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4" accent="gold">
          <p className="text-[12px] leading-5 text-text-muted">
            <span className="font-semibold text-gold-light">How it learns: </span>
            every resolved projection updates these statistics nightly. Lessons that keep
            helping get promoted; lessons that stop working retire automatically.
          </p>
        </Card>
      </div>
    </div>
  );
}
