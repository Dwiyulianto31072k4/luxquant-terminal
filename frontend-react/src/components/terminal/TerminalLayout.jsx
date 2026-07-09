// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — slim shell + SHARED Allium-style tab bar.
//
// The terminal is SIGNALS-ONLY: the visual layer of Potential Trades
// (7-day window). No left rail — Edge Lab / Money Flow / Pulse /
// Watchlist live on their own pages.
//
// The tab bar lives HERE (not in the page) so Market Map can stay its
// own route: SignalTerminalPage owns its query-string filters and
// would otherwise wipe a ?tab= param.
//   · Overview / Anomaly / Live / BTC / Sectors → /terminal/scan?tab=X
//   · Market Map                               → /terminal/map (+filters)
// ════════════════════════════════════════════════════════════════
import { Outlet, useNavigate, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

// index redirect that PRESERVES the query string (filters carried from
// the Potential Trades "TERMINAL" button land on Market Map).
export function TerminalIndexRedirect() {
  const location = useLocation();
  return <Navigate to={`map${location.search}`} replace />;
}

const TABS = [
  ["overview", "scan"],
  ["anomaly", "scan"],
  ["live", "scan"],
  ["btc", "scan"],
  ["sectors", "scan"],
  ["map", "map"],
];

export default function TerminalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isMap = location.pathname.startsWith("/terminal/map");
  const active = isMap ? "map" : searchParams.get("tab") || "overview";

  const go = (id, route) => {
    if (route === "map") navigate("/terminal/map");
    else navigate(`/terminal/scan${id === "overview" ? "" : `?tab=${id}`}`);
  };

  return (
    <div>
      {/* ── breadcrumb strip ── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate("/signals")}
            className="hidden sm:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted hover:text-white transition-colors"
          >
            {t("terminal.backToSignals")}
          </button>
          <span className="hidden sm:inline text-white/20">/</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/90 truncate">
            {t("terminal.title")}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[13px] text-white/90 truncate">{t("terminal.nav.scan")}</span>
        </div>
        <div className="hidden lg:block font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">
          {t("terminal.nav.scan_desc")}
        </div>
      </div>

      {/* ── Allium-style tab bar: raised dark bar, compact tabs left ── */}
      <div className="mb-3 rounded-lg bg-[#0c0a07] border border-white/[0.07] px-2 flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map(([id, route]) => (
          <button
            key={id}
            onClick={() => go(id, route)}
            className={`relative shrink-0 px-3.5 py-2.5 text-[12.5px] transition-colors ${
              active === id ? "text-gold-primary" : "text-text-muted hover:text-white"
            }`}
          >
            {t(`terminal.viz.tab${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
            {active === id && (
              <span className="absolute left-3 right-3 bottom-0 h-[2px] bg-gold-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
