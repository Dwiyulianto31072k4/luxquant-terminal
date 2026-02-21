// src/components/subscription/PaymentPage.jsx
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import subscriptionApi from '../../services/subscriptionApi';

const PaymentPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { invoice, plan } = location.state || {};

  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  // ── Extract data robustly from invoice response ──
  // Backend returns: { payment: {...}, wallet_to: "0x...", amount_usdt: 50, expires_at: "...", plan: {...} }
  const walletAddress = invoice?.wallet_to || invoice?.payment?.wallet_to || '';
  const amount = invoice?.amount_usdt || invoice?.payment?.amount_usdt || '';
  const expiresAt = invoice?.expires_at || invoice?.payment?.expires_at || '';
  const paymentId = invoice?.payment?.id || invoice?.id || null;
  const planLabel = plan?.label || invoice?.plan?.label || invoice?.plan?.name || 'Subscription';

  // If no invoice data, redirect to pricing
  useEffect(() => {
    if (!invoice) navigate('/pricing');
  }, [invoice, navigate]);

  // Debug: log invoice data
  useEffect(() => {
    if (invoice) {
      console.log('📦 Invoice data received:', JSON.stringify(invoice, null, 2));
      console.log('📦 Plan data received:', JSON.stringify(plan, null, 2));
      console.log('📦 Extracted → wallet:', walletAddress, '| amount:', amount, '| paymentId:', paymentId);
    }
  }, [invoice]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires - now;
      if (diff <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

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
        // Success! Redirect after 3s
        setTimeout(() => navigate('/'), 3000);
      }
    } catch (err) {
      setResult({
        status: 'error',
        message: err.response?.data?.detail || 'Verifikasi gagal, coba lagi'
      });
    } finally {
      setVerifying(false);
    }
  };

  if (!invoice) return null;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#0a0506' }}>
      <div className="absolute inset-0"
           style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 83, 0.06) 0%, transparent 60%)' }} />

      <div className="relative z-10 max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Pembayaran
          </h1>
          <p style={{ color: '#8a7b6b' }}>
            {planLabel} — {amount || '?'} USDT
          </p>
        </div>

        {/* Payment Card */}
        <div className="rounded-2xl p-6 mb-6"
             style={{ background: 'rgba(20, 10, 12, 0.8)', border: '1px solid rgba(212, 168, 83, 0.2)', backdropFilter: 'blur(10px)' }}>

          {/* Timer */}
          <div className="flex items-center justify-between mb-6 pb-4"
               style={{ borderBottom: '1px solid rgba(212, 168, 83, 0.1)' }}>
            <span className="text-sm" style={{ color: '#6b5c52' }}>Invoice expires in:</span>
            <span className={`text-sm font-mono font-bold ${timeLeft === 'Expired' ? 'text-red-400' : ''}`}
                  style={timeLeft !== 'Expired' ? { color: '#d4a853' } : {}}>
              {timeLeft || 'Calculating...'}
            </span>
          </div>

          {/* Step 1: Transfer Details */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>1</span>
              <span className="text-sm font-medium text-white">Transfer USDT (BEP-20)</span>
            </div>

            {/* Amount */}
            <div className="rounded-xl p-4 mb-3" style={{ background: '#120809', border: '1px solid rgba(212, 168, 83, 0.1)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: '#6b5c52' }}>Jumlah</p>
                  <p className="text-2xl font-bold text-white">
                    {amount || '—'} <span className="text-sm" style={{ color: '#d4a853' }}>USDT</span>
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(String(amount), 'amount')}
                  disabled={!amount}
                  className="px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-30"
                  style={{ background: 'rgba(212, 168, 83, 0.1)', color: '#d4a853', border: '1px solid rgba(212, 168, 83, 0.2)' }}
                >
                  {copied === 'amount' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Wallet Address */}
            <div className="rounded-xl p-4" style={{ background: '#120809', border: '1px solid rgba(212, 168, 83, 0.1)' }}>
              <p className="text-xs mb-2" style={{ color: '#6b5c52' }}>Wallet Address (BEP-20 / BSC)</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-white break-all flex-1">
                  {walletAddress || '—'}
                </p>
                <button
                  onClick={() => handleCopy(walletAddress, 'wallet')}
                  disabled={!walletAddress}
                  className="px-3 py-1.5 rounded-lg text-xs transition-colors flex-shrink-0 disabled:opacity-30"
                  style={{ background: 'rgba(212, 168, 83, 0.1)', color: '#d4a853', border: '1px solid rgba(212, 168, 83, 0.2)' }}
                >
                  {copied === 'wallet' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Network Warning */}
            <div className="mt-3 flex items-start gap-2 p-3 rounded-lg"
                 style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.15)' }}>
              <span className="text-yellow-400 text-sm mt-0.5">⚠️</span>
              <p className="text-xs" style={{ color: '#d4a853' }}>
                Pastikan transfer menggunakan network <strong>BNB Smart Chain (BEP-20)</strong>. 
                Pengiriman via network lain akan menyebabkan dana hilang.
              </p>
            </div>
          </div>

          {/* Step 2: Submit TX Hash */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>2</span>
              <span className="text-sm font-medium text-white">Submit TX Hash</span>
            </div>

            <p className="text-xs mb-3" style={{ color: '#6b5c52' }}>
              Setelah transfer, masukkan Transaction Hash dari wallet/exchange kamu
            </p>

            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0x . . ."
              className="w-full px-4 py-3 rounded-xl text-white text-sm font-mono focus:outline-none mb-3"
              style={{ background: '#120809', border: '1px solid rgba(212, 168, 83, 0.2)' }}
            />

            <button
              onClick={handleVerify}
              disabled={verifying || !txHash.trim() || timeLeft === 'Expired' || !paymentId}
              className="w-full py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(to right, #d4a853, #8b6914)',
                color: '#0a0506',
                boxShadow: '0 0 20px rgba(212, 168, 83, 0.2)'
              }}
            >
              {verifying ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Memverifikasi...
                </span>
              ) : 'Verifikasi Pembayaran'}
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-2xl p-6 mb-6 ${
            result.status === 'confirmed' ? 'border-green-500/30 bg-green-500/5' :
            result.status === 'failed' || result.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
            'border-yellow-500/30 bg-yellow-500/5'
          }`} style={{ border: '1px solid' }}>
            {result.status === 'confirmed' ? (
              <div className="text-center">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-bold text-green-400 mb-1">Pembayaran Berhasil!</h3>
                <p className="text-sm text-green-300/70">Subscription kamu sudah aktif. Redirecting...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-4xl mb-3">{result.status === 'failed' || result.status === 'error' ? '❌' : '⏳'}</div>
                <h3 className="text-lg font-bold mb-1"
                    style={{ color: result.status === 'failed' || result.status === 'error' ? '#f87171' : '#fbbf24' }}>
                  {result.status === 'failed' || result.status === 'error' ? 'Verifikasi Gagal' : 'Menunggu Konfirmasi'}
                </h3>
                <p className="text-sm" style={{ color: '#8a7b6b' }}>{result.message}</p>
                {result.can_retry && (
                  <p className="text-xs mt-2" style={{ color: '#6b5c52' }}>
                    Kamu bisa mencoba lagi dengan TX hash yang benar
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Help */}
        <div className="text-center">
          <p className="text-xs mb-2" style={{ color: '#6b5c52' }}>
            Butuh bantuan? Hubungi admin via Telegram
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="text-sm transition-colors"
            style={{ color: '#6b5c52' }}
          >
            ← Kembali ke Pricing
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;