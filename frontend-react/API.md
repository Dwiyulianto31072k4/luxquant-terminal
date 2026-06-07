# Cryptobot Backend — API Reference

Base URL: `https://your-domain.com` (or `http://localhost:8000` locally)

All responses are JSON. Timestamps are ISO 8601 UTC strings.

---

## Authentication

The app uses **Google OAuth 2.0** to sign in. After login you receive a **JWT Bearer token** that must be sent in every authenticated request.

```
Authorization: Bearer <token>
```

### Auth flow

```
1. Redirect user to  GET /auth/google
2. Google redirects back to  GET /auth/google/callback?code=...
3. Server redirects to frontend with token in URL fragment:
   https://your-frontend.com/auth/callback#token=eyJ...
4. Frontend stores the token and includes it in all API calls
```

### Roles

| Role | Access |
|------|--------|
| `user` | All `/me/*`, `/signals`, `/executions` endpoints |
| `admin` / `dev` | Everything above + `/debug/*` endpoints |

---

## Endpoints

### Health

#### `GET /health`
No auth required. Returns system status.

**Response**
```json
{
  "ok": true,
  "service": "Cryptobot",
  "trading_mode": "live",
  "binance_environment": "live",
  "market_data_environment": "live",
  "market_data_market": "futures",
  "market_data_label": "Binance USD-M Futures",
  "live_orders_enabled": true
}
```

---

### User

#### `GET /me`
Returns the current user profile and linked exchange accounts.

**Response**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user"
  },
  "exchange_accounts": [
    {
      "exchange": "binance_futures",
      "label": "My Futures Account",
      "has_api_key": true,
      "has_api_secret": true,
      "key_status": "valid",
      "last_checked_at": "2026-06-01T12:00:00Z"
    }
  ]
}
```

`key_status` values: `"unchecked"` | `"valid"` | `"invalid"`

---

#### `PUT /me/exchange-accounts/binance`
Save or update Binance API keys.

**Request body**
```json
{
  "api_key": "your-binance-api-key",
  "api_secret": "your-binance-api-secret",
  "label": "My Binance Account"
}
```

`label` is optional.

**Response**
```json
{
  "ok": true,
  "exchange": "binance",
  "key_status": "unchecked"
}
```

> After saving keys, call the `/check` endpoint to validate them.

---

#### `POST /me/exchange-accounts/binance/check`
Test that the saved API keys work against Binance.

**Response**
```json
{
  "valid": true,
  "details": {
    "ping": true,
    "account": true
  }
}
```

---

### Portfolio

#### `GET /me/portfolio`
Returns current wallet balances and open positions from Binance.

**Response**
```json
{
  "exchange": "binance",
  "spot": {
    "market_type": "spot",
    "portfolio_usdt": 250.50,
    "available_usdt": 200.00,
    "balances": [
      { "asset": "USDT", "free": 200.00, "locked": 50.50, "usdt": 250.50 },
      { "asset": "BTC",  "free": 0.001,  "locked": 0,     "usdt": 65.20  }
    ]
  },
  "futures": {
    "market_type": "futures",
    "portfolio_usdt": 15.00,
    "available_usdt": 3.06,
    "positions": [
      {
        "symbol": "AKEUSDT",
        "positionAmt": "460",
        "entryPrice": "0.0067",
        "unrealizedProfit": "0.09",
        "leverage": "1",
        "marginType": "isolated"
      }
    ]
  }
}
```

`available_usdt` = balance actually available for new orders (excludes locked margin).
`spot` or `futures` will be `null` if no account is configured for that market.

---

### Strategy Config

#### `GET /me/strategy-configs`
Returns all strategy configs for the current user.

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "exchange": "binance",
      "spot_enabled": false,
      "futures_enabled": true,
      "is_active": true,
      "dry_run": false,
      "sizing": {
        "method": "fixed",
        "value": 10.0
      },
      "tp": {
        "source": "signal_level",
        "level": 1,
        "custom_pct": null
      },
      "sl": {
        "source": "signal_level",
        "level": 1,
        "custom_pct": null
      },
      "exit": {
        "mode": "trailing_stop",
        "trailing_callback_rate": 1.0
      },
      "futures": {
        "leverage": 1,
        "margin_mode": "isolated"
      },
      "allowed_risk_levels": ["low", "normal"]
    }
  ]
}
```

