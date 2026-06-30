// src/components/auth/LeftBrandPanel.jsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/* ================================================================
   TAGLINES — translation-aware (kept for backward compat exports)
   ================================================================ */
const getTaglines = (t) => {
  const a = (key) => t(`auth.${key}`);
  return [
    { parts: [{ text: a('tagline_1_a'), g: false }, { text: a('tagline_1_b'), g: true }, { text: a('tagline_1_c'), g: false }] },
    { parts: [{ text: a('tagline_2_a'), g: false }, { text: a('tagline_2_b'), g: true }, { text: a('tagline_2_c'), g: false }] },
    { parts: [{ text: a('tagline_3_a'), g: false }, { text: a('tagline_3_b'), g: true }, { text: a('tagline_3_c'), g: false }] },
  ];
};

const useTypewriter = (taglines, speed = 40, delSpeed = 18, pause = 3200) => {
  const [cc, setCc] = useState(0);
  const [idx, setIdx] = useState(0);
  const [del, setDel] = useState(false);
  const full = taglines[idx].parts.map(p => p.text).join('');
  useEffect(() => {
    let t;
    if (!del && cc === full.length) t = setTimeout(() => setDel(true), pause);
    else if (del && cc === 0) { setDel(false); setIdx(p => (p + 1) % taglines.length); }
    else t = setTimeout(() => setCc(c => c + (del ? -1 : 1)), del ? delSpeed : speed);
    return () => clearTimeout(t);
  }, [cc, del, idx, full.length, taglines, speed, delSpeed, pause]);
  let rem = cc;
  const vis = [];
  for (const p of taglines[idx].parts) {
    if (rem <= 0) break;
    vis.push({ text: p.text.substring(0, rem), g: p.g });
    rem -= vis[vis.length - 1].text.length;
  }
  return vis;
};

export const TypewriterLine = ({ mobile }) => {
  const { t } = useTranslation();
  const parts = useTypewriter(getTaglines(t));
  return (
    <div style={{ textAlign: mobile ? 'left' : 'center', minHeight: mobile ? 44 : 40 }}>
      <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: mobile ? 15 : 26, fontWeight: 500, lineHeight: 1.5, color: '#6b5c52' }}>
        {parts.map((p, i) => (<span key={i} style={{ color: p.g ? '#d4a853' : '#8a7d73' }}>{p.text}</span>))}
        <span style={{ color: '#d4a853', fontWeight: 300, marginLeft: 1, animation: 'lq-blink 1s step-end infinite' }}>|</span>
      </p>
    </div>
  );
};

/* ================================================================
   APPLE LOGO
   ================================================================ */
const AppleLogo = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.35 1.206-3.08.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
  </svg>
);

/* ================================================================
   DEVICE SHOWCASE — polished iMac (+ optional iPhone)
   ================================================================ */
