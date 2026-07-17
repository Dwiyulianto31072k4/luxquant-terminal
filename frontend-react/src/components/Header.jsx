import { useState, useEffect } from 'react';


/* ──────────────────────────────────────────────────────────────
   Header — Flowscan-blended Web3-minimal reskin
   • Desktop: transparent header that MERGES with page bg
     (no border-bottom, no harsh contrast — exact Flowscan pattern)
   • Mobile: bottom tab bar fixed (Home, Pulse, Trade, Arena, Market)
   • Menu items: plain text + bottom underline pill for active
   • LED soft glow indicators (no animate-ping)
   ────────────────────────────────────────────────────────────── */

const Header = ({ activeTab, setActiveTab }) => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Desktop nav items (sesuaikan dengan routing app Anda)
  const desktopNav = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'market', label: 'Market' },
  ];

  // Mobile bottom-bar items (5 max — request user)
  const mobileNav = [
    { key: 'home', label: 'Home', Icon: IconHome },
    { key: 'market-pulse', label: 'Pulse', Icon: IconPulse },
    { key: 'signals', label: 'Trade', Icon: IconTrade },
    { key: 'ai-arena', label: 'Arena', Icon: IconArena },
    { key: 'market', label: 'Market', Icon: IconMarket },
  ];

  return (
    <>
      {/* ════════════════════════════════════════════════════════
          DESKTOP HEADER — Transparent, MERGES with page (Flowscan)
          No border-b, no harsh contrast
          ═══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-bg-primary/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">

            {/* ─── KIRI: Logo + Desktop Nav ─── */}
            <div className="flex items-center gap-8 min-w-0">
              {/* Logo — Flowscan-style simple */}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}
                className="flex items-center gap-2 flex-shrink-0 group"
              >
                <div className="relative w-6 h-6 rounded-sm flex items-center justify-center bg-gold-primary/[0.08] border border-line/25">
                  <span className="font-mono text-[9px] font-bold tracking-wider text-gold-primary">
                    LQ
                  </span>
                </div>
                <h1 className="text-[15px] font-normal text-text-primary tracking-tight group-hover:text-gold-primary transition-colors">
                  LuxQuant
                </h1>
              </a>

              {/* Desktop Navigation — Flowscan plain text + underline pill */}
              <nav className="hidden lg:flex items-center gap-1">
                {desktopNav.map((item) => {
                  const active = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setActiveTab(item.key)}
                      className={`relative px-3 py-1.5 text-[13px] transition-colors ${
                        active
                          ? 'text-text-primary'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {item.label}
                      {/* Active underline pill — Flowscan signature */}
                      {active && (
                        <span className="absolute inset-x-2 -bottom-[7px] h-[2px] rounded-full bg-gold-primary/80" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ─── KANAN: LIVE + Time + Search ─── */}
            <div className="flex items-center gap-3">
              {/* LIVE indicator — static LED + soft glow (no animate-ping) */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-50" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-profit" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-profit">
                  Live
                </span>
              </div>

              {/* Time — mono tabular-nums subtle */}
              <span className="hidden sm:inline-block font-mono text-[11px] tabular-nums text-text-muted/80">
                {currentTime}
              </span>

              {/* Search button — Flowscan ⌘K pattern */}
              <button
                className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-ink/[0.03] hover:bg-ink/[0.06] border border-ink/[0.06] hover:border-ink/[0.12] text-text-muted hover:text-text-primary transition-colors"
                aria-label="Search"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="font-mono text-[11px] uppercase tracking-wider">Search</span>
                <kbd className="hidden lg:inline-flex items-center justify-center font-mono text-[9px] px-1.5 py-0.5 rounded-sm bg-ink/[0.04] border border-ink/[0.06] text-text-muted/70">
                  ⌘K
                </kbd>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR — Fixed bottom, 5 items
          (Home, Pulse, Trade, Arena, Market)
          ═══════════════════════════════════════════════════════ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-bg-primary/90 backdrop-blur-xl">
        {/* Top hairline accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="grid grid-cols-5 gap-1 px-2 pt-2 pb-2 safe-bottom">
          {mobileNav.map((item) => {
            const active = activeTab === item.key;
            const { Icon } = item;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className="relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-sm transition-colors group"
              >
                {/* Top active indicator dot */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-gold-primary/80" />
                )}
                <Icon active={active} />
                <span
                  className={`font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Spacer for mobile bottom nav so content doesn't get hidden behind */}
      <div className="lg:hidden h-16" aria-hidden="true" />

      <style>{`
        .safe-bottom {
          padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </>
  );
};

/* ──────────────────────────────────────────────────────────────
   SVG ICONS — Lucide-style minimal, active aware
   ────────────────────────────────────────────────────────────── */

function IconHome({ active }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconPulse({ active }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function IconTrade({ active }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

function IconArena({ active }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3c0 1.3.9 2.4 2 2.8V10H7a3 3 0 0 0-3 3v1a3 3 0 0 0 2.5 3v3a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3a3 3 0 0 0 2.5-3v-1a3 3 0 0 0-3-3h-4V7.8c1.1-.4 2-1.5 2-2.8a3 3 0 0 0-3-3Z" />
      <circle cx="9" cy="15" r="0.5" fill="currentColor" />
      <circle cx="15" cy="15" r="0.5" fill="currentColor" />
    </svg>
  );
}

function IconMarket({ active }) {
  return (
    <svg
      className={`w-4 h-4 transition-colors ${active ? 'text-gold-primary' : 'text-text-muted group-hover:text-text-primary'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </svg>
  );
}

export default Header;