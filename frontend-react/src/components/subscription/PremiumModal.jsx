// src/components/subscription/PremiumModal.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import subscriptionApi from '../../services/subscriptionApi';

const PremiumModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
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

  const getPlanHighlight = (name) => name === 'yearly';

  const getSavingBadge = (plan) => {
    if (plan.name === 'yearly') return t('pricing.yearly_save');
    if (plan.name === 'lifetime') return t('pricing.best_value');
    return null;
  };

  const getPlanLabel = (plan) => {
    switch (plan.name) {
      case 'monthly': return t('pricing.monthly');
      case 'yearly': return t('pricing.yearly');
      case 'lifetime': return t('pricing.lifetime');
      default: return plan.label;
    }
  };

  const getPlanDesc = (plan) => {
    switch (plan.name) {
      case 'monthly': return t('pricing.monthly_desc');
      case 'yearly': return t('pricing.yearly_desc');
      case 'lifetime': return t('pricing.lifetime_desc');
      default: return plan.description;
    }
  };

  const getPriceSuffix = (plan) => {
    if (plan.name === 'yearly') return t('pricing.per_year');
    if (plan.name === 'monthly') return t('pricing.per_month');
    return t('pricing.one_time');
  };

  const getFeatures = (plan) => {
    const base = [
      t('pricing.feat_signals'),
      t('pricing.feat_analytics'),
      t('pricing.feat_market'),
    ];
    if (plan.name !== 'monthly') base.push(t('pricing.feat_support'));
    if (plan.name === 'lifetime') base.push(t('pricing.feat_lifetime'));
    return base;
  };

  // Compact SVG icons
  const PlanIcon = ({ name }) => {
    const color = '#d4a853';
    if (name === 'monthly') {
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="5" width="22" height="18" rx="3" stroke={color} strokeWidth="1.5" />
          <path d="M3 10h22" stroke={color} strokeWidth="1.5" />
          <circle cx="14" cy="17" r="2" fill={color} opacity="0.4" />
        </svg>
      );
    }
    if (name === 'yearly') {
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <path d="M14 3L17.5 10.5L25 11.5L19.5 17L21 24.5L14 20.5L7 24.5L8.5 17L3 11.5L10.5 10.5L14 3Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    if (name === 'lifetime') {
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <path d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z" stroke={color} strokeWidth="1.5" />
          <path d="M14 8v6l4 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2" fill={color} opacity="0.3" />
        </svg>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes modalSlideIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes modalSlideOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(16px) scale(0.98); } }
        .premium-overlay-in { animation: modalOverlayIn .25s ease forwards; }
        .premium-overlay-out { animation: modalOverlayOut .2s ease forwards; }
        .premium-modal-in { animation: modalSlideIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        .premium-modal-out { animation: modalSlideOut .2s ease forwards; }
      `}</style>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${isClosing ? 'premium-overlay-out' : 'premium-overlay-in'}`}
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
        onClick={handleClose}
      >
        {/* Modal */}
        <div
          className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl ${isClosing ? 'premium-modal-out' : 'premium-modal-in'}`}
          style={{
            background: 'linear-gradient(168deg, rgba(18,10,12,0.98) 0%, #0a0506 100%)',
            border: '1px solid rgba(212,168,83,0.12)',
            boxShadow: '0 0 80px rgba(212,168,83,0.05), 0 32px 64px rgba(0,0,0,0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-[#d4a853]/30 to-transparent" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 hover:bg-white/5"
            style={{ color: '#534a42' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
                   style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.12)' }}>
                <div className="w-1 h-1 rounded-full" style={{ background: '#d4a853' }} />
                <span style={{ color: '#d4a853' }} className="text-[10px] font-semibold tracking-widest uppercase">
                  {t('pricing.premium_access')}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight"
                  style={{ fontFamily: 'Playfair Display, serif' }}>
                {t('pricing.upgrade_to')} <span style={{ color: '#d4a853' }}>{t('pricing.premium')}</span>
              </h2>
              <p className="text-xs max-w-md mx-auto" style={{ color: '#6b5c52' }}>
                {t('pricing.modal_subtitle')}
              </p>
            </div>

            {/* Plans */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full"
                     style={{ borderTopColor: '#d4a853' }} />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-3 sm:gap-4 mb-6">
                {plans.map((plan) => {
                  const isHighlighted = getPlanHighlight(plan.name);
                  const badge = getSavingBadge(plan);
                  const features = getFeatures(plan);

                  return (
                    <div
                      key={plan.id}
                      className="group relative rounded-xl transition-all duration-300 hover:scale-[1.01] cursor-pointer"
                      style={{
                        background: isHighlighted
                          ? 'linear-gradient(168deg, rgba(212,168,83,0.08) 0%, rgba(10,5,6,0.95) 50%)'
                          : 'rgba(12,7,8,0.6)',
                        border: isHighlighted
                          ? '1px solid rgba(212,168,83,0.25)'
                          : '1px solid rgba(212,168,83,0.06)',
                      }}
                      onClick={() => !creating && handleSubscribe(plan)}
                    >
                      {/* Badge */}
                      {badge && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                          <div className="px-3 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase"
                               style={{ background: 'linear-gradient(135deg, #d4a853, #a07c2e)', color: '#0a0506' }}>
                            {badge}
                          </div>
                        </div>
                      )}

                      <div className="p-5">
                        {/* Icon + Name */}
                        <div className="flex items-center gap-3 mb-4 mt-1">
                          <div className="opacity-60">
                            <PlanIcon name={plan.name} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">{getPlanLabel(plan)}</h3>
                            <p className="text-[10px]" style={{ color: '#534a42' }}>{getPlanDesc(plan)}</p>
                          </div>
                        </div>

                        {/* Price */}
                        <div className="mb-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs" style={{ color: '#534a42' }}>$</span>
                            <span className="text-3xl font-bold text-white tracking-tight"
                                  style={{ fontFamily: 'Playfair Display, serif' }}>
                              {plan.price_usdt}
                            </span>
                            <span className="text-[10px] ml-0.5" style={{ color: '#534a42' }}>
                              USDT {getPriceSuffix(plan)}
                            </span>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px mb-4"
                             style={{ background: 'linear-gradient(90deg, rgba(212,168,83,0.08), transparent)' }} />

                        {/* Features */}
                        <ul className="space-y-2.5 mb-5">
                          {features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2.5 text-xs" style={{ color: '#8a7b6b' }}>
                              <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#d4a853' }}
                                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                              {feature}
                            </li>
                          ))}
                        </ul>

                        {/* CTA */}
                        <button
                          disabled={creating}
                          className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all duration-300 disabled:opacity-50"
                          style={isHighlighted ? {
                            background: 'linear-gradient(135deg, #d4a853, #a07c2e)',
                            color: '#0a0506',
                            boxShadow: '0 2px 16px rgba(212,168,83,0.15)',
                          } : {
                            background: 'transparent',
                            color: '#d4a853',
                            border: '1px solid rgba(212,168,83,0.15)',
                          }}
                        >
                          {creating && selectedPlan === plan.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              {t('pricing.processing')}
                            </span>
                          ) : t('pricing.select_plan')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment info */}
            <div className="text-center pt-5" style={{ borderTop: '1px solid rgba(212,168,83,0.06)' }}>
              <div className="flex items-center justify-center gap-6 text-[10px]" style={{ color: '#534a42' }}>
                <span className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                  {t('pricing.usdt_bep20')}
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                  {t('pricing.auto_verify')}
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                  {t('pricing.instant_act')}
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