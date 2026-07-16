// src/components/MacroCalendarPage.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import calendarApi from '../services/calendarApi';
import AssistantWidget from './assistant/AssistantWidget';

/* ──────────────────────────────────────────────────────────────
   MacroCalendarPage — Web3 Flowscan-minimal reskin
   • Gold accent retained (LuxQuant brand)
   • profit / loss / amber muted functional only
   • Flat hairline cards, sharp rounded-md, font-mono font-light numbers
   • Country flags RETAINED (cultural/sentimental)
   • Type icons → SVG Lucide-style
   • Line-label-line section headers
   ────────────────────────────────────────────────────────────── */

// ── Constants ──
const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CAD: '🇨🇦',
  AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭', CNY: '🇨🇳', ALL: '🌐',
};

const TABS = [
  { key: 'all', label: 'All Events', labelZh: '全部事件' },
  { key: 'macro', label: 'Macro', labelZh: '宏观经济' },
  { key: 'unlock', label: 'Token Unlocks', labelZh: '代币解锁' },
  { key: 'crypto_event', label: 'Crypto Events', labelZh: '加密事件' },
];

const IMPACTS = ['All', 'High', 'Medium', 'Low', 'Holiday'];

// Muted Flowscan palette — replaces all rainbow rgba constants
const IMPACT_STYLE = {
  High:    { color: 'rgb(var(--neg))', bg: 'rgba(224,114,136,0.08)', border: 'rgba(224,114,136,0.25)', dot: '#e07288' },
  Medium:  { color: 'rgb(var(--accent))', bg: 'rgba(240,180,80,0.08)',  border: 'rgba(240,180,80,0.25)',  dot: '#f0b450' },
  Low:     { color: 'rgb(var(--fg-muted))', bg: 'rgba(154,138,125,0.06)', border: 'rgba(255,255,255,0.06)', dot: '#9a8a7d' },
  Holiday: { color: 'rgb(var(--accent))', bg: 'rgba(212,168,83,0.06)',  border: 'rgba(212,168,83,0.20)',  dot: '#d4a853' },
};

// Type styles — all gold-tier (no rainbow), differentiated by opacity & label
const TYPE_STYLE = {
  macro:        { color: 'rgb(var(--accent))', bg: 'rgba(212,168,83,0.08)',  border: 'rgba(212,168,83,0.20)', label: 'Macro',  labelZh: '宏观' },
  unlock:       { color: 'rgb(var(--pos))', bg: 'rgba(86,201,150,0.06)',  border: 'rgba(86,201,150,0.20)', label: 'Unlock', labelZh: '解锁' },
  crypto_event: { color: 'rgb(var(--accent-light))', bg: 'rgba(240,216,144,0.06)', border: 'rgba(240,216,144,0.20)', label: 'Event',  labelZh: '事件' },
};

// Source badges — unified gold (no brand-rainbow)
const SOURCE_STYLE = {
  CoinTelegraph: { color: 'rgb(var(--accent))', bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.20)' },
  CoinDesk:      { color: 'rgb(var(--accent))', bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.20)' },
  Decrypt:       { color: 'rgb(var(--accent))', bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.20)' },
};

// ── Event Translations (EN → ZH) ──
const EVENT_ZH = {
  "Unemployment Claims": "初请失业金人数",
  "Core PCE Price Index m/m": "核心PCE物价指数 (月率)",
  "Core PCE Price Index y/y": "核心PCE物价指数 (年率)",
  "CPI m/m": "消费者物价指数/CPI (月率)",
  "CPI y/y": "消费者物价指数/CPI (年率)",
  "Core CPI m/m": "核心CPI (月率)", "Core CPI y/y": "核心CPI (年率)",
  "Federal Funds Rate": "美联储联邦基金利率",
  "Non-Farm Employment Change": "非农就业人数 (NFP)",
  "Unemployment Rate": "失业率",
  "ISM Services PMI": "ISM非制造业PMI", "ISM Manufacturing PMI": "ISM制造业PMI",
  "Retail Sales m/m": "零售销售 (月率)", "Core Retail Sales m/m": "核心零售销售 (月率)",
  "Advance GDP q/q": "美国GDP提前数据 (季率)",
  "Prelim GDP q/q": "美国GDP修正值 (季率)", "Final GDP q/q": "美国GDP终值 (季率)",
  "FOMC Statement": "美联储货币政策声明", "FOMC Press Conference": "美联储新闻发布会",
  "JOLTS Job Openings": "JOLTs职位空缺",
  "CB Consumer Confidence": "美国谘商会消费者信心指数",
  "Building Permits": "营建许可", "Crude Oil Inventories": "EIA原油库存",
  "Flash Manufacturing PMI": "制造业PMI初值", "Flash Services PMI": "服务业PMI初值",
  "Bank Holiday": "银行假日", "Monetary Policy Report": "货币政策报告",
  "Trade Balance": "贸易帐", "Existing Home Sales": "成屋销售",
  "New Home Sales": "新屋销售", "Pending Home Sales": "成屋签约销售",
  "Durable Goods Orders": "耐用品订单", "Core Durable Goods": "核心耐用品订单",
  "Producer Price Index": "生产者物价指数 (PPI)", "Core PPI": "核心PPI",
  "Industrial Production": "工业产出", "Employment Cost Index": "就业成本指数",
};

