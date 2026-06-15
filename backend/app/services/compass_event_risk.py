"""Structured news and economic-event context for BTC Compass.

This layer is deliberately non-directional. It may surface warnings and reduce
confidence around event risk, but it never creates or flips a market direction.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from app.services.calendar_service import get_calendar, get_calendar_health
from app.services.macro_news_service import get_macro_news


NEWS_FRESH_SECONDS = 60 * 60
NEWS_STALE_SECONDS = 6 * 60 * 60
MAX_HEADLINES = 12
MAX_EVENTS = 10

TOPICS = (
    (
        "market_stress",
        "Market stress",
        (
            "liquidation", "hack", "exploit", "bankruptcy", "default",
            "selloff", "crash", "war", "conflict",
        ),
    ),
    (
        "monetary_policy",
        "Monetary policy",
        (
            "fed", "fomc", "powell", "interest rate", "rate cut",
            "rate hike", "monetary policy", "central bank", "ecb", "boj",
        ),
    ),
    (
        "inflation",
        "Inflation",
        ("inflation", "cpi", "pce", "producer price", "ppi"),
    ),
    (
        "labor_growth",
        "Labor and growth",
        (
            "nonfarm", "non-farm", "payroll", "unemployment", "jobs report",
            "jobless", "gdp", "retail sales", "recession",
        ),
    ),
    (
        "regulation",
        "Regulation",
        (
            "sec", "regulation", "regulator", "lawsuit", "ban", "sanction",
            "stablecoin bill", "crypto law", "tariff",
        ),
    ),
    (
        "institutional_flows",
        "Institutional flows",
        ("etf", "inflow", "outflow", "institutional", "treasury", "reserve"),
    ),
    (
        "bitcoin_market",
        "Bitcoin market",
        (
            "bitcoin", "btc", "crypto", "mining", "halving", "whale",
            "exchange", "stablecoin",
        ),
    ),
)

RISK_OFF_TERMS = (
    "hawkish", "rate hike", "hot inflation", "higher inflation", "crackdown",
    "ban", "lawsuit", "hack", "exploit", "war", "conflict", "selloff",
    "crash", "outflow", "recession", "default", "liquidation",
)
RISK_ON_TERMS = (
    "dovish", "rate cut", "cooling inflation", "lower inflation", "approval",
    "approved", "inflow", "adoption", "reserve", "easing", "stimulus",
)
HIGH_NEWS_TERMS = (
    "fomc", "fed decision", "cpi", "pce", "nonfarm", "non-farm", "sec",
    "etf approval", "etf approved", "hack", "exploit", "war", "rate cut",
    "rate hike",
)
MAJOR_EVENT_TERMS = (
    "federal funds rate", "fomc", "fed chair", "powell", "cpi", "pce",
    "non-farm", "nonfarm", "unemployment rate", "gdp", "retail sales",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _canonical_title(value: str) -> str:
    text = re.sub(r"\s+-\s+[^-]{2,40}$", "", value or "")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _topic_for(text: str) -> tuple[str, str]:
    lowered = text.lower()
    for key, label, keywords in TOPICS:
        if any(keyword in lowered for keyword in keywords):
            return key, label
    return "other", "Other"


def _tone_for(text: str) -> str:
    lowered = text.lower()
    risk_off = sum(term in lowered for term in RISK_OFF_TERMS)
    risk_on = sum(term in lowered for term in RISK_ON_TERMS)
    if risk_off and risk_on:
        return "mixed"
    if risk_off:
        return "risk_off"
    if risk_on:
        return "risk_on"
    return "neutral"


def _relevance_score(text: str) -> float:
    lowered = text.lower()
    if "bitcoin" in lowered or re.search(r"\bbtc\b", lowered):
        return 1.0
    if any(term in lowered for term in HIGH_NEWS_TERMS):
        return 0.9
    if any(keyword in lowered for _, _, terms in TOPICS for keyword in terms):
        return 0.75
    return 0.45


def _news_impact(text: str, relevance: float) -> str:
    lowered = text.lower()
    if any(term in lowered for term in HIGH_NEWS_TERMS):
        return "high"
    if relevance >= 0.75:
        return "medium"
    return "low"


def _news_health(payload: dict, now: datetime) -> dict:
    fetched_at = _parse_datetime(payload.get("fetched_at"))
    age_seconds = (
        max(0.0, (now - fetched_at).total_seconds()) if fetched_at else None
    )
    explicit_status = payload.get("status")
    if explicit_status in {"fresh", "stale", "unavailable"}:
        status = explicit_status
    elif age_seconds is not None and age_seconds <= NEWS_FRESH_SECONDS:
        status = "fresh"
    elif age_seconds is not None and age_seconds <= NEWS_STALE_SECONDS:
        status = "stale"
    else:
        status = "unavailable"
    return {
        "provider": "rss_news",
        "status": status,
        "available": status in {"fresh", "stale"},
        "fetched_at": fetched_at.isoformat() if fetched_at else None,
        "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
        "article_count": len(payload.get("articles") or []),
        "successful_sources": payload.get("successful_sources"),
        "source_errors": payload.get("source_errors") or [],
    }


def _normalize_headlines(payload: dict, now: datetime) -> list[dict]:
    seen: set[str] = set()
    normalized = []
    for article in payload.get("articles") or []:
        title = str(article.get("title") or "").strip()
        url = str(article.get("link") or article.get("url") or "").strip()
        canonical = _canonical_title(title)
        if not title or not canonical or canonical in seen:
            continue
        seen.add(canonical)

        published = _parse_datetime(article.get("published"))
        age_seconds = (
            max(0.0, (now - published).total_seconds()) if published else None
        )
        text = f"{title} {article.get('description') or ''}"
        topic, topic_label = _topic_for(text)
        relevance = _relevance_score(text)
        normalized.append({
            "title": title,
            "url": url or None,
            "source": article.get("source") or "Unknown",
            "published_at": published.isoformat() if published else None,
            "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
            "topic": topic,
            "topic_label": topic_label,
            "relevance_score": relevance,
            "impact": _news_impact(text, relevance),
            "tone": _tone_for(text),
        })

    normalized.sort(
        key=lambda item: (
            item["published_at"] or "",
            item["relevance_score"],
        ),
        reverse=True,
    )
    return normalized[:MAX_HEADLINES]


def _normalize_events(events: list[dict], now: datetime) -> list[dict]:
    normalized = []
    for event in events:
        event_at = _parse_datetime(event.get("date"))
        if event_at is None:
            continue
        hours_until = (event_at - now).total_seconds() / 3600
        if hours_until < 0 or hours_until > 168:
            continue

        title = str(event.get("title") or "").strip()
        lowered = title.lower()
        country = str(event.get("country") or "").upper()
        raw_impact = str(event.get("impact") or "Low").lower()
        is_major = any(term in lowered for term in MAJOR_EVENT_TERMS)
        btc_relevance = (
            1.0 if country == "USD" and is_major
            else 0.85 if country == "USD" and raw_impact == "high"
            else 0.7 if is_major
            else 0.45
        )
        if btc_relevance < 0.7:
            continue

        topic, topic_label = _topic_for(title)
        risk_window = (
            "imminent" if hours_until <= 6
            else "next_24h" if hours_until <= 24
            else "next_72h" if hours_until <= 72
            else "later"
        )
        normalized.append({
            "title": title,
            "country": country or None,
            "scheduled_at": event_at.isoformat(),
            "hours_until": round(hours_until, 1),
            "impact": raw_impact,
            "topic": topic,
            "topic_label": topic_label,
            "btc_relevance": btc_relevance,
            "risk_window": risk_window,
            "forecast": event.get("forecast") or None,
            "previous": event.get("previous") or None,
        })

    normalized.sort(key=lambda item: item["scheduled_at"])
    return normalized[:MAX_EVENTS]


def _topic_summary(headlines: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for headline in headlines:
        grouped[headline["topic"]].append(headline)

    result = []
    for topic, items in grouped.items():
        tones = Counter(item["tone"] for item in items)
        impacts = Counter(item["impact"] for item in items)
        dominant_tone = tones.most_common(1)[0][0]
        impact = (
            "high" if impacts["high"]
            else "medium" if impacts["medium"]
            else "low"
        )
        result.append({
            "topic": topic,
            "label": items[0]["topic_label"],
            "article_count": len(items),
            "impact": impact,
            "dominant_tone": dominant_tone,
        })
    result.sort(
        key=lambda item: (
            {"high": 3, "medium": 2, "low": 1}[item["impact"]],
            item["article_count"],
        ),
        reverse=True,
    )
    return result


def _risk_assessment(headlines: list[dict], events: list[dict]) -> dict:
    high_24h_events = [
        event for event in events
        if 0 <= event["hours_until"] <= 24 and event["impact"] == "high"
    ]
    high_72h_events = [
        event for event in events
        if 0 <= event["hours_until"] <= 72 and event["impact"] == "high"
    ]
    recent_high_news = [
        item for item in headlines
        if item["impact"] == "high"
        and item["age_seconds"] is not None
        and item["age_seconds"] <= 24 * 3600
    ]

    warnings = []
    if high_24h_events:
        warnings.append(
            f"{len(high_24h_events)} high-impact macro event(s) fall inside the next 24 hours."
        )
    elif high_72h_events:
        warnings.append(
            f"{len(high_72h_events)} high-impact macro event(s) fall inside the next 72 hours."
        )
    if recent_high_news:
        warnings.append(
            f"{len(recent_high_news)} high-impact headline(s) require closer monitoring."
        )

    if high_24h_events:
        risk_level = "high"
        penalty = 8
    elif high_72h_events or recent_high_news:
        risk_level = "elevated"
        penalty = 4
    else:
        risk_level = "low"
        penalty = 0

    if not warnings:
        warnings.append("No scheduled high-impact event is inside the next 72 hours.")

    return {
        "risk_level": risk_level,
        "confidence_penalty_points": penalty,
        "warnings": warnings,
        "next_24h": {
            "event_count": sum(0 <= event["hours_until"] <= 24 for event in events),
            "high_impact_count": len(high_24h_events),
        },
        "next_72h": {
            "event_count": sum(0 <= event["hours_until"] <= 72 for event in events),
            "high_impact_count": len(high_72h_events),
        },
    }


def build_event_risk_snapshot(
    news_payload: Optional[dict],
    calendar_events: Optional[list[dict]],
    *,
    calendar_health: Optional[dict] = None,
    now: Optional[datetime] = None,
) -> dict:
    """Build a deterministic, serializable event-risk snapshot."""
    now = (now or _utc_now()).astimezone(timezone.utc)
    news_payload = news_payload or {}
    calendar_events = calendar_events or []
    headlines = _normalize_headlines(news_payload, now)
    events = _normalize_events(calendar_events, now)
    news_health = _news_health(news_payload, now)
    calendar_health = calendar_health or {
        "provider": "forexfactory",
        "status": "unavailable",
        "available": False,
        "fetched_at": None,
        "age_seconds": None,
        "event_count": 0,
    }
    assessment = _risk_assessment(headlines, events)

    if (
        calendar_health.get("available")
        and calendar_health.get("covers_72h") is False
    ):
        coverage_warning = (
            "Economic-calendar coverage ends before the full 72-hour window."
        )
        if assessment["risk_level"] == "low":
            assessment["warnings"] = [coverage_warning]
        else:
            assessment["warnings"].append(coverage_warning)

    if not news_health["available"] and not calendar_health.get("available"):
        assessment.update({
            "risk_level": "unavailable",
            "confidence_penalty_points": 0,
            "warnings": [
                "News and calendar sources are unavailable; event risk could not be assessed."
            ],
        })

    return {
        "phase": 3,
        "generated_at": now.isoformat(),
        "purpose": "context_and_event_risk_only",
        "direction_authority": False,
        "risk_level": assessment["risk_level"],
        "summary": assessment["warnings"][0],
        "warnings": assessment["warnings"],
        "confidence_adjustment": {
            "penalty_points": assessment["confidence_penalty_points"],
            "can_increase_confidence": False,
            "can_change_direction": False,
        },
        "windows": {
            "next_24h": assessment["next_24h"],
            "next_72h": assessment["next_72h"],
        },
        "source_health": {
            "news": news_health,
            "calendar": calendar_health,
        },
        "topics": _topic_summary(headlines),
        "headlines": headlines,
        "upcoming_events": events,
    }


async def get_event_risk_snapshot(
    *,
    news_limit: int = 30,
    include_next_week: bool = False,
) -> dict:
    """Fetch existing sources and return the structured Compass snapshot."""
    news_payload = await get_macro_news(limit=news_limit)
    events = await get_calendar(include_next_week=include_next_week)
    health = get_calendar_health(
        include_next_week=include_next_week,
        event_count=len(events),
        events=events,
    )
    return build_event_risk_snapshot(
        news_payload,
        events,
        calendar_health=health,
    )


def apply_event_risk_to_verdict(verdict: Any, snapshot: dict) -> dict:
    """Lower 24h/72h confidence without changing either direction."""
    penalty = max(
        0,
        min(
            15,
            int((snapshot.get("confidence_adjustment") or {}).get("penalty_points") or 0),
        ),
    )
    audit = {
        "penalty_points": penalty,
        "directions_unchanged": True,
        "horizons": {},
    }
    for attribute, label in (
        ("tactical_24h", "24h"),
        ("secondary_7d", "72h"),
    ):
        horizon = getattr(verdict, attribute, None)
        if horizon is None:
            continue
        direction_before = horizon.direction
        confidence_before = int(horizon.confidence)
        horizon.confidence = max(0, confidence_before - penalty)
        audit["horizons"][label] = {
            "direction": direction_before,
            "confidence_before": confidence_before,
            "confidence_after": int(horizon.confidence),
        }
        audit["directions_unchanged"] = (
            audit["directions_unchanged"] and horizon.direction == direction_before
        )
    snapshot["confidence_adjustment"]["audit"] = audit
    return audit


__all__ = [
    "apply_event_risk_to_verdict",
    "build_event_risk_snapshot",
    "get_event_risk_snapshot",
]
