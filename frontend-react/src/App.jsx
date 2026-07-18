import { HelmetProvider, Helmet } from "react-helmet-async";
// src/App.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — URL-Based Routing v3 + Lazy Loading
// Web3 Flowscan-Minimal Reskin v3:
// - Mobile drawer fix: bottom-16 (stops above bottom nav, no overlap)
// - Admin section moved to TOP (priority access for admin users)
// - Added pb-6 breathing room at scroll end
// - Edge Lab added to More menu (desktop) + mobile drawer
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";

import { CurrencyProvider } from "./context/CurrencyContext";
import InAppBrowserBanner from "./components/InAppBrowserBanner";
import TelegramNudgeModal from "./components/TelegramNudgeModal";
import AnnouncementModal from "./components/AnnouncementModal";

// ════════════════════════════════════════
// LAZY LOADED PAGES
// ════════════════════════════════════════
const OverviewPage = lazy(() => import("./components/OverviewPage"));
const FooterV2 = lazy(() => import("./components/landing/v2/sections/FooterV2"));
const SignalsPage = lazy(() => import("./components/SignalsPage"));
const SignalTerminalPage = lazy(() => import("./components/SignalTerminalPage"));
const BitcoinPage = lazy(() => import("./components/BitcoinPage"));
const MarketsPage = lazy(() => import("./components/MarketsPage"));
const ApiKeysPage = lazy(() => import("./components/ApiKeysPage"));
const AnalyzePage = lazy(() => import("./components/AnalyzePage"));
const WatchlistPage = lazy(() => import("./components/WatchlistPage"));
const WatchlistTabs = lazy(() => import("./components/WatchlistTabs"));
const TipsPage = lazy(() => import("./components/ResourcesPage"));
const UserManagementPage = lazy(() => import("./components/UserManagementPage"));
const AdminWorkspacePage = lazy(() => import("./components/AdminWorkspacePage"));
const MacroCalendarPage = lazy(() => import("./components/MacroCalendarPage"));
const WhaleAlertPage = lazy(() => import("./components/WhaleAlertPage"));
const MoneyFlowPage = lazy(() => import("./components/MoneyFlowPage"));
const DelistingsPage = lazy(() => import("./components/DelistingsPage"));
const LearnPage = lazy(() => import("./components/LearnPage"));
const BlogPage = lazy(() => import("./components/BlogPage"));
const CoinsPage = lazy(() => import("./components/CoinsPage"));
const OrderBookPage = lazy(() => import("./components/OrderBookPage"));
const AIArenaPageV6 = lazy(() => import("./components/AIArenaPageV6"));
const ReferralPage = lazy(() => import("./components/ReferralPage"));
const LandingPageV2 = lazy(() => import("./components/landing/v2/LandingPageV2"));
const LoginPage = lazy(() => import("./components/auth/LoginPage"));
const GoogleCallback = lazy(() => import("./components/auth/GoogleCallback"));
const DiscordCallback = lazy(() => import("./components/auth/DiscordCallback"));
const PricingPage = lazy(() => import("./components/subscription/PricingPage"));
const PaymentPage = lazy(() => import("./components/subscription/PaymentPage"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const NotificationsPage = lazy(() => import("./components/NotificationsPage"));
// Shared shell for everything behind the avatar menu. Applied at the route
// level so the five pages gain persistent sub-navigation and one common
// measure without any of them having to know about the others.
const AccountLayout = lazy(() => import("./components/account/AccountLayout"));
const JournalPage = lazy(() => import("./components/JournalPage"));
const MarketPulsePage = lazy(() => import("./components/MarketPulsePage"));
const CryptoNewsPage = lazy(() => import("./components/CryptoNewsPage"));
const OnchainPage = lazy(() => import("./components/OnchainPage"));
const AutoTradePage = lazy(() => import("./components/AutoTradePage"));
const PortfolioPage = lazy(() => import("./components/PortfolioPage"));
const DailyPerformancePage = lazy(() => import("./components/DailyPerformancePage"));
const EdgeLabPage = lazy(() => import("./components/EdgeLabPage"));
const TerminalLayout = lazy(() => import("./components/terminal/TerminalLayout"));
const SignalsAnalytics = lazy(() => import("./components/terminal/SignalsAnalytics"));
const PerformanceHub = lazy(() => import("./components/PerformanceHub"));
const AssistantFullPage = lazy(() => import("./components/assistant/AssistantFullPage"));
const StatusPage = lazy(() => import("./components/StatusPage"));

// Keep these eager — always visible in AppShell
import { UserMenu } from "./components/auth";
import { PremiumModal } from "./components/subscription";
import NotificationBell from "./components/NotificationBell";
import MoreMenuDropdown from "./components/MoreMenuDropdown";
import { LoadingScreen, PageSkeleton } from "./components/ui/Loaders";
import ErrorBoundary, { RouteErrorBoundary } from "./components/ErrorBoundary";

// ════════════════════════════════════════
// PAGE LOADING FALLBACKS
// ════════════════════════════════════════
// Full-page routes (landing, login, callbacks) → branded LoadingScreen.
const PageLoader = () => <LoadingScreen />;
// In-shell content routes → skeleton (feels faster, no layout shift).
const ContentLoader = () => <PageSkeleton />;

// ════════════════════════════════════════
// ACCESS CONTROL
// ════════════════════════════════════════
const LOGIN_REQUIRED = [
  "/market-pulse",
  "/crypto-news",
  "/signals",
  "/terminal",
  "/analytics",
  "/performance",
  "/bitcoin",
  "/markets",
  "/watchlist",
  "/tips",
  "/admin",
  "/admin/workspace",
  "/ai-arena",
  "/ai-arena/v6",
  "/ai-arena/legacy",
  "/referral",
  "/orderbook",
  "/calendar",
  "/whale",
  "/money-flow",
  "/delistings",
  "/notifications",
  "/journal",
  "/onchain",
  "/autotrade",
  "/portfolio",
  "/api-keys",
];

const PREMIUM_REQUIRED = [
  "/signals",
  "/terminal",
  "/bitcoin",
  "/markets",
  "/watchlist",
  "/tips",
  "/ai-arena",
  "/ai-arena/v6",
  "/ai-arena/legacy",
  "/orderbook",
  "/calendar",
  "/whale",
  "/money-flow",
  "/delistings",
  "/onchain",
  "/autotrade",
  "/portfolio",
  "/api-keys",
];

// ════════════════════════════════════════
// ROUTE GUARDS
// ════════════════════════════════════════
// /terminal index:
// · WITH query string (TERMINAL button carrying filters) → Market Map
// tab (own route — keeps its filter params), old flow intact.
// · clean open → Signals Analytics (Overview).
function TerminalIndex() {
  const location = useLocation();
  return location.search ? (
    <Navigate to={`/terminal/map${location.search}`} replace />
  ) : (
    <Navigate to="/terminal/scan" replace />
  );
}

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthenticated)
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  // Login-gated content = a thin login/app shell to crawlers → keep it out of
  // Google. Pages can still override with their own <Seo> if ever made public.
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {children}
    </>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  // admin + co_admin + founder can open admin routes (view-only staff still need access)
  const allowed =
    user &&
    (user.role === "admin" ||
      user.role === "co_admin" ||
      user.role === "founder" ||
      user.is_admin_staff === true ||
      user.is_admin === true);
  if (!allowed) return <Navigate to="/home" replace />;
  return children;
}