// ── Helpers ──
const fmtUsd = (v) => {
  if (!v || v <= 0) return null;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

// ══════════════════════════════════════
// Main Component
// ══════════════════════════════════════
const MacroCalendarPage = () => {
  const { t, i18n } = useTranslation();
  const [allEvents, setAllEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedImpact, setSelectedImpact] = useState('All');
  const [now, setNow] = useState(new Date());
  const [expandedDays, setExpandedDays] = useState({});
  const [allStats, setAllStats] = useState(null);

  const isZh = useMemo(() => {
    const lang = i18n.resolvedLanguage || i18n.language || 'en';
    return lang.toLowerCase().startsWith('zh');
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await calendarApi.getUnified();
      setAllEvents(data.events || []);
      setAllStats(data.stats || null);
    } catch (err) {
      console.error('Calendar fetch failed:', err);
      setError(t('calendar.load_error'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    (async () => {
      setNewsLoading(true);
      try {
        const data = await calendarApi.getNews(15);
        setNews(data.articles || []);
      } catch (err) { console.error('News fetch failed:', err); }
      finally { setNewsLoading(false); }
    })();
  }, []);

  const events = useMemo(() => {
    let result = allEvents;
    if (activeTab !== 'all') result = result.filter(e => e.type === activeTab);
    return result;
  }, [allEvents, activeTab]);

  const stats = useMemo(() => {
    if (!allStats) return null;
    if (activeTab === 'all') return allStats;
    return {
      ...allStats,
      total: events.length,
      high_impact: events.filter(e => e.impact === 'High').length,
      upcoming: events.filter(e => !e.is_past).length,
    };
  }, [allStats, events, activeTab]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (selectedImpact !== 'All') result = result.filter(e => e.impact === selectedImpact);
    return result;
  }, [events, selectedImpact]);

  const groupedByDate = useMemo(() => {
    const groups = [];
    const map = {};
    const locale = isZh ? 'zh-CN' : 'en-US';
    const todayKey = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

    filteredEvents.forEach(event => {
      try {
        const dt = new Date(event.date);
        const dateOnly = dt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
        const weekday = dt.toLocaleDateString(locale, { weekday: 'short' });
        if (!map[dateOnly]) {
          map[dateOnly] = { weekday, dateLabel: dateOnly, isToday: dateOnly === todayKey, events: [], sortKey: dt.getTime() };
          groups.push(map[dateOnly]);
        }
        map[dateOnly].events.push(event);
      } catch {
        if (!map['Unknown']) {
          map['Unknown'] = { weekday: '', dateLabel: 'Unknown', isToday: false, events: [], sortKey: 0 };
          groups.push(map['Unknown']);
        }
        map['Unknown'].events.push(event);
      }
    });

    groups.forEach(g => { g.allPast = g.events.every(e => e.is_past); });
    groups.sort((a, b) => a.sortKey - b.sortKey);
    return groups;
  }, [filteredEvents, isZh]);

  useEffect(() => {
    const expanded = {};
    groupedByDate.forEach(g => {
      expanded[g.dateLabel] = g.isToday || !g.allPast;
    });
    setExpandedDays(expanded);
  }, [groupedByDate]);

  const toggleDay = (dateLabel) => {
    setExpandedDays(prev => ({ ...prev, [dateLabel]: !prev[dateLabel] }));
  };

  const nextHighImpact = useMemo(() =>
    events.filter(e => e.impact === 'High' && !e.is_past)
      .sort((a, b) => a.seconds_until - b.seconds_until)[0] || null
  , [events]);

  const getTitle = (event) => {
    const title = event.title || '';
    if (!isZh) return title;
    if (event.type === 'macro') {
      for (const [en, zh] of Object.entries(EVENT_ZH)) {
        if (title.includes(en)) return title.replace(en, zh);
      }
    }
    return title;
  };

  const fmtTime = (dateStr) => {
    try { return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); }
    catch { return '--:--'; }
  };

  const fmtCountdown = (seconds) => {
    if (!seconds || seconds <= 0) return t('calendar.now');
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}${t('calendar.d')} ${h}${t('calendar.h')} ${m}${t('calendar.m')}`;
    if (h > 0) return `${h}${t('calendar.h')} ${m}${t('calendar.m')} ${s}${t('calendar.s')}`;
    return `${m}${t('calendar.m')} ${s}${t('calendar.s')}`;
  };

  const cdColor = (sec) => {
    if (!sec || sec <= 0) return '#6b5c52';
    if (sec < 3600) return '#e07288';
    if (sec < 86400) return '#f0b450';
    return '#9a8a7d';
  };

  // ══════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ── PAGE TITLE — line-label-line ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          {t('calendar.title')}
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/70">
          Economic Events
        </span>
      </div>

      {/* ── Subtitle + Refresh ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
          {t('calendar.subtitle')}
        </p>
        <button
          onClick={loadEvents}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-text-muted hover:text-text-primary font-mono text-[10px] uppercase tracking-wider transition-colors"
        >
          <IconRefresh />
          {t('calendar.refresh')}
        </button>
      </div>

      {/* ── TYPE TABS — Flowscan filter pill ── */}
      <div className="flex items-center gap-1 p-1 rounded-sm bg-surface-raised border border-white/[0.06] overflow-x-auto">
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const Icon = TAB_ICONS[tab.key];
          const countNum = allStats && tab.key !== 'all'
            ? (tab.key === 'macro' ? allStats.macro : tab.key === 'unlock' ? allStats.unlocks : allStats.crypto_events)
            : null;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors whitespace-nowrap ${
                active
                  ? "bg-white/10 text-text-primary border border-white/[0.08]"
                  : "text-text-muted hover:text-text-primary border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <Icon active={active} />
              {isZh ? tab.labelZh : tab.label}
              {countNum != null && (
                <span className={`font-mono text-[9px] tabular-nums px-1.5 py-0.5 rounded-sm border ${
                  active ? 'bg-gold-primary/10 text-gold-primary border-line/25' : 'bg-white/[0.04] text-text-muted/70 border-white/[0.04]'
                }`}>
                  {countNum}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── STATS ROW ── */}
      {!loading && !error && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <CalendarStat label={isZh ? '总计' : 'Total'} value={stats.total} icon="total" />
            <CalendarStat label={isZh ? '高影响' : 'High Impact'} value={stats.high_impact} icon="high" color="loss" />
            <CalendarStat label={isZh ? '代币解锁' : 'Unlocks'} value={stats.unlocks} icon="unlock" color="profit" />
            <CalendarStat label={isZh ? '即将' : 'Upcoming'} value={stats.upcoming} icon="upcoming" color="gold" />
          </div>

          {nextHighImpact && (
            <div className="lg:col-span-2 relative bg-surface-raised rounded-md border border-loss/25 p-3 overflow-hidden flex items-center gap-3">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-loss/40 to-transparent" />
              <div className="w-8 h-8 rounded-sm flex items-center justify-center bg-loss/10 border border-loss/25 flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-loss" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 2L2 22h20L12 2z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] uppercase tracking-wider text-loss/80 mb-0.5">
                  {isZh ? '下个高影响' : 'Next High Impact'}
                </p>
                <p className="text-text-primary text-[12px] truncate">{getTitle(nextHighImpact)}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                  {nextHighImpact.type === 'macro' ? FLAG[nextHighImpact.country] : ''}{' '}
                  <span className="tabular-nums">{nextHighImpact.symbol || nextHighImpact.country} · {fmtTime(nextHighImpact.date)}</span>
                </p>
              </div>
              <p className="font-mono text-sm font-light text-loss tabular-nums shrink-0">
                {fmtCountdown(nextHighImpact.seconds_until)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── IMPACT FILTERS ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80">
          {t('calendar.impact')}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {IMPACTS.map(impact => {
            const active = selectedImpact === impact;
            const cfg = IMPACT_STYLE[impact];
            return (
              <button
                key={impact}
                onClick={() => setSelectedImpact(impact)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-white/10 text-text-primary border border-white/[0.08]"
                    : "bg-white/[0.03] text-text-muted hover:text-text-primary hover:bg-white/[0.06] border border-white/[0.04]"
                }`}
              >
                {cfg && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: cfg.dot }}
                  />
                )}
                {impact === 'All' ? (isZh ? '全部' : 'All') : impact}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT: Calendar + News ── */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Calendar Section ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <CalendarSkeleton />
          ) : error ? (
            <div className="bg-surface-raised rounded-md border border-loss/25 p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-loss/40 to-transparent" />
              <div className="w-10 h-10 mx-auto mb-3 rounded-md bg-loss/10 border border-loss/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-loss" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-loss mb-3">{error}</p>
              <button
                onClick={loadEvents}
                className="px-4 py-2 rounded-sm bg-gold-primary/10 text-gold-primary border border-line/25 hover:bg-gold-primary/15 font-mono text-[11px] uppercase tracking-wider transition-colors"
              >
                {t('calendar.try_again')}
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="bg-surface-raised rounded-md border border-white/[0.06] p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
              <div className="w-10 h-10 mx-auto mb-3 rounded-md bg-surface-secondary border border-white/[0.06] flex items-center justify-center">
                <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                {t('calendar.no_events')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {groupedByDate.map((group) => (
                <DaySection
                  key={group.dateLabel}
                  group={group}
                  t={t}
                  isZh={isZh}
                  getTitle={getTitle}
                  fmtTime={fmtTime}
                  fmtCountdown={fmtCountdown}
                  cdColor={cdColor}
                  expanded={!!expandedDays[group.dateLabel]}
                  onToggle={() => toggleDay(group.dateLabel)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── News Sidebar ── */}
        <div className="lg:w-[340px] xl:w-[380px] shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-6 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
              {isZh ? '宏观与加密新闻' : 'Macro & Crypto News'}
            </span>
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-profit" />
              </span>
              LIVE
            </span>
          </div>

          {newsLoading ? (
            <NewsSkeleton />
          ) : news.length === 0 ? (
            <div className="bg-surface-raised rounded-md border border-white/[0.06] p-6 text-center">
              <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                {isZh ? '暂无新闻' : 'No news available'}
              </p>
            </div>
          ) : (
            <div
              className="space-y-2 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:pr-1 scrollbar-thin"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,168,83,0.15) transparent' }}
            >
              {news.map((article, i) => (
                <NewsItem key={i} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center pt-2 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/40">
          {t('calendar.footer_info')}
        </p>
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar{width:4px}
        .scrollbar-thin::-webkit-scrollbar-track{background:transparent}
        .scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(212,168,83,0.15);border-radius:2px}
        .scrollbar-thin::-webkit-scrollbar-thumb:hover{background:rgba(212,168,83,0.3)}
      `}</style>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="calendar" />
    </div>
  );
};


// ══════════════════════════════════════
// Day Section (Collapsible)
// ══════════════════════════════════════
const DaySection = ({ group, t, isZh, getTitle, fmtTime, fmtCountdown, cdColor, expanded, onToggle }) => {
  const { weekday, dateLabel, isToday, events, allPast } = group;
  const highCount = events.filter(e => e.impact === 'High').length;
  const unlockCount = events.filter(e => e.type === 'unlock').length;
  const cryptoCount = events.filter(e => e.type === 'crypto_event').length;

  return (
    <div className={`bg-surface-raised rounded-md overflow-hidden border relative ${
      isToday ? 'border-line/30' : 'border-white/[0.06]'
    }`}>
      {isToday && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />
      )}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-white/[0.02]"
      >
        <svg
          className={`w-3 h-3 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        {isToday && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary border border-line/25">
            Today
          </span>
        )}
        <span className="text-text-primary text-[12px] whitespace-nowrap">
          {weekday && (
            <span className={`font-mono uppercase tracking-wider mr-1.5 ${isToday ? 'text-gold-primary' : 'text-text-muted/70'}`}>
              {weekday},
            </span>
          )}
          <span className="text-text-primary">{dateLabel}</span>
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 shrink-0">
          {highCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm bg-loss/10 text-loss border border-loss/20">
              {highCount}
              <span className="w-1 h-1 rounded-full bg-loss" />
            </span>
          )}
          {unlockCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm bg-profit/10 text-profit border border-profit/20">
              {unlockCount}
              <IconUnlockMini />
            </span>
          )}
          {cryptoCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary border border-line/20">
              {cryptoCount}
              <IconBoltMini />
            </span>
          )}
          <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-text-muted/80 border border-white/[0.04]">
            {events.length}
          </span>
        </div>
      </button>

      {expanded && (
        <div>
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[64px_28px_1fr_90px_100px] gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/60 border-t border-white/[0.04] bg-surface-secondary">
            <span>{t('calendar.th_time')}</span>
            <span></span>
            <span>{t('calendar.th_event')}</span>
            <span className="text-right">{isZh ? '详情' : 'Details'}</span>
            <span className="text-right">{t('calendar.th_status')}</span>
          </div>

          {events.map((event, i) => (
            <EventRow
              key={`${event.title}-${event.date}-${i}`}
              event={event}
              index={i}
              isZh={isZh}
              t={t}
              getTitle={getTitle}
              fmtTime={fmtTime}
              fmtCountdown={fmtCountdown}
              cdColor={cdColor}
            />
          ))}
        </div>
      )}
    </div>
  );
};


// ══════════════════════════════════════
// Event Row
// ══════════════════════════════════════
const EventRow = ({ event, isZh, t, getTitle, fmtTime, fmtCountdown, cdColor }) => {
  const impactCfg = IMPACT_STYLE[event.impact] || IMPACT_STYLE.Low;
  const typeCfg = TYPE_STYLE[event.type] || TYPE_STYLE.macro;
  const isPast = event.is_past;

  const detailContent = () => {
    if (event.type === 'unlock') {
      return (
        <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
          {event.usd_value ? (
            <span className="text-[11px] text-profit">
              {fmtUsd(event.usd_value)}
            </span>
          ) : null}
          {event.pct_circulating ? (
            <span className="text-[9px] uppercase tracking-wider text-text-muted/70">
              {event.pct_circulating}% circ.
            </span>
          ) : null}
        </div>
      );
    }
    if (event.type === 'macro') {
      return (
        <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
          {event.forecast && (
            <span className="text-[10px] text-gold-primary">{event.forecast}</span>
          )}
          {event.previous && (
            <span className="text-[9px] uppercase tracking-wider text-text-muted/70">
              P: {event.previous}
            </span>
          )}
        </div>
      );
    }
    if (event.type === 'crypto_event' && event.category) {
      return (
        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/[0.08] text-gold-primary/80 border border-line/20">
          {event.category}
        </span>
      );
    }
    return null;
  };

  // Event icon — flags retained, type icons → SVG
  const eventIcon = () => {
    if (event.type === 'macro') return FLAG[event.country] || '🌐';
    return null;
  };
  const TypeIcon = () => {
    if (event.type === 'unlock') return <IconUnlockMini className="text-profit" />;
    if (event.type === 'crypto_event') return <IconBoltMini className="text-gold-primary" />;
    return null;
  };

  return (
    <div
      className={`relative transition-colors duration-150 border-t border-white/[0.03] ${
        isPast ? 'opacity-30' : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* Left bar — color by type */}
      {!isPast && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ background: typeCfg.color, opacity: 0.5 }}
        />
      )}

      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-[64px_28px_1fr_90px_100px] gap-2 items-center px-4 pl-5 py-2.5">
        <span className={`font-mono text-[11px] tabular-nums ${isPast ? 'text-text-muted/30' : 'text-text-muted/80'}`}>
          {fmtTime(event.date)}
        </span>
        <span className="text-base flex items-center justify-center">
          {event.type === 'macro' ? (
            <span>{eventIcon()}</span>
          ) : (
            <TypeIcon />
          )}
        </span>
        <div className="min-w-0 flex items-center gap-2">
          {/* Type badge */}
          <span
            className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border shrink-0"
            style={{ background: typeCfg.bg, color: typeCfg.color, borderColor: typeCfg.border }}
          >
            {isZh ? typeCfg.labelZh : typeCfg.label}
          </span>
          {/* Impact dot */}
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: impactCfg.dot }}
          />
          {/* Title */}
          <p className={`text-[12px] truncate ${isPast ? 'text-text-muted/40' : 'text-text-primary'}`}>
            {getTitle(event)}
          </p>
          {/* Symbol */}
          {event.type !== 'macro' && event.symbol && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-text-muted/80 border border-white/[0.04] shrink-0">
              {event.symbol}
            </span>
          )}
        </div>
        <div className="flex justify-end">{detailContent()}</div>
        <span className="font-mono text-[11px] text-right tabular-nums">
          {isPast
            ? <span className="uppercase tracking-wider text-[10px] text-text-muted/40">{t('calendar.status_done')}</span>
            : <span style={{ color: cdColor(event.seconds_until) }}>{fmtCountdown(event.seconds_until)}</span>}
        </span>
      </div>

      {/* Mobile */}
      <div className="sm:hidden px-4 pl-5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`font-mono text-[10px] tabular-nums ${isPast ? 'text-text-muted/30' : 'text-text-muted/80'}`}>
                {fmtTime(event.date)}
              </span>
              {event.type === 'macro' ? (
                <span className="text-xs">{eventIcon()}</span>
              ) : (
                <span className="text-xs"><TypeIcon /></span>
              )}
              <span
                className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                style={{ background: typeCfg.bg, color: typeCfg.color }}
              >
                {isZh ? typeCfg.labelZh : typeCfg.label}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: impactCfg.dot }}
              />
            </div>
            <p className={`text-[12px] leading-snug ${isPast ? 'text-text-muted/40' : 'text-text-primary'}`}>
              {getTitle(event)}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap font-mono tabular-nums">
              {event.type !== 'macro' && event.symbol && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-text-muted/80 border border-white/[0.04]">
                  {event.symbol}
                </span>
              )}
              {event.type === 'unlock' && event.usd_value ? (
                <span className="text-[10px] text-profit">{fmtUsd(event.usd_value)}</span>
              ) : null}
              {event.type === 'unlock' && event.pct_circulating ? (
                <span className="text-[9px] uppercase tracking-wider text-text-muted/70">
                  {event.pct_circulating}% circ.
                </span>
              ) : null}
              {event.type === 'macro' && event.forecast && (
                <span className="text-[10px] uppercase tracking-wider text-text-muted/70">
                  F: <span className="text-gold-primary normal-case">{event.forecast}</span>
                </span>
              )}
              {event.type === 'macro' && event.previous && (
                <span className="text-[10px] uppercase tracking-wider text-text-muted/70">
                  P: <span className="text-text-muted normal-case">{event.previous}</span>
                </span>
              )}
              {event.type === 'crypto_event' && event.category && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/[0.08] text-gold-primary/80 border border-line/20">
                  {event.category}
                </span>
              )}
            </div>
          </div>
          {!isPast && (
            <span
              className="font-mono text-[10px] tabular-nums shrink-0"
              style={{ color: cdColor(event.seconds_until) }}
            >
              {fmtCountdown(event.seconds_until)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


// ══════════════════════════════════════
// News Item
// ══════════════════════════════════════
const NewsItem = ({ article }) => {
  const srcStyle = SOURCE_STYLE[article.source] || {
    color: 'rgb(var(--accent))',
    bg: 'rgba(212,168,83,0.08)',
    border: 'rgba(212,168,83,0.20)'
  };

  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-sm p-2.5 bg-surface-raised border border-white/[0.06] hover:border-line/25 hover:bg-white/[0.02] transition-all duration-200"
    >
      {article.image && (
        <div className="w-20 h-14 rounded-sm overflow-hidden shrink-0 bg-surface-secondary">
          <img
            src={article.image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border"
            style={{ background: srcStyle.bg, color: srcStyle.color, borderColor: srcStyle.border }}
          >
            {article.source}
          </span>
          {article.time_ago && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
              · {article.time_ago}
            </span>
          )}
        </div>
        <h3 className="text-[12px] leading-snug line-clamp-2 transition-colors text-text-secondary group-hover:text-gold-primary">
          {article.title}
        </h3>
      </div>
    </a>
  );
};


// ══════════════════════════════════════
// Stat Card
// ══════════════════════════════════════
const CalendarStat = ({ label, value, icon, color = "default" }) => {
  const colorStyles = {
    profit: "text-profit",
    loss: "text-loss",
    gold: "text-gold-primary",
    default: "text-text-primary",
  };
  return (
    <div className="bg-surface-raised rounded-md border border-white/[0.06] p-3 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/80">
          {label}
        </p>
        <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-line/15 text-gold-primary">
          <StatIcon type={icon} />
        </div>
      </div>
      <div className="h-px bg-white/[0.04] mb-2" />
      <p className={`font-mono text-xl font-light tabular-nums leading-none ${colorStyles[color]}`}>
        {value}
      </p>
    </div>
  );
};


// ══════════════════════════════════════
// Skeletons
// ══════════════════════════════════════
const CalendarSkeleton = () => (
  <div className="space-y-2.5">
    <style>{`@keyframes sp{0%,100%{opacity:.04}50%{opacity:.12}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(255,255,255,.06);border-radius:2px}`}</style>
    {[...Array(5)].map((_, di) => (
      <div key={di} className="bg-surface-raised rounded-md overflow-hidden border border-white/[0.06]">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="skel w-3 h-3" />
          <div className="skel w-36 h-3" />
          <div className="flex-1" />
          <div className="skel w-8 h-3" />
        </div>
        {di < 2 && [...Array(3)].map((_, ei) => (
          <div key={ei} className="px-4 py-2.5 flex items-center gap-3 border-t border-white/[0.03]">
            <div className="skel w-10 h-3" />
            <div className="skel w-5 h-5" />
            <div className="skel flex-1 h-3" />
          </div>
        ))}
      </div>
    ))}
  </div>
);

const NewsSkeleton = () => (
  <div className="space-y-2">
    <style>{`@keyframes sp{0%,100%{opacity:.04}50%{opacity:.12}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(255,255,255,.06);border-radius:2px}`}</style>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-3 p-2.5 rounded-sm bg-surface-raised border border-white/[0.06]">
        <div className="skel w-20 h-14" />
        <div className="flex-1 space-y-1.5 py-0.5">
          <div className="skel w-16 h-2.5" />
          <div className="skel w-full h-3" />
          <div className="skel w-3/4 h-3" />
        </div>
      </div>
    ))}
  </div>
);


/* ──────────────────────────────────────────────────────────────
   SVG ICONS — Lucide-style minimal
   ────────────────────────────────────────────────────────────── */

const IconGlobe = ({ active }) => (
  <svg className={`w-3.5 h-3.5 ${active ? '' : 'opacity-70'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconMacro = ({ active }) => (
  <svg className={`w-3.5 h-3.5 ${active ? '' : 'opacity-70'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

const IconUnlock = ({ active }) => (
  <svg className={`w-3.5 h-3.5 ${active ? '' : 'opacity-70'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const IconBolt = ({ active }) => (
  <svg className={`w-3.5 h-3.5 ${active ? '' : 'opacity-70'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3 L4 14 H11 L9 21 L20 10 H13 L13 3 Z" />
  </svg>
);

const TAB_ICONS = {
  all: IconGlobe,
  macro: IconMacro,
  unlock: IconUnlock,
  crypto_event: IconBolt,
};

const IconUnlockMini = ({ className = "" }) => (
  <svg className={`w-2.5 h-2.5 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const IconBoltMini = ({ className = "" }) => (
  <svg className={`w-2.5 h-2.5 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3 L4 14 H11 L9 21 L20 10 H13 L13 3 Z" />
  </svg>
);

const IconRefresh = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const StatIcon = ({ type }) => {
  const icons = {
    total: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="14" width="4" height="7" />
        <rect x="10" y="9" width="4" height="12" />
        <rect x="17" y="5" width="4" height="16" />
      </svg>
    ),
    high: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 22h20L12 2z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    ),
    unlock: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    ),
    upcoming: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  };
  return icons[type] || icons.total;
};

export default MacroCalendarPage;