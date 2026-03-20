import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CoinLogo from './CoinLogo';

const BtcDomAlert = ({ allSignals, onSignalClick }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const btcdomSignal = useMemo(() => {
    if (!allSignals || allSignals.length === 0) return null;
    const btcdomSignals = allSignals
      .filter(s => s.pair && s.pair.toUpperCase().includes('BTCDOM'))
      .sort((a, b) => (b.call_message_id || 0) - (a.call_message_id || 0));
    return btcdomSignals.length > 0 ? btcdomSignals[0] : null;
  }, [allSignals]);

  if (!btcdomSignal) return null;

  const isWinning = ['tp1', 'tp2', 'tp3', 'closed_win', 'tp4'].includes(btcdomSignal.status);
  const isLoss = ['closed_loss', 'sl'].includes(btcdomSignal.status);

  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    return isNaN(num) ? '-' : num.toFixed(2);
  };

  const getStatusLabel = (status) => {
    const map = {
      'open': 'OPEN', 'tp1': 'TP1 HIT', 'tp2': 'TP2 HIT', 'tp3': 'TP3 HIT',
      'closed_win': 'TP4 HIT', 'tp4': 'TP4 HIT', 'closed_loss': 'STOPPED', 'sl': 'STOPPED',
    };
    return map[status] || status?.toUpperCase();
  };

  const getStatusColor = (status) => {
    if (['tp1', 'tp2', 'tp3', 'closed_win', 'tp4'].includes(status)) return { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', border: 'rgba(34,197,94,0.25)' };
    if (['closed_loss', 'sl'].includes(status)) return { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.25)' };
    return { bg: 'rgba(255,255,255,0.05)', text: '#fff', border: 'rgba(255,255,255,0.1)' };
  };

  const sc = getStatusColor(btcdomSignal.status);

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const diffMs = new Date() - new Date(dt);
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  const formatExactTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month}, ${hours}:${mins}`;
  };

  const getRiskLabel = (riskStr) => {
    const r = (riskStr || '').toLowerCase();
    if (r.startsWith('low')) return 'Low';
    if (r.startsWith('med')) return 'Medium';
    if (r.startsWith('high')) return 'High';
    return 'Normal';
  };

  const tpLevels = [
    { label: 'TP1', value: btcdomSignal.target1, hit: ['tp1','tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP2', value: btcdomSignal.target2, hit: ['tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP3', value: btcdomSignal.target3, hit: ['tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP4', value: btcdomSignal.target4, hit: ['closed_win','tp4'].includes(btcdomSignal.status) },
  ].filter(tp => tp.value);

  const hitCount = tpLevels.filter(tp => tp.hit).length;
  const progressWidth = tpLevels.length > 1 ? `${(hitCount / (tpLevels.length - 1)) * 100}%` : '0%';
  const accentColor = isLoss ? '#ef4444' : '#f59e0b';

  return (
    <div className="mb-4">
      {/* ══════════════════════════════════════
         COLLAPSED BAR (always visible)
         ══════════════════════════════════════ */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.002]"
        style={{
          background: 'rgba(20, 10, 12, 0.6)',
          border: `1px solid ${accentColor}20`,
          borderLeft: `3px solid ${accentColor}60`,
        }}
      >
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}25` }}>
            <svg className="w-3.5 h-3.5" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
            BTC Dominance Alert
          </span>
        </div>

        {/* Center: Timestamps */}
        <div className="hidden md:flex items-center gap-3 text-[10px] text-text-muted">
          <span>
            Called: <strong className="text-white font-mono">{formatExactTime(btcdomSignal.created_at)}</strong>
            <span className="text-text-muted/60 ml-1">({formatTimeAgo(btcdomSignal.created_at)})</span>
          </span>
          {btcdomSignal.last_update_at && (
            <>
              <span className="text-white/15">•</span>
              <span>
                Update: <strong className="font-mono" style={{ color: sc.text }}>{formatExactTime(btcdomSignal.last_update_at)}</strong>
                <span className="text-text-muted/60 ml-1">({formatTimeAgo(btcdomSignal.last_update_at)})</span>
              </span>
            </>
          )}
        </div>

        {/* Right: Status + Arrow */}
        <div className="flex items-center gap-2.5">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded"
            style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
            {getStatusLabel(btcdomSignal.status)}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} style={{ opacity: 0.3 }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="#8a8577" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ══════════════════════════════════════
         EXPANDED DETAIL
         ══════════════════════════════════════ */}
      {expanded && (
        <div className="mt-1 rounded-xl overflow-hidden animate-slideDown"
          style={{ background: 'rgba(10, 5, 6, 0.9)', border: `1px solid ${accentColor}15` }}>
          
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* LEFT: Data */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Coin header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CoinLogo pair="BTCUSDT" size={36} />
                    <div>
                      <h4 className="text-white text-base font-bold">BTCDOMUSDT</h4>
                      <p className="text-text-muted text-[10px]">Dominance Index</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href="https://www.binance.com/en/support/faq/what-is-bitcoin-dominance-btcdom-e3b1ab97a3e24df4b0e41a469ccf7a21"
                      target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text-muted hover:text-white hover:bg-white/10 transition-all text-[9px] font-medium">
                      Get to know
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSignalClick && onSignalClick(btcdomSignal); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-medium transition-all"
                      style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}25` }}>
                      Open Chart →
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-[8px] text-text-muted uppercase tracking-wider">Entry Price</p>
                    <p className="text-white font-mono text-sm font-bold">{formatPrice(btcdomSignal.entry)}</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-[8px] text-text-muted uppercase tracking-wider">Stop Loss</p>
                    <p className="text-red-400 font-mono text-sm font-bold">{formatPrice(btcdomSignal.stop1)}</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-[8px] text-text-muted uppercase tracking-wider">Risk Level</p>
                    <p className={`text-sm font-bold ${
                      btcdomSignal.risk_level?.toLowerCase().startsWith('low') ? 'text-green-400' :
                      btcdomSignal.risk_level?.toLowerCase().startsWith('high') ? 'text-red-400' : 'text-amber-400'
                    }`}>{getRiskLabel(btcdomSignal.risk_level)}</p>
                  </div>
                </div>

                {/* Target Journey */}
                {tpLevels.length > 0 && (
                  <div>
                    <p className="text-[8px] text-text-muted uppercase tracking-wider mb-2">Target Journey</p>
                    <div className="relative w-full">
                      <div className="absolute top-[5px] left-0 w-full h-[2px] bg-white/5 rounded-full" />
                      <div className="absolute top-[5px] left-0 h-[2px] bg-green-500 rounded-full transition-all duration-1000 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                        style={{ width: progressWidth }} />
                      <div className="relative flex justify-between items-start z-10">
                        {tpLevels.map((tp, idx) => (
                          <div key={idx} className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full outline outline-3 outline-[#0a0506] ${tp.hit ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-gray-700'}`} />
                            <span className={`text-[9px] font-bold mt-1.5 ${tp.hit ? 'text-green-400' : 'text-gray-600'}`}>{tp.label}</span>
                            <span className={`text-[8px] font-mono ${tp.hit ? 'text-white' : 'text-text-muted/40'}`}>{formatPrice(tp.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Action Plan */}
              <div className="lg:col-span-5 rounded-xl p-4 relative overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${accentColor}10` }}>
                <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: accentColor }} />

                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-3.5 h-3.5" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <h3 className="text-white text-[10px] font-bold tracking-widest uppercase">Action Plan</h3>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg p-2.5" style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}10` }}>
                    <p className="text-white text-[11px] font-semibold leading-relaxed">
                      If $BTCDOM is rising, <span className="text-red-400 font-bold">SELL your altcoins</span>.
                    </p>
                    <p className="text-text-muted text-[9px] mt-1">
                      BTC absorbs market liquidity. Even if BTC dumps, altcoins might dump much harder.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-3.5 h-3.5 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2 h-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <p className="text-white text-[9px] font-bold uppercase tracking-wider">Risk Management</p>
                      <p className="text-text-muted text-[9px]">Reduce position sizes drastically. Keep assets in liquid funds (USDT).</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-3.5 h-3.5 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2 h-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </div>
                    <div>
                      <p className="text-green-400 text-[9px] font-bold uppercase tracking-wider">Recovery Plan</p>
                      <p className="text-text-muted text-[9px]">Buy back when reversal signs appear, or repurpose funds for high-probability setups.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BtcDomAlert;