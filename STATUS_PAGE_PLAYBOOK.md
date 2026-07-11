# LuxQuant Status Page — Operator Playbook

Public page: **`/status`** · Admin control room: **`/admin/status`** (admin only)

The page has two layers, exactly like Atlassian Statuspage / GitHub / Cloudflare / Anthropic:

1. **Automatic health** — the page probes the platform itself (client-side) and colors each
   component green/amber/red on its own. If the backend is unreachable, the page still loads
   (it's a static file served by nginx) and says **"Platform is not responding"** — the verdict is
   computed in the browser, no backend needed.
2. **Incidents** — announcements with a lifecycle + timestamped timeline. These are created two ways:
   - **Automatically** (default on): if a component stays unhealthy for **> 2 minutes**, the system
     auto-opens an incident with a generated description and an "Auto-detected" badge. When the
     component recovers and holds for **> 2 minutes**, it auto-resolves. No admin action needed.
   - **Manually**: you open/post incidents yourself for things monitoring can't see (a data-provider
     issue, a planned maintenance, a heads-up).
   An active incident escalates the components it touches and the top banner.

### Automatic mode (what happens with no admin)

- Component down > 2 min → incident opens: *"We've automatically detected a problem affecting X and
  are investigating."* (status **Investigating**, badge **Auto-detected**).
- If it worsens (degraded → outage), impact is bumped automatically with a note.
- Recovered and stable > 2 min → auto-posts **Resolved**: *"X has recovered… Resolved automatically."*
- Brief blips (< 2 min) are ignored, so a quick restart never spams the page.
- Admins can still jump in on an auto incident: add investigation notes, change status, or resolve it
  early — auto only manages incidents it opened itself, and never touches your manual ones.

Tune via env: `STATUS_AUTO_INCIDENTS` (1/0), `STATUS_AUTO_OPEN_SECONDS` (120), `STATUS_AUTO_RESOLVE_SECONDS` (120).

---

## The lifecycle (this is what "checking / solved" means)

**Incident:** `Investigating → Identified → Monitoring → Resolved`

| Status | Say this when… |
|---|---|
| **Investigating** | Something's wrong, you're still figuring out what. |
| **Identified** | You know the cause. |
| **Monitoring** | Fix is applied, you're watching it hold. |
| **Resolved** | Confirmed fixed → moves to *Past Incidents*. |

**Maintenance (planned):** `Scheduled → In progress → Completed`

**Impact** (sets the color): `minor` = amber/degraded · `major` / `critical` = red/outage · `maintenance` = blue.

---

## How to operate it (from `/admin/status`)

**Open an incident**
1. Go to `/admin/status`.
2. *New Incident*: type a title, pick **Impact**, pick starting status (usually **Investigating**),
   tick the **affected components**, write the first update, **Publish incident**.
3. It appears on `/status` within ~20s (public page is cached 20s; posting clears the cache).

**Move it along** (this is the "change status" you asked about)
- On the incident card, pick the new status (e.g. **Monitoring**), optionally add a message,
  **Post update**. Each update stacks on the timeline with a timestamp.

**Close it**
- Post an update with status **Resolved** (or **Completed** for maintenance). It drops off the
  active list and shows under **Past Incidents**.

---

## Scenario 1 — Partial issue (signals delayed)

With automatic mode on, step 1 happens **on its own**; you just narrate from step 2.

1. `12:04` *(auto)* Signals unhealthy > 2 min → incident auto-opens **Investigating** · impact *minor* ·
   affected *Signals*, badge **Auto-detected**.
   → `/status`: Signals turns **amber**, banner "Some systems degraded".
   *(If you'd rather announce it first yourself, you can still open it manually the moment you notice.)*
2. `12:11` **Identified** — "Cause found: a delivery worker stalled. Restarting."
3. `12:19` **Monitoring** — "Delivery is catching up. Watching the backlog clear."
4. `12:32` **Resolved** — "Signals fully caught up. Sorry for the delay."
   → `/status`: Signals back **green**, incident moves to *Past Incidents*.

## Scenario 2 — Major outage (backend / DB down)

This is the case where the app's feature pages won't even open — but `/status` still does.

1. Users can't load the app. You open `/admin/status` (if the backend is fully down, see the note
   below) and post: **Investigating** · impact *critical* · affected *Website & Sign-in* —
   "We're aware the platform is unreachable and are investigating."
   → `/status` banner goes **red**, "Major outage".
   Even before you post anything, the page's own probe already shows red "Platform is not responding".
2. **Identified** → **Monitoring** → **Resolved** as you recover, same as above.

> If the whole backend is down you can't post from the admin panel (it needs the API). Two ways top
> companies cover this: (a) edit the incidents JSON file directly and let nginx serve it as a static
> fallback, or (b) host the status page + incidents on **separate infra** (this is why
> status.anthropic.com etc. live outside the main app). See *Going further* below.

## Scenario 3 — Planned maintenance

1. A day ahead: **Scheduled** · impact *maintenance* · affected *AutoTrade* · set *Scheduled from/until* —
   "AutoTrade will be briefly paused for an upgrade."
   → `/status`: AutoTrade shows **blue** "Maintenance", banner "Under maintenance" (not an alarm).
2. At the window: **In progress** → when done: **Completed**.

---

## Configuration

- Incidents are stored in a JSON file — set the path via env:
  `STATUS_INCIDENTS_FILE=/opt/luxquant/status/incidents.json` (default). The backend user must be
  able to write to that directory.
- **Why a file, not the database:** the incident you most need to post is often "the DB is down".
  A file is readable/writable without Postgres or Redis, so the status system survives the very
  outage it's reporting.
- Public reads are cached 20s; any admin write clears the cache immediately.

## Going further (optional, enterprise-grade)

- **Static nginx fallback:** point an nginx `location = /status/incidents.json` at the same file so
  the page can read last-known incidents even if the API process is down.
- **Separate infra / external monitor:** host a copy of `/status` (or use UptimeRobot / BetterStack)
  on a different server so it survives a full outage of the main box — and can alert you when the
  platform goes down. This is the only layer a same-origin page can't cover by itself.
