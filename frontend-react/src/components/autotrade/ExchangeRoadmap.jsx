// src/components/autotrade/ExchangeRoadmap.jsx
// Bitget + BingX are the next venues (Canada / India demand). Connect is
// not live yet — this is an honest waitlist, not a fake form.

import { useEffect, useState } from "react";
import { Card, StatusBadge, GoldButton, GhostButton, Notice } from "./AutoTradeUI";
import { BitgetIcon, BingxIcon } from "./BrandIcons";
import { getExchangeWaitlist, joinExchangeWaitlist } from "../../services/authApi";

const VENUES = [
  {
    id: "bitget",
    name: "Bitget",
    why: "Asked first — futures + copy-friendly API. Priority after Binance.",
    Icon: BitgetIcon,
  },
  {
    id: "bingx",
    name: "BingX",
    why: "India and regions where Binance is painful to use or restricted.",
    Icon: BingxIcon,
  },
];

export default function ExchangeRoadmap() {
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
          Next exchanges
        </p>
        <p className="mt-1 text-[12px] leading-5 text-text-muted">
          Live execution is Binance only. Join the list if you want Agent on Bitget
          or BingX — we use this to decide order, not to take keys yet.
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {VENUES.map((venue) => {
          const Icon = venue.Icon;
          const on = Boolean(joined[venue.id]);
          return (
            <Card key={venue.id}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-ink/[0.08] bg-surface-secondary text-text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <StatusBadge tone={on ? "good" : "warn"}>{on ? "On the list" : "Coming"}</StatusBadge>
              </div>
              <h3 className="mt-3 text-base font-semibold text-text-primary">{venue.name}</h3>
              <p className="mt-1 text-[12px] leading-5 text-text-muted">{venue.why}</p>
              <div className="mt-4">
                {on ? (
                  <GhostButton disabled>We'll email you in-app when beta opens</GhostButton>
                ) : (
                  <GoldButton onClick={() => join(venue.id)} disabled={busy === venue.id}>
                    {busy === venue.id ? "Joining…" : `Notify me for ${venue.name}`}
                  </GoldButton>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
