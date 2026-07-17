# LuxQuant Terminal — Trader Metrics Research & Innovation Backlog

*What professional crypto traders actually watch, mapped to what the terminal already
shows, and concrete new visualizations that would help users most. July 2026.*

---

## 1. The metrics traders actually watch

Grouped into five families. For each: what it is, why it moves decisions.

### A. Derivatives / positioning (the "fuel gauge")
| Metric | What it tells a trader |
|---|---|
| **Funding rate** | Who's paying to hold the position. Persistently high +funding = crowded longs (squeeze-down risk); negative = shorts pay longs (squeeze-up fuel). >0.05%/8h is "overheated". |
| **Open interest (OI)** | Size of leveraged bets. OI↑ + price↑ = new longs (real trend fuel); OI↑ + price flat = fragile buildup; OI↓ = deleveraging. |
| **Long/Short ratio** | Crowd positioning; extremes flag exhaustion/reversals. Retail-vs-top-trader divergence = "smart money vs crowd". |
| **Liquidations & liquidation heatmap** | *The single most-requested pro tool (Coinglass flagship).* Price levels where stacked leverage gets force-closed act as **magnets** and reversal zones — used to place stops and pick targets. |
| **Basis / perp premium** | Mark vs index/spot spread. Rich basis = greed/carry; inverted = stress. |

### B. Spot market structure
| Metric | Why |
|---|---|
| **Volume / turnover (Vol/MCap)** | Real participation vs noise; separates genuine pumps from illiquid wicks. |
| **Order-book depth / slippage** | "Can I actually fill my size without moving price?" — liquidity reality check. |
| **Volatility (ATR / realized vol)** | Sizing the stop and the position. ATR normalizes moves so a 5% move in BTC ≠ 5% in a micro-cap. |

### C. On-chain (the "supply/demand truth")
| Metric | Why |
|---|---|
| **Exchange netflow** | Coins leaving exchanges = accumulation (bullish); flowing in = sell-pressure. |
| **Stablecoin supply / inflow** | Dry powder waiting to buy. Rising = fuel for rallies. |
| **Whale accumulation/distribution** | Big wallets front-run moves. |
| **MVRV / SOPR** | Market-wide profit/loss regime. MVRV >3 = froth/top zone; <1 = bottom zone. SOPR >1 = holders in profit selling. |
| **Active addresses** | Network health / demand. |

### D. Regime & breadth (the "backdrop")
| Metric | Why |
|---|---|
| **BTC dominance** | ~60% pivot: above = BTC-led/defensive; below = alts get oxygen. |
| **Altseason index** | ≥75% of top-100 beat BTC over 90d = risk-on rotation. |
| **ETH/BTC + TOTAL2** | Confirmation of alt-friendly regime. |
| **Fear & Greed** | Sentiment extreme = contrarian signal. |
| **Market breadth** | % of coins up / above key MAs — is the tide with you? |
| **Cross-asset correlation** | In risk-on, correlations → 1 (everything moves together = diversification fails). Narrative regimes decorrelate. |

### E. Performance / risk (the "am I actually good?" layer)
| Metric | Why |
|---|---|
| **Risk:Reward (R)** | Set per trade from entry/SL/TP. 1:3 needs only ~25% win rate to profit. |
| **Position size** | `(account × risk%) / (entry−SL distance)`. The #1 practical need for a signal-follower. |
| **Win rate** | Only meaningful *with* R. |
| **Expectancy** | `(WR×avgWin) − (LR×avgLoss)` = expected profit per trade. Negative expectancy can't be sized away. |
| **R-multiple** | Each trade in units of risk (detaches from $). |
| **Max drawdown** | Largest peak-to-trough. 80% return @15% DD ≫ 80% @60% DD. |
| **Profit factor / Sharpe** | Gross win/loss & risk-adjusted return. |

---

## 2. What the terminal already covers ✅

