# backend/app/utils/chart_urls.py
import os

"""
Convert filesystem chart paths to API-accessible URLs.

Filesystem: /opt/luxquant/screenshots/{signal_id}/PAIR_entry_20260224.png
API URL:    http://76.13.194.86/api/v1/charts/{signal_id}/PAIR_entry_20260224.png
"""

SCREENSHOTS_BASE = "/opt/luxquant/screenshots"

# Menggunakan IP VPS kamu sebagai default URL. 
# (Jika di VPS jalan di port 8000, ubah jadi "http://76.13.194.86:8000/api/v1/charts")
API_CHARTS_PREFIX = os.getenv("CHARTS_BASE_URL", "https://luxquant.tw/api/v1/charts")

def chart_path_to_url(fs_path: str | None) -> str | None:
    """Convert filesystem path to API URL path."""
    if not fs_path:
        return None
    
    # Jika path dari database adalah /opt/luxquant/screenshots/...
    if fs_path.startswith(SCREENSHOTS_BASE):
        relative = fs_path[len(SCREENSHOTS_BASE):]
        return f"{API_CHARTS_PREFIX}{relative}"
    
    # Jika path di database tersimpan sebagai /api/v1/charts/...
    if fs_path.startswith("/api/"):
        if API_CHARTS_PREFIX.startswith("http"):
            # Ubah relative URL menjadi Absolute URL (tembak ke VPS)
            return fs_path.replace("/api/v1/charts", API_CHARTS_PREFIX)
        return fs_path
        
    # Jika path sudah berbentuk http://... kembalikan apa adanya
    if fs_path.startswith("http"):
        return fs_path
    
    return None