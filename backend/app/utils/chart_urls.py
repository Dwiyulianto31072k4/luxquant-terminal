# backend/app/utils/chart_urls.py
"""
Convert filesystem chart paths to API-accessible URLs.

Filesystem: /opt/luxquant/screenshots/{signal_id}/PAIR_entry_20260224.png
API URL:    /api/v1/charts/{signal_id}/PAIR_entry_20260224.png
"""

SCREENSHOTS_BASE = "/opt/luxquant/screenshots"
API_CHARTS_PREFIX = "/api/v1/charts"


def chart_path_to_url(fs_path: str | None) -> str | None:
    """Convert filesystem path to API URL path.
    
    Input:  /opt/luxquant/screenshots/abc-123/BTCUSDT_entry_20260224.png
    Output: /api/v1/charts/abc-123/BTCUSDT_entry_20260224.png
    """
    if not fs_path:
        return None
    
    # Strip the base path and prepend API prefix
    if fs_path.startswith(SCREENSHOTS_BASE):
        relative = fs_path[len(SCREENSHOTS_BASE):]
        return f"{API_CHARTS_PREFIX}{relative}"
    
    # If already a relative path or URL, return as-is
    if fs_path.startswith("/api/"):
        return fs_path
    
    return None