- **Derivatives**: funding, OI (Δ×price quadrant, builders/unwinds), LSR (distribution, top-vs-retail, taker pressure, crowded positioning), squeeze score.
- **Spot structure**: Vol/MCap everywhere, volume spike detector, momentum (RS × vol accel).
- **Regime**: BTC/ETH dominance gauges, altseason index, sector rotation, breadth (live), anomaly detection.
- **Performance**: win rate, from-call %, max target, time-to-TP1, outcomes by day, **Edge Simulator** (win rate × sample × expected value per confluence pattern).
- **Signal layer**: confluence tags, MTF alignment, HTF strength, coiled setups, per-coin live status + call time.

**Verdict:** the terminal is strong on *positioning* and *signal quality*, weak on **liquidations, on-chain, volatility-normalized risk, and the personal "turn a signal into a sized trade / track my performance" layer.**

---

## 3. Gaps = innovation opportunities

Ranked by **(impact to a signal-follower) × (feasibility with current data)**.

Current data available in-house: Bybit blob (price, mark, funding, OI, vol), screener signals (entry, TP1–4, SL, status, sector, risk), edge-lab (historical outcomes per pattern), whale worker (BTC/ETH large txs), live prices.

---

### 🥇 Tier 1 — build these first (high impact, data already here)

**1. Position Size & Risk Calculator (per signal)**
- *What*: user enters account size + risk %; for a chosen signal we compute position size, leverage, $ risk, and R:R to each TP from its entry/SL/TP.
- *Why*: the #1 practical thing a signal-follower needs — turns "here's a call" into "here's exactly how much to buy." No competitor signal service does this well inline.
- *Data*: screener already has entry/SL/TP. Pure client-side math.
- *Viz*: compact panel in the signal detail modal + a standalone tab; a small R:R ladder bar (risk 1R down, TP1/2/3/4 as +R up).

**2. R-multiple & Expectancy upgrade to the track record**
- *What*: extend Edge Simulator / Overview from win-rate-only to **expectancy, avg R-multiple, profit factor, and a "follow-every-signal" equity curve + max drawdown.**
- *Why*: proves the edge in the language pros trust; "85% win rate" alone is marketing — expectancy + DD is truth.
- *Data*: edge-lab already returns avg_win_peak / avg_loss_peak / EV per pattern → aggregate.
- *Viz*: equity curve with drawdown shading; expectancy leaderboard; profit-factor KPI.

**3. Liquidation-aware targets (light version)**
- *What*: estimate leverage-liquidation clusters from OI + funding + price, and show the nearest cluster relative to each signal's TPs/SL ("TP2 sits just under a long-liq cluster → likely magnet").
- *Why*: liquidation levels are the pro trader's favorite magnet/stop tool (Coinglass's whole business). Even an approximation is a differentiator.
- *Data*: Bybit OI + price; Bybit also streams `allLiquidation` (real liquidations) via WS — could ingest for a live liquidations feed.
- *Viz*: a per-coin "liquidation ladder" and a market-wide recent-liquidations tape.

---

### 🥈 Tier 2 — strong, needs a bit more data/work

**4. Market Regime gauge (one fused score)**
- *What*: single risk-on/off dial fusing BTC dominance, altseason, breadth, aggregate funding, and BTC trend → "Alt Risk-On 72/100".
- *Why*: users take calls without knowing the backdrop; one number frames every decision.
- *Data*: all pieces already computed (dominance, altseason, breadth, funding).
- *Viz*: a hero gauge on Overview + a small persistent chip in the header.

**5. Volatility (ATR) normalization**
- *What*: per-coin ATR%/realized vol; show moves and SL distances in ATR units; "this coin normally moves X%/day."
- *Why*: right-sizes expectations and stops; a 5% SL on a low-vol coin ≠ on a memecoin.
- *Data*: compute ATR from klines (worker already batches RSI klines — reuse).
- *Viz*: ATR column in Matrix/Screener; "moves in ATR" in the detail modal.

