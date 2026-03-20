// src/components/MacroCalendarPage.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import calendarApi from '../services/calendarApi';

// ── Constants ──
const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CAD: '🇨🇦',
  AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭', CNY: '🇨🇳', ALL: '🌐',
};
const COUNTRIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
const IMPACTS = ['All', 'High', 'Medium', 'Low', 'Holiday'];

const IMPACT_STYLE = {
  High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', dot: '🔴', bar: '#ef4444' },
  Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', dot: '🟡', bar: '#f59e0b' },
  Low:     { color: '#6b7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.20)', dot: '⚪', bar: '#4b5563' },
  Holiday: { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', dot: '🟣', bar: '#a78bfa' },
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

// ══════════════════════════════════════
// Main Component
// ══════════════════════════════════════
const MacroCalendarPage = () => {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [selectedImpact, setSelectedImpact] = useState('All');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [now, setNow] = useState(new Date());
  const [expandedDays, setExpandedDays] = useState({});

  const isZh = useMemo(() => {
    const lang = i18n.resolvedLanguage || i18n.language || 'en';
    return lang.toLowerCase().startsWith('zh');
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Fetch calendar ──
  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await calendarApi.getEvents({ include_next_week: includeNextWeek });
      setEvents(data.events || []);
    } catch (err) {
      console.error('Calendar fetch failed:', err);
      setError(t('calendar.load_error'));
    } finally { setLoading(false); }
  }, [includeNextWeek, t]);

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

  // ── Filters ──
  const filteredEvents = useMemo(() => {
    let result = events;
    if (selectedImpact !== 'All') result = result.filter(e => e.impact === selectedImpact);
    if (selectedCountry !== 'ALL') result = result.filter(e => e.country === selectedCountry);
    return result;
  }, [events, selectedImpact, selectedCountry]);

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
          const allPast = true; // will compute below
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

    // Compute allPast per group
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

  // ── Stats ──
  const stats = useMemo(() => ({
    total: events.length,
    high: events.filter(e => e.impact === 'High').length,
    upcoming: events.filter(e => !e.is_past).length,
    countries: new Set(events.map(e => e.country)).size,
  }), [events]);

  // ── Helpers ──
  const getTitle = (title) => {
    if (!title || !isZh) return title || '';
    for (const [en, zh] of Object.entries(EVENT_ZH)) {
      if (title.includes(en)) return title.replace(en, zh);
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
          <button onClick={() => setIncludeNextWeek(!includeNextWeek)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={includeNextWeek
              ? { background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.25)' }
              : { background: 'rgba(255,255,255,0.03)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.06)' }}>
            {includeNextWeek ? t('calendar.this_next_week') : t('calendar.this_week')}
          </button>
          <button onClick={loadEvents}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.06)' }}>
            {t('calendar.refresh')}
          </button>
        </div>
      </div>

      {/* ─── Stats + Next High Impact (compact row) ─── */}
      {!loading && !error && events.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Mini stats */}
          <div className="flex gap-3 flex-1">
            {[
              { label: isZh ? '总计' : 'Total', value: stats.total, icon: '📊' },
              { label: isZh ? '高影响' : 'High', value: stats.high, icon: '🔴', accent: '#ef4444' },
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

          {/* Next high impact — compact */}
          {nextHighImpact && (
            <div className="rounded-lg px-3 py-2 flex items-center gap-3 sm:min-w-[280px]"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <span className="text-sm">🔴</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{getTitle(nextHighImpact.title)}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#7a6b5b' }}>
                  {FLAG[nextHighImpact.country]} {nextHighImpact.country} · {fmtTime(nextHighImpact.date)}
                </p>
              </div>
              <p className="text-sm font-mono font-bold tabular-nums shrink-0" style={{ color: '#ef4444' }}>
                {fmtCountdown(nextHighImpact.seconds_until)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Filters ─── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#5a4d42' }}>{t('calendar.impact')}</span>
          {IMPACTS.map(impact => {
            const active = selectedImpact === impact;
            const cfg = IMPACT_STYLE[impact];
            return (
              <button key={impact} onClick={() => setSelectedImpact(impact)}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-200"
                style={active
                  ? { background: cfg?.bg || 'rgba(212,168,83,0.12)', color: cfg?.color || '#d4a853', border: `1px solid ${cfg?.border || 'rgba(212,168,83,0.25)'}` }
                  : { background: 'transparent', color: '#5a4d42', border: '1px solid rgba(255,255,255,0.04)' }}>
                {cfg?.dot || '🌐'} {impact === 'All' ? t('calendar.all') : cfg?.label || impact}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#5a4d42' }}>{t('calendar.country')}</span>
          {COUNTRIES.map(c => {
            const active = selectedCountry === c;
            return (
              <button key={c} onClick={() => setSelectedCountry(c)}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-200"
                style={active
                  ? { background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.25)' }
                  : { background: 'transparent', color: '#5a4d42', border: '1px solid rgba(255,255,255,0.04)' }}>
                {FLAG[c] || '🌐'} {c === 'ALL' ? t('calendar.all') : c}
              </button>
            );
          })}
        </div>
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
                <DaySection key={group.dateLabel} group={group} t={t} getTitle={getTitle}
                  fmtTime={fmtTime} fmtCountdown={fmtCountdown} cdColor={cdColor}
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
const DaySection = ({ group, t, getTitle, fmtTime, fmtCountdown, cdColor, expanded, onToggle }) => {
  const { weekday, dateLabel, isToday, events, allPast } = group;
  const highCount = events.filter(e => e.impact === 'High').length;

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: isToday ? 'rgba(212,168,83,0.02)' : 'rgba(255,255,255,0.01)',
      border: isToday ? '1px solid rgba(212,168,83,0.1)' : '1px solid rgba(255,255,255,0.03)',
    }}>
      {/* Clickable header */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.01]">
        {/* Expand arrow */}
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
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: '#5a4d42' }}>
            {events.length}
          </span>
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div>
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[60px_32px_1fr_64px_64px_80px] gap-1.5 px-3 py-1 text-[9px] uppercase tracking-wider font-semibold"
            style={{ color: '#4a3f36', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <span>{t('calendar.th_time')}</span><span></span>
            <span>{t('calendar.th_event')}</span>
            <span className="text-right">{t('calendar.th_forecast')}</span>
            <span className="text-right">{t('calendar.th_previous')}</span>
            <span className="text-right">{t('calendar.th_status')}</span>
          </div>

          {events.map((event, i) => (
            <EventRow key={`${event.title}-${event.date}-${i}`} event={event} index={i}
              t={t} getTitle={getTitle} fmtTime={fmtTime} fmtCountdown={fmtCountdown} cdColor={cdColor} />
          ))}
        </div>
      )}
    </div>
  );
};


// ══════════════════════════════════════
// Event Row
// ══════════════════════════════════════
const EventRow = ({ event, index, t, getTitle, fmtTime, fmtCountdown, cdColor }) => {
  const cfg = IMPACT_STYLE[event.impact] || IMPACT_STYLE.Low;
  const isPast = event.is_past;

  return (
    <div className={`relative transition-colors duration-150 ${isPast ? 'opacity-30' : 'hover:bg-white/[0.015]'}`}
      style={{ borderTop: '1px solid rgba(255,255,255,0.02)' }}>
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: isPast ? 'transparent' : cfg.bar, opacity: 0.5 }} />

      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-[60px_32px_1fr_64px_64px_80px] gap-1.5 items-center px-3 pl-4 py-2">
        <span className="text-[11px] font-mono tabular-nums" style={{ color: isPast ? '#3a3030' : '#8a7b6b' }}>{fmtTime(event.date)}</span>
        <span className="text-sm">{FLAG[event.country] || '🌐'}</span>
        <p className="text-[13px] font-medium truncate" style={{ color: isPast ? '#3a3030' : '#e5e0db' }}>{getTitle(event.title)}</p>
        <span className="text-[11px] text-right font-mono tabular-nums" style={{ color: event.forecast ? '#d4a853' : '#2a2424' }}>{event.forecast || '—'}</span>
        <span className="text-[11px] text-right font-mono tabular-nums" style={{ color: '#5a4d42' }}>{event.previous || '—'}</span>
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
              <span className="text-xs">{FLAG[event.country] || '🌐'}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.bar }} />
            </div>
            <p className="text-[13px] font-medium leading-snug" style={{ color: isPast ? '#3a3030' : '#e5e0db' }}>{getTitle(event.title)}</p>
            {(event.forecast || event.previous) && (
              <div className="flex items-center gap-2 mt-1">
                {event.forecast && <span className="text-[10px]" style={{ color: '#6b5c52' }}>F: <span className="font-mono" style={{ color: '#d4a853' }}>{event.forecast}</span></span>}
                {event.previous && <span className="text-[10px]" style={{ color: '#5a4d42' }}>P: <span className="font-mono">{event.previous}</span></span>}
              </div>
            )}
          </div>
          {!isPast && <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: cdColor(event.seconds_until) }}>{fmtCountdown(event.seconds_until)}</span>}
        </div>
      </div>
    </div>
  );
};


// ══════════════════════════════════════
// News Item (compact list style for sidebar)
// ══════════════════════════════════════
const NewsItem = ({ article }) => {
  const srcStyle = SOURCE_STYLE[article.source] || { color: '#d4a853', bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.15)' };

  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.02]"
      style={{ border: '1px solid rgba(255,255,255,0.03)' }}>

      {/* Thumbnail */}
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