`allowed_risk_levels` is `null` (or omitted) when the user trades every risk level.

---

#### `PUT /me/strategy-configs/binance`
Create or update the Binance strategy config.

**Request body**
```json
{
  "spot_enabled": false,
  "futures_enabled": true,
  "is_active": true,
  "dry_run": false,
  "sizing_method": "fixed",
  "sizing_value": 10.0,
  "tp_source": "signal_level",
  "tp_level": 1,
  "tp_custom_pct": null,
  "sl_source": "signal_level",
  "sl_level": 1,
  "sl_custom_pct": null,
  "exit_mode": "trailing_stop",
  "trailing_callback_rate": 1.0,
  "leverage": 1,
  "margin_mode": "isolated",
  "allowed_risk_levels": ["low", "normal"]
}
```

**Field reference**

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `spot_enabled` | bool | `true` / `false` | Enable spot trading |
| `futures_enabled` | bool | `true` / `false` | Enable futures trading |
| `is_active` | bool | `true` / `false` | Master on/off switch |
| `dry_run` | bool | `true` / `false` | Simulate orders without sending to Binance |
| `sizing_method` | string | `"fixed"` / `"percent"` | `fixed` = fixed USDT amount per trade; `percent` = % of available balance |
| `sizing_value` | float | ≥ 0 | If `fixed`: USDT amount (min $5 enforced). If `percent`: percentage 0–100 |
| `tp_source` | string | `"signal_level"` / `"custom_pct"` | Where take-profit price comes from |
| `tp_level` | int | 1–4 | Which TP target from the signal to use (1 = first target) |
| `tp_custom_pct` | float / null | ≥ 0 | Required if `tp_source = "custom_pct"`. % above entry price |
| `sl_source` | string | `"signal_level"` / `"custom_pct"` | Where stop-loss price comes from |
| `sl_level` | int | 1–4 | Which SL level from the signal to use |
| `sl_custom_pct` | float / null | ≥ 0 | Required if `sl_source = "custom_pct"`. % below entry price |
| `exit_mode` | string | `"fixed_sl"` / `"trailing_stop"` | `fixed_sl` = place stop-loss order at SL price; `trailing_stop` = trailing stop with callback rate. Note: trailing stop not supported on spot, falls back to `fixed_sl` |
| `trailing_callback_rate` | float / null | 0.1–10 | Required if `exit_mode = "trailing_stop"`. % callback for trailing stop |
| `leverage` | int / null | 1–125 | Required if `futures_enabled = true` |
| `margin_mode` | string / null | `"cross"` / `"isolated"` | Futures margin mode |
| `allowed_risk_levels` | array / null | subset of `["low", "normal", "high"]` | Risk-level filter. Only signals whose `risk_level` is in this list are traded. `null`/empty = trade every level. A signal with no risk level is never blocked. Values are lower-cased and de-duplicated on save |

**Validation rules**
- `leverage` is required when `futures_enabled = true`
- `trailing_callback_rate` is required when `exit_mode = "trailing_stop"`
- `tp_custom_pct` is required when `tp_source = "custom_pct"`
- `sl_custom_pct` is required when `sl_source = "custom_pct"`
- `allowed_risk_levels`, if provided, must be a subset of `["low", "normal", "high"]`

**Response**
```json
{
  "ok": true,
  "config": { /* same shape as GET /me/strategy-configs item */ }
}
```

---

#### `PUT /me/strategy-configs/binance/active`
Toggle strategy on/off without changing other settings.

**Request body**
```json
{ "active": true }
```

**Response**
```json
{ "ok": true, "active": true }
```

---

### Signals

Signals are parsed trade ideas (from Discord or manual input). Each signal can produce an **active call** which waits for the price to hit the entry range, then fires an **execution job**.

