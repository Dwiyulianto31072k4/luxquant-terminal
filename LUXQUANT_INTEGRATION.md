# LuxQuant → Cryptobot Integration Guide

This document is for the **LuxQuant backend developer**. It explains exactly what LuxQuant needs to do so that the LuxQuant frontend can use the Cryptobot backend.

---

## How it works

Cryptobot uses a **token exchange** pattern:

1. The user logs into LuxQuant as normal (via Telegram).
2. After login, LuxQuant's backend issues a **short-lived signed JWT** for Cryptobot.
3. The LuxQuant frontend sends that JWT to Cryptobot's `/auth/luxquant` endpoint.
4. Cryptobot verifies it, provisions a user record, and returns its own Bearer token.
5. The frontend uses that Bearer token on every subsequent Cryptobot API call.

LuxQuant's Telegram login flow is **not touched**. Cryptobot never sees a password or Telegram credentials.

---

## Step 1 — Share a secret

Both sides must use the same signing secret. Pick a strong random string (≥ 32 characters) and set it in both systems:

**Cryptobot `.env`:**
```
LUXQUANT_JWT_SECRET=your-shared-secret-here
```

**LuxQuant backend:** store the same value wherever you sign tokens (env var, secrets manager, etc.)

---

## Step 2 — Sign a JWT after Telegram login

After your Telegram login flow completes and you have confirmed the user's identity, sign a JWT with the following shape:

```json
{
  "sub": "<luxquant_user_id>",
  "email": "user@example.com",
  "iat": 1749300000,
  "exp": 1749303600
}
```

| Claim | Type | Required | Notes |
|-------|------|----------|-------|
| `sub` | string | **yes** | Your internal user ID (stable, unique). Used to key the Cryptobot shadow user. |
| `email` | string | no | Stored on the Cryptobot user record if present. |
| `iat` | unix timestamp | **yes** | Issued-at. Standard JWT field. |
| `exp` | unix timestamp | **yes** | Expiry. Keep it short — 1 hour is fine. Cryptobot issues its own long-lived token after exchange. |

**Algorithm:** `HS256`  
**Secret:** the shared `LUXQUANT_JWT_SECRET`

**Example (Python / PyJWT):**
```python
import jwt, time

token = jwt.encode(
    {
        "sub": str(user.id),
        "email": user.email,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
    },
    LUXQUANT_JWT_SECRET,
    algorithm="HS256",
)
```

**Example (Node.js / jsonwebtoken):**
```js
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { sub: String(user.id), email: user.email },
  process.env.LUXQUANT_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);
```

---

## Step 3 — Expose the token to the frontend

After signing, return the token to the LuxQuant frontend. The simplest approach is to include it in your existing login response:

```json
{
  "user": { ... },
  "cryptobot_token": "<signed-jwt>"
}
```

Or serve it from a dedicated endpoint like `GET /me/cryptobot-token` that the frontend calls after login.

---

## Step 4 — Frontend calls Cryptobot's token exchange endpoint

The LuxQuant frontend makes one `POST` request to Cryptobot:

```
POST https://<cryptobot-api>/auth/luxquant
Content-Type: application/json

{
  "token": "<the signed JWT from Step 2>"
}
```

**Success response `200`:**
```json
{
  "access_token": "<cryptobot-jwt>",
  "token_type": "bearer"
}
```

**Error responses:**
| Status | Reason |
|--------|--------|
| `401` | Token invalid, expired, or tampered |
| `401` | Token missing `sub` claim |
| `500` | `LUXQUANT_JWT_SECRET` not configured on Cryptobot side |

---

## Step 5 — Frontend stores and uses the Cryptobot token

```js
// After exchange
localStorage.setItem('cryptobot_token', data.access_token);

// On every Cryptobot API call
fetch('https://<cryptobot-api>/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('cryptobot_token')}`
  }
});
```

The Cryptobot token is valid for **7 days** by default (`JWT_EXPIRES_MINUTES=10080`). Re-exchange before it expires by calling `/auth/luxquant` again with a fresh LuxQuant token.

---

## Step 6 — Configure CORS

Add the LuxQuant frontend origin to Cryptobot's `.env`:

```
CLIENT_ORIGIN=https://app.luxquant.io
# Or for multiple origins:
CORS_ORIGINS=https://app.luxquant.io,https://staging.luxquant.io
```

---

## Summary checklist

- [ ] Generate a shared `LUXQUANT_JWT_SECRET` and set it on both backends
- [ ] After Telegram login, sign an HS256 JWT with `sub`, `email`, `iat`, `exp`
- [ ] Return the signed JWT to the frontend (in login response or via a dedicated endpoint)
- [ ] Frontend calls `POST /auth/luxquant` with `{ "token": "..." }`
- [ ] Frontend stores the returned `access_token` and sends it as `Authorization: Bearer` on all Cryptobot calls
- [ ] Add the LuxQuant frontend origin to `CLIENT_ORIGIN` / `CORS_ORIGINS` on Cryptobot

---

## Security notes

- The `LUXQUANT_JWT_SECRET` is a shared secret — treat it like a password. Never commit it, never log it.
- Set a short `exp` on the LuxQuant-issued token (≤ 1 hour). Cryptobot issues its own 7-day token after exchange, so the user won't be repeatedly prompted.
- Cryptobot never stores or logs the LuxQuant token itself, only the derived `sub` claim.
