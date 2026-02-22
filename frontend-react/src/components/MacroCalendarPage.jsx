// src/components/MacroCalendarPage.jsx
import { useState, useEffect, useMemo } from 'react';
import calendarApi from '../services/calendarApi';

// ── Country flag emoji mapping ──
const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CAD: '🇨🇦',
  AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭', CNY: '🇨🇳', ALL: '🌐',
};

const IMPACT_CONFIG = {
  High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   label: 'High',    dot: '🔴' },
  Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  label: 'Medium',  dot: '🟡' },
  Low:     { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.25)', label: 'Low',     dot: '⚪' },
  Holiday: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)',  label: 'Holiday', dot: '🟣' },
};

const COUNTRIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

const MacroCalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeNextWeek, setIncludeNextWeek] = useState(false);

  // Filters
  const [selectedImpact, setSelectedImpact] = useState('High');
  const [selectedCountry, setSelectedCountry] = useState('ALL');

  // Countdown
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [includeNextWeek]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await calendarApi.getEvents({ include_next_week: includeNextWeek });
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to load calendar:', err);
      setError('Gagal memuat kalender ekonomi');
    } finally {
      setLoading(false);
    }
  };

  // ── Filter events ──
  const filteredEvents = useMemo(() => {
    let result = events;

    if (selectedImpact !== 'All') {
      result = result.filter(e => e.impact === selectedImpact);
    }

    if (selectedCountry !== 'ALL') {
      result = result.filter(e => e.country === selectedCountry);
    }

    return result;
  }, [events, selectedImpact, selectedCountry]);

  // ── Group by date ──
  const groupedByDate = useMemo(() => {
    const groups = {};
    filteredEvents.forEach(event => {
      try {
        const dt = new Date(event.date);
        const dateKey = dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(event);
      } catch {
        if (!groups['Unknown']) groups['Unknown'] = [];
        groups['Unknown'].push(event);
      }
    });
    return groups;
  }, [filteredEvents]);

  // ── Next upcoming high-impact event ──
  const nextHighImpact = useMemo(() => {
    const upcoming = events
      .filter(e => e.impact === 'High' && !e.is_past)
      .sort((a, b) => a.seconds_until - b.seconds_until);
    return upcoming[0] || null;
  }, [events]);

  const formatCountdown = (seconds) => {
    if (!seconds || seconds <= 0) return 'Now';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const formatTime = (dateStr) => {
    try {
      const dt = new Date(dateStr);
      return dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return '--:--'; }
  };

  // Impact filter buttons
  const impactFilters = ['All', 'High', 'Medium', 'Low', 'Holiday'];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            📅 Macro Calendar
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b5c52' }}>
            Jadwal rilis data ekonomi & event penting yang mempengaruhi market
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
            {includeNextWeek ? '📅 This + Next Week' : '📅 This Week'}
          </button>
          <button
            onClick={loadEvents}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5c52', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Countdown to next high-impact ── */}
      {nextHighImpact && (
        <div className="rounded-xl p-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(20,10,12,0.6))', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'rgba(239,68,68,0.15)' }}>
              🔴
            </div>
            <div>
              <p className="text-white text-sm font-semibold">{nextHighImpact.title}</p>
              <p className="text-xs" style={{ color: '#8a7b6b' }}>
                {FLAG[nextHighImpact.country] || '🌐'} {nextHighImpact.country} · {formatTime(nextHighImpact.date)}
                {nextHighImpact.forecast && <span> · Forecast: <span className="text-white">{nextHighImpact.forecast}</span></span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b5c52' }}>Next High Impact</p>
            <p className="text-lg font-mono font-bold" style={{ color: '#ef4444' }}>
              {formatCountdown(nextHighImpact.seconds_until)}
            </p>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Impact filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium mr-1" style={{ color: '#6b5c52' }}>Impact:</span>
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
                {cfg?.dot || '🌐'} {impact}
              </button>
            );
          })}
        </div>

        {/* Country filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium mr-1" style={{ color: '#6b5c52' }}>Country:</span>
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
                {FLAG[c] || '🌐'} {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Events list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full" style={{ borderTopColor: '#d4a853' }} />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">{error}</p>
          <button onClick={loadEvents} className="text-sm" style={{ color: '#d4a853' }}>Coba lagi</button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">📭</p>
          <p style={{ color: '#6b5c52' }}>Tidak ada event untuk filter ini</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white whitespace-nowrap">{dateLabel}</h2>
                <div className="flex-1 h-px" style={{ background: 'rgba(212,168,83,0.15)' }} />
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5c52' }}>
                  {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Events table */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(20,10,12,0.5)', border: '1px solid rgba(212,168,83,0.08)' }}>
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-[70px_44px_1fr_80px_80px_80px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: '#6b5c52', background: 'rgba(255,255,255,0.02)' }}>
                  <span>Time</span>
                  <span></span>
                  <span>Event</span>
                  <span className="text-right">Forecast</span>
                  <span className="text-right">Previous</span>
                  <span className="text-right">Status</span>
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
                      {/* Time */}
                      <span className="text-xs font-mono" style={{ color: isPast ? '#4a4040' : '#8a7b6b' }}>
                        {formatTime(event.date)}
                      </span>

                      {/* Country flag + impact dot */}
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm">{FLAG[event.country] || '🌐'}</span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      </span>

                      {/* Event title */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: isPast ? '#4a4040' : '#e5e5e5' }}>
                          {event.title}
                        </p>
                        {/* Mobile: show country + impact inline */}
                        <p className="sm:hidden text-[10px] mt-0.5" style={{ color: '#6b5c52' }}>
                          {event.country} · {event.impact}
                          {event.forecast && ` · F: ${event.forecast}`}
                          {event.previous && ` · P: ${event.previous}`}
                        </p>
                      </div>

                      {/* Forecast */}
                      <span className="hidden sm:block text-xs text-right font-mono" style={{ color: event.forecast ? '#d4a853' : '#3a3030' }}>
                        {event.forecast || '—'}
                      </span>

                      {/* Previous */}
                      <span className="hidden sm:block text-xs text-right font-mono" style={{ color: '#6b5c52' }}>
                        {event.previous || '—'}
                      </span>

                      {/* Status / countdown */}
                      <span className="hidden sm:block text-xs text-right font-mono">
                        {isPast ? (
                          <span style={{ color: '#3a3030' }}>Done</span>
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

      {/* ── Footer info ── */}
      <div className="text-center pt-4">
        <p className="text-[10px]" style={{ color: '#3a3030' }}>
          Data source: ForexFactory · Auto-refresh setiap 1 jam · Waktu ditampilkan dalam zona waktu lokal
        </p>
      </div>
    </div>
  );
};

export default MacroCalendarPage;