function PremiumGate({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const isPremium =
    user &&
    (user.role === "admin" ||
      user.role === "co_admin" ||
      user.role === "founder" ||
      user.role === "premium" ||
      user.role === "subscriber" ||
      user.is_admin_staff === true ||
      user.is_admin);

  useEffect(() => {
    if (!isPremium) setShowModal(true);
  }, [isPremium]);

  if (!isPremium) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
              Premium Feature
            </span>
          </div>
          <div className="w-14 h-14 rounded-md bg-surface-raised border border-ink/12 flex items-center justify-center mb-5 relative overflow-hidden">
            <svg
              className="w-7 h-7 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-normal text-text-primary mb-2 tracking-tight">
            Premium Feature
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-6 max-w-md normal-case">
            Fitur ini hanya tersedia untuk pengguna premium. Upgrade sekarang untuk akses penuh ke
            semua fitur LuxQuant.
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={() => navigate("/pricing")}
              className="px-5 py-2 rounded-sm font-mono text-[11px] uppercase tracking-wider bg-accent text-accent-fg border border-ink/12 hover:bg-accent/20 transition-colors"
            >
              Lihat Harga
            </button>
            <button
              onClick={() => navigate("/home")}
              className="px-5 py-2 rounded-sm font-mono text-[11px] uppercase tracking-wider bg-ink/[0.03] text-text-muted border border-ink/[0.06] hover:text-text-primary hover:bg-ink/[0.06] transition-colors"
            >
              Kembali
            </button>
          </div>
        </div>
        <PremiumModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            navigate("/home");
          }}
        />
      </>
    );
  }
  return children;
}

