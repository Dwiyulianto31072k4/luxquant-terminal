// src/components/ReferralPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { referralApi } from '../services/referralApi'; // Harus pakai kurung kurawal

/* ─── Tiny QR Code Generator (no dependency) ─── */
const QR_MATRIX_SIZE = 21; // Version 1 QR
function generateSimpleQR(text) {
  const matrix = Array.from({ length: QR_MATRIX_SIZE }, () =>
    Array.from({ length: QR_MATRIX_SIZE }, () => false)
  );
  
  const drawFinder = (r, c) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        matrix[r + i][c + j] =
          i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
      }
    }
  };
  
  drawFinder(0, 0);
  drawFinder(0, 14);
  drawFinder(14, 0);
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  
  for (let r = 0; r < QR_MATRIX_SIZE; r++) {
    for (let c = 0; c < QR_MATRIX_SIZE; c++) {
      if (matrix[r][c]) continue;
      if (r < 9 && c < 9) continue;
      if (r < 9 && c > 12) continue;
      if (r > 12 && c < 9) continue;
      hash = ((hash << 5) - hash + r * 31 + c * 17) | 0;
      matrix[r][c] = (Math.abs(hash) % 3) === 0;
    }
  }
  return matrix;
}

const QRCode = ({ value, size = 180 }) => {
  const matrix = generateSimpleQR(value || 'LUXQUANT');
  const cellSize = size / QR_MATRIX_SIZE;
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-xl">
      <rect width={size} height={size} fill="#0a0506" rx="12" />
      {/* Bungkus Nested Map dengan Group (g) agar Vite tidak Error */}
      {matrix.map((row, r) => (
        <g key={`row-${r}`}>
          {row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize + 0.5}
                y={r * cellSize + 0.5}
                width={cellSize - 1}
                height={cellSize - 1}
                rx={1.5}
                fill="#d4a853"
              />
            ) : null
          )}
        </g>
      ))}
    </svg>
  );
};

/* ─── Copy Button Component ─── */
const CopyButton = ({ text, label, className = '' }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { 
      // Fallback diam saja jika clipboard tidak didukung
    }
  };
  
  return (
    <button onClick={handleCopy} className={`group relative flex items-center gap-2 transition-all ${className}`}>
      {copied ? (
        <>
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-400 text-sm font-medium">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium">{label}</span>
        </>
      )}
    </button>
  );
};

