// frontend-react/src/components/aiArenaV6/CycleCompass.jsx
// Section 02 — Visual gauge of cycle position (0-100) with phase markers.

import React from 'react';
import {
  COLORS,
  FONTS,
  CYCLE_PHASES,
  cycleColorFor,
  cycleLabelFor,
} from './constants';
import Tooltip from './Tooltip';

export default function CycleCompass({ report }) {
  const cycle = report?.cycle || report?.report?.cycle_position || {};
  const score = cycle.score ?? 0;
  const phase = cycle.phase || '';
  const confidence = cycle.confidence || 'medium';

  // Component breakdown (from full report cycle_position)
  const components = report?.report?.cycle_position?.components || [];

  const markerColor = cycleColorFor(phase);
  const phaseLabel = cycleLabelFor(phase);

  // Notes from cycle position result
  const notes = report?.report?.cycle_position?.notes || [];

  return (
    <section
      style={{
        padding: '28px',
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: FONTS.mono,
            letterSpacing: 1.5,
            color: COLORS.gold,
            textTransform: 'uppercase',
          }}
        >
          02 ◆ Cycle Position
        </span>
        <Tooltip termKey="cycle-score">
          <span style={{ fontSize: 11, color: COLORS.textFaint }}>
            Long-term context
          </span>
        </Tooltip>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontFamily: FONTS.mono,
            color: COLORS.textFaint,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Confidence: {confidence}
        </span>
      </div>

      {/* Score + Phase */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 64,
            fontWeight: 500,
            color: markerColor,
            lineHeight: 1,
            letterSpacing: -2,
          }}
        >
          {Number(score).toFixed(0)}
        </span>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 14,
            color: COLORS.textFaint,
          }}
        >
          / 100
        </span>
        <div style={{ marginLeft: 18 }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              color: COLORS.text,
              fontWeight: 500,
            }}
          >
            {phaseLabel}
          </div>
          <div
            style={{
              fontSize: 10,
              fontFamily: FONTS.mono,
              color: COLORS.textFaint,
              letterSpacing: 1,
              marginTop: 2,
              textTransform: 'uppercase',
            }}
          >
            Current Phase
          </div>
        </div>
      </div>

      {/* Gauge bar */}
      <div style={{ position: 'relative', paddingTop: 8 }}>
        {/* Marker (above bar) */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(Math.max(score, 1), 99)}%`,
            top: 0,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 12,
              color: markerColor,
              fontWeight: 600,
              padding: '2px 8px',
              background: COLORS.bgPrimary,
              border: `1px solid ${markerColor}`,
              borderRadius: 4,
              marginBottom: 6,
              boxShadow: `0 0 12px ${markerColor}40`,
            }}
          >
            {Number(score).toFixed(1)}
          </div>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `8px solid ${markerColor}`,
              filter: `drop-shadow(0 0 4px ${markerColor})`,
            }}
          />
        </div>

        {/* Gradient bar */}
        <div
          style={{
            height: 8,
            marginTop: 36,
            borderRadius: 4,
            background: `linear-gradient(to right,
              ${COLORS.bullish} 0%,
              #84cc16 30%,
              ${COLORS.gold} 55%,
              #f97316 75%,
              ${COLORS.bearish} 95%
            )`,
            position: 'relative',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
          }}
        >
          {/* Phase boundaries (vertical ticks) */}
          {CYCLE_PHASES.slice(1).map((p) => (
            <div
              key={p.key}
              style={{
                position: 'absolute',
                left: `${p.range[0]}%`,
                top: -2,
                bottom: -2,
                width: 1,
                background: 'rgba(0,0,0,0.3)',
              }}
            />
          ))}
        </div>

        {/* Phase labels */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 10,
            paddingTop: 6,
          }}
        >
          {CYCLE_PHASES.map((p) => (
            <div
              key={p.key}
              style={{
                fontSize: 9,
                fontFamily: FONTS.mono,
                color: phase === p.key ? p.color : COLORS.textFaint,
                fontWeight: phase === p.key ? 600 : 400,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                textAlign: 'center',
                flex: 1,
              }}
            >
              {p.label}
              <div
                style={{
                  fontSize: 8,
                  marginTop: 2,
                  color: COLORS.textFaint,
                  opacity: 0.6,
                }}
              >
                {p.range[0]}–{p.range[1]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Component breakdown */}
      {components.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            paddingTop: 12,
            borderTop: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {components.map((c) => {
            if (!c.available) return null;
            return (
              <div
                key={c.key}
                style={{
                  padding: '10px 12px',
                  background: COLORS.bgElevated,
                  border: `1px solid ${COLORS.borderSubtle}`,
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: FONTS.mono,
                    color: COLORS.textFaint,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {c.label || c.key}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 12,
                      color: COLORS.text,
                      fontWeight: 500,
                    }}
                  >
                    {typeof c.raw_value === 'number' ? c.raw_value.toFixed(4) : c.raw_value}
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 10,
                      color: COLORS.gold,
                      marginLeft: 'auto',
                    }}
                  >
                    {Number(c.normalized).toFixed(0)}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    marginTop: 6,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(Math.max(c.normalized, 0), 100)}%`,
                      background: cycleColorFor(phase),
                      opacity: 0.7,
                    }}
                  />
                </div>
                {c.zone && (
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: FONTS.mono,
                      color: COLORS.textFaint,
                      marginTop: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    {c.zone.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            paddingTop: 12,
            borderTop: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: COLORS.gold }}>·</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
