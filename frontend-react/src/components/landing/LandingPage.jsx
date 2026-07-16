import Seo from "../Seo";
// src/components/landing/LandingPage.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { saveRefFromURL } from "../../utils/referralStorage";
import {
  ResponsiveContainer,
  Tooltip,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  ReferenceLine,
  Line,
  ComposedChart,
} from "recharts";
import TopPerformers from "../TopPerformers";
import CoinLogo from "../CoinLogo";
import GlobalNetworkSection from "./GlobalNetworkSection";
import FeatureSliderSection from "./FeatureSliderSection";

import "./LandingPage.css";

// ════════════════════════════════════════
// Ticker Bar
// ════════════════════════════════════════
const TICKER_COINS = [
  { id: "bitcoin", symbol: "BTC", cmcId: 1 },
  { id: "ethereum", symbol: "ETH", cmcId: 1027 },
  { id: "binancecoin", symbol: "BNB", cmcId: 1839 },
  { id: "solana", symbol: "SOL", cmcId: 5426 },
  { id: "ripple", symbol: "XRP", cmcId: 52 },
  { id: "cardano", symbol: "ADA", cmcId: 2010 },
  { id: "dogecoin", symbol: "DOGE", cmcId: 74 },
  { id: "chainlink", symbol: "LINK", cmcId: 1975 },
];

