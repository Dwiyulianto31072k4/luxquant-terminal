import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import OverviewPage from "./components/OverviewPage";
import SignalsPage from "./components/SignalsPage";
import BitcoinPage from "./components/BitcoinPage";
import MarketsPage from "./components/MarketsPage";
import AnalyzePage from "./components/AnalyzePage";
import WatchlistPage from "./components/WatchlistPage";
import { LoginPage, RegisterPage, UserMenu } from "./components/auth";

// ════════════════════════════════════════
// Main App Content
// ════════════════════════════════════════
function AppContent() {
  const [activeTab, setActiveTab] = useState("terminal");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Track scroll for header shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (location.pathname === "/watchlist") setActiveTab("watchlist");
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

  const handleTabClick = (key) => {
    setActiveTab(key);
    setMobileMenuOpen(false);
    navigate(key === "watchlist" ? "/watchlist" : "/");
  };

  // Desktop nav items
  const navItems = [
    { key: "terminal", label: "Terminal", icon: "📊" },
    { key: "signals", label: "Potential Trades", icon: "📡" },
    { key: "analytics", label: "Performance", icon: "📈" },
    { key: "bitcoin", label: "Bitcoin", icon: "₿" },
    { key: "markets", label: "Markets", icon: "🌐" },
  ];

  // Mobile bottom nav — Trades (signals) in center, Terminal = Home
  const bottomNavItems = [
    {
      key: "terminal",
      label: "Home",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
      ),
    },
    {
      key: "analytics",
      label: "Performance",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      key: "signals",
      label: "Trades",
      isCenter: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      key: "bitcoin",
      label: "Bitcoin",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: "markets",
      label: "Markets",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case "terminal": return <OverviewPage />;
      case "signals": return <SignalsPage />;
      case "analytics": return <AnalyzePage />;
      case "bitcoin": return <BitcoinPage />;
      case "markets": return <MarketsPage />;
      case "watchlist": return <WatchlistPage />;
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

  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  if (isAuthPage) return null;

  return (
    <div className="min-h-screen">
      <div className="luxury-bg" />

      {/* Corner Ornaments */}
      <div className="corner-ornament top-left hidden md:block" />
      <div className="corner-ornament top-right hidden md:block" />
      <div className="corner-ornament bottom-left hidden md:block" />
      <div className="corner-ornament bottom-right hidden md:block" />

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className={`sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b transition-all duration-300 ${scrolled ? 'border-gold-primary/15 shadow-lg shadow-black/20' : 'border-gold-primary/10'}`}>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">

            {/* LEFT: Hamburger + Logo + Nav */}
            <div className="flex items-center gap-3 lg:gap-8">
              {/* Hamburger */}
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

              {/* Logo */}
              <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => handleTabClick("terminal")}>
                <div className="w-10 h-10 relative">
                  <img src="/logo.png" alt="LuxQuant" className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="font-display text-base lg:text-lg font-semibold text-white tracking-wide leading-tight group-hover:text-gold-primary transition-colors">
                    LuxQuant
                  </h1>
                </div>
              </div>

              {/* Desktop Nav */}
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
                    {/* Active indicator line */}
                    {activeTab === item.key && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-gold-primary rounded-full" />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* RIGHT: Clock + User */}
            <div className="flex items-center gap-2 lg:gap-3">
              <LiveClock />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════ MOBILE SLIDE MENU ═══════════════ */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <div className={`fixed top-14 left-0 bottom-0 w-72 z-50 bg-bg-primary/98 backdrop-blur-xl border-r border-gold-primary/10 transform transition-transform duration-300 ease-out lg:hidden ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Navigation</p>
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleTabClick(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.key
                    ? "text-gold-primary bg-gold-primary/10 border border-gold-primary/20"
                    : "text-text-secondary hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <span className="text-base w-6 text-center">{item.icon}</span>
                <span>{item.label}</span>
                {activeTab === item.key && (
                  <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full" />
                )}
              </button>
            ))}

            <div className="my-4 mx-3 h-px bg-gold-primary/10" />
            <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] font-semibold px-3 mb-3">Personal</p>

            <button
              onClick={() => handleTabClick("watchlist")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "watchlist"
                  ? "text-gold-primary bg-gold-primary/10 border border-gold-primary/20"
                  : "text-text-secondary hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <span className="text-base w-6 text-center">⭐</span>
              <span>Watchlist</span>
              {activeTab === "watchlist" && (
                <span className="ml-auto w-1.5 h-1.5 bg-gold-primary rounded-full" />
              )}
            </button>
          </nav>

          <div className="p-4 border-t border-gold-primary/10">
            <div className="flex items-center gap-2 text-text-muted text-[10px] tracking-wider">
              <span className="w-1.5 h-1.5 bg-positive rounded-full animate-pulse" />
              <span>LuxQuant Terminal v1.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 pb-24 lg:pb-6">
        {renderPage()}
      </main>

      {/* ═══════════════ MOBILE BOTTOM NAV ═══════════════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        {/* Top edge glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="bg-bg-primary/95 backdrop-blur-xl border-t border-gold-primary/10">
          <div className="flex items-end justify-around h-16 px-2 max-w-lg mx-auto relative">
            {bottomNavItems.map((item) => {
              const isActive = activeTab === item.key;

              // Center "Trades" button — elevated floating style
              if (item.isCenter) {
                return (
                  <button
                    key={item.key}
                    onClick={() => handleTabClick(item.key)}
                    className="relative -mt-5 flex flex-col items-center"
                  >
                    {/* Floating circle */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark shadow-gold-primary/30 scale-105'
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
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 min-w-[52px] relative"
                >
                  <span className={`transition-all duration-200 ${isActive ? 'text-gold-primary scale-110' : 'text-text-muted'}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-gold-primary' : 'text-text-muted'}`}>
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
        {/* Safe area for phones with home indicator */}
        <div className="bg-bg-primary/95 h-safe-area-bottom" />
      </nav>
    </div>
  );
}

// ════════════════════════════════════════
// Live Clock
// ════════════════════════════════════════
const LiveClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit" });
  const minutes = time.toLocaleTimeString("en-US", { minute: "2-digit" });
  const seconds = time.toLocaleTimeString("en-US", { second: "2-digit" });

  return (
    <div className="hidden sm:flex items-center gap-0.5 font-mono text-sm text-text-secondary">
      <span className="text-white">{hours}</span>
      <span className="text-gold-primary/60 animate-pulse">:</span>
      <span className="text-white">{minutes}</span>
      <span className="text-gold-primary/60 animate-pulse">:</span>
      <span className="text-text-muted">{seconds}</span>
    </div>
  );
};

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
          <Route path="/watchlist" element={<AppContent />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;