export const DeviceShowcase = ({ compact = false, phone = true }) => {
  const v = '?v=3';
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: compact ? 290 : 540 }}>
      <style>{`
        @keyframes lq-float-d { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes lq-float-p { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @media (prefers-reduced-motion: reduce) { [style*="lq-float-d"], [style*="lq-float-p"] { animation: none !important; } }
      `}</style>
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: '132%', height: '120%', background: 'radial-gradient(ellipse at center, rgba(212,168,83,0.13) 0%, transparent 64%)' }} />

      {/* iMac (static — no float) */}
      <div className="relative">
        <div className="relative overflow-hidden rounded-[12px] bg-black ring-1 ring-white/[0.07]"
          style={{ boxShadow: '0 36px 80px rgba(0,0,0,0.6), 0 0 56px rgba(212,168,83,0.10)' }}>
          <div style={{ padding: compact ? 6 : 9 }}>
            <div className="relative overflow-hidden rounded-[3px] bg-[#050302] ring-1 ring-white/[0.05]" style={{ aspectRatio: '16 / 10' }}>
              <img src={`/mockups/hero-mac-dashboard.png${v}`} alt="LuxQuant dashboard"
                className="h-full w-full object-cover object-top" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          </div>
          <div className="flex items-center justify-center bg-gradient-to-b from-[#e8e9eb] via-[#d8dadd] to-[#c4c6ca]" style={{ height: compact ? 18 : 26 }}>
            <AppleLogo className={compact ? 'h-[9px] w-[9px] text-[#070708]' : 'h-[13px] w-[13px] text-[#070708]'} />
          </div>
        </div>
        <div className="relative mx-auto -mt-px" style={{ width: '34%', maxWidth: 180 }}>
          <svg viewBox="0 0 150 50" className="block h-auto w-full" aria-hidden="true">
            <defs>
              <linearGradient id="lqAuthStand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e2e4e7" /><stop offset="0.5" stopColor="#c3c5c9" /><stop offset="1" stopColor="#9fa1a5" />
              </linearGradient>
            </defs>
            <path d="M52,0 L98,0 Q95,12 92,22 Q102,33 126,42 Q132,44 132,46.5 Q132,49 128,49 L22,49 Q18,49 18,46.5 Q18,44 24,42 Q48,33 58,22 Q55,12 52,0 Z" fill="url(#lqAuthStand)" />
          </svg>
        </div>
        <div aria-hidden="true" className="mx-auto -mt-1 rounded-[50%] bg-black/50 blur-md" style={{ height: compact ? 8 : 12, width: '32%' }} />
      </div>

      {/* iPhone (optional) */}
      {phone && (
        <div className="absolute z-30" style={{ right: compact ? '-3%' : '-4%', bottom: compact ? '4%' : '6%', width: compact ? '24%' : '25%', minWidth: 68, maxWidth: 150, animation: 'lq-float-p 5s ease-in-out infinite 0.8s' }}>
          <div className="relative overflow-hidden rounded-[1.5rem] bg-black p-[2px] ring-1 ring-white/10"
            style={{ boxShadow: '0 24px 50px rgba(0,0,0,0.85), 0 0 34px rgba(212,168,83,0.18)' }}>
            <div className="relative overflow-hidden rounded-[1.35rem] bg-[#0a0506]" style={{ aspectRatio: '9 / 19.5' }}>
              <img src={`/mockup-hp.png${v}`} alt="LuxQuant mobile" className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div className="absolute left-1/2 top-[2.4%] z-20 -translate-x-1/2 rounded-full bg-black" style={{ width: '32%', aspectRatio: '3.4 / 1' }} />
              <div className="absolute bottom-[1.6%] left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/25" style={{ width: '34%', height: 2 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ================================================================
   MOBILE SHOWCASE — kept (unused, backward compat)
   ================================================================ */
export const MobileGlobeSection = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  return (
    <div className="lg:hidden">
      <div className="mx-auto" style={{ maxWidth: 280 }}><DeviceShowcase compact /></div>
      <p className="mt-3 pb-1 text-center" style={{ fontSize: 12, color: '#6b5c52' }}>
        <span style={{ color: '#d4a853' }}>📊</span>{' '}{a('globe_more')} <span style={{ color: '#b8a89a', fontWeight: 600 }}>{a('globe_countries')}</span> {a('globe_trust')}
      </p>
    </div>
  );
};

/* ================================================================
   ASSETS — real logos (CoinMarketCap / Clearbit) + graceful fallback
   ================================================================ */
const ASSETS = [
  { src: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1.png', fb: '₿', bg: '#f7931a', fbColor: '#ffffff' },     // BTC
  { src: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png', fb: 'Ξ', bg: '#627eea', fbColor: '#ffffff' },  // ETH
  { src: 'https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png', fb: 'H', bg: '#2cd4b4', fbColor: '#04302a' }, // HYPE (Hyperliquid)
  { src: 'https://cdn.simpleicons.org/nvidia/ffffff', fb: 'N', bg: '#76b900', fbColor: '#ffffff', contain: true, pad: 8 },  // NVIDIA — real eye logo on brand-green coin
  { src: 'https://cdn.simpleicons.org/samsung/ffffff', fb: 'S', bg: '#1428a0', fbColor: '#ffffff', contain: true, pad: 9 }, // SAMSUNG (tokenized stock)
  { src: 'https://cdn.simpleicons.org/amd/ffffff', fb: 'A', bg: '#0b0b0c', fbColor: '#ffffff', contain: true, pad: 8 },     // AMD (tokenized stock)
];

/* ================================================================
   ASSET COINS — shared overlapping coin row (desktop + mobile)
   gold 3D hover, real logos w/ graceful letter fallback
   ================================================================ */
export const AssetCoins = ({ size = 40, className = '' }) => {
  const overlap = Math.round(size * 0.225);
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ perspective: '600px' }}>
      {ASSETS.map((c, i) => (
        <span key={i} className="group relative block"
          style={{ marginLeft: i ? -overlap : 0, zIndex: 10 - i }}
          onMouseEnter={(e) => { e.currentTarget.style.zIndex = '60'; }}
          onMouseLeave={(e) => { e.currentTarget.style.zIndex = String(10 - i); }}>
          {/* gold halo */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ boxShadow: '0 0 22px 4px rgba(212,168,83,0.5)' }} />
          {/* coin (tilts in 3D on hover) */}
          <span className="relative flex items-center justify-center overflow-hidden rounded-full transition-transform duration-300 ease-out will-change-transform group-hover:[transform:rotateX(16deg)_rotateY(-16deg)_scale(1.16)]"
            style={{ width: size, height: size, background: c.bg, boxShadow: '0 0 0 3px #160608' }}>
            {/* fallback letter — hidden unless the logo image fails to load */}
            <span className="absolute inset-0 flex items-center justify-center font-bold" style={{ color: c.fbColor, fontSize: size * 0.4, opacity: c.src ? 0 : 1 }}>{c.fb}</span>
            {c.src && (
              <img src={c.src} alt="" className="absolute inset-0 h-full w-full"
                style={{ objectFit: c.contain ? 'contain' : 'cover', padding: c.contain ? Math.round((c.pad ?? 6) * size / 40) : 0 }}
                onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.previousElementSibling; if (fb) fb.style.opacity = '1'; }} />
            )}
            {/* gold inner ring on hover */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ boxShadow: 'inset 0 0 0 2px rgba(212,168,83,0.95)' }} />
          </span>
        </span>
      ))}
      <span className="flex items-center justify-center rounded-full font-semibold"
        style={{ height: size, paddingInline: Math.round(size * 0.35), marginLeft: -overlap, background: '#241416', color: '#cbb6a6', fontSize: Math.round(size * 0.31), boxShadow: '0 0 0 3px #160608' }}>
        +more
      </span>
    </div>
  );
};

