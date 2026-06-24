// src/components/landing/v2/sections/slides/HeroSlideAlgo.jsx
// ════════════════════════════════════════════════════════════════
// SLIDE 1 — Algo/data hero, CENTERED (MEXC-style).
// Semua di tengah: headline → subcopy → signup pill, device mockup
// LuxQuant jadi visual fokus di tengah-bawah.
// (Offer chip 🎁 + tombol Get Started Free / View Performance DIHAPUS
//  — sesuai referensi MEXC/Synex: hero bersih, CTA-nya di signup pill.)
// Hanya KONTEN slide — wrapper/animasi/glow ada di HeroSlider.
// ════════════════════════════════════════════════════════════════
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import FlyingGainer from "./FlyingGainer";

const GOLD_BTN = {
  background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
  color: "#0a0506",
};

export default function HeroSlideAlgo({ onNav, gainers = [] }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const goPlatform = () => navigate(isAuthenticated ? "/home" : "/login");

  return (
    <div className="w-full flex flex-col items-center text-center">
      {/* headline */}
      <h1 className="font-display font-bold text-white tracking-tight leading-[1.05] mb-5 text-[2.7rem] sm:text-[3.6rem] lg:text-[4.6rem]">
        An{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b]">
          Algorithm
        </span>{" "}
        Built to
        <br className="hidden sm:block" /> Outsmart the Market.
      </h1>

      {/* subcopy — regular weight, muted (MEXC-style; not thin) */}
      <p className="text-white/60 font-normal text-base sm:text-lg leading-relaxed max-w-2xl mb-9">
        Our engine runs <span className="text-white font-medium">24/7</span> —
        scanning price action, derivatives flow, on-chain whale moves and
        order-book liquidity into precise signals with strict risk management.
      </p>

      {/* signup pill — white (MEXC-style) */}
      <div className="w-full max-w-md flex items-center gap-2 p-1.5 pl-5 rounded-full bg-white shadow-[0_10px_34px_rgba(0,0,0,0.4)] mb-12">
        <span className="flex-1 text-left text-[12px] sm:text-[13px] text-[#1a1411] font-mono truncate">
          Start using LuxQuant today
        </span>
        <button onClick={goPlatform} className="flex-shrink-0 px-5 py-2 rounded-full text-xs font-bold tracking-wide" style={GOLD_BTN}>
          Sign Up
        </button>
        <button
          onClick={() => navigate("/login")}
          aria-label="Continue with Google"
          className="flex-shrink-0 w-9 h-9 rounded-full bg-[#f3f3f3] border border-black/5 flex items-center justify-center hover:bg-[#e9e9e9] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.97 10.97 0 001 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
        </button>
      </div>

      {/* ── DEVICE VISUAL — static (no float) ── */}
      <div className="relative w-full max-w-3xl mx-auto">
        {/* ambient gold glow */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[80%] h-48 bg-gold-primary/[0.10] blur-[120px] rounded-full pointer-events-none" />

        {/* dashboard — FLAT panel (no laptop frame), rounded, static */}
        <div className="relative z-10">
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-[68%] h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent z-20" />
          <div className="relative rounded-xl lg:rounded-2xl overflow-hidden border border-white/[0.07] bg-bg-primary shadow-[0_30px_70px_rgba(0,0,0,0.6),0_0_40px_rgba(212,168,83,0.10)]">
            <img
              src="/mockups/hero-mac-dashboard.png"
              alt="LuxQuant Dashboard"
              className="w-full object-cover object-top"
              onError={(e) => (e.target.style.display = "none")}
            />
            <div className="absolute inset-0 -z-10 flex items-center justify-center bg-[#0a0506]">
              <img src="/logo.png" alt="" className="w-14 h-14 rounded-xl opacity-25" onError={(e) => (e.target.style.display = "none")} />
            </div>
          </div>
        </div>

        {/* phone — static realistic mockup (MEXC-style), overlap bottom-right */}
        <div className="absolute -bottom-6 right-2 sm:right-6 lg:-right-4 z-30 w-[112px] sm:w-[150px] lg:w-[180px] aspect-[9/19.5]">
          <div className="absolute inset-0 bg-black rounded-[1.7rem] lg:rounded-[2.5rem] border-[4px] lg:border-[6px] border-[#1c1c1c] overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.85),0_0_40px_rgba(212,168,83,0.16)]">
            {/* dynamic island */}
            <div className="absolute top-1.5 lg:top-2 inset-x-0 z-30 flex justify-center">
              <div className="w-[30%] h-[9px] lg:h-[15px] bg-black rounded-full" />
            </div>
            <div className="absolute inset-[2px] rounded-[1.5rem] lg:rounded-[2.1rem] overflow-hidden bg-bg-primary">
              <img src="/mockup-hp.png" alt="LuxQuant Mobile" className="w-full h-full object-cover" onError={(e) => (e.target.style.display = "none")} />
              <div className="absolute inset-0 -z-10 flex items-center justify-center bg-[#0a0506]">
                <img src="/logo.png" alt="" className="w-9 h-9 rounded-xl opacity-40" onError={(e) => (e.target.style.display = "none")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}