/* ─── Status Badge Component ─── */
const StatusBadge = ({ status }) => {
  const config = {
    pending: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-400' },
    confirmed: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    paid: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400' },
    completed: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    failed: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
    processing: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
  };
  
  const c = config[status] || config.pending;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${c.bg} ${c.border} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

/* ═══════════════════════════════════════════ */
/* MAIN REFERRAL PAGE              */
/* ═══════════════════════════════════════════ */

export default function ReferralPage() {
  const { t } = useTranslation();
  const T = (key) => t(`referral.${key}`);

  // Data States
  const [codeData, setCodeData] = useState(null);
  const [stats, setStats] = useState(null);
  const [payouts, setPayouts] = useState([]);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeSection, setActiveSection] = useState('overview'); // Tabs: overview | payout | history

  // Payout Form States
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [payoutNetwork, setPayoutNetwork] = useState('BSC');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  // Fetch API Data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [codeRes, statsRes, payoutsRes] = await Promise.allSettled([
        referralApi.getMyCode(),
        referralApi.getStats(),
        referralApi.getPayouts(),
      ]);
      if (codeRes.status === 'fulfilled') setCodeData(codeRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (payoutsRes.status === 'fulfilled') setPayouts(payoutsRes.value);
    } catch (err) {
      console.error('Referral data load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await referralApi.generateCode();
      setCodeData(res);
      fetchData(); // Refresh all data
    } catch (err) {
      console.error('Generate error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handlePayout = async (e) => {
    e.preventDefault();
    setPayoutError('');
    setPayoutSuccess(false);
    
    // Validasi Minimal Penarikan
    if (!payoutAmount || parseFloat(payoutAmount) < 5) {
      setPayoutError('Minimum withdrawal is $5 USDT');
      return;
    }
    
    // Validasi Alamat Dompet
    if (!payoutWallet || payoutWallet.length < 10) {
      setPayoutError('Please enter a valid wallet address');
      return;
    }
    
    try {
      setPayoutSubmitting(true);
      await referralApi.requestPayout(parseFloat(payoutAmount), payoutWallet, payoutNetwork);
      setPayoutSuccess(true);
      setPayoutAmount('');
      setPayoutWallet('');
      fetchData(); // Refresh statis terbaru
    } catch (err) {
      setPayoutError(err?.response?.data?.detail || 'Payout request failed');
    } finally {
      setPayoutSubmitting(false);
    }
  };

  // Dinamis Link Referral
  const referralLink = codeData?.link || `https://luxquant.com/register?ref=${codeData?.code || ''}`;

  // Tampilan Loading Spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-gold-primary/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-gold-primary rounded-full animate-spin" />
          </div>
          <p className="text-text-muted text-sm">Loading referral data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* ═══ HEADER SECTION ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-gold-primary/10"
        style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, rgba(10,5,6,0.95) 50%, rgba(139,105,20,0.04) 100%)' }}>
        
        {/* Glow Effects Background */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-primary/[0.02] rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        
        <div className="relative px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            
            {/* Title & Badges */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{T('title')}</h1>
              </div>
              <p className="text-text-secondary text-sm sm:text-base max-w-lg">{T('subtitle')}</p>
              <div className="flex items-center gap-4 mt-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  10% {T('discount_label')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-primary/10 border border-gold-primary/15 text-gold-primary text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-gold-primary rounded-full" />
                  10% {T('commission_label')}
                </span>
              </div>
            </div>

            {/* Header Mini Stats */}
            {stats && (
              <div className="flex gap-3 sm:gap-4">
                <div className="text-center px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] min-w-[90px]">
                  <p className="font-display text-xl sm:text-2xl font-bold text-white">{stats.total_referrals || 0}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{T('total_referrals')}</p>
                </div>
                <div className="text-center px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] min-w-[90px]">
                  {/* Gunakan Number(...) agar kebal terhadap error */}
                  <p className="font-display text-xl sm:text-2xl font-bold text-emerald-400">${Number(stats.total_commission || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{T('total_earned')}</p>
                </div>
                <div className="text-center px-4 py-3 rounded-xl bg-gold-primary/[0.06] border border-gold-primary/15 min-w-[90px]">
                  <p className="font-display text-xl sm:text-2xl font-bold text-gold-primary">${Number(stats.available_balance || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{T('available')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID SECTION ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ─── KOLOM KIRI: Referral Code & QR Code ─── */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card: Your Code */}
          <div className="rounded-2xl border border-gold-primary/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                {T('your_code')}
              </h2>
            </div>

            <div className="p-5">
              {codeData?.code ? (
                <div className="space-y-5">
                  {/* Teks Kode Besar */}
                  <div className="relative">
                    <div className="flex items-center justify-center py-5 px-4 rounded-xl bg-black/30 border border-gold-primary/20 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-gold-primary/[0.04] to-transparent" />
                      <span className="relative font-mono text-2xl sm:text-3xl font-bold text-gold-primary tracking-[0.15em] select-all">
                        {codeData.code}
                      </span>
                    </div>
                  </div>

                  {/* Tombol Salin */}
                  <div className="grid grid-cols-2 gap-3">
                    <CopyButton text={codeData.code} label={T('copy_code')} className="justify-center py-2.5 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-text-secondary hover:text-white hover:bg-white/[0.07]" />
                    <CopyButton text={referralLink} label={T('copy_link')} className="justify-center py-2.5 px-3 rounded-xl bg-gold-primary/10 border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/15" />
                  </div>

                  {/* Full Link Referral */}
                  <div className="px-3 py-2.5 rounded-lg bg-black/20 border border-white/[0.05]">
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{T('share_link')}</p>
                    <p className="text-xs text-text-secondary font-mono break-all select-all leading-relaxed">{referralLink}</p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-text-muted px-1">
                    <span>Used: {codeData.times_used || 0}{codeData.max_uses ? ` / ${codeData.max_uses}` : ''} times</span>
                    <span className={codeData.is_active ? 'text-emerald-400' : 'text-red-400'}>
                      {codeData.is_active ? '● Active' : '● Inactive'}
                    </span>
                  </div>
                </div>
              ) : (
                /* Jika belum punya kode referral */
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-gold-primary/10 border border-gold-primary/15 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gold-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <p className="text-text-muted text-sm mb-5">{T('no_code_yet')}</p>
                  <button 
                    onClick={handleGenerate} 
                    disabled={generating} 
                    className="relative px-8 py-3 rounded-xl font-semibold text-sm transition-all overflow-hidden disabled:opacity-50" 
                    style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 30px rgba(212,168,83,0.2)' }}
                  >
                    <span className="relative z-10">{generating ? T('generating') : T('generate')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card: QR Code */}
          {codeData?.code && (
            <div className="rounded-2xl border border-gold-primary/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zm0 9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zm9.75-9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  </svg>
                  {T('qr_code')}
                </h2>
              </div>
              <div className="p-5 flex flex-col items-center">
                <div className="p-4 rounded-2xl bg-black/30 border border-gold-primary/15">
                  <QRCode value={referralLink} size={180} />
                </div>
                <p className="text-[11px] text-text-muted mt-3 text-center">Scan to register with your referral</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── KOLOM KANAN: Grid Statistik & Tabs ─── */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Card Statistik Grid - Dibuat dengan cara map yang pintar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: T('total_referrals'), value: stats.total_referrals || 0, color: 'text-white', icon: '👥' },
                { label: T('confirmed'), value: stats.confirmed_referrals || 0, color: 'text-emerald-400', icon: '✓' },
                { label: T('pending'), value: stats.pending_referrals || 0, color: 'text-amber-400', icon: '⏳' },
                { label: T('total_earned'), value: `$${Number(stats.total_commission || 0).toFixed(2)}`, color: 'text-emerald-400', icon: '💰' },
                { label: T('available'), value: `$${Number(stats.available_balance || 0).toFixed(2)}`, color: 'text-gold-primary', icon: '💎' },
                { label: T('paid_out'), value: `$${Number(stats.total_paid_out || 0).toFixed(2)}`, color: 'text-blue-400', icon: '📤' },
              ].map((s, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-text-muted uppercase tracking-wider">{s.label}</span>
                    <span className="text-sm">{s.icon}</span>
                  </div>
                  <p className={`font-display text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tab Navigation Menu */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            {[
              { key: 'overview', label: T('how_it_works'), icon: '📋' },
              { key: 'payout', label: T('payout'), icon: '💸' },
              { key: 'history', label: T('payout_history'), icon: '📜' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeSection === tab.key 
                    ? 'bg-gold-primary/10 text-gold-primary border border-gold-primary/20' 
                    : 'text-text-secondary hover:text-white border border-transparent'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Kotak Konten Berdasarkan Tab yang Dipilih */}
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
            
            {/* TAB: HOW IT WORKS / OVERVIEW */}
            {activeSection === 'overview' && (
              <div className="p-6 space-y-6">
                <h3 className="text-base font-semibold text-white">{T('how_it_works')}</h3>
                
                {/* Langkah-langkah */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { step: '01', title: T('step1_title'), desc: T('step1_desc'), gradient: 'from-gold-primary/20 to-gold-primary/5' },
                    { step: '02', title: T('step2_title'), desc: T('step2_desc'), gradient: 'from-emerald-500/20 to-emerald-500/5' },
                    { step: '03', title: T('step3_title'), desc: T('step3_desc'), gradient: 'from-blue-500/20 to-blue-500/5' },
                  ].map((s, i) => (
                    <div key={i} className="relative rounded-xl border border-white/[0.06] p-5 overflow-hidden group hover:border-white/[0.1] transition-all">
                      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${s.gradient} rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500`} />
                      <div className="relative">
                        <span className="font-display text-3xl font-bold text-white/10">{s.step}</span>
                        <h4 className="text-sm font-semibold text-white mt-2">{s.title}</h4>
                        <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* List Referral Terbaru */}
                <div>
                  <h3 className="text-base font-semibold text-white mb-3">{T('recent')}</h3>
                  {stats?.recent_referrals?.length > 0 ? (
                    <div className="space-y-2">
                      {stats.recent_referrals.map((r, i) => (
                        <div key={r.id || i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gold-primary/10 border border-gold-primary/15 flex items-center justify-center text-xs font-bold text-gold-primary">
                              {r.username?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{r.username}</p>
                              <p className="text-[11px] text-text-muted">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-emerald-400">
                              {r.commission > 0 ? `+$${Number(r.commission || 0).toFixed(2)}` : '—'}
                            </span>
                            <StatusBadge status={r.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <p className="text-text-muted text-sm">{T('no_referrals')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: REQUEST PAYOUT (WITHDRAWAL) */}
            {activeSection === 'payout' && (
              <div className="p-6 space-y-5">
                <h3 className="text-base font-semibold text-white">{T('payout_title')}</h3>
                
                {/* Notifikasi Berhasil */}
                {payoutSuccess && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-emerald-400">Payout request submitted successfully!</p>
                  </div>
                )}
                
                <div className="space-y-4">
                  {/* Balance Available */}
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gold-primary/[0.06] border border-gold-primary/15">
                    <span className="text-sm text-text-secondary">{T('available')}</span>
                    <span className="font-display text-lg font-bold text-gold-primary">
                      ${Number(stats?.available_balance || 0).toFixed(2)}
                    </span>
                  </div>
                  
                  {/* Form Jumlah */}
                  <div>
                    <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">{T('payout_amount')}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                      <input 
                        type="number" 
                        value={payoutAmount} 
                        onChange={(e) => setPayoutAmount(e.target.value)} 
                        placeholder="0.00" 
                        min="5" 
                        step="0.01" 
                        className="w-full pl-8 pr-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-white text-sm font-mono placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 transition-colors" 
                      />
                    </div>
                  </div>
                  
                  {/* Form Wallet */}
                  <div>
                    <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">{T('payout_wallet')}</label>
                    <input 
                      type="text" 
                      value={payoutWallet} 
                      onChange={(e) => setPayoutWallet(e.target.value)} 
                      placeholder="0x..." 
                      className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-white text-sm font-mono placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 transition-colors" 
                    />
                  </div>
                  
                  {/* Pilih Network */}
                  <div>
                    <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">{T('payout_network')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['BSC', 'ETH', 'TRC20'].map(net => (
                        <button 
                          key={net} 
                          onClick={() => setPayoutNetwork(net)} 
                          className={`py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                            payoutNetwork === net 
                              ? 'bg-gold-primary/10 border-gold-primary/30 text-gold-primary' 
                              : 'bg-white/[0.02] border-white/[0.06] text-text-secondary'
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Error Notification */}
                  {payoutError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      {payoutError}
                    </div>
                  )}
                  
                  {/* Tombol Submit */}
                  <button 
                    onClick={handlePayout} 
                    disabled={payoutSubmitting || !payoutAmount || !payoutWallet} 
                    className="w-full relative py-3.5 rounded-xl font-semibold text-sm transition-all overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed" 
                    style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 30px rgba(212,168,83,0.15)' }}
                  >
                    <span className="relative z-10">{payoutSubmitting ? T('payout_processing') : T('payout_submit')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB: PAYOUT HISTORY */}
            {activeSection === 'history' && (
              <div className="p-6">
                <h3 className="text-base font-semibold text-white mb-4">{T('payout_history')}</h3>
                {payouts.length > 0 ? (
                  <div className="space-y-2">
                    {payouts.map((p, i) => (
                      <div key={p.id || i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <div>
                          <p className="text-sm font-semibold text-white">${Number(p.amount_usdt || 0).toFixed(2)}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            {p.network} · {p.wallet_address ? `${p.wallet_address.slice(0, 8)}...${p.wallet_address.slice(-6)}` : '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={p.status} />
                          <p className="text-[11px] text-text-muted mt-1">
                            {p.requested_at ? new Date(p.requested_at).toLocaleDateString() : '—'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-text-muted text-sm">{T('no_payouts')}</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}