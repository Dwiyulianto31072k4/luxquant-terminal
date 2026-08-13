import { useState, useEffect, useRef, useContext } from "react";
import { SignalStatusContext, STATUS_META, timeAgo } from "../context/SignalStatusContext";
import { LOCAL_COIN_LOGOS } from "../content/coinLogosLocal.generated";

/**
 * CoinLogo — multi-source with fail-over.
 * v6: source order is now measured, not assumed. A 2026-07-29 audit probed all
 * 749 tracked symbols against every source with a real Referer, the way a
 * browser sends it:
 *
 *   LiveCoinWatch 664/749 (88.7%)   OKX 472 (63.0%)   CoinCap 315 (42.1%)
 *   Binance CDN     0/749 ( 0.0%)   cryptocurrency-icons 110 (14.7%)
 *
 * Binance hotlink-blocks: the exact same URL is 200 with no Referer and 403
 * with one (confirmed from two different IPs), so as source #1 it was costing
 * every logo on the page a guaranteed-failed request before anything could
 * render. It and cryptocurrency-icons (which resolved first for zero symbols)
 * are gone. LCW leads, so 89% of logos now land on the first request.
 *
 * Failures expire. LCW rate-limits under the ~118 parallel image loads the
 * landing page fires, and a v5 FAIL was written to localStorage forever — one
 * throttled pageload permanently replaced a real logo with initials.
 */

const CACHE_KEY = "lq:coin-logos";
// 7: USDT/USDC used to derive an empty symbol and were cached as failures, and
// HYPE was cached against the wrong project's image. Both are fixed below, but
// a returning browser would keep serving its stored answer — the fix only
// reaches anyone if the version moves with it.
const CACHE_VERSION = 7;
// Long enough to keep genuinely-missing coins cheap, short enough that a
// throttled load repairs itself the same day.
const FAIL_TTL_MS = 6 * 60 * 60 * 1000;

const _logoCache = new Map();
const _failedSymbols = new Map(); // symbol -> epoch ms of the failure

try {
  const stored = localStorage.getItem(CACHE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.v === CACHE_VERSION && parsed.data) {
      Object.entries(parsed.data).forEach(([symbol, url]) => {
        if (typeof url === "string" && url.startsWith("FAIL:")) {
          const at = Number(url.slice(5)) || 0;
          if (Date.now() - at < FAIL_TTL_MS) _failedSymbols.set(symbol, at);
        } else if (url) {
          _logoCache.set(symbol, url);
        }
      });
    }
  }
} catch {}

let _saveTimer = null;
const _saveToStorage = () => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const data = {};
      _logoCache.forEach((url, symbol) => {
        data[symbol] = url;
      });
      _failedSymbols.forEach((at, symbol) => {
        data[symbol] = `FAIL:${at}`;
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, data }));
    } catch {}
  }, 2000);
};

/**
 * Binance perps prefix a multiplier onto the ticker: 1000PEPE, 1000000BOB,
 * 1MBABYDOGE. Strip the longest first — a plain /^1000/ turned 1000000BOB into
 * "000BOB", which no source has, so BOB and MOG fell through to initials.
 * The lookahead keeps genuine tickers that merely start with a digit (1INCH).
 */
const stripMultiplier = (symbol) => symbol.replace(/^(1000000|1000|1M)(?=[A-Z])/, "");

/**
 * Binance suffixes a chain onto perp tickers when the bare symbol is already
 * taken, and no logo CDN knows the suffixed form. RAYSOL is Raydium — verified
 * by price, not by guessing the name: a 2026-07-26 RAYSOL signal entered at
 * 0.6368 against RAY's 0.6036 three days later. NEIROETH needs no entry, OKX
 * happens to carry it verbatim.
 */
const TICKER_ALIASES = { RAYSOL: "RAY" };

