import os, sys, time, logging
from datetime import datetime, timedelta, timezone
import httpx
from sqlalchemy import create_engine, text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [tg-deliver] %(levelname)s %(message)s")
log = logging.getLogger("tg_delivery")

# basicConfig above sets the ROOT logger to INFO, which turns on httpx's request
# logging too — and httpx logs the full URL. For Telegram that URL is
# api.telegram.org/bot<TOKEN>/sendMessage, so the bot token was being written
# into journald on every single send: 51 times in two hours. Anyone able to read
# the journal could take the bot over.
#
# Silenced rather than redacted: these lines carry nothing the worker's own
# "pass: ..." summary does not already say, and a redaction filter is one more
# thing that can quietly stop working.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

POLL_INTERVAL = 20
BATCH_LIMIT = 50
PACING_DELAY = 0.04
DIGEST_INTERVAL_MIN = 15
DIGEST_TYPES = {"news", "market_pulse"}
DIGEST_MAX_ITEMS = 8
# Hard ceiling on how far back Telegram delivery will ever reach, whatever the
# stored watermark says. See the note in run_once().
MAX_BACKLOG_HOURS = 24
def _parse_targets(raw):
    """Restrict delivery to specific user ids, or to nobody in particular.

    This was hardcoded to [5] — a pilot restriction that outlived the pilot by
    long enough that five users who had switched Telegram on were getting
    nothing from the broadcast and digest paths. It only ever gated those two;
    personal notifications were never restricted, which is why the failure was
    invisible from the delivery counts.

    Unset means everyone who opted in, which is the behaviour the preference
    toggle already promises. Set TG_TARGET_USER_IDS to a comma-separated list
    to narrow it again without a deploy.
    """
    raw = (raw or "").strip()
    if not raw or raw.lower() in ("all", "*"):
        return None
    try:
        ids = [int(x) for x in raw.replace(" ", "").split(",") if x]
    except ValueError:
        log.warning("TG_TARGET_USER_IDS is not a list of ids (%r); delivering to all", raw)
        return None
    return ids or None


TARGET_USER_IDS = _parse_targets(os.getenv("TG_TARGET_USER_IDS"))

LUX_DSN = os.getenv("DATABASE_URL")
# No hardcoded fallback: this file lives in a public repository, and a proxy
# endpoint baked into it is an open invitation. TELEGRAM_PROXY is set in
# backend/.env; without it the worker talks to Telegram directly.
PROXY = os.getenv("TELEGRAM_PROXY") or None
ALERT_BOTS = [t for t in [os.getenv("ALERT_BOT_TOKEN")] if t]
if not LUX_DSN or not ALERT_BOTS:
    log.error("MISSING ENV"); sys.exit(1)

def _norm(dsn):
    return dsn.replace("postgresql://", "postgresql+psycopg2://") if dsn.startswith("postgresql://") else dsn
engine = create_engine(_norm(LUX_DSN), pool_pre_ping=True)

def pick_bot(user_id): return ALERT_BOTS[user_id % len(ALERT_BOTS)]

def _target_clause(col="u.id"):
    if TARGET_USER_IDS is None: return ""
    ids = ",".join(str(int(i)) for i in TARGET_USER_IDS)
    return f" AND {col} IN ({ids})"

def send_telegram(token, chat_id, text_msg):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text_msg, "parse_mode": "HTML", "disable_web_page_preview": True}
    try:
        with httpx.Client(timeout=15, proxy=PROXY) as client:
            resp = client.post(url, json=payload)
            return (True, "") if resp.status_code == 200 else (False, f"{resp.status_code} {resp.text[:200]}")
    except Exception as e:
        return False, str(e)

def _unreachable(err):
    return "403" in err or "chat not found" in err.lower() or "blocked" in err.lower()

def get_cutoff(conn):
    r = conn.execute(text("SELECT value FROM autotrade_relay_config WHERE key='tg_cutoff_ts'")).first()
    return r[0] if r else None

