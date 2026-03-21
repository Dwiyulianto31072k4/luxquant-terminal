// src/components/MacroCalendarPage.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import calendarApi from '../services/calendarApi';

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

const IMPACT_STYLE = {
  High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', dot: '#ef4444', bar: '#ef4444' },
  Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b', bar: '#f59e0b' },
  Low:     { color: '#6b7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.20)', dot: '#4b5563', bar: '#4b5563' },
  Holiday: { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', dot: '#a78bfa', bar: '#a78bfa' },
};

const TYPE_STYLE = {
  macro:        { color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.20)', icon: '🏛️', label: 'Macro', labelZh: '宏观' },
  unlock:       { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.20)', icon: '🔓', label: 'Unlock', labelZh: '解锁' },
  crypto_event: { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', icon: '⚡', label: 'Event', labelZh: '事件' },
};

const SOURCE_STYLE = {
  CoinTelegraph: { color: '#1DA1F2', bg: 'rgba(29,161,242,0.08)', border: 'rgba(29,161,242,0.15)' },
  CoinDesk:      { color: '#4a90d9', bg: 'rgba(74,144,217,0.08)', border: 'rgba(74,144,217,0.15)' },
  Decrypt:       { color: '#00d395', bg: 'rgba(0,211,149,0.08)', border: 'rgba(0,211,149,0.15)' },
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
  const [allEvents, setAllEvents] = useState([]);  // ALL events from unified endpoint
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

  // ── Fetch ALL events once, filter client-side by tab ──
  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await calendarApi.getUnified();  // no filter — get everything
      setAllEvents(data.events || []);
      setAllStats(data.stats || null);
    } catch (err) {
      console.error('Calendar fetch failed:', err);
      setError(t('calendar.load_error'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Fetch news ──
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

  // ── Client-side filtering: tab + impact ──
  const events = useMemo(() => {
    let result = allEvents;
    if (activeTab !== 'all') result = result.filter(e => e.type === activeTab);
    return result;
  }, [allEvents, activeTab]);

  const stats = useMemo(() => {
    if (!allStats) return null;
    // When filtered by tab, recompute counts from filtered events
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

  // ── Group by date ──
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

  // Auto-expand: today + future days, collapse past days
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

  // ── Next high impact ──
  const nextHighImpact = useMemo(() =>
    events.filter(e => e.impact === 'High' && !e.is_past)
      .sort((a, b) => a.seconds_until - b.seconds_until)[0] || null
  , [events]);

  // ── Helpers ──
  const getTitle = (event) => {
    const title = event.title || '';
    if (!isZh) return title;
    // Only translate macro events
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
    if (sec < 3600) return '#ef4444';
    if (sec < 86400) return '#f59e0b';
    return '#6b5c52';
  };

  // ══════════════════════════════════════
  return (
    <div className="space-y-4">

      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            <span className="text-lg">📅</span> {t('calendar.title')}
          </h1>
          <p className="text-xs mt-1" style={{ color: '#6b5c52' }}>{t('calendar.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadEvents}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.06)' }}>
            🔄 {t('calendar.refresh')}
          </button>
        </div>
      </div>

      {/* ─── Type Tabs ─── */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const ts = tab.key !== 'all' ? TYPE_STYLE[tab.key] : null;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
              style={active
                ? { background: ts?.bg || 'rgba(212,168,83,0.12)', color: ts?.color || '#d4a853', border: `1px solid ${ts?.border || 'rgba(212,168,83,0.25)'}` }
                : { background: 'transparent', color: '#5a4d42', border: '1px solid transparent' }}>
              {ts?.icon || '🌐'} {isZh ? tab.labelZh : tab.label}
              {/* Show count badge */}
              {allStats && tab.key !== 'all' && (
                <span className="text-[9px] px-1 py-0.5 rounded-full font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: active ? (ts?.color || '#d4a853') : '#4a3f36' }}>
                  {tab.key === 'macro' ? allStats.macro : tab.key === 'unlock' ? allStats.unlocks : allStats.crypto_events}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Stats Row ─── */}
      {!loading && !error && stats && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-3 flex-1">
            {[
              { label: isZh ? '总计' : 'Total', value: stats.total, icon: '📊' },
              { label: isZh ? '高影响' : 'High Impact', value: stats.high_impact, icon: '🔴', accent: '#ef4444' },
              { label: isZh ? '代币解锁' : 'Unlocks', value: stats.unlocks, icon: '🔓', accent: '#8b5cf6' },
              { label: isZh ? '即将' : 'Upcoming', value: stats.upcoming, icon: '⏳', accent: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} className="rounded-lg px-3 py-2 flex items-center gap-2 flex-1"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-sm">{s.icon}</span>
                <div>
                  <p className="text-base font-bold font-mono leading-none" style={{ color: s.accent || '#d4a853' }}>{s.value}</p>
                  <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: '#5a4d42' }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {nextHighImpact && (
            <div className="rounded-lg px-3 py-2 flex items-center gap-3 sm:min-w-[280px]"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <span className="text-sm">🔴</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{getTitle(nextHighImpact)}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#7a6b5b' }}>
                  {nextHighImpact.type === 'macro' ? FLAG[nextHighImpact.country] : ''} {nextHighImpact.symbol || nextHighImpact.country} · {fmtTime(nextHighImpact.date)}
                </p>
              </div>
              <p className="text-sm font-mono font-bold tabular-nums shrink-0" style={{ color: '#ef4444' }}>
                {fmtCountdown(nextHighImpact.seconds_until)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Impact Filters ─── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#5a4d42' }}>
          {t('calendar.impact')}
        </span>
        {IMPACTS.map(impact => {
          const active = selectedImpact === impact;
          const cfg = IMPACT_STYLE[impact];
          return (
            <button key={impact} onClick={() => setSelectedImpact(impact)}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-200"
              style={active
                ? { background: cfg?.bg || 'rgba(212,168,83,0.12)', color: cfg?.color || '#d4a853', border: `1px solid ${cfg?.border || 'rgba(212,168,83,0.25)'}` }
                : { background: 'transparent', color: '#5a4d42', border: '1px solid rgba(255,255,255,0.04)' }}>
              {impact === 'All' ? (isZh ? '🌐 全部' : '🌐 All') : impact}
            </button>
          );
        })}
      </div>

      {/* ─── Main Content: Calendar (left) + News (right) ─── */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Calendar Section ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <CalendarSkeleton />
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">⚠️</p>
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <button onClick={loadEvents}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.25)' }}>
                {t('calendar.try_again')}
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-sm" style={{ color: '#6b5c52' }}>{t('calendar.no_events')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedByDate.map((group) => (
                <DaySection key={group.dateLabel} group={group} t={t} isZh={isZh}
                  getTitle={getTitle} fmtTime={fmtTime} fmtCountdown={fmtCountdown} cdColor={cdColor}
                  expanded={!!expandedDays[group.dateLabel]} onToggle={() => toggleDay(group.dateLabel)} />
              ))}
            </div>
          )}
        </div>

        {/* ── News Sidebar ── */}
        <div className="lg:w-[340px] xl:w-[380px] shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>📰</span> {isZh ? '宏观与加密新闻' : 'Macro & Crypto News'}
            </h2>
            <div className="flex-1 h-px" style={{ background: 'rgba(212,168,83,0.12)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#4a3f36' }}>LIVE</span>
          </div>

          {newsLoading ? (
            <NewsSkeleton />
          ) : news.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: '#6b5c52' }}>{isZh ? '暂无新闻' : 'No news available'}</p>
            </div>
          ) : (
            <div className="space-y-2 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,168,83,0.15) transparent' }}>
              {news.map((article, i) => (
                <NewsItem key={i} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div className="text-center pt-2 pb-4">
        <p className="text-[10px]" style={{ color: '#3a3030' }}>{t('calendar.footer_info')}</p>
      </div>
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
    <div className="rounded-xl overflow-hidden" style={{
      background: isToday ? 'rgba(212,168,83,0.02)' : 'rgba(255,255,255,0.01)',
      border: isToday ? '1px solid rgba(212,168,83,0.1)' : '1px solid rgba(255,255,255,0.03)',
    }}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.01]">
        <svg className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#5a4d42' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {isToday && (
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}>TODAY</span>
        )}
        <span className="text-xs font-semibold text-white whitespace-nowrap">
          {weekday && <span style={{ color: isToday ? '#d4a853' : '#8a7b6b' }}>{weekday}, </span>}
          {dateLabel}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 shrink-0">
          {highCount > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {highCount}🔴
            </span>
          )}
          {unlockCount > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
              {unlockCount}🔓
            </span>
          )}
          {cryptoCount > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              {cryptoCount}⚡
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: '#5a4d42' }}>
            {events.length}
          </span>
        </div>
      </button>

      {expanded && (
        <div>
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[56px_28px_1fr_70px_80px] gap-1.5 px-3 py-1 text-[9px] uppercase tracking-wider font-semibold"
            style={{ color: '#4a3f36', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <span>{t('calendar.th_time')}</span><span></span>
            <span>{t('calendar.th_event')}</span>
            <span className="text-right">{isZh ? '详情' : 'Details'}</span>
            <span className="text-right">{t('calendar.th_status')}</span>
          </div>

          {events.map((event, i) => (
            <EventRow key={`${event.title}-${event.date}-${i}`} event={event} index={i} isZh={isZh}
              t={t} getTitle={getTitle} fmtTime={fmtTime} fmtCountdown={fmtCountdown} cdColor={cdColor} />
          ))}
        </div>
      )}
    </div>
  );
};


// ══════════════════════════════════════
// Event Row — unified for all event types
// ══════════════════════════════════════
const EventRow = ({ event, index, isZh, t, getTitle, fmtTime, fmtCountdown, cdColor }) => {
  const impactCfg = IMPACT_STYLE[event.impact] || IMPACT_STYLE.Low;
  const typeCfg = TYPE_STYLE[event.type] || TYPE_STYLE.macro;
  const isPast = event.is_past;

  // Type-specific detail column
  const detailContent = () => {
    if (event.type === 'unlock') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          {event.usd_value ? (
            <span className="text-[11px] font-mono font-semibold" style={{ color: '#8b5cf6' }}>
              {fmtUsd(event.usd_value)}
            </span>
          ) : null}
          {event.pct_circulating ? (
            <span className="text-[9px] font-mono" style={{ color: '#6b5c52' }}>
              {event.pct_circulating}% circ.
            </span>
          ) : null}
        </div>
      );
    }
    if (event.type === 'macro') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          {event.forecast && <span className="text-[10px] font-mono" style={{ color: '#d4a853' }}>{event.forecast}</span>}
          {event.previous && <span className="text-[9px] font-mono" style={{ color: '#5a4d42' }}>P: {event.previous}</span>}
        </div>
      );
    }
    if (event.type === 'crypto_event' && event.category) {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: typeCfg.bg, color: typeCfg.color, border: `1px solid ${typeCfg.border}` }}>
          {event.category}
        </span>
      );
    }
    return null;
  };

  // Icon/flag for the event
  const eventIcon = () => {
    if (event.type === 'macro') return FLAG[event.country] || '🌐';
    if (event.type === 'unlock') return '🔓';
    if (event.type === 'crypto_event') return '⚡';
    return '📌';
  };

  return (
    <div className={`relative transition-colors duration-150 ${isPast ? 'opacity-30' : 'hover:bg-white/[0.015]'}`}
      style={{ borderTop: '1px solid rgba(255,255,255,0.02)' }}>
      {/* Left bar — color by type */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: isPast ? 'transparent' : typeCfg.color, opacity: 0.5 }} />

      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-[56px_28px_1fr_70px_80px] gap-1.5 items-center px-3 pl-4 py-2">
        <span className="text-[11px] font-mono tabular-nums" style={{ color: isPast ? '#3a3030' : '#8a7b6b' }}>
          {fmtTime(event.date)}
        </span>
        <span className="text-sm">{eventIcon()}</span>
        <div className="min-w-0 flex items-center gap-2">
          {/* Type badge */}
          <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0"
            style={{ background: typeCfg.bg, color: typeCfg.color, border: `0.5px solid ${typeCfg.border}` }}>
            {isZh ? typeCfg.labelZh : typeCfg.label}
          </span>
          {/* Impact dot */}
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: impactCfg.dot }} />
          {/* Title */}
          <p className="text-[13px] font-medium truncate" style={{ color: isPast ? '#3a3030' : '#e5e0db' }}>
            {getTitle(event)}
          </p>
          {/* Symbol badge for crypto events */}
          {event.type !== 'macro' && event.symbol && (
            <span className="text-[9px] font-mono font-semibold px-1 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#8a7b6b' }}>
              {event.symbol}
            </span>
          )}
        </div>
        <div className="flex justify-end">{detailContent()}</div>
        <span className="text-[11px] text-right font-mono tabular-nums">
          {isPast
            ? <span style={{ color: '#3a3030' }}>{t('calendar.status_done')}</span>
            : <span style={{ color: cdColor(event.seconds_until) }}>{fmtCountdown(event.seconds_until)}</span>}
        </span>
      </div>

      {/* Mobile */}
      <div className="sm:hidden px-3 pl-4 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-mono tabular-nums" style={{ color: '#8a7b6b' }}>{fmtTime(event.date)}</span>
              <span className="text-xs">{eventIcon()}</span>
              <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded"
                style={{ background: typeCfg.bg, color: typeCfg.color }}>
                {isZh ? typeCfg.labelZh : typeCfg.label}
              </span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: impactCfg.dot }} />
            </div>
            <p className="text-[13px] font-medium leading-snug" style={{ color: isPast ? '#3a3030' : '#e5e0db' }}>
              {getTitle(event)}
            </p>
            {/* Inline details for mobile */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {event.type !== 'macro' && event.symbol && (
                <span className="text-[9px] font-mono font-semibold px-1 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#8a7b6b' }}>
                  {event.symbol}
                </span>
              )}
              {event.type === 'unlock' && event.usd_value ? (
                <span className="text-[10px] font-mono" style={{ color: '#8b5cf6' }}>{fmtUsd(event.usd_value)}</span>
              ) : null}
              {event.type === 'unlock' && event.pct_circulating ? (
                <span className="text-[9px] font-mono" style={{ color: '#6b5c52' }}>{event.pct_circulating}% circ.</span>
              ) : null}
              {event.type === 'macro' && event.forecast && (
                <span className="text-[10px]" style={{ color: '#6b5c52' }}>F: <span className="font-mono" style={{ color: '#d4a853' }}>{event.forecast}</span></span>
              )}
              {event.type === 'macro' && event.previous && (
                <span className="text-[10px]" style={{ color: '#5a4d42' }}>P: <span className="font-mono">{event.previous}</span></span>
              )}
              {event.type === 'crypto_event' && event.category && (
                <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: typeCfg.bg, color: typeCfg.color }}>
                  {event.category}
                </span>
              )}
            </div>
          </div>
          {!isPast && <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: cdColor(event.seconds_until) }}>{fmtCountdown(event.seconds_until)}</span>}
        </div>
      </div>
    </div>
  );
};