/**
 * Symbols where the widest source carries the wrong project.
 *
 * Coverage was audited; agreement was not. A ticker is not unique — several
 * projects ship as HYPE, and LiveCoinWatch resolves it to a yellow angular mark
 * that is not Hyperliquid, while OKX carries the mint-green one that is
 * (compared side by side, 2026-08-02: 64x64 vs 96x96, different images). Being
 * source #1 meant the wrong logo always won.
 *
 * Only list a symbol here after looking at both images. A guess swaps one wrong
 * logo for another.
 */
// WLD: LCW menyajikan kepala serigala untuk `wld.png` — token lain yang
// bertiker sama. OKX menyajikan mark Worldcoin yang benar. Kedua gambar
// sudah dibuka dan dibandingkan sebelum baris ini ditambahkan.
const SOURCE_PREFERENCE = { HYPE: "okx", WLD: "okx" };

const getLogoSources = (symbol) => {
  const stripped = stripMultiplier(symbol);
  const base = TICKER_ALIASES[stripped] || stripped;
  const lower = base.toLowerCase();
  const upper = base.toUpperCase();
  // Audited gaps ship locally — raw symbol first (BTCDOM), stripped base second
  const local = LOCAL_COIN_LOGOS[symbol.toUpperCase()] || LOCAL_COIN_LOGOS[upper];
  // LiveCoinWatch — 664/749 audited symbols, the widest single source
  const lcw = `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${lower}.png`;
  // OKX currency icons — 472/749, picks up most of what LCW misses
  const okx = `https://static.okx.com/cdn/oksupport/asset/currency/icon/${lower}.png`;
  // CoinCap — 315/749, but the only source for a last 3 (cheap to keep)
  const coincap = `https://assets.coincap.io/assets/icons/${lower}@2x.png`;

  const remote = SOURCE_PREFERENCE[upper] === "okx" ? [okx, lcw, coincap] : [lcw, okx, coincap];
  return [...(local ? [`/coin-logos/${local}`] : []), ...remote];
};