def get_config_ts(conn, key):
    r = conn.execute(text("SELECT value FROM autotrade_relay_config WHERE key=:k"), {"k": key}).first()
    return r[0] if r else None

def set_config_ts(conn, key, value):
    conn.execute(text("INSERT INTO autotrade_relay_config (key, value) VALUES (:k, :v) ON CONFLICT (key) DO UPDATE SET value = :v"), {"k": key, "v": value})

def render_personal(notif):
    _id, uid, ntype, title, body, data, created, tg_id = notif
    parts = [f"<b>{title}</b>"]
    if body: parts.append(body)
    if isinstance(data, dict):
        sym = data.get("symbol") or data.get("pair")
        if sym:
            line = f"<code>{sym}</code>"
            pnl = data.get("realized_pnl")
            if pnl is not None: line += f"  PnL: {float(pnl):+.2f}"
            parts.append(line)
    return "\n".join(parts)

def render_instant_broadcast(title, body, data):
    parts = [f"<b>{title}</b>"]
    if body: parts.append(body)
    if isinstance(data, dict):
        sym = data.get("symbol") or data.get("pair")
        if sym: parts.append(f"<code>{sym}</code>")
    return "\n".join(parts)

def render_digest_pulse(rows):
    lines = [f"📊 <b>Market Pulse</b> — {len(rows)} updates · {DIGEST_INTERVAL_MIN}m", ""]
    for title, body, data in rows[:DIGEST_MAX_ITEMS]:
        if isinstance(data, dict) and data.get("pair"):
            pair = data["pair"]; pct = data.get("percentage"); evt = data.get("event_type", "")
            dot = "🟢" if (pct or 0) >= 0 else "🔴"
            pct_s = f"{pct:+.1f}%" if pct is not None else ""
            lines.append(f"{dot} <code>{pair}</code>  {pct_s}  {evt}")
        else:
            lines.append(f"• {title}")
    extra = len(rows) - DIGEST_MAX_ITEMS
    if extra > 0: lines.append(f"… +{extra} more")
    return "\n".join(lines)

def render_digest_news(rows):
    lines = [f"📰 <b>News</b> — {len(rows)} updates · {DIGEST_INTERVAL_MIN}m", ""]
    for title, body, data in rows[:DIGEST_MAX_ITEMS]:
        t = title.rstrip(" .")
        if len(t) > 90: t = t[:87] + "..."
        lines.append(f"• {t}")
    extra = len(rows) - DIGEST_MAX_ITEMS
    if extra > 0: lines.append(f"… +{extra} more")
    dom = None
    for _, _, data in rows:
        if isinstance(data, dict) and data.get("domain"): dom = data["domain"]; break
    if dom: lines += ["", f"<i>{dom}</i>"]
    return "\n".join(lines)

def run_instant_personal(conn, cutoff):
    sent = failed = 0
    rows = conn.execute(text("""
        SELECT n.id, n.user_id, n.type, n.title, n.body, n.data, n.created_at, u.telegram_id
        FROM notifications n
        JOIN users u ON u.id = n.user_id AND u.telegram_id IS NOT NULL
        JOIN notification_preferences p ON p.user_id = n.user_id
         AND p.notif_type = CASE WHEN n.type LIKE 'autotrade%' THEN 'autotrade' ELSE n.type END
         AND p.telegram = true
        WHERE n.telegram_sent_at IS NULL AND n.user_id IS NOT NULL
          AND n.type NOT IN ('news','market_pulse')
          AND n.created_at >= CAST(:cutoff AS timestamptz)
        ORDER BY n.created_at ASC LIMIT :lim
    """), {"cutoff": cutoff, "lim": BATCH_LIMIT}).fetchall()
    for notif in rows:
        nid, uid = notif[0], notif[1]
        ok, err = send_telegram(pick_bot(uid), str(notif[7]), render_personal(notif))
        if ok:
            conn.execute(text("UPDATE notifications SET telegram_sent_at=now() WHERE id=:id"), {"id": nid}); sent += 1
        else:
            failed += 1; log.warning("instant-personal fail notif=%s uid=%s: %s", nid, uid, err)
            if _unreachable(err):
                conn.execute(text("UPDATE notifications SET telegram_sent_at=now() WHERE id=:id"), {"id": nid})
        time.sleep(PACING_DELAY)
    return sent, failed

