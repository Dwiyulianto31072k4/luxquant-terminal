// frontend-react/src/components/JournalPage.jsx
// LuxQuant Trade Journal v5 — Flowscan-Web3 Minimal Redesign
// Full rewrite with hero metric strip, SVG equity curve, dark calendar heatmap,
// live preview form, real analytics charts, mobile-first cards
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "react-router-dom";
import api from "../services/authApi";
import CoinLogo from "./CoinLogo";

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════

const MOOD_OPTIONS = ["Calm", "Focused", "Excited", "Anxious", "FOMO", "Revenge", "Tired"];
const STRATEGY_OPTIONS = ["LuxQuant Signal", "Breakout", "ICT / SMC", "Mean Reversion", "Scalp", "Swing"];
const CONFLUENCE_OPTIONS = ["Volume Spike", "Whale Accumulation", "News Catalyst", "Support Level", "RSI Divergence", "AI Hot Streak"];
const MISTAKE_OPTIONS = ["Early Exit", "Moved SL", "Oversized", "FOMO Entry", "Revenge Trade", "No Plan", "Ignored SL", "Added to Loser"];

const EMPTY_FORM = {
  signal_id: null,
  pair: "",
  direction: "long",
  planned_entry: "",
  planned_tp1: "", planned_tp2: "", planned_tp3: "", planned_tp4: "",
  planned_sl: "",
  actual_entry: "",
  actual_exit: "",
  leverage: 1,
  position_size_usd: "",
  fees_usd: 0,
  emotions: { confidence: 5, fomo_level: 0, mood: "", regret: 0 },
  strategy_tags: [],
  confluence_tags: [],
  mistakes: [],
  notes: "",
  chart_before_url: "",
  chart_after_url: "",
  tradingview_link: "",
  entry_at: "",
  exit_at: "",
};

const MOOD_GLYPH = {
  Calm: "•", Focused: "◆", Excited: "▲", Anxious: "~", FOMO: "!", Revenge: "✕", Tired: "○",
};

const STATUS_STYLES = {
  open: "bg-blue-500/[0.08] text-blue-300 border-blue-500/25",
  closed_win: "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/25",
  closed_loss: "bg-red-500/[0.08] text-red-300 border-red-500/25",
  breakeven: "bg-amber-500/[0.08] text-amber-300 border-amber-500/25",
};

const STATUS_LABEL = {
  open: "OPEN",
  closed_win: "WIN",
  closed_loss: "LOSS",
  breakeven: "BE",
};

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

const stripQuote = (sym) => (sym || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "");

const fmtPrice = (p) => {
  if (p == null || p === "" || isNaN(p)) return "—";
  const n = parseFloat(p);
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(6);
  return n.toFixed(8);
};

const fmtMoney = (v, { sign = false, decimals = 2 } = {}) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const prefix = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  let body;
  if (abs >= 1e9) body = (abs / 1e9).toFixed(2) + "B";
  else if (abs >= 1e6) body = (abs / 1e6).toFixed(2) + "M";
  else if (abs >= 1e3) body = (abs / 1e3).toFixed(2) + "K";
  else body = abs.toFixed(decimals);
  return `${prefix}$${body}`;
};

const fmtPct = (v, { sign = false, decimals = 2 } = {}) => {
  if (v == null || isNaN(v)) return "—";
  const prefix = sign && v > 0 ? "+" : "";
  return `${prefix}${v.toFixed(decimals)}%`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return "—"; }
};

const fmtDateShort = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return "—"; }
};

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    const dt = new Date(iso), now = new Date(), h = Math.floor((now - dt) / 36e5);
    if (h < 1) return "Just now";
    if (h < 24) return h + "h ago";
    if (h < 48) return "Yesterday";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
};

// Compute preview P&L from form values
const previewPnl = (form) => {
  const en = parseFloat(form.actual_entry), ex = parseFloat(form.actual_exit);
  const sz = parseFloat(form.position_size_usd), lv = parseFloat(form.leverage) || 1;
  const fe = parseFloat(form.fees_usd) || 0;
  if (!en || !ex || !sz) return { pnl: null, pct: null, rr: null };
  const raw = form.direction === "short" ? (en - ex) / en * sz * lv : (ex - en) / en * sz * lv;
  const pnl = raw - fe;
  const pct = (pnl / sz) * 100;
  let rr = null;
  const sl = parseFloat(form.planned_sl);
  if (sl && sl !== en) {
    const risk = Math.abs(en - sl);
    const reward = (ex - en) * (form.direction === "short" ? -1 : 1);
    if (risk > 0) rr = reward / risk;
  }
  return { pnl, pct, rr };
};

// ════════════════════════════════════════════════════════════════
// ICONS — Lucide-style inline SVG
// ════════════════════════════════════════════════════════════════

