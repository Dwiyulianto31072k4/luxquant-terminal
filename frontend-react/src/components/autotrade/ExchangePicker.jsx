// Post-disclaimer venue pick. Three desks, one venue at a time.

import { EXCHANGE_LIST, VenueLogo } from "./exchangeVenues";

export default function ExchangePicker({ onPick }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Connect an exchange
        </p>
        <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight text-text-primary sm:text-[26px]">
          Choose one venue
        </h2>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-6 text-text-secondary">
          Keys stay encrypted. Funds stay on the exchange. Withdraw is never
          requested. Agent runs one venue at a time — start in dry-run, pause
          whenever you want.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {EXCHANGE_LIST.map((venue) => {
          return (
            <button
              key={venue.id}
              type="button"
              onClick={() => onPick(venue.id)}
              className="group flex flex-col rounded-xl border border-ink/[0.08] bg-surface-raised p-5 text-left transition-colors hover:border-ink/20 hover:bg-surface-secondary/40"
            >
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-1.5">
                <VenueLogo venue={venue} className="h-full w-full" />
              </span>
              <span className="mt-4 text-[17px] font-semibold text-text-primary">{venue.name}</span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {venue.markets}
              </span>
              <span className="mt-2 flex-1 text-[13px] leading-5 text-text-secondary">
                {venue.blurb}
              </span>
              <span className="mt-5 inline-flex items-center font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary group-hover:text-accent">
                Connect {venue.name}
                <span className="ml-1.5" aria-hidden>
                  →
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
