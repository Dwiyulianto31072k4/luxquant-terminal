#!/usr/bin/env python3
"""Fetch missing assets via urllib with realistic browser headers."""
import urllib.request, os, ssl

DEST = "Crypto Trading & PnL Screenshot Generator_files"
BASE = "https://trading-screenshot-generator.com/wp-content/plugins/trade-screenshot-generator/assets"
FILES = ["bg-binance-4.png","avatar-default-binance.png","binance-battery-7.png",
         "binance-bottom-7.png","binance-btn-graph-7.png","binance-icon-account-7.png",
         "binance-icon-graph-7.png","binance-toggle-7.png"]
os.makedirs(DEST, exist_ok=True)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for f in FILES:
    out = os.path.join(DEST, f)
    if os.path.exists(out):
        print(f"skip   {f}")
        continue
    req = urllib.request.Request(f"{BASE}/{f}", headers={
        "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Referer":"https://trading-screenshot-generator.com/trading-screenshot-generator/",
        "Accept":"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.9",
        "Sec-Fetch-Dest":"image","Sec-Fetch-Mode":"no-cors","Sec-Fetch-Site":"same-origin",
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
            with open(out,"wb") as w: w.write(r.read())
        print(f"ok     {f} ({os.path.getsize(out)//1024}K)")
    except Exception as e:
        print(f"FAIL   {f}: {e}")
