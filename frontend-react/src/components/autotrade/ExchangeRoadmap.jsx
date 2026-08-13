// src/components/autotrade/ExchangeRoadmap.jsx
// Bitget is live (USDT-M futures). BingX stays an honest waitlist.

import { useEffect, useState } from "react";
import { Card, StatusBadge, GoldButton, GhostButton, Notice } from "./AutoTradeUI";
import { BitgetIcon, BingxIcon } from "./BrandIcons";
import { getExchangeWaitlist, joinExchangeWaitlist } from "../../services/authApi";

export default function ExchangeRoadmap({ onConnectBitget }) {
  const [joined, setJoined] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getExchangeWaitlist()
      .then((data) => {
        if (!alive) return;
        const next = {};
        for (const row of data?.items || []) next[row.exchange] = true;
        setJoined(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const join = async (exchange) => {
    setError("");
    setBusy(exchange);
    try {
      await joinExchangeWaitlist(exchange);
      setJoined((c) => ({ ...c, [exchange]: true }));
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        (typeof detail === "string" && detail) || err.message || "Could not join the waitlist"
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          More exchanges
        </p>
        <p className="mt-1 text-[12px] leading-5 text-text-muted">
          Bitget USDT-M futures is live. BingX is next for regions where Binance is hard to use.
          Agent v1 still runs one venue at a time.
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-ink/[0.08] bg-surface-secondary text-text-primary">
              <BitgetIcon className="h-5 w-5" />
            </span>
            <StatusBadge tone="good">Live</StatusBadge>
          </div>
          <h3 className="mt-3 text-base font-semibold text-text-primary">Bitget</h3>
          <p className="mt-1 text-[12px] leading-5 text-text-muted">
            USDT-M futures, isolated by default. Needs API key, secret, and passphrase. Same risk
            gates as Binance.
          </p>
          <div className="mt-4">
            <GoldButton onClick={onConnectBitget}>Connect Bitget</GoldButton>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-ink/[0.08] bg-surface-secondary text-text-primary">
              <BingxIcon className="h-5 w-5" />
            </span>
            <StatusBadge tone={joined.bingx ? "good" : "warn"}>
              {joined.bingx ? "On the list" : "Coming"}
            </StatusBadge>
          </div>
          <h3 className="mt-3 text-base font-semibold text-text-primary">BingX</h3>
          <p className="mt-1 text-[12px] leading-5 text-text-muted">
            India and regions where Binance is painful to use or restricted.
          </p>
          <div className="mt-4">
            {joined.bingx ? (
              <GhostButton disabled>We'll email you in-app when beta opens</GhostButton>
            ) : (
              <GoldButton onClick={() => join("bingx")} disabled={busy === "bingx"}>
                {busy === "bingx" ? "Joining…" : "Notify me for BingX"}
              </GoldButton>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