const COIN_COLORS = {
  BTC: ["#f7931a", "#c57612"],
  ETH: ["#627eea", "#4158b0"],
  BNB: ["#f3ba2f", "#d4a017"],
  SOL: ["#9945ff", "#7a37cc"],
  XRP: ["#00aae4", "#0088b3"],
  ADA: ["#0033ad", "#002280"],
  DOGE: ["#c2a633", "#a08828"],
  AVAX: ["#e84142", "#b33233"],
  DOT: ["#e6007a", "#b30060"],
  MATIC: ["#8247e5", "#6235b0"],
  LINK: ["#2a5ada", "#1e40af"],
  SHIB: ["#ffa409", "#cc8307"],
  LTC: ["#bfbbbb", "#999999"],
  UNI: ["#ff007a", "#cc0062"],
  ATOM: ["#2e3148", "#1a1b2e"],
  XLM: ["#08b5e5", "#0691b7"],
  NEAR: ["#00c08b", "#009a6f"],
  APT: ["#4cd7d0", "#3cb0ab"],
  ARB: ["#28a0f0", "#1e7ab8"],
  OP: ["#ff0420", "#cc0319"],
  INJ: ["#00f2fe", "#00c2cb"],
  SUI: ["#6fbcf0", "#5196c0"],
  SEI: ["#9b1c1c", "#7a1616"],
  FTM: ["#1969ff", "#1454cc"],
  TIA: ["#7c3aed", "#6429be"],
  TON: ["#0098ea", "#007abb"],
  TRX: ["#ff0013", "#cc0010"],
  ALGO: ["#000000", "#333333"],
  ETC: ["#328332", "#266626"],
  XMR: ["#ff6600", "#cc5200"],
  FIL: ["#0090ff", "#0073cc"],
  VET: ["#15bdff", "#1197cc"],
  HBAR: ["#000000", "#333333"],
  ICP: ["#292a2e", "#1f2023"],
  EGLD: ["#23f7dd", "#1cc5b1"],
  PEPE: ["#479f53", "#367a3f"],
  WIF: ["#c4a484", "#9c8369"],
  BONK: ["#f9a825", "#c78500"],
  FLOKI: ["#f5a623", "#c48300"],
  NEIRO: ["#f5a623", "#c48300"],
  POPCAT: ["#e74c3c", "#b93d30"],
  DOGS: ["#c4a484", "#9c8369"],
  PNUT: ["#c4a484", "#9c8369"],
  GOAT: ["#8b4513", "#6f3710"],
  MEME: ["#00d395", "#00a877"],
  TURBO: ["#ff6b00", "#cc5600"],
  FARTCOIN: ["#8bc34a", "#6f9a3b"],
  TRUMP: ["#c41e3a", "#9c182e"],
  MELANIA: ["#ff69b4", "#cc5490"],
  BOME: ["#00ff00", "#00cc00"],
  JUP: ["#00bfa5", "#009884"],
  STRK: ["#ec796b", "#bd6156"],
  IMX: ["#17b5cb", "#128fa2"],
  MANTA: ["#1d4ed8", "#1740ad"],
  PYTH: ["#6366f1", "#4f52c1"],
  JTO: ["#00d18c", "#00a770"],
  BLUR: ["#ff6b00", "#cc5600"],
  AEVO: ["#6366f1", "#4f52c1"],
  ENA: ["#0052ff", "#0041cc"],
  ETHFI: ["#7c3aed", "#6429be"],
  ZK: ["#8c8dfc", "#7071ca"],
  ZRO: ["#000000", "#333333"],
  BLAST: ["#fcfc03", "#caca02"],
  SCR: ["#ffeeda", "#ccbeae"],
  EIGEN: ["#1e40af", "#183389"],
  HYPE: ["#00ff00", "#00cc00"],
  AAVE: ["#b6509e", "#91407e"],
  CRV: ["#40649f", "#334f7f"],
  COMP: ["#00d395", "#00a877"],
  MKR: ["#1aab9b", "#15897c"],
  SNX: ["#00d1ff", "#00a7cc"],
  SUSHI: ["#fa52a0", "#c84180"],
  DYDX: ["#6966ff", "#5451cc"],
  GMX: ["#2d42fc", "#2435ca"],
  PENDLE: ["#53bbb4", "#439690"],
  FET: ["#1d2951", "#151d3a"],
  RENDER: ["#000000", "#333333"],
  RNDR: ["#000000", "#333333"],
  WLD: ["#000000", "#333333"],
  AI16Z: ["#0052ff", "#0041cc"],
  VIRTUAL: ["#6366f1", "#4f52c1"],
  ACT: ["#9945ff", "#7a37cc"],
  IO: ["#6366f1", "#4f52c1"],
  AGIX: ["#532cd8", "#4223ad"],
  OCEAN: ["#141414", "#0d0d0d"],
  NOT: ["#000000", "#333333"],
  HMSTR: ["#ffc107", "#cc9a06"],
  CATI: ["#ff6b6b", "#cc5656"],
  SAND: ["#00adef", "#008bbf"],
  MANA: ["#ff2d55", "#cc2444"],
  AXS: ["#0055d5", "#0044aa"],
  GALA: ["#000000", "#333333"],
  ILV: ["#f24fb8", "#c23f93"],
  MAGIC: ["#dc2626", "#b01e1e"],
  ORDI: ["#f7931a", "#c57612"],
  SATS: ["#f7931a", "#c57612"],
  "1000SATS": ["#f7931a", "#c57612"],
  ZETA: ["#005741", "#004333"],
  WET: ["#00b4d8", "#009bb8"],
  UB: ["#6366f1", "#4f51c1"],
  TRUTH: ["#dc2626", "#b01e1e"],
  XAG: ["#c0c0c0", "#a0a0a0"],
  ALLO: ["#ff6b35", "#cc562a"],
  LIT: ["#6c5ce7", "#5649b9"],
  LISTA: ["#0052ff", "#0041cc"],
  DYM: ["#ff6b00", "#cc5600"],
  W: ["#8b5cf6", "#6f4ac4"],
  NMR: ["#000000", "#333333"],
  "1000PEPE": ["#479f53", "#367a3f"],
  "1000SHIB": ["#ffa409", "#cc8307"],
  "1000FLOKI": ["#f5a623", "#c48300"],
  "1000BONK": ["#f9a825", "#c78500"],
  "1000LUNC": ["#ffd83d", "#ccad31"],
  "1000XEC": ["#0074c2", "#005d9b"],
  "1000RATS": ["#8b4513", "#6f3710"],
  GRT: ["#6747ed", "#5239be"],
  LRC: ["#1c60ff", "#164dcc"],
  ENJ: ["#624dbf", "#4e3d99"],
  CHZ: ["#cd0124", "#a4011d"],
  THETA: ["#2ab8e6", "#228fb8"],
  FLOW: ["#00ef8b", "#00bf6f"],
  NEO: ["#00e599", "#00b87a"],
  WAVES: ["#0155ff", "#0144cc"],
  ZIL: ["#49c1bf", "#3a9a99"],
  QTUM: ["#2e9ad0", "#257ba6"],
  IOTA: ["#131f37", "#0d1526"],
  KAVA: ["#ff564f", "#cc453f"],
  ROSE: ["#0092f6", "#0074c5"],
  ONE: ["#00aee9", "#008bba"],
  CELO: ["#35d07f", "#2aa665"],
  AR: ["#222326", "#1a1a1d"],
  STX: ["#5546ff", "#4438cc"],
  CFX: ["#1f2638", "#181d2c"],
  RUNE: ["#33ff99", "#29cc7a"],
  KSM: ["#000000", "#333333"],
  XTZ: ["#a6e000", "#85b300"],
  CAKE: ["#d1884f", "#a76d3f"],
  ANKR: ["#579af0", "#4678c0"],
  STORJ: ["#2683ff", "#1e69cc"],
  IOTX: ["#00d4d5", "#00aaaa"],
  SKL: ["#000000", "#333333"],
  BAND: ["#516aff", "#4155cc"],
  API3: ["#000000", "#333333"],
  MASK: ["#1c68f3", "#1653c2"],
  LPT: ["#00eb88", "#00bc6d"],
  SSV: ["#0bab64", "#089050"],
  ID: ["#2bb673", "#22925c"],
  EDU: ["#0a2540", "#071a2b"],
  WOO: ["#21292e", "#1a2125"],
  ARKM: ["#000000", "#333333"],
  CYBER: ["#65dc98", "#51b07a"],
  NTRN: ["#000000", "#333333"],
  TRB: ["#1e1e1e", "#333333"],
  LQTY: ["#1542cd", "#1035a4"],
  FXS: ["#000000", "#333333"],
  RDNT: ["#00A3FF", "#0082cc"],
  HOOK: ["#050e1e", "#03080f"],
  HIGH: ["#00d1ff", "#00a7cc"],
  T: ["#7c3aed", "#6329be"],
  RAY: ["#c200fb", "#9a00c9"],
  AUDIO: ["#c727f0", "#9f1fc0"],
  PYR: ["#f36e3f", "#c25832"],
  SUPER: ["#10101a", "#0d0d14"],
  YFI: ["#006ae3", "#0055b5"],
  "1INCH": ["#94a6c3", "#76859c"],
  BAL: ["#1e1e1e", "#333333"],
  RSR: ["#000000", "#333333"],
  RLC: ["#ffd800", "#ccad00"],
  ALPHA: ["#1183fc", "#0e69ca"],
  CELR: ["#000000", "#333333"],
  PERP: ["#3ceaac", "#30bb8a"],
  CTSI: ["#1a1b1d", "#141516"],
  LEVER: ["#00ff00", "#00cc00"],
  TLM: ["#ffd535", "#caca2a"],
  DENT: ["#666666", "#525252"],
  SXP: ["#ff5722", "#cc461b"],
  LINA: ["#36c9a7", "#2ba186"],
  UNFI: ["#f26f5f", "#c2594c"],
  TRU: ["#1a5aff", "#1548cc"],
  OGN: ["#1a82ff", "#1568cc"],
  NKN: ["#23336f", "#1c2959"],
  REEF: ["#a10f8e", "#810c71"],
  BEL: ["#e5b97c", "#b89463"],
  DODO: ["#fff700", "#ccc600"],
  POLS: ["#ff3465", "#cc2a51"],
  POND: ["#3249e3", "#283ab5"],
  GHST: ["#fa34f3", "#c82ac2"],
  TVK: ["#ff006c", "#cc0056"],
  CLV: ["#46e4b1", "#38b68d"],
  BETA: ["#2bd2c7", "#22a89f"],
  VOXEL: ["#f7cf35", "#c5a52a"],
  MDT: ["#0097db", "#0079af"],
  OMG: ["#101010", "#0d0d0d"],
  STMX: ["#6c1ad3", "#5615a9"],
  SUN: ["#ffdd5a", "#ccb148"],
  TROY: ["#1cd1a6", "#17a785"],
  WIN: ["#feb340", "#cb8f33"],
  XVS: ["#f4bc54", "#c39643"],
  VIDT: ["#2484c3", "#1d6a9c"],
  FLUX: ["#2b61d1", "#224da7"],
  FRONT: ["#39393d", "#2e2e31"],
  RARE: ["#000000", "#333333"],
  FOR: ["#38c6f4", "#2d9fc3"],
  AMB: ["#3b66af", "#2f528c"],
  BICO: ["#ff4e17", "#cc3e12"],
  QUICK: ["#428dff", "#3571cc"],
  SPELL: ["#7f6bff", "#6556cc"],
  RIF: ["#003354", "#002640"],
  BOND: ["#ff4339", "#cc362d"],
  POWR: ["#05bca9", "#049687"],
  LOOM: ["#48beff", "#3a98cc"],
  DGB: ["#006ad2", "#0055a8"],
  TOMO: ["#1a8f8f", "#157272"],
  TWT: ["#000000", "#333333"],
  MTL: ["#1e1f25", "#18191e"],
  ICX: ["#1fc5c9", "#18a0a3"],
  ONT: ["#32a4be", "#288398"],
  ZEC: ["#f4b728", "#c3921f"],
  DASH: ["#008ce7", "#006db8"],
  SRM: ["#52e4cb", "#42b6a2"],
  CTK: ["#c5985f", "#9e7a4c"],
};

