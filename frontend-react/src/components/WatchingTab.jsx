// src/components/WatchingTab.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Watching Tab (Waitlist)
// Coin-based waitlist + live price + typed coin preview.
// Backend: /api/v1/coin-watch · prices: /api/v1/market/prices
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { coinWatchApi } from "../services/coinWatchApi";
import CoinLogo from "./CoinLogo";

const API_BASE = import.meta.env.VITE_API_URL || "";
const PRICE_REFRESH = 15000;

// ── helpers ──
const coinName = (symbol) => (symbol ? symbol.replace(/USDT$/i, "") : "");

const normalizeSymbol = (raw) => {
 let s = (raw || "").trim().toUpperCase().replace(/[\s/\-]/g, "");
 if (!s) return "";
 if (!s.endsWith("USDT")) s += "USDT";
 return s;
};

const priceFromMap = (map, sym) => {
 const d = map?.[sym];
 if (d === null || d === undefined) return null;
 if (typeof d === "number") return d;
 return d.price ?? null;
};

const formatPrice = (price) => {
 if (price === null || price === undefined || price === "") return "—";
 const num = parseFloat(price);
 if (isNaN(num)) return "—";
 if (num < 0.001) return num.toFixed(8);
 if (num < 1) return num.toFixed(6);
 if (num < 10) return num.toFixed(4);
 return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


// ── shared header bits (match WatchlistPage) ──
const SectionHeader = ({ label }) => (
 <div className="flex items-center gap-3">
 <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</span>
 </div>
);

const StatCard = ({ label, value, sublabel, isGold }) => (
 <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-4">
 <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</div>
 <div className={`mb-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${isGold ? "text-accent" : "text-text-primary"}`}>{value}</div>
 {sublabel && <div className="truncate font-mono text-[10px] text-text-muted">{sublabel}</div>}
 </div>
);


// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
const WatchingTab = () => {
 const navigate = useNavigate();
 const [items, setItems] = useState([]);
 const [counts, setCounts] = useState({ total: 0, waiting: 0, called: 0 });
 const [loading, setLoading] = useState(true);
 const [input, setInput] = useState("");
 const [adding, setAdding] = useState(false);
 const [error, setError] = useState("");
 const [prices, setPrices] = useState({});
 const [previewPrice, setPreviewPrice] = useState(undefined); // undefined=loading, null=none
 const priceTimer = useRef(null);

 const previewSymbol = normalizeSymbol(input);
 const alreadyWatching = items.some((i) => i.symbol === previewSymbol);

 const fetchData = useCallback(async () => {
 try {
 const data = await coinWatchApi.getCoinWatch();
 setItems(data.items || []);
 setCounts({ total: data.total || 0, waiting: data.waiting || 0, called: data.called || 0 });
 } catch (err) {
 console.error("Failed to fetch coin-watch:", err);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchData();
 }, [fetchData]);

 // ── live prices for watched coins ──
 useEffect(() => {
 const symbols = items.map((i) => i.symbol).filter(Boolean);
 if (symbols.length === 0) return;
 let active = true;
 const run = async () => {
 try {
 const res = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${symbols.join(",")}`);
 if (res.ok) {
 const m = await res.json();
 if (active) setPrices(m || {});
 }
 } catch { /* keep last */ }
 };
 run();
 const iv = setInterval(run, PRICE_REFRESH);
 return () => { active = false; clearInterval(iv); };
 }, [items]);

 // ── debounced price preview for typed coin ──
 useEffect(() => {
 if (priceTimer.current) clearTimeout(priceTimer.current);
 if (!previewSymbol) { setPreviewPrice(null); return; }
 setPreviewPrice(undefined);
 let active = true;
 priceTimer.current = setTimeout(async () => {
 try {
 const res = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${previewSymbol}`);
 if (res.ok) {
 const m = await res.json();
 if (active) setPreviewPrice(priceFromMap(m, previewSymbol));
 } else if (active) setPreviewPrice(null);
 } catch { if (active) setPreviewPrice(null); }
 }, 400);
 return () => { active = false; };
 }, [previewSymbol]);

 const handleAdd = async () => {
 if (!previewSymbol || adding || alreadyWatching) return;
 setAdding(true);
 setError("");
 try {
 await coinWatchApi.addCoin(previewSymbol);
 setInput("");
 await fetchData();
 } catch (err) {
 setError(err?.response?.data?.detail || "Gagal menambah koin");
 } finally {
 setAdding(false);
 }
 };

 const handleRemove = async (symbol) => {
 setItems((prev) => prev.filter((i) => i.symbol !== symbol));
 try {
 await coinWatchApi.removeCoin(symbol);
 await fetchData();
 } catch (err) {
 console.error("Failed to remove:", err);
 fetchData();
 }
 };

 const handleKeyDown = (e) => { if (e.key === "Enter") handleAdd(); };

 return (
 <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
 {/* Header */}
 <div className="space-y-4">
 <SectionHeader label="Watchlist" />
 <div>
 <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">Watching</h1>
 <p className="text-text-muted text-sm mt-1.5 font-mono">
 {counts.total} {counts.total === 1 ? "coin" : "coins"} watching
 <span className="text-text-muted/50"> · notify me when LuxQuant calls them</span>
 </p>
 </div>
 </div>

 {/* KPI cards */}
 <div className="grid grid-cols-3 gap-3">
 <StatCard label="Watching" value={counts.total} sublabel="Coins tracked" />
 <StatCard label="Waiting" value={counts.waiting} sublabel="No signal yet" />
 <StatCard label="Called" value={counts.called} sublabel="Got a signal" isGold={counts.called > 0} />
 </div>

 {/* Add coin + preview */}
 <div className="space-y-2">
 <div className="flex gap-2">
 <div className="relative flex-1 min-w-0">
 <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 <input
 type="text"
 placeholder="Add a coin to watch (e.g. BTC, SUI, PEPE)…"
 value={input}
 onChange={(e) => { setInput(e.target.value); setError(""); }}
 onKeyDown={handleKeyDown}
 className="w-full rounded-md border border-ink/[0.1] bg-surface-raised py-2.5 pl-9 pr-4 font-mono text-sm uppercase text-text-primary placeholder:text-text-muted transition-colors focus:border-ink/20 focus:outline-none"
 />
 </div>
 <button
 onClick={handleAdd}
 disabled={adding || !previewSymbol || alreadyWatching}
 className="inline-flex shrink-0 items-center gap-2 rounded-md border border-transparent bg-accent px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
 >
 {adding ? "Adding…" : "Add"}
 </button>
 </div>

 {/* Live preview of the typed coin */}
 {previewSymbol && (
 <button
 onClick={handleAdd}
 disabled={adding || alreadyWatching}
 className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md border border-ink/[0.1] bg-surface-secondary hover:border-ink/18 transition-all text-left disabled:cursor-default"
 >
 <CoinLogo pair={previewSymbol} size={28} />
 <div className="flex-1 min-w-0">
 <span className="text-text-primary text-sm font-semibold font-mono">{coinName(previewSymbol)}</span>
 <span className="text-text-muted/60 text-[10px] font-mono uppercase tracking-wider ml-1.5">USDT</span>
 </div>
 <span className="font-mono text-sm tabular-nums text-text-primary/80">
 {previewPrice === undefined ? "…" : previewPrice !== null ? `$${formatPrice(previewPrice)}` : "—"}
 </span>
 <span className={`text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded ${
 alreadyWatching ? "text-text-muted/50" : "text-accent bg-accent/12"
 }`}>
 {alreadyWatching ? "Already added" : "↵ Add"}
 </span>
 </button>
 )}

 {error && <p className="px-1 font-mono text-[11px] text-loss">{error}</p>}
 </div>

 {/* List */}
 <div className="space-y-3">
 <SectionHeader label="Coins" />
 {loading ? (
 <ListSkeleton />
 ) : items.length === 0 ? (
 <EmptyState />
 ) : (
 <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
 <div className="divide-y divide-ink/[0.04]">
 {items.map((item) => (
 <CoinRow
 key={item.id}
 item={item}
 price={priceFromMap(prices, item.symbol)}
 onOpen={() => navigate("/signals")}
 onRemove={() => handleRemove(item.symbol)}
 />
 ))}
 </div>
 </div>
 )}
 </div>

 <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50 text-center">
 You'll get a notification when a watched coin gets called
 </p>
 </div>
 );
};


