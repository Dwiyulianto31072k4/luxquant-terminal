import { useMemo } from 'react';

/**
 * BTC Dominance Alert Banner
 * Premium UI/UX: Polished BTC logo, exact + relative timestamps ("ago"),
 * prominent "Get to know" button, and elegant compact layout.
 */
const BtcDomAlert = ({ allSignals, onSignalClick }) => {
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

  const getStatusInfo = (status) => {
    const map = {
      'open': { label: 'OPEN', color: 'text-gray-300 bg-white/5 border-white/10', textColor: 'text-white' },
      'tp1': { label: 'TP1', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400' },
      'tp2': { label: 'TP2', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400' },
      'tp3': { label: 'TP3', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400' },
      'closed_win': { label: 'TP4', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400' },
      'tp4': { label: 'TP4', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400' },
      'closed_loss': { label: 'STOPPED', color: 'text-red-400 bg-red-500/10 border-red-500/20', textColor: 'text-red-400' },
      'sl': { label: 'STOPPED', color: 'text-red-400 bg-red-500/10 border-red-500/20', textColor: 'text-red-400' },
    };
    return map[status] || { label: status?.toUpperCase(), color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', textColor: 'text-gray-400' };
  };

  const statusInfo = getStatusInfo(btcdomSignal.status);

  // Styling Alert Border & Glow
  const alertBorder = isWinning ? 'border-amber-500/30' : isLoss ? 'border-red-500/30' : 'border-amber-500/20';
  const glowEffect = isWinning ? 'hover:shadow-[0_8px_30px_rgba(245,158,11,0.08)]' : isLoss ? 'hover:shadow-[0_8px_30px_rgba(239,68,68,0.05)]' : 'hover:shadow-[0_8px_30px_rgba(245,158,11,0.05)]';

  const tpLevels = [
    { label: 'TP1', value: btcdomSignal.target1, hit: ['tp1','tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP2', value: btcdomSignal.target2, hit: ['tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP3', value: btcdomSignal.target3, hit: ['tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP4', value: btcdomSignal.target4, hit: ['closed_win','tp4'].includes(btcdomSignal.status) },
  ].filter(tp => tp.value);

  const hitCount = tpLevels.filter(tp => tp.hit).length;
  const progressWidth = tpLevels.length > 1 ? `${(hitCount / (tpLevels.length - 1)) * 100}%` : '0%';

  // --- TIME FORMATTERS ---
  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const diffMs = new Date() - new Date(dt);
    if (diffMs < 0) return 'just now';
    const diffMins = Math.floor(diffMs / 60000), diffHours = Math.floor(diffMins / 60), diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
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

  return (
    <div 
      onClick={() => onSignalClick && onSignalClick(btcdomSignal)}
      className={`group relative rounded-2xl border ${alertBorder} bg-[#0a0a0a] overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${glowEffect} mb-6`}
    >
      {/* Subtle Inner Glow */}
      <div className={`absolute top-0 left-0 w-full h-[1px] ${isLoss ? 'bg-gradient-to-r from-transparent via-red-500/50 to-transparent' : 'bg-gradient-to-r from-transparent via-amber-500/50 to-transparent'}`} />

      {/* === HEADER BAR === */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-5 py-3 border-b border-white/5 bg-[#111]/50 gap-4">
        
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h3 className="text-amber-500 font-bold text-xs tracking-widest uppercase flex items-center gap-2">
            BTC Dominance Alert
          </h3>
        </div>
        
        {/* Timestamps (Exact + Ago) & Badge */}
        <div className="flex items-center flex-wrap justify-end gap-3 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-right">
            <span className="text-[10px] text-text-muted truncate">
              Called: <strong className="text-white font-mono">{formatExactTime(btcdomSignal.created_at)}</strong> <span className="text-text-muted/70 font-normal ml-0.5">({formatTimeAgo(btcdomSignal.created_at)})</span>
            </span>
            {btcdomSignal.last_update_at && (
              <>
                <span className="hidden sm:inline text-white/20">•</span>
                <span className="text-[10px] text-text-muted truncate">
                  Update: <strong className={`${statusInfo.textColor} font-mono`}>{formatExactTime(btcdomSignal.last_update_at)}</strong> <span className="text-text-muted/70 font-normal ml-0.5">({formatTimeAgo(btcdomSignal.last_update_at)})</span>
                </span>
              </>
            )}
          </div>
          <div className="h-5 w-px bg-white/10 hidden sm:block"></div>
          <span className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border flex items-center gap-1.5 ${statusInfo.color}`}>
            {statusInfo.label} {['open', 'closed_loss', 'sl'].includes(btcdomSignal.status) ? '' : 'HIT'}
          </span>
          <span className="text-white/20 group-hover:text-white/60 transition-transform duration-300 group-hover:translate-x-1 transform inline-block text-xs">➔</span>
        </div>
      </div>

      {/* === BODY CONTENT === */}
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          
          {/* LEFT SIDE: Data & Tracker (Col-Span 7) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* Top Section: Coin Info + Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Coin Logo & Title */}
              <div className="flex items-center gap-3">
                {/* LOGO BTC ASLI - IMPROVED (Gradient & Inner Shadow) */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f7931a] to-[#e68a15] flex items-center justify-center p-1.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),0_0_10px_rgba(247,147,26,0.2)]">
                  <svg className="w-full h-full text-white drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24"><path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.686-2.583c.39-2.55-1.638-3.54-3.79-3.953l.794-3.193-1.928-.48-.777 3.11c-.506-.126-1.026-.245-1.54-.366l.786-3.14-1.927-.48-.795 3.187c-.422-.1-.826-.2-1.218-.306l.002-.01-2.675-.664-.516 2.08s1.44.33 1.41.35c.787.196.93.71.906 1.116l-1.002 4.024c.057.014.13.033.22.062l-.224-.055-1.406 5.642c-.07.195-.262.49-1.002.308.02.02-1.41-.35-1.41-.35l-1.056 2.22 2.518.626c.47.117.935.24 1.396.355l-.797 3.2 1.927.48.788-3.167c.52.138 1.028.266 1.527.388l-.79 3.18 1.928.48.805-3.235c2.72.51 4.773.305 5.632-2.146.69-1.97-.024-3.1-1.472-3.844 1.05-.244 1.838-.89 2.054-2.27zM14.73 17.5c-.792 3.18-6.14 1.536-7.87.106l1.396-5.61c1.734 1.43 7.276 2.296 6.474 5.504z" /></svg>
                </div>
                <div>
                  <h4 className="text-white text-lg font-bold">BTCDOMUSDT</h4>
                  <p className="text-text-muted text-[10px]">Dominance Index</p>
                </div>
              </div>

              {/* TOMBOL GET TO KNOW */}
              <a 
                href="https://www.binance.com/en/support/faq/what-is-bitcoin-dominance-btcdom-e3b1ab97a3e24df4b0e41a469ccf7a21" 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-text-muted hover:text-white hover:bg-white/10 transition-all text-[10px] font-medium shrink-0"
              >
                <span>Get to know</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>

            {/* Stats Mini Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#111] rounded-lg border border-white/5 p-2 flex flex-col justify-center">
                <span className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">Entry Price</span>
                <span className="text-white font-mono text-sm font-bold">{formatPrice(btcdomSignal.entry)}</span>
              </div>
              <div className="bg-[#111] rounded-lg border border-white/5 p-2 flex flex-col justify-center">
                <span className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">Stop Loss</span>
                <span className="text-red-400 font-mono text-sm font-bold">{formatPrice(btcdomSignal.stop1)}</span>
              </div>
              <div className="bg-[#111] rounded-lg border border-white/5 p-2 flex flex-col justify-center">
                <span className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">Risk Level</span>
                <span className={`text-sm font-bold ${
                  btcdomSignal.risk_level?.toLowerCase().startsWith('low') ? 'text-green-400' :
                  btcdomSignal.risk_level?.toLowerCase().startsWith('high') ? 'text-red-400' : 'text-amber-400'
                }`}>{btcdomSignal.risk_level || 'Normal'}</span>
              </div>
            </div>

            {/* Target Progress Tracker */}
            {tpLevels.length > 0 && (
              <div className="mt-auto pt-2">
                <div className="flex items-center justify-between mb-3">
                   <p className="text-text-muted text-[10px] uppercase tracking-wider">Target Journey</p>
                </div>
                
                <div className="relative w-full max-w-xl mx-auto sm:mx-0">
                  <div className="absolute top-[5px] left-0 w-full h-[2px] bg-white/5 rounded-full z-0" />
                  <div 
                    className="absolute top-[5px] left-0 h-[2px] bg-green-500 rounded-full transition-all duration-1000 z-0 shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
                    style={{ width: progressWidth }} 
                  />
                  
                  <div className="relative flex justify-between items-start z-10 w-full">
                    {tpLevels.map((tp, idx) => (
                      <div key={idx} className="flex flex-col items-center group/node">
                        <div className={`w-3 h-3 rounded-full outline outline-4 outline-[#0a0a0a] transition-colors duration-500 ${tp.hit ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-gray-700'}`} />
                        <div className="mt-2 flex flex-col items-center text-center">
                          <span className={`text-[10px] font-bold ${tp.hit ? 'text-green-400' : 'text-gray-500'}`}>{tp.label}</span>
                          <span className={`text-[9px] font-mono mt-0.5 ${tp.hit ? 'text-white' : 'text-text-muted/50'}`}>{formatPrice(tp.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Market Rules (Col-Span 5) */}
          <div className="lg:col-span-5 bg-[#111] rounded-xl border border-amber-500/15 p-4 sm:p-5 relative overflow-hidden flex flex-col h-full">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${isLoss ? 'bg-red-500' : 'bg-amber-500'}`} />

            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <h3 className="text-white text-[11px] font-bold tracking-widest uppercase">Action Plan</h3>
            </div>

            <div className="space-y-4 flex-1 flex flex-col justify-center">
              {/* Alert Box */}
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                <p className="text-white text-xs font-semibold leading-relaxed">
                  If $BTCDOM is rising, <strong className="text-red-400">SELL your altcoins</strong>.
                </p>
                <p className="text-text-muted text-[10px] mt-1.5 leading-snug">
                  BTC absorbs market liquidity. Even if BTC dumps, Altcoins might dump much harder.
                </p>
              </div>

              {/* Rules List */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                   <svg className="w-2.5 h-2.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                </div>
                <div>
                  <p className="text-white text-[10px] font-bold uppercase tracking-wider mb-0.5">Risk Management</p>
                  <p className="text-text-muted text-[10px] leading-snug">Reduce position sizes drastically. Keep assets in liquid funds (USDT).</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                   <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <div>
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Recovery Plan</p>
                  <p className="text-text-muted text-[10px] leading-snug">Buy back when reversal signs appear, or repurpose funds for high-probability setups.</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default BtcDomAlert;