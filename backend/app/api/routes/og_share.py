# backend/app/api/routes/og_share.py
# ════════════════════════════════════════════════════════════════
# Open Graph share preview for signal links.
# Crawlers (WhatsApp/Telegram/X/Discord) hit /api/v1/og/signal/{id}
# via nginx UA-detection and get a tiny HTML page with og:image.
# Real browsers get the SPA (nginx try_files).
#
# Image strategy (Opsi A — reuse what X-poster already rendered):
#   • TP2+  → scan /opt/luxquant/screenshots/{id}/ for the combined
#             chart+PnL image (*_combined.png > *_with_card.png),
#             else raw chart, else PnL card. Wording shows levered gain
#             using the SAME formula as x_poster.py.
#   • <TP2  → static brand teaser (og-default.png).
# ════════════════════════════════════════════════════════════════
import glob
import html
import os

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import text

from app.core.database import engine

router = APIRouter()

SITE = "https://luxquant.tw"
TEASER_IMAGE = f"{SITE}/og-default.png"

SCREENSHOT_DIR = "/opt/luxquant/screenshots"

# Map an absolute on-disk path to its public nginx URL.
_PATH_MAP = (
    ("/opt/luxquant/screenshots/", "/api/v1/charts/"),
    ("/opt/luxquant/pnl-cards/", "/api/v1/cards/"),
)

# TP ordinal helpers (mirror x_poster.py).
_TP_ORDINAL = {"tp2": 2, "tp3": 3, "tp4": 4}
_ORDINAL_LABEL = {2: "TP2", 3: "TP3", 4: "TP4"}


def _to_public_url(disk_path):
    if not disk_path:
        return None
    for prefix, url_prefix in _PATH_MAP:
        if disk_path.startswith(prefix):
            return SITE + url_prefix + disk_path[len(prefix):]
    return None


def _find_combined_image(signal_id):
    """Find the nicest pre-rendered image X-poster already saved on disk.
    Priority: *_combined.png > *_with_card.png > any raw tp*.png."""
    folder = os.path.join(SCREENSHOT_DIR, str(signal_id))
    if not os.path.isdir(folder):
        return None

    def newest(pattern):
        files = glob.glob(os.path.join(folder, pattern))
        return max(files, key=os.path.getmtime) if files else None

    return (
        newest("*_combined.png")
        or newest("*_with_card.png")
        or newest("*tp[234]_*.png")
    )


def _fetch(signal_id):
    with engine.connect() as conn:
        sig = conn.execute(
            text("""
                SELECT signal_id, pair, entry,
                       target2, target3, target4,
                       pnl_leverage,
                       latest_chart_path, entry_chart_path,
                       pnl_card_latest_path
                FROM signals
                WHERE signal_id = :sid
            """),
            {"sid": signal_id},
        ).fetchone()
        if not sig:
            return None
        sig = dict(sig._mapping)

        rows = conn.execute(
            text("""
                SELECT DISTINCT update_type FROM signal_updates
                WHERE signal_id = :sid
                  AND update_type IN ('tp2','tp3','tp4')
            """),
            {"sid": signal_id},
        ).fetchall()
        ordinals = [_TP_ORDINAL[r[0]] for r in rows if r[0] in _TP_ORDINAL]
        sig["highest_tp"] = max(ordinals) if ordinals else 0
        return sig


def _compute_gain(sig):
    """Levered gain at the highest TP hit. Mirrors x_poster.py formula:
       pct = (tp - entry)/entry*100 ; levpct = pct * leverage.
       Returns (pct, levpct, lev, tp_label) or None."""
    entry = sig.get("entry")
    top = sig.get("highest_tp") or 0
    if not entry or top < 2:
        return None
    tp_price = {2: sig.get("target2"), 3: sig.get("target3"), 4: sig.get("target4")}.get(top)
    if not tp_price:
        # fall back to the highest target price actually present
        for o in (top, 4, 3, 2):
            tp_price = {2: sig.get("target2"), 3: sig.get("target3"), 4: sig.get("target4")}.get(o)
            if tp_price:
                top = o
                break
    if not tp_price:
        return None
    pct = round((tp_price - entry) / entry * 100, 2)
    lev = sig.get("pnl_leverage") or 10
    levpct = round(pct * lev, 1)
    return pct, levpct, lev, _ORDINAL_LABEL.get(top, f"TP{top}")