/* Solid gold market icons (LuxQuant) — representative crypto-domain glyphs */
const MARKETS = [
  {
    // Crypto — candlestick chart
    label: 'Crypto',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d4a853" className="h-[18px] w-[18px]" aria-hidden="true">
        <rect x="4" y="9" width="3.2" height="8" rx="1" /><rect x="5" y="6" width="1.2" height="14" rx="0.6" />
        <rect x="10.4" y="6" width="3.2" height="11" rx="1" /><rect x="11.4" y="3" width="1.2" height="18" rx="0.6" />
        <rect x="16.8" y="10.5" width="3.2" height="5.5" rx="1" /><rect x="17.8" y="8" width="1.2" height="11" rx="0.6" />
      </svg>
    ),
  },
  {
    // Tokenized TradFi — bank / institution
    label: 'Tokenized TradFi',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d4a853" className="h-[18px] w-[18px]" aria-hidden="true">
        <path d="M12 2.2 22 7.4v2H2v-2z" /><rect x="4" y="11" width="2.6" height="6.4" rx="0.5" />
        <rect x="9" y="11" width="2.6" height="6.4" rx="0.5" /><rect x="14" y="11" width="2.6" height="6.4" rx="0.5" />
        <rect x="18.4" y="11" width="2" height="6.4" rx="0.5" /><rect x="2.2" y="18.6" width="19.6" height="2.6" rx="0.7" />
      </svg>
    ),
  },
  {
    // On-Chain — linked blocks (blockchain)
    label: 'On-Chain',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d4a853" className="h-[18px] w-[18px]" aria-hidden="true">
        <rect x="2.5" y="8.5" width="7" height="7" rx="2.2" /><rect x="14.5" y="8.5" width="7" height="7" rx="2.2" />
        <rect x="8.6" y="10.6" width="6.8" height="2.8" rx="1.4" />
      </svg>
    ),
  },
  {
    // AI Research — processor / algo chip
    label: 'AI Research',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d4a853" className="h-[18px] w-[18px]" aria-hidden="true">
        <rect x="6.5" y="6.5" width="11" height="11" rx="2.6" />
        <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1.1" fill="#150708" />
        <rect x="10.3" y="2.4" width="1.5" height="3" rx="0.4" /><rect x="13.2" y="2.4" width="1.5" height="3" rx="0.4" />
        <rect x="10.3" y="18.6" width="1.5" height="3" rx="0.4" /><rect x="13.2" y="18.6" width="1.5" height="3" rx="0.4" />
        <rect x="2.4" y="10.3" width="3" height="1.5" rx="0.4" /><rect x="2.4" y="13.2" width="3" height="1.5" rx="0.4" />
        <rect x="18.6" y="10.3" width="3" height="1.5" rx="0.4" /><rect x="18.6" y="13.2" width="3" height="1.5" rx="0.4" />
      </svg>
    ),
  },
];

