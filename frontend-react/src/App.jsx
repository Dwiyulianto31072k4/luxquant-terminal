import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import OverviewPage from './components/OverviewPage';
import SignalsPage from './components/SignalsPage';
import BitcoinPage from './components/BitcoinPage';
import MarketsPage from './components/MarketsPage';
import AnalyzePage from './components/AnalyzePage';
import WatchlistPage from './components/WatchlistPage';
import { LoginPage, RegisterPage, UserMenu } from './components/auth';

// Main App Content (inside router)
function AppContent() {
  const [activeTab, setActiveTab] = useState('terminal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Sync activeTab with URL
  useEffect(() => {
    if (location.pathname === '/watchlist') {
      setActiveTab('watchlist');
    }
  }, [location.pathname]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigate = (e) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Handle tab click
  const handleTabClick = (key) => {
    setActiveTab(key);
    setMobileMenuOpen(false);
    if (key === 'watchlist') {
      navigate('/watchlist');
    } else {
      navigate('/');
    }
  };

  // Navigation items with icons for mobile
  const navItems = [
    { key: 'terminal', label: 'Terminal', icon: '📊' },
    { key: 'signals', label: 'Potential Trades', icon: '📡' },
    { key: 'analytics', label: 'Performance', icon: '📈' },
    { key: 'bitcoin', label: 'Bitcoin', icon: '₿' },
    { key: 'markets', label: 'Markets', icon: '🌐' },
  ];

  // Bottom nav items (subset for mobile bottom bar)
  const bottomNavItems = [
    { key: 'terminal', label: 'Terminal', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    )},
    { key: 'signals', label: 'Trades', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    )},
    { key: 'analytics', label: 'Analytics', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
    { key: 'bitcoin', label: 'Bitcoin', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
    { key: 'markets', label: 'Markets', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  // Render active page
  const renderPage = () => {
    switch (activeTab) {
      case 'terminal': return <OverviewPage />;
      case 'signals': return <SignalsPage />;
      case 'analytics': return <AnalyzePage />;
      case 'bitcoin': return <BitcoinPage />;
      case 'markets': return <MarketsPage />;
      case 'watchlist': return <WatchlistPage />;
      default: return <OverviewPage />;
    }
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gold-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if on auth pages
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  if (isAuthPage) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Background */}
      <div className="luxury-bg" />
      
      {/* Corner Ornaments - hide on mobile */}
      <div className="corner-ornament top-left hidden md:block" />
      <div className="corner-ornament top-right hidden md:block" />
      <div className="corner-ornament bottom-left hidden md:block" />
      <div className="corner-ornament bottom-right hidden md:block" />

      {/* ==================== HEADER ==================== */}
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b border-gold-primary/10">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            
            {/* LEFT: Hamburger (mobile) + Logo + Nav (desktop) */}
            <div className="flex items-center gap-3 lg:gap-8">
              {/* Hamburger - mobile only */}
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 -ml-1 text-text-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {/* Logo */}
              <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => handleTabClick('terminal')}>
                <div className="w-9 h-9 lg:w-10 lg:h-10 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-xl flex items-center justify-center shadow-gold-glow">
                  <span className="font-display font-bold text-xs lg:text-sm text-bg-primary">LQ</span>
                </div>
                <h1 className="font-display text-base lg:text-lg font-semibold text-white tracking-wide hidden sm:block">
                  LuxQuant
                </h1>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleTabClick(item.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === item.key
                        ? 'text-gold-primary bg-gold-primary/10'
                        : 'text-text-secondary hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* RIGHT: Live + Clock + Actions */}
            <div className="flex items-center gap-2 lg:gap-3">
              {/* Live Badge */}
              <div className="flex items-center gap-1.5 px-2 lg:px-3 py-1 lg:py-1.5 bg-positive/10 border border-positive/30 rounded-lg">
                <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-positive rounded-full live-dot" />
                <span className="text-[10px] lg:text-xs font-semibold text-positive uppercase">Live</span>
              </div>

              {/* Clock - hidden on small mobile */}
              <LiveClock />

              {/* Search - hidden on mobile */}
              <button className="hidden md:block p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Notifications - hidden on mobile */}
              <button className="hidden md:block p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1 right-1 w-2 h-2 bg-gold-primary rounded-full" />
              </button>

              {/* Settings - hidden on mobile */}
              <button className="hidden lg:block p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* User Menu */}
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* ==================== MOBILE SLIDE MENU ==================== */}
      {/* Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      {/* Slide-in panel */}
      <div className={`fixed top-14 left-0 bottom-0 w-72 z-50 bg-bg-primary border-r border-gold-primary/10 transform transition-transform duration-300 ease-in-out lg:hidden ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Nav Items */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleTabClick(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.key
                    ? 'text-gold-primary bg-gold-primary/10 border border-gold-primary/20'
                    : 'text-text-secondary hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            
            {/* Watchlist in mobile menu */}
            <button
              onClick={() => handleTabClick('watchlist')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'watchlist'
                  ? 'text-gold-primary bg-gold-primary/10 border border-gold-primary/20'
                  : 'text-text-secondary hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-lg">⭐</span>
              <span>Watchlist</span>
            </button>
          </nav>

          {/* Mobile menu footer */}
          <div className="p-4 border-t border-gold-primary/10">
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <span className="w-1.5 h-1.5 bg-positive rounded-full"></span>
              <span>LuxQuant Terminal v1.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 pb-20 lg:pb-6">
        {renderPage()}
      </main>

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-bg-primary/95 backdrop-blur-md border-t border-gold-primary/10">
        <div className="flex items-center justify-around h-16 px-1">
          {bottomNavItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleTabClick(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[56px] transition-all ${
                activeTab === item.key
                  ? 'text-gold-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <span className={activeTab === item.key ? 'text-gold-primary' : 'text-text-muted'}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium ${activeTab === item.key ? 'text-gold-primary' : ''}`}>
                {item.label}
              </span>
              {activeTab === item.key && (
                <span className="absolute bottom-1 w-5 h-0.5 bg-gold-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Live Clock Component
const LiveClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden sm:block font-mono text-xs lg:text-sm text-text-secondary px-2 lg:px-3 py-1 lg:py-1.5 bg-bg-card/50 border border-gold-primary/10 rounded-lg">
      {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
};

// Main App with Router
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