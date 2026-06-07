#!/bin/bash
DEST="Crypto Trading & PnL Screenshot Generator_files"
BASE="https://trading-screenshot-generator.com/wp-content/plugins/trade-screenshot-generator/assets"
FILES=(bg-binance-4.png avatar-default-binance.png binance-battery-7.png binance-bottom-7.png binance-btn-graph-7.png binance-icon-account-7.png binance-icon-graph-7.png binance-toggle-7.png)
mkdir -p "$DEST"
for f in "${FILES[@]}"; do
  echo "fetch  $f"
  curl -sSL --fail \
    -H "Referer: https://trading-screenshot-generator.com/trading-screenshot-generator/" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    -H "Accept: image/avif,image/webp,image/png,image/*,*/*;q=0.8" \
    "$BASE/$f" -o "$DEST/$f" \
    && echo "   ok ($(du -h "$DEST/$f" | cut -f1))" \
    || echo "   STILL FAILED"
done