#### `GET /signals`
Returns the last 100 signals.

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "source": "discord",
      "source_message_id": "1234567890",
      "raw_text": "NEW SIGNAL: BTCUSDT\nEntry: 60000\n...",
      "symbol": "BTCUSDT",
      "side": "BUY",
      "entries": [60000.0],
      "tps": [61000.0, 62000.0],
      "sls": [59000.0],
      "risk_level": "low",
      "parse_status": "parsed",
      "created_at": "2026-06-01T12:00:00Z"
    }
  ]
}
```

`parse_status` values: `"parsed"` | `"unparsed"`

`risk_level` is the source-provided risk tag (e.g. `"low"` / `"normal"` / `"high"`), lower-cased; `null` when the source did not provide one. Used by the strategy `allowed_risk_levels` filter.

---

#### `POST /signals/parse-preview`
Parse a signal text without saving it. Useful for showing a preview in the UI.

**Request body**
```json
{ "text": "NEW SIGNAL: BTCUSDT\nEntry: 60000\nTarget 1: 61000\nStop Loss 1: 59000" }
```

**Response — parsed**
```json
{
  "parsed": true,
  "signal": {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "entries": [60000.0],
    "tps": [61000.0],
    "sls": [59000.0]
  }
}
```

**Response — not parsed**
```json
{ "parsed": false, "signal": null }
```

---

### Executions

Execution jobs are the actual trade attempts. One signal → one job per active user strategy.

#### `GET /executions`
Returns the last 100 execution jobs for the current user.

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "signal_id": "uuid",
      "user_id": "uuid",
      "exchange": "binance",
      "market_type": "futures",
      "status": "completed",
      "dry_run": false,
      "error": null,
      "created_at": "2026-06-01T12:00:00Z",
      "orders": [
        {
          "id": "uuid",
          "symbol": "BTCUSDT",
          "order_type": "MARKET_ENTRY",
          "side": "BUY",
          "status": "submitted",
          "request": { "quote_amount": 10.0 },
          "response": { "orderId": 123456, "executedQty": "0.001", "status": "FILLED" },
          "dry_run": false
        },
        {
          "id": "uuid",
          "symbol": "BTCUSDT",
          "order_type": "TP_TRAILING_STOP",
          "side": "SELL",
          "status": "submitted",
          "request": { "quantity": 0.001, "take_profit": 61000.0, "stop_loss": 58000.0, "trailing_callback_rate": 1.0 },
          "response": {
            "stop_loss": { "orderId": 123457, "status": "NEW" },
            "trailing_stop": { "orderId": 123458, "status": "NEW" }
          },
          "dry_run": false
        }
      ]
    }
  ]
}
```

**`status`** values: `"pending"` | `"running"` | `"completed"` | `"failed"` | `"skipped"`

> **`skipped`** — the job was not opened on purpose. At execution time the live price must be inside the valid entry window (for a long, `stop_loss < price < take_profit`; mirrored for a short). Because prices are polled every 1–3s, a fast move can carry the market past an edge before the entry fills, so the job is skipped when:
> - **price already at/through the stop-loss** (`price_at_stop_loss`) — opening would start the position in stop-out territory and Binance would reject the protective stop (`-2021 Order would immediately trigger`), leaving it unprotected; or
> - **price already at/past the take-profit** (`price_at_take_profit`) — the move already reached the target, so the trade has near-zero upside but full downside (the TP order would also `-2021`).
>
> - **spot size too small to protect** (`skip_spot_min_notional`) — on spot, TP/SL is one OCO order whose stop leg is priced below entry and must independently clear the symbol's `NOTIONAL` filter (typically $5). The bot first tries to **auto-bump** the entry size up to the minimum that keeps the OCO valid (capped at 2× the configured size). If even the bump can't fit — because it would exceed the 2× cap or the available balance — the job is skipped rather than opened unprotected.
>
> The specific reason is in the job's `error` field. Skipped jobs place **no** orders.
>
> When a spot entry is auto-bumped (but not skipped), the entry proceeds at the larger size and an `execution.spot_size_bumped` audit log records the configured vs bumped quote amount.

