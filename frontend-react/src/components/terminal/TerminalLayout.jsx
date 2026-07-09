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

// index redirect that PRESERVES the query string (TERMINAL button → map)
export function TerminalIndexRedirect() {
  const location = useLocation();
  return <Navigate to={`map${location.search}`} replace />;
}

const GROUPS = [
  { g: "gSignals", items: [["overview", "scan"], ["live", "scan"], ["anomaly", "scan"]] },
  { g: "gDeriv", items: [["oi", "scan"], ["ls", "scan"], ["funding", "scan"]] },
  { g: "gMarket", items: [["vsbtc", "scan"], ["btc", "scan"], ["sectors", "scan"], ["map", "map"]] },
];
const ALL_ITEMS = GROUPS.flatMap((x) => x.items);

const tabKey = (id) => `terminal.viz.tab${id.charAt(0).toUpperCase()}${id.slice(1)}`;

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
          <span className="text-[13px] text-white/90 truncate">{t(tabKey(active))}</span>
        </div>
        <div className="hidden lg:block font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">
          {t("terminal.nav.scan_desc")}
        </div>
      </div>

      {/* ── mobile: horizontal chips ── */}
      <div className="lg:hidden -mx-3 px-3 mb-3 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {ALL_ITEMS.map(([id, route]) => (
          <button
            key={id}
            onClick={() => go(id, route)}
            className={`shrink-0 px-3 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
              active === id
                ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
                : "bg-white/[0.03] text-text-muted border-white/[0.06] hover:text-white"
            }`}
          >
            {t(tabKey(id))}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        {/* ── Allium-style left sidebar ── */}
        <aside className="hidden lg:block w-[196px] shrink-0 sticky top-[80px]">
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
                        {t(tabKey(id))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── content ── */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
