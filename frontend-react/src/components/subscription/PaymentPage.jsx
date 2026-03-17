// src/components/subscription/PaymentPage.jsx
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import subscriptionApi from '../../services/subscriptionApi';

// ═══════════════════════════════════════════
// Payment Method Configuration
// ═══════════════════════════════════════════
const CURRENCIES = [
  { id: 'usdt', label: 'USDT', icon: 'usdt', color: '#26A17B' },
  { id: 'usdc', label: 'USDC', icon: 'usdc', color: '#2775CA' },
  { id: 'btc', label: 'BTC', icon: 'btc', color: '#F7931A' },
];

const NETWORKS = {
  usdt: [
    { id: 'bsc', label: 'BSC (BEP-20)', badge: 'recommended', warningKey: 'warning_bsc' },
    { id: 'erc20', label: 'Ethereum (ERC-20)', badge: null, warningKey: 'warning_erc20' },
    { id: 'trc20', label: 'TRON (TRC-20)', badge: 'lowest_fee', warningKey: 'warning_trc20' },
  ],
  usdc: [
    { id: 'erc20', label: 'Ethereum (ERC-20)', badge: 'recommended', warningKey: 'warning_erc20' },
    { id: 'bsc', label: 'BSC (BEP-20)', badge: null, warningKey: 'warning_bsc' },
    { id: 'trc20', label: 'TRON (TRC-20)', badge: 'lowest_fee', warningKey: 'warning_trc20' },
  ],
  btc: [
    { id: 'btc', label: 'Bitcoin', badge: null, warningKey: 'warning_btc' },
  ],
};

// Wallet addresses per currency+network (configure these)
const WALLET_ADDRESSES = {
  'usdt-bsc': '', // Will be populated from invoice
  'usdt-erc20': '',
  'usdt-trc20': '',
  'usdc-erc20': '',
  'usdc-bsc': '',
  'usdc-trc20': '',
  'btc-btc': '',
};

// ═══════════════════════════════════════════
// Currency Icon Components
// ═══════════════════════════════════════════
const CurrencyIcon = ({ currency, size = 24 }) => {
  if (currency === 'usdt') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117" fill="#fff" />
      </svg>
    );
  }
  if (currency === 'usdc') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path d="M20.4 18.133c0-2.134-1.28-2.867-3.84-3.2-.533-.067-1.067-.133-1.6-.267-1.28-.267-1.6-.667-1.6-1.333 0-.667.533-1.133 1.6-1.133.933 0 1.467.333 1.733 1.067.067.133.2.2.333.2h.8c.2 0 .333-.133.333-.333v-.067c-.267-1.067-1.067-1.867-2.267-2.067V9.867c0-.2-.133-.333-.4-.4h-.8c-.2 0-.333.133-.4.4V11c-1.6.2-2.6 1.267-2.6 2.533 0 2 1.2 2.733 3.76 3.067.533.067 1.067.2 1.6.333 1.067.333 1.4.8 1.4 1.4 0 .8-.667 1.4-1.867 1.4-1.467 0-2-.6-2.2-1.4-.067-.133-.2-.267-.4-.267h-.867c-.2 0-.333.133-.333.333v.067c.267 1.333 1.067 2.2 2.8 2.467v1.133c0 .2.133.333.4.4h.8c.2 0 .333-.133.4-.4V20.6c1.667-.267 2.667-1.333 2.667-2.667" fill="#fff" />
      </svg>
    );
  }
  if (currency === 'btc') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#F7931A" />
        <path d="M22.5 13.6c.3-2-1.2-3.1-3.4-3.8l.7-2.8-1.7-.4-.7 2.7c-.4-.1-.9-.2-1.4-.3l.7-2.8-1.7-.4-.7 2.8c-.4-.1-.7-.2-1-.2l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .1 0l-.1 0-1.1 4.5c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.8c.5.1.9.2 1.4.3l-.7 2.8 1.7.4.7-2.8c3 .6 5.2.3 6.1-2.4.8-2.1 0-3.4-1.6-4.2 1.1-.3 2-1 2.2-2.6m-3.9 5.5c-.6 2.2-4.3 1-5.5.7l1-4c1.2.3 5.1.9 4.5 3.3m.6-5.5c-.5 2-3.6.9-4.6.7l.9-3.6c1 .3 4.3.7 3.7 2.9" fill="#fff" />
      </svg>
    );
  }
  return null;
};

