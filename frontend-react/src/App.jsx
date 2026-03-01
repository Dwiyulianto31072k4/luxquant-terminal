// src/App.jsx
import { useState, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import OverviewPage from "./components/OverviewPage";
import SignalsPage from "./components/SignalsPage";
import BitcoinPage from "./components/BitcoinPage";
import MarketsPage from "./components/MarketsPage";
import AnalyzePage from "./components/AnalyzePage";
import WatchlistPage from "./components/WatchlistPage";
import TipsPage from "./components/TipsPage";
import UserManagementPage from "./components/UserManagementPage";
import MacroCalendarPage from "./components/MacroCalendarPage";
import WhaleAlertPage from "./components/WhaleAlertPage";
import OrderBookPage from "./components/OrderBookPage";
import AIArenaPage from "./components/AIArenaPage";
import ReferralPage from "./components/ReferralPage";
import { LoginPage, RegisterPage, UserMenu } from "./components/auth";
import GoogleCallback from "./components/auth/GoogleCallback";
import { PricingPage, PaymentPage, PremiumModal } from "./components/subscription";

// ════════════════════════════════════════
// Sidebar Menu Item (mobile hamburger)
// ════════════════════════════════════════
const SidebarItem = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
      active
        ? "text-gold-primary bg-gold-primary/10 border border-gold-primary/20"
        : "text-text-secondary hover:text-white bg-transparent hover:bg-white/[0.04] border border-transparent"
    }`}
  >
    <svg className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold-primary' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icon}
    </svg>
    <span>{label}</span>
    {active && <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full" />}
  </button>
);

// ════════════════════════════════════════
// Main App Content
// ════════════════════════════════════════
function AppContent() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState("terminal");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const { loading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const moreMenuRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    if (error === 'google_auth_failed') {
      console.log('Google login failed');
    }
  }, [location]);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveTab("terminal");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (location.pathname === "/watchlist") setActiveTab("watchlist");
    if (location.pathname === "/referral") setActiveTab("referral");
  }, [location.pathname]);

  useEffect(() => {
    const h = (e) => setActiveTab(e.detail);
    window.addEventListener("navigate", h);
    return () => window.removeEventListener("navigate", h);
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
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    };
    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreMenuOpen]);

  const isPremiumUser = () => {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'premium' || user.role === 'subscriber' || user.is_admin;
  };

  const handleTabClick = (key) => {
    const protectedTabs = ["signals", "analytics", "bitcoin", "markets", "watchlist", "tips", "admin", "ai-arena", "referral"];
    if (protectedTabs.includes(key) && !isAuthenticated) {
      navigate("/login");
      return;
    }
    const premiumTabs = ["signals", "analytics", "bitcoin", "markets", "watchlist", "tips", "ai-arena"];
    if (premiumTabs.includes(key) && isAuthenticated && !isPremiumUser()) {
      setShowPremiumModal(true);
      setMobileMenuOpen(false);
      setMoreMenuOpen(false);
      return;
    }
    setActiveTab(key);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);

    if (key === "watchlist") navigate("/watchlist");
    else if (key === "referral") navigate("/referral");
    else navigate("/");
  };

  // ═══ DESKTOP NAV: AI Arena replaces Performance ═══
  const navItems = [
    { key: "terminal", label: t("nav.home"), icon: "📊" },
    { key: "signals", label: t("nav.signals"), icon: "📡" },
    { key: "ai-arena", label: "AI Arena", icon: "🤖" },
    { key: "bitcoin", label: t("nav.bitcoin"), icon: "₿" },
    { key: "markets", label: t("nav.markets"), icon: "🌐" },
  ];

  // ═══ MORE MENU: Performance moved here ═══
  const moreMenuItems = [
    { key: "analytics", label: t("nav.analytics"), icon: "📈", description: "Performance analytics & win rate" },
    { key: "orderbook", label: t("nav.orderbook"), icon: "📊", description: t("desc.orderbook") },
    { key: "calendar", label: t("nav.calendar"), icon: "📅", description: t("desc.calendar") },
    { key: "whale", label: t("nav.whale"), icon: "🐋", description: t("desc.whale") },
    { key: "tips", label: t("nav.tips"), icon: "📚", description: t("desc.tips") },
    { key: "watchlist", label: t("nav.watchlist"), icon: "⭐", description: t("desc.watchlist") },
    { key: "referral", label: "Referral", icon: "🎟️", description: "Earn commissions by inviting friends" },
    ...(user?.role === 'admin' ? [
      { key: "admin", label: t("nav.admin"), icon: "🛡️", description: t("desc.admin") },
    ] : []),
  ];

  const moreHasActive = moreMenuItems.some((item) => activeTab === item.key);

  // ═══ MOBILE BOTTOM NAV: AI replaces Perf ═══
  const bottomNavItems = [
    {
      key: "terminal",
      label: t("nav.home"),
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
      ),
    },
    {
      key: "ai-arena",
      label: "AI",
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      ),
    },
    {
      key: "signals",
      label: t("nav.trades"),
      isCenter: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      ),
    },
    {
      key: "bitcoin",
      label: t("nav.btc"),
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: "markets",
      label: t("nav.markets"),
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
        </svg>
      ),
    },
  ];

  const renderPage = () => {
    if (location.pathname === '/pricing') return <PricingPage />;
    if (location.pathname === '/payment') return <PaymentPage />;
    if (location.pathname === '/referral') return <ReferralPage />;

    const protectedTabs = ["signals", "analytics", "bitcoin", "markets", "watchlist", "tips", "admin", "ai-arena", "referral"];
    if (protectedTabs.includes(activeTab) && !isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold text-white mb-2">Login Required</h2>
          <p className="text-text-muted mb-6 max-w-md">
            Login untuk mengakses fitur ini. Nikmati semua fitur trading terminal LuxQuant.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/login")}
              className="px-6 py-2.5 rounded-xl font-semibold transition-all"
              style={{
                background: 'linear-gradient(to right, #d4a853, #8b6914)',
                color: '#0a0506',
                boxShadow: '0 0 20px rgba(212, 168, 83, 0.3)'
              }}
            >
              Login
            </button>
            <button
              onClick={() => navigate("/register")}
              className="px-6 py-2.5 rounded-xl font-semibold transition-colors border"
              style={{
                color: '#d4a853',
                borderColor: 'rgba(212, 168, 83, 0.3)'
              }}
            >
              Daftar
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "terminal": return <OverviewPage />;
      case "ai-arena": return <AIArenaPage />;
      case "signals": return <SignalsPage />;
      case "analytics": return <AnalyzePage />;
      case "bitcoin": return <BitcoinPage />;
      case "markets": return <MarketsPage />;
      case "watchlist": return <WatchlistPage />;
      case "tips": return <TipsPage />;
      case "calendar": return <MacroCalendarPage />;
      case "whale": return <WhaleAlertPage />;
      case "orderbook": return <OrderBookPage />;
      case "admin": return <UserManagementPage />;
      case "referral": return <ReferralPage />;
      default: return <OverviewPage />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-2 border-gold-primary/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-gold-primary rounded-full animate-spin" />
            <div className="absolute inset-2 border-2 border-transparent border-b-gold-primary/60 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-text-secondary text-sm font-medium tracking-wide">Loading LuxQuant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="luxury-bg" />

      {/* HEADER */}
      <header className={`sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b transition-all duration-300 ${scrolled ? 'border-gold-primary/15 shadow-lg shadow-black/20' : 'border-gold-primary/10'}`}>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            <div className="flex items-center gap-2 lg:gap-8">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 -ml-1 text-text-secondary hover:text-white rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                <div className="w-5 h-4 flex flex-col justify-between">
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${mobileMenuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${mobileMenuOpen ? 'opacity-0 scale-x-0' : ''}`} />
                  <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 origin-center ${mobileMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
                </div>
              </button>

              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleTabClick("terminal")}>
                <div className="w-9 h-9 lg:w-10 lg:h-10 relative">
                  <img src="/logo.png" alt="LuxQuant" className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-105" />
                </div>
                <h1 className="font-display text-sm lg:text-lg font-semibold text-white tracking-wide leading-tight group-hover:text-gold-primary transition-colors">
                  LuxQuant
                </h1>
              </div>

              <nav className="hidden lg:flex items-center gap-0.5">
                {navItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleTabClick(item.key)}
                    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === item.key
                        ? "text-gold-primary"
                        : "text-text-secondary hover:text-white"
                    }`}
                  >
                    {item.label}
                    {activeTab === item.key && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gold-primary rounded-full" />
                    )}
                  </button>
                ))}

                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      moreHasActive ? "text-gold-primary" : "text-text-secondary hover:text-white"
                    }`}
                  >
                    <span>{t("nav.more")}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${moreMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    {moreHasActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gold-primary rounded-full" />
                    )}
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute top-full left-0 mt-2 w-56 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl shadow-black/60"
                      style={{ background: '#0d0a10', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="py-1.5">
                        {moreMenuItems.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => handleTabClick(item.key)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                              activeTab === item.key
                                ? "bg-gold-primary/10 text-gold-primary"
                                : "text-text-secondary hover:text-white hover:bg-white/5"
                            }`}
                          >
                            <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{item.label}</p>
                              {item.description && (
                                <p className="text-[11px] text-text-muted mt-0.5 truncate">{item.description}</p>
                              )}
                            </div>
                            {activeTab === item.key && (
                              <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 lg:gap-2">
              
              {/* --- TOMBOL GANTI BAHASA --- */}
              <div className="flex items-center bg-bg-primary/80 backdrop-blur-md border border-gold-primary/20 rounded-xl p-0.5 mr-1 lg:mr-2 shadow-sm shadow-black/20">
                <div className="flex items-center justify-center px-2 text-gold-primary/70">
                  <svg className="w-3.5 h-3.5 animate-[spin_10s_linear_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="w-px h-3.5 bg-gold-primary/20 mx-0.5"></div>
                <button 
                  onClick={() => i18n.changeLanguage('en')}
                  className={`relative px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 overflow-hidden ${
                    i18n.language?.startsWith('en') 
                      ? 'text-bg-primary shadow-md' 
                      : 'text-text-secondary hover:text-gold-primary hover:bg-white/5'
                  }`}
                >
                  {i18n.language?.startsWith('en') && (
                    <div className="absolute inset-0 bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark" />
                  )}
                  <span className="relative z-10">EN</span>
                </button>
                <button 
                  onClick={() => i18n.changeLanguage('zh')}
                  className={`relative px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 overflow-hidden ${
                    i18n.language?.startsWith('zh') 
                      ? 'text-bg-primary shadow-md' 
                      : 'text-text-secondary hover:text-gold-primary hover:bg-white/5'
                  }`}
                >
                  {i18n.language?.startsWith('zh') && (
                    <div className="absolute inset-0 bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark" />
                  )}
                  <span className="relative z-10">ZH</span>
                </button>
              </div>

              <button
                className="relative w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/[0.06] transition-all"
                title="Notifications"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE SLIDE MENU */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className={`fixed top-14 left-0 bottom-0 w-72 z-50 bg-bg-primary/98 backdrop-blur-xl border-r border-white/[0.06] transform transition-transform duration-300 ease-out lg:hidden ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <nav className="flex-1 py-6 px-3 space-y-0.5 overflow-y-auto">
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Navigation</p>
            <SidebarItem active={activeTab === "terminal"} onClick={() => handleTabClick("terminal")} label={t("nav.home")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />}
            />
            <SidebarItem active={activeTab === "signals"} onClick={() => handleTabClick("signals")} label={t("nav.signals")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />}
            />
            <SidebarItem active={activeTab === "ai-arena"} onClick={() => handleTabClick("ai-arena")} label="AI Arena"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L4.2 15.3m15.6 0v1.47a2.25 2.25 0 01-1.372 2.068l-1.57.535A12.04 12.04 0 0112 19.5a12.04 12.04 0 01-4.858-.92l-1.57-.535A2.25 2.25 0 014.2 16.77V15.3m15.6 0v.75m0-1.5v.75m-15.6 0v-.75m0 1.5v-.75" />}
            />
            <SidebarItem active={activeTab === "analytics"} onClick={() => handleTabClick("analytics")} label={t("nav.analytics")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-3.52 1.122h-1.5a6.023 6.023 0 01-3.52-1.122" />}
            />
            <SidebarItem active={activeTab === "bitcoin"} onClick={() => handleTabClick("bitcoin")} label={t("nav.bitcoin")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
            />
            <SidebarItem active={activeTab === "markets"} onClick={() => handleTabClick("markets")} label={t("nav.markets")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />}
            />

            <div className="my-4 mx-3 h-px bg-white/[0.05]" />
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Tools</p>
            <SidebarItem active={activeTab === "orderbook"} onClick={() => handleTabClick("orderbook")} label={t("nav.orderbook")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M3 8h18M3 12h12M3 16h8M3 20h4" />}
            />
            <SidebarItem active={activeTab === "calendar"} onClick={() => handleTabClick("calendar")} label={t("nav.calendar")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />}
            />
            <SidebarItem active={activeTab === "whale"} onClick={() => handleTabClick("whale")} label={t("nav.whale")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738.145l-1.093.819a.89.89 0 00-.284.97l.448 1.345a1.336 1.336 0 01-.06.885l-1.334 2.668a.75.75 0 00.34 1.006l2.053.684a.75.75 0 00.588-.012l1.527-.763a.75.75 0 00.294-.235l1.092-1.638a.252.252 0 01.428.032l.603 1.072a.662.662 0 001.106.07l.926-1.159a.753.753 0 00.132-.795z" />}
            />
            <SidebarItem active={activeTab === "tips"} onClick={() => handleTabClick("tips")} label={t("nav.tips")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />}
            />

            <div className="my-4 mx-3 h-px bg-white/[0.05]" />
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Personal</p>
            <SidebarItem active={activeTab === "watchlist"} onClick={() => handleTabClick("watchlist")} label={t("nav.watchlist")}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />}
            />
            <SidebarItem active={activeTab === "referral"} onClick={() => handleTabClick("referral")} label="Referral"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />}
            />

            {user?.role === 'admin' && (
              <>
                <div className="my-4 mx-3 h-px bg-white/[0.05]" />
                <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Admin</p>
                <SidebarItem active={activeTab === "admin"} onClick={() => handleTabClick("admin")} label={t("nav.admin")}
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />}
                />
              </>
            )}
          </nav>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 pb-24 lg:pb-6">
        {renderPage()}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="bg-bg-primary/95 backdrop-blur-xl border-t border-gold-primary/10">
          <div className="flex items-end justify-around h-16 px-2 max-w-lg mx-auto relative">
            {bottomNavItems.map((item) => {
              const isActive = activeTab === item.key;

              if (item.isCenter) {
                return (
                  <button
                    key={item.key}
                    onClick={() => handleTabClick(item.key)}
                    className="relative -mt-5 flex flex-col items-center"
                  >
                    {isActive && (
                      <div className="absolute -inset-1.5 rounded-[20px] bg-gold-primary/15 blur-md animate-pulse" />
                    )}
                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark shadow-gold-primary/40 scale-105'
                        : 'bg-bg-card border-2 border-gold-primary/30 hover:border-gold-primary/50 hover:shadow-gold-primary/10'
                    }`}>
                      <span className={isActive ? 'text-bg-primary' : 'text-gold-primary'}>{item.icon}</span>
                    </div>
                    <span className={`text-[10px] font-semibold mt-1 transition-colors ${isActive ? 'text-gold-primary' : 'text-text-muted'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={item.key}
                  onClick={() => handleTabClick(item.key)}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 min-w-[52px] relative group"
                >
                  <span className={`transition-all duration-200 ${isActive ? 'text-gold-primary scale-110' : 'text-text-muted group-hover:text-text-secondary'}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-secondary'}`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-1 w-4 h-0.5 bg-gold-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="bg-bg-primary/95 h-safe-area-bottom" />
      </nav>

      {/* ── PREMIUM MODAL ── */}
      <PremiumModal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} />
    </div>
  );
}

// ════════════════════════════════════════
// Router
// ════════════════════════════════════════
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallback />} />
          <Route path="/watchlist" element={<AppContent />} />
          <Route path="/referral" element={<AppContent />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;