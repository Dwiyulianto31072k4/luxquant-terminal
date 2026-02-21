// src/components/subscription/PremiumModal.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import subscriptionApi from '../../services/subscriptionApi';

const PremiumModal = ({ isOpen, onClose }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      loadPlans();
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const loadPlans = async () => {
    try {
      const data = await subscriptionApi.getPlans();
      setPlans(data);
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSubscribe = async (plan) => {
    if (!isAuthenticated) {
      handleClose();
      navigate('/login');
      return;
    }

    setSelectedPlan(plan.id);
    setCreating(true);

    try {
      const invoice = await subscriptionApi.createInvoice(plan.id);
      handleClose();
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

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes modalSlideIn { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes modalSlideOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.97); } }
        .premium-overlay-in { animation: modalOverlayIn .25s ease forwards; }
        .premium-overlay-out { animation: modalOverlayOut .2s ease forwards; }
        .premium-modal-in { animation: modalSlideIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        .premium-modal-out { animation: modalSlideOut .2s ease forwards; }
      `}</style>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${isClosing ? 'premium-overlay-out' : 'premium-overlay-in'}`}
        style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)' }}
        onClick={handleClose}
      >
        {/* Modal */}
        <div
          className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl ${isClosing ? 'premium-modal-out' : 'premium-modal-in'}`}
          style={{
            background: 'linear-gradient(135deg, #0d0809 0%, #0a0506 50%, #0d0809 100%)',
            border: '1px solid rgba(212, 168, 83, 0.2)',
            boxShadow: '0 0 60px rgba(212, 168, 83, 0.08), 0 25px 50px rgba(0, 0, 0, 0.5)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gold top line */}
          <div className="h-px bg-gradient-to-r from-transparent via-[#d4a853]/50 to-transparent" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 hover:bg-white/10"
            style={{ color: '#6b5c52' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-6 md:p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
                   style={{ background: 'rgba(212, 168, 83, 0.1)', border: '1px solid rgba(212, 168, 83, 0.2)' }}>
                <svg className="w-3.5 h-3.5" style={{ color: '#d4a853' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <span style={{ color: '#d4a853' }} className="text-xs font-semibold tracking-wide">PREMIUM ACCESS</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2"
                  style={{ fontFamily: 'Playfair Display, serif' }}>
                Upgrade ke <span style={{ color: '#d4a853' }}>Premium</span>
              </h2>
              <p className="text-sm max-w-md mx-auto" style={{ color: '#6b5c52' }}>
                Akses penuh ke semua trading signals, analytics, dan fitur premium LuxQuant Terminal
              </p>
            </div>

            {/* Plans */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full"
                     style={{ borderTopColor: '#d4a853' }} />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {plans.map((plan) => {
                  const isHighlighted = getPlanHighlight(plan.name);
                  const badge = getSavingBadge(plan);

                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] cursor-pointer group`}
                      style={{
                        background: isHighlighted
                          ? 'linear-gradient(135deg, rgba(212, 168, 83, 0.12), rgba(20, 10, 12, 0.9))'
                          : 'rgba(20, 10, 12, 0.6)',
                        border: isHighlighted
                          ? '2px solid rgba(212, 168, 83, 0.4)'
                          : '1px solid rgba(212, 168, 83, 0.12)',
                      }}
                      onClick={() => !creating && handleSubscribe(plan)}
                    >
                      {/* Badge */}
                      {badge && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold"
                             style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506' }}>
                          {badge}
                        </div>
                      )}

                      {/* Icon + Name */}
                      <div className="flex items-center gap-3 mb-3 mt-1">
                        <span className="text-2xl">{getPlanIcon(plan.name)}</span>
                        <div>
                          <h3 className="text-base font-bold text-white">{plan.label}</h3>
                          <p className="text-[11px]" style={{ color: '#6b5c52' }}>{plan.description}</p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-white">${plan.price_usdt}</span>
                        <span className="text-xs ml-1" style={{ color: '#8a7b6b' }}>USDT</span>
                        {plan.duration_days && (
                          <span className="text-xs ml-1" style={{ color: '#6b5c52' }}>
                            / {plan.name === 'yearly' ? 'tahun' : 'bulan'}
                          </span>
                        )}
                      </div>

                      {/* Features */}
                      <ul className="space-y-2 mb-5">
                        {[
                          'Semua trading signals',
                          'Advanced analytics',
                          'Real-time market data',
                          plan.name !== 'monthly' && 'Priority support',
                          plan.name === 'lifetime' && 'Lifetime updates',
                        ].filter(Boolean).map((feature, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs" style={{ color: '#b8a89a' }}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#d4a853' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <button
                        disabled={creating}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 disabled:opacity-50"
                        style={isHighlighted ? {
                          background: 'linear-gradient(to right, #d4a853, #8b6914)',
                          color: '#0a0506',
                          boxShadow: '0 0 20px rgba(212, 168, 83, 0.2)'
                        } : {
                          background: 'transparent',
                          color: '#d4a853',
                          border: '1px solid rgba(212, 168, 83, 0.25)'
                        }}
                      >
                        {creating && selectedPlan === plan.id ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Memproses...
                          </span>
                        ) : 'Pilih Paket'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment info */}
            <div className="text-center pt-4" style={{ borderTop: '1px solid rgba(212, 168, 83, 0.08)' }}>
              <div className="flex items-center justify-center gap-5 text-[11px]" style={{ color: '#6b5c52' }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ color: '#22c55e' }}>●</span> USDT BEP-20
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ color: '#22c55e' }}>●</span> Auto-verification
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ color: '#22c55e' }}>●</span> Instant activation
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PremiumModal;