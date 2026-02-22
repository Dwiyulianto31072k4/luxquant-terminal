// src/components/subscription/PricingPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import subscriptionApi from '../../services/subscriptionApi';

const PricingPage = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansData, statusData] = await Promise.all([
        subscriptionApi.getPlans(),
        isAuthenticated ? subscriptionApi.getMySubscription().catch(() => null) : null,
      ]);
      setPlans(plansData);
      setSubStatus(statusData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isPremium = subStatus?.is_subscribed && subStatus?.tier !== 'admin';
  const currentPlanName = subStatus?.plan_name;

  const handleSubscribe = async (plan) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // If clicking current plan
    if (isPremium && plan.name === currentPlanName) {
      alert('Kamu sudah berlangganan paket ini.');
      return;
    }

    setSelectedPlan(plan.id);
    setCreating(true);

    try {
      const invoice = await subscriptionApi.createInvoice(plan.id, isPremium);
      navigate('/payment', { state: { invoice, plan } });
    } catch (err) {
      const msg = err.response?.data?.detail || 'Gagal membuat invoice';
      alert(msg);
    } finally {
      setCreating(false);
      setSelectedPlan(null);
    }
  };

  const getPlanIcon = (name) => {
    switch (name) {
      case 'monthly': return '⚡';
      case 'yearly': return '💎';
      case 'lifetime': return '👑';
      default: return '✨';
    }
  };

  const getPlanHighlight = (name) => name === 'yearly';

  const getSavingBadge = (plan) => {
    if (plan.name === 'yearly') return 'Hemat 33%';
    if (plan.name === 'lifetime') return 'Best Value';
    return null;
  };

  const getButtonLabel = (plan) => {
    if (!isPremium) return 'Pilih Paket';
    if (plan.name === currentPlanName) return 'Paket Aktif';

    // Compare sort_order to determine upgrade/downgrade
    const currentPlan = plans.find(p => p.name === currentPlanName);
    if (currentPlan && plan.sort_order > currentPlan.sort_order) return 'Upgrade';
    if (currentPlan && plan.sort_order < currentPlan.sort_order) return 'Downgrade';
    return 'Ganti Paket';
  };

  const isCurrentPlan = (plan) => isPremium && plan.name === currentPlanName;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
        <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full"
             style={{ borderTopColor: '#d4a853' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#0a0506' }}>
      {/* Background effects */}
      <div className="absolute inset-0" 
           style={{ 
             background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 168, 83, 0.08) 0%, transparent 60%)' 
           }} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
               style={{ background: 'rgba(212, 168, 83, 0.1)', border: '1px solid rgba(212, 168, 83, 0.2)' }}>
            <span style={{ color: '#d4a853' }} className="text-sm font-medium">Premium Access</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}>
            {isPremium ? 'Ganti' : 'Upgrade ke'} <span style={{ color: '#d4a853' }}>Premium</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#8a7b6b' }}>
            {isPremium
              ? `Kamu sedang berlangganan ${subStatus.plan_label || 'Premium'}${subStatus.days_remaining != null ? ` — ${subStatus.days_remaining} hari tersisa` : ' — Lifetime'}`
              : 'Akses penuh ke semua trading signals, analytics, dan fitur premium LuxQuant Terminal'
            }
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan) => {
            const isHighlighted = getPlanHighlight(plan.name);
            const badge = getSavingBadge(plan);
            const isCurrent = isCurrentPlan(plan);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] ${
                  isHighlighted ? 'md:-mt-4 md:mb-4' : ''
                }`}
                style={{
                  background: isCurrent
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(20, 10, 12, 0.9))'
                    : isHighlighted
                      ? 'linear-gradient(135deg, rgba(212, 168, 83, 0.15), rgba(20, 10, 12, 0.9))'
                      : 'rgba(20, 10, 12, 0.6)',
                  border: isCurrent
                    ? '2px solid rgba(34, 197, 94, 0.5)'
                    : isHighlighted
                      ? '2px solid rgba(212, 168, 83, 0.5)'
                      : '1px solid rgba(212, 168, 83, 0.15)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                {/* Badge */}
                {isCurrent ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                       style={{ background: 'linear-gradient(to right, #22c55e, #16a34a)', color: '#fff' }}>
                    Paket Aktif
                  </div>
                ) : badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                       style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506' }}>
                    {badge}
                  </div>
                ) : null}

                {/* Plan Icon */}
                <div className="text-4xl mb-4 mt-2">{getPlanIcon(plan.name)}</div>

                {/* Plan Name */}
                <h3 className="text-xl font-bold text-white mb-1">{plan.label}</h3>
                <p className="text-sm mb-6" style={{ color: '#6b5c52' }}>{plan.description}</p>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">${plan.price_usdt}</span>
                  <span className="text-sm ml-1" style={{ color: '#8a7b6b' }}>USDT</span>
                  {plan.duration_days && (
                    <span className="text-sm ml-1" style={{ color: '#6b5c52' }}>
                      / {plan.name === 'yearly' ? 'tahun' : 'bulan'}
                    </span>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {[
                    'Semua trading signals',
                    'Advanced analytics & charts',
                    'Performance tracking',
                    'Real-time market data',
                    plan.name !== 'monthly' && 'Priority support',
                    plan.name === 'lifetime' && 'Lifetime updates',
                  ].filter(Boolean).map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm" style={{ color: '#b8a89a' }}>
                      <svg className="w-4 h-4 flex-shrink-0" style={{ color: isCurrent ? '#22c55e' : '#d4a853' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={creating || isCurrent}
                  className="w-full py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={isCurrent ? {
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    cursor: 'default'
                  } : isHighlighted ? {
                    background: 'linear-gradient(to right, #d4a853, #8b6914)',
                    color: '#0a0506',
                    boxShadow: '0 0 30px rgba(212, 168, 83, 0.3)'
                  } : {
                    background: 'transparent',
                    color: '#d4a853',
                    border: '1px solid rgba(212, 168, 83, 0.3)'
                  }}
                >
                  {creating && selectedPlan === plan.id ? 'Memproses...' : getButtonLabel(plan)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Payment Info */}
        <div className="text-center rounded-2xl p-8"
             style={{ background: 'rgba(20, 10, 12, 0.5)', border: '1px solid rgba(212, 168, 83, 0.1)' }}>
          <h3 className="text-lg font-semibold text-white mb-3">Pembayaran via Crypto</h3>
          <p className="text-sm mb-4" style={{ color: '#8a7b6b' }}>
            Pembayaran menggunakan USDT (BEP-20) di BNB Smart Chain. Verifikasi otomatis setelah konfirmasi blockchain.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs" style={{ color: '#6b5c52' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ color: '#22c55e' }}>●</span> Auto-verification
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: '#22c55e' }}>●</span> USDT BEP-20
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: '#22c55e' }}>●</span> Instant activation
            </span>
          </div>
        </div>

        {/* Back button */}
        <div className="text-center mt-8">
          <button
            onClick={() => navigate('/')}
            className="text-sm transition-colors"
            style={{ color: '#6b5c52' }}
          >
            ← Kembali ke Terminal
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;