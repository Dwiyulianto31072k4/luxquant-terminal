// frontend-react/src/components/aiArenaV6/VerdictHero.jsx
// Section 01 — BLUF verdict hero with 3 horizons + invalidation levels.

import React from 'react';
import {
  COLORS,
  FONTS,
  directionColor,
  directionBg,
  directionBorder,
  directionArrow,
  directionLabel,
  formatPrice,
} from './constants';

function HorizonCard({ label, horizonLabel, verdict }) {
  if (!verdict) return null;
  const dir = (verdict.direction || 'neutral').toLowerCase();
  const color = directionColor(dir);
  const bg = directionBg(dir);
  const border = directionBorder(dir);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        padding: '16px 18px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: FONTS.mono,
          letterSpacing: 1.2,
          color: COLORS.textFaint,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 18, color, fontWeight: 600, lineHeight: 1 }}>
          {directionArrow(dir)}
        </span>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 500,
            color: COLORS.text,
            letterSpacing: 0.2,
          }}
        >
          {directionLabel(dir)}
        </span>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 13,
            color: COLORS.gold,
            marginLeft: 'auto',
            fontWeight: 500,
          }}
        >
          {verdict.confidence}%
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          fontFamily: FONTS.mono,
          color: COLORS.textFaint,
          letterSpacing: 0.8,
        }}
      >
        {horizonLabel}
      </div>
      {verdict.rationale && (
        <div
          style={{
            fontSize: 12,
            color: COLORS.textMuted,
            lineHeight: 1.5,
            marginTop: 4,
          }}
        >
          {verdict.rationale}
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, valueColor = COLORS.text }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 130,
        padding: '12px 14px',
        background: COLORS.bgElevated,
        border: `1px solid ${COLORS.borderSubtle}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: FONTS.mono,
          letterSpacing: 1.5,
          color: COLORS.textFaint,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 14,
          color: valueColor,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function VerdictHero({ report, btcPrice }) {
  if (!report) return null;

  const verdict = report.report?.verdict || {};
  const verdictSummary = report.verdict_summary || {};
  const cycle = report.cycle || {};
  const critique = report.report?.critique || {};

  const headline = verdict.headline || 'Verdict not available';
  const narrative = verdict.narrative || '';

  // Use full verdict objects (with rationale) if available
  const primary30d = verdict.primary_30d || verdictSummary.primary_30d;
  const secondary7d = verdict.secondary_7d || verdictSummary.secondary_7d;
  const tactical24h = verdict.tactical_24h || verdictSummary.tactical_24h;

  const invalidationLevels = verdict.invalidation_levels || [];
  const bullishInvalid = invalidationLevels.find((l) => l.direction === 'bullish_invalidated');
  const bearishInvalid = invalidationLevels.find((l) => l.direction === 'bearish_invalidated');

  const primaryColor = directionColor(primary30d?.direction);

  return (
    <section
      style={{
        position: 'relative',
        padding: '32px 28px',
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 10,
          fontFamily: FONTS.mono,
          letterSpacing: 1.5,
          color: COLORS.gold,
          textTransform: 'uppercase',
        }}
      >
        <span style={{ fontSize: 14 }}>◆</span>
        <span>Market Stance</span>
        {report.report_id && (
          <span style={{ marginLeft: 'auto', color: COLORS.textFaint }}>
            {report.report_id}
          </span>
        )}
      </div>

      {/* Headline */}
      <div>
        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 32,
            fontWeight: 500,
            color: COLORS.text,
            lineHeight: 1.2,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          {headline.split('—').map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: COLORS.goldDim }}> — </span>}
              {part.trim()}
            </React.Fragment>
          ))}
        </h1>
        {narrative && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              color: COLORS.textMuted,
              lineHeight: 1.7,
              marginTop: 16,
              maxWidth: 760,
            }}
          >
            {narrative}
          </p>
        )}
      </div>

      {/* 3 Horizon cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <HorizonCard label="Primary" horizonLabel="30-DAY HORIZON" verdict={primary30d} />
        <HorizonCard label="Short-term" horizonLabel="7-DAY HORIZON" verdict={secondary7d} />
        <HorizonCard label="Tactical" horizonLabel="24-HOUR HORIZON" verdict={tactical24h} />
      </div>

      {/* Stat row: Cycle phase + score + critique decision + price */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatChip
          label="BTC Price"
          value={formatPrice(btcPrice ?? report.btc_price)}
          valueColor={COLORS.gold}
        />
        <StatChip
          label="Cycle Phase"
          value={cycle.phase || '—'}
          valueColor={primaryColor}
        />
        <StatChip
          label="Cycle Score"
          value={cycle.score != null ? `${Number(cycle.score).toFixed(1)} / 100` : '—'}
        />
        <StatChip
          label="AI Self-Audit"
          value={
            critique.decision === 'approved'
              ? 'Approved ✓'
              : critique.decision === 'approved_with_caveat'
              ? 'Caveat ⚠'
              : critique.decision === 'needs_revision'
              ? 'Revise ✗'
              : '—'
          }
          valueColor={
            critique.decision === 'approved'
              ? COLORS.bullish
              : critique.decision === 'needs_revision'
              ? COLORS.bearish
              : COLORS.cautious
          }
        />
      </div>

      {/* Invalidation levels */}
      {(bullishInvalid || bearishInvalid) && (
        <div
          style={{
            padding: '14px 16px',
            background: 'rgba(212, 168, 83, 0.04)',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: FONTS.mono,
              letterSpacing: 1.5,
              color: COLORS.gold,
              textTransform: 'uppercase',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚠</span>
            <span>Invalidation Levels</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bullishInvalid && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    color: COLORS.bearish,
                    minWidth: 70,
                  }}
                >
                  Bullish×
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 13,
                    color: COLORS.text,
                    fontWeight: 600,
                    minWidth: 80,
                  }}
                >
                  {formatPrice(bullishInvalid.price)}
                </span>
                <span style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
                  {bullishInvalid.reason}
                </span>
              </div>
            )}
            {bearishInvalid && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    color: COLORS.bullish,
                    minWidth: 70,
                  }}
                >
                  Bearish×
                </span>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 13,
                    color: COLORS.text,
                    fontWeight: 600,
                    minWidth: 80,
                  }}
                >
                  {formatPrice(bearishInvalid.price)}
                </span>
                <span style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
                  {bearishInvalid.reason}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Critique caveat (if any) */}
      {critique.suggested_caveat && (
        <div
          style={{
            padding: '12px 14px',
            background: COLORS.cautiousBg,
            border: `1px solid ${COLORS.cautiousBorder}`,
            borderRadius: 6,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: 14, color: COLORS.cautious, lineHeight: 1.4 }}>⚠</span>
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: FONTS.mono,
                letterSpacing: 1.2,
                color: COLORS.cautious,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              AI Self-Caveat
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              {critique.suggested_caveat}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