**`order_type`** values: `"MARKET_ENTRY"` | `"TP_SL"` | `"TP_TRAILING_STOP"`

> Each execution produces a `MARKET_ENTRY` record plus one exit record. The exit record's `response` holds the individual conditional orders, keyed by leg:
> - **`fixed_sl`** → `order_type: "TP_SL"`, `response: { "take_profit": {…}, "stop_loss": {…} }`
> - **`trailing_stop`** → `order_type: "TP_TRAILING_STOP"`, `response: { "stop_loss": {…}, "trailing_stop": {…} }`
>
> All conditional legs are placed via Binance's Algo Order API (`/fapi/v1/algoOrder`), which is mandatory for futures stop/take-profit/trailing orders as of 2025-12-09.

---

#### `POST /executions/{execution_id}/retry`
Re-run a failed or completed execution job. Creates a fresh job for the same signal.

**Response**
```json
{
  "ok": true,
  "execution": { /* same shape as a single item from GET /executions */ }
}
```

---

## Error Responses

All errors follow this shape:

```json
{ "detail": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — invalid input |
| `401` | Missing or invalid token |
| `403` | Valid token but insufficient role (admin/dev required) |
| `404` | Resource not found |
| `409` | Conflict (e.g. retrying a job that is still running) |
| `422` | Validation error — field-level details in `detail` array |
| `502` | Upstream error (e.g. Binance API failure) |

**422 shape**
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "leverage"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

---

## Typical Frontend Flow

```
1. Login
   GET /auth/google  →  redirect  →  store token

2. Load dashboard
   GET /me                       → user info + account status
   GET /me/portfolio             → balances
   GET /me/strategy-configs      → current strategy settings
   GET /executions               → recent trades

3. First-time setup
   PUT /me/exchange-accounts/binance   → save API keys
   POST /me/exchange-accounts/binance/check  → validate keys
   PUT /me/strategy-configs/binance    → configure strategy

4. Toggle strategy on/off
   PUT /me/strategy-configs/binance/active  { "active": true/false }

5. Retry a failed trade
   POST /executions/{id}/retry
```

---

## Notes

- The **$5 minimum** per trade is enforced server-side regardless of `sizing_value`. Setting `fixed` with a value below $5 will still spend $5.
- **Spot sizing & OCO minimum**: a spot trade's TP/SL is one OCO order whose stop leg (below entry) must independently clear the symbol's `NOTIONAL` filter. Sizing right at the $5 floor usually makes that leg fall under $5 and the OCO gets rejected (`-1013`). The bot auto-bumps the entry to the minimum size that keeps the OCO valid (capped at 2× configured); if it can't fit within that cap or your balance, the job is skipped instead of opening unprotected. To avoid bumping, set the spot `sizing_value` comfortably above $5 (≈ $7–8+ depending on stop distance).
- **Spot trailing stop** is not supported — if `exit_mode = "trailing_stop"` is set and the signal executes on spot, it falls back to `fixed_sl` automatically.
- **Futures `fixed_sl`**: After the market entry fills, two close-position conditional orders are placed via the Algo Order API — a `TAKE_PROFIT_MARKET` at the TP price and a `STOP_MARKET` at the SL price. Recorded as one `TP_SL` order record.
- **Futures `trailing_stop`**: Places **two** orders after entry — a hard `STOP_MARKET` floor at the signal's SL price (close-position) **plus** a `TRAILING_STOP_MARKET` with `activationPrice` set to the signal's TP level. This means:
  - The SL floor protects the position immediately, from entry onward.
  - The trailing stop is **inactive** until price reaches the activation (TP) level, then trails by `trailing_callback_rate`% below the peak.
  - Once the trailing stop activates and rides momentum, it closes on a `callbackRate`% pullback.
  - Whichever leg triggers first closes the position; the other becomes a no-op reduce-only order against a flat position.
- **TradFi-Perps** (stock-based perpetuals like ARMUSDT): require accepting a separate agreement on Binance before trading. The bot returns a clear error message if this hasn't been done.
- The bot reads `available_usdt` (not total wallet balance) when sizing trades, so locked margin from existing positions is excluded.
