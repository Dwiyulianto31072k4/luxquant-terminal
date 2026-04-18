// src/App.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — URL-Based Routing v3 + Lazy Loading
// ════════════════════════════════════════════════════════════════
//
//   /                    → Landing Page                 [PUBLIC]
//   /home                → Home / Dashboard             [PUBLIC]
//   /market-pulse        → Market Pulse                 [PUBLIC]
//   /crypto-news         → Crypto News Feed             [PUBLIC]
//   /analytics           → Performance (Proof of Calls) [FREE - login]
//   /journal             → Trade Journal & Analytics    [FREE - login]
//   /referral            → Referral Program             [FREE - login]
//   /notifications       → Notifications                [FREE - login]
//   /signals             → Potential Trades             [PREMIUM]
//   /ai-arena            → AI Arena                     [PREMIUM]
//   /autotrade           → AutoTrade (exchange exec)    [PREMIUM]
//   /portfolio           → Portfolio Dashboard          [PREMIUM]
//   /bitcoin             → Bitcoin Dashboard            [PREMIUM]
//   /markets             → Markets                      [PREMIUM]
//   /watchlist            → Watchlist                    [PREMIUM]
//   /tips                → Tips & Modules               [PREMIUM]
//   /orderbook           → Order Book                   [PREMIUM]
//   /calendar            → Macro Calendar               [PREMIUM]
//   /whale               → Whale Alert                  [PREMIUM]
//   /onchain             → On-Chain Intelligence        [PREMIUM]
//   /admin               → User Management              [ADMIN]
//   /pricing             → Pricing                      [PUBLIC]
//   /payment             → Payment                      [PUBLIC]
//   /login               → Login                        [PUBLIC]
//
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ════════════════════════════════════════
// LAZY LOADED PAGES
// ════════════════════════════════════════
const OverviewPage = lazy(() => import("./components/OverviewPage"));
const SignalsPage = lazy(() => import("./components/SignalsPage"));
const BitcoinPage = lazy(() => import("./components/BitcoinPage"));
const MarketsPage = lazy(() => import("./components/MarketsPage"));
const AnalyzePage = lazy(() => import("./components/AnalyzePage"));
const WatchlistPage = lazy(() => import("./components/WatchlistPage"));
const TipsPage = lazy(() => import("./components/TipsPage"));
const UserManagementPage = lazy(() => import("./components/UserManagementPage"));
const MacroCalendarPage = lazy(() => import("./components/MacroCalendarPage"));
const WhaleAlertPage = lazy(() => import("./components/WhaleAlertPage"));
const OrderBookPage = lazy(() => import("./components/OrderBookPage"));
const AIArenaPage = lazy(() => import("./components/AIArenaPage"));
const ReferralPage = lazy(() => import("./components/ReferralPage"));
const LandingPage = lazy(() => import("./components/landing/LandingPage"));
const LoginPage = lazy(() => import("./components/auth/LoginPage"));
const GoogleCallback = lazy(() => import("./components/auth/GoogleCallback"));
const DiscordCallback = lazy(() => import("./components/auth/DiscordCallback"));
const PricingPage = lazy(() => import("./components/subscription/PricingPage"));
const PaymentPage = lazy(() => import("./components/subscription/PaymentPage"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const NotificationsPage = lazy(() => import("./components/NotificationsPage"));
const JournalPage = lazy(() => import("./components/JournalPage"));
const MarketPulsePage = lazy(() => import("./components/MarketPulsePage"));
const CryptoNewsPage = lazy(() => import("./components/CryptoNewsPage"));
const OnchainPage = lazy(() => import("./components/OnchainPage"));
const AutoTradePage = lazy(() => import("./components/AutoTradePage"));
const PortfolioPage = lazy(() => import("./components/PortfolioPage"));

// Keep these eager — always visible in AppShell
import { UserMenu } from "./components/auth";
import { PremiumModal } from "./components/subscription";
import NotificationBell from "./components/NotificationBell";

// ════════════════════════════════════════
// PAGE LOADING FALLBACK
// ════════════════════════════════════════
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
      <span className="text-text-muted text-xs font-mono">Loading...</span>
    </div>
  </div>
);

// ════════════════════════════════════════
// ACCESS CONTROL
// ════════════════════════════════════════
const LOGIN_REQUIRED = ["/signals","/analytics","/bitcoin","/markets","/watchlist","/tips","/admin","/ai-arena","/referral","/orderbook","/calendar","/whale","/notifications","/journal","/onchain","/autotrade","/portfolio"];
const PREMIUM_REQUIRED = ["/signals","/bitcoin","/markets","/watchlist","/tips","/ai-arena","/orderbook","/calendar","/whale","/onchain","/autotrade","/portfolio"];

// ════════════════════════════════════════
// ROUTE GUARDS
// ════════════════════════════════════════
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/home" replace />;
  return children;
}