/* ================================================================
   DESKTOP LEFT PANEL — MEXC-style hero (lg+ only)
   ================================================================ */
const LeftBrandPanel = () => {
  return (
    <>
      <style>{`@keyframes lq-blink { 50% { opacity: 0; } }`}</style>

      <div className="hidden lg:flex lg:w-[55%] relative flex-col">
        <div className="relative z-10 flex h-full flex-col px-10 xl:px-16 pt-9 pb-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LuxQuant" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }} />
            <span className="text-white font-bold tracking-wide" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}>LuxQuant</span>
          </div>

          {/* Center — iMac (fade to black) + headline + chips */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="w-full" style={{ maxWidth: 432, WebkitMaskImage: 'linear-gradient(to bottom, #000 58%, transparent 97%)', maskImage: 'linear-gradient(to bottom, #000 58%, transparent 97%)' }}>
              <DeviceShowcase phone={false} />
            </div>

            <h2 className="mt-4 text-center font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#ffffff', lineHeight: 1.16, fontSize: 'clamp(26px, 2.5vw, 36px)' }}>
              Detect <span style={{ color: '#d4a853' }}>Crypto</span> &amp; Tokenized <span style={{ color: '#d4a853' }}>TradFi</span> Moves
            </h2>

            {/* Asset logos — shared component */}
            <AssetCoins size={40} className="mt-8" />
          </div>

          {/* Bottom — markets row (LuxQuant, solid gold icons) */}
          <div className="text-center">
            <p className="mb-5 font-mono uppercase tracking-[0.22em]" style={{ color: '#8a7a6e', fontSize: 11 }}>All Markets, One Edge</p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3" style={{ color: '#c4b3a3', fontSize: 13.5 }}>
              {MARKETS.map((m) => (
                <span key={m.label} className="inline-flex items-center gap-2">{m.icon}{m.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeftBrandPanel;