// ══════════════════════════════════════
// News Item
// ══════════════════════════════════════
const NewsItem = ({ article }) => {
  const srcStyle = SOURCE_STYLE[article.source] || { color: '#d4a853', bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.15)' };

  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.02]"
      style={{ border: '1px solid rgba(255,255,255,0.03)' }}>
      {article.image && (
        <div className="w-20 h-14 rounded-md overflow-hidden shrink-0">
          <img src={article.image} alt="" loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[9px] font-semibold px-1 py-0.5 rounded"
            style={{ background: srcStyle.bg, color: srcStyle.color, border: `1px solid ${srcStyle.border}` }}>
            {article.source}
          </span>
          {article.time_ago && <span className="text-[9px]" style={{ color: '#4a3f36' }}>{article.time_ago}</span>}
        </div>
        <h3 className="text-xs font-medium leading-snug line-clamp-2 transition-colors group-hover:text-[#d4a853]"
          style={{ color: '#ccc5be' }}>
          {article.title}
        </h3>
      </div>
    </a>
  );
};


// ══════════════════════════════════════
// Skeletons
// ══════════════════════════════════════
const CalendarSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    {[...Array(5)].map((_, di) => (
      <div key={di} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)' }}>
        <div className="px-3 py-2 flex items-center gap-3">
          <div className="h-3 w-3 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-3.5 w-36 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="flex-1" />
          <div className="h-3 w-8 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>
        {di < 2 && [...Array(3)].map((_, ei) => (
          <div key={ei} className="px-4 py-2 flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.02)' }}>
            <div className="h-3 w-10 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
            <div className="h-3 w-5 rounded" style={{ background: 'rgba(255,255,255,0.025)' }} />
            <div className="h-3 flex-1 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
          </div>
        ))}
      </div>
    ))}
  </div>
);

const NewsSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-3 p-2 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.03)' }}>
        <div className="w-20 h-14 rounded-md" style={{ background: 'rgba(255,255,255,0.03)' }} />
        <div className="flex-1 space-y-1.5 py-0.5">
          <div className="h-2.5 w-16 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-3 w-full rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-3 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    ))}
  </div>
);

export default MacroCalendarPage;