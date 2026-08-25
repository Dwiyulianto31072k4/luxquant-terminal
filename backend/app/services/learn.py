# backend/app/services/learn.py
"""
The curriculum.

Resources used to be shelved by *format* — Research, Videos, Guides, Links.
After months it held two rows, which is what a format taxonomy earns: nobody
looking for help thinks "I need a video", they think "how do I read a call".

So format became a property of a lesson and the shelf became a **track**: an
ordered path from "a call arrived" to "I can size it and manage it".

The `numbers` track is the one that justifies the rebuild. LuxQuant's own
truth sheet (docs/social-content-truth-sheet.md) exists to stop marketing from
misstating what the figures mean — win rate is "reached at least TP1", not
"profitable trades"; peak is not realised gain. Members never saw that document,
and the gap between what a number looks like and what it is is this product's
largest trust risk. That track is the user-facing half of it.

Tracks live here rather than in a table because they are a product decision,
not content: adding one is a considered change, and the ordering carries
meaning that a free-text field would lose.
"""
from __future__ import annotations

TRACKS = [
    {
        "slug": "start",
        "title": "Start here",
        "summary": "What LuxQuant gives you, and where to read it.",
        "accent": "start",
    },
    {
        "slug": "read-a-call",
        "title": "Reading a call",
        "summary": "Entry, targets, stops — and what the chart is telling you.",
        "accent": "call",
    },
    {
        "slug": "numbers",
        "title": "What the numbers mean",
        "summary": "Win rate, peak vs realised, Edge, Verdict — stated plainly.",
        "accent": "numbers",
    },
    {
        "slug": "tools",
        "title": "The tools",
        "summary": "Terminal, AI Research, On-Chain, Pulse, Journal.",
        "accent": "tools",
    },
    {
        "slug": "automation",
        "title": "Automation",
        "summary": "Letting the Agent trade a call, and the limits of that.",
        "accent": "automation",
    },
    {
        "slug": "account",
        "title": "Your account",
        "summary": "Subscription, the VIP group, screening, notifications.",
        "accent": "account",
    },
]

TRACK_SLUGS = [t["slug"] for t in TRACKS]
_BY_SLUG = {t["slug"]: t for t in TRACKS}

LEVELS = ("basic", "intermediate", "advanced")


def track_meta(slug: str) -> dict | None:
    return _BY_SLUG.get(slug)


def track_order(slug: str) -> int:
    """Position of a track in the path. Unknown tracks sort last rather than
    raising — a lesson tagged with a retired track should still be listable."""
    try:
        return TRACK_SLUGS.index(slug)
    except ValueError:
        return len(TRACK_SLUGS)


def estimate_minutes(body: str | None, fallback: int | None = None) -> int:
    """Reading time, when the author has not set one.

    200 wpm is the common figure for screen reading of ordinary prose, and a
    lesson here is deliberately short — if this ever returns double digits the
    lesson wants splitting, not a longer estimate.
    """
    if fallback:
        return fallback
    words = len((body or "").split())
    if not words:
        return 1
    return max(1, round(words / 200))
