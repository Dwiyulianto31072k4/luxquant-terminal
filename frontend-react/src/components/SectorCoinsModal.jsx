// src/components/SectorCoinsModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Sector → Coins drill-down modal
// Tap a "Sector Rotation" row → list of ALL coins in that narrative
// (CoinGecko category), sorted by market cap. Every coin links to its
// CoinGecko markets page; LuxQuant-called coins carry a "Call" badge that
// opens the SignalModal.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import Modal from "./ui/Modal";
import api from "../services/api";

const fmtUSD = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const pctColor = (v) =>
  v === null || v === undefined
    ? "text-text-muted"
    : Number(v) > 0
      ? "text-profit"
      : Number(v) < 0
        ? "text-loss"
        : "text-text-primary/70";

const Spinner = ({ className = "" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
  </svg>
);

const IconExternal = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

// Where-to-trade / info page. Coins come from CoinGecko, so every coin has a
// valid page listing all markets (CEX + DEX via GeckoTerminal tab).
const coinMarketUrl = (c) =>
  c?.coin_id
    ? `https://www.coingecko.com/en/coins/${c.coin_id}`
    : `https://www.coingecko.com/en/search?query=${encodeURIComponent(c?.symbol || "")}`;

export default function SectorCoinsModal({ sector, isOpen, onClose, onOpenSignal, loadingSym }) {
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "market_cap", dir: "desc" });

  // Money Flow's sector rows carry `category_id`; the Home page's categories
  // (from /market/categories and /trending-categories) carry `id`. Reading only
  // the first meant the effect below bailed on Home, leaving the modal on
  // "Loading coins…" forever with no request ever sent.
  const categoryId = sector?.category_id || sector?.id;

  useEffect(() => {
    if (!isOpen || !categoryId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    setQ("");
    setSort({ key: "market_cap", dir: "desc" });
    // The open endpoint, not the money-flow one: the coin list is public
    // CoinGecko data. `is_luxquant_signal` only comes back for subscribers, so
    // a free session gets the narrative without learning which of these we call.
    api
      .get(`/api/v1/terminal/narrative/${encodeURIComponent(categoryId)}/coins`, {
        params: { limit: 100 },
      })
      .then((r) => {
        if (alive) setCoins(r?.data?.coins || []);
      })
      .catch((e) => {
        // The whole /money-flow router carries require_subscription, so a free
        // account lands here on every open. Showing "failed to load" made a
        // paywall look like an outage — name it instead.
        const status = e?.response?.status;
        if (alive) setErr(status === 403 || status === 401 ? "LOCKED" : "Failed to load coins for this narrative");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, categoryId]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
    );

  const rows = useMemo(() => {
    let r = coins;
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter(
        (c) =>
          (c.symbol || "").toUpperCase().includes(s) || (c.name || "").toUpperCase().includes(s)
      );
    }
    const val = (x, k) => {
      switch (k) {
        case "symbol":
          return x.symbol || "￿";
        case "price_change_24h":
          return x.price_change_24h ?? -Infinity;
        case "market_cap":
          return x.market_cap ?? -Infinity;
        default:
          return 0;
      }
    };
    return [...r].sort((a, b) => {
      const va = val(a, sort.key),
        vb = val(b, sort.key);
      const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [coins, q, sort]);

  const luxCount = coins.filter((c) => c.is_luxquant_signal).length;

  const SortBtn = ({ label, k, className = "" }) => {
    const active = sort.key === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
          active ? "text-accent" : "text-text-primary/35 hover:text-text-primary/60"
        } ${className}`}
      >
        {label}
        <span className="text-[7px]">{active ? (sort.dir === "desc" ? "▼" : "▲") : "⇅"}</span>
      </button>
    );
  };

  const header = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex -space-x-1.5 shrink-0">
        {(sector?.top_3_coins || []).slice(0, 3).map((url, k) => (
          <img
            key={k}
            src={url}
            alt=""
            className="w-6 h-6 rounded-full border border-surface-raised bg-ink/5"
            onError={(e) => (e.target.style.display = "none")}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-muted">
          Narrative · Coins
        </p>
        <h2 className="text-base sm:text-lg font-semibold text-text-primary truncate">
          {sector?.name || "Sector"}
        </h2>
      </div>
      {sector?.mcap_change_24h != null && (
        <span
          className={`ml-auto shrink-0 font-mono text-sm tabular-nums font-semibold ${pctColor(sector.mcap_change_24h)}`}
        >
          {fmtPct(sector.mcap_change_24h)}
        </span>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      placement="bottom"
      padded={false}
      header={header}
    >
      {/* Toolbar: search + count */}
      <div className="sticky top-0 z-10 bg-surface-raised flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-ink/[0.06]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search coin…"
          className="flex-1 min-w-0 pl-3 pr-3 py-1.5 bg-surface-secondary border border-ink/[0.08] rounded-md text-text-primary placeholder-ink/30 font-mono text-[12px] focus:border-ink/15 focus:outline-none"
        />
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/70">
          {coins.length} coins{luxCount ? ` · ${luxCount} call` : ""}
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1.6rem_1fr_5rem_6rem] sm:grid-cols-[2rem_1fr_6rem_7rem] gap-2 px-4 sm:px-5 py-2 border-b border-ink/[0.06]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35">
          #
        </span>
        <SortBtn label="Coin" k="symbol" />
        <SortBtn label="24h" k="price_change_24h" className="justify-self-end flex-row-reverse" />
        <SortBtn label="Mcap" k="market_cap" className="justify-self-end flex-row-reverse" />
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-16 text-center font-mono text-[12px] text-text-primary/40">
          Loading coins…
        </div>
      ) : err ? (
        err === "LOCKED" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15">
              <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <div>
              <p className="text-[14px] font-semibold text-text-primary">Narrative breakdown is a plan feature</p>
              <p className="mt-1 text-[12px] leading-snug text-text-muted">
                See every coin in this narrative, ranked, with the ones LuxQuant called.
              </p>
            </div>
            <a
              href="/pricing"
              className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-fg transition-transform hover:scale-[1.02]"
            >
              Unlock Money Flow
            </a>
          </div>
        ) : (
          <div className="py-16 text-center font-mono text-[12px] text-loss/70">{err}</div>
        )
      ) : rows.length === 0 ? (
        <div className="py-16 text-center font-mono text-[12px] text-text-primary/40">
          {q ? `No coins match "${q}".` : "No coins in this narrative."}
        </div>
      ) : (
        <div className="divide-y divide-ink/[0.05]">
          {rows.map((c, i) => {
            const called = c.is_luxquant_signal;
            const isLoading = loadingSym === c.symbol;
            const openMarket = () => window.open(coinMarketUrl(c), "_blank", "noopener,noreferrer");
            return (
              <div
                key={c.coin_id || c.symbol}
                role="button"
                tabIndex={0}
                onClick={openMarket}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openMarket();
                  }
                }}
                title={`Open ${c.symbol} markets on CoinGecko`}
                className={`group grid grid-cols-[1.6rem_1fr_5rem_6rem] sm:grid-cols-[2rem_1fr_6rem_7rem] gap-2 items-center px-4 sm:px-5 py-2.5 cursor-pointer transition-colors ${
                  called
                    ? "border-l-2 border-ink/18 hover:bg-surface-secondary"
                    : "border-l-2 border-transparent hover:bg-ink/[0.03]"
                }`}
              >
                <span className="font-mono text-[11px] tabular-nums text-text-muted/40">
                  {c.market_cap_rank || i + 1}
                </span>
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.image ? (
                    <img
                      src={c.image}
                      alt=""
                      className="w-6 h-6 rounded-full bg-ink/5 flex-shrink-0"
                      onError={(e) => (e.target.style.display = "none")}
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-ink/5 flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm font-semibold truncate ${called ? "text-accent" : "text-text-primary"}`}
                  >
                    {c.symbol}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-text-muted/60 truncate">
                    {c.name}
                  </span>
                  {called && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSignal?.(c);
                      }}
                      title="Open LuxQuant signal"
                      className="shrink-0 inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent text-accent-fg border border-ink/12 hover:bg-accent/25 transition-colors"
                    >
                      {isLoading ? <Spinner className="w-2.5 h-2.5" /> : null}
                      Call
                    </button>
                  )}
                  <IconExternal className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-text-primary/25 group-hover:text-text-primary transition-colors" />
                </div>
                <span
                  className={`font-mono text-[13px] tabular-nums text-right font-semibold ${pctColor(c.price_change_24h)}`}
                >
                  {fmtPct(c.price_change_24h)}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-right text-text-muted whitespace-nowrap">
                  {fmtUSD(c.market_cap)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-4 sm:px-5 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted/40 border-t border-ink/[0.05]">
        Tap any coin to view its markets on CoinGecko ·{" "}
        {luxCount > 0 ? (
          <>
            <span className="text-text-muted">Call</span> = has a LuxQuant signal ·{" "}
          </>
        ) : null}
        Data: CoinGecko
      </p>
    </Modal>
  );
}
