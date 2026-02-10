import { useState, useEffect } from 'react';

const API_BASE = '/api/v1';

const BitcoinPage = () => {
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState({ technical: null, network: null, onchain: null, news: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newsPage, setNewsPage] = useState(0);
  const NEWS_PER_PAGE = 12;

  useEffect(() => {
    fetchAll();
    const i1 = setInterval(fetchAll, 60000);
    return () => clearInterval(i1);
  }, []);

  const fetchAll = async () => {
    try {
      setError(null);
      const [btcRes, fullRes] = await Promise.all([
        fetch(`${API_BASE}/market/bitcoin`),
        fetch(`${API_BASE}/market/bitcoin/full`),
      ]);
      if (btcRes.ok) setData(await btcRes.json());
      if (fullRes.ok) {
        const f = await fullRes.json();
        setExtra({ technical: f.technical, network: f.network, onchain: f.onchain, news: f.news });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => { setLoading(true); fetchAll(); }} />;
  if (!data) return null;

  const supplyPct = data.maxSupply > 0 ? (data.circulatingSupply / data.maxSupply) * 100 : 0;
  const { technical, network, onchain, news } = extra;

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes pulseGlow{0%,100%{opacity:.4}50%{opacity:.8}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .hero-glow{position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(247,147,26,.15) 0%,transparent 70%);pointer-events:none;animation:pulseGlow 4s ease-in-out infinite}
        .hero-glow-left{position:absolute;bottom:-30px;left:-30px;width:150px;height:150px;background:radial-gradient(circle,rgba(212,175,55,.08) 0%,transparent 70%);pointer-events:none}
        .card-hover{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .card-hover:hover{transform:translateY(-2px);border-color:rgba(212,175,55,.25);box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(212,175,55,.1)}
        .fade-in{animation:fadeInUp .5s ease-out forwards;opacity:0}
        .fade-in-1{animation-delay:.05s}.fade-in-2{animation-delay:.1s}.fade-in-3{animation-delay:.15s}.fade-in-4{animation-delay:.2s}
        .fear-ring{box-shadow:0 0 20px rgba(239,68,68,.3),inset 0 0 15px rgba(239,68,68,.1)}
        .fear-ring-green{box-shadow:0 0 20px rgba(34,197,94,.3),inset 0 0 15px rgba(34,197,94,.1)}
        .fear-ring-lime{box-shadow:0 0 20px rgba(132,204,22,.3),inset 0 0 15px rgba(132,204,22,.1)}
        .fear-ring-orange{box-shadow:0 0 20px rgba(249,115,22,.3),inset 0 0 15px rgba(249,115,22,.1)}
        .btc-icon-glow{box-shadow:0 0 30px rgba(247,147,26,.4),0 8px 25px rgba(247,147,26,.2)}
        .price-glow{text-shadow:0 0 40px rgba(255,255,255,.1)}
        .supply-bar-glow{box-shadow:0 0 12px rgba(247,147,26,.4),0 0 4px rgba(212,175,55,.6)}
        .ath-gradient{background:linear-gradient(135deg,rgba(212,175,55,.05) 0%,rgba(247,147,26,.03) 100%)}
        .news-featured:hover .news-img{transform:scale(1.05)}
        .news-img{transition:transform .5s cubic-bezier(.4,0,.2,1)}
      `}</style>

      {/* ── HERO ── */}
      <div className="relative glass-card rounded-2xl p-6 border border-gold-primary/15 overflow-hidden fade-in">
        <div className="hero-glow" />
        <div className="hero-glow-left" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 rounded-2xl flex items-center justify-center btc-icon-glow">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M14.24 10.56C13.93 8.7 12.07 8.5 10.7 8.35L10.36 6.8l-.93.23.33 1.5s.7-.18.69-.17c.38-.1.56.14.63.33l.86 3.95c.03.04 0 .12-.12.16l-.7.17.24 1.1 1.58-.39-.01.01 1.1-.28-.35-1.55c.27-.07.54-.14.81-.22 1.35-.42 2.22-1.2 1.85-2.85zm-2.45 2.16l-.5-2.28c.72-.18 2.34-.72 2.68.84.35 1.61-1.46 1.26-2.18 1.44zm-.9-4.14l-.44-2.01c.6-.15 1.95-.62 2.24.72.3 1.38-1.2 1.12-1.8 1.29zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-display font-bold text-white tracking-tight">Bitcoin</h1>
                <span className="px-2 py-0.5 bg-gradient-to-r from-gold-primary/25 to-orange-500/15 text-gold-primary text-[10px] font-bold rounded-md border border-gold-primary/20">Rank #{data.marketCapRank}</span>
              </div>
              <p className="text-text-muted text-xs mt-0.5 tracking-wide">BTC · Bitcoin Network</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-display font-bold text-white price-glow tracking-tight">${data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <div className="flex items-center gap-1.5 justify-end mt-1.5">
              <PriceBadge label="24h" value={data.priceChange24h} />
              <PriceBadge label="7d" value={data.priceChange7d} />
              <PriceBadge label="30d" value={data.priceChange30d} />
            </div>
          </div>
        </div>
      </div>

      {/* ── KEY METRICS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="24H Range" value={`$${fmtNum(data.low24h)} – $${fmtNum(data.high24h)}`} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>} iconColor="text-blue-400" iconBg="from-blue-500/10 to-blue-600/5" delay="1" />
        <MetricCard label="Market Cap" value={`$${fmtLarge(data.marketCap)}`} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} iconColor="text-green-400" iconBg="from-green-500/10 to-green-600/5" delay="2" />
        <MetricCard label="24H Volume" value={`$${fmtLarge(data.volume24h)}`} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>} iconColor="text-purple-400" iconBg="from-purple-500/10 to-purple-600/5" delay="3" />
        <MetricCard label="BTC Dominance" value={`${data.dominance?.toFixed(1)}%`} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>} iconColor="text-yellow-400" iconBg="from-yellow-500/10 to-yellow-600/5" delay="4" />
      </div>

      {/* ── SUPPLY / ATH / FEAR & GREED ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Supply */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10 card-hover fade-in fade-in-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />
          <p className="text-text-muted text-[10px] uppercase tracking-widest mb-3 font-semibold">Supply</p>
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-text-muted text-xs">Circulating</span><span className="text-white font-mono text-sm font-semibold">{(data.circulatingSupply / 1e6).toFixed(2)}M</span></div>
            <div className="flex justify-between"><span className="text-text-muted text-xs">Max Supply</span><span className="text-white font-mono text-sm font-semibold">21M</span></div>
            <div className="relative mt-3">
              <div className="w-full bg-white/5 rounded-full h-2.5"><div className="bg-gradient-to-r from-orange-500 via-orange-400 to-gold-primary h-2.5 rounded-full supply-bar-glow transition-all duration-1000" style={{ width: `${supplyPct}%` }} /></div>
              <div className="flex justify-between mt-1.5">
                <span className="text-text-muted text-[9px]">0%</span>
                <span className="text-orange-400/80 text-[10px] font-bold">{supplyPct.toFixed(2)}% mined</span>
                <span className="text-text-muted text-[9px]">100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ATH */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10 card-hover fade-in fade-in-2 relative overflow-hidden ath-gradient">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
          <p className="text-text-muted text-[10px] uppercase tracking-widest mb-2 font-semibold">All-Time High</p>
          <p className="text-2xl font-display font-bold text-white tracking-tight">${data.ath?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${data.athChange >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">{data.athChange >= 0 ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />}</svg>
              {Math.abs(data.athChange)?.toFixed(2)}%
            </div>
            <span className="text-text-muted text-[10px]">from ATH</span>
          </div>
        </div>

        {/* Fear & Greed */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10 card-hover fade-in fade-in-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-text-muted text-[10px] uppercase tracking-widest mb-3 font-semibold">Fear & Greed Index</p>
          <div className="flex items-center gap-4">
            {(() => {
              const v = data.fearGreed?.value ?? 0;
              const ring = v >= 75 ? 'fear-ring-green' : v >= 50 ? 'fear-ring-lime' : v >= 25 ? 'fear-ring-orange' : 'fear-ring';
              const bg = v >= 75 ? 'from-green-500 to-green-600' : v >= 50 ? 'from-lime-500 to-lime-600' : v >= 25 ? 'from-orange-500 to-orange-600' : 'from-red-500 to-red-600';
              return <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white bg-gradient-to-br ${bg} ${ring}`}>{v}</div>;
            })()}
            <div>
              <p className="text-white font-bold text-base">{data.fearGreed?.label}</p>
              <p className="text-text-muted text-[10px] mt-0.5">Current market sentiment</p>
              <div className="flex items-center gap-0.5 mt-1.5">
                {[...Array(10)].map((_, i) => {
                  const v = data.fearGreed?.value ?? 0;
                  const active = i < Math.ceil(v / 10);
                  const c = v >= 75 ? 'bg-green-500' : v >= 50 ? 'bg-lime-500' : v >= 25 ? 'bg-orange-500' : 'bg-red-500';
                  return <div key={i} className={`w-2.5 h-1 rounded-full ${active ? c : 'bg-white/10'}`} />;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TECHNICAL + NETWORK/ONCHAIN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Technical Analysis */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-white font-semibold text-base">Technical Analysis</h3><p className="text-text-muted text-[10px] mt-0.5">RSI · MACD · Bollinger · EMA</p></div>
            {technical?.summary && <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${technical.summary.includes('Strong Buy') ? 'bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,.15)]' : technical.summary.includes('Buy') ? 'bg-green-500/15 text-green-400 border border-green-500/25' : technical.summary.includes('Strong Sell') ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,.15)]' : technical.summary.includes('Sell') ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25'}`}>{technical.summary}</span>}
          </div>
          {!technical ? <EmptyState text="Loading technical data..." /> : (
            <div className="space-y-3">
              {/* RSI */}
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mb-2 font-semibold">RSI (14)</p>
                <div className="grid grid-cols-3 gap-2">
                  {['1h', '4h', '1d'].map(tf => {
                    const d = technical.timeframes?.[tf]; if (!d) return <div key={tf} className="bg-white/[0.02] rounded-lg p-2.5 text-center border border-white/5"><span className="text-text-muted text-[10px]">{tf}</span></div>;
                    const rsi = d.rsi, over = rsi >= 70, under = rsi <= 30;
                    const c = under ? 'text-green-400' : over ? 'text-red-400' : 'text-white';
                    const bc = under ? 'border-green-500/25' : over ? 'border-red-500/25' : 'border-white/5';
                    const bgc = under ? 'bg-green-500/[0.06]' : over ? 'bg-red-500/[0.06]' : 'bg-white/[0.02]';
                    return (<div key={tf} className={`rounded-lg p-2.5 text-center border ${bc} ${bgc}`}><p className="text-text-muted text-[10px] mb-0.5 font-medium">{tf.toUpperCase()}</p><p className={`text-lg font-bold font-mono ${c}`}>{rsi?.toFixed(1)}</p><p className={`text-[8px] font-bold uppercase tracking-wide ${c}`}>{under ? 'Oversold' : over ? 'Overbought' : 'Neutral'}</p></div>);
                  })}
                </div>
              </div>
              {/* MACD */}
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mb-2 font-semibold">MACD (12,26,9)</p>
                <div className="grid grid-cols-3 gap-2">
                  {['1h', '4h', '1d'].map(tf => {
                    const d = technical.timeframes?.[tf]?.macd; if (!d) return <div key={tf} className="bg-white/[0.02] rounded-lg p-2.5 text-center border border-white/5"><span className="text-text-muted text-[10px]">{tf}</span></div>;
                    const bull = d.histogram > 0;
                    return (<div key={tf} className={`rounded-lg p-2.5 text-center border ${bull ? 'border-green-500/20 bg-green-500/[0.05]' : 'border-red-500/20 bg-red-500/[0.05]'}`}><p className="text-text-muted text-[10px] mb-0.5 font-medium">{tf.toUpperCase()}</p><p className={`text-sm font-bold ${bull ? 'text-green-400' : 'text-red-400'}`}>{bull ? '▲ Bullish' : '▼ Bearish'}</p><p className="text-text-muted text-[9px] font-mono mt-0.5">H: {d.histogram?.toFixed(1)}</p></div>);
                  })}
                </div>
              </div>
              {/* Bollinger + EMA */}
              <div className="grid grid-cols-2 gap-2">
                {(() => { const bb = technical.timeframes?.['4h']?.bollinger, pos = technical.timeframes?.['4h']?.bb_position; if (!bb) return <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5"><span className="text-text-muted text-[10px]">BB Loading...</span></div>; return (<div className="bg-white/[0.02] rounded-lg p-3 border border-white/5"><p className="text-text-muted text-[10px] uppercase tracking-wider mb-1.5 font-semibold">Bollinger (4H)</p><div className="space-y-1 text-[10px] font-mono"><div className="flex justify-between"><span className="text-red-400/80">Upper</span><span className="text-white">${fmtNum(bb.upper)}</span></div><div className="flex justify-between"><span className="text-yellow-400/80">Mid</span><span className="text-white">${fmtNum(bb.middle)}</span></div><div className="flex justify-between"><span className="text-green-400/80">Lower</span><span className="text-white">${fmtNum(bb.lower)}</span></div></div><div className={`mt-1.5 flex items-center gap-1 text-[9px] font-bold ${pos === 'near_lower' ? 'text-green-400' : pos === 'near_upper' ? 'text-red-400' : 'text-yellow-400'}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{pos === 'near_lower' ? 'Near Lower Band' : pos === 'near_upper' ? 'Near Upper Band' : 'Middle Range'}</div></div>); })()}
                {(() => { const ema = technical.timeframes?.['1d'] || technical.timeframes?.['4h']; if (!ema?.ema50) return <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5"><span className="text-text-muted text-[10px]">EMA Loading...</span></div>; const g = ema.ema_cross === 'golden_cross'; return (<div className={`rounded-lg p-3 border ${g ? 'border-green-500/20 bg-green-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'}`}><p className="text-text-muted text-[10px] uppercase tracking-wider mb-1.5 font-semibold">EMA 50/200 (1D)</p><div className="space-y-1 text-[10px] font-mono"><div className="flex justify-between"><span className="text-cyan-400/80">EMA 50</span><span className="text-white">${fmtNum(ema.ema50)}</span></div><div className="flex justify-between"><span className="text-orange-400/80">EMA 200</span><span className="text-white">${fmtNum(ema.ema200)}</span></div></div><div className={`mt-1.5 flex items-center gap-1 text-[9px] font-bold ${g ? 'text-green-400' : 'text-red-400'}`}><span className="text-sm">✦</span>{g ? 'Golden Cross' : 'Death Cross'}</div></div>); })()}
              </div>
              {/* Signal Meter */}
              {technical.total_signals > 0 && (
                <div className="pt-3 border-t border-white/5">
                  <div className="flex justify-between items-center text-[10px] mb-2"><span className="text-green-400 font-bold">Buy ({technical.buy_signals})</span><span className="text-text-muted text-[9px] uppercase tracking-wider font-semibold">Signal Meter</span><span className="text-red-400 font-bold">Sell ({technical.sell_signals})</span></div>
                  <div className="h-2.5 rounded-full overflow-hidden flex bg-white/5">
                    <div className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-700" style={{ width: `${(technical.buy_signals / technical.total_signals) * 100}%` }} />
                    <div className="h-full bg-gray-600/50 transition-all duration-700" style={{ width: `${((technical.total_signals - technical.buy_signals - technical.sell_signals) / technical.total_signals) * 100}%` }} />
                    <div className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700" style={{ width: `${(technical.sell_signals / technical.total_signals) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Network Health */}
          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
            <h3 className="text-white font-semibold text-base">Network Health</h3>
            <p className="text-text-muted text-[10px] mt-0.5 mb-3">Hashrate · Fees · Mempool · Difficulty</p>
            {!network ? <EmptyState text="Loading network data..." /> : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Hashrate" value={fmtHashrate(network.hashrate)} color="text-cyan-400" />
                  <MiniStat label="Difficulty" value={fmtLarge(network.difficulty)} color="text-purple-400" />
                  <MiniStat label="Block Height" value={network.block_height?.toLocaleString()} color="text-white" />
                  <MiniStat label="Mempool" value={`${(network.mempool?.count || 0).toLocaleString()} tx`} color="text-yellow-400" />
                </div>
                {network.fees && (
                  <div>
                    <p className="text-text-muted text-[10px] uppercase tracking-widest mb-1.5 font-semibold">Fees (sat/vB)</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[{ l: 'Fast', v: network.fees.fastest, c: 'text-red-400', bg: 'bg-red-500/[0.06]', b: 'border-red-500/15' }, { l: '30min', v: network.fees.half_hour, c: 'text-orange-400', bg: 'bg-orange-500/[0.06]', b: 'border-orange-500/15' }, { l: '1hr', v: network.fees.hour, c: 'text-yellow-400', bg: 'bg-yellow-500/[0.06]', b: 'border-yellow-500/15' }, { l: 'Eco', v: network.fees.economy, c: 'text-green-400', bg: 'bg-green-500/[0.06]', b: 'border-green-500/15' }].map(f => (
                        <div key={f.l} className={`${f.bg} rounded-lg p-2 text-center border ${f.b}`}><p className="text-text-muted text-[9px]">{f.l}</p><p className={`text-sm font-bold font-mono ${f.c}`}>{f.v}</p></div>
                      ))}
                    </div>
                  </div>
                )}
                {network.difficulty_adjustment && (
                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                    <div className="flex justify-between items-center text-[10px] mb-2"><span className="text-text-muted uppercase tracking-wider font-semibold">Next Difficulty Adj.</span><span className={`font-bold ${network.difficulty_adjustment.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{network.difficulty_adjustment.change >= 0 ? '+' : ''}{network.difficulty_adjustment.change}%</span></div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 transition-all duration-700" style={{ width: `${network.difficulty_adjustment.progress}%` }} /></div>
                    <div className="flex justify-between text-[9px] text-text-muted mt-1.5"><span>{network.difficulty_adjustment.progress}% complete</span><span>{network.difficulty_adjustment.remaining_blocks} blocks left</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* On-Chain */}
          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green-500/20 to-transparent" />
            <h3 className="text-white font-semibold text-base">On-Chain Metrics</h3>
            <p className="text-text-muted text-[10px] mt-0.5 mb-3">MVRV · NVT · Addresses · Transactions</p>
            {!onchain ? <EmptyState text="Loading on-chain data..." /> : (
              <div className="grid grid-cols-2 gap-2">
                {onchain.mvrv && <OnChainCard label="MVRV Ratio" value={onchain.mvrv.value?.toFixed(2)} change={onchain.mvrv.change_7d} hint={onchain.mvrv.value > 3.5 ? 'Overvalued' : onchain.mvrv.value < 1 ? 'Undervalued' : 'Fair Value'} hintColor={onchain.mvrv.value > 3.5 ? 'text-red-400' : onchain.mvrv.value < 1 ? 'text-green-400' : 'text-yellow-400'} />}
                {onchain.nvt && <OnChainCard label="NVT Signal" value={onchain.nvt.value?.toFixed(1)} change={onchain.nvt.change_7d} hint={onchain.nvt.value > 150 ? 'Overvalued' : onchain.nvt.value < 45 ? 'Undervalued' : 'Normal'} hintColor={onchain.nvt.value > 150 ? 'text-red-400' : onchain.nvt.value < 45 ? 'text-green-400' : 'text-yellow-400'} />}
                {onchain.active_addresses && <OnChainCard label="Active Addresses" value={fmtLarge(onchain.active_addresses.value)} change={onchain.active_addresses.change_7d} />}
                {onchain.daily_transactions && <OnChainCard label="Daily TX" value={fmtLarge(onchain.daily_transactions.value)} change={onchain.daily_transactions.change_7d} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── NEWS ── */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <div><h3 className="text-white font-semibold text-base">Latest Bitcoin News</h3><p className="text-text-muted text-[10px] mt-0.5">CoinDesk · CoinTelegraph · Decrypt</p></div>
          {news?.total > 0 && <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-bold rounded-lg border border-orange-500/15">{news.total} articles</span>}
        </div>
        {!news?.articles?.length ? <EmptyState text="Loading news..." /> : (() => {
          const restArticles = news.articles.slice(2);
          const totalPages = Math.ceil(restArticles.length / NEWS_PER_PAGE);
          const pagedArticles = restArticles.slice(newsPage * NEWS_PER_PAGE, (newsPage + 1) * NEWS_PER_PAGE);

          return (
            <div className="space-y-3">
              {/* Featured - top 2 */}
              {newsPage === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {news.articles.slice(0, 2).map((a, i) => (
                    <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" className="group block news-featured">
                      <div className="bg-white/[0.02] rounded-xl overflow-hidden border border-white/5 hover:border-gold-primary/25 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,.3)] h-full">
                        {a.image ? (
                          <div className="w-full h-40 overflow-hidden"><img src={a.image} alt="" className="w-full h-full object-cover news-img" onError={e => { e.target.parentElement.style.display = 'none'; }} /></div>
                        ) : (
                          <div className="w-full h-40 bg-gradient-to-br from-orange-500/10 to-orange-900/10 flex items-center justify-center"><span className="text-5xl opacity-20">₿</span></div>
                        )}
                        <div className="p-4">
                          <p className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug">{a.title}</p>
                          <p className="text-text-muted text-[11px] mt-1.5 line-clamp-2 leading-relaxed">{a.description}</p>
                          <div className="flex items-center gap-2 mt-2.5">
                            <span className="text-gold-primary text-[10px] font-bold">{a.source}</span>
                            {a.author && <span className="text-text-muted text-[10px]">· {a.author}</span>}
                            <span className="text-text-muted text-[10px]">· {a.time_ago}</span>
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Paged compact list */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {pagedArticles.map((a, i) => (
                  <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" className="group block">
                    <div className="flex gap-3 bg-white/[0.015] rounded-lg overflow-hidden border border-white/5 hover:border-gold-primary/20 transition-all duration-300 h-full">
                      {a.image ? (
                        <div className="w-[72px] h-[72px] flex-shrink-0 overflow-hidden">
                          <img src={a.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-gray-700/20 to-gray-800/20 flex items-center justify-center"><span class="text-base text-white/10">₿</span></div>'; }} />
                        </div>
                      ) : (
                        <div className="w-[72px] h-[72px] flex-shrink-0 bg-gradient-to-br from-gray-700/15 to-gray-800/15 flex items-center justify-center">
                          <span className="text-base text-white/10">₿</span>
                        </div>
                      )}
                      <div className="py-2 pr-3 flex flex-col justify-center min-w-0">
                        <p className="text-white text-[11px] font-semibold group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug">{a.title}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-gold-primary text-[9px] font-bold">{a.source}</span>
                          <span className="text-text-muted text-[9px]">· {a.time_ago}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <button onClick={() => setNewsPage(p => Math.max(0, p - 1))} disabled={newsPage === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${newsPage === 0 ? 'text-text-muted/30 cursor-not-allowed' : 'text-gold-primary hover:bg-gold-primary/10 border border-gold-primary/20'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button key={i} onClick={() => setNewsPage(i)}
                        className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${i === newsPage ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30' : 'text-text-muted hover:text-white hover:bg-white/5'}`}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setNewsPage(p => Math.min(totalPages - 1, p + 1))} disabled={newsPage === totalPages - 1}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${newsPage === totalPages - 1 ? 'text-text-muted/30 cursor-not-allowed' : 'text-gold-primary hover:bg-gold-primary/10 border border-gold-primary/20'}`}>
                    Next
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

/* ── SUB COMPONENTS ── */
const PriceBadge = ({ label, value }) => { if (value == null) return null; const p = value >= 0; return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${p ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-red-500/15 text-red-400 border-red-500/20'}`}>{label}: {p ? '+' : ''}{value?.toFixed(2)}%</span>; };

const MetricCard = ({ label, value, icon, iconColor, iconBg, delay }) => (
  <div className={`glass-card rounded-xl p-4 border border-gold-primary/10 card-hover fade-in fade-in-${delay} relative overflow-hidden`}>
    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    <div className="flex items-center justify-between mb-2"><p className="text-text-muted text-[10px] uppercase tracking-widest font-semibold">{label}</p><div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${iconBg} flex items-center justify-center ${iconColor}`}>{icon}</div></div>
    <p className="text-white font-bold text-sm">{value}</p>
  </div>
);

const MiniStat = ({ label, value, color = 'text-white' }) => (<div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5"><p className="text-text-muted text-[9px] uppercase tracking-wider font-semibold">{label}</p><p className={`text-sm font-bold font-mono ${color} mt-0.5`}>{value || '-'}</p></div>);

const OnChainCard = ({ label, value, change, hint, hintColor = 'text-text-muted' }) => (<div className="bg-white/[0.02] rounded-lg p-3 border border-white/5"><p className="text-text-muted text-[9px] uppercase tracking-wider font-semibold mb-0.5">{label}</p><p className="text-white text-base font-bold font-mono">{value ?? '-'}</p><div className="flex items-center gap-1.5 mt-1">{change != null && <span className={`text-[9px] font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% 7d</span>}{hint && <span className={`text-[9px] ${hintColor}`}>· {hint}</span>}</div></div>);

const EmptyState = ({ text }) => (<div className="flex items-center justify-center py-8"><div className="flex items-center gap-2 text-text-muted text-xs"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{text}</div></div>);

const ErrorState = ({ error, onRetry }) => (<div className="space-y-6"><div className="flex items-center gap-3"><div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" /><h2 className="font-display text-2xl font-semibold text-white">Bitcoin</h2></div><div className="glass-card rounded-xl p-8 border border-red-500/30 text-center"><div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center"><svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg></div><p className="text-red-400 mb-4 text-sm">{error}</p><button onClick={onRetry} className="px-5 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm font-semibold border border-gold-primary/20">Retry</button></div></div>);

const LoadingSkeleton = () => (<div className="space-y-5"><style>{`@keyframes sp{0%,100%{opacity:.05}50%{opacity:.15}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(212,175,55,.1);border-radius:8px}`}</style><div className="glass-card rounded-2xl p-6 border border-gold-primary/10"><div className="flex justify-between items-center"><div className="flex items-center gap-4"><div className="skel w-14 h-14 rounded-2xl" /><div><div className="skel w-32 h-6 mb-2" /><div className="skel w-16 h-3" /></div></div><div><div className="skel w-48 h-8 mb-2" /><div className="skel w-40 h-4 ml-auto" /></div></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="glass-card rounded-xl p-4 border border-gold-primary/10"><div className="skel w-20 h-3 mb-3" /><div className="skel w-28 h-5" /></div>)}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <div key={i} className="glass-card rounded-xl p-5 h-32 border border-gold-primary/10"><div className="skel w-16 h-3 mb-3" /><div className="skel w-full h-6 mb-2" /><div className="skel w-3/4 h-4" /></div>)}</div><div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="glass-card rounded-xl p-5 h-80 border border-gold-primary/10" /><div className="glass-card rounded-xl p-5 h-80 border border-gold-primary/10" /></div></div>);

/* ── HELPERS ── */
function fmtNum(n) { if (!n) return '0'; return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function fmtLarge(n) { if (!n) return '0'; if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`; if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`; if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`; if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`; return n.toLocaleString(); }
function fmtHashrate(h) { if (!h) return '-'; if (h >= 1e18) return `${(h / 1e18).toFixed(1)} EH/s`; if (h >= 1e15) return `${(h / 1e15).toFixed(1)} PH/s`; if (h >= 1e12) return `${(h / 1e12).toFixed(1)} TH/s`; return `${(h / 1e9).toFixed(1)} GH/s`; }

export default BitcoinPage;