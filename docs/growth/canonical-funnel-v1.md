# Canonical Growth Funnel v1

Effective schema version: `2026-08-15`

## Why this exists

LuxQuant already had useful analytics, but they answered different questions:

- `funnel_events`: anonymous landing, CTA and authentication sessions.
- `users.acq_*`: first-touch acquisition attached to an account.
- `user_activity_events`: coarse feature usage and return activity.
- `payments`: invoices and confirmed revenue truth.
- `login_count >= 2`: a return proxy previously displayed as activation.

The missing layer was a user-linked record of product and checkout intent. The
new `growth_events` table fills only that gap. It does not replace or duplicate
the existing domain stores.

## Canonical definitions

| Stage | Definition | Source of truth |
|---|---|---|
| Landing | Anonymous session recorded a landing event | `funnel_events` |
| Signup | Account `created_at` is in the cohort | `users` |
| Verified proof | Logged-in user opened a resolved signal proof | `growth_events.proof_verified` |
| Armed value | User saved a signal/coin watch or entry alert | `watchlist`, `coin_watch`, `entry_alerts` |
| Activated | Verified proof **and** armed value within 24 hours of signup | Joined canonical query |
| Pricing intent | Logged-in user viewed pricing | `growth_events.pricing_viewed` |
| Plan intent | Logged-in user selected a plan | `growth_events.plan_selected` |
| Invoice | A non-deleted payment row was created | `payments` |
| Transaction submitted | Verify endpoint received a transaction attempt | server `growth_events.transaction_submitted` |
| Paid | Payment status is `confirmed` | `payments` |
| Renewal | A user has more than one confirmed payment | `payments` |
| Revenue | Sum of confirmed `final_amount`, falling back to `amount_usdt` | `payments` |

`login_count >= 2` remains visible as a return proxy in the legacy panel. It is
not used as canonical activation.

## Client milestone allowlist

- `proof_verified`
- `pricing_viewed`
- `plan_selected`
- `checkout_viewed`
- `wallet_address_copied`
- `payment_amount_copied`
- `transaction_submitted`

The ingestion endpoint requires a valid user access token, uses a server-side
timestamp, limits metadata, and accepts only allowlisted events. Transport is
fire-and-forget so analytics cannot block product behavior.

Payment events are also written by the backend. Client `transaction_submitted`
is interaction telemetry; the server copy is authoritative. Neither analytics
record stores the raw transaction hash.

## Attribution rule

The dashboard groups canonical cohort outcomes by `users.acq_source`, with
campaign and creative rollups from `acq_medium`, `acq_campaign`, and
`acq_content`. This is first-touch attribution. It answers which original
source/campaign acquired an account; it does not claim that a later channel
interaction caused the sale.

## Cohort scope

Canonical reporting starts at the first `growth_events.occurred_at`. Accounts
created before collection began are excluded rather than counted as failed
activation. Historical payments remain available in the legacy revenue panel.

## Deployment order

1. Run `backend/migrations/growth_measurement_foundation.sql`.
2. Deploy backend and frontend together.
3. Confirm `POST /api/v1/growth/event` returns `200` for an authenticated user.
4. Open one resolved proof, save one watch/alert, view pricing, and create a test invoice.
5. Confirm the Conversion dashboard reports `status=collecting` and shows the new cohort start.
6. Do not backfill proof or activation from `login_count`; no data is better than invented history.

## Telegram acquisition contract

Paid Telegram traffic should enter through the Mini App link generated in
**Admin Workspace → Conversion → Telegram Ads**. Its signed `start_param` uses
the compact form below because ordinary UTM parameters do not survive a
`t.me` → Mini App handoff:

```text
lq1p_<campaign>_<creative>
```

The backend decodes that payload as:

```text
source=telegram
medium=paid_social
campaign=<campaign>
content=<creative>
```

The Mini App signs the user in without an OAuth popup and lands paid traffic
on `/performance`, where the resolved-proof milestone can begin activation.
The canonical API returns `by_campaign` and `by_content` rollups so spend is
judged by activation, invoice, paid users, and confirmed revenue—not clicks or
Telegram subscribers alone.

The login page keeps the fast popup path for browsers where it works, but
exposes the Mini App rescue immediately and promotes it after eight seconds or
as soon as a blocked popup is observed. Popup abandonment is not duplicated as
an `auth_error`.

## Rollback

Application rollback is safe: the table is additive and no existing metric or
payment path depends on it. Leave the table in place so collected history is
not destroyed. The new dashboard explicitly falls back to a migration/unavailable
state while the legacy panels remain usable.
