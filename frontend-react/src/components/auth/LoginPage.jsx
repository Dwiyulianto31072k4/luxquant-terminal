// src/components/auth/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ensureTelegram } from '../../utils/telegramLoader';
import LeftBrandPanel, { MobileGlobeSection, TypewriterLine } from './LeftBrandPanel';
import ReferralBanner from './ReferralBanner';

const LoginPage = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  // Telegram widget readiness — tombol Telegram dikunci sampai script siap,
  // supaya klik pertama tidak pernah jatuh ke error "not-ready".
  const [telegramReady, setTelegramReady] = useState(!!window.Telegram?.Login?.auth);
  const { loginWithGoogle, loginWithTelegram, loginWithDiscord, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // Preload Telegram widget on mount; unlock the button once ready.
  useEffect(() => {
    let alive = true;
    ensureTelegram()
      .then(() => { if (alive) setTelegramReady(true); })
      .catch(() => { /* tetap terkunci; user pakai Google/Discord */ });
    return () => { alive = false; };
  }, []);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.error('Google login error:', err);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleTelegramLogin = async () => {
    setTelegramLoading(true);
    setError(null);
    try {
      await loginWithTelegram();
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.error('Telegram login error:', err);
      }
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    setError(null);
    try {
      await loginWithDiscord();
    } catch (err) {
      console.error('Discord login error:', err);
    } finally {
      setDiscordLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'rgba(212,168,83,0.2)' }} />
            <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#d4a853' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: '#8a7a6e' }}>{a('redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-x-hidden" style={{ background: '#0a0506' }}>
      {/* Desktop left panel (hidden on mobile) */}
      <LeftBrandPanel />

      {/* RIGHT — Login Form (full width on mobile) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center relative flex-1 p-4 sm:p-6 lg:p-8">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,26,26,0.1) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(212,168,83,0.04) 0%, transparent 50%)' }} />
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent 10%, rgba(212,168,83,0.15) 50%, transparent 90%)' }} />

        <style>{`
          @keyframes lq-blink { 50% { opacity: 0; } }
          @keyframes lq-card-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes lq-item-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          .lq-card-enter { animation: lq-card-in 0.5s cubic-bezier(0.16,1,0.3,1) both; }
          .lq-stagger > * { animation: lq-item-in 0.45s cubic-bezier(0.16,1,0.3,1) both; }
          .lq-stagger > *:nth-child(1) { animation-delay: 0.08s; }
          .lq-stagger > *:nth-child(2) { animation-delay: 0.16s; }
          .lq-stagger > *:nth-child(3) { animation-delay: 0.24s; }
          .lq-login-btn:focus-visible { outline: 2px solid rgba(212,168,83,0.6); outline-offset: 2px; }
          @keyframes lq-modal-fade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes lq-modal-pop { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
          .lq-terms-scroll::-webkit-scrollbar { width: 5px; }
          .lq-terms-scroll::-webkit-scrollbar-track { background: transparent; }
          .lq-terms-scroll::-webkit-scrollbar-thumb { background: rgba(212,168,83,0.25); border-radius: 999px; }
          @media (prefers-reduced-motion: reduce) {
            .lq-card-enter, .lq-stagger > * { animation: none !important; }
          }
        `}</style>

        {/* LOGO MOBILE */}
        <div className="lg:hidden absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2.5 z-30">
          <img src="/logo.png" alt="LuxQuant" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <span className="text-white font-bold tracking-wide" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17 }}>LuxQuant</span>
        </div>

        {/* GLASS CARD */}
        <div className="lq-card-enter relative z-10 w-full max-w-md px-5 py-7 sm:px-10 sm:py-11 rounded-[1.75rem] mt-16 sm:mt-20 lg:mt-0 mb-6 lg:mb-0"
             style={{
               background: 'linear-gradient(170deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)',
               border: '1px solid rgba(212, 168, 83, 0.12)',
               backdropFilter: 'blur(24px)',
               WebkitBackdropFilter: 'blur(24px)',
               boxShadow: '0 25px 60px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
             }}>

          {/* Gold hairline along the card's top edge */}
          <div className="absolute top-0 left-[12%] right-[12%] h-px pointer-events-none"
               style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.55), transparent)' }} />

          {/* Heading */}
          <div className="mb-2 text-center lg:text-left">
            <h1 className="text-2xl sm:text-[28px] font-bold text-white mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {a('login_title')}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: '#8a7a6e' }}>{a('login_subtitle')}</p>
          </div>

          {/* Mobile typewriter */}
          <div className="lg:hidden mb-1 mt-2">
            <TypewriterLine mobile />
          </div>

          {/* Mobile device mockup — compact */}
          <div className="lg:hidden mb-1">
            <MobileGlobeSection />
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl text-sm flex items-center gap-3"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {error}
            </div>
          )}

          <ReferralBanner className="mb-4" />

          {/* Login Buttons */}
          <div className="lq-stagger space-y-3 mt-5 sm:mt-7">
            <LoginButton
              icon={<GoogleIcon />}
              text={a('continue_google')}
              onClick={handleGoogleLogin}
              loading={googleLoading}
              loadingText={a('connecting')}
            />
            <LoginButton
              icon={<TelegramIcon />}
              text={a('continue_telegram')}
              onClick={handleTelegramLogin}
              loading={!telegramReady || telegramLoading}
              loadingText={!telegramReady ? a('preparing') : a('connecting')}
            />
            <LoginButton
              icon={<DiscordIcon />}
              text={a('continue_discord')}
              onClick={handleDiscordLogin}
              loading={discordLoading}
              loadingText={a('connecting')}
            />
          </div>

          {/* Divider */}
          <div className="mt-6 sm:mt-8 mb-4 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.15))' }} />
            <div className="flex items-center gap-1.5" style={{ color: '#6b5c52' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <span style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>{a('secure_login')}</span>
            </div>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, rgba(212,168,83,0.15))' }} />
          </div>

          <p className="text-center pb-1 leading-relaxed" style={{ color: '#6b5c52', fontSize: 11 }}>
            {a('login_terms')}{' '}
            <button type="button" onClick={() => setShowTerms(true)}
                    className="underline underline-offset-2 hover:opacity-80 transition-opacity"
                    style={{ color: '#b8a89a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>
              {a('terms')}
            </button>
          </p>
        </div>

        {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      </div>
    </div>
  );
};

/* ── Terms & Conditions Modal ── */
const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By accessing or using LuxQuant Terminal ("the Platform"), you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, you must not use the Platform. We may update these terms from time to time; continued use of the Platform after changes constitutes acceptance of the revised terms.',
  },
  {
    title: '2. Nature of the Service',
    body: 'LuxQuant Terminal is a data and analytics platform. We surface market data, algorithmic signals, on-chain metrics, and AI-generated analysis for informational purposes. The Platform informs — it does not decide for you. Nothing on the Platform constitutes financial, investment, legal, or tax advice, and no content should be interpreted as a recommendation to buy, sell, or hold any digital asset.',
  },
  {
    title: '3. Risk Disclosure',
    body: 'Trading cryptocurrency involves substantial risk and may result in the loss of part or all of your capital. Digital asset markets are highly volatile and operate 24/7. Past performance of any signal, strategy, or analysis is not indicative of future results. You are solely responsible for your own trading decisions and should never trade with funds you cannot afford to lose. Consider consulting a licensed financial advisor before making investment decisions.',
  },
  {
    title: '4. Eligibility',
    body: 'You must be at least 18 years old and legally permitted to use cryptocurrency-related services in your jurisdiction. You are responsible for ensuring that your use of the Platform complies with all laws and regulations applicable to you. The Platform is not directed at any jurisdiction where its use would be unlawful.',
  },
  {
    title: '5. Accounts & Security',
    body: 'You sign in through third-party identity providers (Google, Telegram, or Discord). You are responsible for maintaining the security of those accounts. You must notify us promptly of any unauthorized access. We reserve the right to suspend or terminate accounts that violate these terms or that we reasonably believe are compromised.',
  },
  {
    title: '6. Subscriptions & Payments',
    body: 'Certain features require a paid subscription. Subscription fees, billing periods, and included features are described at the point of purchase. Fees are non-refundable except where required by law. We may modify pricing or features with reasonable notice; changes apply from your next billing cycle. Access tied to community membership (e.g., VIP groups) may be re-verified periodically.',
  },
  {
    title: '7. Automated Trading Features',
    body: 'If you enable automated trading, you do so entirely at your own risk. You connect your own exchange API keys, which are encrypted at rest, and you retain full control and responsibility over your exchange account, position sizing, and risk parameters. Automated execution can be affected by exchange outages, network latency, slippage, and market conditions beyond our control. We are not liable for losses arising from automated trade execution.',
  },
  {
    title: '8. Data & Privacy',
    body: 'We collect only the information necessary to operate the Platform: your authentication profile (email, username, avatar), subscription status, and usage data. Exchange API keys are stored encrypted and are never shared with third parties. We do not sell your personal data. You may request deletion of your account and associated data by contacting support.',
  },
  {
    title: '9. Acceptable Use',
    body: 'You agree not to: (a) redistribute, resell, or publicly share signals, data, or analysis from the Platform without written permission; (b) reverse-engineer, scrape, or abuse the Platform or its APIs; (c) use the Platform for unlawful activity, including market manipulation; (d) share your account access with others. Violation may result in immediate termination without refund.',
  },
  {
    title: '10. Intellectual Property',
    body: 'All content, branding, algorithms, software, and design on the Platform are the property of LuxQuant or its licensors and are protected by applicable intellectual property laws. Your subscription grants you a limited, non-exclusive, non-transferable license for personal use only.',
  },
  {
    title: '11. Limitation of Liability',
    body: 'To the maximum extent permitted by law, LuxQuant and its operators shall not be liable for any direct, indirect, incidental, consequential, or exemplary damages — including trading losses, lost profits, or data loss — arising from your use of, or inability to use, the Platform. The Platform is provided "as is" and "as available" without warranties of any kind, including accuracy, completeness, or uninterrupted availability of data and signals.',
  },
  {
    title: '12. Termination',
    body: 'You may stop using the Platform at any time. We may suspend or terminate your access if you breach these terms, with or without notice. Sections relating to risk, intellectual property, and limitation of liability survive termination.',
  },
  {
    title: '13. Contact',
    body: 'For questions about these Terms & Conditions, account issues, or data requests, contact us through the official LuxQuant Telegram channel or the support contact listed on the Platform.',
  },
];

