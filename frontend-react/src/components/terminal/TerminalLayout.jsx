// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — shell with Allium-style SIDE navigation.
//
// Signals-only terminal (visual layer of Potential Trades, 7d).
// Left sidebar = grouped sections (like Allium's Deep Dives/Sectors):
// SIGNALS Overview · Live · Anomaly
// DERIVATIVES Open Interest · Long/Short · Funding & Squeeze
// MARKET vs BTC · Sectors · Market Map
//
// All except Market Map are tabs of /terminal/scan (?tab=). Market Map
// keeps its own route so its filter query params never clash.
// ════════════════════════════════════════════════════════════════
import { Outlet, useNavigate, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignalStatusProvider } from "../../context/SignalStatusContext";
import GlobalSignalModalHost from "../SignalStatusModal";
import AssistantWidget from "../assistant/AssistantWidget";

// index redirect that PRESERVES the query string (TERMINAL button → map)
export function TerminalIndexRedirect() {
 const location = useLocation();
 return <Navigate to={`map${location.search}`} replace />;
}

const GROUPS = [
 { g: "gSignals", items: [["confluence", "scan"], ["overview", "scan"], ["live", "scan"], ["anomaly", "scan"]] },
 { g: "gDeriv", items: [["oi", "scan"], ["ls", "scan"], ["funding", "scan"], ["squeeze", "scan"], ["flow", "scan"], ["liquidations", "scan"]] },
 { g: "gMarket", items: [["vsbtc", "scan"], ["btc", "scan"], ["momentum", "scan"], ["sectors", "scan"]] },
 { g: "gFlow", items: [["tokenflow", "scan"]] },
 { g: "gScreen", items: [["rsi", "scan"], ["atr", "scan"], ["vsqueeze", "scan"]] },
 { g: "gEdge", items: [["edge", "scan"], ["risk", "scan"]] },
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
 risk: <><rect x="4" y="3" width="16" height="18" rx="2" opacity="0.5" /><rect x="7" y="6" width="10" height="3" rx="0.6" fill="currentColor" opacity="0.15" /><circle cx="8.5" cy="12.5" r="1.1" /><circle cx="12" cy="12.5" r="1.1" /><circle cx="15.5" cy="12.5" r="1.1" /><circle cx="8.5" cy="16.5" r="1.1" /><circle cx="12" cy="16.5" r="1.1" /><circle cx="15.5" cy="16.5" r="1.1" /></>,
 rsi: <><circle cx="6" cy="8" r="2" /><circle cx="12" cy="15" r="2" opacity="0.7" /><circle cx="18" cy="6" r="2" /><path d="M3 12h18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" opacity="0.5" /></>,
 atr: <><rect x="3" y="5" width="14" height="3" rx="1" /><rect x="3" y="10.5" width="10" height="3" rx="1" opacity="0.7" /><rect x="3" y="16" width="6" height="3" rx="1" opacity="0.5" /><path d="M20 3v18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" opacity="0.6" /></>,
 vsqueeze: <><path d="M3 6v12M21 6v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 9c3 2 7 2 10 0M7 15c3-2 7-2 10 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" /></>,
 flow: <><path d="M3 16c3 0 3-8 6-8s3 8 6 8 3-8 6-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 20h18" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.4" /></>,
 liquidations: <><path d="M12 2C9 6 6 8 6 13a6 6 0 0 0 12 0c0-2.2-1-3.8-2.3-5.2C15 9 14 9.6 13.4 10.6 13.9 8 12.8 4.6 12 2z" /><path d="M4 21h16" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.4" /></>,
 tokenflow: <><path d="M4 8.5h12l-3.2-3.2M20 15.5H8l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
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
 <div className="flex flex-col lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
 {/* ── product chrome + breadcrumb ── */}
 <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 mb-3 px-0.5">
 <div className="flex items-center gap-2 min-w-0 text-[12px]">
 <span className="font-display text-[15px] font-semibold tracking-tight text-text-primary shrink-0">
 {t("terminal.title")}
 </span>
 <span className="text-text-primary/15">/</span>
 <span className="font-medium text-text-primary/80 truncate">{t(tabKey(active))}</span>
 </div>
 <div
 className="inline-flex items-center rounded-lg border border-ink/[0.08] bg-ink/[0.02] p-0.5"
 role="navigation"
 aria-label="Product"
 >
 {[
 { key: "trades", label: "Trades", run: () => navigate("/signals") },
 { key: "terminal", label: "Terminal", run: null },
 { key: "research", label: "AI Research", run: () => navigate("/ai-arena") },
 ].map((item) => {
 const isOn = item.key === "terminal";
 const cls = `inline-flex items-center rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
 isOn
 ? "bg-ink/[0.1] text-text-primary shadow-sm"
 : "text-text-muted hover:text-text-primary hover:bg-ink/[0.04]"
 }`;
 return isOn ? (
 <span key={item.key} className={cls} aria-current="page">{item.label}</span>
 ) : (
 <button key={item.key} type="button" onClick={item.run} className={cls}>
 {item.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* ── mobile: horizontal chips ── */}
 <div className="shrink-0 lg:hidden mb-2 flex gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
 {ALL_ITEMS.map(([id, route]) => (
 <button
 key={id}
 onClick={() => go(id, route)}
 className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[9.5px] uppercase tracking-wider transition-colors ${
 active === id
 ? "bg-ink/[0.1] text-text-primary"
 : "text-text-muted hover:text-text-primary hover:bg-ink/[0.03]"
 }`}
 >
 <TabIcon id={id} />
 {t(tabKey(id))}
 </button>
 ))}
 </div>

 <div className="flex gap-3 items-stretch lg:flex-1 lg:min-h-0">
 {/* ── slim left nav (no boxed panel) ── */}
 <aside className="hidden lg:block w-[168px] shrink-0 lg:overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-ink/10 [&::-webkit-scrollbar-thumb]:rounded-full">
 <nav className="pr-1 space-y-2.5">
 {GROUPS.map(({ g, items }) => (
 <div key={g}>
 <div className="px-2 mb-1 font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted/55">
 {t(`terminal.viz.${g}`)}
 </div>
 <div className="space-y-px">
 {items.map(([id, route]) => (
 <button
 key={id}
 onClick={() => go(id, route)}
 className={`relative w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-md text-left text-[12px] font-medium transition-colors ${
 active === id
 ? "bg-ink/[0.07] text-text-primary"
 : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
 }`}
 >
 {active === id && (
 <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-accent" />
 )}
 <span className={active === id ? "text-text-primary" : "text-text-muted"}>
 <TabIcon id={id} />
 </span>
 <span className="truncate">{t(tabKey(id))}</span>
 </button>
 ))}
 </div>
 </div>
 ))}
 </nav>
 </aside>

 {/* ── content scroll region ── */}
 <main className="flex-1 min-w-0 lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin] [scrollbar-color:rgb(var(--ink)_/_0.12)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15">
 <SignalStatusProvider>
 <Outlet />
 <GlobalSignalModalHost />
 </SignalStatusProvider>
 </main>
 </div>

 <AssistantWidget pageId="terminal" contextHint={`the "${t(tabKey(active))}" view of the LuxQuant Terminal`} />
 </div>
 );
}