// ════════════════════════════════════════
// SIDEBAR ITEM — Flowscan flat pattern
// ════════════════════════════════════════
// ─── Central nav icon registry — same visual language as MoreMenuDropdown
// (bare 1.5-stroke SVG paths, colour lives in the stroke). Keyed by route.
const NAV_ICON_PATHS = {
  "/home": (
    <>
      <path d="M3 10.5 L12 3 L21 10.5" />
      <path d="M5 9.5 V20 a1 1 0 001 1 H18 a1 1 0 001-1 V9.5" />
      <path d="M9.5 21 v-6 h5 v6" />
    </>
  ),
  "/signals": (
    <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
  ),
  "/autotrade": (
    <>
      <rect x="3.5" y="7" width="11.5" height="9.5" rx="2.5" />
      <path d="M9.25 7 V4.5" />
      <circle cx="9.25" cy="3.4" r="0.85" />
      <circle cx="7" cy="11.3" r="1" />
      <circle cx="11.5" cy="11.3" r="1" />
      <path d="M3.5 11 H2.2 M15 11 H16.3" />
      <circle cx="17.8" cy="17.3" r="2.1" />
      <path d="M17.8 14.6 v0.8 M17.8 20 v-0.8 M15.1 17.3 h0.8 M20.5 17.3 h-0.8 M16 15.5 l0.55 0.55 M19.6 19.1 l-0.55 -0.55 M19.6 15.5 l-0.55 0.55 M16 19.1 l0.55 -0.55" />
    </>
  ),
  "/ai-arena": (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 L21 21" />
      <path d="M11 8.5 v5 M8.5 11 h5" strokeOpacity="0.55" />
    </>
  ),
  "/orderbook": (
    <>
      <line x1="4" y1="6" x2="13" y2="6" />
      <line x1="4" y1="10" x2="10" y2="10" />
      <line x1="4" y1="14" x2="11" y2="14" />
      <line x1="4" y1="18" x2="9" y2="18" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <path d="M15.5 17 L18 20 L20.5 17" />
    </>
  ),
  "/markets": (
    <>
      <rect x="5" y="8" width="4" height="11" rx="1" />
      <path d="M7 8 V5" />
      <rect x="15" y="4" width="4" height="13" rx="1" />
      <path d="M17 4 V2 M17 17 v3" />
    </>
  ),
  "/market-pulse": <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />,
  "/onchain": (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="14" r="2.4" />
      <circle cx="6" cy="20" r="1.8" />
      <circle cx="18" cy="20" r="1.8" />
      <line x1="7.4" y1="7.4" x2="10.4" y2="12.2" />
      <line x1="16.6" y1="7.4" x2="13.6" y2="12.2" />
      <line x1="10.6" y1="15.8" x2="7.2" y2="18.4" />
      <line x1="13.4" y1="15.8" x2="16.8" y2="18.4" />
    </>
  ),
  "/money-flow": (
    <>
      <path d="M3 8c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
      <path d="M3 14c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
    </>
  ),
  "/delistings": (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </>
  ),
  "/bitcoin": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 7 V8 M10 16 V17 M13 7 V8 M13 16 V17" />
      <path d="M9 8 H14 a2 2 0 010 4 H9 M9 12 H15 a2 2 0 010 4 H9 V8 z" />
    </>
  ),
  "/crypto-news": (
    <>
      <rect x="3" y="5" width="14" height="15" rx="1" />
      <path d="M17 8 H20 a1 1 0 011 1 V19 a1 1 0 01-1 1 H17" />
      <line x1="6" y1="9" x2="14" y2="9" />
      <line x1="6" y1="12" x2="14" y2="12" />
      <line x1="6" y1="15" x2="11" y2="15" />
    </>
  ),
  "/calendar": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <circle cx="8" cy="14" r="0.8" fill="currentColor" />
      <circle cx="12" cy="14" r="0.8" fill="currentColor" />
      <circle cx="16" cy="14" r="0.8" fill="currentColor" />
      <circle cx="8" cy="17.5" r="0.8" fill="currentColor" />
    </>
  ),
  "/performance": (
    <>
      <path d="M3 3 v18 h18" />
      <path d="M7 14 l4-4 4 4 6-6" />
      <path d="M17 8 h4 v4" />
    </>
  ),
  "/journal": (
    <>
      <rect x="4" y="3" width="14" height="18" rx="1" />
      <line x1="8" y1="3" x2="8" y2="21" />
      <line x1="11" y1="9" x2="15" y2="9" />
      <line x1="11" y1="13" x2="15" y2="13" />
      <path d="M11 17 L13 18 L16 15" />
    </>
  ),
  "/portfolio": (
    <>
      <rect x="3" y="7" width="18" height="14" rx="1" />
      <path d="M9 7 V5 a1 1 0 011-1 H14 a1 1 0 011 1 V7" />
      <line x1="3" y1="13" x2="21" y2="13" />
    </>
  ),
  "/watchlist": (
    <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
  ),
  "/tips": (
    <>
      <path d="M9 18 h6 M10 21 h4" />
      <path d="M12 3 a6 6 0 0 1 4 10.5 c-0.7 0.7-1 1.3-1 2.5 H9 c0-1.2-0.3-1.8-1-2.5 A6 6 0 0 1 12 3 z" />
    </>
  ),
  "/referral": (
    <>
      <circle cx="8" cy="9" r="3" />
      <path d="M3 19 a5 5 0 0 1 10 0" />
      <path d="M16 7 h5 M18.5 4.5 v5" strokeOpacity="0.7" />
      <path d="M16 14 a4 4 0 0 1 5 4" />
    </>
  ),
  "/api-keys": (
    <>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13 L20 3 M17 6 L20 9 M14 9 L16 11" />
    </>
  ),
  "/admin": (
    <>
      <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" />
      <path d="M9 12 L11 14 L15 9.5" />
    </>
  ),
};

const SidebarItem = ({
  active,
  onClick,
  label,
  icon,
  path,
  isPremium,
  isFreeBadge,
  isAdminAccent,
}) => {
  const glyph = (path && NAV_ICON_PATHS[path]) || icon;
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-md transition-colors ${
        active ? "bg-ink/[0.04]" : "bg-transparent hover:bg-ink/[0.04]"
      }`}
    >
      {/* active indicator — thin gold (or red for admin) left bar */}
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
          style={{
            background: isAdminAccent ? "rgb(248,113,113)" : "rgb(212,168,83)",
            boxShadow: isAdminAccent
              ? "0 0 6px rgba(248,113,113,0.6)"
              : "0 0 6px rgb(var(--accent) / 0.6)",
          }}
        />
      )}
      {/* bare icon — colour in the stroke, white→full-white on hover */}
      <svg
        className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
          active
            ? isAdminAccent
              ? "text-loss"
              : "text-accent"
            : isAdminAccent
              ? "text-loss/70 group-hover:text-loss"
              : "text-text-primary/70 group-hover:text-text-primary"
        }`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        {glyph}
      </svg>
      <span
        className={`text-[12.5px] tracking-tight transition-colors ${
          active
            ? isAdminAccent
              ? "text-loss"
              : "text-accent"
            : "text-text-primary/90 group-hover:text-text-primary"
        }`}
      >
        {label}
      </span>
    </button>
  );
};

