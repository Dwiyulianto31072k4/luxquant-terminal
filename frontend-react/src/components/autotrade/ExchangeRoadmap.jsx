// src/components/autotrade/ExchangeRoadmap.jsx
// Bitget + BingX are live (USDT-M futures). One venue at a time.

import { Card, StatusBadge, GoldButton } from "./AutoTradeUI";
import { VenueLogo } from "./exchangeVenues";

export default function ExchangeRoadmap({ onConnectBitget, onConnectBingx }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          More exchanges
        </p>
        <p className="mt-1 text-[12px] leading-5 text-text-muted">
          Bitget and BingX support spot and USDT-M futures. One venue at a time.
          Still an assistant — you turn it off.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <VenueLogo venue="bitget" className="h-10 w-10" />
            <StatusBadge tone="good">Live</StatusBadge>
          </div>
          <h3 className="mt-3 text-base font-semibold text-text-primary">Bitget</h3>
          <p className="mt-1 text-[12px] leading-5 text-text-muted">
            Spot + USDT-M futures. Needs API key, secret, and passphrase.
          </p>
          <div className="mt-4">
            <GoldButton onClick={onConnectBitget}>Connect Bitget</GoldButton>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <VenueLogo venue="bingx" className="h-10 w-10" />
            <StatusBadge tone="good">Live</StatusBadge>
          </div>
          <h3 className="mt-3 text-base font-semibold text-text-primary">BingX</h3>
          <p className="mt-1 text-[12px] leading-5 text-text-muted">
            Spot + USDT-M perpetual for India and regions where Binance is hard to use. Key + secret only.
          </p>
          <div className="mt-4">
            <GoldButton onClick={onConnectBingx}>Connect BingX</GoldButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
