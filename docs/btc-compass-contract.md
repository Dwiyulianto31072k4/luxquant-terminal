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