def run_instant_broadcast(conn, cutoff):
    sent = failed = 0
    tclause = _target_clause("u.id")
    rows = conn.execute(text(f"""
        SELECT n.id, n.type, n.title, n.body, n.data, u.id AS uid, u.telegram_id
        FROM notifications n
        JOIN users u ON u.telegram_id IS NOT NULL{tclause}
        JOIN notification_preferences p ON p.user_id = u.id AND p.notif_type = n.type AND p.telegram = true
        LEFT JOIN notification_tg_deliveries d ON d.notification_id = n.id AND d.user_id = u.id
        WHERE n.user_id IS NULL AND n.type NOT IN ('news','market_pulse')
          AND n.created_at >= CAST(:cutoff AS timestamptz) AND d.notification_id IS NULL
        ORDER BY n.created_at ASC LIMIT :lim
    """), {"cutoff": cutoff, "lim": BATCH_LIMIT}).fetchall()
    for nid, ntype, title, body, data, uid, tg_id in rows:
        ok, err = send_telegram(pick_bot(uid), str(tg_id), render_instant_broadcast(title, body, data))
        if ok or _unreachable(err):
            conn.execute(text("INSERT INTO notification_tg_deliveries (notification_id, user_id) VALUES (:nid, :uid) ON CONFLICT DO NOTHING"), {"nid": nid, "uid": uid})
            sent += 1 if ok else 0
        if not ok:
            failed += 1; log.warning("instant-broadcast fail notif=%s uid=%s: %s", nid, uid, err)
        time.sleep(PACING_DELAY)
    return sent, failed

def run_digest(conn):
    now = datetime.now(timezone.utc)
    last = get_config_ts(conn, "tg_digest_last_at")
    if last:
        last_dt = last if isinstance(last, datetime) else datetime.fromisoformat(str(last))
        if last_dt.tzinfo is None: last_dt = last_dt.replace(tzinfo=timezone.utc)
        if (now - last_dt).total_seconds() / 60 < DIGEST_INTERVAL_MIN:
            return 0, 0
    window_start = last if last else get_cutoff(conn)
    sent = failed = 0
    tclause = _target_clause("u.id")
    for dtype in ("market_pulse", "news"):
        users = conn.execute(text(f"""
            SELECT u.id, u.telegram_id FROM users u
            JOIN notification_preferences p ON p.user_id = u.id AND p.notif_type = :t AND p.telegram = true
            WHERE u.telegram_id IS NOT NULL{tclause}
        """), {"t": dtype}).fetchall()
        if not users: continue
        notifs = conn.execute(text("""
            SELECT n.id, n.title, n.body, n.data FROM notifications n
            WHERE n.user_id IS NULL AND n.type = :t AND n.created_at >= CAST(:ws AS timestamptz)
            ORDER BY n.created_at ASC
        """), {"t": dtype, "ws": window_start}).fetchall()
        if not notifs: continue
        for uid, tg_id in users:
            delivered = conn.execute(text("SELECT notification_id FROM notification_tg_deliveries WHERE user_id = :uid AND notification_id = ANY(:ids)"), {"uid": uid, "ids": [n[0] for n in notifs]}).fetchall()
            done = {r[0] for r in delivered}
            pending = [(n[1], n[2], n[3]) for n in notifs if n[0] not in done]
            pending_ids = [n[0] for n in notifs if n[0] not in done]
            if not pending: continue
            msg = render_digest_pulse(pending) if dtype == "market_pulse" else render_digest_news(pending)
            ok, err = send_telegram(pick_bot(uid), str(tg_id), msg)
            if ok or _unreachable(err):
                for nid in pending_ids:
                    conn.execute(text("INSERT INTO notification_tg_deliveries (notification_id, user_id) VALUES (:nid, :uid) ON CONFLICT DO NOTHING"), {"nid": nid, "uid": uid})
                sent += 1 if ok else 0
            if not ok:
                failed += 1; log.warning("digest fail type=%s uid=%s: %s", dtype, uid, err)
            time.sleep(PACING_DELAY)
    set_config_ts(conn, "tg_digest_last_at", now.isoformat())
    return sent, failed

