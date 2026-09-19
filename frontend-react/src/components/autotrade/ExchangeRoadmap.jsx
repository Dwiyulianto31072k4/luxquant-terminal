// Other live desks. Agent still runs one venue at a time.

import { Card, StatusBadge, GoldButton } from "./AutoTradeUI";
import { EXCHANGE_LIST, VenueLogo } from "./exchangeVenues";

export default function ExchangeRoadmap({ onConnect, exclude = [], linkedName = "" }) {
  const hidden = new Set(exclude);
  const rest = EXCHANGE_LIST.filter((venue) => !hidden.has(venue.id));
  if (!rest.length) return null;
  const switching = Boolean(linkedName);
  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          {switching ? "Switch venue" : "Other desks"}
        </p>
        <p className="mt-1 text-[12px] leading-5 text-text-muted">
          {switching
            ? `Agent already has ${linkedName}. Unlink it first, then connect the next desk — one venue at a time, so size is not doubled.`
            : "All six desks support spot and USDT-M. One venue at a time."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((venue) => (
          <Card key={venue.id}>
            <div className="flex items-start justify-between gap-3">
              <VenueLogo venue={venue} className="h-10 w-10" />
              <StatusBadge tone="good">Live</StatusBadge>
            </div>
            <h3 className="mt-3 text-base font-semibold text-text-primary">{venue.name}</h3>
            <p className="mt-1 text-[12px] leading-5 text-text-muted">{venue.blurb}</p>
            <div className="mt-4">
              <GoldButton onClick={() => onConnect(venue.id)}>
                {switching ? `Switch to ${venue.name}` : `Connect ${venue.name}`}
              </GoldButton>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
