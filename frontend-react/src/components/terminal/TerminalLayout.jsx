// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — left-nav shell (Allium-style)
// Route: /terminal/* — hosts EXISTING pages as sections (reuse, never
// rebuild) + NEW research views (Trade Replay, …).
//
//   · Desktop: fixed left rail (collapsible to icons)
//   · Mobile: horizontal scrollable section chips (AppShell already
//     provides the bottom quick-nav)
//   · Query string is PRESERVED when switching sections — the shared
//     signal filters (utils/signalFilters.js) carry across Screener ⇄
//     Market Map exactly like the old TERMINAL button behavior.
// ════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// ── section registry ────────────────────────────────────────────
// icon: bare 1.5-stroke SVG paths (same language as App.jsx NAV_ICON_PATHS)
const SECTIONS = [
  {
    group: "signals",
    items: [
      {
        id: "scan",
        isNew: true,
        icon: (
          <>
            <circle cx="10" cy="10" r="6" />
            <path d="M14.5 14.5 L21 21" />
            <path d="M7.5 10 h5 M10 7.5 v5" strokeOpacity="0.55" />
          </>
        ),
      },
      {
        id: "map",
        icon: (
          <>
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="12" y1="3" x2="12" y2="21" />
            <line x1="12" y1="12" x2="21" y2="12" />
            <line x1="3" y1="16" x2="12" y2="16" />
          </>
        ),
      },
    ],
  },
  {
    group: "analytics",
    items: [
      {
        id: "edge",
        icon: (
          <>
            <path d="M3 3 v18 h18" />
            <path d="M7 14 l4-4 4 4 6-6" />
            <path d="M17 8 h4 v4" />
          </>
        ),
      },
      {
        id: "moneyflow",
        icon: (
          <>
            <path d="M3 8c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
            <path d="M3 14c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
          </>
        ),
      },
      {
        id: "pulse",
        icon: <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />,
      },
    ],
  },
  {
    group: "personal",
    items: [
      {
        id: "watchlist",
        icon: (
          <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
        ),
      },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

// index redirect that PRESERVES the query string (filters carried from
// the Potential Trades "TERMINAL" button keep working unchanged).
export function TerminalIndexRedirect() {
  const location = useLocation();
  return <Navigate to={`map${location.search}`} replace />;
}

export default function TerminalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // active section = first path segment after /terminal/
  const seg = location.pathname.replace(/^\/terminal\/?/, "").split("/")[0] || "map";
  const activeItem = ALL_ITEMS.find((i) => i.id === seg);

  const goSection = (id) => {
    // sections manage their own query params — switch with a clean URL
    // except Market Map ⇄ shared signal filters (compatible keys).
    const search = id === "map" ? location.search : "";
    navigate(`/terminal/${id}${search}`);
  };

  const NavButton = ({ item, horizontal = false }) => {
    const active = seg === item.id;
    return (
      <button
        onClick={() => goSection(item.id)}
        title={collapsed && !horizontal ? t(`terminal.nav.${item.id}`) : undefined}
        className={
          horizontal
            ? `flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md border font-mono text-[10.5px] uppercase tracking-wider transition-colors ${
                active
                  ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
                  : "bg-white/[0.03] text-text-muted border-white/[0.06] hover:text-white hover:bg-white/[0.06]"
              }`
            : `group relative w-full flex items-center gap-3 rounded-md py-2.5 transition-colors ${
                collapsed ? "justify-center px-0" : "pl-3 pr-2"
              } ${active ? "bg-white/[0.04]" : "hover:bg-white/[0.04]"}`
        }
      >
        {!horizontal && active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
            style={{
              background: "rgb(212,168,83)",
              boxShadow: "0 0 6px rgba(212,168,83,0.6)",
            }}
          />
        )}
        <svg
          className={`w-[17px] h-[17px] flex-shrink-0 transition-colors ${
            active ? "text-gold-primary" : "text-white/70 group-hover:text-white"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          {item.icon}
        </svg>
        {(horizontal || !collapsed) && (
          <span
            className={`text-left leading-tight ${
              horizontal
                ? ""
                : `text-[12.5px] tracking-tight transition-colors flex-1 min-w-0 ${
                    active ? "text-gold-primary" : "text-white/90 group-hover:text-white"
                  }`
            }`}
          >
            {t(`terminal.nav.${item.id}`)}
          </span>
        )}
        {!horizontal && !collapsed && item.isNew && (
          <span className="ml-auto shrink-0 font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-gold-primary/15 text-gold-primary border border-gold-primary/25">
            New
          </span>
        )}
      </button>
    );
  };

  return (
    // AppShell already provides the max-w container + padding — no extra here.
    <div>
      {/* ── terminal top strip: breadcrumb + section title ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
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
          <span className="text-[13px] text-white/90 truncate">
            {activeItem ? t(`terminal.nav.${seg}`) : ""}
          </span>
        </div>
        <div className="hidden lg:block font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">
          {activeItem ? t(`terminal.nav.${seg}_desc`) : t("terminal.subtitle")}
        </div>
      </div>

      {/* ── mobile: horizontal section chips ── */}
      <div className="lg:hidden -mx-3 px-3 mb-4 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {ALL_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} horizontal />
        ))}
      </div>

      <div className="flex gap-4 lg:gap-5 items-start">
        {/* ── desktop left rail ── */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 sticky top-[80px] transition-all duration-200 ${
            collapsed ? "w-[52px]" : "w-[196px]"
          }`}
        >
          <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <nav className="p-2 space-y-3">
              {SECTIONS.map((section) => (
                <div key={section.group}>
                  {!collapsed && (
                    <div className="flex items-center gap-2 px-2 mb-1.5">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.25em] text-text-muted/70">
                        {t(`terminal.groups.${section.group}`)}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.05]" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <NavButton key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="w-full flex items-center justify-center gap-2 py-2 border-t border-white/[0.06] text-text-muted hover:text-white transition-colors"
              title={collapsed ? t("terminal.expand") : t("terminal.collapse")}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M15 6 L9 12 L15 18" />
              </svg>
              {!collapsed && (
                <span className="font-mono text-[9px] uppercase tracking-wider">
                  {t("terminal.collapse")}
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* ── section content ── */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