function PremiumGate({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const isPremium = user && (user.role === "admin" || user.role === "premium" || user.role === "subscriber" || user.is_admin);

  useEffect(() => { if (!isPremium) setShowModal(true); }, [isPremium]);

  if (!isPremium) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold text-white mb-2">Premium Feature</h2>
          <p className="text-text-muted mb-6 max-w-md">Fitur ini hanya tersedia untuk pengguna premium. Upgrade sekarang untuk akses penuh ke semua fitur LuxQuant.</p>
          <div className="flex gap-3">
            <button onClick={() => navigate("/pricing")} className="px-6 py-2.5 rounded-xl font-semibold transition-all" style={{ background: "linear-gradient(to right, #d4a853, #8b6914)", color: "#0a0506", boxShadow: "0 0 20px rgba(212,168,83,0.3)" }}>Lihat Harga</button>
            <button onClick={() => navigate("/home")} className="px-6 py-2.5 rounded-xl font-semibold transition-colors border" style={{ color: "#d4a853", borderColor: "rgba(212,168,83,0.3)" }}>Kembali</button>
          </div>
        </div>
        <PremiumModal isOpen={showModal} onClose={() => { setShowModal(false); navigate("/home"); }} />
      </>
    );
  }
  return children;
}

// ════════════════════════════════════════
// SIDEBAR ITEM
// ════════════════════════════════════════
const SidebarItem = ({ active, onClick, label, icon, isPremium, isFreeBadge }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${active ? "text-gold-primary bg-gold-primary/10 border border-gold-primary/20" : "text-text-secondary hover:text-white bg-transparent hover:bg-white/[0.04] border border-transparent"}`}>
    <svg className={`w-5 h-5 flex-shrink-0 ${active ? "text-gold-primary" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
    <span>{label}</span>
    {isPremium && <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary/70 border border-gold-primary/20">PRO</span>}
    {isFreeBadge && <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400/70 border border-green-500/20">FREE</span>}
    {active && !isPremium && !isFreeBadge && <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full" />}
  </button>
);

// ════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════
function AppShell({ children }) {
  const { t, i18n } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const moreMenuRef = useRef(null);

  const isPremiumUser = () => user && (user.role === "admin" || user.role === "premium" || user.role === "subscriber" || user.is_admin);
  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => {
    const h = () => { if (window.innerWidth >= 1024) setMobileMenuOpen(false); };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);
  useEffect(() => {
    const h = (e) => { if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false); };
    if (moreMenuOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [moreMenuOpen]);

  const handleNav = (path) => {
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
    if (LOGIN_REQUIRED.includes(path) && !isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    if (PREMIUM_REQUIRED.includes(path) && isAuthenticated && !isPremiumUser()) {
      setShowPremiumModal(true);
      return;
    }
    navigate(path);
  };

  const navItems = [
    { path: "/home", label: t("nav.home") },
    { path: "/signals", label: t("nav.signals") },
    { path: "/autotrade", label: "AutoTrade" },
    { path: "/ai-arena", label: "AI Arena" },
    { path: "/market-pulse", label: "Pulse" },
    { path: "/crypto-news", label: "News" },
    { path: "/onchain", label: "On-Chain" },
    { path: "/bitcoin", label: t("nav.bitcoin") },
    { path: "/markets", label: t("nav.markets") },
    { path: "/journal", label: "Journal" },
  ];

  const moreMenuItems = [
    { path: "/portfolio", label: "Portfolio", icon: "💼", description: "Track PnL, equity curve & trade history" },
    { path: "/analytics", label: t("nav.analytics"), icon: "📈", description: "Performance analytics & win rate" },
    { path: "/orderbook", label: t("nav.orderbook"), icon: "📊", description: t("desc.orderbook") },
    { path: "/calendar", label: t("nav.calendar"), icon: "📅", description: t("desc.calendar") },
    { path: "/whale", label: t("nav.whale"), icon: "🐋", description: t("desc.whale") },
    { path: "/tips", label: t("nav.tips"), icon: "📚", description: t("desc.tips") },
    { path: "/watchlist", label: t("nav.watchlist"), icon: "⭐", description: t("desc.watchlist") },
    { path: "/referral", label: "Referral", icon: "🎟️", description: "Earn commissions by inviting friends" },
    ...(user?.role === "admin" ? [{ path: "/admin", label: t("nav.admin"), icon: "🛡️", description: t("desc.admin") }] : []),
  ];

  const moreHasActive = moreMenuItems.some((item) => isActive(item.path));

  const bottomNavItems = [
    { path: "/home", label: t("nav.home"), icon: <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg> },
    { path: "/autotrade", label: "Trade", icon: <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg> },
    { path: "/signals", label: t("nav.trades"), isCenter: true, icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg> },
    { path: "/bitcoin", label: t("nav.btc"), icon: <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { path: "/markets", label: t("nav.markets"), icon: <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
  ];

  return (
    <div className="min-h-screen">
      <div className="luxury-bg" />

      {/* HEADER */}
      <header className={`sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b transition-all duration-300 ${scrolled ? "border-gold-primary/15 shadow-lg shadow-black/20" : "border-gold-primary/10"}`}>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            <div className="flex items-center gap-2 lg:gap-8">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 -ml-1 text-text-secondary hover:text-white rounded-lg transition-colors" aria-label="Toggle menu">
                <div className="w-5 h-4 flex flex-col justify-between">
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${mobileMenuOpen ? "rotate-45 translate-y-[7px]" : ""}`} />
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${mobileMenuOpen ? "opacity-0 scale-x-0" : ""}`} />
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${mobileMenuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
                </div>
              </button>
              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleNav("/home")}>
                <div className="w-9 h-9 lg:w-10 lg:h-10 relative">
                  <img src="/logo.png" alt="LuxQuant" className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-105" />
                </div>
                <h1 className="font-display text-sm lg:text-lg font-semibold text-white tracking-wide leading-tight group-hover:text-gold-primary transition-colors">LuxQuant</h1>
              </div>
              <nav className="hidden lg:flex items-center gap-0.5">
                {navItems.map((item) => (
                  <button key={item.path} onClick={() => handleNav(item.path)} className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive(item.path) ? "text-gold-primary" : "text-text-secondary hover:text-white"}`}>
                    {item.label}
                    {isActive(item.path) && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gold-primary rounded-full" />}
                  </button>
                ))}
                <div className="relative" ref={moreMenuRef}>
                  <button onClick={() => setMoreMenuOpen(!moreMenuOpen)} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${moreHasActive ? "text-gold-primary" : "text-text-secondary hover:text-white"}`}>
                    <span>{t("nav.more")}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${moreMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    {moreHasActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gold-primary rounded-full" />}
                  </button>
                  {moreMenuOpen && (
                    <div className="absolute top-full left-0 mt-2 w-56 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl shadow-black/60" style={{ background: "#0d0a10", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="py-1.5">
                        {moreMenuItems.map((item) => {
                          const isPro = PREMIUM_REQUIRED.includes(item.path);
                          return (
                            <button key={item.path} onClick={() => handleNav(item.path)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${isActive(item.path) ? "bg-gold-primary/10 text-gold-primary" : "text-text-secondary hover:text-white hover:bg-white/5"}`}>
                              <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium">{item.label}</p>
                                  {isPro && !isPremiumUser() && <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-gold-primary/15 text-gold-primary/70">PRO</span>}
                                </div>
                                {item.description && <p className="text-[11px] text-text-muted mt-0.5 truncate">{item.description}</p>}
                              </div>
                              {isActive(item.path) && <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </nav>
            </div>
            <div className="flex items-center gap-1.5 lg:gap-2">
              <div className="flex items-center bg-bg-primary/80 backdrop-blur-md border border-gold-primary/20 rounded-xl p-0.5 mr-1 lg:mr-2 shadow-sm shadow-black/20">
                <div className="flex items-center justify-center px-2 text-gold-primary/70">
                  <svg className="w-3.5 h-3.5 animate-[spin_10s_linear_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="w-px h-3.5 bg-gold-primary/20 mx-0.5"></div>
                {["en", "zh"].map((lang) => (
                  <button key={lang} onClick={() => i18n.changeLanguage(lang)} className={`relative px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 overflow-hidden ${i18n.language?.startsWith(lang) ? "text-bg-primary shadow-md" : "text-text-secondary hover:text-gold-primary hover:bg-white/5"}`}>
                    {i18n.language?.startsWith(lang) && <div className="absolute inset-0 bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark" />}
                    <span className="relative z-10">{lang.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE SLIDE MENU */}
      {mobileMenuOpen && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <div className={`fixed top-14 left-0 bottom-0 w-72 z-50 bg-bg-primary/98 backdrop-blur-xl border-r border-white/[0.06] transform transition-transform duration-300 ease-out lg:hidden ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <nav className="flex-1 py-6 px-3 space-y-0.5 overflow-y-auto">
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Navigation</p>
            <SidebarItem active={isActive("/home")} onClick={() => handleNav("/home")} label={t("nav.home")} isFreeBadge
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />}
            />
            <SidebarItem active={isActive("/market-pulse")} onClick={() => handleNav("/market-pulse")} label="Market Pulse" isFreeBadge
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />}
            />
            <SidebarItem active={isActive("/crypto-news")} onClick={() => handleNav("/crypto-news")} label="Crypto News" isFreeBadge
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />}
            />
            <SidebarItem active={isActive("/onchain")} onClick={() => handleNav("/onchain")} label="On-Chain" isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />}
            />
            <SidebarItem active={isActive("/signals")} onClick={() => handleNav("/signals")} label={t("nav.signals")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />}
            />
            <SidebarItem active={isActive("/autotrade")} onClick={() => handleNav("/autotrade")} label="AutoTrade" isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />}
            />
            <SidebarItem active={isActive("/ai-arena")} onClick={() => handleNav("/ai-arena")} label="AI Arena" isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L4.2 15.3m15.6 0v1.47a2.25 2.25 0 01-1.372 2.068l-1.57.535A12.04 12.04 0 0112 19.5a12.04 12.04 0 01-4.858-.92l-1.57-.535A2.25 2.25 0 014.2 16.77V15.3m15.6 0v.75m0-1.5v.75m-15.6 0v-.75m0 1.5v-.75" />}
            />
            <SidebarItem active={isActive("/analytics")} onClick={() => handleNav("/analytics")} label={t("nav.analytics")} isFreeBadge
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-3.52 1.122h-1.5a6.023 6.023 0 01-3.52-1.122" />}
            />
            <SidebarItem active={isActive("/journal")} onClick={() => handleNav("/journal")} label="Journal" isFreeBadge
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />}
            />
            <SidebarItem active={isActive("/bitcoin")} onClick={() => handleNav("/bitcoin")} label={t("nav.bitcoin")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
            />
            <SidebarItem active={isActive("/markets")} onClick={() => handleNav("/markets")} label={t("nav.markets")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />}
            />
            <div className="my-4 mx-3 h-px bg-white/[0.05]" />
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Tools</p>
            <SidebarItem active={isActive("/portfolio")} onClick={() => handleNav("/portfolio")} label="Portfolio" isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />}
            />
            <SidebarItem active={isActive("/orderbook")} onClick={() => handleNav("/orderbook")} label={t("nav.orderbook")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M3 8h18M3 12h12M3 16h8M3 20h4" />}
            />
            <SidebarItem active={isActive("/calendar")} onClick={() => handleNav("/calendar")} label={t("nav.calendar")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />}
            />
            <SidebarItem active={isActive("/whale")} onClick={() => handleNav("/whale")} label={t("nav.whale")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738.145l-1.093.819a.89.89 0 00-.284.97l.448 1.345a1.336 1.336 0 01-.06.885l-1.334 2.668a.75.75 0 00.34 1.006l2.053.684a.75.75 0 00.588-.012l1.527-.763a.75.75 0 00.294-.235l1.092-1.638a.252.252 0 01.428.032l.603 1.072a.662.662 0 001.106.07l.926-1.159a.753.753 0 00.132-.795z" />}
            />
            <SidebarItem active={isActive("/tips")} onClick={() => handleNav("/tips")} label={t("nav.tips")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />}
            />
            <div className="my-4 mx-3 h-px bg-white/[0.05]" />
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Personal</p>
            <SidebarItem active={isActive("/watchlist")} onClick={() => handleNav("/watchlist")} label={t("nav.watchlist")} isPremium={!isPremiumUser()}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />}
            />
            <SidebarItem active={isActive("/referral")} onClick={() => handleNav("/referral")} label="Referral"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />}
            />
            {user?.role === "admin" && (
              <>
                <div className="my-4 mx-3 h-px bg-white/[0.05]" />
                <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Admin</p>
                <SidebarItem active={isActive("/admin")} onClick={() => handleNav("/admin")} label={t("nav.admin")}
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />}
                />
              </>
            )}
          </nav>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 pb-24 lg:pb-6">
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="bg-bg-primary/95 backdrop-blur-xl border-t border-gold-primary/10">
          <div className="flex items-end justify-around h-16 px-2 max-w-lg mx-auto relative">
            {bottomNavItems.map((item) => {
              const active = isActive(item.path);

              if (item.isCenter) {
                return (
                  <button key={item.path} onClick={() => handleNav(item.path)} className="relative -mt-5 flex flex-col items-center">
                    {active && (<div className="absolute -inset-1.5 rounded-[20px] bg-gold-primary/15 blur-md animate-pulse" />)}
                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${active ? 'bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark shadow-gold-primary/40 scale-105' : 'bg-bg-card border-2 border-gold-primary/30 hover:border-gold-primary/50 hover:shadow-gold-primary/10'}`}>
                      <span className={active ? 'text-bg-primary' : 'text-gold-primary'}>{item.icon}</span>
                    </div>
                    <span className={`text-[10px] font-semibold mt-1 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted'}`}>{item.label}</span>
                  </button>
                );
              }

              return (
                <button key={item.path} onClick={() => handleNav(item.path)} className="flex flex-col items-center justify-center gap-1 py-2 px-1 min-w-[52px] relative group">
                  <span className={`transition-all duration-200 ${active ? 'text-gold-primary scale-110' : 'text-text-muted group-hover:text-text-secondary'}`}>{item.icon}</span>
                  <span className={`text-[10px] font-medium transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-secondary'}`}>{item.label}</span>
                  {active && (<span className="absolute bottom-1 w-4 h-0.5 bg-gold-primary rounded-full" />)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="bg-bg-primary/95 h-safe-area-bottom" />
      </nav>

      <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
    </div>
  );
}

// ════════════════════════════════════════
// AUTH WRAPPER
// ════════════════════════════════════════
function LoginPageWrapper() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get("redirect") || "/home";
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginPage />
    </Suspense>
  );
}

// ════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Landing */}
          <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />

          {/* Auth */}
          <Route path="/login" element={<LoginPageWrapper />} />
          <Route path="/auth/google/callback" element={<Suspense fallback={<PageLoader />}><GoogleCallback /></Suspense>} />
          <Route path="/auth/discord/callback" element={<Suspense fallback={<PageLoader />}><DiscordCallback /></Suspense>} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          {/* PUBLIC */}
          <Route path="/home" element={<AppShell><OverviewPage /></AppShell>} />
          <Route path="/market-pulse" element={<AppShell><MarketPulsePage /></AppShell>} />
          <Route path="/crypto-news" element={<AppShell><CryptoNewsPage /></AppShell>} />
          <Route path="/pricing" element={<AppShell><PricingPage /></AppShell>} />
          <Route path="/payment" element={<AppShell><PaymentPage /></AppShell>} />

          {/* FREE (login required) */}
          <Route path="/analytics" element={<RequireAuth><AppShell><AnalyzePage /></AppShell></RequireAuth>} />
          <Route path="/journal" element={<RequireAuth><AppShell><JournalPage /></AppShell></RequireAuth>} />
          <Route path="/referral" element={<RequireAuth><AppShell><ReferralPage /></AppShell></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><AppShell><ProfilePage /></AppShell></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><AppShell><NotificationsPage /></AppShell></RequireAuth>} />

          {/* PREMIUM */}
          <Route path="/signals" element={<RequireAuth><AppShell><PremiumGate><SignalsPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/autotrade" element={<RequireAuth><AppShell><PremiumGate><AutoTradePage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/portfolio" element={<RequireAuth><AppShell><PremiumGate><PortfolioPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/ai-arena" element={<RequireAuth><AppShell><PremiumGate><AIArenaPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/bitcoin" element={<RequireAuth><AppShell><PremiumGate><BitcoinPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/markets" element={<RequireAuth><AppShell><PremiumGate><MarketsPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/watchlist" element={<RequireAuth><AppShell><PremiumGate><WatchlistPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/tips" element={<RequireAuth><AppShell><PremiumGate><TipsPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/orderbook" element={<RequireAuth><AppShell><PremiumGate><OrderBookPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><AppShell><PremiumGate><MacroCalendarPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/whale" element={<RequireAuth><AppShell><PremiumGate><WhaleAlertPage /></PremiumGate></AppShell></RequireAuth>} />
          <Route path="/onchain" element={<RequireAuth><AppShell><PremiumGate><OnchainPage /></PremiumGate></AppShell></RequireAuth>} />

          {/* ADMIN */}
          <Route path="/admin" element={<RequireAuth><RequireAdmin><AppShell><UserManagementPage /></AppShell></RequireAdmin></RequireAuth>} />

          {/* Backward compat */}
          <Route path="/terminal" element={<Navigate to="/home" replace />} />
          <Route path="/terminal/watchlist" element={<Navigate to="/watchlist" replace />} />
          <Route path="/terminal/referral" element={<Navigate to="/referral" replace />} />
          <Route path="/terminal/pricing" element={<Navigate to="/pricing" replace />} />
          <Route path="/terminal/payment" element={<Navigate to="/payment" replace />} />
          <Route path="/terminal/*" element={<Navigate to="/home" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
