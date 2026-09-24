"""Which picture a call update carries, and whether it is the whole receipt.

Both VIP topics now post the same thing — LuxQuant Call Tracking and Runners
Call Selected — so the rule for finding that picture lives in one place. The
owner asked for it on every milestone, TP and stop loss alike, late if need be:
a subscriber deciding whether to renew is reading the record, and a line of
text is a claim while a chart with the PnL card on it is a receipt.

Two directories hold one file per milestone, named <PAIR>_<event>_<ts>.png:

  /opt/luxquant/pnl-cards/<signal_id>/    the Binance-style PnL card
  /opt/luxquant/screenshots/<signal_id>/  the chart with the hit marked, plus
                                          the composites the X pipeline derives

The `latest_chart_path` / `pnl_card_latest_path` columns are deliberately NOT
used: every new update overwrites them, so a TP1 post carried the TP3 picture
when two hits landed minutes apart (observed on HUSDT, 24 Sep 2026).

The two halves come from two different workers, seconds apart and in no fixed
order — INITUSDT tp2 had its card at 12:29:30 and its chart at 12:29:43 — so
`event_image` reports which halves it found and the caller waits with
`should_wait` rather than posting half a picture.

The entry frame is left out on purpose. A VIP subscriber already received the
call itself, so an update only has to show how it ended; that also rules out
the `_combined` stack the X pipeline builds for outsiders.
"""
from __future__ import annotations

import glob
import logging
import os
import subprocess

logger = logging.getLogger(__name__)

CARD_DIR = os.getenv("LQ_CARD_DIR", "/opt/luxquant/pnl-cards")
CHART_DIR = os.getenv("LQ_CHART_DIR", "/opt/luxquant/screenshots")

# Composites the X pipeline derives from a chart. `_combined` stacks the entry
# plan above the result and `_cta`/`_xframe` are its framed marketing crops;
# none of them belong in a VIP update, so they are excluded when looking for
# the plain frame.
DERIVED = ("_combined", "_with_card", "_cta", "_xframe")

# How long a post may be held back waiting for its other half. The render takes
# seconds; this is the ceiling for when those workers are backed up.
WAIT_MINUTES = float(os.getenv("TG_TRACK_IMAGE_WAIT_MIN", "12"))

# Pillow and the overlay helper live with the X poster, not in this venv, so
# the composite is drawn by a short-lived child process rather than by adding
# Pillow to a second production environment.
HELPER_PY = os.getenv("LQ_TRACK_IMAGE_PY", "/root/luxquant-x-poster/venv/bin/python")
HELPER_TOOL = os.getenv("LQ_TRACK_IMAGE_TOOL", "/root/luxquant-x-poster/track_image.py")


def _latest(pattern: str, exclude: tuple[str, ...] = ()) -> str | None:
    try:
        hits = sorted(glob.glob(pattern))
    except OSError:
        return None
    for token in exclude:
        hits = [h for h in hits if token not in os.path.basename(h)]
    return hits[-1] if hits else None


def event_image(signal_id, pair: str, event_type: str) -> tuple[str | None, str | None]:
    """(path, kind) for one milestone. kind is composite, chart, card or None.

    `composite` is the picture worth posting: the chart with the card on it.
    The X pipeline has already built one for whatever it processed; where it
    has not (every TP1, every stop loss), it is drawn here from the same
    helper rather than falling back to a bare chart.
    """
    ev = "sl" if event_type in ("closed_loss", "sl") else event_type
    if event_type == "closed_win":
        ev = "tp4"
    shots = os.path.join(CHART_DIR, str(signal_id))
    card = _latest(os.path.join(CARD_DIR, str(signal_id), f"{pair}_{ev}_*.png"))

    ready = _latest(os.path.join(shots, f"{pair}_{ev}_*_with_card.png"),
                    exclude=("_cta", "_xframe", "_combined"))
    if ready:
        return ready, "composite"

    chart = _latest(os.path.join(shots, f"{pair}_{ev}_*.png"), exclude=DERIVED)
    if chart and card:
        built = draw_card_onto_chart(chart, card)
        if built:
            return built, "composite"
    if chart:
        return chart, "chart"
    if card:
        return card, "card"
    return None, None


def draw_card_onto_chart(chart: str, card: str) -> str | None:
    """Ask the X poster's venv to composite the two; None if it could not."""
    try:
        r = subprocess.run([HELPER_PY, HELPER_TOOL, chart, card],
                           capture_output=True, text=True, timeout=90)
    except Exception as exc:  # missing venv, timeout, permissions
        logger.warning("image helper did not run: %s: %s", type(exc).__name__, exc)
        return None
    out = (r.stdout or "").strip().splitlines()
    path = out[-1] if out else ""
    if r.returncode == 0 and path and os.path.isfile(path):
        return path
    logger.warning("no composite for %s: rc=%s %s", os.path.basename(chart),
                   r.returncode, (r.stderr or "").strip()[:160])
    return None


def should_wait(kind: str | None, age_minutes: float, still_expected: bool = True) -> bool:
    """True while the rest of the picture is plausibly still being rendered.

    Half a picture is not a receipt: a card alone says nothing about where
    price went, and a chart alone leaves the reader to work out what the move
    was worth. Holding one half means the other is rendering right now.

    `still_expected` is for the case where neither half exists yet. The chart
    worker renders a signal's NEWEST milestone only, so a TP1 that TP2 has
    already overtaken will never get a picture (measured over seven days: 85 of
    724 TP1 posts had one, against 311 of 311 TP4s) — waiting on those would
    delay the post for nothing.
    """
    if kind == "composite":
        return False
    if kind is None and not still_expected:
        return False
    return age_minutes < WAIT_MINUTES


# Both posters ask the same question of the same table: is this milestone the
# newest one this signal has? Every milestone of a cumulative message shares
# one update_at, so the rank breaks the tie — exactly as the chart worker's own
# get_pending_updates does. Without the tiebreaker this agreed with what is on
# disk 42% of the time; with it, 2509 of 2509.
IS_LATEST_SQL = """
    (u.update_type = (SELECT u3.update_type FROM signal_updates u3
                      WHERE u3.signal_id = {sid}
                        AND u3.update_type IN ('tp1','tp2','tp3','tp4','sl')
                      ORDER BY u3.update_at::timestamptz DESC,
                               CASE u3.update_type
                                   WHEN 'tp4' THEN 5 WHEN 'tp3' THEN 4
                                   WHEN 'tp2' THEN 3 WHEN 'tp1' THEN 2
                                   ELSE 1 END DESC
                      LIMIT 1))
"""
