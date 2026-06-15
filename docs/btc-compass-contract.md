# BTC Compass Product Contract

Status: foundation contract for the current Compass rebuild.

## Product Purpose

BTC Compass is a market decision-support dashboard. It summarizes market data,
liquidity, news, and model interpretation so a user can judge conditions more
quickly. It is not a signal service and does not prescribe entries, stops,
position size, leverage, or guaranteed outcomes.

## Core Outputs

- Tactical outlook: next 24 hours.
- Swing outlook: next 72 hours. The existing `secondary_7d` storage key remains
  temporarily for backward compatibility, but the product label is 72 hours.
- Cycle context: broader market phase, not a direct trade direction.
- Data evidence: values, timestamps, source health, and what changed.
- Risks and invalidation conditions: facts that would weaken the current view.

Every directional output must include confidence and the data-quality state that
supported it.

## Data Roles

- Price and market structure establish the current regime.
- Liquidation heatmap identifies nearby liquidity magnets and imbalance.
- Macro, on-chain, and smart-money layers provide broader context.
- News and economic events provide narrative and event-risk context. News may
  adjust confidence or raise warnings, but must not manufacture a direction.
- AI compresses evidence, explains conflicts, and writes the narrative. It must
  not silently replace missing data with a market opinion.

## Data Quality States

Every external source must resolve to one of these states:

- `fresh`: a valid payload was fetched in the current cycle.
- `stale`: the current fetch failed, but a valid last-good payload is still
  inside the source-specific age limit.
- `unavailable`: no valid payload is available inside the age limit.

`unavailable` is not `neutral`. Neutral means valid evidence is balanced.
Unavailable means there is not enough evidence to score that source.

For the CoinAnk heatmap through Apify:

- Last-good cache retention: 24 hours for diagnostics.
- Maximum usable stale age: 8 hours.
- Deterministic direction and shadow comparison are ineligible when liquidity
  is unavailable.
- Stale observations remain explicitly marked so later evaluation can separate
  fresh and stale performance.

## Decision Boundaries

Compass may display:

- directional bias and confidence;
- liquidity magnets and zones to watch;
- confluence and disagreement;
- event-risk warnings;
- thesis invalidation conditions;
- source freshness and missing-data warnings.

Compass does not display:

- setup grades such as A/B/C;
- direct buy or sell commands;
- exact entry, stop-loss, take-profit, or position-size instructions;
- claims of certainty or expected profit.

## Activation Gates

Deterministic direction remains behind `COMPASS_DETERMINISTIC_VERDICT`.
It may be activated only after shadow records are:

- produced from eligible liquidity data;
- evaluated separately for 24-hour and 72-hour horizons;
- segmented by fresh versus stale liquidity;
- demonstrably more stable or accurate than the current baseline.

Until those gates pass, the deterministic result is research metadata and must
not override the user-facing direction.

## Delivery Order

1. Stabilize ingestion, freshness, schema validation, and observability.
2. Add structured news and economic-event context.
3. Build a transparent 24-hour and 72-hour evidence matrix.
4. Validate shadow models and calibrate confidence.
5. Redesign the dashboard around evidence and data health.
6. Add alerts, monitoring, and operational runbooks.

## Phase 2 Validation

The Binance estimated liquidation map remains in shadow-validation mode.
Phase 2 adds:

- collector heartbeat and forecast freshness monitoring;
- persistent actual-liquidation audit records that survive Redis flushes;
- event-weighted and notional-weighted match rates;
- an initial calibration threshold of 20 events;
- a robust evaluation threshold of 100 events;
- explicit readiness gates visible in AI Arena.

Passing a sample threshold does not activate deterministic direction. Activation
requires a separate review against a baseline and evidence that performance is
stable across market regimes.

## Phase 3 News And Event Risk

Phase 3 structures the existing RSS news and ForexFactory economic calendar
into one auditable context layer:

- duplicate headlines are collapsed before scoring;
- headlines are grouped into macro, regulation, institutional-flow,
  market-stress, and Bitcoin-market topics;
- each headline includes source, publication time, relevance, impact, and
  contextual risk tone;
- upcoming macro events are ranked for BTC relevance and placed into 24-hour
  and 72-hour risk windows;
- news and calendar sources expose `fresh`, `stale`, or `unavailable` health;
- the complete snapshot is stored inside each v6 report so it can be compared
  with the report's 24-hour and 72-hour outcomes.

This layer has no direction authority. It cannot create, reverse, or strengthen
a bullish, bearish, or neutral call. When scheduled event risk is elevated, it
may only reduce existing 24-hour and 72-hour confidence and append an explicit
risk warning. The before/after confidence values and unchanged directions are
stored in the snapshot audit.

## Phase 4 Transparent Evidence Matrix

Phase 4 stores and displays one deterministic evidence matrix for the 24-hour
and 72-hour horizons. The rows are:

- observed price action;
- estimated liquidation liquidity;
- derivatives;
- smart-money positioning;
- macro liquidity;
- on-chain behavior;
- cycle context;
- news and scheduled event risk.

Each row exposes its condition, strength, horizon weight, source health, source
age, supporting values, and material change from the preceding report.
Unavailable evidence remains `unavailable`; it is never converted into a
neutral vote.

The matrix publishes a weighted evidence bias, coverage, directional conflicts,
and comparison with the user-facing verdict. It is an audit surface only and
has `decision_authority=false`. Cycle context and event risk have zero
directional weight: cycle remains a slow backdrop, while news/events remain a
confidence guardrail.

## Phase 5 Shadow Validation And Confidence Calibration

Phase 5 compares the user-facing verdict and deterministic shadow model against
the same resolved 24-hour and 72-hour outcomes. The audit publishes:

- baseline and shadow hit rates on the same eligible sample;
- the shadow model's edge or deficit versus the baseline;
- mean confidence, calibration gap, Brier score, and confidence bands;
- agreement and disagreement outcomes;
- performance segmented by liquidity freshness and evidence coverage;
- explicit initial-sample, robust-sample, edge, calibration, and
  regime-stability gates.

Historical outcomes that predate shadow metadata remain visible in the baseline
record but are not silently counted as shadow observations. Missing freshness or
coverage metadata is labeled as legacy or not recorded.

Phase 5 has `decision_authority=false`. Passing every gate only makes a horizon
eligible for manual review. It never enables `COMPASS_DETERMINISTIC_VERDICT`
automatically and never changes the user-facing direction.