def _page(*, title, desc, image, redirect):
    t = html.escape(title)
    d = html.escape(desc)
    img = html.escape(image)
    url = html.escape(redirect)
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LuxQuant Terminal">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{t}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
<title>{t}</title>
<meta http-equiv="refresh" content="0; url={url}">
</head><body>
<p>Redirecting to <a href="{url}">{t}</a>…</p>
<script>location.replace({url!r});</script>
</body></html>"""


@router.get("/og/signal/{signal_id}", response_class=HTMLResponse)
def og_signal(signal_id, ref=None):
    sig = _fetch(signal_id)

    suffix = f"&ref={html.escape(ref)}" if ref else ""
    redirect = f"{SITE}/signals?signal={signal_id}{suffix}"

    if not sig:
        return HTMLResponse(_page(
            title="LuxQuant Terminal",
            desc="Algorithmic crypto signals. Bull or bear, informed by data and decided by you.",
            image=TEASER_IMAGE,
            redirect=f"{SITE}/signals",
        ))

    pair = sig.get("pair") or "Signal"

    if sig["highest_tp"] >= 2:
        # Best pre-rendered image already on disk (combined chart + PnL).
        # All numbers (gain, leverage) live IN the image, not the text.
        disk = _find_combined_image(signal_id)
        image = (
            _to_public_url(disk)
            or _to_public_url(sig.get("latest_chart_path"))
            or _to_public_url(sig.get("entry_chart_path"))
            or _to_public_url(sig.get("pnl_card_latest_path"))
            or TEASER_IMAGE
        )
        tp_label = _ORDINAL_LABEL.get(sig["highest_tp"], "target")
        title = f"{pair} reached {tp_label} \u00b7 LuxQuant Terminal"
        desc = (
            f"{pair} reached {tp_label} on LuxQuant Terminal \u2014 see how it "
            f"played out. Bull or bear, informed by data and decided by you."
        )
    else:
        image = TEASER_IMAGE
        title = f"{pair} · LuxQuant Terminal"
        desc = (
            f"Track {pair} on LuxQuant Terminal. "
            f"Bull or bear, informed by data and decided by you."
        )

    return HTMLResponse(_page(
        title=title,
        desc=desc,
        image=image,
        redirect=redirect,
    ))


@router.get("/og/signal/{signal_id}/image")
def og_signal_image(signal_id):
    """Redirect to the best share image: combined chart+PnL if TP2+,
    else the brand teaser. Used by the frontend to share an image file."""
    sig = _fetch(signal_id)
    if sig and sig["highest_tp"] >= 2:
        disk = _find_combined_image(signal_id)
        url = (
            _to_public_url(disk)
            or _to_public_url(sig.get("latest_chart_path"))
            or _to_public_url(sig.get("entry_chart_path"))
            or _to_public_url(sig.get("pnl_card_latest_path"))
            or TEASER_IMAGE
        )
    else:
        url = TEASER_IMAGE
    return RedirectResponse(url, status_code=302)


@router.get("/og/signal/{signal_id}/tweet")
def og_signal_tweet(signal_id):
    """Return the X tweet URL for this signal's latest post (TP2+), if any."""
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT tweet_id FROM x_posts
                WHERE signal_id = :sid AND tweet_id IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"sid": signal_id},
        ).fetchone()
    if not row or not row[0]:
        return {"url": None}
    return {"url": f"https://x.com/luxquantcrypto/status/{row[0]}"}
