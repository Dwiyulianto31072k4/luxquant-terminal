// frontend-react/src/components/JournalPage.jsx
// LuxQuant Trade Journal v4 — Pro History Table + PnL Calendar + Signal Picker + Analytics
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import api from '../services/authApi';
import CoinLogo from './CoinLogo';

const MOOD_OPTIONS = ['Calm', 'Focused', 'Excited', 'Anxious', 'FOMO', 'Revenge', 'Tired'];
const STRATEGY_OPTIONS = ['LuxQuant Signal', 'Breakout', 'ICT / SMC', 'Mean Reversion', 'Scalp', 'Swing'];
const CONFLUENCE_OPTIONS = ['Volume Spike', 'Whale Accumulation', 'News Catalyst', 'Support Level', 'RSI Divergence', 'AI Hot Streak'];
const MISTAKE_OPTIONS = ['Early Exit', 'Moved SL', 'Oversized', 'FOMO Entry', 'Revenge Trade', 'No Plan', 'Ignored SL', 'Added to Loser'];
const EMPTY_FORM = { signal_id: null, pair: '', direction: 'long', planned_entry: '', planned_tp1: '', planned_tp2: '', planned_tp3: '', planned_tp4: '', planned_sl: '', actual_entry: '', actual_exit: '', leverage: 1, position_size_usd: '', fees_usd: 0, emotions: { confidence: 5, fomo_level: 0, mood: '', regret: 0 }, strategy_tags: [], confluence_tags: [], mistakes: [], notes: '', chart_before_url: '', chart_after_url: '', tradingview_link: '', entry_at: '', exit_at: '' };

