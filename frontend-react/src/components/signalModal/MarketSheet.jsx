import BottomSheet from "../ui/BottomSheet";
import { Z } from "../../constants/zIndex";

function money(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(val, digits = 2) {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "" : ""}${n.toFixed(digits)}%`;
}

function countdown(ms) {
  if (!ms) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function tone(n) {
  if (!Number.isFinite(n) || n === 0) return "text-text-primary";
  return n > 0 ? "text-positive" : "text-negative";
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink/[0.06] px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-text-primary">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0 text-right font-mono text-[13px] tabular-nums">{children}</div>
    </div>
  );
}

/**
 * Extra altcoin tape beyond the Fund / OI strip: basis, 24h volume, range,
 * taker buy, OI change, L/S, coin meta. Nested above SignalModal.
 */
export default function MarketSheet({
  isOpen,
  onClose,
  pair,
  deriv,
  livePrice,
  signal,
  liveBlocked,
  formatPrice,
}) {
  const funding = deriv?.funding;
  const fundingPos = Number(funding) > 0;
  const next = countdown(deriv?.nextFundingMs);
  const lsLong = deriv?.lsLong;
  const lsShort = deriv?.lsShort;
  const high = Number(deriv?.high24h);
  const low = Number(deriv?.low24h);
  const mark = Number(livePrice);
  const span = high > 0 && low > 0 && high > low ? high - low : 0;
  const rangePct = span > 0 && mark > 0 ? Math.min(100, Math.max(0, ((mark - low) / span) * 100)) : null;

  const risk = signal?.risk_level;
  const riskLow = risk?.toLowerCase()?.startsWith("low");
  const riskHigh = risk?.toLowerCase()?.startsWith("high");

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      zIndex={Z.nestedModal}
      maxWidth="max-w-md"
      ariaLabel="Market tape"
      header={
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold text-text-primary">Market</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {(pair || "").replace(/(USDT|USDC|USD)$/i, "/$1")} · perp tape
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.12] text-text-muted transition-colors hover:text-text-primary"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      }
    >
      {liveBlocked && !deriv ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-text-primary">Live data unavailable</p>
          <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-relaxed text-text-muted">
            Funding, open interest and tape are blocked on this network. Turn on a VPN and reopen the
            signal.
          </p>
        </div>
      ) : (
        <div>
          <Row
            label="Funding"
            hint={
              Number.isFinite(Number(funding))
                ? `${fundingPos ? "Longs pay shorts" : "Shorts pay longs"}${next ? ` · next ${next}` : ""}`
                : "Perp funding on this pair"
            }
          >
            <span className={tone(Number(funding))}>
              {Number.isFinite(Number(funding))
                ? `${Number(funding) >= 0 ? "+" : ""}${Number(funding).toFixed(4)}%`
                : "—"}
            </span>
          </Row>

          <Row label="Open interest" hint={deriv?.oiChange24h != null ? `${pct(deriv.oiChange24h)} · 24h` : "Contracts still open"}>
            <span className="font-semibold text-text-primary">{money(deriv?.oiUsd)}</span>
          </Row>

          {(deriv?.lsGlobal || deriv?.lsTopAccounts || deriv?.lsTopPositions || (lsLong != null && lsShort != null)) && (
            <div className="border-b border-ink/[0.06] px-4 py-3">
              <p className="mb-2 text-[12px] font-medium text-text-primary">Long / short books</p>
              {[
                ["Global", deriv?.lsGlobal],
                ["Top accounts", deriv?.lsTopAccounts],
                ["Top positions", deriv?.lsTopPositions],
              ].map(([label, book]) =>
                book?.ratio != null ? (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11px] text-text-muted">{label}</span>
                      <span className="font-mono text-[13px] font-semibold tabular-nums">
                        {Number(book.ratio).toFixed(4)}
                      </span>
                    </div>
                    {book.longPct != null && (
                      <div className="flex h-2.5 overflow-hidden rounded-sm bg-ink/5">
                        <div className="h-full bg-positive/70" style={{ width: `${book.longPct}%` }} />
                        <div className="h-full bg-negative/70" style={{ width: `${book.shortPct}%` }} />
                      </div>
                    )}
                  </div>
                ) : null
              )}
              {!deriv?.lsGlobal && !deriv?.lsTopAccounts && !deriv?.lsTopPositions && lsLong != null && (
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-positive">
                    {lsLong}%
                  </span>
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-sm bg-ink/5">
                    <div className="h-full bg-positive/70" style={{ width: `${lsLong}%` }} />
                    <div className="h-full bg-negative/70" style={{ width: `${lsShort}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-negative">
                    {lsShort}%
                  </span>
                </div>
              )}
            </div>
          )}

          <Row label="Basis" hint="Mark vs index. Elevated usually means crowded longs.">
            <span className={tone(Number(deriv?.basisPct))}>{pct(deriv?.basisPct, 3)}</span>
          </Row>

          <Row label="24h volume" hint="Quote volume on the perp">
            <span className="text-text-primary">{money(deriv?.volume24h)}</span>
          </Row>

          <div className="border-b border-ink/[0.06] px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-text-primary">24h range</p>
              {rangePct != null && (
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {rangePct.toFixed(0)}% of range
                </span>
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-text-muted">
              <span>{formatPrice ? formatPrice(low) : low || "—"}</span>
              <span className="text-text-primary">{formatPrice ? formatPrice(mark) : mark || "—"}</span>
              <span>{formatPrice ? formatPrice(high) : high || "—"}</span>
            </div>
            {rangePct != null && (
              <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-raised"
                  style={{ left: `${rangePct}%` }}
                />
              </div>
            )}
          </div>

          <Row label="Taker buy" hint="Share of 24h volume that lifted the offer">
            <span className="text-text-primary">
              {Number.isFinite(Number(deriv?.takerBuyPct))
                ? `${Number(deriv.takerBuyPct).toFixed(1)}%`
                : "—"}
            </span>
          </Row>

          {(signal?.volume_rank_num || signal?.risk_level || signal?.market_cap) && (
            <>
              {signal?.volume_rank_num && (
                <Row label="Volume rank">
                  <span className="text-text-primary">
                    #{signal.volume_rank_num}
                    <span className="text-[11px] font-normal text-text-muted">
                      {" "}
                      / {signal.volume_rank_den}
                    </span>
                  </span>
                </Row>
              )}
              {signal?.risk_level && (
                <Row label="Risk">
                  <span
                    className={
                      riskLow ? "text-positive" : riskHigh ? "text-negative" : "text-text-primary"
                    }
                  >
                    {signal.risk_level}
                  </span>
                </Row>
              )}
              {signal?.market_cap && (
                <Row label="Market cap">
                  <span className="text-text-primary">{signal.market_cap}</span>
                </Row>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            {[
              {
                label: "TradingView",
                url: `https://www.tradingview.com/chart/?symbol=BINANCE:${pair || ""}.P`,
              },
              { label: "Metrics", url: `/market-pulse?pair=${pair || ""}` },
              { label: "Binance", url: `https://www.binance.com/en/futures/${pair || ""}` },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target={link.url.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="text-[11px] text-text-muted transition-colors hover:text-text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