const Icon = ({ path, className = "h-4 w-4", strokeWidth = 2 }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
const IconSearch = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>} />;
const IconClose = (p) => <Icon {...p} path={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} />;
const IconPlus = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />;
const IconDownload = (p) => <Icon {...p} path={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>} />;
const IconBook = (p) => <Icon {...p} path={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>} />;
const IconPencil = (p) => <Icon {...p} path={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>} />;
const IconChart = (p) => <Icon {...p} path={<><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>} />;
const IconLink = (p) => <Icon {...p} path={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>} />;
const IconChevL = (p) => <Icon {...p} path={<polyline points="15 18 9 12 15 6" />} />;
const IconChevR = (p) => <Icon {...p} path={<polyline points="9 18 15 12 9 6" />} />;
const IconTrash = (p) => <Icon {...p} path={<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />;
const IconFilter = (p) => <Icon {...p} path={<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />} />;
const IconCheck = (p) => <Icon {...p} path={<polyline points="20 6 9 17 4 12" />} />;
const IconArrowUp = (p) => <Icon {...p} path={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />;
const IconArrowDown = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>} />;
const IconUpTri = ({ className = "h-2.5 w-2.5" }) => <svg className={className} viewBox="0 0 12 12" fill="currentColor"><path d="M6 2 L11 9 L1 9 Z" /></svg>;
const IconDownTri = ({ className = "h-2.5 w-2.5" }) => <svg className={className} viewBox="0 0 12 12" fill="currentColor"><path d="M6 10 L1 3 L11 3 Z" /></svg>;
const IconSparkles = (p) => <Icon {...p} path={<><path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3z" /><path d="M5 19l1-3 3-1-3-1-1-3-1 3-3 1 3 1 1 3z" /></>} />;
const IconBrain = (p) => <Icon {...p} path={<><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" /></>} />;
const IconTarget = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>} />;
const IconFire = (p) => <Icon {...p} path={<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />} />;
const IconBan = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>} />;
const IconBolt = (p) => <Icon {...p} path={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />;
const IconRefresh = (p) => <Icon {...p} path={<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>} />;

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

const JournalPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("history");
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  // Filters
  const [filterPair, setFilterPair] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStrategy, setFilterStrategy] = useState("all");
  const [sortBy, setSortBy] = useState("entry_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // Form
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // ─── Prefill from router state ───
  useEffect(() => {
    if (location.state?.prefill) {
      const p = location.state.prefill;
      setForm((prev) => ({
        ...prev,
        signal_id: p.signal_id || null,
        pair: p.pair || "",
        planned_entry: p.planned_entry || "",
        planned_tp1: p.planned_tp1 || "", planned_tp2: p.planned_tp2 || "",
        planned_tp3: p.planned_tp3 || "", planned_tp4: p.planned_tp4 || "",
        planned_sl: p.planned_sl || "",
        actual_entry: p.planned_entry || "",
        strategy_tags: p.signal_id ? ["LuxQuant Signal"] : [],
      }));
      setActiveTab("entry");
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // ─── Prefill from sessionStorage (from SignalModal) ───
  useEffect(() => {
    const raw = sessionStorage.getItem("journal_prefill");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setForm((prev) => ({
          ...prev,
          signal_id: p.signal_id || null,
          pair: p.pair || "",
          planned_entry: p.planned_entry || "",
          planned_tp1: p.planned_tp1 || "", planned_tp2: p.planned_tp2 || "",
          planned_tp3: p.planned_tp3 || "", planned_tp4: p.planned_tp4 || "",
          planned_sl: p.planned_sl || "",
          actual_entry: p.planned_entry || "",
          strategy_tags: p.signal_id ? ["LuxQuant Signal"] : [],
        }));
        setActiveTab("entry");
      } catch {}
      sessionStorage.removeItem("journal_prefill");
    }
  }, []);

  // ─── API calls ───
  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filterPair) p.append("pair", filterPair.toUpperCase());
      if (filterStatus !== "all") p.append("status", filterStatus);
      if (filterStrategy !== "all") p.append("strategy", filterStrategy);
      p.append("sort_by", sortBy);
      p.append("sort_order", sortOrder);
      const { data } = await api.get(`/api/v1/journal/?${p}`);
      setEntries(data.items || []);
    } catch (err) {
      console.warn("Journal fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [filterPair, filterStatus, filterStrategy, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/journal/stats/overview");
      setStats(data);
    } catch {}
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/journal/ai/insights");
      setInsights(data);
    } catch {}
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => {
    if (activeTab === "analytics") {
      fetchStats();
      fetchInsights();
    }
  }, [activeTab, fetchStats, fetchInsights]);

  // ─── Form handlers ───
  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditId(null); };

  const toggleTag = (field, tag) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(tag) ? prev[field].filter((x) => x !== tag) : [...prev[field], tag],
    }));
  };

  const handleSignalSelect = (d) => {
    setForm((prev) => ({
      ...prev,
      signal_id: d.signal_id,
      pair: d.pair || prev.pair,
      planned_entry: d.planned_entry || "",
      planned_tp1: d.planned_tp1 || "", planned_tp2: d.planned_tp2 || "",
      planned_tp3: d.planned_tp3 || "", planned_tp4: d.planned_tp4 || "",
      planned_sl: d.planned_sl || "",
      actual_entry: d.planned_entry || prev.actual_entry,
      strategy_tags: prev.strategy_tags.includes("LuxQuant Signal") ? prev.strategy_tags : ["LuxQuant Signal", ...prev.strategy_tags],
    }));
  };

  const handleSignalClear = () => {
    setForm((prev) => ({
      ...prev,
      signal_id: null,
      planned_entry: "", planned_tp1: "", planned_tp2: "", planned_tp3: "", planned_tp4: "", planned_sl: "",
      strategy_tags: prev.strategy_tags.filter((t) => t !== "LuxQuant Signal"),
    }));
  };

  const handleSubmit = async () => {
    if (!form.pair || !form.actual_entry) return;
    setSaving(true);
    try {
      const p = {
        ...form,
        pair: form.pair.toUpperCase(),
        actual_entry: parseFloat(form.actual_entry),
        actual_exit: form.actual_exit ? parseFloat(form.actual_exit) : null,
        planned_entry: form.planned_entry ? parseFloat(form.planned_entry) : null,
        planned_tp1: form.planned_tp1 ? parseFloat(form.planned_tp1) : null,
        planned_tp2: form.planned_tp2 ? parseFloat(form.planned_tp2) : null,
        planned_tp3: form.planned_tp3 ? parseFloat(form.planned_tp3) : null,
        planned_tp4: form.planned_tp4 ? parseFloat(form.planned_tp4) : null,
        planned_sl: form.planned_sl ? parseFloat(form.planned_sl) : null,
        leverage: parseFloat(form.leverage) || 1,
        position_size_usd: form.position_size_usd ? parseFloat(form.position_size_usd) : null,
        fees_usd: parseFloat(form.fees_usd) || 0,
        entry_at: form.entry_at || null,
        exit_at: form.exit_at || null,
      };
      if (editId) await api.put(`/api/v1/journal/${editId}`, p);
      else await api.post("/api/v1/journal/", p);
      resetForm();
      setActiveTab("history");
      fetchEntries();
    } catch (e) {
      alert("Failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (e) => {
    setForm({
      signal_id: e.signal_id,
      pair: e.pair,
      direction: e.direction,
      planned_entry: e.planned_entry || "",
      planned_tp1: e.planned_tp1 || "", planned_tp2: e.planned_tp2 || "",
      planned_tp3: e.planned_tp3 || "", planned_tp4: e.planned_tp4 || "",
      planned_sl: e.planned_sl || "",
      actual_entry: e.actual_entry || "",
      actual_exit: e.actual_exit || "",
      leverage: e.leverage || 1,
      position_size_usd: e.position_size_usd || "",
      fees_usd: e.fees_usd || 0,
      emotions: e.emotions || { confidence: 5, fomo_level: 0, mood: "", regret: 0 },
      strategy_tags: e.strategy_tags || [],
      confluence_tags: e.confluence_tags || [],
      mistakes: e.mistakes || [],
      notes: e.notes || "",
      chart_before_url: e.chart_before_url || "",
      chart_after_url: e.chart_after_url || "",
      tradingview_link: e.tradingview_link || "",
      entry_at: e.entry_at || "",
      exit_at: e.exit_at || "",
    });
    setEditId(e.id);
    setActiveTab("entry");
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this journal entry?")) return;
    try { await api.delete(`/api/v1/journal/${id}`); fetchEntries(); }
    catch {}
  };

  const handleExport = async () => {
    try {
      const p = new URLSearchParams();
      if (filterPair) p.append("pair", filterPair.toUpperCase());
      if (filterStatus !== "all") p.append("status", filterStatus);
      const r = await api.get(`/api/v1/journal/export/excel?${p}`, { responseType: "blob" });
      const u = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = u;
      a.download = `LuxQuant_Journal_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(u);
    } catch { alert("Export failed"); }
  };

  return (
    <div className="space-y-6 pb-10">
      <JournalStyles />

      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-primary/70 mb-2">
            <IconBook className="h-3 w-3" />
            <span>Personal Trading Logbook</span>
          </div>
          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 60%, rgba(212,168,83,0.85) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Trade Journal
          </h1>
          <p className="text-sm text-text-muted/70 mt-2">
            Track, analyze, and improve your trading edge ·{" "}
            <span className="text-white/80 font-mono tabular-nums">{entries.length}</span> entries logged
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            className="flex items-center gap-2 h-9 px-3 rounded-md border border-white/[0.08] bg-white/[0.03] text-text-muted/85 hover:text-white hover:border-white/[0.14] hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[11px] font-medium uppercase tracking-[0.12em]"
          >
            <IconDownload className="h-3.5 w-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => { resetForm(); setActiveTab("entry"); }}
            className="flex items-center gap-2 h-9 px-3.5 rounded-md border border-gold-primary/40 bg-gold-primary/15 text-gold-primary hover:bg-gold-primary/20 hover:border-gold-primary/60 transition-all text-[11px] font-medium uppercase tracking-[0.12em]"
          >
            <IconPlus className="h-3.5 w-3.5" />
            <span>New Entry</span>
          </button>
        </div>
      </header>

      {/* ═══ TAB STRIP ═══ */}
      <nav className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-1 grid grid-cols-3 gap-1">
        <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} icon={<IconBook className="h-3.5 w-3.5" />} label="History" count={entries.length} />
        <TabButton active={activeTab === "entry"} onClick={() => { if (!editId) resetForm(); setActiveTab("entry"); }} icon={<IconPencil className="h-3.5 w-3.5" />} label={editId ? "Edit Entry" : "New Entry"} />
        <TabButton active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} icon={<IconChart className="h-3.5 w-3.5" />} label="Analytics" />
      </nav>

      {/* ═══ TAB CONTENT ═══ */}
      {activeTab === "history" && (
        <HistoryView
          entries={entries}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNewEntry={() => { resetForm(); setActiveTab("entry"); }}
          filterPair={filterPair} setFilterPair={setFilterPair}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterStrategy={filterStrategy} setFilterStrategy={setFilterStrategy}
          sortBy={sortBy} setSortBy={setSortBy}
          sortOrder={sortOrder} setSortOrder={setSortOrder}
        />
      )}
      {activeTab === "entry" && (
        <EntryView
          form={form} setForm={setForm}
          editId={editId} saving={saving}
          onToggleTag={toggleTag}
          onSignalSelect={handleSignalSelect}
          onSignalClear={handleSignalClear}
          onSubmit={handleSubmit}
          onCancel={() => { resetForm(); setActiveTab("history"); }}
          onDelete={editId ? () => { handleDelete(editId); resetForm(); setActiveTab("history"); } : null}
        />
      )}
      {activeTab === "analytics" && (
        <AnalyticsView stats={stats} insights={insights} entries={entries} />
      )}
    </div>
  );
};

export default JournalPage;

// ── Tab button ───────────────────────────────────────────
const TabButton = ({ active, onClick, icon, label, count }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center justify-center gap-2 h-10 rounded-sm text-[11px] font-medium uppercase tracking-[0.14em] transition-all ${
      active ? "bg-gold-primary/12 text-white border border-gold-primary/30" : "text-text-muted/65 hover:text-white border border-transparent hover:bg-white/[0.02]"
    }`}
  >
    {icon}
    <span>{label}</span>
    {count != null && (
      <span className={`text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded-sm ${active ? "bg-gold-primary/20 text-gold-primary" : "bg-white/[0.05] text-text-muted/55"}`}>
        {count}
      </span>
    )}
  </button>
);

// ════════════════════════════════════════════════════════════════
// ★ HISTORY VIEW ★
// ════════════════════════════════════════════════════════════════

const HistoryView = ({
  entries, loading, onEdit, onDelete, onNewEntry,
  filterPair, setFilterPair,
  filterStatus, setFilterStatus,
  filterStrategy, setFilterStrategy,
  sortBy, setSortBy,
  sortOrder, setSortOrder,
}) => {
  // ─── Stats ───
  const stats = useMemo(() => {
    const closed = entries.filter((e) => e.status !== "open" && e.pnl_usd != null);
    const wins = closed.filter((e) => e.status === "closed_win");
    const losses = closed.filter((e) => e.status === "closed_loss");
    const totalPnl = closed.reduce((s, e) => s + (e.pnl_usd || 0), 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const avgPnl = closed.length > 0 ? totalPnl / closed.length : 0;
    const best = closed.length > 0 ? Math.max(...closed.map((e) => e.pnl_usd || 0)) : 0;
    const worst = closed.length > 0 ? Math.min(...closed.map((e) => e.pnl_usd || 0)) : 0;
    const openCount = entries.filter((e) => e.status === "open").length;
    return {
      total: entries.length, open: openCount,
      wins: wins.length, losses: losses.length,
      totalPnl, avgPnl, best, worst, winRate,
    };
  }, [entries]);

  // ─── Equity curve points ───
  const equityCurve = useMemo(() => {
    const closed = entries
      .filter((e) => e.status !== "open" && e.pnl_usd != null && e.exit_at)
      .sort((a, b) => new Date(a.exit_at) - new Date(b.exit_at));
    let cum = 0;
    return closed.map((e) => {
      cum += e.pnl_usd || 0;
      return { date: e.exit_at, equity: cum, pnl: e.pnl_usd, pair: e.pair };
    });
  }, [entries]);

  // ─── Loading ───
  if (loading) {
    return (
      <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-10 text-center">
        <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/55">
          Loading journal…
        </div>
      </div>
    );
  }

  // ─── Empty ───
  if (entries.length === 0 && !filterPair && filterStatus === "all" && filterStrategy === "all") {
    return <HistoryEmptyState onNewEntry={onNewEntry} />;
  }

  return (
    <div className="space-y-4">
      {/* Metric strip */}
      {entries.length > 0 && <MetricStrip stats={stats} />}

      {/* Equity curve */}
      {equityCurve.length > 0 && <EquityCurveCard points={equityCurve} />}

      {/* Filters */}
      <FilterBar
        filterPair={filterPair} setFilterPair={setFilterPair}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterStrategy={filterStrategy} setFilterStrategy={setFilterStrategy}
        sortBy={sortBy} setSortBy={setSortBy}
        sortOrder={sortOrder} setSortOrder={setSortOrder}
        resultCount={entries.length}
      />

      {/* Table + Calendar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <TradeTable entries={entries} onEdit={onEdit} onDelete={onDelete} />
        <CalendarHeatmap entries={entries} />
      </div>
    </div>
  );
};

// ── Empty state ──────────────────────────────────────────
const HistoryEmptyState = ({ onNewEntry }) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-10 sm:p-16 text-center">
    <div className="relative z-10 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-md border border-gold-primary/20 bg-gold-primary/[0.06] flex items-center justify-center text-gold-primary/70">
        <IconBook className="h-6 w-6" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-white tracking-tight">Your logbook is empty</h3>
        <p className="text-[12px] text-text-muted/60 max-w-md mx-auto leading-relaxed">
          Every trade you log builds your edge. Start with one entry — track entry, exit, mood, and outcome.
          AI Coach insights unlock at 3 entries.
        </p>
      </div>
      <button
        onClick={onNewEntry}
        className="flex items-center gap-2 mt-2 h-9 px-4 rounded-md border border-gold-primary/40 bg-gold-primary/15 text-gold-primary hover:bg-gold-primary/20 hover:border-gold-primary/60 transition-all text-[11px] font-medium uppercase tracking-[0.14em]"
      >
        <IconPlus className="h-3.5 w-3.5" />
        <span>Log your first trade</span>
      </button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// METRIC STRIP — hairline-divided horizontal cells
// ════════════════════════════════════════════════════════════════

const MetricStrip = ({ stats }) => {
  const cells = [
    { label: "Total", value: stats.total, accent: "white" },
    { label: "Open", value: stats.open, accent: "blue" },
    { label: "Wins", value: stats.wins, accent: "emerald" },
    { label: "Losses", value: stats.losses, accent: "red" },
    { label: "Win Rate", value: fmtPct(stats.winRate, { decimals: 1 }), accent: stats.winRate >= 50 ? "emerald" : "red" },
    { label: "Net PnL", value: fmtMoney(stats.totalPnl, { sign: true }), accent: stats.totalPnl >= 0 ? "emerald" : "red" },
    { label: "Avg PnL", value: fmtMoney(stats.avgPnl, { sign: true }), accent: stats.avgPnl >= 0 ? "emerald" : "red" },
    { label: "Best", value: fmtMoney(stats.best, { sign: true }), accent: "emerald" },
    { label: "Worst", value: fmtMoney(stats.worst, { sign: true }), accent: "red" },
  ];

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 divide-x divide-y sm:divide-y-0 divide-white/[0.04]">
        {cells.map((cell, i) => (
          <MetricCell key={i} {...cell} />
        ))}
      </div>
    </div>
  );
};

const MetricCell = ({ label, value, accent }) => {
  const colorMap = {
    white: "text-white",
    blue: "text-blue-300",
    emerald: "text-emerald-400",
    red: "text-red-400",
  };
  return (
    <div className="px-3 py-3 flex flex-col gap-1.5 min-w-0">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">{label}</span>
      <span className={`text-base sm:text-[17px] font-light tabular-nums tracking-tight truncate ${colorMap[accent] || "text-white"}`}>
        {value}
      </span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// EQUITY CURVE CARD
// ════════════════════════════════════════════════════════════════

const EquityCurveCard = ({ points }) => {
  const finalEq = points.length > 0 ? points[points.length - 1].equity : 0;
  const peakEq = points.length > 0 ? Math.max(...points.map((p) => p.equity), 0) : 0;
  const drawdown = peakEq > 0 ? ((finalEq - peakEq) / Math.abs(peakEq || 1)) * 100 : 0;
  const hasData = points.length >= 2;

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/55 mb-1.5">
              <IconChart className="h-3 w-3 text-gold-primary/60" />
              <span>Equity Curve</span>
              <span className="font-mono tabular-nums text-text-muted/40">·</span>
              <span className="font-mono tabular-nums text-text-muted/40">{points.length} closed</span>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className={`text-2xl sm:text-3xl font-light tabular-nums tracking-tight leading-none ${finalEq >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtMoney(finalEq, { sign: true })}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-text-muted/60 uppercase tracking-[0.1em]">cumulative</span>
            </div>
          </div>

          {hasData && (
            <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums">
              <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-[0.18em] text-text-muted/55">Peak</span>
                <span className="text-white/85 mt-0.5">{fmtMoney(peakEq)}</span>
              </div>
              <div className="w-px h-7 bg-white/[0.08]" />
              <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-[0.18em] text-text-muted/55">Drawdown</span>
                <span className={`mt-0.5 ${drawdown < -1 ? "text-red-400" : "text-white/85"}`}>{fmtPct(drawdown, { sign: true })}</span>
              </div>
            </div>
          )}
        </div>

        {hasData ? <EquitySvg points={points} /> : (
          <div className="h-32 flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
            Close at least 2 trades to see equity curve
          </div>
        )}
      </div>
    </div>
  );
};

const EquitySvg = ({ points }) => {
  const W = 800, H = 140;
  const PAD = { top: 8, right: 4, bottom: 18, left: 4 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map((p) => p.equity);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = maxV - minV || 1;

  const xAt = (i) => PAD.left + (i / Math.max(points.length - 1, 1)) * innerW;
  const yAt = (v) => PAD.top + ((maxV - v) / range) * innerH;
  const zeroY = yAt(0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.equity).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const finalEq = points[points.length - 1].equity;
  const isProfit = finalEq >= 0;
  const accent = isProfit ? "#34d399" : "#f87171";
  const grid = [maxV, maxV * 0.5, 0, minV * 0.5].filter((v) => v !== 0 || (minV < 0 && maxV > 0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 sm:h-36" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="eq-area-neg" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((v, i) => (
        <line key={i} x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 3" />
      ))}
      {minV < 0 && maxV > 0 && (
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      )}
      <path d={areaPath} fill={`url(#eq-area${isProfit ? "" : "-neg"})`} />
      <path d={linePath} fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xAt(i)} cy={yAt(p.equity)} r={i === points.length - 1 ? "3" : "1.5"} fill={p.pnl >= 0 ? "#34d399" : "#f87171"} opacity={i === points.length - 1 ? 1 : 0.6} />
      ))}
      <text x={W - PAD.right} y={yAt(finalEq) - 6} fill={accent} fontSize="9" fontFamily="ui-monospace, monospace" textAnchor="end" fontWeight="500">
        {fmtMoney(finalEq, { sign: true })}
      </text>
    </svg>
  );
};

// ════════════════════════════════════════════════════════════════
// FILTER BAR
// ════════════════════════════════════════════════════════════════

const FilterBar = ({
  filterPair, setFilterPair,
  filterStatus, setFilterStatus,
  filterStrategy, setFilterStrategy,
  sortBy, setSortBy,
  sortOrder, setSortOrder,
  resultCount,
}) => {
  const statuses = [
    { v: "all", l: "All" },
    { v: "open", l: "Open" },
    { v: "closed_win", l: "Wins" },
    { v: "closed_loss", l: "Losses" },
    { v: "breakeven", l: "BE" },
  ];

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10 p-3 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <label className="group flex h-9 min-w-0 md:w-56 flex-shrink-0 items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-md px-3 transition-colors focus-within:border-gold-primary/30 focus-within:bg-white/[0.05]">
            <IconSearch className="h-3.5 w-3.5 text-text-muted/55 transition-colors group-focus-within:text-gold-primary/70 shrink-0" />
            <input
              type="text"
              placeholder="Search pair..."
              value={filterPair}
              onChange={(e) => setFilterPair(e.target.value)}
              className="w-full min-w-0 bg-transparent text-[12px] font-mono outline-none placeholder:text-text-muted/40 text-white"
            />
          </label>

          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="h-9 px-2.5 bg-white/[0.03] border border-white/[0.06] rounded-md text-[11px] text-text-muted/85 outline-none hover:border-white/[0.14] focus:border-gold-primary/30 transition-colors font-medium cursor-pointer"
          >
            <option value="all">All Strategy</option>
            {STRATEGY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split("_");
              setSortBy(field === "pnl" ? "pnl_usd" : field === "entry" ? "entry_at" : field);
              setSortOrder(order);
            }}
            className="h-9 px-2.5 bg-white/[0.03] border border-white/[0.06] rounded-md text-[11px] text-text-muted/85 outline-none hover:border-white/[0.14] focus:border-gold-primary/30 transition-colors font-medium cursor-pointer"
          >
            <option value="entry_at_desc">Newest first</option>
            <option value="entry_at_asc">Oldest first</option>
            <option value="pnl_usd_desc">Best P&amp;L</option>
            <option value="pnl_usd_asc">Worst P&amp;L</option>
          </select>

          <span className="md:ml-auto text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45 font-medium">
            {resultCount} {resultCount === 1 ? "trade" : "trades"}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center pt-2.5 border-t border-white/[0.04]">
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted/55 mr-1">Status</span>
          {statuses.map((s) => (
            <button
              key={s.v}
              onClick={() => setFilterStatus(s.v)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-[0.15em] transition-all border ${
                filterStatus === s.v
                  ? "bg-gold-primary/15 text-white border-gold-primary/40"
                  : "bg-white/[0.03] text-text-muted/70 border-white/[0.06] hover:border-white/[0.14] hover:text-white"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// TRADE TABLE — desktop + mobile cards
// ════════════════════════════════════════════════════════════════

const TradeTable = ({ entries, onEdit, onDelete }) => {
  if (entries.length === 0) {
    return (
      <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-10 flex flex-col items-center gap-3">
        <IconFilter className="h-6 w-6 text-text-muted/30" />
        <p className="text-[12px] font-mono uppercase tracking-[0.15em] text-text-muted/55">
          No trades match your filters
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10">
        {/* DESKTOP */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted/55 border-b border-white/[0.06] bg-white/[0.015]">
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Pair</th>
                <th className="px-2 py-2.5 text-left">Dir</th>
                <th className="px-2 py-2.5 text-right">Entry</th>
                <th className="px-2 py-2.5 text-right">Exit</th>
                <th className="px-2 py-2.5 text-right">Lev</th>
                <th className="px-3 py-2.5 text-right">P&amp;L $</th>
                <th className="px-3 py-2.5 text-right">P&amp;L %</th>
                <th className="px-3 py-2.5 text-center">Mood</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-2 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => <TableRow key={e.id} entry={e} onEdit={onEdit} onDelete={onDelete} />)}
            </tbody>
          </table>
        </div>

        {/* MOBILE */}
        <div className="md:hidden divide-y divide-white/[0.04]">
          {entries.map((e) => <MobileCard key={e.id} entry={e} onEdit={onEdit} />)}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between bg-white/[0.015]">
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45 hidden sm:inline">
            Click row to edit
          </span>
        </div>
      </div>
    </div>
  );
};

const TableRow = ({ entry, onEdit, onDelete }) => {
  const isLong = entry.direction === "long";
  const status = entry.status || "open";
  const isOpen = status === "open";
  const pnlPositive = (entry.pnl_usd ?? 0) >= 0;

  return (
    <tr
      onClick={() => onEdit(entry)}
      className="border-b border-white/[0.025] hover:bg-white/[0.025] cursor-pointer transition-colors group"
    >
      <td className="px-4 py-2.5 text-[11px] font-mono tabular-nums text-text-muted/75 whitespace-nowrap">
        {fmtDate(entry.entry_at)}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <CoinLogo pair={entry.pair} size={22} />
          <span className="text-[12px] font-medium text-white tracking-tight">{stripQuote(entry.pair)}</span>
          {entry.signal_id && (
            <span className="text-[8.5px] font-mono uppercase tracking-wider text-gold-primary/70 bg-gold-primary/[0.08] border border-gold-primary/20 rounded-sm px-1 py-px">sig</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium uppercase tracking-[0.12em] ${isLong ? "text-emerald-400" : "text-red-400"}`}>
          {isLong ? <IconUpTri /> : <IconDownTri />}
          {entry.direction?.toUpperCase()}
        </span>
      </td>
      <td className="px-2 py-2.5 text-[11px] font-mono tabular-nums text-white/85 text-right">${fmtPrice(entry.actual_entry)}</td>
      <td className="px-2 py-2.5 text-[11px] font-mono tabular-nums text-white/85 text-right">
        {entry.actual_exit != null ? `$${fmtPrice(entry.actual_exit)}` : <span className="text-text-muted/40">—</span>}
      </td>
      <td className="px-2 py-2.5 text-[11px] font-mono tabular-nums text-white/65 text-right">{entry.leverage || 1}×</td>
      <td className={`px-3 py-2.5 text-[11px] font-mono tabular-nums font-medium text-right ${isOpen ? "text-text-muted/50" : pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isOpen || entry.pnl_usd == null ? "—" : fmtMoney(entry.pnl_usd, { sign: true })}
      </td>
      <td className={`px-3 py-2.5 text-[11px] font-mono tabular-nums font-medium text-right ${isOpen ? "text-text-muted/50" : pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isOpen || entry.pnl_pct == null ? "—" : fmtPct(entry.pnl_pct, { sign: true })}
      </td>
      <td className="px-3 py-2.5 text-center">
        {entry.emotions?.mood ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-sm bg-white/[0.04] text-[10px] font-mono text-text-muted/85" title={entry.emotions.mood}>
            {MOOD_GLYPH[entry.emotions.mood] || entry.emotions.mood[0]}
          </span>
        ) : <span className="text-text-muted/30 text-[10px] font-mono">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center text-[9px] font-mono font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm border ${STATUS_STYLES[status] || STATUS_STYLES.open}`}>
          {STATUS_LABEL[status] || status.toUpperCase()}
        </span>
      </td>
      <td className="px-2 py-2.5">
        <button
          onClick={(ev) => { ev.stopPropagation(); onDelete(entry.id); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted/55 hover:text-red-400 transition-all"
        >
          <IconTrash className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

const MobileCard = ({ entry, onEdit }) => {
  const isLong = entry.direction === "long";
  const status = entry.status || "open";
  const isOpen = status === "open";
  const pnlPositive = (entry.pnl_usd ?? 0) >= 0;

  return (
    <button onClick={() => onEdit(entry)} className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <CoinLogo pair={entry.pair} size={26} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white tracking-tight">{stripQuote(entry.pair)}</span>
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-mono font-medium uppercase tracking-[0.12em] ${isLong ? "text-emerald-400" : "text-red-400"}`}>
                {isLong ? <IconUpTri /> : <IconDownTri />}
                {entry.direction?.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] font-mono tabular-nums text-text-muted/55 mt-0.5">{fmtDateShort(entry.entry_at)}</p>
          </div>
        </div>
        <span className={`inline-flex items-center text-[9px] font-mono font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm border ${STATUS_STYLES[status]}`}>
          {STATUS_LABEL[status] || status.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-[10px] font-mono tabular-nums">
        <MobileStat label="Entry" value={`$${fmtPrice(entry.actual_entry)}`} />
        <MobileStat label="Exit" value={entry.actual_exit != null ? `$${fmtPrice(entry.actual_exit)}` : "—"} dim={entry.actual_exit == null} />
        <MobileStat label="P&L" value={isOpen || entry.pnl_usd == null ? "—" : fmtMoney(entry.pnl_usd, { sign: true })} accent={isOpen ? null : pnlPositive ? "emerald" : "red"} />
        <MobileStat label="P&L %" value={isOpen || entry.pnl_pct == null ? "—" : fmtPct(entry.pnl_pct, { sign: true })} accent={isOpen ? null : pnlPositive ? "emerald" : "red"} />
      </div>
    </button>
  );
};

const MobileStat = ({ label, value, accent, dim }) => {
  const colorMap = { emerald: "text-emerald-400", red: "text-red-400" };
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[8.5px] uppercase tracking-[0.15em] text-text-muted/45 font-semibold">{label}</span>
      <span className={`truncate font-medium ${dim ? "text-text-muted/40" : colorMap[accent] || "text-white/85"}`}>{value}</span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// CALENDAR HEATMAP — Flowscan dark theme
// ════════════════════════════════════════════════════════════════

const CalendarHeatmap = ({ entries }) => {
  const [viewMonth, setViewMonth] = useState(() => new Date());

  const dayMap = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const ref = e.exit_at || e.entry_at;
      if (!ref) return;
      const d = new Date(ref);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = { pnl: 0, count: 0 };
      map[key].pnl += e.pnl_usd || 0;
      map[key].count += 1;
    });
    return map;
  }, [entries]);

  const goPrev = () => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setViewMonth(new Date());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const monthAgg = useMemo(() => {
    let sum = 0, trades = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dayMap[key]) { sum += dayMap[key].pnl; trades += dayMap[key].count; }
    }
    return { sum, trades };
  }, [dayMap, year, month, daysInMonth]);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10 p-3.5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">
              <span>Performance</span>
              <span className="font-mono tabular-nums text-text-muted/40">·</span>
              <span className="font-mono tabular-nums text-gold-primary/70">
                {viewMonth.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>
            {monthAgg.trades > 0 && (
              <p className={`text-[12px] font-light tabular-nums tracking-tight mt-1.5 ${monthAgg.sum >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtMoney(monthAgg.sum, { sign: true })}
                <span className="text-text-muted/45 text-[10px] ml-1.5 font-mono">· {monthAgg.trades} trades</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="w-6 h-6 rounded-sm border border-white/[0.06] bg-white/[0.02] text-text-muted/60 hover:text-white hover:border-white/[0.14] transition-colors flex items-center justify-center">
              <IconChevL className="h-3 w-3" />
            </button>
            <button onClick={goToday} className="h-6 px-2 rounded-sm border border-white/[0.06] bg-white/[0.02] text-text-muted/60 hover:text-white hover:border-white/[0.14] transition-colors text-[9px] font-medium uppercase tracking-[0.15em]">Today</button>
            <button onClick={goNext} className="w-6 h-6 rounded-sm border border-white/[0.06] bg-white/[0.02] text-text-muted/60 hover:text-white hover:border-white/[0.14] transition-colors flex items-center justify-center">
              <IconChevR className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[8.5px] font-mono uppercase tracking-[0.15em] text-text-muted/40 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="aspect-square" />;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const data = dayMap[key];
            const isToday = key === todayKey;

            let bg = "rgba(255,255,255,0.015)", textColor = "rgba(255,255,255,0.45)", border = "rgba(255,255,255,0.04)";
            if (data) {
              const intensity = Math.min(Math.abs(data.pnl) / 200, 0.7) + 0.2;
              if (data.pnl > 0) { bg = `rgba(16,185,129,${intensity * 0.35})`; border = `rgba(16,185,129,${intensity * 0.4})`; textColor = "#34d399"; }
              else if (data.pnl < 0) { bg = `rgba(239,68,68,${intensity * 0.35})`; border = `rgba(239,68,68,${intensity * 0.4})`; textColor = "#f87171"; }
              else { bg = "rgba(212,168,83,0.08)"; border = "rgba(212,168,83,0.2)"; textColor = "rgba(255,255,255,0.7)"; }
            }
            if (isToday) border = "rgba(212,168,83,0.6)";

            return (
              <div
                key={i}
                title={data ? `${key}\n${fmtMoney(data.pnl, { sign: true })} · ${data.count} trades` : key}
                className="aspect-square rounded-sm border flex flex-col items-center justify-center gap-px relative transition-all"
                style={{ backgroundColor: bg, borderColor: border }}
              >
                <span style={{ color: textColor }} className="text-[10px] font-mono tabular-nums font-medium leading-none">{day}</span>
                {data && <span style={{ color: textColor }} className="text-[7.5px] font-mono tabular-nums leading-none opacity-80">{data.count > 9 ? "9+" : data.count}</span>}
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/50">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40 border border-emerald-500/40" />profit</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-500/40" />loss</span>
          </div>
          <span>{Object.keys(dayMap).length} days</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// ★ ENTRY VIEW ★
// ════════════════════════════════════════════════════════════════

const EntryView = ({
  form, setForm, editId, saving,
  onToggleTag, onSignalSelect, onSignalClear,
  onSubmit, onCancel, onDelete,
}) => {
  const preview = useMemo(() => previewPnl(form), [form]);
  const isLinked = !!form.signal_id;

  const update = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, [setForm]);

  const updateEmotion = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, emotions: { ...prev.emotions, [field]: value } }));
  }, [setForm]);

  return (
    <div className="space-y-4">
      {/* Signal Picker */}
      <SignalPicker selectedSignalId={form.signal_id} onSelect={onSignalSelect} onClear={onSignalClear} />

      {/* Live Preview Banner */}
      <LivePreviewBanner form={form} preview={preview} />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        {/* LEFT — Execution + Notes */}
        <div className="space-y-4">
          <ExecutionSection form={form} update={update} isLinked={isLinked} />
          <NotesSection form={form} update={update} />
        </div>

        {/* RIGHT — Psychology + Strategy + Confluences + Mistakes */}
        <div className="space-y-4">
          <PsychologySection form={form} updateEmotion={updateEmotion} />
          <TagSection
            title="Strategy"
            icon={<IconTarget className="h-3 w-3" />}
            options={STRATEGY_OPTIONS}
            selected={form.strategy_tags}
            onToggle={(v) => onToggleTag("strategy_tags", v)}
            accent="gold"
          />
          <TagSection
            title="Confluences"
            icon={<IconSparkles className="h-3 w-3" />}
            options={CONFLUENCE_OPTIONS}
            selected={form.confluence_tags}
            onToggle={(v) => onToggleTag("confluence_tags", v)}
            accent="emerald"
          />
          <TagSection
            title="Mistakes"
            icon={<IconBan className="h-3 w-3" />}
            options={MISTAKE_OPTIONS}
            selected={form.mistakes}
            onToggle={(v) => onToggleTag("mistakes", v)}
            accent="red"
            description="Be honest — this is where edge is built"
          />
        </div>
      </div>

      {/* Action Bar */}
      <ActionBar isEdit={!!editId} saving={saving} onSubmit={onSubmit} onCancel={onCancel} onDelete={onDelete} canSubmit={!!form.pair && !!form.actual_entry} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// SIGNAL PICKER — Flowscan dark dropdown
// ════════════════════════════════════════════════════════════════

const SignalPicker = ({ selectedSignalId, onSelect, onClear }) => {
  const [signals, setSignals] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/api/v1/signals/bulk-7d");
        const arr = Array.isArray(data) ? data : (data.signals || data.items || []);
        arr.sort((a, b) => (b.call_message_id || 0) - (a.call_message_id || 0));
        setSignals(arr);
      } catch {
        try {
          const { data } = await api.get("/api/v1/signals/?page=1&page_size=50&sort_by=created_at&sort_order=desc");
          setSignals(data.items || []);
        } catch {}
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = search.toUpperCase();
    return (s ? signals.filter((x) => x.pair?.toUpperCase().includes(s)) : signals).slice(0, 40);
  }, [signals, search]);

  const getStatusStyle = (st) => {
    const s = (st || "").toLowerCase();
    if (s.includes("tp") || s === "closed_win") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (s === "closed_loss" || s === "sl") return "bg-red-500/15 text-red-300 border-red-500/30";
    return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  };

  const handleSelect = async (sig) => {
    setOpen(false); setSearch("");
    try {
      const { data } = await api.get(`/api/v1/journal/prefill/${sig.signal_id}`);
      onSelect({
        signal_id: sig.signal_id, pair: data.pair,
        planned_entry: data.planned_entry,
        planned_tp1: data.planned_tp1, planned_tp2: data.planned_tp2,
        planned_tp3: data.planned_tp3, planned_tp4: data.planned_tp4,
        planned_sl: data.planned_sl,
      });
    } catch {
      onSelect({
        signal_id: sig.signal_id, pair: sig.pair,
        planned_entry: sig.entry,
        planned_tp1: sig.target1, planned_tp2: sig.target2,
        planned_tp3: sig.target3, planned_tp4: sig.target4,
        planned_sl: sig.stop1,
      });
    }
  };

  // LINKED STATE
  if (selectedSignalId) {
    const lk = signals.find((s) => s.signal_id === selectedSignalId);
    return (
      <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold-primary/30 before:to-transparent bg-gradient-to-r from-[#150b0d] via-[#0a0805] to-[#150b0d] border border-gold-primary/25 rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.15)]">
        <div className="relative z-10 p-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-md border border-gold-primary/30 bg-gold-primary/10 flex items-center justify-center text-gold-primary flex-shrink-0">
            <IconLink className="h-3.5 w-3.5" />
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {lk && <CoinLogo pair={lk.pair} size={26} />}
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-primary/70">Linked to LuxQuant Signal</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[13px] font-medium text-white tracking-tight">{lk?.pair || "Signal"}</span>
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted/55">
                  {lk?.status?.toUpperCase()} · {fmtTime(lk?.created_at)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClear}
            className="h-7 px-2.5 rounded-sm border border-white/[0.08] bg-white/[0.03] text-text-muted/65 hover:text-red-300 hover:border-red-500/30 text-[10px] font-medium uppercase tracking-[0.15em] transition-all"
          >
            Unlink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 h-11 px-4 rounded-md border border-dashed border-gold-primary/25 bg-gold-primary/[0.03] text-text-muted/80 hover:border-gold-primary/40 hover:text-white hover:bg-gold-primary/[0.06] transition-all"
      >
        <IconLink className="h-4 w-4 text-gold-primary/70 flex-shrink-0" />
        <span className="text-[12px] font-medium tracking-tight">Link LuxQuant Signal</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-gold-primary/60 ml-auto">auto-fill 90%</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-md overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/60 bg-[#0a0805]">
          <div className="p-2 border-b border-white/[0.06]">
            <label className="group flex h-9 items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-md px-3 transition-colors focus-within:border-gold-primary/30 focus-within:bg-white/[0.05]">
              <IconSearch className="h-3.5 w-3.5 text-text-muted/55 shrink-0" />
              <input
                type="text"
                placeholder="Search pair…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full min-w-0 bg-transparent text-[12px] font-mono outline-none placeholder:text-text-muted/40 text-white"
              />
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="text-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/50 py-6">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/50 py-6">No signals found</p>
            ) : (
              filtered.map((sig) => (
                <button
                  key={sig.signal_id}
                  onClick={() => handleSelect(sig)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-all text-left border-b border-white/[0.025] last:border-0"
                >
                  <CoinLogo pair={sig.pair} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-white tracking-tight">{sig.pair}</span>
                      {sig.risk_level && (
                        <span className={`text-[8.5px] font-mono font-medium uppercase tracking-[0.12em] px-1 py-px rounded-sm border ${
                          sig.risk_level?.toLowerCase().startsWith("low") ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                          : sig.risk_level?.toLowerCase().startsWith("high") ? "bg-red-500/10 text-red-300 border-red-500/25"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/25"
                        }`}>
                          {sig.risk_level?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono tabular-nums text-text-muted/55 mt-0.5">
                      Entry ${fmtPrice(sig.entry)} · {fmtTime(sig.created_at)}
                    </p>
                  </div>
                  <span className={`text-[9px] font-mono font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm border ${getStatusStyle(sig.status)}`}>
                    {sig.status?.toUpperCase()}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-white/[0.06]">
            <button
              onClick={() => setOpen(false)}
              className="w-full h-7 text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/55 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// LIVE PREVIEW BANNER
// ════════════════════════════════════════════════════════════════

const LivePreviewBanner = ({ form, preview }) => {
  const hasPnl = preview.pnl != null;
  const isPositive = (preview.pnl || 0) >= 0;
  const derivedStatus = !form.actual_exit ? "open" :
    !hasPnl ? "open" :
    Math.abs(preview.pct || 0) < 0.1 ? "breakeven" :
    preview.pnl >= 0 ? "closed_win" : "closed_loss";

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/[0.04]">
        <PreviewCell label="P&L $" value={hasPnl ? fmtMoney(preview.pnl, { sign: true }) : "—"} accent={hasPnl ? (isPositive ? "emerald" : "red") : null} />
        <PreviewCell label="P&L %" value={preview.pct != null ? fmtPct(preview.pct, { sign: true }) : "—"} accent={preview.pct != null ? (preview.pct >= 0 ? "emerald" : "red") : null} />
        <PreviewCell label="R:R" value={preview.rr != null ? `${preview.rr >= 0 ? "+" : ""}${preview.rr.toFixed(2)}` : "—"} accent={preview.rr != null ? (preview.rr >= 1 ? "emerald" : preview.rr < 0 ? "red" : "white") : null} />
        <PreviewCell label="Status" value={STATUS_LABEL[derivedStatus]} isStatus statusKey={derivedStatus} />
      </div>
    </div>
  );
};

const PreviewCell = ({ label, value, accent, isStatus, statusKey }) => {
  const colorMap = { emerald: "text-emerald-400", red: "text-red-400", white: "text-white/85" };
  return (
    <div className="px-3 py-3 flex flex-col gap-1.5 min-w-0">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">{label}</span>
      {isStatus ? (
        <span className={`inline-flex items-center text-[10px] font-mono font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm border w-fit ${STATUS_STYLES[statusKey] || STATUS_STYLES.open}`}>
          {value}
        </span>
      ) : (
        <span className={`text-base sm:text-[17px] font-light tabular-nums tracking-tight truncate ${colorMap[accent] || "text-white/85"}`}>
          {value}
        </span>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// FORM CARD WRAPPER
// ════════════════════════════════════════════════════════════════

const FormCard = ({ title, icon, description, children }) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
    <div className="relative z-10 p-4 sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          {icon && <span className="text-gold-primary/70">{icon}</span>}
          <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">{title}</h3>
        </div>
        {description && <p className="text-[10.5px] text-text-muted/55 leading-relaxed">{description}</p>}
      </div>
      {children}
    </div>
  </div>
);

const FieldLabel = ({ label, required, auto, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-text-muted/55 flex items-center gap-1.5">
      <span>{label}</span>
      {required && <span className="text-gold-primary/70">*</span>}
      {auto && <span className="text-[8px] font-mono font-medium uppercase tracking-[0.1em] text-emerald-400/70 bg-emerald-500/[0.08] border border-emerald-500/20 px-1 py-px rounded-sm">AUTO</span>}
    </span>
    {children}
  </label>
);

// ════════════════════════════════════════════════════════════════
// EXECUTION SECTION
// ════════════════════════════════════════════════════════════════

const ExecutionSection = ({ form, update, isLinked }) => (
  <FormCard title="Execution Details" icon={<IconTarget className="h-3.5 w-3.5" />}>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      <FieldLabel label="Pair" required auto={isLinked}>
        <input
          type="text"
          placeholder="BTCUSDT"
          value={form.pair}
          onChange={(e) => update("pair", e.target.value.toUpperCase())}
          className={`form-input font-mono uppercase ${isLinked ? "form-input-auto" : ""}`}
        />
      </FieldLabel>
      <FieldLabel label="Direction">
        <div className="grid grid-cols-2 gap-1.5">
          <DirectionButton active={form.direction === "long"} onClick={() => update("direction", "long")} type="long" />
          <DirectionButton active={form.direction === "short"} onClick={() => update("direction", "short")} type="short" />
        </div>
      </FieldLabel>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      <FieldLabel label="Planned Entry" auto={isLinked}>
        <input type="number" step="any" placeholder="0.00" value={form.planned_entry} onChange={(e) => update("planned_entry", e.target.value)} className={`form-input font-mono tabular-nums ${isLinked ? "form-input-auto" : ""}`} />
      </FieldLabel>
      <FieldLabel label="Actual Entry" required>
        <input type="number" step="any" placeholder="0.00" value={form.actual_entry} onChange={(e) => update("actual_entry", e.target.value)} className="form-input font-mono tabular-nums" />
      </FieldLabel>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      {[1, 2, 3, 4].map((n) => (
        <FieldLabel key={n} label={`TP${n}`} auto={isLinked}>
          <input type="number" step="any" value={form[`planned_tp${n}`]} onChange={(e) => update(`planned_tp${n}`, e.target.value)} className={`form-input font-mono tabular-nums ${isLinked ? "form-input-auto" : ""}`} />
        </FieldLabel>
      ))}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      <FieldLabel label="Stop Loss" auto={isLinked}>
        <input type="number" step="any" placeholder="0.00" value={form.planned_sl} onChange={(e) => update("planned_sl", e.target.value)} className={`form-input font-mono tabular-nums ${isLinked ? "form-input-auto" : ""}`} />
      </FieldLabel>
      <FieldLabel label="Actual Exit">
        <input type="number" step="any" placeholder="leave blank if open" value={form.actual_exit} onChange={(e) => update("actual_exit", e.target.value)} className="form-input font-mono tabular-nums" />
      </FieldLabel>
    </div>

    <div className="grid grid-cols-3 gap-2">
      <FieldLabel label="Leverage">
        <input type="number" step="any" min="1" value={form.leverage} onChange={(e) => update("leverage", e.target.value)} className="form-input font-mono tabular-nums" />
      </FieldLabel>
      <FieldLabel label="Size (USD)">
        <input type="number" step="any" placeholder="0" value={form.position_size_usd} onChange={(e) => update("position_size_usd", e.target.value)} className="form-input font-mono tabular-nums" />
      </FieldLabel>
      <FieldLabel label="Fees (USD)">
        <input type="number" step="any" value={form.fees_usd} onChange={(e) => update("fees_usd", e.target.value)} className="form-input font-mono tabular-nums" />
      </FieldLabel>
    </div>
  </FormCard>
);

const DirectionButton = ({ active, onClick, type }) => {
  const isLong = type === "long";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md text-[11px] font-medium uppercase tracking-[0.15em] transition-all border flex items-center justify-center gap-1.5 ${
        active
          ? isLong ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-red-500/15 text-red-300 border-red-500/40"
          : "bg-white/[0.03] text-text-muted/55 border-white/[0.06] hover:border-white/[0.14] hover:text-white"
      }`}
    >
      {isLong ? <IconUpTri /> : <IconDownTri />}
      {isLong ? "Long" : "Short"}
    </button>
  );
};

// ════════════════════════════════════════════════════════════════
// NOTES SECTION
// ════════════════════════════════════════════════════════════════

const NotesSection = ({ form, update }) => (
  <FormCard title="Notes & Proof" icon={<IconPencil className="h-3.5 w-3.5" />}>
    <div className="space-y-3">
      <FieldLabel label="What did you learn?">
        <textarea
          rows={4}
          placeholder="Your thesis, what went right/wrong, lessons learned…"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          className="form-input min-h-[100px] resize-y leading-relaxed"
        />
      </FieldLabel>
      <FieldLabel label="TradingView Link">
        <input type="url" placeholder="https://www.tradingview.com/chart/…" value={form.tradingview_link} onChange={(e) => update("tradingview_link", e.target.value)} className="form-input" />
      </FieldLabel>
    </div>
  </FormCard>
);

// ════════════════════════════════════════════════════════════════
// PSYCHOLOGY SECTION
// ════════════════════════════════════════════════════════════════

const PsychologySection = ({ form, updateEmotion }) => (
  <FormCard title="Psychology & Emotions" icon={<IconBrain className="h-3.5 w-3.5" />}>
    <div className="space-y-4">
      <SliderField label="Confidence" value={form.emotions.confidence} onChange={(v) => updateEmotion("confidence", v)} leftLabel="Low" rightLabel="High" color="emerald" />
      <SliderField label="FOMO Level" value={form.emotions.fomo_level} onChange={(v) => updateEmotion("fomo_level", v)} leftLabel="None" rightLabel="Max" color="amber" />
      <SliderField label="Post-Trade Regret" value={form.emotions.regret} onChange={(v) => updateEmotion("regret", v)} leftLabel="None" rightLabel="Max" color="red" />

      <div className="pt-1">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-text-muted/55 block mb-2">Mood</span>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateEmotion("mood", form.emotions.mood === m ? "" : m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-[0.15em] transition-all border flex items-center gap-1.5 ${
                form.emotions.mood === m
                  ? "bg-gold-primary/15 text-white border-gold-primary/40"
                  : "bg-white/[0.03] text-text-muted/70 border-white/[0.06] hover:border-white/[0.14] hover:text-white"
              }`}
            >
              <span className="font-mono text-[11px] leading-none">{MOOD_GLYPH[m]}</span>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  </FormCard>
);

const SliderField = ({ label, value, onChange, leftLabel, rightLabel, color = "emerald" }) => {
  const v = parseInt(value) || 0;
  const pct = (v / 10) * 100;
  const colorVar = {
    emerald: { fill: "rgba(16,185,129,0.55)", glow: "rgba(16,185,129,0.25)" },
    amber: { fill: "rgba(245,158,11,0.55)", glow: "rgba(245,158,11,0.25)" },
    red: { fill: "rgba(239,68,68,0.55)", glow: "rgba(239,68,68,0.25)" },
  }[color];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">{label}</span>
        <span className="text-sm font-light tabular-nums text-white tracking-tight">{v}</span>
      </div>
      <div className="relative h-7 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/[0.04] border border-white/[0.04]" />
        <div className="absolute h-1.5 rounded-full transition-all duration-150" style={{ width: `${pct}%`, background: colorVar.fill, boxShadow: `0 0 8px ${colorVar.glow}` }} />
        <div className="absolute inset-x-0 flex justify-between pointer-events-none">
          {Array.from({ length: 11 }).map((_, i) => <div key={i} className="w-px h-2 bg-white/[0.05]" />)}
        </div>
        <input
          type="range" min="0" max="10" step="1"
          value={v}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 pointer-events-none transition-all"
          style={{ left: `calc(${pct}% - 7px)`, backgroundColor: "#0a0805", borderColor: colorVar.fill, boxShadow: `0 0 6px ${colorVar.glow}` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45">{leftLabel}</span>
        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45">{rightLabel}</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// TAG SECTION (multi-select pills)
// ════════════════════════════════════════════════════════════════

const TagSection = ({ title, icon, options, selected = [], onToggle, accent = "gold", description }) => {
  const accentMap = {
    gold: { active: "bg-gold-primary/15 text-white border-gold-primary/40", count: "text-gold-primary" },
    emerald: { active: "bg-emerald-500/12 text-emerald-200 border-emerald-500/40", count: "text-emerald-400" },
    red: { active: "bg-red-500/12 text-red-200 border-red-500/40", count: "text-red-400" },
  }[accent];

  return (
    <FormCard title={title} icon={icon} description={description}>
      {selected.length > 0 && (
        <div className="text-[9px] font-mono uppercase tracking-[0.15em] mb-2">
          <span className={accentMap.count}>{selected.length}</span>
          <span className="text-text-muted/45 ml-1">selected</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium tracking-tight transition-all border flex items-center gap-1.5 ${
                active ? accentMap.active : "bg-white/[0.03] text-text-muted/70 border-white/[0.06] hover:border-white/[0.14] hover:text-white"
              }`}
            >
              {active && <IconCheck className="h-2.5 w-2.5" />}
              {opt}
            </button>
          );
        })}
      </div>
    </FormCard>
  );
};

// ════════════════════════════════════════════════════════════════
// ACTION BAR
// ════════════════════════════════════════════════════════════════

const ActionBar = ({ isEdit, saving, onSubmit, onCancel, onDelete, canSubmit }) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] sticky bottom-3 z-30 backdrop-blur-md">
    <div className="relative z-10 p-3 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-red-500/25 bg-red-500/[0.06] text-red-300 hover:bg-red-500/12 hover:border-red-500/40 transition-all text-[11px] font-medium uppercase tracking-[0.12em]"
          >
            <IconTrash className="h-3 w-3" />
            <span>Delete</span>
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center h-9 px-3 rounded-md border border-white/[0.08] bg-white/[0.03] text-text-muted/85 hover:text-white hover:border-white/[0.14] hover:bg-white/[0.05] transition-all text-[11px] font-medium uppercase tracking-[0.12em]"
        >
          Cancel
        </button>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving || !canSubmit}
        className="flex items-center gap-2 h-9 px-5 rounded-md border border-gold-primary/40 bg-gold-primary/15 text-gold-primary hover:bg-gold-primary/20 hover:border-gold-primary/60 transition-all text-[11px] font-medium uppercase tracking-[0.14em] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <IconCheck className="h-3.5 w-3.5" />
        <span>{saving ? "Saving…" : isEdit ? "Update Entry" : "Save Entry"}</span>
      </button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// ★ ANALYTICS VIEW ★
// ════════════════════════════════════════════════════════════════

const AnalyticsView = ({ stats, insights, entries }) => {
  if (!stats) {
    return (
      <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <IconChart className="h-7 w-7 text-text-muted/30" />
          <p className="text-[12px] font-mono uppercase tracking-[0.15em] text-text-muted/55">
            Log trades to unlock analytics
          </p>
        </div>
      </div>
    );
  }

  // Build equity curve from entries directly (analytics view doesn't get it via stats)
  const equityCurve = useMemo(() => {
    const closed = entries
      .filter((e) => e.status !== "open" && e.pnl_usd != null && e.exit_at)
      .sort((a, b) => new Date(a.exit_at) - new Date(b.exit_at));
    let cum = 0;
    return closed.map((e) => {
      cum += e.pnl_usd || 0;
      return { date: e.exit_at, equity: cum, pnl: e.pnl_usd, pair: e.pair };
    });
  }, [entries]);

  // Profit factor
  const closed = entries.filter((e) => e.status !== "open" && e.pnl_usd != null);
  const wins = closed.filter((e) => e.pnl_usd > 0);
  const losses = closed.filter((e) => e.pnl_usd < 0);
  const grossWin = wins.reduce((s, e) => s + e.pnl_usd, 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnl_usd, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const expectancy = stats.total_trades > 0 ? (stats.total_pnl_usd || 0) / closed.length : 0;

  return (
    <div className="space-y-4">
      {/* HERO */}
      <AnalyticsHero stats={stats} profitFactor={profitFactor} expectancy={expectancy} closedCount={closed.length} />

      {/* AI COACH */}
      <AICoachCard insights={insights} stats={stats} closedCount={closed.length} />

      {/* EQUITY CURVE */}
      {equityCurve.length >= 2 && <EquityCurveCard points={equityCurve} />}

      {/* TWO COLUMN: P&L DISTRIBUTION + STRATEGY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PnlDistributionCard entries={entries} />
        <StrategyBreakdownCard stats={stats} />
      </div>

      {/* MOOD + DAY OF WEEK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MoodPerformanceCard stats={stats} />
        <DayOfWeekCard stats={stats} />
      </div>

      {/* STREAKS */}
      <StreaksRow stats={stats} />
    </div>
  );
};

// ── Analytics Hero — 4 hero stats ────────────────────────
const AnalyticsHero = ({ stats, profitFactor, expectancy, closedCount }) => {
  const totalPnl = stats.total_pnl_usd || 0;
  const winRate = stats.win_rate || 0;
  const cards = [
    {
      label: "Total P&L",
      value: fmtMoney(totalPnl, { sign: true }),
      sub: `${closedCount} closed · ${stats.open_trades || 0} open`,
      accent: totalPnl >= 0 ? "emerald" : "red",
    },
    {
      label: "Win Rate",
      value: fmtPct(winRate, { decimals: 1 }),
      sub: `${stats.wins || 0} W / ${stats.losses || 0} L`,
      accent: winRate >= 50 ? "emerald" : winRate >= 40 ? "amber" : "red",
    },
    {
      label: "Avg R:R",
      value: stats.avg_rr != null ? stats.avg_rr.toFixed(2) : "—",
      sub: "Risk : Reward",
      accent: stats.avg_rr != null && stats.avg_rr >= 1.5 ? "emerald" : "white",
    },
    {
      label: "Expectancy",
      value: fmtMoney(expectancy, { sign: true }),
      sub: "per trade avg",
      accent: expectancy >= 0 ? "emerald" : "red",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => <HeroCard key={i} {...c} />)}
    </div>
  );
};

const HeroCard = ({ label, value, sub, accent }) => {
  const colorMap = { emerald: "text-emerald-400", red: "text-red-400", amber: "text-amber-400", white: "text-white" };
  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#120809] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 transition-all hover:border-white/[0.10]">
      <div className="relative z-10 flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">{label}</span>
        <span className={`text-2xl sm:text-[28px] font-light tabular-nums tracking-tight leading-none mt-1 ${colorMap[accent] || "text-white"}`}>{value}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted/45 mt-1.5">{sub}</span>
      </div>
    </div>
  );
};

// ── AI Coach Insights ────────────────────────────────────
const AICoachCard = ({ insights, stats, closedCount }) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold-primary/30 before:to-transparent bg-gradient-to-br from-[#150b0d] to-[#0a0805] border border-gold-primary/15 rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.15)]">
    <div className="relative z-10 p-4 sm:p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-7 h-7 rounded-md border border-gold-primary/30 bg-gold-primary/10 flex items-center justify-center text-gold-primary">
          <IconSparkles className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">AI Coach Insights</h3>
            {insights?.source === "gemini" && (
              <span className="text-[8.5px] font-mono uppercase tracking-[0.12em] text-gold-primary bg-gold-primary/[0.1] border border-gold-primary/20 px-1.5 py-px rounded-sm">
                Gemini
              </span>
            )}
          </div>
          <p className="text-[9.5px] font-mono uppercase tracking-[0.15em] text-text-muted/55">
            Pattern detection · {closedCount} closed trades
          </p>
        </div>
      </div>

      {!insights || !insights.insights || insights.insights.length === 0 ? (
        <div className="px-3 py-3 bg-white/[0.02] border border-white/[0.04] rounded-md">
          <p className="text-[11.5px] text-text-muted/65 leading-relaxed">
            {closedCount < 3 ? (
              <>Log <span className="text-white font-medium">{Math.max(0, 3 - closedCount)}</span> more closed trades to generate insights. Keep journaling — patterns emerge with data.</>
            ) : (
              <>No insights available right now. Try refreshing analytics later.</>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {insights.insights.map((text, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-gold-primary/15 bg-gold-primary/[0.03]">
              <span className="flex-shrink-0 mt-0.5 text-gold-primary/80">
                <IconSparkles className="h-3.5 w-3.5" />
              </span>
              <p className="text-[11.5px] text-white/85 leading-relaxed flex-1">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ── P&L Distribution Histogram ──────────────────────────
const PnlDistributionCard = ({ entries }) => {
  const closed = entries.filter((e) => e.status !== "open" && e.pnl_pct != null);

  const bins = useMemo(() => {
    const edges = [-Infinity, -25, -10, -5, 0, 5, 10, 25, Infinity];
    const labels = ["≤-25%", "-25/-10", "-10/-5", "-5/0", "0/5", "5/10", "10/25", "≥25%"];
    const counts = new Array(labels.length).fill(0);
    closed.forEach((e) => {
      const v = e.pnl_pct;
      for (let i = 0; i < edges.length - 1; i++) {
        if (v >= edges[i] && v < edges[i + 1]) { counts[i]++; return; }
      }
    });
    return { labels, counts };
  }, [closed]);

  const max = Math.max(1, ...bins.counts);

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 sm:p-5">
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">P&amp;L Distribution</h3>
          <span className="text-[9.5px] font-mono uppercase tracking-[0.15em] text-text-muted/45">% return per trade</span>
        </div>

        {closed.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
            No closed trades yet
          </div>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {bins.counts.map((c, i) => {
              const isNeg = i < 4;
              const isZero = c === 0;
              const h = (c / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <div className="text-[9px] font-mono tabular-nums text-text-muted/55 h-3.5 leading-none">{c > 0 ? c : ""}</div>
                  <div className="w-full flex flex-col-reverse h-32 relative">
                    <div
                      className={`w-full rounded-t-sm transition-all border-t ${
                        isZero ? "bg-white/[0.02] border-white/[0.04]"
                        : isNeg ? "bg-red-500/30 border-red-500/50 group-hover:bg-red-500/40"
                        : "bg-emerald-500/30 border-emerald-500/50 group-hover:bg-emerald-500/40"
                      }`}
                      style={{ height: `${Math.max(h, isZero ? 3 : 6)}%` }}
                    />
                  </div>
                  <div className="text-[8.5px] font-mono uppercase text-text-muted/45 text-center leading-tight h-6">
                    {bins.labels[i]}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Strategy Breakdown ──────────────────────────────────
const StrategyBreakdownCard = ({ stats }) => {
  const data = useMemo(() => {
    if (!stats.win_rate_by_strategy) return [];
    return Object.entries(stats.win_rate_by_strategy)
      .map(([name, d]) => ({
        name,
        winRate: d.win_rate || 0,
        wins: d.wins || 0,
        losses: d.losses || 0,
        pnl: d.pnl || 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [stats]);

  const maxAbsPnl = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 sm:p-5">
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">Strategy Performance</h3>
          <span className="text-[9.5px] font-mono uppercase tracking-[0.15em] text-text-muted/45">win rate by strategy</span>
        </div>

        {data.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
            Tag strategies on entries
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.map((row, i) => {
              const isPos = row.pnl >= 0;
              const wrColor = row.winRate >= 60 ? "text-emerald-400" : row.winRate >= 40 ? "text-amber-400" : "text-red-400";
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-medium text-white truncate tracking-tight">{row.name}</span>
                      <span className="text-[9px] font-mono tabular-nums text-text-muted/50">
                        {row.wins}W / {row.losses}L
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono tabular-nums font-medium ${wrColor}`}>
                      {row.winRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.03] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.winRate}%`,
                        background: row.winRate >= 60 ? "rgba(16,185,129,0.55)" : row.winRate >= 40 ? "rgba(245,158,11,0.55)" : "rgba(239,68,68,0.55)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Mood vs PnL ─────────────────────────────────────────
const MoodPerformanceCard = ({ stats }) => {
  const data = useMemo(() => {
    if (!stats.win_rate_by_emotion) return [];
    return MOOD_OPTIONS.map((m) => {
      const d = stats.win_rate_by_emotion[m];
      return {
        name: m,
        winRate: d?.win_rate || 0,
        count: (d?.wins || 0) + (d?.losses || 0),
        hasData: !!d,
      };
    });
  }, [stats]);

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 sm:p-5">
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">Mood Impact</h3>
          <span className="text-[9.5px] font-mono uppercase tracking-[0.15em] text-text-muted/45">win rate by emotion</span>
        </div>

        {data.every((d) => !d.hasData) ? (
          <div className="h-40 flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
            Tag mood on entries
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((row) => {
              const wrColor = !row.hasData ? "text-text-muted/30"
                : row.winRate >= 60 ? "text-emerald-400"
                : row.winRate >= 40 ? "text-amber-400"
                : "text-red-400";
              return (
                <div key={row.name}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-white/[0.04] text-[11px] font-mono text-text-muted/85 leading-none">
                        {MOOD_GLYPH[row.name]}
                      </span>
                      <span className="text-[11px] font-medium text-white tracking-tight">{row.name}</span>
                      <span className="text-[9px] font-mono tabular-nums text-text-muted/45">
                        {row.hasData ? `${row.count}×` : "—"}
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono tabular-nums font-medium ${wrColor}`}>
                      {row.hasData ? `${row.winRate.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.03] overflow-hidden">
                    {row.hasData && (
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(row.winRate, 2)}%`,
                          background: row.winRate >= 60 ? "rgba(16,185,129,0.55)" : row.winRate >= 40 ? "rgba(245,158,11,0.55)" : "rgba(239,68,68,0.55)",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Day of Week ─────────────────────────────────────────
const DayOfWeekCard = ({ stats }) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const data = useMemo(() => {
    return days.map((d) => ({ day: d, pnl: stats.pnl_by_day?.[d] || 0 }));
  }, [stats]);

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const hasAny = data.some((d) => d.pnl !== 0);

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 sm:p-5">
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-[12px] font-semibold text-white uppercase tracking-[0.18em]">Day of Week</h3>
          <span className="text-[9.5px] font-mono uppercase tracking-[0.15em] text-text-muted/45">P&amp;L by weekday</span>
        </div>

        {!hasAny ? (
          <div className="h-40 flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
            No data
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {data.map((row) => {
              const isPos = row.pnl > 0;
              const isZero = row.pnl === 0;
              const intensity = isZero ? 0 : Math.min(Math.abs(row.pnl) / maxAbs, 1) * 0.5 + 0.18;
              const bg = isZero ? "rgba(255,255,255,0.02)"
                : isPos ? `rgba(16,185,129,${intensity})`
                : `rgba(239,68,68,${intensity})`;
              const border = isZero ? "rgba(255,255,255,0.04)"
                : isPos ? `rgba(16,185,129,${intensity + 0.15})`
                : `rgba(239,68,68,${intensity + 0.15})`;
              return (
                <div key={row.day} className="text-center">
                  <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45 mb-1.5">{row.day}</p>
                  <div className="rounded-md border py-3.5 flex flex-col items-center justify-center" style={{ background: bg, borderColor: border }}>
                    <span className={`text-[11px] font-mono tabular-nums font-medium ${isZero ? "text-text-muted/35" : isPos ? "text-emerald-400" : "text-red-400"}`}>
                      {isZero ? "—" : fmtMoney(row.pnl, { sign: true, decimals: 0 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Streaks Row ─────────────────────────────────────────
const StreaksRow = ({ stats }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <StreakCard
      label="Best Trade"
      value={stats.best_trade_pnl != null ? fmtMoney(stats.best_trade_pnl, { sign: true, decimals: 0 }) : "—"}
      sub={stats.best_trade_pair ? stripQuote(stats.best_trade_pair) : ""}
      accent="emerald"
      icon={<IconArrowUp className="h-3.5 w-3.5" />}
    />
    <StreakCard
      label="Worst Trade"
      value={stats.worst_trade_pnl != null ? fmtMoney(stats.worst_trade_pnl, { sign: true, decimals: 0 }) : "—"}
      sub={stats.worst_trade_pair ? stripQuote(stats.worst_trade_pair) : ""}
      accent="red"
      icon={<IconArrowDown className="h-3.5 w-3.5" />}
    />
    <StreakCard
      label="Win Streak"
      value={stats.longest_win_streak || 0}
      sub="consecutive"
      accent="emerald"
      icon={<IconFire className="h-3.5 w-3.5" />}
    />
    <StreakCard
      label="Loss Streak"
      value={stats.longest_loss_streak || 0}
      sub="consecutive"
      accent="red"
      icon={<IconFire className="h-3.5 w-3.5" />}
    />
  </div>
);

const StreakCard = ({ label, value, sub, accent, icon }) => {
  const colorMap = { emerald: "text-emerald-400", red: "text-red-400" };
  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#120809] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/55">{label}</span>
          <span className={colorMap[accent] || "text-text-muted/45"}>{icon}</span>
        </div>
        <p className={`text-2xl sm:text-[28px] font-light tabular-nums tracking-tight leading-none ${colorMap[accent] || "text-white"}`}>{value}</p>
        {sub && <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted/45 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// STYLES — form inputs + slider native hide
// ════════════════════════════════════════════════════════════════

const JournalStyles = () => (
  <style>{`
    .form-input {
      width: 100%;
      min-width: 0;
      height: 36px;
      padding: 0 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s, background-color 0.15s;
    }
    textarea.form-input {
      height: auto;
      padding: 10px 12px;
      font-family: inherit;
      line-height: 1.5;
    }
    .form-input::placeholder { color: rgba(255,255,255,0.25); }
    .form-input:hover { border-color: rgba(255,255,255,0.12); }
    .form-input:focus {
      border-color: rgba(212, 168, 83, 0.4);
      background: rgba(255,255,255,0.05);
    }
    .form-input-auto {
      background: rgba(212, 168, 83, 0.04);
      border-color: rgba(212, 168, 83, 0.18);
      color: rgba(212, 168, 83, 0.95);
    }
    .form-input[type="number"]::-webkit-outer-spin-button,
    .form-input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .form-input[type="number"] { -moz-appearance: textfield; }
    select.form-input, select { cursor: pointer; }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px; height: 14px;
    }
    input[type="range"]::-moz-range-thumb {
      width: 14px; height: 14px; border: 0; background: transparent;
    }
  `}</style>
);