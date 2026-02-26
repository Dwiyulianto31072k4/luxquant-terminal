// src/components/MacroCalendarPage.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import calendarApi from '../services/calendarApi';

const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CAD: '🇨🇦',
  AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭', CNY: '🇨🇳', ALL: '🌐',
};

const COUNTRIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

// KAMUS MINI AMAN (Anti-Error)
const EVENT_TRANSLATIONS = {
  "Unemployment Claims": "初请失业金人数",
  "Core PCE Price Index m/m": "核心PCE物价指数 (月率)",
  "Core PCE Price Index y/y": "核心PCE物价指数 (年率)",
  "CPI m/m": "消费者物价指数/CPI (月率)",
  "CPI y/y": "消费者物价指数/CPI (年率)",
  "Core CPI m/m": "核心CPI (月率)",
  "Core CPI y/y": "核心CPI (年率)",
  "Federal Funds Rate": "美联储联邦基金利率",
  "Non-Farm Employment Change": "非农就业人数 (NFP)",
  "Unemployment Rate": "失业率",
  "ISM Services PMI": "ISM非制造业PMI",
  "ISM Manufacturing PMI": "ISM制造业PMI",
  "Retail Sales m/m": "零售销售 (月率)",
  "Core Retail Sales m/m": "核心零售销售 (月率)",
  "Advance GDP q/q": "美国GDP提前数据 (季率)",
  "Prelim GDP q/q": "美国GDP修正值 (季率)",
  "Final GDP q/q": "美国GDP终值 (季率)",
  "FOMC Statement": "美联储货币政策声明",
  "FOMC Press Conference": "美联储新闻发布会",
  "JOLTS Job Openings": "JOLTs职位空缺",
  "CB Consumer Confidence": "美国谘商会消费者信心指数",
  "Building Permits": "营建许可",
  "Crude Oil Inventories": "EIA原油库存",
  "Flash Manufacturing PMI": "制造业PMI初值",
  "Flash Services PMI": "服务业PMI初值",
  "Bank Holiday": "银行假日",
  "Monetary Policy Report": "货币政策报告",
  "Trade Balance": "贸易帐",
  "Existing Home Sales": "成屋销售",
  "New Home Sales": "新屋销售",
  "Pending Home Sales": "成屋签约销售",
  "Durable Goods Orders": "耐用品订单",
  "Core Durable Goods": "核心耐用品订单",
  "Producer Price Index": "生产者物价指数 (PPI)",
  "Core PPI": "核心PPI",
  "Industrial Production": "工业产出",
  "Employment Cost Index": "就业成本指数"
};

