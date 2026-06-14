"""Helpers for inspecting CoinAnk liquidation heatmap payloads."""

from __future__ import annotations

import json
from typing import Any


def _decode_json_container(value: Any) -> Any:
    """Decode JSON strings that contain an object or array."""
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped or stripped[0] not in "[{":
        return value
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return value


def find_liq_heatmap_record(raw: Any, *, max_depth: int = 6) -> dict | None:
    """
    Find the first nested object containing ``liqHeatMap``.

    Apify actors do not always return the dataset item at the root. This keeps
    the parser tolerant of wrappers such as ``data``, ``items``, or JSON
    strings without coupling it to one actor response shape.
    """
    seen: set[int] = set()

    def _walk(value: Any, depth: int) -> dict | None:
        if depth > max_depth:
            return None

        value = _decode_json_container(value)
        if isinstance(value, (dict, list)):
            identity = id(value)
            if identity in seen:
                return None
            seen.add(identity)

        if isinstance(value, dict):
            heatmap = value.get("liqHeatMap")
            decoded_heatmap = _decode_json_container(heatmap)
            if isinstance(decoded_heatmap, dict):
                if heatmap is not decoded_heatmap:
                    value = {**value, "liqHeatMap": decoded_heatmap}
                return value
            for nested in value.values():
                found = _walk(nested, depth + 1)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for nested in value:
                found = _walk(nested, depth + 1)
                if found is not None:
                    return found
        return None

    return _walk(raw, 0)


def has_usable_liq_heatmap_data(record: dict | None) -> bool:
    """Check the minimum shape required by the liquidity parser."""
    if not record:
        return False
    heatmap = record.get("liqHeatMap")
    if not isinstance(heatmap, dict):
        return False
    prices = heatmap.get("priceArray")
    rows = heatmap.get("data")
    return isinstance(prices, list) and bool(prices) and isinstance(rows, list) and bool(rows)


def describe_payload_shape(raw: Any) -> dict:
    """Return safe structural diagnostics without logging payload values."""
    decoded = _decode_json_container(raw)
    if isinstance(decoded, dict):
        return {
            "type": "object",
            "keys": sorted(str(key) for key in decoded.keys())[:20],
        }
    if isinstance(decoded, list):
        first = decoded[0] if decoded else None
        first = _decode_json_container(first)
        summary: dict[str, Any] = {"type": "array", "length": len(decoded)}
        if isinstance(first, dict):
            summary["first_keys"] = sorted(str(key) for key in first.keys())[:20]
        elif first is not None:
            summary["first_type"] = type(first).__name__
        return summary
    return {"type": type(decoded).__name__}