const TermsModal = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6"
         style={{ background: 'rgba(4,2,2,0.8)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', animation: 'lq-modal-fade 0.2s ease-out' }}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
           style={{
             maxHeight: '85vh',
             background: 'linear-gradient(170deg, #14100b 0%, #0b0807 100%)',
             border: '1px solid rgba(212,168,83,0.16)',
             boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 80px rgba(212,168,83,0.05)',
             animation: 'lq-modal-pop 0.3s cubic-bezier(0.16,1,0.3,1)',
           }}>

        {/* Gold hairline */}
        <div className="absolute top-0 left-[8%] right-[8%] h-px pointer-events-none"
             style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.5), transparent)' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 sm:px-9 pt-7 sm:pt-9 pb-5"
             style={{ borderBottom: '1px solid rgba(212,168,83,0.08)' }}>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Terms & Conditions
            </h2>
            <p className="text-sm" style={{ color: '#8a7a6e' }}>
              Please read these terms carefully before using LuxQuant Terminal
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="flex items-center justify-center rounded-xl transition-colors duration-200 flex-shrink-0 ml-4"
                  style={{ width: 36, height: 36, color: '#8a7a6e', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,83,0.12)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(212,168,83,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#8a7a6e'; e.currentTarget.style.borderColor = 'rgba(212,168,83,0.12)'; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="lq-terms-scroll overflow-y-auto px-6 sm:px-9 py-6" style={{ flex: 1 }}>
          <p className="mb-6 text-xs uppercase font-semibold" style={{ color: '#d4a853', letterSpacing: '0.18em' }}>
            Last updated · June 2026
          </p>
          {TERMS_SECTIONS.map((s) => (
            <div key={s.title} className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {s.title}
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: '#9a8c80' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-9 py-4 flex items-center justify-end"
             style={{ borderTop: '1px solid rgba(212,168,83,0.08)', background: 'rgba(0,0,0,0.2)' }}>
          <button type="button" onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                  style={{ background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.35)', color: '#e8c882' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.2)'; e.currentTarget.style.borderColor = 'rgba(212,168,83,0.55)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.12)'; e.currentTarget.style.borderColor = 'rgba(212,168,83,0.35)'; }}>
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Login Button ── */
const LoginButton = ({ icon, text, onClick, loading = false, loadingText = 'Connecting...' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="lq-login-btn group w-full py-3.5 sm:py-4 px-4 rounded-2xl font-semibold text-sm transition-all duration-300 flex items-center gap-3 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
    style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(212,168,83,0.18)',
      color: '#d4cfc8',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}
    onMouseEnter={e => {
      if (!loading) {
        e.currentTarget.style.borderColor = 'rgba(212,168,83,0.5)';
        e.currentTarget.style.background = 'rgba(212,168,83,0.07)';
        e.currentTarget.style.color = '#fff';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(212,168,83,0.12)';
      }
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'rgba(212,168,83,0.18)';
      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      e.currentTarget.style.color = '#d4cfc8';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    }}>
    {loading ? (
      <>
        <span className="flex items-center justify-center" style={{ width: 34, height: 34 }}>
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </span>
        <span className="flex-1 text-left">{loadingText}</span>
      </>
    ) : (
      <>
        <span className="flex items-center justify-center rounded-xl transition-colors duration-300"
              style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {icon}
        </span>
        <span className="flex-1 text-left">{text}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             className="opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all duration-300">
          <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
        </svg>
      </>
    )}
  </button>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const TelegramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#29ABE2">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
  </svg>
);

export default LoginPage;