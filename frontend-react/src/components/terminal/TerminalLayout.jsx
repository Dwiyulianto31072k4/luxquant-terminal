// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — shell with Allium-style SIDE navigation.
//
// Signals-only terminal (visual layer of Potential Trades, 7d).
// Left sidebar = grouped sections (like Allium's Deep Dives/Sectors):
//   SIGNALS      Overview · Live · Anomaly
//   DERIVATIVES  Open Interest · Long/Short · Funding & Squeeze
//   MARKET       vs BTC · Sectors · Market Map
//
// All except Market Map are tabs of /terminal/scan (?tab=). Market Map
// keeps its own route so its filter query params never clash.
// ════════════════════════════════════════════════════════════════
import { Outlet, useNavigate, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignalStatusProvider } from "../../context/SignalStatusContext";
import GlobalSignalModalHost from "../SignalStatusModal";

// index redirect that PRESERVES the query string (TERMINAL button → map)
export function TerminalIndexRedirect() {
  const location = useLocation();
  return <Navigate to={`map${location.search}`} replace />;
}

const GROUPS = [
  { g: "gSignals", items: [["confluence", "scan"], ["overview", "scan"], ["live", "scan"], ["anomaly", "scan"]] },
  { g: "gDeriv", items: [["oi", "scan"], ["ls", "scan"], ["funding", "scan"], ["squeeze", "scan"]] },
  { g: "gMarket", items: [["vsbtc", "scan"], ["btc", "scan"], ["momentum", "scan"], ["sectors", "scan"]] },
  { g: "gEdge", items: [["edge", "scan"]] },
  { g: "gMarketMap", items: [["treemap", "map"], ["bubble", "map"], ["matrix", "map"], ["explore", "map"]] },
];
const ALL_ITEMS = GROUPS.flatMap((x) => x.items);

const tabKey = (id) => `terminal.viz.tab${id.charAt(0).toUpperCase()}${id.slice(1)}`;

// ── per-tab glyphs — solid LuxQuant gold via currentColor ──
const ICON_PATHS = {
  confluence: <><circle cx="9" cy="12" r="5.2" opacity="0.55" /><circle cx="15" cy="12" r="5.2" opacity="0.55" /></>,
  overview: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.4" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" opacity="0.6" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" opacity="0.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" /></>,
  live: <><path d="M2 12h4l2.5-7 4 15 3-9 2.5 4H22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
  anomaly: <><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></>,
  oi: <><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="6" width="4" height="15" rx="1" opacity="0.6" /><rect x="17" y="9" width="4" height="12" rx="1" /></>,
  ls: <><path d="M7 3 3 8h3v13h2V8h3zM17 21l4-5h-3V3h-2v13h-3z" /></>,
  funding: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" opacity="0.6" /><path d="M6 18 18 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  vsbtc: <><path d="M3 8h13l-3-3 1.4-1.4L20 9l-5.6 5.4L13 13l3-3H3zM21 16H8l3 3-1.4 1.4L4 15l5.6-5.4L11 11l-3 3h13z" opacity="0.85" /></>,
  btc: <><circle cx="12" cy="12" r="9.2" opacity="0.5" /><path d="M10 7h3.2c1.6 0 2.6 1 2.6 2.3 0 1-.6 1.7-1.4 2 1 .3 1.7 1.1 1.7 2.2 0 1.5-1.1 2.5-2.9 2.5H10zm2 2v2h1.1c.7 0 1.1-.4 1.1-1s-.4-1-1.1-1zm0 3.6V15h1.3c.8 0 1.2-.4 1.2-1.1s-.5-1.1-1.3-1.1zM11 5h1.5v2H11zm0 12h1.5v2H11z" /></>,
  sectors: <><path d="M12 3a9 9 0 1 0 9 9h-9z" opacity="0.55" /><path d="M11 3v8H3a9 9 0 0 1 8-8z" /></>,
  map: <><rect x="3" y="3" width="11" height="18" rx="1.4" /><rect x="15" y="3" width="6" height="8" rx="1.4" opacity="0.6" /><rect x="15" y="13" width="6" height="8" rx="1.4" opacity="0.6" /></>,
  treemap: <><rect x="3" y="3" width="11" height="18" rx="1.4" /><rect x="15" y="3" width="6" height="8" rx="1.4" opacity="0.6" /><rect x="15" y="13" width="6" height="8" rx="1.4" opacity="0.6" /></>,
  bubble: <><circle cx="8" cy="14" r="4.5" /><circle cx="16" cy="8" r="3" opacity="0.6" /><circle cx="18" cy="17" r="2.2" opacity="0.6" /></>,
  matrix: <><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="10" y="3" width="5" height="5" rx="1" opacity="0.6" /><rect x="17" y="3" width="4" height="5" rx="1" /><rect x="3" y="10" width="5" height="5" rx="1" opacity="0.6" /><rect x="10" y="10" width="5" height="5" rx="1" /><rect x="17" y="10" width="4" height="5" rx="1" opacity="0.6" /><rect x="3" y="17" width="5" height="4" rx="1" /><rect x="10" y="17" width="5" height="4" rx="1" opacity="0.6" /><rect x="17" y="17" width="4" height="4" rx="1" /></>,
  momentum: <><path d="M3 17l5-5 4 3 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M16 5h5v5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>,
  squeeze: <><rect x="4" y="9" width="16" height="6" rx="1.5" /><path d="M3 4v5M3 15v5M21 4v5M21 15v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  explore: <><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.55" /><circle cx="12" cy="12" r="2.3" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  edge: <><path d="M3 20h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" /><circle cx="7" cy="14" r="2.1" /><circle cx="12" cy="9" r="2.1" opacity="0.7" /><circle cx="17" cy="6" r="2.1" /><path d="M7 14 12 9l5-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" /></>,
};
const TabIcon = ({ id }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px] shrink-0" aria-hidden="true">
    {ICON_PATHS[id] || <rect x="4" y="4" width="16" height="16" rx="2" />}
  </svg>
);