const TickerBar = () => {
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = TICKER_COINS.map((c) => c.id).join(",");
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        );
        if (res.ok) {
          const data = await res.json();
          setPrices(
            TICKER_COINS.map((c) => ({
              ...c,
              price: data[c.id]?.usd || 0,
              change: data[c.id]?.usd_24h_change || 0,
            })),
          );
        }
      } catch (e) {
        console.warn("Ticker fetch failed:", e);
      }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 60000);
    return () => clearInterval(iv);
  }, []);

  if (prices.length === 0) return null;
  const items = [...prices, ...prices, ...prices];

  return (
    <div className="w-full bg-black/60 backdrop-blur-md border-b border-line/10 overflow-hidden h-10 flex items-center">
      <div className="flex animate-[tickerScroll_40s_linear_infinite] whitespace-nowrap gap-8 px-4">
        {items.map((coin, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs flex-shrink-0"
          >
            <img
              src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.cmcId}.png`}
              alt={coin.symbol}
              className="w-4 h-4 rounded-full"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
            <span className="text-text-secondary font-semibold">
              {coin.symbol}
            </span>
            <span className="text-text-primary font-mono">
              $
              {coin.price?.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              className={`font-mono font-semibold ${coin.change >= 0 ? "text-positive" : "text-negative"}`}
            >
              {coin.change >= 0 ? "+" : ""}
              {coin.change?.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
    </div>
  );
};

// ════════════════════════════════════════
// FAQ & Testimonial Cards
// ════════════════════════════════════════
// ════════════════════════════════════════
// TESTIMONIALS CAROUSEL — Web3 style
// 5 dummy mix personas, auto-scroll + drag + arrows
// ════════════════════════════════════════
const TESTIMONIALS = [
  {
    id: "0xLQ_001",
    name: "Rizky Hidayat",
    handle: "@rizkytrades",
    role: "Day Trader",
    location: "Jakarta",
    flag: "🇮🇩",
    text: "Win rate 80%+ konsisten 6 bulan terakhir. TP1-TP4 matrix kasih saya kepastian exit yang jelas — nggak perlu guess lagi. Best signal terminal yang pernah gue pakai untuk scalping.",
    signalsTraded: 1247,
    avgWinRate: 82.3,
  },
  {
    id: "0xLQ_002",
    name: "Marcus Chen",
    handle: "@marcustaipei",
    role: "Swing Trader",
    location: "Taipei",
    flag: "🇹🇼",
    text: "AI Researcher mengubah game gue total. Setiap pagi tinggal cek verdict, baca thesis-nya, eksekusi. Saved me 4-5 jam riset manual per hari. Sharpe ratio gue naik 1.8x quarter ini.",
    signalsTraded: 432,
    avgWinRate: 78.9,
  },
  {
    id: "0xLQ_003",
    name: "Priya Sharma",
    handle: "@priyaqcap",
    role: "Portfolio Manager",
    location: "Singapore",
    flag: "🇸🇬",
    text: "Managing $2M+ multi-strategy book. Whale alerts + macro calendar + on-chain intel = institutional-grade edge. Sebelumnya butuh 3 platform terpisah. Sekarang semua di satu terminal.",
    signalsTraded: 891,
    avgWinRate: 84.5,
  },
  {
    id: "0xLQ_004",
    name: "Hiroshi Tanaka",
    handle: "@hiroonchain",
    role: "On-Chain Analyst",
    location: "Tokyo",
    flag: "🇯🇵",
    text: "Whale Surveillance feature is unmatched. Real-time tracking of large transfers across exchanges helps me front-run mass liquidations. Caught 3 perfect short setups last month alone.",
    signalsTraded: 256,
    avgWinRate: 76.2,
  },
  {
    id: "0xLQ_005",
    name: "Daniel Kim",
    handle: "@dankimquant",
    role: "Quant Researcher",
    location: "Seoul",
    flag: "🇰🇷",
    text: "Order book heatmap + funding rate monitor = my secret weapon. Backtested LuxQuant signals against my own models — outperformed by 14% on risk-adjusted basis. Now I just follow the algo.",
    signalsTraded: 678,
    avgWinRate: 85.1,
  },
];

// Verified gold checkmark icon
const VerifiedBadge = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2l2.4 1.8 3 -.3 1.2 2.7 2.7 1.2 -.3 3 1.8 2.4 -1.8 2.4 .3 3 -2.7 1.2 -1.2 2.7 -3 -.3 -2.4 1.8 -2.4 -1.8 -3 .3 -1.2 -2.7 -2.7 -1.2 .3 -3 -1.8 -2.4 1.8 -2.4 -.3 -3 2.7 -1.2 1.2 -2.7 3 .3 2.4 -1.8z"
      fill="#d4a853"
    />
    <path
      d="M8 12.5l2.5 2.5 5 -5"
      stroke="#0a0506"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TestimonialsCarousel = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const dragStartXRef = useRef(0);
  const dragDeltaRef = useRef(0);

  // Auto-scroll every 6 seconds (paused on hover/drag)
  useEffect(() => {
    if (isPaused || isDragging) return;
    const iv = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(iv);
  }, [isPaused, isDragging]);

  const goNext = () => setActiveIdx((prev) => (prev + 1) % TESTIMONIALS.length);
  const goPrev = () =>
    setActiveIdx((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  // ─── Drag handlers (mouse + touch) ───
  const handleDragStart = (clientX) => {
    setIsDragging(true);
    dragStartXRef.current = clientX;
    dragDeltaRef.current = 0;
  };

  const handleDragMove = (clientX) => {
    if (!isDragging) return;
    dragDeltaRef.current = clientX - dragStartXRef.current;
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    const delta = dragDeltaRef.current;
    const threshold = 60; // pixels
    if (delta < -threshold) goNext();
    else if (delta > threshold) goPrev();
    setIsDragging(false);
    dragDeltaRef.current = 0;
  };

  return (
    <section
      id="testimonials"
      className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24"
    >
      {/* Header — line-label-line pattern */}
      <div className="text-center mb-10 lg:mb-12">
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="h-px w-8 bg-gold-primary/40" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
            Verified Voices
          </span>
          <span className="h-px w-8 bg-gold-primary/40" />
        </div>
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-text-primary mb-4 tracking-tight">
          Trusted by{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">
            Traders
          </span>
        </h2>
        <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto leading-relaxed">
          Real traders. Real PnL. Real on-chain track records.
        </p>
      </div>

      {/* Carousel container */}
      <div
        className="relative max-w-3xl mx-auto"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => {
          setIsPaused(false);
          handleDragEnd();
        }}
      >
        {/* ── Card stage ── */}
        <div
          className="relative h-[340px] sm:h-[300px] lg:h-[280px] overflow-hidden cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
          onTouchEnd={handleDragEnd}
        >
          {TESTIMONIALS.map((t, idx) => {
            const isActive = idx === activeIdx;
            return (
              <div
                key={t.id}
                className={`absolute inset-0 transition-all duration-500 ease-out ${
                  isActive
                    ? "opacity-100 translate-x-0 pointer-events-auto"
                    : "opacity-0 translate-x-8 pointer-events-none"
                }`}
              >
                <div className="relative h-full bg-surface-raised rounded-md border border-white/10 p-6 lg:p-8 overflow-hidden">
                  {/* Hairline gold accent on top */}
                  <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

                  {/* Header row: avatar (initial) + name/handle/verified + user ID */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      {/* Avatar with initial */}
                      <div
                        className="w-11 h-11 rounded-md flex items-center justify-center font-display font-bold text-base text-bg-primary flex-shrink-0"
                        style={{
                          background:
                            "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                        }}
                      >
                        {t.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-text-primary text-sm font-semibold truncate">
                            {t.name}
                          </p>
                          <VerifiedBadge />
                          <span className="text-base leading-none flex-shrink-0">
                            {t.flag}
                          </span>
                        </div>
                        <p className="text-text-muted text-[11px] font-mono">
                          {t.handle} · {t.role}
                        </p>
                      </div>
                    </div>

                    {/* User ID badge (top right) */}
                    <span className="text-text-muted text-[9px] font-mono tracking-widest bg-white/[0.04] border border-white/10 rounded-sm px-2 py-1 flex-shrink-0">
                      {t.id}
                    </span>
                  </div>

                  {/* Quote */}
                  <p className="text-text-secondary text-sm lg:text-base leading-relaxed mb-5 italic">
                    "{t.text}"
                  </p>

                  {/* Footer stats (mono) */}
                  <div className="absolute bottom-6 left-6 right-6 lg:bottom-8 lg:left-8 lg:right-8 flex items-center justify-between pt-4 border-t border-white/[0.06]">
                    <div>
                      <p className="text-text-muted text-[9px] uppercase tracking-[0.18em] mb-0.5">
                        Signals Traded
                      </p>
                      <p className="text-text-primary font-mono font-bold text-sm tabular-nums">
                        {t.signalsTraded.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-text-muted text-[9px] uppercase tracking-[0.18em] mb-0.5">
                        Avg Win Rate
                      </p>
                      <p className="text-gold-primary font-mono font-bold text-sm tabular-nums">
                        {t.avgWinRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Arrow controls (desktop) ── */}
        <button
          onClick={goPrev}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-9 h-9 items-center justify-center rounded-md text-text-primary/40 hover:text-gold-primary hover:bg-white/[0.03] border border-white/10 hover:border-line/30 transition-all"
          aria-label="Previous testimonial"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goNext}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-9 h-9 items-center justify-center rounded-md text-text-primary/40 hover:text-gold-primary hover:bg-white/[0.03] border border-white/10 hover:border-line/30 transition-all"
          aria-label="Next testimonial"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* ── Dot indicators + Mobile arrows ── */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {/* Mobile prev arrow */}
          <button
            onClick={goPrev}
            className="lg:hidden w-7 h-7 flex items-center justify-center text-text-primary/40 hover:text-gold-primary transition-colors"
            aria-label="Previous"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {TESTIMONIALS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`h-1.5 rounded-sm transition-all duration-300 ${
                idx === activeIdx
                  ? "w-8 bg-gold-primary"
                  : "w-1.5 bg-white/15 hover:bg-white/30"
              }`}
              aria-label={`Go to testimonial ${idx + 1}`}
            />
          ))}

          {/* Mobile next arrow */}
          <button
            onClick={goNext}
            className="lg:hidden w-7 h-7 flex items-center justify-center text-text-primary/40 hover:text-gold-primary transition-colors"
            aria-label="Next"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Counter (subtle) */}
        <div className="text-center mt-3">
          <span className="font-mono text-[10px] text-text-muted tracking-widest tabular-nums">
            {String(activeIdx + 1).padStart(2, "0")} / {String(TESTIMONIALS.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </section>
  );
};

const FAQ_DATA = [
  {
    q: "Is it suitable for beginners?",
    a: "Absolutely! Our signals provide comprehensive details including exact entry points, multiple profit targets (TP1-TP4), and strict stop-loss (SL) levels.",
  },
  {
    q: "What is the recommended starting capital?",
    a: "While there is no strict minimum, we recommend starting with at least $100 - $500 for proper risk management.",
  },
  {
    q: "What happens if the algorithm makes a wrong prediction (Loss)?",
    a: "Trading always carries risk. That's why every single signal includes a strict Stop-Loss (SL) level to protect your capital.",
  },
  {
    q: "Do I need to monitor the screen 24/7?",
    a: "Not at all. Our system operates 24/7 and sends real-time push notifications directly to your Telegram or Dashboard.",
  },
];

const FAQItem = ({ q, a, isOpen, onClick }) => (
  <div
    className={`bg-surface-raised border rounded-md overflow-hidden mb-2 transition-all duration-300 ${
      isOpen ? "border-line/30" : "border-white/[0.06] hover:border-white/[0.12]"
    }`}
  >
    <button
      className="w-full px-5 py-4 text-left flex justify-between items-center focus:outline-none group"
      onClick={onClick}
    >
      <span className="font-semibold text-text-primary pr-4 text-sm lg:text-base">
        {q}
      </span>
      <svg
        className={`w-4 h-4 flex-shrink-0 transition-all duration-300 ${
          isOpen ? "text-gold-primary rotate-180" : "text-text-primary/40 group-hover:text-text-primary/70"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}
    >
      <div className="px-5 pb-4 text-text-secondary text-sm leading-relaxed border-t border-white/[0.06] pt-4 font-mono">
        {a}
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════
// Promo Flying Coins (Untuk Mockup Telegram Bawah)
// ════════════════════════════════════════
const PromoFlyingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers?.slice(0, 20) || [];

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % allCoins.length);
    }, 3500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, "").replace(/^3A/, "") || "???";
  const labelText = item?.type ? `${item.type} Top Gainer` : "Live Gainer Call";

  return (
    <div
      key={currentIdx}
      className="absolute z-40 pointer-events-none"
      style={{
        top: "50%",
        left: "50%",
        animation: "flyOutRightAnim 3.5s ease-out both",
      }}
    >
      <div
        className="flex flex-col gap-1 px-4 py-2.5 rounded-2xl border border-line/30 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_15px_rgba(212,168,83,0.15)] min-w-[140px]"
        style={{
          background: "rgba(10,5,6,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CoinLogo pair={item.pair} size={20} />
            <span className="text-text-primary text-sm font-bold">{symbol}</span>
          </div>
          <span className="text-green-400 text-sm font-bold font-mono">
            +{item.gain_pct?.toFixed(2)}%
          </span>
        </div>
        <span className="text-gold-primary/70 text-[9px] font-mono tracking-widest uppercase text-left mt-1 block">
          {labelText}
        </span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// ════════════════════════════════════════
// Telegram Promo Component
// ════════════════════════════════════════
const TelegramPromo = ({ gainers }) => {
  return (
    <div className="relative mt-16 overflow-visible">
      {/* Subtle ambient glow — minimal, no box */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gold-primary/[0.04] blur-[140px] rounded-full pointer-events-none -z-10" />

      <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 relative z-10">
        {/* LEFT — Content */}
        <div className="flex-1 text-center lg:text-left">
          {/* Section label — line-label-line pattern */}
          <div className="flex items-center justify-center lg:justify-start gap-3 mb-6">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
              100% Free Tier
            </span>
            <span className="h-px w-8 bg-gold-primary/40" />
          </div>

          <h2 className="font-display text-4xl lg:text-5xl font-bold text-text-primary mb-6 leading-tight tracking-tight">
            Try Before You <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">
              Subscribe.
            </span>
          </h2>

          <p className="text-text-secondary mb-10 text-base lg:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Want to test our accuracy before unlocking the full institutional terminal? Join{" "}
            <span className="text-text-primary font-mono">@LuxQuantSignal</span> for our free public channel. Real-time algorithm previews and selected high-probability calls — directly to your pocket.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
            <a
              href="https://t.me/LuxQuantSignal"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-md font-semibold text-sm transition-all hover:-translate-y-0.5 shadow-[0_4px_14px_rgba(212,168,83,0.25)] hover:shadow-[0_6px_18px_rgba(212,168,83,0.35)]"
              style={{
                background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                color: "rgb(var(--surface))",
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              <span className="tracking-wide">Join Free Channel</span>
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>

            {/* Counter — minimal, mono */}
            <div className="flex flex-col items-center sm:items-start mt-2 sm:mt-0 sm:ml-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                Active Community
              </span>
              <span className="text-text-primary font-mono text-sm tabular-nums">
                Thousands of Traders
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — Phone mockup, FLOATING (no outer box) */}
        <div className="flex-1 flex justify-center lg:justify-end relative">
          {/* Subtle glow behind phone — not a container */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-gold-primary/[0.08] blur-[80px] rounded-full pointer-events-none" />

          <div className="relative w-[240px] lg:w-[280px] aspect-[9/19.5] z-10 group">
            {/* Phone bezel */}
            <div className="absolute inset-0 bg-surface border-[6px] lg:border-[8px] border-surface-hover rounded-[2.5rem] lg:rounded-[3rem] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.8)]">
              {/* Dynamic island */}
              <div className="absolute top-0 inset-x-0 z-30">
                <div className="w-[35%] h-[16px] lg:h-[20px] bg-surface-secondary mx-auto rounded-b-xl lg:rounded-b-2xl" />
              </div>
              {/* Screen */}
              <div className="absolute inset-[2px] rounded-[2.2rem] lg:rounded-[2.8rem] overflow-hidden bg-surface">
                <img
                  src="/telegram-ss.png?v=2"
                  alt="LuxQuant Telegram Channel Content"
                  className="w-full h-full object-cover opacity-90"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
              </div>
            </div>
            <PromoFlyingCoins gainers={gainers} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Live Performance Stats
// ════════════════════════════════════════
const FIRST_SIGNAL_DATE = new Date("2023-12-27T13:25:00Z");

const formatRuntime = (ms) => {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return { days, hrs, mins, secs };
};

const RuntimeCounter = () => {
  const [runtime, setRuntime] = useState(
    formatRuntime(Date.now() - FIRST_SIGNAL_DATE.getTime()),
  );
  useEffect(() => {
    const iv = setInterval(
      () => setRuntime(formatRuntime(Date.now() - FIRST_SIGNAL_DATE.getTime())),
      1000,
    );
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="glass-card rounded-xl p-5 lg:p-6 border border-line/20 col-span-2 lg:col-span-4">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <>
            <style>{`
              @keyframes goldFlare {
                0%, 100% {
                  box-shadow:
                    0 0 6px rgba(212, 168, 83, 0.85),
                    0 0 12px rgba(212, 168, 83, 0.55),
                    0 0 20px rgba(212, 168, 83, 0.3),
                    inset 0 0 3px rgba(255, 245, 214, 0.6);
                }
                50% {
                  box-shadow:
                    0 0 3px rgba(212, 168, 83, 0.5),
                    0 0 6px rgba(212, 168, 83, 0.3),
                    0 0 10px rgba(212, 168, 83, 0.15),
                    inset 0 0 2px rgba(255, 245, 214, 0.4);
                }
              }
            `}</style>
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: 'radial-gradient(circle at 30% 30%, #fde6a8, #d4a853 60%, #8b6914)',
                animation: 'goldFlare 2s ease-in-out infinite',
              }}
            />
          </>
          <div>
            <p className="text-text-primary font-semibold text-sm lg:text-base">
              Algorithm Running Since
            </p>
            <p className="text-text-muted text-xs">
              First signal: 27 December 2023, 13:25 UTC
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          {[
            { val: runtime.days, label: "Days" },
            { val: runtime.hrs, label: "Hours" },
            { val: runtime.mins, label: "Min" },
            { val: runtime.secs, label: "Sec" },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <div className="bg-bg-primary border border-line/20 rounded-lg px-3 py-2 min-w-[52px]">
                <span className="text-gold-primary font-mono text-lg lg:text-xl font-bold">
                  {String(val).padStart(2, "0")}
                </span>
              </div>
              <p className="text-text-muted text-[9px] mt-1 uppercase tracking-wider">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const LandingWinRateChart = ({ data }) => {
  if (!data || data.length === 0)
    return (
      <div className="h-48 lg:h-64 flex items-center justify-center text-text-muted">
        Loading trend data...
      </div>
    );

  const chartData = data.map((item) => {
    let shortLabel = item.period;
    let tooltipLabel = item.period;
    try {
      const dt = new Date(item.period);
      if (!isNaN(dt)) {
        shortLabel = dt.toLocaleDateString("en", {
          month: "short",
          day: "numeric",
        });
        tooltipLabel = `Week of ${dt.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}`;
      }
    } catch (e) {}

    return {
      period: shortLabel,
      fullDate: tooltipLabel,
      winRate: item.win_rate,
      winners: item.winners,
      losers: item.losers,
      total: item.total_closed,
    };
  });

  const validRates = chartData.map((d) => d.winRate).filter((v) => v > 0);
  const avgWR =
    validRates.length > 0
      ? validRates.reduce((s, v) => s + v, 0) / validRates.length
      : 0;
  const maxVol = Math.max(...chartData.map((d) => d.total), 1);

  return (
    <div className="h-48 lg:h-64 w-full mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="winRateGlowLnd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4a853" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#d4a853" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="volBarGradLnd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4a853" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#d4a853" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(212,168,83,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="period"
            stroke="#6b5c52"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            yAxisId="rate"
            stroke="#6b5c52"
            fontSize={10}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="vol"
            orientation="right"
            domain={[0, maxVol * 4]}
            hide
          />
          <ReferenceLine
            yAxisId="rate"
            y={avgWR}
            stroke="rgba(212,168,83,0.2)"
            strokeDasharray="4 4"
          />
          <Bar
            yAxisId="vol"
            dataKey="total"
            fill="url(#volBarGradLnd)"
            radius={[2, 2, 0, 0]}
            maxBarSize={12}
          />
          <Area
            yAxisId="rate"
            type="monotone"
            dataKey="winRate"
            stroke="none"
            fill="url(#winRateGlowLnd)"
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="winRate"
            stroke="#d4a853"
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 5,
              fill: "#d4a853",
              stroke: "#0a0506",
              strokeWidth: 2,
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d =
                payload.find((p) => p.dataKey === "winRate")?.payload ||
                payload[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-surface-raised/95 backdrop-blur-md border border-line/30 rounded-xl p-3 shadow-xl">
                  <p className="text-gold-primary text-xs font-bold mb-1">
                    {d.fullDate}
                  </p>
                  <p className="text-text-primary text-sm">
                    Win Rate:{" "}
                    <span className="text-green-400 font-mono">
                      {d.winRate.toFixed(1)}%
                    </span>
                  </p>
                  <p className="text-text-muted text-[10px] mt-1">
                    {d.total} Trades ({d.winners}W / {d.losers}L)
                  </p>
                </div>
              );
            }}
            cursor={{
              stroke: "rgba(212,168,83,0.2)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const LivePerformanceStats = ({ data }) => {
  const navigate = useNavigate();
  const stats = data?.stats;
  const trendData = data?.win_rate_trend || [];
  const goPerf = () => navigate("/terminal?tab=analytics");

  const winRate = stats?.win_rate ?? 0;
  const totalSignals = stats?.total_signals ?? 0;
  const closedTrades = stats?.closed_trades ?? 0;
  const totalWinners = stats?.total_winners ?? 0;
  const slCount = stats?.sl_count ?? 0;
  const activePairs = stats?.active_pairs ?? 0;
  const openSignals = stats?.open_signals ?? 0;

  const outcomeItems = [
    { label: "TP1", count: stats?.tp1_count ?? 0, color: "rgb(var(--accent-light))", opacity: 1 },
    { label: "TP2", count: stats?.tp2_count ?? 0, color: "rgb(var(--accent))", opacity: 0.85 },
    { label: "TP3", count: stats?.tp3_count ?? 0, color: "#b88a3e", opacity: 0.7 },
    { label: "TP4", count: stats?.tp4_count ?? 0, color: "rgb(var(--accent-dark))", opacity: 0.55 },
    { label: "SL", count: slCount, color: "#EF4444", opacity: 1 },
  ];
  const outcomeTotal = outcomeItems.reduce((s, i) => s + i.count, 0);

  const riskDist = data?.risk_distribution || [];
  const riskColors = {
    Low: {
      text: "text-green-400",
      dot: "bg-green-500",
      bar: "#22C55E",
      border: "border-green-500/20",
      bg: "from-green-500/[0.06]",
    },
    Normal: {
      text: "text-yellow-400",
      dot: "bg-yellow-500",
      bar: "#EAB308",
      border: "border-yellow-500/20",
      bg: "from-yellow-500/[0.06]",
    },
    High: {
      text: "text-red-400",
      dot: "bg-red-500",
      bar: "#EF4444",
      border: "border-red-500/20",
      bg: "from-red-500/[0.06]",
    },
  };
  const riskTotal = riskDist.reduce((s, r) => s + (r.total_signals || 0), 0);

  // 6-stat grid config (data-driven)
  const statCards = [
    {
      label: "Win Rate",
      value: stats ? `${winRate.toFixed(1)}%` : "—",
      colorClass: "text-gold-primary",
      isAccent: true,
    },
    {
      label: "Closed Trades",
      value: stats ? closedTrades.toLocaleString() : "—",
      colorClass: "text-text-primary",
    },
    {
      label: "Winners",
      value: stats ? totalWinners.toLocaleString() : "—",
      colorClass: "text-text-primary",
    },
    {
      label: "Losses",
      value: stats ? slCount.toLocaleString() : "—",
      colorClass: "text-text-primary",
    },
    {
      label: "Pairs Traded",
      value: stats ? activePairs.toLocaleString() : "—",
      colorClass: "text-text-primary",
    },
    {
      label: "Not Hit",
      value: stats ? openSignals.toLocaleString() : "—",
      colorClass: "text-text-secondary",
    },
  ];

  return (
    <div>
      {/* ════════════════════════════════════════
          1. SECTION HEADER — line-label-line pattern
          ════════════════════════════════════════ */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="h-px w-8 bg-gold-primary/40" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 flex items-center gap-2">
            <span className="text-base leading-none">🇹🇼</span>
            Built in Taiwan · Running Since 2023
          </span>
          <span className="h-px w-8 bg-gold-primary/40" />
        </div>
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-text-primary mb-4 tracking-tight">
          Transparent &{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">
            Verified
          </span>{" "}
          Performance
        </h2>
        <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto leading-relaxed">
          Every signal is recorded on-chain since day one. Full history, no
          hidden trades, no cherry-picking —
          <span className="text-text-primary font-medium font-mono">
            {" "}
            {stats ? totalSignals.toLocaleString() : "..."} signals
          </span>{" "}
          and counting.
        </p>
      </div>

      {/* Runtime Counter (separate component) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
        <RuntimeCounter />
      </div>

      {/* ════════════════════════════════════════
          2. 6-STAT GRID — Naked huge numbers, flat hairline
          ════════════════════════════════════════ */}
      <div onClick={goPerf} className="cursor-pointer group">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 mb-4">
          {statCards.map((card, idx) => (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-md p-3 lg:p-4 bg-surface-raised border transition-all ${
                card.isAccent
                  ? "border-line/25 group-hover:border-gold-primary/50"
                  : "border-white/[0.06] group-hover:border-line/20"
              }`}
            >
              {/* Hairline accent on top for accent card */}
              {card.isAccent && (
                <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/60 to-transparent" />
              )}
              <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-[0.18em] font-medium mb-2">
                {card.label}
              </p>
              <div className="h-px bg-white/[0.04] mb-2" />
              <p
                className={`text-2xl lg:text-3xl font-bold font-mono leading-none tabular-nums ${card.colorClass}`}
              >
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          3. CHART + OUTCOME DISTRIBUTION
          ════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 mb-4">
        {/* Performance Trend Chart (2/3) */}
        <div
          onClick={goPerf}
          className="lg:col-span-2 relative overflow-hidden rounded-md p-4 lg:p-6 bg-surface-raised border border-white/10 hover:border-line/30 transition-all cursor-pointer"
        >
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-text-primary font-semibold text-base lg:text-lg mb-1 tracking-tight">
                Performance Trend
              </h3>
              <p className="text-text-muted text-[10px] lg:text-xs font-mono">
                Weekly algorithmic win rate progression
              </p>
            </div>
            <div className="px-2.5 py-1 bg-gold-primary/10 border border-line/20 rounded-sm">
              <span className="text-gold-primary text-[10px] font-bold uppercase tracking-[0.2em] font-mono">
                Weekly
              </span>
            </div>
          </div>
          <LandingWinRateChart data={trendData} />
        </div>

        {/* Outcome Distribution (1/3) — flat segmented Hydromancer-style */}
        <div
          onClick={goPerf}
          className="lg:col-span-1 relative overflow-hidden rounded-md p-4 lg:p-6 bg-surface-raised border border-white/10 hover:border-line/30 transition-all cursor-pointer"
        >
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
          <h3 className="text-text-primary font-semibold text-base lg:text-lg mb-1 tracking-tight">
            Outcome Distribution
          </h3>
          <p className="text-text-muted text-[10px] lg:text-xs mb-6 font-mono">
            {stats ? closedTrades.toLocaleString() : "—"} closed trades
          </p>
          {outcomeTotal > 0 ? (
            <div className="space-y-5">
              {/* Flat segmented bar with hairline gaps */}
              <div className="h-2.5 flex bg-bg-card/40 border border-white/5 rounded-sm overflow-hidden">
                {outcomeItems
                  .filter((i) => i.count > 0)
                  .map((item, idx, arr) => {
                    const pct = (item.count / outcomeTotal) * 100;
                    const isLast = idx === arr.length - 1;
                    return (
                      <div
                        key={idx}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: item.color,
                          opacity: item.opacity,
                          marginRight: isLast ? 0 : "1px",
                        }}
                        className="h-full transition-all duration-700"
                      />
                    );
                  })}
              </div>
              <div className="space-y-2.5">
                {outcomeItems.map((item) => {
                  const pct =
                    outcomeTotal > 0 ? (item.count / outcomeTotal) * 100 : 0;
                  const isSL = item.label === "SL";
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span
                        className="text-[11px] font-bold w-8 font-mono tracking-wider"
                        style={{
                          color: item.color,
                          opacity: isSL ? 1 : item.opacity,
                        }}
                      >
                        {item.label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-sm bg-bg-card/60 overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-700"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            backgroundColor: item.color,
                            opacity: item.opacity,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-end w-12">
                        <span className="text-text-primary text-[11px] font-mono font-semibold tabular-nums">
                          {item.count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-line/20 border-t-gold-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          4. RISK LEVEL ANALYSIS — Sharper, hairline accent
          ════════════════════════════════════════ */}
      <div
        onClick={goPerf}
        className="relative overflow-hidden rounded-md p-4 lg:p-6 bg-surface-raised border border-white/10 hover:border-line/30 transition-all mb-4 cursor-pointer"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-3">
          <div>
            <h3 className="text-text-primary font-semibold text-base lg:text-lg mb-1 tracking-tight">
              Risk Level Analysis
            </h3>
            <p className="text-text-muted text-[10px] lg:text-xs font-mono">
              Performance breakdown by signal risk level
            </p>
          </div>
          {riskDist.length > 0 && (
            <div className="flex items-center gap-3 bg-bg-card/30 px-3 py-2 rounded-sm border border-white/5">
              {riskDist.map((rd) => (
                <div key={rd.risk_level} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: (
                        riskColors[rd.risk_level] || riskColors["Normal"]
                      ).bar,
                    }}
                  />
                  <span className="text-text-muted text-[10px] font-mono tabular-nums">
                    {riskTotal > 0
                      ? ((rd.total_signals / riskTotal) * 100).toFixed(0)
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {riskDist.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            {riskDist.map((rd) => {
              const c = riskColors[rd.risk_level] || riskColors["Normal"];
              const winPct =
                rd.closed_trades > 0
                  ? (rd.winners / rd.closed_trades) * 100
                  : 0;
              return (
                <div
                  key={rd.risk_level}
                  className={`rounded-md p-4 lg:p-5 bg-gradient-to-b ${c.bg} to-transparent border ${c.border}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                      <span className="font-bold text-sm font-mono tracking-wider uppercase text-text-primary/70">
                        {rd.risk_level}
                      </span>
                    </div>
                  </div>
                  <p className="text-3xl lg:text-4xl font-bold font-mono tabular-nums text-text-primary leading-none mb-1">
                    {rd.win_rate.toFixed(1)}%
                  </p>
                  <p className="text-text-muted text-[10px] mb-3 font-mono">
                    Win Rate
                  </p>
                  {/* Flat segmented bar */}
                  <div className="h-1.5 flex bg-bg-card/50 rounded-sm overflow-hidden mb-2">
                    <div
                      className="h-full"
                      style={{
                        width: `${winPct}%`,
                        backgroundColor: "rgb(var(--accent))",
                        opacity: 1,
                        marginRight: "1px",
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${100 - winPct}%`,
                        backgroundColor: "rgb(var(--accent))",
                        opacity: 0.3,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="font-mono tabular-nums" style={{ color: "rgb(var(--accent))", opacity: 1 }}>
                      {rd.winners?.toLocaleString()} W
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: "rgb(var(--accent))", opacity: 0.4 }}>
                      {rd.losers?.toLocaleString()} L
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-line/20 border-t-gold-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          5. FOOTER CTA — Lock SVG + consistent button gradient
          ════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 p-4 rounded-md bg-gold-primary/[0.04] border border-line/15 flex items-center gap-3">
          {/* SVG Lock icon (replace 🔒 emoji) */}
          <svg
            className="w-5 h-5 text-gold-primary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <p className="text-text-secondary text-xs lg:text-sm leading-relaxed">
            <span className="text-text-primary font-semibold">
              Every trade on record.
            </span>{" "}
            All{" "}
            <span className="font-mono text-text-primary">
              {stats ? totalSignals.toLocaleString() : "..."}
            </span>{" "}
            signals publicly verifiable — no edits, no deletions.
          </p>
        </div>
        <button
          onClick={goPerf}
          className="group relative px-6 py-3.5 rounded-md font-semibold text-sm transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2.5 flex-shrink-0 shadow-[0_4px_14px_rgba(212,168,83,0.25)] hover:shadow-[0_6px_18px_rgba(212,168,83,0.35)]"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
            color: "rgb(var(--surface))",
          }}
        >
          <span className="tracking-wide">View Full Analytics</span>
          <svg
            className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Coins flying out from phone (Hero Section)
// ════════════════════════════════════════
const PhoneFlyingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers.slice(0, 20);

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % allCoins.length);
    }, 3500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, "").replace(/^3A/, "") || "???";
  const labelText = item?.type ? `${item.type} Top Gainer` : "Top Gainer";

  return (
    <div
      key={currentIdx}
      className="absolute z-40 pointer-events-none"
      style={{
        top: "50%",
        left: "50%",
        animation: "flyOutLeftAnim 3.5s ease-out both",
      }}
    >
      <div
        className="flex flex-col gap-1 px-4 py-2.5 rounded-2xl border border-line/30"
        style={{
          background: "rgba(10,5,6,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.6), 0 0 15px rgba(212,168,83,0.15)",
        }}
      >
        <div className="flex items-center gap-2">
          <CoinLogo pair={item.pair} size={20} />
          <span className="text-text-primary text-sm font-bold">{symbol}</span>
          <span className="text-green-400 text-sm font-bold font-mono">
            +{item.gain_pct?.toFixed(1)}%
          </span>
        </div>
        <span className="text-gold-primary/70 text-[9px] font-mono tracking-widest uppercase text-left mt-1 block">
          {labelText}
        </span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// LANDING PAGE MAIN COMPONENT
// ════════════════════════════════════════
const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const [performanceData, setPerformanceData] = useState(null);
  const [topGainers, setTopGainers] = useState([]);

  // Capture ?ref= dari URL → simpan localStorage TTL 7 hari
  useEffect(() => {
    saveRefFromURL();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(
          "/api/v1/signals/analyze?time_range=all&trend_mode=weekly",
          { headers },
        );
        if (res.ok) setPerformanceData(await res.json());
      } catch (e) {
        console.warn("Stats fetch failed:", e);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchTopGainers = async () => {
      try {
        const [resDaily, resWeekly] = await Promise.all([
          fetch("/api/v1/signals/top-performers?limit=10&days=1"),
          fetch("/api/v1/signals/top-performers?limit=10&days=7"),
        ]);

        let daily = [];
        let weekly = [];

        if (resDaily.ok) {
          const dataDaily = await resDaily.json();
          daily = (dataDaily?.top_gainers || []).map((item) => ({
            ...item,
            type: "Daily",
          }));
        }

        if (resWeekly.ok) {
          const dataWeekly = await resWeekly.json();
          weekly = (dataWeekly?.top_gainers || []).map((item) => ({
            ...item,
            type: "Weekly",
          }));
        }

        const combined = [];
        const maxLength = Math.max(daily.length, weekly.length);
        for (let i = 0; i < maxLength; i++) {
          if (daily[i]) combined.push(daily[i]);
          if (weekly[i]) combined.push(weekly[i]);
        }

        setTopGainers(combined);
      } catch (e) {
        console.warn("Top gainers fetch failed:", e);
      }
    };
    fetchTopGainers();
  }, []);

  const goTerminal = () => navigate("/terminal");
  const goLogin = () => navigate("/login");
  const goRegister = () => navigate("/register");
  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stats = performanceData?.stats;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary relative pb-0 overflow-x-hidden">
      <Seo
        title="LuxQuant Terminal (legacy landing)"
        description="Legacy LuxQuant landing page. The primary product experience lives at luxquant.tw."
        path="/v1"
        noindex
      />
      {/* GLOBAL ANIMATION STYLES */}
      <style>{`
        @keyframes flyOutRightAnim {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          20% { opacity: 1; transform: translate(40px, -40px) scale(0.9); }
          80% { opacity: 1; transform: translate(120px, -80px) scale(0.9); }
          100% { opacity: 0; transform: translate(140px, -100px) scale(0.8); }
        }
        
        @keyframes flyOutLeftAnim {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          20% { opacity: 1; transform: translate(-60px, -40px) scale(0.9); }
          80% { opacity: 1; transform: translate(-140px, -80px) scale(0.9); }
          100% { opacity: 0; transform: translate(-160px, -100px) scale(0.8); }
        }

        @media (min-width: 640px) {
          @keyframes flyOutRightAnim {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
            20% { opacity: 1; transform: translate(60px, -60px) scale(1.05); }
            80% { opacity: 1; transform: translate(160px, -100px) scale(1); }
            100% { opacity: 0; transform: translate(190px, -120px) scale(0.9); }
          }
          @keyframes flyOutLeftAnim {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
            20% { opacity: 1; transform: translate(-100px, -60px) scale(1.05); }
            80% { opacity: 1; transform: translate(-200px, -100px) scale(1); }
            100% { opacity: 0; transform: translate(-230px, -120px) scale(0.9); }
          }
        }
      `}</style>

      <div className="luxury-bg" />
      <TickerBar />

      <header
        className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? "bg-surface/85 backdrop-blur-xl border-b border-line/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]" : "bg-transparent"}`}
      >
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <div
              className="flex-1 flex items-center gap-2.5 cursor-pointer group"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="relative overflow-hidden rounded-md">
                <img
                  src="/logo.png"
                  alt="LuxQuant"
                  className="w-8 h-8 lg:w-10 lg:h-10 object-cover group-hover:opacity-80 transition-opacity duration-300"
                />
              </div>
              <h1 className="font-display text-lg lg:text-xl font-bold text-text-primary tracking-wide group-hover:text-gold-primary transition-colors duration-300">
                LuxQuant
              </h1>
            </div>

            <nav className="hidden lg:flex flex-1 justify-center items-center gap-8">
              {[
                ["Home", "hero"],
                ["Terminal", "features"],
                ["Architecture", "how-it-works"],
                ["Performance", "performance-top"],
                ["FAQ", "faq"],
              ].map(([label, id]) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="text-text-primary/60 hover:text-text-primary text-sm font-medium tracking-wide transition-colors relative group py-2"
                >
                  {label}
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-gradient-to-r from-transparent via-gold-primary to-transparent transition-all duration-500 group-hover:w-[80%] opacity-0 group-hover:opacity-100"></span>
                </button>
              ))}
            </nav>

            <div className="hidden lg:flex flex-1 justify-end items-center">
              <button
                onClick={isAuthenticated ? goTerminal : goLogin}
                className="group relative px-6 py-2.5 rounded-md font-semibold transition-all hover:-translate-y-0.5 flex items-center gap-2 shadow-[0_4px_14px_rgba(212,168,83,0.2)] hover:shadow-[0_6px_18px_rgba(212,168,83,0.3)]"
                style={{
                  background:
                    "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                  color: "rgb(var(--surface))",
                }}
              >
                <span className="uppercase tracking-widest text-[10px] lg:text-xs">
                  Open Platform
                </span>
                <svg
                  className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 flex justify-end lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-text-primary/70 hover:text-text-primary focus:outline-none"
              >
                <div className="w-5 h-4 flex flex-col justify-between">
                  <span
                    className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileMenuOpen ? "rotate-45 translate-y-[7px] text-gold-primary" : ""}`}
                  />
                  <span
                    className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${mobileMenuOpen ? "opacity-0" : ""}`}
                  />
                  <span
                    className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileMenuOpen ? "-rotate-45 -translate-y-[7px] text-gold-primary" : ""}`}
                  />
                </div>
              </button>
            </div>
          </div>
        </div>

        <div
          className={`lg:hidden absolute top-full left-0 w-full bg-surface/95 backdrop-blur-3xl overflow-hidden transition-all duration-500 ease-in-out ${mobileMenuOpen ? "max-h-[400px] opacity-100 border-b border-line/20 shadow-2xl" : "max-h-0 opacity-0"}`}
        >
          <div className="px-6 py-6 space-y-2">
            {[
              ["Home", "hero"],
              ["Terminal", "features"],
              ["Architecture", "how-it-works"],
              ["Performance", "performance-top"],
              ["FAQ", "faq"],
            ].map(([label, id]) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="block w-full text-left text-text-primary/70 hover:text-gold-primary hover:bg-white/[0.03] px-4 py-3 rounded-xl text-sm font-medium tracking-wide transition-colors"
              >
                {label}
              </button>
            ))}
            <div className="pt-4 mt-2 border-t border-white/5">
              <button
                onClick={isAuthenticated ? goTerminal : goLogin}
                className="w-full py-3.5 rounded-xl font-bold text-xs text-center uppercase tracking-widest flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(212,168,83,0.15)]"
                style={{
                  background: "linear-gradient(to right, #d4a853, #8b6914)",
                  color: "rgb(var(--surface))",
                }}
              >
                Open Platform
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════
          HERO SECTION (Algorithmic Focus + Multi-Device)
      ════════════════════════════════════════ */}
      <section
        id="hero"
        className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-12 lg:pt-32 xl:pt-40 pb-16 lg:pb-20 overflow-visible"
      >
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] pointer-events-none -z-10">
          <div
            className="absolute inset-0 bg-gold-primary/[0.025] rounded-full blur-[160px]"
            style={{ animation: "heroGlowPulse 8s ease-in-out infinite" }}
          />
        </div>

        {/* 👇 FIX: gap-12 diubah jadi gap-2 untuk mobile 👇 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-8 items-center relative z-10">
          <div className="relative z-20 flex flex-col items-center text-center lg:items-start lg:text-left">
            {/* Section Label — clean, no number */}
            <div
              className="flex items-center gap-3 mb-6 lg:mb-8 self-center lg:self-start"
              style={{ animation: "heroCardFadeIn 0.8s ease-out 0.1s both" }}
            >
              <span className="h-px w-8 bg-gold-primary/40" />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
                The Quantitative Terminal
              </span>
              <span className="h-px w-8 bg-gold-primary/40" />
            </div>

            <h1
              className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] xl:text-[4.5rem] font-bold text-text-primary leading-[1.1] lg:leading-[1.02] tracking-tight mb-5 px-2 sm:px-0"
              style={{ animation: "heroCardFadeIn 0.8s ease-out 0.2s both" }}
            >
              An{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark">
                Algorithm
              </span>
              <br />
              Built to Outsmart
              <br />
              The Market.
            </h1>

            {/* 👇 FIX: mb-8 diubah jadi mb-2 khusus mobile 👇 */}
            <p
              className="text-text-primary/75 font-light text-[0.9rem] sm:text-base lg:text-[1.05rem] leading-relaxed mb-2 lg:mb-10 w-full max-w-[95%] sm:max-w-md lg:max-w-xl mx-auto lg:mx-0 px-2 lg:px-0"
              style={{ animation: "heroCardFadeIn 0.8s ease-out 0.35s both" }}
            >
              Our algorithm runs{" "}
              <span className="text-text-primary font-medium">24/7</span> — scanning
              price action, derivatives flow, on-chain whale movements, and
              order book liquidity to deliver precision projection and strict
              risk management.
              <br />
              <br />
              Complemented by an{" "}
              <span className="text-text-primary font-medium">
                AI market researcher
              </span>{" "}
              that synthesizes sentiment and macro events into one clear
              verdict.
            </p>

            <div
              className="hidden lg:flex items-center gap-3 mb-12"
              style={{ animation: "heroCardFadeIn 0.8s ease-out 0.45s both" }}
            >
              {/* Primary CTA — subtle gradient, lively but modern */}
              <button
                onClick={isAuthenticated ? goTerminal : goLogin}
                className="group relative px-7 py-3.5 rounded-md font-semibold text-sm transition-all hover:-translate-y-0.5 flex items-center gap-2.5 shadow-[0_4px_14px_rgba(212,168,83,0.25)] hover:shadow-[0_6px_18px_rgba(212,168,83,0.35)]"
                style={{
                  background:
                    "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                  color: "rgb(var(--surface))",
                }}
              >
                <span className="tracking-wide">Open Terminal</span>
                <svg
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </button>

              {/* Ghost CTA — outline */}
              <button
                onClick={() => scrollTo("performance-top")}
                className="group px-6 py-3.5 rounded-md font-semibold text-sm transition-all hover:-translate-y-0.5 flex items-center gap-2.5 text-text-primary/80 hover:text-text-primary border border-white/10 hover:border-white/25 hover:bg-white/[0.03]"
              >
                <span className="tracking-wide">View Performance</span>
                <svg
                  className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* 👇 FIX: pt-4 dihapus untuk mobile 👇 */}
          <div
            className="flex flex-col items-center justify-center relative w-full pt-0 lg:pt-0"
            style={{ minHeight: "380px" }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-gold-primary/20 to-[#8b1a1a]/10 blur-[80px] rounded-full mix-blend-screen pointer-events-none z-0" />

            <div className="relative w-full max-w-[320px] sm:max-w-[450px] lg:max-w-full xl:max-w-[650px] mx-auto mt-2 lg:mt-0">
              <div
                style={{
                  animation: "floatPhone 7s ease-in-out infinite",
                  transform: "rotateY(-12deg) rotateX(4deg)",
                  transformStyle: "preserve-3d",
                }}
                className="w-full relative z-10"
              >
                <div className="relative w-full aspect-[16/10] bg-surface-raised rounded-t-xl lg:rounded-t-[2rem] border-t-[4px] border-l-[4px] border-r-[4px] lg:border-t-[8px] lg:border-l-[8px] lg:border-r-[8px] border-surface-hover overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(212,168,83,0.15)]">
                  <div className="absolute inset-0 border border-black rounded-t-lg lg:rounded-t-3xl overflow-hidden bg-bg-primary">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[12%] h-[10px] lg:h-[18px] bg-surface-raised rounded-b-sm lg:rounded-b-md z-30 flex justify-center items-center">
                      <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-black border border-white/10" />
                    </div>
                    <img
                      src="/mockups/hero-mac-dashboard.png"
                      alt="Dashboard Preview"
                      className="w-full h-full object-cover object-top opacity-95"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface -z-10">
                      <img
                        src="/logo.png"
                        alt=""
                        className="w-8 h-8 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl mb-2 lg:mb-3 opacity-30"
                        onError={(e) => (e.target.style.display = "none")}
                      />
                    </div>
                  </div>
                </div>
                <div className="relative w-[104%] -left-[2%] h-1.5 lg:h-3 bg-gradient-to-b from-[#4a4a4a] to-surface-raised rounded-b-sm lg:rounded-b-lg border-b border-white/10 flex justify-center shadow-2xl z-20">
                  <div className="w-[15%] h-[1px] lg:h-1 bg-surface-hover rounded-b-sm" />
                </div>
              </div>

              <div className="absolute -bottom-4 -right-2 sm:-bottom-8 lg:-bottom-12 sm:-right-4 lg:-right-8 z-30 flex-shrink-0 w-[120px] sm:w-[160px] lg:w-[200px] xl:w-[220px] aspect-[9/19.5]">
                <div
                  style={{ animation: "floatPhone 5s ease-in-out infinite 1s" }}
                  className="w-full h-full relative group"
                >
                  <div className="absolute inset-0 bg-black rounded-[1.8rem] lg:rounded-[2.8rem] border-[4px] lg:border-[6px] border-surface-hover overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(212,168,83,0.3)]">
                    <div className="absolute top-0 inset-x-0 z-30">
                      <div className="w-[35%] h-[12px] lg:h-[20px] bg-black mx-auto rounded-b-lg lg:rounded-b-2xl" />
                    </div>
                    <div className="absolute inset-[2px] rounded-[1.5rem] lg:rounded-[2.4rem] overflow-hidden bg-bg-primary">
                      <img
                        src="/mockup-hp.png"
                        alt="LuxQuant Mobile"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface -z-10">
                        <img
                          src="/logo.png"
                          alt=""
                          className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl mb-2 opacity-40"
                          onError={(e) => (e.target.style.display = "none")}
                        />
                      </div>
                    </div>
                    <div className="absolute bottom-[3px] lg:bottom-[5px] inset-x-0 z-30 flex justify-center">
                      <div className="w-[35%] h-[3px] lg:h-[4px] bg-white/20 rounded-full" />
                    </div>
                  </div>

                  <div className="block">
                    <PhoneFlyingCoins gainers={topGainers} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          GLOBAL NETWORK SECTION BUATANMU
      ════════════════════════════════════════ */}
      <GlobalNetworkSection />

      {/* ════════════════════════════════════════
          FITUR SLIDER BARU: MAC & iPHONE
      ════════════════════════════════════════ */}
      <FeatureSliderSection />

      {/* ════════════════════════════════════════
          RECENT WINNER CAPTURES
      ════════════════════════════════════════ */}
      <section
        id="performance-top"
        className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 pt-12 mt-4"
      >
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[80%] h-40 bg-gold-primary/10 blur-[120px] pointer-events-none rounded-full" />
        <div className="text-center mb-8 relative z-10">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
              Live Track Record
            </span>
            <span className="h-px w-8 bg-gold-primary/40" />
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-text-primary mb-6 tracking-tight">
            Recent Winner{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">
              Captures
            </span>
          </h2>
          <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto leading-relaxed">
            Witness the algorithmic edge. Here are the most recent setups
            successfully identified and signaled by our quantitative engine{" "}
            <span className="text-text-primary font-medium">
              with massive upside potential
            </span>
            .
          </p>
        </div>
        <div className="relative mt-2">
          <div className="absolute -inset-4 bg-gradient-to-b from-gold-primary/5 to-transparent rounded-3xl blur-md -z-10" />
          <TopPerformers />
        </div>
        <div className="mt-8 flex flex-row items-center justify-center gap-2 text-xs lg:text-sm text-text-muted">
          <svg
            className="w-3.5 h-3.5 text-gold-primary/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>
            <span className="text-gold-primary/90 font-medium">Tip:</span> Click
            any coin to view its original signal & results.
          </span>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SYSTEM ARCHITECTURE (PCB / PIPELINE)
      ════════════════════════════════════════ */}
      <section
        id="how-it-works"
        className="relative z-10 w-full px-4 lg:px-8 pb-20 lg:pb-32 mt-12 lg:mt-20"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[600px] bg-gold-primary/[0.03] rounded-[100%] blur-[120px] pointer-events-none -z-10" />
        <div className="text-center mb-12 lg:mb-20 relative z-10">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
              System Pipeline
            </span>
            <span className="h-px w-8 bg-gold-primary/40" />
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-text-primary mb-4 tracking-tight">
            Quantitative{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">
              Pipeline
            </span>
          </h2>
          <p className="text-text-secondary text-xs lg:text-sm max-w-2xl mx-auto font-mono bg-black/40 py-2 px-4 rounded-md border border-white/5 inline-block">
            // RAW_DATA <span className="text-gold-primary mx-1">→</span>{" "}
            SANITIZATION <span className="text-gold-primary mx-1">→</span>{" "}
            ALPHA_MODEL <span className="text-gold-primary mx-1">→</span>{" "}
            API_GATEWAY
          </p>
        </div>

        {/* DESKTOP LAYOUT */}
        <div className="hidden lg:flex items-center justify-center max-w-[1200px] mx-auto w-full relative z-10">
          <div className="flex flex-col gap-3 w-[220px] xl:w-[260px] flex-shrink-0 z-20">
            {[
              {
                id: "0x1",
                title: "ORDER BOOK DEPTH",
                desc: "Bid/Ask liquidity tracking",
              },
              {
                id: "0x2",
                title: "ON-CHAIN METRICS",
                desc: "Whale transfers & Netflows",
              },
              {
                id: "0x3",
                title: "VOLATILITY INDEX",
                desc: "ATR & Bollinger bandwidth",
              },
              {
                id: "0x4",
                title: "FUNDING RATES",
                desc: "Perpetual swap sentiment",
              },
            ].map((node, i) => (
              <div
                key={i}
                className="group bg-surface-raised backdrop-blur-md border border-white/5 hover:border-line/30 p-4 rounded-md transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold-primary/20 group-hover:bg-gold-primary transition-colors" />
                <span className="text-gold-primary/60 font-mono text-[9px] mb-1 block">
                  {node.id}
                </span>
                <h4 className="text-text-primary text-[11px] font-bold tracking-wider mb-1 uppercase">
                  {node.title}
                </h4>
                <p className="text-text-muted text-[10px] font-mono leading-tight">
                  {node.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="flex-1 h-px bg-gradient-to-r from-gold-primary/20 to-transparent relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div
              className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-right 2s linear infinite" }}
            />
          </div>

          <div className="w-[120px] xl:w-[140px] bg-surface border border-white/10 rounded-md flex flex-col items-center justify-center p-4 relative z-20 flex-shrink-0 hover:-translate-y-0.5 transition-transform">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <svg
              className="w-6 h-6 text-text-primary/50 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <p className="text-text-primary text-[10px] xl:text-xs font-bold tracking-widest text-center uppercase">
              Data
              <br />
              Filter
            </p>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div
              className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-right 2s linear infinite 0.5s" }}
            />
          </div>

          <div className="relative flex items-center justify-center flex-shrink-0 z-20 mx-2">
            {/* Static accent ring (no spin, just visual frame) */}
            <div className="absolute w-[220px] h-[220px] xl:w-[260px] xl:h-[260px] rounded-md border border-white/[0.04]" />
            <div className="absolute w-[180px] h-[180px] xl:w-[210px] xl:h-[210px] rounded-md border border-line/10" />

            {/* Core engine box — pulse + scanline retained */}
            <div
              className="relative w-40 h-40 xl:w-48 xl:h-48 bg-surface-raised rounded-md border-[1.5px] border-white/10 flex flex-col items-center justify-center overflow-hidden"
              style={{ animation: "core-pulse 4s ease-in-out infinite" }}
            >
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
              <div
                className="absolute inset-0 bg-gradient-to-b from-transparent via-gold-primary/10 to-transparent w-full h-[20%]"
                style={{ animation: "scanline 3s linear infinite" }}
              />
              <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-md border border-line/30 flex items-center justify-center mb-3 bg-gold-primary/[0.05]">
                <svg
                  className="w-6 h-6 xl:w-7 xl:h-7 text-gold-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    strokeWidth="1.5"
                    d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                  />
                </svg>
              </div>
              <h3 className="text-text-primary font-mono font-bold tracking-widest text-[10px] xl:text-xs">
                PREDICTIVE ALPHA
              </h3>
              <p className="text-gold-primary/60 font-mono text-[7px] xl:text-[8px] mt-1 uppercase tracking-[0.2em]">
                Quantum Engine
              </p>
            </div>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div
              className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-right 2s linear infinite 1s" }}
            />
          </div>

          <div className="w-[120px] xl:w-[140px] bg-surface border border-white/10 rounded-md flex flex-col items-center justify-center p-4 relative z-20 flex-shrink-0 hover:-translate-y-0.5 transition-transform">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />
            <svg
              className="w-6 h-6 text-gold-primary/70 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-text-primary text-[10px] xl:text-xs font-bold tracking-widest text-center uppercase">
              API
              <br />
              Gateway
            </p>
            <p className="text-text-muted text-[7px] xl:text-[8px] font-mono mt-1 text-center">
              Payload Formatter
            </p>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div
              className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-right 2s linear infinite 1.5s" }}
            />
          </div>

          <div className="relative w-[240px] xl:w-[280px] flex-shrink-0 z-20">
            <div className="bg-surface-raised rounded-md border border-line/20 p-5 relative overflow-hidden">
              {/* Subtle hairline highlight on top */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                  <span className="text-text-primary font-mono text-[10px] xl:text-xs font-bold tracking-widest">
                    WEB APP READY
                  </span>
                </div>
                <span className="text-green-400 font-mono text-[8px] bg-green-400/10 px-1.5 py-0.5 rounded-sm">
                  SYNCED
                </span>
              </div>
              <div className="space-y-3 font-mono">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">
                      Payload Status
                    </p>
                    <p className="text-text-primary text-[10px]">Formatted JSON</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">200 OK</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">
                      Potential Trade
                    </p>
                    <p className="text-text-primary text-[10px]">Entry & TP Matrix</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">Pushed</span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">
                      Dashboard Render
                    </p>
                    <p className="text-text-primary text-[10px]">LuxQuant Platform</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE LAYOUT */}
        <div className="flex lg:hidden flex-col items-center w-full relative z-10">
          <div className="grid grid-cols-2 gap-3 w-full max-w-[320px] relative z-20">
            {[
              { id: "0x1", title: "ORDER BOOK", val: "LIQUIDITY" },
              { id: "0x2", title: "ON-CHAIN", val: "WHALES" },
              { id: "0x3", title: "VOLATILITY", val: "ATR calc" },
              { id: "0x4", title: "FUNDING", val: "SENTIMENT" },
            ].map((node, i) => (
              <div
                key={i}
                className="bg-surface-raised border border-white/10 rounded-lg p-3 text-center shadow-lg"
              >
                <span className="text-gold-primary/60 font-mono text-[7px] mb-1 block">
                  {node.id}
                </span>
                <h4 className="text-text-primary text-[9px] font-bold tracking-wider mb-1 uppercase">
                  {node.title}
                </h4>
                <p className="text-text-muted text-[8px] font-mono leading-tight">
                  {node.val}
                </p>
              </div>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div
              className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-down 1.5s linear infinite" }}
            />
          </div>

          <div className="w-[160px] bg-surface border border-white/10 rounded-md flex flex-col items-center justify-center p-3 relative z-20">
            <svg
              className="w-5 h-5 text-text-primary/50 mb-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <p className="text-text-primary text-[10px] font-bold tracking-widest text-center uppercase">
              Data Filter
            </p>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div
              className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{
                animation: "data-stream-down 1.5s linear infinite 0.5s",
              }}
            />
          </div>

          <div className="relative w-48 h-48 flex items-center justify-center z-20 my-4">
            <div className="absolute w-[200px] h-[200px] rounded-md border border-line/10" />
            <div
              className="relative w-32 h-32 bg-surface-raised rounded-md border border-white/20 flex flex-col items-center justify-center"
              style={{ animation: "core-pulse 4s ease-in-out infinite" }}
            >
              <svg
                className="w-6 h-6 text-gold-primary mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  strokeWidth="1.5"
                  d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                />
              </svg>
              <h3 className="text-text-primary font-mono font-bold tracking-widest text-[9px] text-center">
                PREDICTIVE
                <br />
                ALPHA
              </h3>
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div
              className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{ animation: "data-stream-down 1.5s linear infinite 1s" }}
            />
          </div>

          <div className="w-[160px] bg-surface border border-white/10 rounded-md flex items-center justify-center gap-3 p-3 relative z-20">
            <svg
              className="w-5 h-5 text-gold-primary/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div className="text-left">
              <p className="text-text-primary text-[10px] font-bold tracking-widest uppercase">
                API Gateway
              </p>
              <p className="text-text-muted text-[7px] font-mono">
                Payload Format
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div
              className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]"
              style={{
                animation: "data-stream-down 1.5s linear infinite 1.5s",
              }}
            />
          </div>

          <div className="bg-surface-raised rounded-md border border-line/20 p-4 w-full max-w-[320px] relative z-20 overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                <span className="text-text-primary font-mono text-[10px] font-bold tracking-widest">
                  WEB APP READY
                </span>
              </div>
              <span className="text-green-400 font-mono text-[8px] bg-green-400/10 px-1.5 py-0.5 rounded-sm">
                SYNCED
              </span>
            </div>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-text-muted text-[8px] uppercase tracking-wider">
                    Potential Trade
                  </p>
                  <p className="text-text-primary text-[10px]">Entry & TP Matrix</p>
                </div>
                <span className="text-gold-primary text-[9px]">
                  Pushed to UI
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          PERFORMANCE STATS
      ════════════════════════════════════════ */}
      <section
        id="performance"
        className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 mt-12"
      >
        <LivePerformanceStats data={performanceData} />
      </section>

      {/* ════════════════════════════════════════
          TESTIMONIALS
      ════════════════════════════════════════ */}
      <TestimonialsCarousel />

      {/* ════════════════════════════════════════
          FAQ
      ════════════════════════════════════════ */}
      <section
        id="faq"
        className="relative z-10 max-w-4xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24"
      >
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-text-primary mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-text-secondary text-lg">
            Everything you need to know about LuxQuant Algorithm.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {FAQ_DATA.map((item, index) => (
            <FAQItem
              key={index}
              q={item.q}
              a={item.a}
              isOpen={openFaq === index}
              onClick={() => setOpenFaq(openFaq === index ? null : index)}
            />
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          TELEGRAM CTA
      ════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <TelegramPromo gainers={topGainers} />
      </section>


            {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      {/* ════════════════════════════════════════
          FOOTER (REVISI FINAL)
      ════════════════════════════════════════ */}
      <footer className="relative z-10 bg-bg-primary overflow-hidden">
        {/* Ambient gold glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gold-primary/[0.04] blur-[160px] rounded-full pointer-events-none" />
        
        {/* Top hairline */}
        <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

        {/* MAIN GRID */}
        <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-10 lg:pt-12 pb-8">
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10 mb-10">
            
            {/* Brand column (kiri) */}
            <div className="col-span-2 lg:col-span-4">
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/logo.png" alt="LuxQuant" className="w-9 h-9 rounded-md" />
                <div>
                  <p className="font-display text-base font-bold text-text-primary tracking-wide leading-none mb-0.5">
                    LuxQuant
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold-primary/80">
                    Terminal
                  </p>
                </div>
              </div>
            </div>

            {/* Navigate column */}
            <div className="col-span-1 lg:col-span-2 lg:col-start-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 mb-5 flex items-center gap-2">
                <span className="h-px w-4 bg-gold-primary/40" />
                Navigate
              </p>
              <ul className="space-y-3">
                {[
                  ["Home", "hero"],
                  ["Terminal", "features"],
                  ["Architecture", "how-it-works"],
                  ["Performance", "performance-top"],
                  ["FAQ", "faq"],
                ].map(([label, id]) => (
                  <li key={id}>
                    <button
                      onClick={() => scrollTo(id)}
                      className="text-text-muted hover:text-text-primary text-sm font-mono transition-colors group inline-flex items-center gap-2"
                    >
                      <span className="w-1 h-1 rounded-full bg-gold-primary/30 group-hover:bg-gold-primary transition-colors" />
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources column */}
            <div className="col-span-1 lg:col-span-2 lg:col-start-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 mb-5 flex items-center gap-2">
                <span className="h-px w-4 bg-gold-primary/40" />
                Resources
              </p>
              <ul className="space-y-3">
                {[
                  { label: "Open Terminal", action: () => (isAuthenticated ? goTerminal() : goLogin()) },
                  { label: "View Performance", action: () => scrollTo("performance-top") },
                  { label: "System Pipeline", action: () => scrollTo("how-it-works") },
                  { label: "Try Free Tier", href: "https://t.me/LuxQuantSignal" },
                ].map((item, i) => (
                  <li key={i}>
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-muted hover:text-text-primary text-sm font-mono transition-colors group inline-flex items-center gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-gold-primary/30 group-hover:bg-gold-primary transition-colors" />
                        {item.label}
                      </a>
                    ) : (
                      <button
                        onClick={item.action}
                        className="text-text-muted hover:text-text-primary text-sm font-mono transition-colors group inline-flex items-center gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-gold-primary/30 group-hover:bg-gold-primary transition-colors" />
                        {item.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect column — DIPINDAH KE PALING KANAN */}
            <div className="col-span-2 lg:col-span-3 lg:col-start-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 mb-5 flex items-center gap-2">
                <span className="h-px w-4 bg-gold-primary/40" />
                Join the Network
              </p>
              <div className="space-y-2">
                {/* Telegram */}
                <a
                  href="https://t.me/LuxQuantSignal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 p-3 rounded-md bg-surface-raised border border-white/[0.06] hover:border-line/30 transition-all"
                >
                  <div className="w-9 h-9 rounded-md bg-[#229ED9]/10 border border-[#229ED9]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#229ED9]/20 transition-colors">
                    <svg className="w-4 h-4 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-semibold leading-none mb-1">Telegram</p>
                    <p className="text-text-muted text-[11px] font-mono truncate">@LuxQuantSignal</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-text-primary/30 group-hover:text-gold-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>

                {/* Twitter / X */}
                <a
                  href="https://x.com/luxquantcrypto"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 p-3 rounded-md bg-surface-raised border border-white/[0.06] hover:border-line/30 transition-all"
                >
                  <div className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                    <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-semibold leading-none mb-1">Twitter / X</p>
                    <p className="text-text-muted text-[11px] font-mono truncate">@luxquantcrypto</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-text-primary/30 group-hover:text-gold-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://instagram.com/luxquant.tw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 p-3 rounded-md bg-surface-raised border border-white/[0.06] hover:border-line/30 transition-all"
                >
                  <div className="w-9 h-9 rounded-md bg-gradient-to-br from-[#833AB4]/20 via-[#FD1D1D]/20 to-warning/20 border border-[#FD1D1D]/20 flex items-center justify-center flex-shrink-0 group-hover:from-[#833AB4]/30 group-hover:via-[#FD1D1D]/30 group-hover:to-warning/30 transition-colors">
                    <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-semibold leading-none mb-1">Instagram</p>
                    <p className="text-text-muted text-[11px] font-mono truncate">@luxquant.tw</p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-text-primary/30 group-hover:text-gold-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Hairline divider */}
          <div className="h-px bg-white/[0.06] mb-6" />

          {/* Bottom row: copyright + disclaimer */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-text-muted text-[11px] font-mono">
              <span>© {new Date().getFullYear()} LuxQuant</span>
              <span className="text-text-primary/20">·</span>
              <span className="flex items-center gap-1">
                Built in Taiwan <span className="text-sm leading-none">🇹🇼</span>
              </span>
              <span className="text-text-primary/20 hidden sm:inline">·</span>
              <span className="hidden sm:inline">All rights reserved</span>
            </div>
          </div>
        </div>
      </footer>

           
      {/* FIX: BALOK KOSONG KHUSUS MOBILE AGAR BISA SCROLL MENTOK KE BAWAH */}
      <div className="h-[120px] w-full bg-bg-primary lg:hidden" />

      {/* ════════════════════════════════════════
          STICKY MOBILE CTA
      ════════════════════════════════════════ */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-bg-primary/95 backdrop-blur-xl border-t border-line/15 z-[100]">
        <button
          onClick={isAuthenticated ? goTerminal : goLogin}
          className="w-full py-3.5 rounded-md font-semibold text-sm flex justify-center items-center gap-2 uppercase tracking-wide transition-transform active:scale-[0.98] shadow-[0_4px_14px_rgba(212,168,83,0.25)]"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
            color: "rgb(var(--surface))",
          }}
        >
          Open Terminal
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