const MacroCalendarPage = () => {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [selectedImpact, setSelectedImpact] = useState('High');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [now, setNow] = useState(new Date());

  const IMPACT_CONFIG = useMemo(() => ({
    High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   label: t('calendar.high'),    dot: '🔴' },
    Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  label: t('calendar.medium'),  dot: '🟡' },
    Low:     { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.25)', label: t('calendar.low'),     dot: '⚪' },
    Holiday: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)',  label: t('calendar.holiday'), dot: '🟣' },
  }), [t]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [includeNextWeek]); // Tidak perlu me-reload API saat bahasa berganti

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await calendarApi.getEvents({ include_next_week: includeNextWeek });
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to load calendar:', err);
      setError(t('calendar.load_error'));
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    let result = events;
    if (selectedImpact !== 'All') result = result.filter(e => e.impact === selectedImpact);
    if (selectedCountry !== 'ALL') result = result.filter(e => e.country === selectedCountry);
    return result;
  }, [events, selectedImpact, selectedCountry]);

  const groupedByDate = useMemo(() => {
    const groups = {};
    const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
    const locale = currentLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'; 
    
    filteredEvents.forEach(event => {
      try {
        const dt = new Date(event.date);
        const dateKey = dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(event);
      } catch {
        if (!groups['Unknown']) groups['Unknown'] = [];
        groups['Unknown'].push(event);
      }
    });
    return groups;
  }, [filteredEvents, i18n.language, i18n.resolvedLanguage]);

  const nextHighImpact = useMemo(() => {
    const upcoming = events
      .filter(e => e.impact === 'High' && !e.is_past)
      .sort((a, b) => a.seconds_until - b.seconds_until);
    return upcoming[0] || null;
  }, [events]);

  const formatCountdown = (seconds) => {
    if (!seconds || seconds <= 0) return t('calendar.now');
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}${t('calendar.d')} ${h}${t('calendar.h')} ${m}${t('calendar.m')}`;
    if (h > 0) return `${h}${t('calendar.h')} ${m}${t('calendar.m')} ${s}${t('calendar.s')}`;
    return `${m}${t('calendar.m')} ${s}${t('calendar.s')}`;
  };

  const formatTime = (dateStr) => {
    try {
      const dt = new Date(dateStr);
      return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return '--:--'; }
  };

  // FUNGSI PENGAMAN TERJEMAHAN
  const getEventTitle = (title) => {
    if (!title) return '';
    const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
    
    // Jika BUKAN bahasa Mandarin, kembalikan judul API asli (Inggris)
    if (!currentLang.toLowerCase().startsWith('zh')) return title;

    // Jika bahasa Mandarin, cek ke kamus
    for (const [eng, zh] of Object.entries(EVENT_TRANSLATIONS)) {
      if (title.includes(eng)) {
        return title.replace(eng, zh); // Ganti bagian yang cocok dengan Mandarin
      }
    }
    
    // Kalau event tersebut tidak ada di kamus, biarkan saja pakai API (Inggris), ANTI ERROR.
    return title; 
  };

  const impactFilters = ['All', 'High', 'Medium', 'Low', 'Holiday'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            📅 {t('calendar.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b5c52' }}>
            {t('calendar.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncludeNextWeek(!includeNextWeek)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={includeNextWeek ? {
              background: 'rgba(212, 168, 83, 0.15)', color: '#d4a853', border: '1px solid rgba(212, 168, 83, 0.3)'
            } : {
              background: 'rgba(255,255,255,0.04)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            {includeNextWeek ? t('calendar.this_next_week') : t('calendar.this_week')}
          </button>
          <button
            onClick={loadEvents}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {t('calendar.refresh')}
          </button>
        </div>
      </div>

      {nextHighImpact && (
        <div className="rounded-xl p-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(20,10,12,0.6))', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'rgba(239,68,68,0.15)' }}>
              🔴
            </div>
            <div>
              <p className="text-white text-sm font-semibold">{getEventTitle(nextHighImpact.title)}</p>
              <p className="text-xs" style={{ color: '#8a7b6b' }}>
                {FLAG[nextHighImpact.country] || '🌐'} {nextHighImpact.country} · {formatTime(nextHighImpact.date)}
                {nextHighImpact.forecast && <span> · {t('calendar.forecast')} <span className="text-white">{nextHighImpact.forecast}</span></span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b5c52' }}>{t('calendar.next_high_impact')}</p>
            <p className="text-lg font-mono font-bold" style={{ color: '#ef4444' }}>
              {formatCountdown(nextHighImpact.seconds_until)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium mr-1" style={{ color: '#6b5c52' }}>{t('calendar.impact')}</span>
          {impactFilters.map(impact => {
            const isActive = selectedImpact === impact;
            const cfg = IMPACT_CONFIG[impact];
            return (
              <button
                key={impact}
                onClick={() => setSelectedImpact(impact)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={isActive ? {
                  background: cfg?.bg || 'rgba(212,168,83,0.15)',
                  color: cfg?.color || '#d4a853',
                  border: `1px solid ${cfg?.border || 'rgba(212,168,83,0.3)'}`,
                } : {
                  background: 'transparent',
                  color: '#6b5c52',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {cfg?.dot || '🌐'} {impact === 'All' ? t('calendar.all') : cfg?.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium mr-1" style={{ color: '#6b5c52' }}>{t('calendar.country')}</span>
          {COUNTRIES.map(c => {
            const isActive = selectedCountry === c;
            return (
              <button
                key={c}
                onClick={() => setSelectedCountry(c)}
                className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
                style={isActive ? {
                  background: 'rgba(212, 168, 83, 0.15)',
                  color: '#d4a853',
                  border: '1px solid rgba(212, 168, 83, 0.3)',
                } : {
                  background: 'transparent',
                  color: '#6b5c52',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {FLAG[c] || '🌐'} {c === 'ALL' ? t('calendar.all') : c}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full" style={{ borderTopColor: '#d4a853' }} />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">{error}</p>
          <button onClick={loadEvents} className="text-sm" style={{ color: '#d4a853' }}>{t('calendar.try_again')}</button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">📭</p>
          <p style={{ color: '#6b5c52' }}>{t('calendar.no_events')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white whitespace-nowrap">{dateLabel}</h2>
                <div className="flex-1 h-px" style={{ background: 'rgba(212,168,83,0.15)' }} />
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5c52' }}>
                  {dayEvents.length} {dayEvents.length > 1 ? t('calendar.events') : t('calendar.event')}
                </span>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(20,10,12,0.5)', border: '1px solid rgba(212,168,83,0.08)' }}>
                <div className="hidden sm:grid grid-cols-[70px_44px_1fr_80px_80px_80px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: '#6b5c52', background: 'rgba(255,255,255,0.02)' }}>
                  <span>{t('calendar.th_time')}</span>
                  <span></span>
                  <span>{t('calendar.th_event')}</span>
                  <span className="text-right">{t('calendar.th_forecast')}</span>
                  <span className="text-right">{t('calendar.th_previous')}</span>
                  <span className="text-right">{t('calendar.th_status')}</span>
                </div>

                {dayEvents.map((event, i) => {
                  const cfg = IMPACT_CONFIG[event.impact] || IMPACT_CONFIG.Low;
                  const isPast = event.is_past;

                  return (
                    <div
                      key={`${event.title}-${event.date}-${i}`}
                      className={`grid grid-cols-1 sm:grid-cols-[70px_44px_1fr_80px_80px_80px] gap-2 px-4 py-3 transition-colors ${
                        isPast ? 'opacity-40' : 'hover:bg-white/[0.02]'
                      }`}
                      style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}
                    >
                      <span className="text-xs font-mono" style={{ color: isPast ? '#4a4040' : '#8a7b6b' }}>
                        {formatTime(event.date)}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <span className="text-sm">{FLAG[event.country] || '🌐'}</span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      </span>

                      <div className="min-w-0">
                        {/* Judul akan diterjemahkan jika ada di kamus, jika tidak pakai Inggris asli */}
                        <p className="text-sm font-medium truncate" style={{ color: isPast ? '#4a4040' : '#e5e5e5' }}>
                          {getEventTitle(event.title)} 
                        </p>
                        <p className="sm:hidden text-[10px] mt-0.5" style={{ color: '#6b5c52' }}>
                          {event.country} · {cfg.label}
                          {event.forecast && ` · ${t('calendar.th_forecast')}: ${event.forecast}`}
                          {event.previous && ` · ${t('calendar.th_previous')}: ${event.previous}`}
                        </p>
                      </div>

                      <span className="hidden sm:block text-xs text-right font-mono" style={{ color: event.forecast ? '#d4a853' : '#3a3030' }}>
                        {event.forecast || '—'}
                      </span>

                      <span className="hidden sm:block text-xs text-right font-mono" style={{ color: '#6b5c52' }}>
                        {event.previous || '—'}
                      </span>

                      <span className="hidden sm:block text-xs text-right font-mono">
                        {isPast ? (
                          <span style={{ color: '#3a3030' }}>{t('calendar.status_done')}</span>
                        ) : event.seconds_until < 3600 ? (
                          <span style={{ color: '#ef4444' }}>{formatCountdown(event.seconds_until)}</span>
                        ) : event.seconds_until < 86400 ? (
                          <span style={{ color: '#f59e0b' }}>{formatCountdown(event.seconds_until)}</span>
                        ) : (
                          <span style={{ color: '#6b5c52' }}>{formatCountdown(event.seconds_until)}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center pt-4">
        <p className="text-[10px]" style={{ color: '#3a3030' }}>
          {t('calendar.footer_info')}
        </p>
      </div>
    </div>
  );
};

export default MacroCalendarPage;