**6. Basis / perp premium panel**
- *What*: mark−index premium per called coin; flag overheated (rich basis) vs stressed (inverted).
- *Data*: Bybit gives mark + index price already.
- *Viz*: add to Funding & Squeeze tab.

**7. Cross-coin correlation / concentration guard**
- *What*: correlation clusters of the called coins so a user doesn't unknowingly take 5 highly-correlated longs (= one big bet).
- *Why*: correlations spike to ~1 in risk-on; "diversification" is often an illusion.
- *Viz*: correlation heatmap / clustered network of active signals.

---

### 🥉 Tier 3 — bigger lift / needs external data

**8. On-chain regime strip** — exchange netflow, stablecoin supply, MVRV/SOPR (BTC/ETH macro). Whale worker exists; would need a netflow/stablecoin feed. High value as a "backdrop" ribbon.

**9. Order-book depth / slippage estimate** — "fill X size within Y% slippage." Needs Bybit L2 orderbook ingestion. Niche but pro.

**10. Options IV / skew (BTC/ETH)** — implied vol + 25-delta skew as a fear/greed and event-risk gauge. Needs Deribit data.

**11. Personal Watchlist + alerts** — star coins, get notified on TP/SL/coiled-breakout (Telegram infra exists). Retention driver.

---

## 4. Recommended sequence

1. **Position Size & Risk Calculator** — fastest, highest daily utility, zero new data.
2. **Expectancy / R-multiple / equity-curve upgrade** — turns the track record into a pro-grade proof + reuses edge-lab.
3. **Liquidation-aware targets + live liquidations tape** — the standout differentiator (Coinglass-style) using Bybit data we already stream.
4. Then **Market Regime gauge** and **ATR normalization** as broad context layers.

These four move the terminal from "beautiful signal viewer" to "decision cockpit": *what's the backdrop (regime) → is this setup good (confluence/edge) → how much do I buy (position size) → where does it go (liq-aware targets) → am I actually winning (expectancy/DD).*

---

### Sources
- Derivatives signals: [Gate — key derivatives signals 2026](https://web3.gate.com/crypto-wiki/article/what-are-the-key-derivatives-market-signals-for-crypto-trading-in-2026-futures-open-interest-funding-rates-long-short-ratio-options-oi-and-liquidation-data-20260109), [TradeLink — funding + OI](https://tradelink.pro/blog/funding-rate-open-interest/), [CoinGlass](https://www.coinglass.com/), [CoinGlass liquidation heatmap](https://www.coinglass.com/pro/futures/LiquidationHeatMap)
- On-chain: [Nansen — on-chain metrics](https://nansen.ai/post/onchain-metrics-key-indicators-for-cryptocurrency-price-prediction), [Gate — on-chain analysis](https://www.gate.com/crypto-wiki/article/what-is-on-chain-data-analysis-and-how-do-active-addresses-whale-movements-and-transaction-volumes-predict-crypto-market-trends-20251217)
- Risk/performance: [OKX — position sizing & risk](https://tr.okx.com/en/learn/position-sizing-risk-management-crypto-trading), [LiquidityFinder — expectancy, drawdown, R-multiples](https://liquidityfinder.com/news/trading-journal-metrics-expectancy-drawdowns-and-r-multiples-explained-fc2af), [Altrady — max drawdown](https://www.altrady.com/blog/risk-management/maximum-drawdown-crypto-trading)
- Regime/breadth: [Gate — altcoin season index](https://www.gate.com/crypto-market-data/market-sentiment/altcoin-season-index), [CoinMarketCap — altseason index](https://coinmarketcap.com/charts/altcoin-season-index/)
- Volatility/correlation: [Changelly — ATR/vol indicators](https://changelly.com/blog/crypto-volatility-indicator/), [Sharpe.ai — crypto correlation matrix](https://www.sharpe.ai/learn/crypto-correlation-matrix), [QuantifiedStrategies — volatility-based sizing](https://www.quantifiedstrategies.com/volatility-based-position-sizing/)
