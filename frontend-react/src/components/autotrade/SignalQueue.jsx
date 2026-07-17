// src/components/autotrade/SignalQueue.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Signals tab
// Latest open signals the engine is evaluating. Live, auto-refresh.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CoinLogo from "../CoinLogo";
import {
 Card,
 SectionHeader,
 StatusBadge,
 Spinner,
 EmptyState,
 Notice,
 fmtNum,
 fmtTime,
} from "./AutoTradeUI";

const API_BASE = import.meta.env.VITE_API_URL || "";

const riskTone = (risk) => {
 const r = (risk || "").toLowerCase();
 if (r.startsWith("high")) return "bad";
 if (r.startsWith("med") || r.startsWith("nor")) return "warn";
 if (r.startsWith("low")) return "good";
 return "neutral";
};

const riskLabel = (risk) => {
 const r = (risk || "").toLowerCase();
 if (r.startsWith("high")) return "High";
 if (r.startsWith("med") || r.startsWith("nor")) return "Normal";
 if (r.startsWith("low")) return "Low";
 return risk || "—";
};

export default function SignalQueue() {
 const [signals, setSignals] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");

 const load = async () => {
 setLoading(true);
 setError("");
 try {
 const token = localStorage.getItem("access_token") || "";
 const resp = await fetch(`${API_BASE}/api/v1/signals/bulk-7d?limit=50`, {
 headers: token ? { Authorization: `Bearer ${token}` } : {},
 });
 if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 const data = await resp.json();
 const items = (data.items || data.signals || data || [])
 .filter((s) => (s.status || "").toLowerCase() === "open")
 .slice(0, 20);
 setSignals(items);
 } catch (e) {
 setError(e.message);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 load();
 const t = setInterval(load, 30000);
 return () => clearInterval(t);
 }, []);

 if (loading && signals.length === 0) return <Spinner label="Loading signals queue…" />;
 const riskData = ["Low", "Normal", "High"].map((label) => ({
 name: label,
 value: signals.filter((signal) => riskLabel(signal.risk_level) === label).length,
 color: label === "Low" ? "#0ECB81" : label === "High" ? "#F6465D" : "rgb(var(--accent))",
 }));

 return (
 <div className="space-y-3">
 <SectionHeader label="Signals Queue" />

 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <StatusBadge tone="good" dot>
 Live
 </StatusBadge>
 <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/70">
 Auto-refresh <span className="text-text-primary tabular-nums">30s</span>
 </span>
 </div>
 <button
 type="button"
 onClick={load}
 className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted transition-all hover:border-ink/12 hover:text-text-primary"
 >
 <svg
 className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 strokeWidth={2}
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
 />
 </svg>
 Refresh
 </button>
 </div>

 {error ? <Notice tone="error">Failed to load: {error}</Notice> : null}

 {!error && signals.length > 0 ? (
 <Card>
 <div className="grid items-center gap-4 lg:grid-cols-[260px_1fr]">
 <div>
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 Signal risk mix
 </p>
 <p className="mt-2 text-xs leading-5 text-text-muted">
 Current open-signal queue grouped by the risk label consumed by AutoTrade filters.
 </p>
 <p className="mt-4 font-mono text-3xl text-text-primary">{signals.length}</p>
 <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">open signals</p>
 </div>
 <div className="h-40">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={riskData} layout="vertical">
 <XAxis type="number" allowDecimals={false} tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} />
 <YAxis dataKey="name" type="category" tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
 <Tooltip />
 <Bar dataKey="value" radius={[0, 3, 3, 0]}>
 {riskData.map((item) => <Cell key={item.name} fill={item.color} />)}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>
 </Card>
 ) : null}

 {!error && signals.length === 0 ? (
 <EmptyState
 icon="🛰️"
 title="No pending signals"
 hint="The engine is waiting for the next open signal."
 />
 ) : (
 <div className="space-y-2">
 {signals.map((s) => (
 <Card key={s.signal_id} hover padded={false}>
 <div className="flex items-center gap-3 p-3">
 <CoinLogo pair={s.pair} size={32} />
 <div className="min-w-0 flex-1">
 <div className="mb-1 flex flex-wrap items-center gap-1.5">
 <p className="truncate font-mono text-sm font-semibold text-text-primary">
 {s.pair}
 </p>
 <StatusBadge tone="good">Buy</StatusBadge>
 {s.risk_level ? (
 <StatusBadge tone={riskTone(s.risk_level)}>
 {riskLabel(s.risk_level)}
 </StatusBadge>
 ) : null}
 </div>
 <p className="font-mono text-[10px] tabular-nums text-text-muted/70">
 <span className="text-[9px] uppercase tracking-wider">Entry</span>
 <span className="ml-1 text-text-primary/80">{fmtNum(s.entry, 6)}</span>
 <span className="mx-1.5 text-text-muted/40">·</span>
 <span className="text-[9px] uppercase tracking-wider">SL</span>
 <span className="ml-1 text-loss/80">{fmtNum(s.stop1, 6)}</span>
 </p>
 </div>
 <div className="flex shrink-0 flex-col items-end gap-0.5">
 <p className="font-mono text-[11px] font-semibold tabular-nums text-accent">
 <span className="mr-1 text-[9px] uppercase tracking-wider text-text-muted">
 TP1
 </span>
 {fmtNum(s.target1, 6)}
 </p>
 <p className="font-mono text-[10px] uppercase tracking-wider tabular-nums text-text-muted/60">
 {fmtTime(s.created_at)}
 </p>
 </div>
 </div>
 </Card>
 ))}
 </div>
 )}
 </div>
 );
}