// ════════════════════════════════════════════════════════════════
// COIN ROW
// ════════════════════════════════════════════════════════════════
const CoinRow = ({ item, price, onOpen, onRemove }) => {
 const isCalled = item.status === "CALLED";

 return (
 <div className={`group flex items-center gap-3 px-4 py-3.5 transition-colors ${isCalled ? "bg-profit/[0.06]" : "hover:bg-ink/[0.02]"}`}>
 {/* Coin */}
 <div className="flex items-center gap-2.5 flex-1 min-w-0">
 <CoinLogo pair={item.symbol} size={34} />
 <div className="min-w-0">
 <p className="text-text-primary text-sm font-semibold font-mono group-hover:text-text-primary transition-colors">{coinName(item.symbol)}</p>
 <p className="text-text-muted/60 text-[10px] font-mono uppercase tracking-wider">USDT</p>
 </div>
 </div>

 {/* Live price */}
 <div className="shrink-0 text-right hidden sm:block min-w-[110px]">
 <p className="font-mono text-sm tabular-nums text-text-primary/90">
 {price !== null && price !== undefined ? `$${formatPrice(price)}` : <span className="text-text-muted/40">—</span>}
 </p>
 <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/50">Live</p>
 </div>

 {/* Status */}
 <div className="shrink-0 w-24 flex justify-center">
 {isCalled ? (
 <span className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-profit/10 text-profit border-profit/25">
 <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
 Called
 </span>
 ) : (
 <span className="inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border border-transparent bg-accent/12 text-accent">
 Waiting
 </span>
 )}
 </div>

 {/* Action */}
 <div className="shrink-0 w-24 flex justify-end">
 {isCalled ? (
 <button
 type="button"
 onClick={onOpen}
 className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-accent px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
 >
 Open →
 </button>
 ) : (
 <button
 type="button"
 onClick={onRemove}
 className="rounded-md border border-transparent p-1.5 text-text-muted opacity-0 transition-all hover:border-loss/25 hover:bg-loss/10 hover:text-loss group-hover:opacity-100"
 title="Remove"
 >
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 )}
 </div>
 </div>
 );
};


// ── states ──
const ListSkeleton = () => (
 <div className="space-y-1.5">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5 flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-ink/[0.04] animate-pulse shrink-0" />
 <div className="flex-1 space-y-2">
 <div className="h-3 bg-ink/[0.05] rounded w-1/4 animate-pulse" />
 <div className="h-2 bg-ink/[0.03] rounded w-1/6 animate-pulse" />
 </div>
 <div className="h-5 w-16 bg-ink/[0.04] rounded animate-pulse" />
 </div>
 ))}
 </div>
);

const EmptyState = () => (
 <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-12 text-center">
 <div className="w-14 h-14 mx-auto mb-4 rounded-md border border-ink/10 flex items-center justify-center">
 <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
 </svg>
 </div>
 <p className="text-text-primary text-base font-medium mb-1.5">No coins watched yet</p>
 <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em]">Add a coin above to get notified when it's called</p>
 </div>
);

export default WatchingTab;