// ════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════
function AppShell({ children }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const moreMenuRef = useRef(null);
  // Bright always solid chrome; dark themes solidify after slight scroll.
  const headerSolid = theme === "bright" || scrolled;

  const isPremiumUser = () =>
    user &&
    (user.role === "admin" ||
      user.role === "co_admin" ||
      user.role === "founder" ||
      user.role === "premium" ||
      user.role === "subscriber" ||
      user.is_admin_staff === true ||
      user.is_admin);
  const isActive = (path) => {
    if (location.pathname === path) return true;
    // Nested research surfaces
    if (path.startsWith("/terminal") && location.pathname.startsWith("/terminal")) return true;
    if (path.startsWith("/ai-arena") && location.pathname.startsWith("/ai-arena")) return true;
    return false;
  };
  // Staff (admin / co_admin / founder) see admin nav; mutations gated per-page
  const isAdmin =
    user?.role === "admin" ||
    user?.role === "co_admin" ||
    user?.role === "founder" ||
    user?.is_admin_staff === true ||
    user?.is_admin === true;

  // Footer — exchange-style: shown on all content pages, EXCEPT viewport-locked
  // "terminal" views (live trade UI / fullscreen chat) and internal admin tooling.
  // Binance/Coinbase omit the marketing footer on their live trade terminal for
  // the same reason — those layouts are height-locked so a footer never scrolls
  // into view and only breaks the layout.
  const FOOTER_HIDDEN_PATHS = ["/assistant", "/orderbook"];
  const FOOTER_HIDDEN_PREFIXES = ["/terminal", "/admin"];
  const showFooter =
    !FOOTER_HIDDEN_PATHS.includes(location.pathname) &&
    !FOOTER_HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => {
    const h = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleNav = (path) => {
    setMobileMenuOpen(false);
    // Prefix match, not equality: nav entries point at concrete children like
    // /terminal/scan while the gate lists name the section (/terminal). Exact
    // matching let those slip past the friendly modal and bounce off the
    // route-level PremiumGate instead. Access was never open — just abrupt.
    const gatedBy = (list) => list.some((p) => path === p || path.startsWith(p + "/"));
    if (gatedBy(LOGIN_REQUIRED) && !isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    if (gatedBy(PREMIUM_REQUIRED) && isAuthenticated && !isPremiumUser()) {
      setShowPremiumModal(true);
      return;
    }
    navigate(path);
  };

  const navItems = [
    { path: "/home", label: t("nav.home") },
    { path: "/signals", label: t("nav.signals") },
    { path: "/terminal/scan", label: "Terminal", matchPrefix: "/terminal" },
    { path: "/autotrade", label: "AutoTrade" },
    { path: "/ai-arena", label: "AI Research", matchPrefix: "/ai-arena" },
    { path: "/market-pulse", label: "Pulse" },
    { path: "/crypto-news", label: "News" },
    { path: "/onchain", label: "On-Chain" },
    { path: "/bitcoin", label: t("nav.bitcoin") },
    { path: "/markets", label: t("nav.markets") },
    { path: "/journal", label: "Journal" },
  ];

  // Paths that live in More only (main nav already has Terminal + AI Research).
  // Used solely for the More trigger "active" underline.
  const moreMenuItems = [
    {
      path: "/money-flow",
      label: "Money Flow",
      icon: "🌊",
      description: "Where capital is rotating — sectors, coins, whales",
    },
    {
      path: "/delistings",
      label: "Delistings",
      icon: "🚫",
      description: "Exchange delisting alerts — tokens often pump after",
    },
    {
      path: "/portfolio",
      label: "Portfolio",
      icon: "💼",
      description: "Track PnL, equity curve & trade history",
    },
    {
      path: "/performance",
      label: "Performance",
      icon: "📈",
      description: "Track record, daily snapshot & multi-day research",
    },
    {
      path: "/orderbook",
      label: t("nav.orderbook"),
      icon: "📊",
      description: t("desc.orderbook"),
    },
    {
      path: "/calendar",
      label: t("nav.calendar"),
      icon: "📅",
      description: t("desc.calendar"),
    },
    {
      path: "/tips",
      label: t("nav.tips"),
      icon: "📚",
      description: t("desc.tips"),
    },
    {
      path: "/watchlist",
      label: t("nav.watchlist"),
      icon: "⭐",
      description: t("desc.watchlist"),
    },
    {
      path: "/referral",
      label: "Referral",
      icon: "🎟️",
      description: "Earn commissions by inviting friends",
    },
    ...(isAdmin
      ? [
          {
            path: "/admin",
            label: t("nav.admin"),
            icon: "🛡️",
            description: t("desc.admin"),
          },
        ]
      : []),
  ];

  const moreHasActive = moreMenuItems.some((item) => isActive(item.path));

  // ════════════════════════════════════════════════════════
  // Mobile bottom nav — request user:
  // Home · Pulse (heart-activity) · Trade (center, glow) · Arena (Bot/Robot) · Market (candlesticks)
  // ════════════════════════════════════════════════════════
  const bottomNavItems = [
    {
      path: "/home",
      label: t("nav.home"),
      icon: (
        <svg
          className="w-[20px] h-[20px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      path: "/terminal/scan",
      label: "Terminal",
      icon: (
        // Panelled workspace — the research desk
        <svg
          className="w-[20px] h-[20px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="16" x="3" y="4" rx="2" />
          <path d="M3 10h18M10 10v10" />
        </svg>
      ),
    },
    {
      path: "/signals",
      label: "Signals",
      isCenter: true,
      icon: (
        // Arrows-swap — iconic untuk trade
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      ),
    },
    {
      // Slot 4 goes to Pulse on the numbers, not on intuition: over 30 days of
      // user_activity_events, market_pulse drew 136 distinct users against 39
      // for news, while autotrade — which held this slot — has not logged a
      // single event since 2026-06-10.
      path: "/market-pulse",
      label: "Pulse",
      icon: (
        // Lucide "activity" — a heartbeat line, which is what Pulse is
        <svg
          className="w-[20px] h-[20px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.68 3.18a.5.5 0 0 0-.96 0l-2.35 8.36A2 2 0 0 1 4.44 13H2" />
        </svg>
      ),
    },
    {
      // Not a route — opens the overflow sheet. Every major exchange app hides
      // its long tail behind a hub, but this Home is a market-overview page
      // that links nowhere internally, so the tail needs its own entry. iOS
      // tab bars solve the >5-destination case the same way.
      isMore: true,
      label: "More",
      icon: (
        <svg
          className="w-[20px] h-[20px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <div className="luxury-bg" />

      {/* ══════════════════════════════════════════════
 HEADER — solid desk chrome
 Bright: always solid white bar + edge shadow
 Dark themes: transparent at top → solid on scroll
 Active nav: gold underline (theme-safe, never pure white)
 ══════════════════════════════════════════════ */}
      <header
        className={`lq-app-header sticky top-0 z-50 border-b transition-colors duration-200 ${
          headerSolid
            ? "border-ink/[0.1] bg-surface-raised/98 backdrop-blur-md"
            : "border-ink/[0.06] bg-transparent"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            <div className="flex items-center gap-2 lg:gap-6">
              {/* No hamburger: the overflow menu is reached from the More tab in
                  the bottom bar. Top-left is the hardest corner of a phone to
                  reach one-handed, and hidden navigation measurably costs task
                  completion — the long tail belongs in the thumb zone. */}

              {/* Logo — bold wordmark, solid mark tile */}
              <div
                className="flex items-center gap-2.5 cursor-pointer group"
                onClick={() => handleNav("/home")}
              >
                <div className="w-8 h-8 lg:w-9 lg:h-9 relative rounded-md overflow-hidden border border-ink/[0.12] shadow-sm bg-surface-secondary">
                  <img
                    src="/logo.png"
                    alt="LuxQuant"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <h1 className="text-[15px] lg:text-[16px] font-semibold text-text-primary tracking-[-0.02em] leading-none group-hover:text-text-primary transition-colors">
                  LuxQuant
                </h1>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-0.5">
                {navItems.map((item) => {
                  const active = item.matchPrefix
                    ? location.pathname.startsWith(item.matchPrefix)
                    : isActive(item.path);
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNav(item.path)}
                      className={`relative px-3 py-1.5 text-[13px] font-medium rounded-md border transition-all duration-150 ${
                        active
                          ? "text-text-primary border-transparent"
                          : "text-text-secondary border-transparent hover:text-text-primary hover:bg-ink/[0.06] hover:border-ink/[0.1]"
                      }`}
                    >
                      {item.label}
                      {active && (
                        <span className="absolute left-3 right-3 -bottom-[17px] h-[2.5px] rounded-full bg-accent" />
                      )}
                    </button>
                  );
                })}
                <MoreMenuDropdown
                  label={t("nav.more")}
                  moreHasActive={moreHasActive}
                  isActive={isActive}
                  isPremium={isPremiumUser()}
                  isAdmin={isAdmin}
                  premiumPaths={PREMIUM_REQUIRED}
                  onNavigate={handleNav}
                />
              </nav>
            </div>

            {/* RIGHT SIDE */}
            <div className="flex items-center gap-1.5 lg:gap-2">
              {/* EN/ZH toggle — Flowscan filter pill */}
              <div className="flex items-center gap-0.5 p-0.5 mr-1 rounded-sm bg-ink/[0.03] border border-ink/[0.06]">
                {["en", "zh"].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => i18n.changeLanguage(lang)}
                    className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider rounded-sm transition-colors ${
                      i18n.language?.startsWith(lang)
                        ? "bg-ink/10 text-text-primary border border-ink/[0.08]"
                        : "text-text-muted hover:text-text-primary border border-transparent"
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
 MOBILE SLIDE MENU
 Bottom SHEET, not a left drawer: it is opened by the More tab in the
 bottom bar, so it rises from the same place the thumb already is.
 - bottom-16: rests on top of the bottom nav, never covers it
 - scrim also stops at bottom-16 so More stays tappable to close
 - Admin section at TOP (after Navigation header)
 ══════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-x-0 top-0 bottom-16 z-40 bg-scrim/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <div
        className={`fixed inset-x-0 bottom-16 z-50 max-h-[72vh] rounded-t-2xl border-t border-ink/[0.08] bg-surface backdrop-blur-xl transform transition-transform duration-300 ease-out lg:hidden ${
          mobileMenuOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* grab handle — signals "drag/tap to dismiss", standard sheet affordance */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-9 rounded-full bg-ink/20" />
        </div>
        <div className="flex max-h-[calc(72vh-1.5rem)] flex-col">
          <nav className="flex-1 py-3 pb-8 px-3 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* ═══════════ ADMIN SECTION (top priority for admins) ═══════════ */}
            {isAdmin && (
              <>
                <div className="flex items-center gap-2 px-3 mb-3">
                  <span className="h-px w-4 bg-loss/40" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-loss/80">
                    Admin
                  </span>
                </div>
                <SidebarItem
                  active={isActive("/admin")}
                  path="/admin"
                  onClick={() => handleNav("/admin")}
                  label={t("nav.admin")}
                  isAdminAccent
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                    />
                  }
                />
              </>
            )}

            {/* ═══════════ Navigation section ═══════════ */}
            <div className={`flex items-center gap-2 px-3 mb-3 ${isAdmin ? "mt-5" : ""}`}>
              <span className="h-px w-4 bg-accent/40" />
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-muted">
                Navigation
              </span>
            </div>

            <SidebarItem
              active={isActive("/home")}
              path="/home"
              onClick={() => handleNav("/home")}
              label={t("nav.home")}
              isFreeBadge
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"
                />
              }
            />
            {/* Market Pulse — activity/heartbeat (nyambung dgn "Pulse") */}
            <SidebarItem
              active={isActive("/market-pulse")}
              path="/market-pulse"
              onClick={() => handleNav("/market-pulse")}
              label="Market Pulse"
              isFreeBadge
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.7}
                  d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.68 3.18a.5.5 0 0 0-.96 0l-2.35 8.36A2 2 0 0 1 4.44 13H2"
                />
              }
            />
            <SidebarItem
              active={isActive("/crypto-news")}
              path="/crypto-news"
              onClick={() => handleNav("/crypto-news")}
              label="Crypto News"
              isFreeBadge
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
                />
              }
            />
            <SidebarItem
              active={isActive("/onchain")}
              path="/onchain"
              onClick={() => handleNav("/onchain")}
              label="On-Chain"
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                />
              }
            />
            <SidebarItem
              active={isActive("/signals")}
              path="/signals"
              onClick={() => handleNav("/signals")}
              label={t("nav.signals")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              }
            />
            <SidebarItem
              active={isActive("/autotrade")}
              path="/autotrade"
              onClick={() => handleNav("/autotrade")}
              label="AutoTrade"
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              }
            />
            {/* AI Arena — Bot icon, jelas banget "AI" */}
            <SidebarItem
              active={isActive("/ai-arena")}
              path="/ai-arena"
              onClick={() => handleNav("/ai-arena")}
              label="AI Research"
              isPremium={!isPremiumUser()}
              icon={
                <>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8V4H8"
                  />
                  <rect
                    x="4"
                    y="8"
                    width="16"
                    height="12"
                    rx="2"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M2 14h2M20 14h2M15 13v2M9 13v2"
                  />
                </>
              }
            />
            {/* Money Flow — waves (capital rotation) */}
            <SidebarItem
              active={isActive("/money-flow")}
              path="/money-flow"
              onClick={() => handleNav("/money-flow")}
              label="Money Flow"
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7.5c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M3 12c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M3 16.5c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"
                />
              }
            />
            {/* Delistings — exchange delist alerts + pump tracker */}
            <SidebarItem
              active={isActive("/delistings")}
              path="/delistings"
              onClick={() => handleNav("/delistings")}
              label="Delistings"
              isPremium={!isPremiumUser()}
              icon={
                <>
                  <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
                  <line
                    x1="5.6"
                    y1="5.6"
                    x2="18.4"
                    y2="18.4"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                </>
              }
            />
            {/* Performance — unified hub (Overview / Daily / Research) */}
            <SidebarItem
              active={isActive("/performance")}
              path="/performance"
              onClick={() => handleNav("/performance")}
              label="Performance"
              isFreeBadge
              icon={
                <>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M22 7l-8.5 8.5-5-5L2 17"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7h6v6"
                  />
                </>
              }
            />
            <SidebarItem
              active={isActive("/journal")}
              path="/journal"
              onClick={() => handleNav("/journal")}
              label="Journal"
              isFreeBadge
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              }
            />
            <SidebarItem
              active={isActive("/bitcoin")}
              path="/bitcoin"
              onClick={() => handleNav("/bitcoin")}
              label={t("nav.bitcoin")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              }
            />
            {/* Markets — candlestick chart, lebih crypto-market */}
            <SidebarItem
              active={isActive("/markets")}
              path="/markets"
              onClick={() => handleNav("/markets")}
              label={t("nav.markets")}
              isPremium={!isPremiumUser()}
              icon={
                <>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 4v3M8 17v3"
                  />
                  <rect
                    x="6"
                    y="7"
                    width="4"
                    height="10"
                    rx="1"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 2v4M16 18v4"
                  />
                  <rect
                    x="14"
                    y="6"
                    width="4"
                    height="12"
                    rx="1"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              }
            />

            {/* ═══════════ Tools section ═══════════ */}
            <div className="flex items-center gap-2 px-3 mt-5 mb-3">
              <span className="h-px w-4 bg-accent/40" />
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-muted">
                Tools
              </span>
            </div>

            <SidebarItem
              active={isActive("/portfolio")}
              path="/portfolio"
              onClick={() => handleNav("/portfolio")}
              label="Portfolio"
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
                />
              }
            />
            <SidebarItem
              active={isActive("/orderbook")}
              path="/orderbook"
              onClick={() => handleNav("/orderbook")}
              label={t("nav.orderbook")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 4h18M3 8h18M3 12h12M3 16h8M3 20h4"
                />
              }
            />
            <SidebarItem
              active={isActive("/calendar")}
              path="/calendar"
              onClick={() => handleNav("/calendar")}
              label={t("nav.calendar")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                />
              }
            />
            <SidebarItem
              active={isActive("/tips")}
              path="/tips"
              onClick={() => handleNav("/tips")}
              label={t("nav.tips")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              }
            />

            {/* ═══════════ Personal section ═══════════ */}
            <div className="flex items-center gap-2 px-3 mt-5 mb-3">
              <span className="h-px w-4 bg-accent/40" />
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-muted">
                Personal
              </span>
            </div>

            <SidebarItem
              active={isActive("/watchlist")}
              path="/watchlist"
              onClick={() => handleNav("/watchlist")}
              label={t("nav.watchlist")}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              }
            />
            <SidebarItem
              active={isActive("/referral")}
              path="/referral"
              onClick={() => handleNav("/referral")}
              label="Referral"
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
              }
            />
            <SidebarItem
              active={isActive("/api-keys")}
              path="/api-keys"
              onClick={() => handleNav("/api-keys")}
              label={t("nav.api_keys", { defaultValue: "API Keys" })}
              isPremium={!isPremiumUser()}
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                />
              }
            />
          </nav>
        </div>
      </div>

      {/* MAIN CONTENT — route boundary keeps shell/nav alive on page crash (desktop + mobile) */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 pb-24 lg:pb-6">
        <RouteErrorBoundary>
          <Suspense fallback={<ContentLoader />}>{children}</Suspense>
        </RouteErrorBoundary>
      </main>

      {/* Footer — full-width, all content pages (exchange-style).
 Hidden on viewport-locked terminals & admin — see showFooter above. */}
      {showFooter && (
        <div className="pb-20 lg:pb-0">
          <Suspense fallback={null}>
            <FooterV2 onNav={() => navigate("/")} />
          </Suspense>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
 MOBILE BOTTOM NAV — Trade center button: BIGGER + GOLD GLOW HALO
 (Home · Pulse · Trade ✨ · Arena · Market)
 ══════════════════════════════════════════════════════════════ */}
      <nav data-lq-bottomnav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
        <div className="bg-bg-primary/90 backdrop-blur-xl">
          <div className="flex items-end justify-around h-16 px-2 max-w-lg mx-auto relative">
            {bottomNavItems.map((item) => {
              const active = item.isMore ? mobileMenuOpen : isActive(item.path);

              if (item.isCenter) {
                // ════════════════════════════════════════
                // CENTER BUTTON — bigger + gold glow halo
                // (animate-pulse always on, intensifies when active)
                // ════════════════════════════════════════
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item.path)}
                    className="relative -mt-6 flex flex-col items-center group"
                  >
                    {/* Outer glow halo — always alive, brighter when active */}
                    {/* Inner button — solid yellow when active (Binance dock pattern) */}
                    <div
                      className={`relative flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-200 ${
                        active
                          ? "bg-accent shadow-cta"
                          : "border border-ink/10 bg-surface-raised group-hover:border-ink/20"
                      }`}
                    >
                      <span
                        className={
                          active
                            ? "text-accent-fg"
                            : "text-text-muted group-hover:text-text-primary"
                        }
                      >
                        {item.icon}
                      </span>
                    </div>
                    <span
                      className={`mt-1.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                        active ? "font-semibold text-accent" : "text-text-muted"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={item.path || item.label}
                  onClick={() =>
                    item.isMore ? setMobileMenuOpen((v) => !v) : handleNav(item.path)
                  }
                  aria-expanded={item.isMore ? mobileMenuOpen : undefined}
                  aria-label={item.isMore ? "More destinations" : undefined}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 min-w-[52px] relative group"
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-accent/80" />
                  )}
                  <span
                    className={`transition-colors ${
                      active ? "text-accent" : "text-text-muted group-hover:text-text-secondary"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wider transition-colors ${
                      active ? "text-accent" : "text-text-muted group-hover:text-text-secondary"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="bg-bg-primary/90 h-safe-area-bottom" />
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
      <Helmet>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <LoginPage />
    </Suspense>
  );
}

// ════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════
function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <ErrorBoundary>
              <InAppBrowserBanner />
              <TelegramNudgeModal />
              <AnnouncementModal />
              <CurrencyProvider>
                <Routes>
                  {/* Landing — V2 primary (desktop + mobile) */}
                  <Route
                    path="/"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <LandingPageV2 />
                      </Suspense>
                    }
                  />
                  {/* Legacy v1 landing retired → redirect */}
                  <Route path="/v1" element={<Navigate to="/" replace />} />

                  {/* Auth */}
                  <Route path="/login" element={<LoginPageWrapper />} />
                  <Route
                    path="/auth/google/callback"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <GoogleCallback />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/auth/discord/callback"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <DiscordCallback />
                      </Suspense>
                    }
                  />
                  <Route path="/register" element={<Navigate to="/login" replace />} />

                  {/* PUBLIC STATUS PAGE — no auth, standalone (own layout).
 Must stay reachable when the app shell / auth is unhappy. */}
                  <Route
                    path="/status"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <StatusPage />
                      </Suspense>
                    }
                  />

                  {/* PUBLIC */}
                  <Route
                    path="/home"
                    element={
                      <AppShell>
                        <OverviewPage />
                      </AppShell>
                    }
                  />
                  {/* PUBLIC — content engine (indexable, no auth) */}
                  <Route
                    path="/learn"
                    element={
                      <AppShell>
                        <LearnPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/learn/:slug"
                    element={
                      <AppShell>
                        <LearnPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/blog"
                    element={
                      <AppShell>
                        <BlogPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/blog/:slug"
                    element={
                      <AppShell>
                        <BlogPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/coins"
                    element={
                      <AppShell>
                        <CoinsPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/coins/:slug"
                    element={
                      <AppShell>
                        <CoinsPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/market-pulse"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <MarketPulsePage />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/crypto-news"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <CryptoNewsPage />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/pricing"
                    element={
                      <AppShell>
                        <PricingPage />
                      </AppShell>
                    }
                  />
                  <Route
                    path="/payment"
                    element={
                      <AppShell>
                        <PaymentPage />
                      </AppShell>
                    }
                  />
                  {/* Unified Performance hub (Overview / Daily / Research) */}
                  <Route
                    path="/performance"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PerformanceHub />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* Legacy routes → redirect into the hub (keep bookmarks alive) */}
                  <Route
                    path="/analytics"
                    element={<Navigate to="/performance?view=overview" replace />}
                  />
                  <Route
                    path="/daily-performance"
                    element={<Navigate to="/performance?view=daily" replace />}
                  />
                  <Route
                    path="/daily-performance/edge-lab"
                    element={<Navigate to="/performance?view=research" replace />}
                  />
                  <Route
                    path="/journal"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <JournalPage />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/assistant"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <AssistantFullPage />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/referral"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <ReferralPage />
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <AccountLayout>
                            <ProfilePage />
                          </AccountLayout>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/api-keys"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <AccountLayout>
                              <ApiKeysPage />
                            </AccountLayout>
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <AccountLayout>
                            <NotificationsPage />
                          </AccountLayout>
                        </AppShell>
                      </RequireAuth>
                    }
                  />

                  {/* PREMIUM */}
                  <Route
                    path="/signals"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <SignalsPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* ══════════════════════════════════════════════
 LUXQUANT TERMINAL — left-nav research terminal.
 Hosts EXISTING pages as sections (Screener = SignalsPage,
 Market Map = SignalTerminalPage, Edge Lab, Money Flow,
 Pulse, Watchlist — all reused, not rebuilt) + NEW views
 (Trade Replay). Index redirects to Market Map keeping the
 query string, so the old TERMINAL-button flow is intact.
 ══════════════════════════════════════════════ */}
                  <Route
                    path="/terminal"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <TerminalLayout />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  >
                    <Route index element={<TerminalIndex />} />
                    <Route path="scan" element={<SignalsAnalytics />} />
                    <Route path="map" element={<SignalTerminalPage />} />
                    <Route path="*" element={<TerminalIndex />} />
                  </Route>
                  <Route
                    path="/autotrade"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <AutoTradePage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/portfolio"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <PortfolioPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* /ai-arena now renders v6 directly. Legacy v4 still accessible at /ai-arena/legacy for rollback. */}
                  <Route
                    path="/ai-arena"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <AIArenaPageV6 />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route path="/ai-arena/v6" element={<Navigate to="/ai-arena" replace />} />
                  {/* Legacy arena retired — single V6 path for desktop + mobile */}
                  <Route path="/ai-arena/legacy" element={<Navigate to="/ai-arena" replace />} />
                  <Route
                    path="/bitcoin"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <BitcoinPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/markets"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <MarketsPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/watchlist"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <AccountLayout>
                              <WatchlistTabs />
                            </AccountLayout>
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/tips"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <TipsPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/orderbook"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <OrderBookPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <MacroCalendarPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* Money Flow — payung sektor/koin/whale (Whale Alert jadi tab di dalamnya) */}
                  <Route
                    path="/money-flow"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <MoneyFlowPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* Exchange Delistings — alert + pump-after-delist tracker */}
                  <Route
                    path="/delistings"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <DelistingsPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />
                  {/* /whale lama → redirect ke /money-flow (Whale Alert sekarang tab di sana) */}
                  <Route path="/whale" element={<Navigate to="/money-flow" replace />} />
                  <Route
                    path="/onchain"
                    element={
                      <RequireAuth>
                        <AppShell>
                          <PremiumGate>
                            <OnchainPage />
                          </PremiumGate>
                        </AppShell>
                      </RequireAuth>
                    }
                  />

                  {/* ADMIN */}
                  <Route path="/admin" element={<Navigate to="/admin/workspace" replace />} />
                  <Route
                    path="/admin/workspace"
                    element={
                      <RequireAuth>
                        <RequireAdmin>
                          <AppShell>
                            <AdminWorkspacePage />
                          </AppShell>
                        </RequireAdmin>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/users"
                    element={<Navigate to="/admin/workspace#users" replace />}
                  />
                  <Route
                    path="/admin/status"
                    element={<Navigate to="/admin/workspace#status" replace />}
                  />

                  {/* Backward compat — old /terminal/<page> URLs from the legacy
 URL scheme. watchlist is NOT redirected anymore (it's now a
 real terminal section); unknown children are handled by the
 terminal's own catch-all. */}
                  <Route path="/terminal/referral" element={<Navigate to="/referral" replace />} />
                  <Route path="/terminal/pricing" element={<Navigate to="/pricing" replace />} />
                  <Route path="/terminal/payment" element={<Navigate to="/payment" replace />} />

                  {/* Legacy landing aliases → primary home */}
                  <Route path="/v2" element={<Navigate to="/" replace />} />

                  {/* 404 */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </CurrencyProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