export default function TerminalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isMap = location.pathname.startsWith("/terminal/map");
  const active = isMap ? (searchParams.get("view") || "treemap") : searchParams.get("tab") || "confluence";

  const go = (id, route) => {
    if (route === "map") navigate(`/terminal/map?view=${id}`);
    else navigate(`/terminal/scan${id === "confluence" ? "" : `?tab=${id}`}`);
  };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-6rem)] lg:overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0806] p-3 lg:p-4 shadow-2xl shadow-black/40">
      {/* ── breadcrumb strip ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 mb-3">
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
          <span className="text-[13px] text-white/90 truncate">{t(tabKey(active))}</span>
        </div>
        <div className="hidden lg:block font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">
          {t("terminal.nav.scan_desc")}
        </div>
      </div>

      {/* ── mobile: horizontal chips ── */}
      <div className="shrink-0 lg:hidden -mx-3 px-3 mb-3 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {ALL_ITEMS.map(([id, route]) => (
          <button
            key={id}
            onClick={() => go(id, route)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
              active === id
                ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
                : "bg-white/[0.03] text-text-muted border-white/[0.06] hover:text-white"
            }`}
          >
            <TabIcon id={id} />
            {t(tabKey(id))}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-stretch lg:flex-1 lg:min-h-0">
        {/* ── Allium-style left sidebar ── */}
        <aside className="hidden lg:block w-[196px] shrink-0 lg:overflow-y-auto lg:pr-0.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gold-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <nav className="p-2 space-y-3">
              {GROUPS.map(({ g, items }) => (
                <div key={g}>
                  <div className="flex items-center gap-2 px-2 mb-1.5">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.25em] text-text-muted/70">
                      {t(`terminal.viz.${g}`)}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                  </div>
                  <div className="space-y-0.5">
                    {items.map(([id, route]) => (
                      <button
                        key={id}
                        onClick={() => go(id, route)}
                        className={`relative w-full flex items-center pl-3 pr-2 py-2 rounded-md text-left text-[12.5px] transition-colors ${
                          active === id
                            ? "bg-white/[0.04] text-gold-primary"
                            : "text-white/85 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        {active === id && (
                          <span
                            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                            style={{ background: "rgb(212,168,83)", boxShadow: "0 0 6px rgba(212,168,83,0.6)" }}
                          />
                        )}
                        <span className={`flex items-center gap-2.5 ${active === id ? "text-gold-primary" : "text-gold-primary/45"}`}>
                          <TabIcon id={id} />
                          <span className={active === id ? "text-gold-primary" : "text-white/85"}>{t(tabKey(id))}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── content — own scroll region (Allium): never bleeds under the
            global header, page no longer grows forever ── */}
        <main className="flex-1 min-w-0 lg:overflow-y-auto lg:pr-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(212,168,83,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gold-primary/25">
          <SignalStatusProvider>
            <Outlet />
            <GlobalSignalModalHost />
          </SignalStatusProvider>
        </main>
      </div>
    </div>
  );
}
