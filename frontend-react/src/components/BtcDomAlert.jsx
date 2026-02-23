import { useMemo } from 'react';

/**
 * BTC Dominance Alert Banner
 * Redesigned to include exact timestamps + relative time in a single row,
 * exact LuxQuant Risk Management rules, and Recovery Plan.
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
      'open': { label: 'OPEN', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', textColor: 'text-cyan-400', icon: '🔵' },
      'tp1': { label: 'TP1', color: 'text-green-400 bg-green-500/10 border-green-500/20', textColor: 'text-green-400', icon: '✅' },
      'tp2': { label: 'TP2', color: 'text-lime-400 bg-lime-500/10 border-lime-500/20', textColor: 'text-lime-400', icon: '✅' },
      'tp3': { label: 'TP3', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', textColor: 'text-yellow-400', icon: '✅' },
      'closed_win': { label: 'TP4', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', textColor: 'text-orange-400', icon: '🏆' },
      'tp4': { label: 'TP4', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', textColor: 'text-orange-400', icon: '🏆' },
      'closed_loss': { label: 'STOPPED', color: 'text-red-400 bg-red-500/10 border-red-500/20', textColor: 'text-red-400', icon: '✗' },
      'sl': { label: 'STOPPED', color: 'text-red-400 bg-red-500/10 border-red-500/20', textColor: 'text-red-400', icon: '✗' },
    };
    return map[status] || { label: status?.toUpperCase(), color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', textColor: 'text-gray-400', icon: '—' };
  };

  const statusInfo = getStatusInfo(btcdomSignal.status);

  const alertBorder = isWinning ? 'border-amber-500/30' : isLoss ? 'border-green-500/20' : 'border-amber-500/20';
  const glowEffect = isWinning ? 'hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]' : 'hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]';

  const tpLevels = [
    { label: 'TP1', value: btcdomSignal.target1, hit: ['tp1','tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP2', value: btcdomSignal.target2, hit: ['tp2','tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP3', value: btcdomSignal.target3, hit: ['tp3','closed_win','tp4'].includes(btcdomSignal.status) },
    { label: 'TP4', value: btcdomSignal.target4, hit: ['closed_win','tp4'].includes(btcdomSignal.status) },
  ].filter(tp => tp.value);

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const diffMs = new Date() - new Date(dt);
    if (diffMs < 0) return 'just now';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

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
      className={`group relative rounded-2xl border ${alertBorder} bg-bg-primary/40 backdrop-blur-md overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-1 ${glowEffect}`}
    >
      {/* Dynamic Background Gradient */}
      <div className={`absolute inset-0 opacity-20 pointer-events-none transition-opacity duration-500 group-hover:opacity-40 ${
        isWinning ? 'bg-gradient-to-br from-amber-500/20 via-orange-500/5 to-transparent' : 
        isLoss ? 'bg-gradient-to-br from-green-500/10 to-transparent' : 'bg-gradient-to-br from-amber-500/10 to-transparent'
      }`} />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between px-5 py-3 border-b border-white/5 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)] flex-shrink-0">
            ⚠️
          </div>
          <div>
            <h3 className="text-amber-400 font-bold text-sm tracking-widest uppercase">BTC Dominance Alert</h3>
            <p className="text-text-muted text-[10px] mt-0.5">Automated Risk Management Signal</p>
          </div>
        </div>
        
        {/* Timestamps Section - NOW IN A SINGLE ROW WITH BACKGROUND */}
        <div className="flex items-center flex-wrap justify-end gap-3 sm:ml-auto">
          
          <div className="flex items-center flex-wrap gap-2.5 bg-black/20 border border-white/5 px-3.5 py-1.5 rounded-lg shadow-inner">
            <span className="text-[10px] text-text-muted">
              Called on <strong className="text-white font-mono font-medium">{formatExactTime(btcdomSignal.created_at)}</strong> <span className="text-text-muted/60">({formatTimeAgo(btcdomSignal.created_at)})</span>
            </span>
            
            {btcdomSignal.last_update_at && (
              <>
                <div className="w-px h-3.5 bg-white/15"></div>
                <span className="text-[10px] text-text-muted">
                  Last hit <strong className={`${statusInfo.textColor} font-bold`}>{statusInfo.label}</strong> at <strong className="text-white font-mono font-medium">{formatExactTime(btcdomSignal.last_update_at)}</strong> <span className="text-text-muted/60">({formatTimeAgo(btcdomSignal.last_update_at)})</span>
                </span>
              </>
            )}
          </div>

          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <span className={`border px-3 py-1 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1.5 ${statusInfo.color}`}>
              {statusInfo.icon} {statusInfo.label} HIT
            </span>
            <span className="text-amber-500/50 group-hover:text-amber-400 transition-colors duration-300 group-hover:translate-x-1 transform inline-block">
              ➔
            </span>
          </div>
        </div>
      </div>

      {/* Body Content */}
      <div className="relative p-5">
        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Left Side: Stats */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/5 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h4 className="text-white text-lg font-bold">BTCDOMUSDT</h4>
                <p className="text-text-muted text-xs">Bitcoin Dominance Index</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mb-6">
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Entry Price</p>
                <p className="text-white font-mono text-base">{formatPrice(btcdomSignal.entry)}</p>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-red-400/70 text-[10px] uppercase tracking-wider mb-1">Stop Loss</p>
                <p className="text-red-400 font-mono text-base">{formatPrice(btcdomSignal.stop1)}</p>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Risk Level</p>
                <p className={`text-sm font-semibold mt-0.5 ${
                  btcdomSignal.risk_level?.toLowerCase().startsWith('low') ? 'text-green-400' :
                  btcdomSignal.risk_level?.toLowerCase().startsWith('high') ? 'text-red-400' : 'text-yellow-400'
                }`}>{btcdomSignal.risk_level || 'Normal'}</p>
              </div>
            </div>

            {/* Stepper / Timeline for TP */}
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-2">Target Progress</p>
              <div className="flex items-center w-full gap-1">
                {tpLevels.map((tp, i) => (
                  <div key={i} className="flex-1 flex flex-col gap-1">
                    <div className={`h-1.5 rounded-full transition-colors ${
                      tp.hit ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-white/5'
                    }`} />
                    <div className="flex justify-between items-center px-1">
                      <span className={`text-[9px] font-bold ${tp.hit ? 'text-green-400' : 'text-text-muted/50'}`}>
                        {tp.label}
                      </span>
                      <span className={`font-mono text-[10px] ${tp.hit ? 'text-green-400/80' : 'text-text-muted/40'}`}>
                        {formatPrice(tp.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: LuxQuant Telegram Rules */}
          <div className="lg:w-[380px] rounded-xl bg-white/5 border border-white/5 p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-center">
            <div className={`absolute top-0 left-0 w-1 h-full ${isWinning ? 'bg-amber-500' : isLoss ? 'bg-green-500' : 'bg-amber-500/50'}`} />
            
            <p className="text-white/90 text-[11px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="text-amber-500 text-sm">🛡️</span> LuxQuant Market Rules
            </p>
            
            <div className="space-y-2.5 text-[11px] text-text-muted leading-relaxed">
              <p>
                If <strong className="text-amber-400">$BTCDOM</strong> is called to rise, it's better to <strong className="text-white border-b border-white/30 pb-0.5">sell your altcoins</strong>.
              </p>
              
              <ul className="space-y-2">
                <li className="flex gap-2 items-start">
                  <span className="text-amber-500/70 mt-0.5">•</span>
                  <span>If BTCDOM rises, it doesn't always mean BTC will dump.</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-amber-500/70 mt-0.5">•</span>
                  <span>But if BTC dumps <strong>while BTCDOM also rises</strong>, then it's better to position in BTCDOM.</span>
                </li>
              </ul>

              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="mb-2">
                  <strong className="text-amber-400">Risk Management:</strong> You can still trade, but reduce your position size to ensure you have funds available.
                </p>
                <p>
                  <strong className="text-green-400">Recovery Plan:</strong> Buy back when the market shows signs of recovery, or repurchase sold coins that still have strong upward potential.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BtcDomAlert;