// ═══════════════════════════════════════════
// Main PaymentPage Component
// ═══════════════════════════════════════════
const PaymentPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { invoice, plan } = location.state || {};

  // Payment method state
  const [selectedCurrency, setSelectedCurrency] = useState('usdt');
  const [selectedNetwork, setSelectedNetwork] = useState('bsc');

  // Payment flow state
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  // Extract data from invoice response
  const invoiceWallet = invoice?.wallet_to || invoice?.payment?.wallet_to || '';
  const amount = invoice?.amount_usdt || invoice?.payment?.amount_usdt || '';
  const expiresAt = invoice?.expires_at || invoice?.payment?.expires_at || '';
  const paymentId = invoice?.payment?.id || invoice?.id || null;
  const planLabel = plan?.label || invoice?.plan?.label || invoice?.plan?.name || 'Subscription';

  // Derive wallet address based on selection
  const getWalletAddress = () => {
    const key = `${selectedCurrency}-${selectedNetwork}`;
    const configuredWallet = WALLET_ADDRESSES[key];
    // Fallback to invoice wallet for USDT-BSC (current production flow)
    if (selectedCurrency === 'usdt' && selectedNetwork === 'bsc') {
      return invoiceWallet || configuredWallet;
    }
    return configuredWallet || invoiceWallet;
  };

  const walletAddress = getWalletAddress();

  // Get current network config
  const currentNetworks = NETWORKS[selectedCurrency] || [];
  const currentNetworkConfig = currentNetworks.find(n => n.id === selectedNetwork);

  // Auto-select first network when currency changes
  useEffect(() => {
    const nets = NETWORKS[selectedCurrency];
    if (nets && nets.length > 0) {
      setSelectedNetwork(nets[0].id);
    }
  }, [selectedCurrency]);

  // If no invoice data, redirect to pricing
  useEffect(() => {
    if (!invoice) navigate('/pricing');
  }, [invoice, navigate]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires - now;
      if (diff <= 0) {
        setTimeLeft(t('payment.expired'));
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${hours}h  ${minutes}m  ${seconds}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, t]);

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleVerify = async () => {
    if (!txHash.trim() || !paymentId) return;
    setVerifying(true);
    setResult(null);

    try {
      const res = await subscriptionApi.verifyPayment(paymentId, txHash.trim());
      setResult(res);

      if (res.status === 'confirmed') {
        if (res.user && refreshUser) {
          await refreshUser(res.user);
        } else if (refreshUser) {
          await refreshUser();
        }
        setTimeout(() => navigate('/'), 3000);
      }
    } catch (err) {
      setResult({
        status: 'error',
        message: err.response?.data?.detail || 'Verification failed, please try again',
      });
    } finally {
      setVerifying(false);
    }
  };

  // Get display amount based on selected currency
  const getDisplayAmount = () => {
    // For now, amount is always in USDT from backend
    // BTC conversion would come from backend in future
    if (selectedCurrency === 'btc') {
      return { value: '—', suffix: 'BTC', note: `≈ ${amount} USDT` };
    }
    return { value: amount || '—', suffix: selectedCurrency.toUpperCase(), note: null };
  };

  const displayAmount = getDisplayAmount();

  if (!invoice) return null;

  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{
          position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)',
          width: '700px', height: '500px',
          background: 'radial-gradient(ellipse, rgba(212,168,83,0.05) 0%, transparent 70%)',
        }} />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-4 py-12 sm:py-16">
        {/* ─── Header ─── */}
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight"
            style={{ fontFamily: 'Playfair Display, serif' }}>
            {t('payment.title')}
          </h1>
          <p className="text-sm" style={{ color: '#6b5c52' }}>
            {planLabel} — {amount || '?'} USDT
          </p>
        </div>

        {/* ─── Main Payment Card ─── */}
        <div className="rounded-2xl overflow-hidden mb-6"
          style={{
            background: 'rgba(15,8,10,0.85)',
            border: '1px solid rgba(212,168,83,0.12)',
            backdropFilter: 'blur(20px)',
          }}>

          {/* Top accent */}
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.2), transparent)' }} />

          <div className="p-5 sm:p-7">
            {/* Timer bar */}
            <div className="flex items-center justify-between mb-7 pb-5"
              style={{ borderBottom: '1px solid rgba(212,168,83,0.06)' }}>
              <span className="text-xs" style={{ color: '#534a42' }}>{t('payment.expires_in')}</span>
              <span className={`text-sm font-mono font-bold tracking-wider ${timeLeft === t('payment.expired') ? 'text-red-400' : ''}`}
                style={timeLeft !== t('payment.expired') ? { color: '#d4a853' } : {}}>
                {timeLeft || t('payment.calculating')}
              </span>
            </div>

            {/* ═══ STEP 1: Select Payment Method ═══ */}
            <div className="mb-7">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>1</div>
                <span className="text-sm font-medium text-white">{t('payment.step1')}</span>
              </div>

              {/* Currency Selector */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: '#534a42' }}>
                  {t('payment.currency')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CURRENCIES.map(cur => {
                    const isActive = selectedCurrency === cur.id;
                    return (
                      <button
                        key={cur.id}
                        onClick={() => setSelectedCurrency(cur.id)}
                        className="relative flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300"
                        style={{
                          background: isActive
                            ? `rgba(${cur.id === 'usdt' ? '38,161,123' : cur.id === 'usdc' ? '39,117,202' : '247,147,26'},0.08)`
                            : 'rgba(18,8,9,0.6)',
                          border: isActive
                            ? `1.5px solid rgba(${cur.id === 'usdt' ? '38,161,123' : cur.id === 'usdc' ? '39,117,202' : '247,147,26'},0.4)`
                            : '1px solid rgba(212,168,83,0.06)',
                        }}
                      >
                        <CurrencyIcon currency={cur.id} size={18} />
                        <span className="text-xs font-semibold" style={{ color: isActive ? '#fff' : '#6b5c52' }}>
                          {cur.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Network Selector */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: '#534a42' }}>
                  {t('payment.network')}
                </p>
                <div className="space-y-2">
                  {currentNetworks.map(net => {
                    const isActive = selectedNetwork === net.id;
                    return (
                      <button
                        key={net.id}
                        onClick={() => setSelectedNetwork(net.id)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200"
                        style={{
                          background: isActive ? 'rgba(212,168,83,0.06)' : 'rgba(18,8,9,0.4)',
                          border: isActive ? '1.5px solid rgba(212,168,83,0.25)' : '1px solid rgba(212,168,83,0.04)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Radio dot */}
                          <div className="w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ border: `1.5px solid ${isActive ? '#d4a853' : 'rgba(212,168,83,0.15)'}` }}>
                            {isActive && (
                              <div className="w-2 h-2 rounded-full" style={{ background: '#d4a853' }} />
                            )}
                          </div>
                          <span className="text-xs font-medium" style={{ color: isActive ? '#fff' : '#6b5c52' }}>
                            {net.label}
                          </span>
                        </div>
                        {net.badge && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                            style={{
                              background: net.badge === 'recommended' ? 'rgba(212,168,83,0.1)' : 'rgba(34,197,94,0.1)',
                              color: net.badge === 'recommended' ? '#d4a853' : '#22c55e',
                              border: `1px solid ${net.badge === 'recommended' ? 'rgba(212,168,83,0.15)' : 'rgba(34,197,94,0.15)'}`,
                            }}>
                            {t(`payment.${net.badge}`)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px mb-7" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.08), transparent)' }} />

            {/* ═══ STEP 2: Transfer Details ═══ */}
            <div className="mb-7">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>2</div>
                <span className="text-sm font-medium text-white">{t('payment.step2')}</span>
              </div>

              {/* Amount Box */}
              <div className="rounded-xl p-4 mb-3"
                style={{ background: 'rgba(10,5,6,0.6)', border: '1px solid rgba(212,168,83,0.06)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#534a42' }}>
                      {t('payment.amount')}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                        {displayAmount.value}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: '#d4a853' }}>{displayAmount.suffix}</span>
                    </div>
                    {displayAmount.note && (
                      <p className="text-[10px] mt-1" style={{ color: '#534a42' }}>{displayAmount.note}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopy(String(amount), 'amount')}
                    disabled={!amount}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-20"
                    style={{ background: 'rgba(212,168,83,0.06)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.12)' }}
                  >
                    {copied === 'amount' ? t('payment.copied') : t('payment.copy')}
                  </button>
                </div>
              </div>

              {/* Wallet Address Box */}
              <div className="rounded-xl p-4"
                style={{ background: 'rgba(10,5,6,0.6)', border: '1px solid rgba(212,168,83,0.06)' }}>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#534a42' }}>
                  {t('payment.wallet_address')}
                </p>
                <div className="flex items-start gap-3">
                  <p className="text-xs font-mono text-white/80 break-all flex-1 leading-relaxed">
                    {walletAddress || '—'}
                  </p>
                  <button
                    onClick={() => handleCopy(walletAddress, 'wallet')}
                    disabled={!walletAddress}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex-shrink-0 disabled:opacity-20"
                    style={{ background: 'rgba(212,168,83,0.06)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.12)' }}
                  >
                    {copied === 'wallet' ? t('payment.copied') : t('payment.copy')}
                  </button>
                </div>
              </div>

              {/* Network Warning */}
              {currentNetworkConfig && (
                <div className="mt-3 flex items-start gap-2.5 p-3.5 rounded-xl"
                  style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.1)' }}>
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d4a853' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="text-[11px] leading-relaxed" style={{ color: '#a09080' }}>
                    {t(`payment.${currentNetworkConfig.warningKey}`)}
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px mb-7" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.08), transparent)' }} />

            {/* ═══ STEP 3: Submit TX Hash ═══ */}
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>3</div>
                <span className="text-sm font-medium text-white">{t('payment.step3')}</span>
              </div>

              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: '#534a42' }}>
                {t('payment.tx_desc')}
              </p>

              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={selectedCurrency === 'btc' ? t('payment.tx_placeholder_btc') : t('payment.tx_placeholder')}
                className="w-full px-4 py-3.5 rounded-xl text-white text-xs font-mono focus:outline-none mb-4 transition-all"
                style={{
                  background: 'rgba(10,5,6,0.6)',
                  border: '1px solid rgba(212,168,83,0.08)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(212,168,83,0.25)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(212,168,83,0.08)'}
              />

              <button
                onClick={handleVerify}
                disabled={verifying || !txHash.trim() || timeLeft === t('payment.expired') || !paymentId}
                className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(135deg, #d4a853, #a07c2e)',
                  color: '#0a0506',
                  boxShadow: '0 4px 24px rgba(212,168,83,0.15)',
                }}
              >
                {/* Hover shine */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1), transparent)' }} />
                <span className="relative">
                  {verifying ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('payment.verifying')}
                    </span>
                  ) : t('payment.verify_btn')}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── Result ─── */}
        {result && (
          <div className="rounded-2xl overflow-hidden mb-6"
            style={{
              background: result.status === 'confirmed'
                ? 'rgba(34,197,94,0.04)' : result.status === 'failed' || result.status === 'error'
                  ? 'rgba(239,68,68,0.04)' : 'rgba(234,179,8,0.04)',
              border: `1px solid ${result.status === 'confirmed'
                ? 'rgba(34,197,94,0.2)' : result.status === 'failed' || result.status === 'error'
                  ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}`,
            }}>
            <div className="p-6 text-center">
              {result.status === 'confirmed' ? (
                <>
                  <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(34,197,94,0.1)' }}>
                    <svg className="w-6 h-6" style={{ color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-green-400 mb-1">{t('payment.success_title')}</h3>
                  <p className="text-xs text-green-300/60">
                    {result.subscription?.plan_label} {t('payment.success_active')}
                    {result.subscription?.expires_at
                      ? ` ${t('payment.success_until')} ${new Date(result.subscription.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      : ` ${t('payment.success_lifetime')}`
                    }
                  </p>
                  <p className="text-[10px] mt-2" style={{ color: '#534a42' }}>{t('payment.redirecting')}</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{
                      background: result.status === 'failed' || result.status === 'error'
                        ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                    }}>
                    <svg className="w-6 h-6"
                      style={{ color: result.status === 'failed' || result.status === 'error' ? '#f87171' : '#fbbf24' }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {result.status === 'failed' || result.status === 'error' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      )}
                    </svg>
                  </div>
                  <h3 className="text-base font-bold mb-1"
                    style={{ color: result.status === 'failed' || result.status === 'error' ? '#f87171' : '#fbbf24' }}>
                    {result.status === 'failed' || result.status === 'error' ? t('payment.failed_title') : t('payment.pending_title')}
                  </h3>
                  <p className="text-xs" style={{ color: '#6b5c52' }}>{result.message}</p>
                  {result.can_retry && (
                    <p className="text-[10px] mt-2" style={{ color: '#534a42' }}>{t('payment.can_retry')}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Help / Back ─── */}
        <div className="text-center space-y-2">
          <p className="text-[10px]" style={{ color: '#534a42' }}>
            {t('payment.help')}
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="text-xs transition-colors hover:text-white"
            style={{ color: '#534a42' }}
          >
            {t('payment.back_pricing')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;