def run_once():
    res = {"ip": 0, "ib": 0, "dg": 0, "fail": 0}
    with engine.begin() as conn:
        cutoff = get_cutoff(conn)
        if not cutoff:
            log.warning("no cutoff; skip"); return res

        # tg_cutoff_ts is a watermark that nothing advances. It was written once
        # on 2026-06-23 and still said so six weeks later, so the moment a user
        # became deliverable the worker replayed every undelivered notification
        # back to that date — 56 of them arrived in one burst, the oldest 42 days
        # stale, "Daily Results" for days long past.
        #
        # Nobody wants a price alert from six weeks ago. Clamp the window so a
        # stale or forgotten watermark can never replay history again; the
        # watermark can still make the window *narrower*, never wider.
        floor = datetime.now(timezone.utc) - timedelta(hours=MAX_BACKLOG_HOURS)
        cutoff_dt = cutoff if isinstance(cutoff, datetime) else datetime.fromisoformat(str(cutoff))
        if cutoff_dt.tzinfo is None:
            cutoff_dt = cutoff_dt.replace(tzinfo=timezone.utc)
        if cutoff_dt < floor:
            cutoff = floor.isoformat()
            # Warn only when the watermark is stale enough to mean something is
            # actually wrong. A watermark parked exactly on the boundary drifts
            # past it a second later, and warning on every 20s poll would just
            # be a different kind of noise — which is the whole problem this
            # change exists to fix.
            stale_days = (floor - cutoff_dt).total_seconds() / 86400
            if cutoff_dt < floor - timedelta(hours=MAX_BACKLOG_HOURS):
                log.warning(
                    "tg_cutoff_ts is %s (%.1f days behind the %dh window); "
                    "nothing is advancing it",
                    cutoff_dt.isoformat(), stale_days, MAX_BACKLOG_HOURS,
                )
        pass_started = datetime.now(timezone.utc)
        s, f = run_instant_personal(conn, cutoff); res["ip"] += s; res["fail"] += f
        s, f = run_instant_broadcast(conn, cutoff); res["ib"] += s; res["fail"] += f
        s, f = run_digest(conn); res["dg"] += s; res["fail"] += f

        # Advance the watermark. It was written once and never moved again, so
        # it sat 23 days behind and logged the warning above every 20 seconds —
        # 29,528 lines of it. The clamp meant delivery still worked, which is
        # exactly why nobody caught it: the alarm was loud, permanent, and
        # false, so reading it told you nothing. An alarm that is always on is
        # the same as no alarm.
        #
        # Only advance when the pass drained the queue. Two ways it might not
        # have: a send failed (leave the watermark so the next pass retries
        # instead of stepping over it), or a batch came back full, which means
        # there is more behind it that was created before pass_started and
        # would fall outside a narrowed window — advancing there would drop
        # exactly the backlog the watermark exists to protect.
        drained = res["ip"] < BATCH_LIMIT and res["ib"] < BATCH_LIMIT
        if not res["fail"] and drained:
            set_config_ts(conn, "tg_cutoff_ts", pass_started.isoformat())
    return res

def main():
    once = "--once" in sys.argv
    log.info("tg delivery v2 start mode=%s bots=%d target=%s", "once" if once else "loop", len(ALERT_BOTS), TARGET_USER_IDS)
    while True:
        try:
            r = run_once()
            if r["ip"] or r["ib"] or r["dg"] or r["fail"]:
                log.info("pass: instant_personal=%d instant_broadcast=%d digest=%d failed=%d", r["ip"], r["ib"], r["dg"], r["fail"])
        except Exception as e:
            log.exception("pass failed: %s", e)
        if once: break
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