// ── Tiny helpers ──
const Chip = ({ label, selected, color = 'gold', onClick }) => {
  const c = { gold: 'bg-gold-primary/15 border-gold-primary/40 text-gold-primary', green: 'bg-positive/10 border-positive/35 text-positive', red: 'bg-negative/10 border-negative/35 text-negative', cyan: 'bg-cyan-500/10 border-cyan-500/35 text-cyan-400' };
  return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selected ? c[color] : 'border-gold-primary/10 text-text-muted hover:border-gold-primary/25 hover:text-text-secondary'}`}>{label}</button>;
};
const Slider = ({ label, value, onChange, min = 0, max = 10, leftLabel, rightLabel }) => (
  <div className="mb-4"><label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">{label}</label><div className="flex items-center gap-3">{leftLabel && <span className="text-[10px] text-text-muted w-8">{leftLabel}</span>}<input type="range" min={min} max={max} value={value} onChange={e => onChange(parseInt(e.target.value))} className="flex-1 h-1 rounded-full appearance-none bg-gold-primary/20 accent-gold-primary" /><span className="font-mono text-sm font-semibold text-gold-primary w-6 text-center">{value}</span>{rightLabel && <span className="text-[10px] text-text-muted w-8 text-right">{rightLabel}</span>}</div></div>
);
const KPICard = ({ label, value, sub, color = 'text-gold-light' }) => (
  <div className="bg-bg-secondary/50 border border-gold-primary/8 rounded-xl p-4 text-center"><p className="text-[10px] uppercase tracking-widest text-text-muted mb-1">{label}</p><p className={`font-mono text-xl font-bold ${color}`}>{value}</p>{sub && <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>}</div>
);
const AutoBadge = () => <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-positive bg-positive/10 px-1.5 py-0.5 rounded border border-positive/20 ml-1">AUTO</span>;
const fmtTime = (d) => { if (!d) return ''; try { const dt = new Date(d), now = new Date(), h = Math.floor((now-dt)/36e5); if (h<1) return 'Just now'; if (h<24) return h+'h ago'; if (h<48) return 'Yesterday'; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch { return ''; } };
const fmtDate = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
const fmtPrice = (p) => { if (!p && p !== 0) return '-'; const n = parseFloat(p); if (n >= 1000) return '$'+n.toLocaleString('en-US',{maximumFractionDigits:2}); if (n >= 1) return '$'+n.toFixed(2); return '$'+n.toPrecision(4); };

// ════════════════════════════════════════
// PNL CALENDAR
// ════════════════════════════════════════
const PnLCalendar = ({ entries }) => {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dayPnl = useMemo(() => {
    const map = {};
    (entries || []).forEach(e => {
      if (!e.entry_at || e.pnl_usd === null || e.pnl_usd === undefined) return;
      const d = new Date(e.entry_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        map[day] = (map[day] || 0) + (e.pnl_usd || 0);
      }
    });
    return map;
  }, [entries, month, year]);

  const dayCount = useMemo(() => {
    const map = {};
    (entries || []).forEach(e => {
      if (!e.entry_at) return;
      const d = new Date(e.entry_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        map[day] = (map[day] || 0) + 1;
      }
    });
    return map;
  }, [entries, month, year]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const pnl = dayPnl[d];
    const count = dayCount[d] || 0;
    const isToday = d === now.getDate();
    let bg = 'bg-white/[0.02]', txt = 'text-text-muted/40';
    if (pnl !== undefined) {
      if (pnl > 0) { bg = 'bg-positive/15'; txt = 'text-positive'; }
      else if (pnl < 0) { bg = 'bg-negative/15'; txt = 'text-negative'; }
      else { bg = 'bg-white/[0.06]'; txt = 'text-text-muted'; }
    }
    cells.push(
      <div key={d} className={`relative rounded-lg p-1 text-center ${bg} ${isToday ? 'ring-1 ring-gold-primary/40' : ''}`}>
        <p className={`text-[10px] font-medium ${pnl !== undefined ? 'text-text-secondary' : 'text-text-muted/40'}`}>{d}</p>
        {pnl !== undefined ? (
          <p className={`text-[9px] font-mono font-bold ${txt}`}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}</p>
        ) : (
          <p className="text-[9px] text-text-muted/20">-</p>
        )}
        {count > 0 && <p className="text-[7px] text-text-muted/50">{count}t</p>}
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-white">{monthName}</h4>
        <div className="flex items-center gap-3 text-[9px] text-text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-positive/30" /> Profit</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-negative/30" /> Loss</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="text-[8px] text-text-muted/50 text-center font-semibold">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">{cells}</div>
    </div>
  );
};

// ════════════════════════════════════════
// RECAP STATS BAR
// ════════════════════════════════════════
const RecapBar = ({ entries }) => {
  const stats = useMemo(() => {
    const closed = entries.filter(e => e.status !== 'open' && e.pnl_usd !== null);
    const wins = closed.filter(e => e.pnl_usd > 0);
    const losses = closed.filter(e => e.pnl_usd < 0);
    const totalPnl = closed.reduce((s, e) => s + (e.pnl_usd || 0), 0);
    const wr = closed.length ? (wins.length / closed.length * 100) : 0;
    const avgPnl = closed.length ? totalPnl / closed.length : 0;
    const best = closed.length ? Math.max(...closed.map(e => e.pnl_usd || 0)) : 0;
    const worst = closed.length ? Math.min(...closed.map(e => e.pnl_usd || 0)) : 0;
    const openCount = entries.filter(e => e.status === 'open').length;
    return { total: entries.length, closed: closed.length, wins: wins.length, losses: losses.length, totalPnl, wr, avgPnl, best, worst, openCount };
  }, [entries]);

  const items = [
    { label: 'Total', value: stats.total, color: 'text-white' },
    { label: 'Open', value: stats.openCount, color: 'text-cyan-400' },
    { label: 'Wins', value: stats.wins, color: 'text-positive' },
    { label: 'Losses', value: stats.losses, color: 'text-negative' },
    { label: 'Win Rate', value: `${stats.wr.toFixed(1)}%`, color: stats.wr >= 50 ? 'text-positive' : 'text-negative' },
    { label: 'Net PnL', value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-positive' : 'text-negative' },
    { label: 'Avg PnL', value: `$${stats.avgPnl.toFixed(2)}`, color: stats.avgPnl >= 0 ? 'text-positive' : 'text-negative' },
    { label: 'Best', value: `+$${stats.best.toFixed(0)}`, color: 'text-positive' },
    { label: 'Worst', value: `$${stats.worst.toFixed(0)}`, color: 'text-negative' },
  ];

  return (
    <div className="glass-card p-3 mb-4">
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
        {items.map(it => (
          <div key={it.label} className="flex-shrink-0 text-center min-w-[60px]">
            <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">{it.label}</p>
            <p className={`font-mono text-sm font-bold ${it.color}`}>{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// SIGNAL PICKER (cached bulk-7d)
// ════════════════════════════════════════
const SignalPicker = ({ onSelect, onClear, selectedSignalId }) => {
  const [signals, setSignals] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/api/v1/signals/bulk-7d');
        const arr = Array.isArray(data) ? data : (data.signals || data.items || []);
        arr.sort((a, b) => (b.call_message_id || 0) - (a.call_message_id || 0));
        setSignals(arr);
      } catch {
        try { const { data } = await api.get('/api/v1/signals/?page=1&page_size=50&sort_by=created_at&sort_order=desc'); setSignals(data.items || []); } catch {}
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => { const s = search.toUpperCase(); return (s ? signals.filter(x => x.pair?.toUpperCase().includes(s)) : signals).slice(0, 40); }, [signals, search]);
  const getStatusStyle = (st) => { const s = (st||'').toLowerCase(); if (s.includes('tp')||s==='closed_win') return 'bg-positive/15 text-positive'; if (s==='closed_loss'||s==='sl') return 'bg-negative/15 text-negative'; return 'bg-cyan-500/15 text-cyan-400'; };

  const handleSelect = async (sig) => {
    setOpen(false); setSearch('');
    try { const { data } = await api.get(`/api/v1/journal/prefill/${sig.signal_id}`); onSelect({ signal_id: sig.signal_id, pair: data.pair, planned_entry: data.planned_entry, planned_tp1: data.planned_tp1, planned_tp2: data.planned_tp2, planned_tp3: data.planned_tp3, planned_tp4: data.planned_tp4, planned_sl: data.planned_sl }); }
    catch { onSelect({ signal_id: sig.signal_id, pair: sig.pair, planned_entry: sig.entry, planned_tp1: sig.target1, planned_tp2: sig.target2, planned_tp3: sig.target3, planned_tp4: sig.target4, planned_sl: sig.stop1 }); }
  };

  if (selectedSignalId) {
    const lk = signals.find(s => s.signal_id === selectedSignalId);
    return (<div className="flex items-center gap-3 p-3 rounded-xl bg-gold-primary/5 border border-gold-primary/15"><svg className="w-4 h-4 text-gold-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg><div className="flex items-center gap-2 flex-1 min-w-0">{lk && <CoinLogo pair={lk.pair} size={24} />}<div><p className="text-xs text-text-muted">Linked to LuxQuant Signal</p><p className="text-sm font-semibold text-gold-light">{lk?.pair||'Signal'} <span className="text-[10px] text-text-muted font-normal">• {lk?.status?.toUpperCase()} • {fmtTime(lk?.created_at)}</span></p></div></div><button onClick={onClear} className="text-[10px] text-text-muted hover:text-negative px-2 py-1 rounded border border-gold-primary/10 hover:border-negative/30 transition-all">Unlink</button></div>);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gold-primary/20 hover:border-gold-primary/40 bg-gold-primary/[0.03] text-text-secondary hover:text-gold-primary transition-all text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>Link LuxQuant Signal (auto-fill 90%)
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-gold-primary/15" style={{background:'#110809'}}>
          <div className="p-2"><input type="text" placeholder="Search pair..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus className="w-full px-3 py-2 rounded-lg text-xs bg-bg-primary/80 border border-gold-primary/10 text-white placeholder-text-muted focus:border-gold-primary/30 outline-none" /></div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? <p className="text-center text-text-muted text-xs py-6">Loading...</p> : filtered.length===0 ? <p className="text-center text-text-muted text-xs py-6">No signals found</p> :
            filtered.map(sig => (
              <button key={sig.signal_id} onClick={() => handleSelect(sig)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gold-primary/8 transition-all text-left border-b border-white/[0.03] last:border-0">
                <CoinLogo pair={sig.pair} size={28} />
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-xs font-semibold text-white">{sig.pair}</p><span className={`text-[8px] font-bold px-1 py-0.5 rounded ${sig.risk_level?.toLowerCase().startsWith('low')?'bg-positive/15 text-positive':sig.risk_level?.toLowerCase().startsWith('high')?'bg-negative/15 text-negative':'bg-warning/15 text-warning'}`}>{sig.risk_level?.toUpperCase()}</span></div><p className="text-[10px] text-text-muted">Entry: {fmtPrice(sig.entry)} • {fmtTime(sig.created_at)}</p></div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getStatusStyle(sig.status)}`}>{sig.status?.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-gold-primary/10"><button onClick={() => setOpen(false)} className="w-full py-1.5 text-[10px] text-text-muted hover:text-white text-center">Cancel</button></div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════
// MAIN
// ════════════════════════════════════════
const JournalPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('history');
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterPair, setFilterPair] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStrategy, setFilterStrategy] = useState('all');
  const [sortBy, setSortBy] = useState('entry_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [form, setForm] = useState({...EMPTY_FORM});

  useEffect(() => { if (location.state?.prefill) { const p = location.state.prefill; setForm(prev => ({...prev, signal_id: p.signal_id||null, pair: p.pair||'', planned_entry: p.planned_entry||'', planned_tp1: p.planned_tp1||'', planned_tp2: p.planned_tp2||'', planned_tp3: p.planned_tp3||'', planned_tp4: p.planned_tp4||'', planned_sl: p.planned_sl||'', actual_entry: p.planned_entry||'', strategy_tags: p.signal_id ? ['LuxQuant Signal'] : []})); setActiveTab('entry'); window.history.replaceState({}, document.title); } }, [location.state]);
  
  // Prefill from SignalModal via sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('journal_prefill');
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setForm(prev => ({
          ...prev,
          signal_id: p.signal_id || null,
          pair: p.pair || '',
          planned_entry: p.planned_entry || '',
          planned_tp1: p.planned_tp1 || '',
          planned_tp2: p.planned_tp2 || '',
          planned_tp3: p.planned_tp3 || '',
          planned_tp4: p.planned_tp4 || '',
          planned_sl: p.planned_sl || '',
          actual_entry: p.planned_entry || '',
          strategy_tags: p.signal_id ? ['LuxQuant Signal'] : [],
        }));
        setActiveTab('entry');
      } catch {}
      sessionStorage.removeItem('journal_prefill');
    }
  }, []);

  const fetchEntries = useCallback(async () => { try { setLoading(true); const p = new URLSearchParams(); if (filterPair) p.append('pair', filterPair.toUpperCase()); if (filterStatus !== 'all') p.append('status', filterStatus); if (filterStrategy !== 'all') p.append('strategy', filterStrategy); p.append('sort_by', sortBy); p.append('sort_order', sortOrder); const { data } = await api.get(`/api/v1/journal/?${p}`); setEntries(data.items || []); } catch {} finally { setLoading(false); } }, [filterPair, filterStatus, filterStrategy, sortBy, sortOrder]);
  const fetchStats = useCallback(async () => { try { const { data } = await api.get('/api/v1/journal/stats/overview'); setStats(data); } catch {} }, []);
  const fetchInsights = useCallback(async () => { try { const { data } = await api.get('/api/v1/journal/ai/insights'); setInsights(data); } catch {} }, []);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { if (activeTab === 'analytics') { fetchStats(); fetchInsights(); } }, [activeTab, fetchStats, fetchInsights]);

  const resetForm = () => { setForm({...EMPTY_FORM}); setEditId(null); };
  const toggleTag = (f, t) => setForm(prev => ({...prev, [f]: prev[f].includes(t) ? prev[f].filter(x=>x!==t) : [...prev[f], t]}));
  const handleSignalSelect = (d) => setForm(prev => ({...prev, signal_id: d.signal_id, pair: d.pair||prev.pair, planned_entry: d.planned_entry||'', planned_tp1: d.planned_tp1||'', planned_tp2: d.planned_tp2||'', planned_tp3: d.planned_tp3||'', planned_tp4: d.planned_tp4||'', planned_sl: d.planned_sl||'', actual_entry: d.planned_entry||prev.actual_entry, strategy_tags: prev.strategy_tags.includes('LuxQuant Signal') ? prev.strategy_tags : ['LuxQuant Signal', ...prev.strategy_tags]}));
  const handleSignalClear = () => setForm(prev => ({...prev, signal_id: null, planned_entry: '', planned_tp1: '', planned_tp2: '', planned_tp3: '', planned_tp4: '', planned_sl: '', strategy_tags: prev.strategy_tags.filter(t=>t!=='LuxQuant Signal')}));

  const handleSubmit = async () => {
    if (!form.pair || !form.actual_entry) return; setSaving(true);
    try {
      const p = {...form, pair: form.pair.toUpperCase(), actual_entry: parseFloat(form.actual_entry), actual_exit: form.actual_exit ? parseFloat(form.actual_exit) : null, planned_entry: form.planned_entry ? parseFloat(form.planned_entry) : null, planned_tp1: form.planned_tp1 ? parseFloat(form.planned_tp1) : null, planned_tp2: form.planned_tp2 ? parseFloat(form.planned_tp2) : null, planned_tp3: form.planned_tp3 ? parseFloat(form.planned_tp3) : null, planned_tp4: form.planned_tp4 ? parseFloat(form.planned_tp4) : null, planned_sl: form.planned_sl ? parseFloat(form.planned_sl) : null, leverage: parseFloat(form.leverage)||1, position_size_usd: form.position_size_usd ? parseFloat(form.position_size_usd) : null, fees_usd: parseFloat(form.fees_usd)||0, entry_at: form.entry_at||null, exit_at: form.exit_at||null};
      if (editId) await api.put(`/api/v1/journal/${editId}`, p); else await api.post('/api/v1/journal/', p);
      resetForm(); setActiveTab('history'); fetchEntries();
    } catch (e) { alert('Failed: '+(e.response?.data?.detail||e.message)); } finally { setSaving(false); }
  };

  const handleEdit = (e) => { setForm({ signal_id: e.signal_id, pair: e.pair, direction: e.direction, planned_entry: e.planned_entry||'', planned_tp1: e.planned_tp1||'', planned_tp2: e.planned_tp2||'', planned_tp3: e.planned_tp3||'', planned_tp4: e.planned_tp4||'', planned_sl: e.planned_sl||'', actual_entry: e.actual_entry||'', actual_exit: e.actual_exit||'', leverage: e.leverage||1, position_size_usd: e.position_size_usd||'', fees_usd: e.fees_usd||0, emotions: e.emotions||{confidence:5,fomo_level:0,mood:'',regret:0}, strategy_tags: e.strategy_tags||[], confluence_tags: e.confluence_tags||[], mistakes: e.mistakes||[], notes: e.notes||'', chart_before_url: e.chart_before_url||'', chart_after_url: e.chart_after_url||'', tradingview_link: e.tradingview_link||'', entry_at: e.entry_at||'', exit_at: e.exit_at||'' }); setEditId(e.id); setActiveTab('entry'); };
  const handleDelete = async (id) => { if (!confirm('Delete this journal entry?')) return; try { await api.delete(`/api/v1/journal/${id}`); fetchEntries(); } catch {} };
  const handleExport = async () => { try { const p = new URLSearchParams(); if (filterPair) p.append('pair', filterPair.toUpperCase()); if (filterStatus !== 'all') p.append('status', filterStatus); const r = await api.get(`/api/v1/journal/export/excel?${p}`, {responseType:'blob'}); const u = window.URL.createObjectURL(new Blob([r.data])); const a = document.createElement('a'); a.href=u; a.download=`LuxQuant_Journal_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); window.URL.revokeObjectURL(u); } catch(e) { alert('Export failed'); } };

  const handleSort = (col) => { if (sortBy === col) setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); else { setSortBy(col); setSortOrder('desc'); } };

  const previewPnl = useMemo(() => { const en=parseFloat(form.actual_entry),ex=parseFloat(form.actual_exit),sz=parseFloat(form.position_size_usd),lv=parseFloat(form.leverage)||1,fe=parseFloat(form.fees_usd)||0; if (!en||!ex||!sz) return null; const raw=form.direction==='short'?(en-ex)/en*sz*lv:(ex-en)/en*sz*lv; const pnl=raw-fe; return {pnl:pnl.toFixed(2),pct:((pnl/sz)*100).toFixed(2)}; }, [form.actual_entry,form.actual_exit,form.position_size_usd,form.leverage,form.fees_usd,form.direction]);

  const isLinked = !!form.signal_id;
  const ic = (auto) => `w-full px-3 py-2.5 rounded-lg text-sm border font-mono outline-none focus:border-gold-primary/30 ${auto&&isLinked?'bg-gold-primary/5 border-gold-primary/20 text-gold-light':'bg-bg-primary/70 border-gold-primary/10 text-white'}`;
  const ics = (auto) => `w-full px-2 py-2 rounded-lg text-xs border font-mono outline-none focus:border-gold-primary/30 ${auto&&isLinked?'bg-gold-primary/5 border-gold-primary/20 text-gold-light':'bg-bg-primary/70 border-gold-primary/10 text-white'}`;

  // Sorted entries for table
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case 'pair': return sortOrder === 'asc' ? (a.pair||'').localeCompare(b.pair||'') : (b.pair||'').localeCompare(a.pair||'');
        case 'pnl_usd': va = a.pnl_usd||0; vb = b.pnl_usd||0; break;
        case 'pnl_pct': va = a.pnl_pct||0; vb = b.pnl_pct||0; break;
        case 'leverage': va = a.leverage||0; vb = b.leverage||0; break;
        default: va = new Date(a.entry_at||0).getTime(); vb = new Date(b.entry_at||0).getTime(); break;
      }
      return sortOrder === 'asc' ? va - vb : vb - va;
    });
  }, [entries, sortBy, sortOrder]);

  const SortHeader = ({ col, children, className = '' }) => (
    <th onClick={() => handleSort(col)} className={`py-3 px-3 text-left cursor-pointer hover:text-gold-primary transition-colors select-none ${className}`}>
      <div className="flex items-center gap-1">{children}{sortBy === col && <span className="text-gold-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
    </th>
  );

  const tabs = [{key:'history',label:'History',icon:'📋'},{key:'entry',label:editId?'Edit Entry':'New Entry',icon:'✏️'},{key:'analytics',label:'Analytics',icon:'📊'}];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="font-display text-xl sm:text-2xl font-semibold text-gold-light">Trade Journal</h2><p className="text-xs text-text-muted mt-1">Track, analyze, and improve your trading edge</p></div>
        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/10 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export Excel
        </button>
      </div>

      <div className="flex gap-1 p-1 mb-5 bg-bg-card/50 border border-gold-primary/10 rounded-xl">
        {tabs.map(t => <button key={t.key} onClick={() => { if (t.key==='entry'&&!editId) resetForm(); setActiveTab(t.key); }} className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${activeTab===t.key?'bg-gold-primary/15 text-gold-primary border border-gold-primary/25':'text-text-muted hover:text-text-secondary'}`}><span className="mr-1">{t.icon}</span>{t.label}</button>)}
      </div>

      {/* ═══════ HISTORY ═══════ */}
      {activeTab === 'history' && (
        <div>
          {/* Recap Stats */}
          {entries.length > 0 && <RecapBar entries={entries} />}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input type="text" placeholder="Search pair..." value={filterPair} onChange={e=>setFilterPair(e.target.value)} className="px-3 py-2 rounded-lg text-xs bg-bg-secondary/50 border border-gold-primary/10 text-white placeholder-text-muted focus:border-gold-primary/30 outline-none w-28" />
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg text-xs bg-bg-secondary/50 border border-gold-primary/10 text-white outline-none">
              <option value="all">All Status</option><option value="open">Open</option><option value="closed_win">Won</option><option value="closed_loss">Lost</option><option value="breakeven">Breakeven</option>
            </select>
            <select value={filterStrategy} onChange={e=>setFilterStrategy(e.target.value)} className="px-3 py-2 rounded-lg text-xs bg-bg-secondary/50 border border-gold-primary/10 text-white outline-none">
              <option value="all">All Strategy</option>{STRATEGY_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => { setActiveTab('entry'); resetForm(); }} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>New Entry
            </button>
          </div>

          {loading ? <div className="text-center py-12 text-text-muted text-sm">Loading journal...</div> : entries.length === 0 ? (
            <div className="text-center py-16"><p className="text-text-muted text-sm mb-3">No journal entries yet</p><button onClick={()=>{setActiveTab('entry');resetForm();}} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary">Create your first entry</button></div>
          ) : (
            <div className="grid lg:grid-cols-4 gap-4">
              {/* Table — 3 cols */}
              <div className="lg:col-span-3">
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gold-primary/10 text-text-muted text-[10px] uppercase tracking-wider">
                        <SortHeader col="entry_at">Date</SortHeader>
                        <SortHeader col="pair">Pair</SortHeader>
                        <th className="py-3 px-3 text-left">Dir</th>
                        <th className="py-3 px-3 text-right">Entry</th>
                        <th className="py-3 px-3 text-right">Exit</th>
                        <th className="py-3 px-3 text-right">Lev</th>
                        <SortHeader col="pnl_usd" className="text-right">PnL $</SortHeader>
                        <SortHeader col="pnl_pct" className="text-right">PnL %</SortHeader>
                        <th className="py-3 px-3 text-center">Mood</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3 w-8"></th>
                      </tr></thead>
                      <tbody>
                        {sortedEntries.map(e => {
                          const pnlColor = e.pnl_usd > 0 ? 'text-positive' : e.pnl_usd < 0 ? 'text-negative' : 'text-text-muted';
                          const rowBg = e.pnl_usd > 0 ? 'hover:bg-positive/[0.03]' : e.pnl_usd < 0 ? 'hover:bg-negative/[0.03]' : 'hover:bg-white/[0.02]';
                          const stColor = e.status === 'open' ? 'text-cyan-400 bg-cyan-500/10' : e.status === 'closed_win' ? 'text-positive bg-positive/10' : e.status === 'closed_loss' ? 'text-negative bg-negative/10' : 'text-warning bg-warning/10';
                          return (
                            <tr key={e.id} onClick={() => handleEdit(e)} className={`border-b border-white/[0.03] cursor-pointer transition-all ${rowBg} group`}>
                              <td className="py-3 px-3 text-text-muted whitespace-nowrap">{fmtDate(e.entry_at)}</td>
                              <td className="py-3 px-3"><div className="flex items-center gap-2"><CoinLogo pair={e.pair} size={22} /><div><span className="font-semibold text-white">{e.pair?.replace('USDT','')}</span>{e.signal_id && <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-gold-primary/10 text-gold-primary">SIG</span>}</div></div></td>
                              <td className="py-3 px-3"><span className={`text-[10px] font-bold ${e.direction==='long'?'text-positive':'text-negative'}`}>{e.direction?.toUpperCase()}</span></td>
                              <td className="py-3 px-3 text-right font-mono text-text-secondary">{fmtPrice(e.actual_entry)}</td>
                              <td className="py-3 px-3 text-right font-mono text-text-secondary">{e.actual_exit ? fmtPrice(e.actual_exit) : <span className="text-text-muted/40">-</span>}</td>
                              <td className="py-3 px-3 text-right font-mono text-text-secondary">{e.leverage}x</td>
                              <td className={`py-3 px-3 text-right font-mono font-bold ${pnlColor}`}>{e.pnl_usd !== null ? `${e.pnl_usd >= 0?'+':''}$${e.pnl_usd.toFixed(2)}` : '-'}</td>
                              <td className={`py-3 px-3 text-right font-mono ${pnlColor}`}>{e.pnl_pct !== null ? `${e.pnl_pct >= 0?'+':''}${e.pnl_pct.toFixed(1)}%` : '-'}</td>
                              <td className="py-3 px-3 text-center">{e.emotions?.mood ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${['Calm','Focused'].includes(e.emotions.mood)?'bg-positive/10 text-positive':'bg-negative/10 text-negative'}`}>{e.emotions.mood}</span> : <span className="text-text-muted/30">-</span>}</td>
                              <td className="py-3 px-3 text-center"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${stColor}`}>{e.status?.replace('_',' ').toUpperCase()}</span></td>
                              <td className="py-3 px-1"><button onClick={ev=>{ev.stopPropagation();handleDelete(e.id);}} className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-negative transition-all"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-gold-primary/10 text-[10px] text-text-muted flex justify-between">
                    <span>{entries.length} entries</span><span>Click row to edit</span>
                  </div>
                </div>
              </div>
              {/* Calendar — 1 col */}
              <div className="lg:col-span-1"><PnLCalendar entries={entries} /></div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ ENTRY ═══════ */}
      {activeTab === 'entry' && (
        <div>
          <div className="mb-5"><SignalPicker selectedSignalId={form.signal_id} onSelect={handleSignalSelect} onClear={handleSignalClear} /></div>
          {isLinked && <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-positive/5 border border-positive/15"><svg className="w-4 h-4 text-positive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span className="text-xs text-positive font-medium">Signal linked — planned fields auto-filled. Just enter your actual execution.</span></div>}
          <div className="grid lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-4">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Execution Details</h3>
                <div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Pair * {isLinked&&<AutoBadge/>}</label><input value={form.pair} onChange={e=>setForm(f=>({...f,pair:e.target.value.toUpperCase()}))} placeholder="BTCUSDT" className={ic(true)} /></div><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Direction</label><div className="flex gap-2">{['long','short'].map(d=><button key={d} type="button" onClick={()=>setForm(f=>({...f,direction:d}))} className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border transition-all ${form.direction===d?(d==='long'?'bg-positive/10 border-positive/30 text-positive':'bg-negative/10 border-negative/30 text-negative'):'border-gold-primary/10 text-text-muted'}`}>{d.toUpperCase()}</button>)}</div></div></div>
                <div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Planned Entry {isLinked&&<AutoBadge/>}</label><input type="number" step="any" value={form.planned_entry} onChange={e=>setForm(f=>({...f,planned_entry:e.target.value}))} className={ic(true)} /></div><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Actual Entry *</label><input type="number" step="any" value={form.actual_entry} onChange={e=>setForm(f=>({...f,actual_entry:e.target.value}))} className={ic(false)} /></div></div>
                <div className="grid grid-cols-4 gap-2 mb-3">{['planned_tp1','planned_tp2','planned_tp3','planned_tp4'].map((k,i)=><div key={k}><label className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">TP{i+1} {isLinked&&<AutoBadge/>}</label><input type="number" step="any" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className={ics(true)} /></div>)}</div>
                <div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Stop Loss {isLinked&&<AutoBadge/>}</label><input type="number" step="any" value={form.planned_sl} onChange={e=>setForm(f=>({...f,planned_sl:e.target.value}))} className={ic(true)} /></div><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Actual Exit</label><input type="number" step="any" value={form.actual_exit} onChange={e=>setForm(f=>({...f,actual_exit:e.target.value}))} className={ic(false)} /></div></div>
                <div className="grid grid-cols-3 gap-3 mb-4"><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Leverage</label><input type="number" value={form.leverage} onChange={e=>setForm(f=>({...f,leverage:e.target.value}))} className={ic(false)+' text-center'} /></div><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Size (USD)</label><input type="number" value={form.position_size_usd} onChange={e=>setForm(f=>({...f,position_size_usd:e.target.value}))} className={ic(false)+' text-center'} /></div><div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Fees (USD)</label><input type="number" value={form.fees_usd} onChange={e=>setForm(f=>({...f,fees_usd:e.target.value}))} className={ic(false)+' text-center'} /></div></div>
                {previewPnl && <div className={`p-4 rounded-xl border text-center ${parseFloat(previewPnl.pnl)>=0?'border-positive/20 bg-positive/5':'border-negative/20 bg-negative/5'}`}><p className="text-[10px] text-text-muted mb-1">ESTIMATED P&L</p><p className={`font-mono text-2xl font-bold ${parseFloat(previewPnl.pnl)>=0?'text-positive':'text-negative'}`}>{parseFloat(previewPnl.pnl)>=0?'+':''}${previewPnl.pnl}<span className="text-sm ml-2 opacity-70">({parseFloat(previewPnl.pct)>=0?'+':''}{previewPnl.pct}%)</span></p></div>}
              </div>
              <div className="glass-card p-5"><h3 className="text-sm font-semibold text-white mb-3">Notes & Proof</h3><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="What did you learn?" className="w-full px-3 py-2.5 rounded-lg text-sm bg-bg-primary/70 border border-gold-primary/10 text-white placeholder-text-muted outline-none focus:border-gold-primary/30 resize-y" /><input value={form.tradingview_link} onChange={e=>setForm(f=>({...f,tradingview_link:e.target.value}))} placeholder="TradingView link (optional)" className="w-full px-3 py-2.5 rounded-lg text-sm bg-bg-primary/70 border border-gold-primary/10 text-white placeholder-text-muted outline-none focus:border-gold-primary/30 mt-2" /></div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-card p-5"><h3 className="text-sm font-semibold text-white mb-4">Psychology & Emotions</h3><Slider label="Confidence" value={form.emotions.confidence} onChange={v=>setForm(f=>({...f,emotions:{...f.emotions,confidence:v}}))} leftLabel="Low" rightLabel="High" /><Slider label="FOMO Level" value={form.emotions.fomo_level} onChange={v=>setForm(f=>({...f,emotions:{...f.emotions,fomo_level:v}}))} leftLabel="None" rightLabel="Max" /><Slider label="Post-Trade Regret" value={form.emotions.regret} onChange={v=>setForm(f=>({...f,emotions:{...f.emotions,regret:v}}))} leftLabel="None" rightLabel="Max" /><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 block">Mood</label><div className="flex flex-wrap gap-1.5">{MOOD_OPTIONS.map(m=><Chip key={m} label={m} selected={form.emotions.mood===m} color={['Calm','Focused','Excited'].includes(m)?'green':'red'} onClick={()=>setForm(f=>({...f,emotions:{...f.emotions,mood:f.emotions.mood===m?'':m}}))} />)}</div></div>
              <div className="glass-card p-5"><h3 className="text-sm font-semibold text-white mb-3">Strategy</h3><div className="flex flex-wrap gap-1.5 mb-4">{STRATEGY_OPTIONS.map(s=><Chip key={s} label={s} selected={form.strategy_tags.includes(s)} color="gold" onClick={()=>toggleTag('strategy_tags',s)} />)}</div><h3 className="text-sm font-semibold text-white mb-3">Confluences</h3><div className="flex flex-wrap gap-1.5 mb-4">{CONFLUENCE_OPTIONS.map(c=><Chip key={c} label={c} selected={form.confluence_tags.includes(c)} color="cyan" onClick={()=>toggleTag('confluence_tags',c)} />)}</div><h3 className="text-sm font-semibold text-white mb-3">Mistakes</h3><div className="flex flex-wrap gap-1.5">{MISTAKE_OPTIONS.map(m=><Chip key={m} label={m} selected={form.mistakes.includes(m)} color="red" onClick={()=>toggleTag('mistakes',m)} />)}</div></div>
              <div className="flex gap-3"><button onClick={handleSubmit} disabled={saving||!form.pair||!form.actual_entry} className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all disabled:opacity-40">{saving?'Saving...':editId?'Update Entry':'Save Entry'}</button>{editId && <button onClick={()=>{resetForm();setActiveTab('history');}} className="px-5 py-3 rounded-xl text-sm font-medium border border-gold-primary/20 text-text-secondary hover:text-white transition-all">Cancel</button>}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ANALYTICS ═══════ */}
      {activeTab === 'analytics' && (
        <div>
          {stats ? (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"><KPICard label="Total P&L" value={`$${stats.total_pnl_usd?.toFixed(2)}`} sub="All closed" color={stats.total_pnl_usd>=0?'text-positive':'text-negative'} /><KPICard label="Win Rate" value={`${stats.win_rate?.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} /><KPICard label="Avg R:R" value={stats.avg_rr?.toFixed(2)} sub="Risk:Reward" color="text-cyan-400" /><KPICard label="Total Trades" value={stats.total_trades} sub={`${stats.open_trades} open`} /></div>
            {stats.win_rate_by_strategy && Object.keys(stats.win_rate_by_strategy).length>0 && <div className="glass-card p-5 mb-5"><h3 className="text-sm font-semibold text-white mb-4">Win Rate by Strategy</h3><div className="space-y-3">{Object.entries(stats.win_rate_by_strategy).sort((a,b)=>b[1].win_rate-a[1].win_rate).map(([s,d])=><div key={s}><div className="flex justify-between text-xs mb-1"><span className="text-text-secondary">{s}</span><span className={`font-mono font-semibold ${d.win_rate>=60?'text-positive':d.win_rate>=40?'text-warning':'text-negative'}`}>{d.win_rate}%</span></div><div className="h-1.5 rounded-full bg-gold-primary/10 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${d.win_rate}%`,background:d.win_rate>=60?'#4ade80':d.win_rate>=40?'#fbbf24':'#f87171'}} /></div></div>)}</div></div>}
            {stats.win_rate_by_emotion && Object.keys(stats.win_rate_by_emotion).length>0 && <div className="glass-card p-5 mb-5"><h3 className="text-sm font-semibold text-white mb-4">Win Rate by Emotion</h3><div className="space-y-3">{Object.entries(stats.win_rate_by_emotion).sort((a,b)=>b[1].win_rate-a[1].win_rate).map(([m,d])=><div key={m}><div className="flex justify-between text-xs mb-1"><span className="text-text-secondary">{m}</span><span className={`font-mono font-semibold ${d.win_rate>=60?'text-positive':d.win_rate>=40?'text-warning':'text-negative'}`}>{d.win_rate}%</span></div><div className="h-1.5 rounded-full bg-gold-primary/10 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${d.win_rate}%`,background:d.win_rate>=60?'#4ade80':d.win_rate>=40?'#fbbf24':'#f87171'}} /></div></div>)}</div></div>}
            {stats.pnl_by_day && Object.keys(stats.pnl_by_day).length>0 && <div className="glass-card p-5 mb-5"><h3 className="text-sm font-semibold text-white mb-4">P&L by Day of Week</h3><div className="grid grid-cols-7 gap-2">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>{const v=stats.pnl_by_day[day]||0;return <div key={day} className="text-center"><p className="text-[10px] text-text-muted mb-1">{day}</p><div className={`py-2 rounded-lg text-xs font-mono font-semibold ${v>0?'bg-positive/10 text-positive':v<0?'bg-negative/10 text-negative':'bg-white/5 text-text-muted'}`}>{v>0?'+':''}{v!==0?`$${v.toFixed(0)}`:'--'}</div></div>;})}</div></div>}
            {insights?.insights?.length>0 && <div className="glass-card p-5 mb-5"><div className="flex items-center gap-2 mb-4"><span className="text-sm">🤖</span><h3 className="text-sm font-semibold text-white">AI Coach Insights</h3>{insights.source==='gemini'&&<span className="text-[9px] px-2 py-0.5 rounded-full bg-gold-primary/10 text-gold-primary border border-gold-primary/15">Gemini</span>}</div><div className="space-y-3">{insights.insights.map((t,i)=><div key={i} className="flex gap-3 p-3 rounded-xl bg-gold-primary/4 border border-gold-primary/8"><span className="text-gold-primary text-sm mt-0.5">💡</span><p className="text-sm text-text-secondary leading-relaxed">{t}</p></div>)}</div></div>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><KPICard label="Best Trade" value={`$${stats.best_trade_pnl?.toFixed(0)}`} sub={stats.best_trade_pair} color="text-positive" /><KPICard label="Worst Trade" value={`$${stats.worst_trade_pnl?.toFixed(0)}`} sub={stats.worst_trade_pair} color="text-negative" /><KPICard label="Win Streak" value={stats.longest_win_streak} sub="Consecutive" color="text-positive" /><KPICard label="Loss Streak" value={stats.longest_loss_streak} sub="Consecutive" color="text-negative" /></div>
          </>) : <div className="text-center py-16"><p className="text-text-muted text-sm mb-2">No analytics data yet</p><p className="text-text-muted/60 text-xs">Add closed trades with exit prices to see stats</p></div>}
        </div>
      )}
    </div>
  );
};

export default JournalPage;