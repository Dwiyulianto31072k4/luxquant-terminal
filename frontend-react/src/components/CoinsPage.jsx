// src/components/CoinsPage.jsx
// Public programmatic coin pages: /coins (index) and /coins/:slug (detail).
// Evergreen, crawlable content per coin; live price shown via link-out.
import { Link, useParams, Navigate } from "react-router-dom";
import Seo from "./Seo";
import { COINS, ALL_COINS, getCoin } from "../content/coins";

const SITE = "https://luxquant.tw";

// Human date for "since {first_call}" (YYYY-MM-DD → e.g. "Jan 2024").
function sinceLabel(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

const FREE_TG = "https://t.me/LuxQuantSignal";

// Primary conversion CTA on every coin page: funnel SEO traffic → free Telegram.
function TelegramCta({ symbol }) {
  return (
    <a
      href={FREE_TG}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/[0.07] p-4 hover:bg-accent/[0.13] transition-colors"
    >
      <div>
        <div className="flex items-center gap-2 text-[14.5px] font-semibold text-text-primary">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-accent" fill="currentColor" aria-hidden="true">
            <path d="M21.94 4.6l-3.3 15.56c-.25 1.1-.9 1.37-1.82.85l-5.03-3.71-2.43 2.34c-.27.27-.5.5-1 .5l.36-5.12L18 5.6c.4-.36-.09-.56-.62-.2L6.9 12.19l-4.9-1.53c-1.07-.34-1.09-1.07.22-1.58l19.2-7.4c.9-.33 1.68.2 1.34 1.52z"/>
          </svg>
          Get free {symbol} calls on Telegram
        </div>
        <div className="mt-0.5 text-[12.5px] text-text-primary/65">
          Live entries, targets &amp; stop-loss — join our free channel, no signup.
        </div>
      </div>
      <span className="shrink-0 rounded-md bg-accent border border-ink/12 px-4 py-2 text-[13px] font-semibold text-accent-fg">
        Join free →
      </span>
    </a>
  );
}

// Track-record stat tiles shown on every coin page that has call history.
function TrackRecord({ symbol, stats }) {
  if (!stats || !stats.n) return null;
  const tiles = [
    { n: stats.n.toLocaleString(), l: "Signals called" },
    stats.wr != null && { n: `${stats.wr}%`, l: "Win rate" },
    stats.avgPeak != null && { n: `+${stats.avgPeak}%`, l: "Avg peak" },
    stats.best != null && { n: `+${stats.best}%`, l: "Best call" },
  ].filter(Boolean);
  return (
    <div className="mt-6 rounded-xl border border-ink/10 bg-surface-secondary p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-text-primary">
          {symbol} track record on LuxQuant
        </h2>
        {stats.since && (
          <span className="font-mono text-[11px] text-text-muted">since {sinceLabel(stats.since)}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-lg border border-ink/[0.08] bg-ink/[0.03] px-3 py-2.5">
            <div className="font-mono text-[19px] font-semibold text-text-primary tabular-nums leading-none">
              {t.n}
            </div>
            <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
              {t.l}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-text-muted">
        Every {symbol} call is timestamped and publicly verifiable — entry, TP1–TP4 and a hard
        stop-loss.{" "}
        <Link to="/performance" className="text-text-muted hover:text-text-primary underline">
          See the full audited record →
        </Link>
      </p>
    </div>
  );
}

function Crumbs({ trail }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
      {trail.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-text-primary/25">/</span>}
          {c.to ? (
            <Link to={c.to} className="hover:text-text-primary transition-colors">
              {c.label}
            </Link>
          ) : (
            <span className="text-text-primary/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function CoinDetail({ slug }) {
  const coin = getCoin(slug);
  if (!coin) return <Navigate to="/coins" replace />;

  const url = `${SITE}/coins/${coin.slug}`;
  const st = coin.stats;
  const since = st && st.since ? sinceLabel(st.since) : "";
  const isGen = !!coin.generated;
  const body =
    coin.body ||
    (st
      ? [
          `LuxQuant's algorithm has published ${st.n.toLocaleString()} ${coin.symbol} trade signals since ${since}.` +
            (st.wr != null ? ` Across ${st.resolved} resolved calls, ${coin.symbol} carries a ${st.wr}% win rate` : "") +
            (st.avgPeak != null ? ` — the average call reached a peak of +${st.avgPeak}% from entry` : "") +
            (st.best != null ? `, and the strongest ${coin.symbol} call ran +${st.best}%.` : "."),
          `Each ${coin.symbol} signal ships with a full plan — exact entry, staged take-profits (TP1–TP4) and a hard stop-loss — all timestamped and publicly auditable. On LuxQuant you can track ${coin.name}${coin.name !== coin.symbol ? ` (${coin.symbol})` : ""} money flow, on-chain whale activity, BTC correlation and every new signal in one place.`,
        ]
      : [`Track ${coin.name} (${coin.symbol}) money flow, on-chain activity and algorithmic signals on LuxQuant.`]);
  const category =
    coin.category || (st ? `${coin.symbol}/USDT · ${st.n.toLocaleString()} signals tracked` : coin.symbol);
  const seoTitle = isGen
    ? `${coin.symbol} signal track record — ${st ? st.n.toLocaleString() + " LuxQuant calls" : "LuxQuant"}${
        st && st.wr != null ? `, ${st.wr}% win rate` : ""
      } | LuxQuant`
    : `${coin.name} (${coin.symbol}) — money flow, on-chain & signals | LuxQuant`;
  const seoDesc =
    isGen && st
      ? `LuxQuant has called ${coin.symbol} ${st.n.toLocaleString()} times since ${since}${
          st.wr != null ? ` at a ${st.wr}% win rate` : ""
        }${st.avgPeak != null ? `, avg peak +${st.avgPeak}%` : ""}. Timestamped, verifiable signals with entry, TP1–TP4 and stop-loss.`
      : `${coin.name} (${coin.symbol}): ${body[0].slice(0, 140)}`;
  const relatedSlugs =
    coin.related || ["btc", "eth", "sol", "bnb"].filter((x) => x !== coin.slug).slice(0, 4);
  const related = relatedSlugs.map(getCoin).filter(Boolean);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${coin.name} (${coin.symbol}) — LuxQuant signals & track record`,
      url,
      description: body[0],
      isPartOf: { "@type": "WebSite", name: "LuxQuant Terminal", url: `${SITE}/` },
      about: { "@type": "Thing", name: coin.name, alternateName: coin.symbol },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Coins", item: `${SITE}/coins` },
        { "@type": "ListItem", position: 3, name: `${coin.name} (${coin.symbol})`, item: url },
      ],
    },
  ];

  return (
    <div className="w-full max-w-3xl px-1 py-4">
      <Seo
        title={seoTitle}
        description={seoDesc}
        path={`/coins/${coin.slug}`}
        keywords={`${coin.name}, ${coin.symbol}, ${coin.symbol} signals, ${coin.symbol} track record, ${coin.symbol} win rate, ${coin.name} money flow, luxquant`}
        type="article"
        jsonLd={jsonLd}
      />
      <Crumbs
        trail={[
          { label: "Home", to: "/" },
          { label: "Coins", to: "/coins" },
          { label: coin.symbol },
        ]}
      />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        Coins
      </span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">
        {coin.name}
        {coin.name !== coin.symbol && <span className="text-text-muted"> ({coin.symbol})</span>}
      </h1>
      <p className="mt-1 font-mono text-[12px] text-text-muted">{category}</p>

      <TrackRecord symbol={coin.symbol} stats={st} />

      <TelegramCta symbol={coin.symbol} />

      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-text-primary/75">
        {body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-ink/10 bg-surface-secondary p-5">
        <h2 className="text-[15px] font-semibold text-text-primary">
          Track {coin.symbol} on LuxQuant
        </h2>
        <p className="mt-1.5 text-[13.5px] text-text-primary/70">
          Live money flow, on-chain whale activity, and algorithmic signals.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/money-flow"
            className="rounded-md bg-accent border border-ink/12 px-4 py-2 text-[13px] font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            Open Money Flow →
          </Link>
          <Link
            to="/onchain"
            className="rounded-md border border-ink/[0.1] px-4 py-2 text-[13px] text-text-primary/80 hover:border-ink/15 hover:text-text-primary transition-colors"
          >
            On-Chain
          </Link>
          <Link
            to="/signals"
            className="rounded-md border border-ink/[0.1] px-4 py-2 text-[13px] text-text-primary/80 hover:border-ink/15 hover:text-text-primary transition-colors"
          >
            Signals
          </Link>
        </div>
        {coin.cg && (
          <p className="mt-3 text-[12px] text-text-muted">
            Live {coin.symbol} price &amp; markets:{" "}
            <a
              href={`https://www.coingecko.com/en/coins/${coin.cg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-text-primary"
            >
              view on CoinGecko →
            </a>
          </p>
        )}
      </div>

      {related.length > 0 && (
        <div className="mt-8 border-t border-ink/[0.08] pt-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">
            Related coins
          </h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/coins/${r.slug}`}
                className="rounded-md border border-ink/[0.1] bg-ink/[0.03] px-3 py-1.5 text-[13px] text-text-primary/80 hover:border-ink/15 hover:text-text-primary transition-colors"
              >
                {r.name} ({r.symbol})
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        Learn the concepts:{" "}
        <Link to="/learn/money-flow" className="text-text-muted hover:text-text-primary">
          money flow
        </Link>
        ,{" "}
        <Link to="/learn/btc-dominance" className="text-text-muted hover:text-text-primary">
          BTC dominance
        </Link>{" "}
        ·{" "}
        <Link to="/coins" className="text-text-muted hover:text-text-primary">
          all coins →
        </Link>
      </div>
    </div>
  );
}

function CoinsIndex() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Crypto Coins — LuxQuant",
      url: `${SITE}/coins`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Coins", item: `${SITE}/coins` },
      ],
    },
  ];

  return (
    <div className="w-full px-1 py-4">
      <Seo
        title="Crypto Coins — money flow, on-chain & signals | LuxQuant"
        description="Track money flow, on-chain activity, and algorithmic signals for Bitcoin, Ethereum, Solana, and top crypto assets on LuxQuant."
        path="/coins"
        keywords="crypto coins, bitcoin, ethereum, solana, money flow, on-chain, crypto signals"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Coins" }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        Coins
      </span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">
        Crypto Coins
      </h1>
      <p className="mt-2 text-[14px] text-text-primary/55 max-w-2xl leading-relaxed">
        Money flow, on-chain intelligence, and algorithmic signals for the assets traders watch
        most.
      </p>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {COINS.map((c) => (
          <Link
            key={c.slug}
            to={`/coins/${c.slug}`}
            className="group rounded-xl border border-ink/[0.07] bg-surface-raised p-4 hover:border-ink/12 hover:bg-ink/[0.02] transition-colors"
          >
            <div className="flex items-baseline gap-2">
              <h2 className="text-[15px] font-semibold text-text-primary group-hover:text-text-primary transition-colors">
                {c.name}
              </h2>
              <span className="font-mono text-[12px] text-text-muted">{c.symbol}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-text-muted">{c.category}</p>
          </Link>
        ))}
      </div>

      {_restCoins.length > 0 && (
        <div className="mt-9">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">
            All tracked pairs · {(_restCoins.length + COINS.length).toLocaleString()} coins
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {_restCoins.map((c) => (
              <Link
                key={c.slug}
                to={`/coins/${c.slug}`}
                title={`${c.name} — LuxQuant track record`}
                className="rounded-md border border-ink/[0.08] bg-ink/[0.02] px-2.5 py-1 font-mono text-[12px] text-text-primary/70 hover:border-ink/15 hover:text-text-primary transition-colors"
              >
                {c.symbol}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        New to the terms? Start with the{" "}
        <Link to="/learn" className="text-text-muted hover:text-text-primary">
          glossary →
        </Link>
      </div>
    </div>
  );
}

const _curatedSet = new Set(COINS.map((c) => c.slug));
const _restCoins = ALL_COINS.filter((c) => !_curatedSet.has(c.slug));

export default function CoinsPage() {
  const { slug } = useParams();
  return slug ? <CoinDetail slug={slug} /> : <CoinsIndex />;
}