const GRADIENTS = [
  ["#f7931a", "#c57612"],
  ["#627eea", "#4158b0"],
  ["#00d4aa", "#00a383"],
  ["#e84142", "#b33233"],
  ["#f3ba2f", "#d4a017"],
  ["#8247e5", "#6235b0"],
  ["#26a17b", "#1e8063"],
  ["#ff007a", "#cc0062"],
  ["#00acd7", "#0088b3"],
  ["#ff6b35", "#e55a2b"],
  ["#9945ff", "#7a37cc"],
  ["#14f195", "#10c077"],
  ["#6366f1", "#4f51c1"],
  ["#ec4899", "#be185d"],
  ["#0ea5e9", "#0284c7"],
  ["#84cc16", "#65a30d"],
];

const getGradientForSymbol = (symbol) => {
  const displaySymbol = stripMultiplier(symbol);
  if (COIN_COLORS[symbol]) return COIN_COLORS[symbol];
  if (COIN_COLORS[displaySymbol]) return COIN_COLORS[displaySymbol];
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
};

const getInitials = (symbol) => {
  const display = stripMultiplier(symbol);
  return display ? display.substring(0, 2).toUpperCase() : "?";
};

const CoinLogo = ({ pair, size = 40, className = "" }) => {
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const sourceIndexRef = useRef(0);
  const sourcesRef = useRef([]);
  const statusCtx = useContext(SignalStatusContext); // null outside the terminal
  const statusMap = statusCtx?.map;

  // Strip the quote currency off a pair — BTCUSDT to BTC — but never strip a
  // symbol down to nothing. Passed "USDT" or "USDC" this used to return "",
  // which the effect below reads as failure, so the two most-traded assets on
  // the On-Chain page rendered as question marks while every URL for them
  // answered 200. Anywhere a bare ticker is passed rather than a pair, the
  // stablecoins were the exact set that broke.
  const symbol = (() => {
    if (!pair) return "";
    const stripped = pair.replace(/(USDT|BUSD|USDC|USD)$/i, "");
    return (stripped || pair).toUpperCase();
  })();

  useEffect(() => {
    if (!symbol) {
      setFailed(true);
      return;
    }

    if (_logoCache.has(symbol)) {
      setResolvedUrl(_logoCache.get(symbol));
      setFailed(false);
      return;
    }

    if (_failedSymbols.has(symbol)) {
      setFailed(true);
      return;
    }

    sourceIndexRef.current = 0;
    sourcesRef.current = getLogoSources(symbol);
    setResolvedUrl(sourcesRef.current[0]);
    setFailed(false);
  }, [symbol]);

  const handleError = () => {
    const nextIndex = sourceIndexRef.current + 1;
    if (nextIndex < sourcesRef.current.length) {
      sourceIndexRef.current = nextIndex;
      setResolvedUrl(sourcesRef.current[nextIndex]);
    } else {
      _failedSymbols.set(symbol, Date.now());
      _saveToStorage();
      setFailed(true);
    }
  };

  const handleLoad = () => {
    if (resolvedUrl && !_logoCache.has(symbol)) {
      _logoCache.set(symbol, resolvedUrl);
      _saveToStorage();
    }
  };

  const info = statusMap && pair ? statusMap[pair.toUpperCase()] : null;
  const meta = info
    ? STATUS_META[info.status] || {
        label: (info.status || "—").toUpperCase(),
        color: "rgb(var(--fg-secondary))",
        desc: "",
      }
    : null;
  const ago = info ? timeAgo(info.created) : null;
  // native title → never clipped by overflow-hidden panels
  const tip = info
    ? `${symbol} · ${meta.label}${ago ? ` · called ${ago}` : ""} · click for details`
    : symbol;

  let logo;
  if (failed || !resolvedUrl) {
    const [color1, color2] = getGradientForSymbol(symbol);
    logo = (
      <div
        className={`rounded-full flex items-center justify-center text-text-primary font-bold shadow-lg flex-shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.38,
          background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
          boxShadow: `0 2px 8px ${color1}40`,
          border: `1px solid ${color1}50`,
        }}
        title={tip}
      >
        {getInitials(symbol)}
      </div>
    );
  } else {
    logo = (
      <img
        src={resolvedUrl}
        alt={symbol}
        width={size}
        height={size}
        className={`rounded-full flex-shrink-0 ${className}`}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
        decoding="async"
        style={{
          width: size,
          height: size,
          // `cover` memangkas tepi logo agar mengisi kotak — terlihat jelas
          // pada BNB. Logo punya bentuknya sendiri; muat seluruhnya.
          objectFit: "contain",
          backgroundColor: "rgb(var(--surface-hover))",
        }}
        title={tip}
      />
    );
  }

  if (!info) return logo;

  // Terminal-only: overlay a live signal-status dot + make the coin clickable
  // → global signal modal. Hover (native title) shows status + when called.
  const dot = Math.max(6, Math.round(size * 0.32));
  const onClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    statusCtx?.openPair?.(pair);
  };
  return (
    <span
      className="relative inline-flex shrink-0 cursor-pointer"
      style={{ width: size, height: size }}
      onClick={onClick}
      title={tip}
    >
      {logo}
      <span
        className="absolute -bottom-0.5 -right-0.5 rounded-full ring-1 ring-black/70"
        style={{ width: dot, height: dot, background: meta.color }}
        title={tip}
      />
    </span>
  );
};

export default CoinLogo;
