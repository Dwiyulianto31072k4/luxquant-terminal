import Seo from "../Seo";
// src/components/subscription/PricingPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import subscriptionApi from '../../services/subscriptionApi';
import SubscribeViaAdminModal from './SubscribeViaAdminModal';

const PricingPage = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [adminModalPlan, setAdminModalPlan] = useState(null);
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

  const handleSubscribeViaAdmin = (plan) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isPremium && plan.name === currentPlanName) {
      alert('Kamu sudah berlangganan paket ini.');
      return;
    }

    setAdminModalPlan(plan);
  };

  const getPlanHighlight = (name) => name === 'yearly';

  const getSavingBadge = (plan) => {
    if (plan.name === 'yearly') return t('pricing.yearly_save');
    if (plan.name === 'lifetime') return t('pricing.best_value');
    return null;
  };

  // Maps a plan slug (name) → localized label. Accepts a minimal { name, label }
  // shape so it can be reused for both full plan objects and the subscription
  // status payload (which only carries plan_name + plan_label).
  const getPlanLabel = (plan) => {
    switch (plan?.name) {
      case 'monthly': return t('pricing.monthly');
      case 'yearly': return t('pricing.yearly');
      case 'lifetime': return t('pricing.lifetime');
      default: return plan?.label;
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

  const getButtonLabel = (plan) => {
    if (!isPremium) return 'Continue to Payment';
    if (plan.name === currentPlanName) return 'Current Plan';
    const currentPlan = plans.find(p => p.name === currentPlanName);
    if (currentPlan && plan.sort_order > currentPlan.sort_order) return 'Upgrade & Pay';
    if (currentPlan && plan.sort_order < currentPlan.sort_order) return 'Downgrade';
    return 'Switch & Pay';
  };

  const isCurrentPlan = (plan) => isPremium && plan.name === currentPlanName;

  // Localized label for the "Currently on …" header line.
  // Uses the slug (plan_name) → i18n, falls back to raw plan_label, then "Premium".
  const getCurrentPlanLabel = () =>
    getPlanLabel({ name: subStatus?.plan_name, label: subStatus?.plan_label })
    || t('pricing.premium');

  // ✅ Normalized to 5 features for every plan — balanced card height
  const getFeatures = (plan) => [
    t('pricing.feat_signals'),
    t('pricing.feat_analytics'),
    t('pricing.feat_performance'),
    t('pricing.feat_market'),
    plan.name === 'monthly'
      ? t('pricing.feat_basic_support', 'Standard support')
      : plan.name === 'lifetime'
        ? t('pricing.feat_lifetime')
        : t('pricing.feat_support'),
  ];

  const PlanIcon = ({ name, isCurrent }) => {
    const color = isCurrent ? '#22c55e' : '#d4a853';
    if (name === 'monthly') {
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="5" width="22" height="18" rx="3" stroke={color} strokeWidth="1.5" />
          <path d="M3 10h22" stroke={color} strokeWidth="1.5" />
          <circle cx="14" cy="17" r="2" fill={color} opacity="0.4" />
        </svg>
      );
    }
    if (name === 'yearly') {
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 3L17.5 10.5L25 11.5L19.5 17L21 24.5L14 20.5L7 24.5L8.5 17L3 11.5L10.5 10.5L14 3Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    if (name === 'lifetime') {
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z" stroke={color} strokeWidth="1.5" />
          <path d="M14 8v6l4 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2" fill={color} opacity="0.3" />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className="relative overflow-hidden min-h-screen">
      <Seo
        title="Pricing &amp; Plans — LuxQuant Terminal"
        description="LuxQuant Terminal pricing and plans. Unlock algorithmic analysis, on-chain intelligence, AutoTrade, and AI research. Free tier available."
        path="/pricing"
      />
      <style>{`
        @keyframes admin-pulse-glow {
          0%, 100% {
            box-shadow:
              0 0 0 0 rgba(212, 168, 83, 0.30),
              inset 0 0 0 1px rgba(212, 168, 83, 0.40);
          }
          50% {
            box-shadow:
              0 0 14px 2px rgba(212, 168, 83, 0.45),
              inset 0 0 0 1px rgba(212, 168, 83, 0.75);
          }
        }
        @keyframes admin-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes admin-icon-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
      `}</style>

      {/* Ambient background — smooth vertical blend so it connects with the
          header (no contrasting gold band that "cuts" below the nav). */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-[440px]" style={{
          background: 'linear-gradient(180deg, rgba(40,14,16,0.6) 0%, rgba(20,8,10,0.28) 45%, transparent 100%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-5%',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(212,168,83,0.03) 0%, transparent 70%)',
        }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin w-8 h-8 border-2 border-transparent rounded-full"
              style={{ borderTopColor: '#d4a853' }} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-16 sm:mb-20">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
                style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#d4a853' }} />
                <span style={{ color: '#d4a853' }} className="text-xs font-semibold tracking-widest uppercase">
                  {t('pricing.premium_access')}
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {isPremium ? t('pricing.switch') : t('pricing.upgrade_to')}{' '}
                <span className="relative">
                  <span style={{ color: '#d4a853' }}>{t('pricing.premium')}</span>
                  <div className="absolute -bottom-2 left-0 right-0 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.5), transparent)' }} />
                </span>
              </h1>

              <p className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: '#8a7b6b' }}>
                {isPremium
                  ? `${t('pricing.subscribing_to')} ${getCurrentPlanLabel()}${subStatus.days_remaining != null ? ` — ${subStatus.days_remaining} ${t('pricing.days_remaining')}` : ` — ${t('pricing.lifetime_label')}`}`
                  : t('pricing.subtitle')
                }
              </p>
            </div>

            {/* ════════════════════════════════════════════════
                PLANS GRID — equal-height cards via flex
                ════════════════════════════════════════════════ */}
            <div className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-20 max-w-5xl mx-auto items-stretch">
              {plans.map((plan) => {
                const isHighlighted = getPlanHighlight(plan.name);
                const badge = getSavingBadge(plan);
                const isCurrent = isCurrentPlan(plan);
                const features = getFeatures(plan);

                return (
                  <div
                    key={plan.id}
                    className={`group relative rounded-2xl transition-all duration-500 flex flex-col ${isHighlighted ? 'md:-mt-3 md:mb-3' : ''}`}
                    style={{
                      background: isCurrent
                        ? 'linear-gradient(168deg, rgba(34,197,94,0.14) 0%, #0c0708 45%)'
                        : isHighlighted
                          ? 'linear-gradient(168deg, rgba(212,168,83,0.16) 0%, #0c0708 45%)'
                          : '#0c0708',
                      border: isCurrent
                        ? '1px solid rgba(34,197,94,0.35)'
                        : isHighlighted
                          ? '1px solid rgba(212,168,83,0.35)'
                          : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Hover glow */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        boxShadow: isCurrent
                          ? '0 0 40px rgba(34,197,94,0.08)'
                          : '0 0 40px rgba(212,168,83,0.06)',
                      }} />

                    {/* Badge */}
                    {(isCurrent || badge) && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <div className="px-4 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase"
                          style={isCurrent ? {
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff',
                            boxShadow: '0 2px 12px rgba(34,197,94,0.3)',
                          } : {
                            background: 'linear-gradient(135deg, #d4a853, #a07c2e)',
                            color: '#0a0506',
                            boxShadow: '0 2px 12px rgba(212,168,83,0.3)',
                          }}>
                          {isCurrent ? t('pricing.current_plan') : badge}
                        </div>
                      </div>
                    )}

                    {isHighlighted && !isCurrent && (
                      <div className="absolute top-0 left-4 right-4 h-px"
                        style={{ background: 'linear-gradient(90deg, transparent, #d4a853, transparent)' }} />
                    )}

                    {/* Card content — flex-col with grow */}
                    <div className="relative p-6 sm:p-7 flex flex-col flex-1">
                      {/* Header section */}
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="mb-3 opacity-70">
                            <PlanIcon name={plan.name} isCurrent={isCurrent} />
                          </div>
                          <h3 className="text-lg font-bold text-white tracking-tight">
                            {getPlanLabel(plan)}
                          </h3>
                          <p className="text-xs mt-1" style={{ color: '#6b5c52' }}>
                            {getPlanDesc(plan)}
                          </p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-8">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm" style={{ color: '#6b5c52' }}>$</span>
                          <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            {plan.price_usdt}
                          </span>
                          <span className="text-sm ml-0.5" style={{ color: '#6b5c52' }}>
                            USDT
                          </span>
                        </div>
                        <div className="text-xs mt-1.5" style={{ color: '#534a42' }}>
                          {getPriceSuffix(plan)}
                        </div>
                      </div>

                      <div className="h-px mb-6"
                        style={{
                          background: isCurrent
                            ? 'linear-gradient(90deg, rgba(34,197,94,0.15), transparent)'
                            : 'linear-gradient(90deg, rgba(212,168,83,0.1), transparent)'
                        }} />

                      {/* Features — flex-1 to push CTA section to bottom */}
                      <ul className="space-y-3.5 mb-8 flex-1">
                        {features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm" style={{ color: '#a09080' }}>
                            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                background: isCurrent ? 'rgba(34,197,94,0.1)' : 'rgba(212,168,83,0.08)',
                              }}>
                              <svg className="w-2.5 h-2.5" style={{ color: isCurrent ? '#22c55e' : '#d4a853' }}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            {feature}
                          </li>
                        ))}
                      </ul>

                      {/* Bottom CTA section — always at card bottom */}
                      <div className="mt-auto">
                        {/* PRIMARY BUTTON */}
                        <button
                          onClick={() => handleSubscribe(plan)}
                          disabled={creating || isCurrent}
                          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed relative overflow-hidden group/btn"
                          style={isCurrent ? {
                            background: 'rgba(34,197,94,0.08)',
                            color: '#22c55e',
                            border: '1px solid rgba(34,197,94,0.2)',
                            cursor: 'default',
                          } : isHighlighted ? {
                            background: 'linear-gradient(135deg, #d4a853, #a07c2e)',
                            color: '#0a0506',
                            boxShadow: '0 4px 24px rgba(212,168,83,0.2)',
                          } : {
                            background: 'transparent',
                            color: '#d4a853',
                            border: '1px solid rgba(212,168,83,0.2)',
                          }}
                        >
                          {!isCurrent && isHighlighted && (
                            <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"
                              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1), transparent)' }} />
                          )}
                          <span className="relative">
                            {creating && selectedPlan === plan.id
                              ? t('pricing.processing')
                              : getButtonLabel(plan)
                            }
                          </span>
                        </button>

                        {/* OR + SUBSCRIBE VIA ADMIN — only if not current plan */}
                        {!isCurrent ? (
                          <>
                            <div className="my-4 flex items-center justify-center gap-3">
                              <div className="h-px flex-1"
                                style={{ background: 'linear-gradient(to right, transparent, #6b5c52, transparent)' }} />
                              <span className="text-[10px] font-medium tracking-[2px] uppercase px-2"
                                style={{ color: '#6b5c52' }}>
                                or
                              </span>
                              <div className="h-px flex-1"
                                style={{ background: 'linear-gradient(to right, transparent, #6b5c52, transparent)' }} />
                            </div>

                            <button
                              onClick={() => handleSubscribeViaAdmin(plan)}
                              className="w-full py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                              style={{
                                background:
                                  'linear-gradient(110deg, rgba(212,168,83,0.05) 0%, rgba(212,168,83,0.18) 50%, rgba(212,168,83,0.05) 100%)',
                                backgroundSize: '200% 100%',
                                color: '#e8c578',
                                borderRadius: '12px',
                                animation:
                                  'admin-pulse-glow 2.4s ease-in-out infinite, admin-shimmer 3.2s linear infinite',
                              }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                                style={{ animation: 'admin-icon-bounce 2.4s ease-in-out infinite' }}
                              >
                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                              </svg>
                              {t('pricing.subscribe_via_admin', 'Subscribe via Admin')}
                            </button>
                          </>
                        ) : (
                          // Current plan: matching-height status placeholder (OR divider + status pill)
                          <>
                            <div className="my-4 flex items-center justify-center gap-3">
                              <div className="h-px flex-1"
                                style={{ background: 'linear-gradient(to right, transparent, rgba(34,197,94,0.2), transparent)' }} />
                              <span className="text-[10px] font-medium tracking-[2px] uppercase px-2"
                                style={{ color: '#22c55e', opacity: 0.7 }}>
                                Active
                              </span>
                              <div className="h-px flex-1"
                                style={{ background: 'linear-gradient(to right, transparent, rgba(34,197,94,0.2), transparent)' }} />
                            </div>
                            <div
                              className="w-full py-3 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2.5"
                              style={{
                                background: 'rgba(34,197,94,0.04)',
                                color: '#22c55e',
                                border: '1px solid rgba(34,197,94,0.15)',
                                opacity: 0.85,
                              }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                              </svg>
                              You're subscribed
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment Info */}
            <div className="max-w-3xl mx-auto">
              <div className="relative rounded-2xl overflow-hidden"
                style={{ background: '#0c0708', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.15), transparent)' }} />
                <div className="px-8 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <svg className="w-4 h-4" style={{ color: '#d4a853' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      {t('pricing.payment_title')}
                    </h3>
                  </div>
                  <p className="text-xs mb-5 max-w-lg mx-auto leading-relaxed" style={{ color: '#6b5c52' }}>
                    {t('pricing.payment_desc')}
                  </p>
                  <div className="flex items-center justify-center gap-8 text-[11px]" style={{ color: '#534a42' }}>
                    <span className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                      {t('pricing.auto_verify')}
                    </span>
                    <span className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                      {t('pricing.usdt_bep20')}
                    </span>
                    <span className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                      {t('pricing.instant_act')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-10">
              <button
                onClick={() => navigate('/')}
                className="text-xs transition-colors hover:text-white"
                style={{ color: '#534a42' }}
              >
                {t('pricing.back')}
              </button>
            </div>
          </>
        )}
      </div>

      <SubscribeViaAdminModal
        isOpen={!!adminModalPlan}
        onClose={() => setAdminModalPlan(null)}
        plan={adminModalPlan}
      />
    </div>
  );
};

export default PricingPage;