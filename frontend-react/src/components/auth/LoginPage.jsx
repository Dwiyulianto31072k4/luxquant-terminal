// src/components/auth/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ensureTelegram } from '../../utils/telegramLoader';
import LeftBrandPanel, { AssetCoins } from './LeftBrandPanel';
import ReferralBanner from './ReferralBanner';

const LoginPage = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  // Which login button is "active" (white). Default = first (Telegram); follows
  // hover. Reset to null on leaving the group → falls back to the first.
  const [hoverIdx, setHoverIdx] = useState(null);
  // "More Options" — mobile bottom sheet / desktop inline expand (holds Discord).
  const [showMore, setShowMore] = useState(false);
  // Referral code (collapsible, MEXC-style).
  const [refOpen, setRefOpen] = useState(false);
  const [refCode, setRefCode] = useState('');
  // Telegram widget readiness — tombol Telegram dikunci sampai script siap,
  // supaya klik pertama tidak pernah jatuh ke error "not-ready".
  const [telegramReady, setTelegramReady] = useState(!!window.Telegram?.Login?.auth);
  const { loginWithGoogle, loginWithTelegram, loginWithDiscord, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/home', { replace: true });
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
    <div className="min-h-screen flex flex-col lg:flex-row overflow-x-hidden" style={{ background: 'radial-gradient(ellipse at 16% 22%, rgba(150,28,28,0.30) 0%, transparent 46%), linear-gradient(100deg, #2c0d10 0%, #1c0809 33%, #110607 57%, #0a0506 100%)' }}>
      {/* Desktop left panel (hidden on mobile) — now part of one continuous page */}
      <LeftBrandPanel />

      {/* RIGHT — Login Form (full width on mobile) */}
      <div className="w-full lg:w-[45%] flex items-start justify-center lg:items-center relative flex-1 px-5 sm:px-8 py-0 lg:px-10 lg:py-8">

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
          @keyframes lq-sheet-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
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

        {/* CONTENT — mobile: no card (MEXC style); desktop: glass card */}
        <div className="lq-card-enter relative z-10 w-full max-w-[420px] lg:max-w-[448px] flex flex-col min-h-[100svh] pt-[11vh] pb-8 lg:block lg:min-h-0 px-2 lg:px-10 lg:py-14 lg:rounded-[1.9rem] lg:border lg:border-[#ececee] lg:bg-white lg:shadow-[0_30px_70px_-18px_rgba(0,0,0,0.6)]">

          {/* ── Desktop heading (small account line, dark on white) ── */}
          <div className="mb-9 hidden lg:block text-left">
            <h1 className="font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#0a0a0a', lineHeight: 1.22, fontSize: 'clamp(20px, 2.1vw, 26px)' }}>
              {a('login_subtitle')}
            </h1>
          </div>

          {/* ── Mobile hero (centered) — mirrors the desktop brand panel ── */}
          <div className="lg:hidden text-center">
            <h1 className="mx-auto font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#ffffff', lineHeight: 1.12, fontSize: 'clamp(31px, 8.6vw, 42px)', maxWidth: '14ch' }}>
              Detect <span style={{ color: '#d4a853' }}>Crypto</span> &amp; Tokenized <span style={{ color: '#d4a853' }}>TradFi</span> Moves
            </h1>
            {/* coins right under the headline */}
            <AssetCoins size={38} className="mt-8" />
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

          {/* ════════ DESKTOP — MEXC-style card content ════════ */}
          <div className="hidden lg:block">
            <div className="space-y-3.5 mt-8" onMouseLeave={() => setHoverIdx(null)}>
              <LoginButton active={(hoverIdx ?? 0) === 0} onHover={() => setHoverIdx(0)} icon={<TelegramIcon />} text={a('continue_telegram')} onClick={handleTelegramLogin} loading={!telegramReady || telegramLoading} loadingText={!telegramReady ? a('preparing') : a('connecting')} />
              <LoginButton active={(hoverIdx ?? 0) === 1} onHover={() => setHoverIdx(1)} icon={<GoogleIcon />} text={a('continue_google')} onClick={handleGoogleLogin} loading={googleLoading} loadingText={a('connecting')} />

              {/* More Options — pill + connected dropdown (MEXC effect) */}
              <div className="relative">
                <button type="button" onMouseEnter={() => setHoverIdx(2)} onClick={() => setShowMore(v => !v)}
                        className="lq-login-btn relative w-full rounded-full font-semibold flex items-center justify-center transition-all duration-300"
                        style={{ padding: '15px 22px', background: '#f5f5f6', border: '1px solid #e7e7ea', color: '#18181b', fontSize: 'clamp(13.5px,1.7vw,15px)' }}>
                  <span>More Options</span>
                  <svg className="absolute right-6 h-4 w-4 transition-transform duration-300" style={{ transform: showMore ? 'rotate(180deg)' : 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {showMore && (
                  <div className="mt-2 overflow-hidden rounded-[1.4rem]"
                       style={{ background: '#ffffff', boxShadow: '0 16px 38px rgba(0,0,0,0.16)', animation: 'lq-item-in 0.26s cubic-bezier(0.16,1,0.3,1) both' }}>
                    <button type="button" onClick={handleDiscordLogin} disabled={discordLoading}
                            className="relative w-full flex items-center justify-center font-semibold transition-colors disabled:opacity-50"
                            style={{ padding: '16px 22px', color: '#18181b', fontSize: 'clamp(13.5px,1.7vw,15px)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span className="absolute left-5 flex items-center justify-center" style={{ width: 22, height: 22 }}><DiscordIcon /></span>
                      <span>{discordLoading ? a('connecting') : a('continue_discord')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Referral Code (Optional) — collapsible */}
            <div className="mt-7">
              <button type="button" onClick={() => setRefOpen(v => !v)}
                      className="flex items-center gap-1.5 transition-colors"
                      style={{ color: '#6b7280', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Referral Code (Optional)
                <svg className="h-3.5 w-3.5 transition-transform duration-300" style={{ transform: refOpen ? 'rotate(180deg)' : 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {refOpen && (
                <input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="Enter invitation code (case-sensitive)"
                       className="mt-2.5 w-full rounded-2xl px-4 py-3.5 outline-none transition-colors"
                       style={{ background: '#f7f7f8', border: '1px solid #e4e4e7', color: '#18181b', fontSize: 14, animation: 'lq-item-in 0.25s ease both' }} />
              )}
            </div>

            {/* Footer */}
            <p className="mt-7 text-center" style={{ color: '#6b7280', fontSize: 13 }}>
              Already have an account?{' '}
              <button type="button" onClick={handleTelegramLogin} className="font-semibold transition-opacity hover:opacity-80" style={{ color: '#c8941f', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>Log in now!</button>
            </p>
            <p className="mt-3 text-center leading-relaxed" style={{ color: '#9ca3af', fontSize: 11.5 }}>
              By continuing, you agree to our{' '}
              <button type="button" onClick={() => setShowTerms(true)} className="underline underline-offset-2" style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5 }}>User Agreement</button>
              {' '}and{' '}
              <button type="button" onClick={() => setShowTerms(true)} className="underline underline-offset-2" style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5 }}>Privacy Policy</button>
            </p>
          </div>

          {/* ════════ MOBILE — MEXC pattern (pills + "or" + More Options) ════════ */}
          <div className="lg:hidden flex flex-1 flex-col mt-11">
            {/* small thin login descriptor — sits right above the form */}
            <p className="mx-auto mb-6 text-center" style={{ color: '#9a8a7e', fontWeight: 400, fontSize: 'clamp(12.5px, 3.4vw, 14px)', maxWidth: '32ch', lineHeight: 1.5 }}>{a('login_subtitle')}</p>
            {/* Primary — Telegram (white pill) */}
            <PillButton variant="white" icon={<TelegramIcon />} text={a('continue_telegram')} onClick={handleTelegramLogin} loading={!telegramReady || telegramLoading} loadingText={!telegramReady ? a('preparing') : a('connecting')} />

            {/* or */}
            <div className="my-4 flex items-center gap-4">
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
              <span style={{ color: '#6f6f74', fontSize: 14 }}>or</span>
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
            </div>

            {/* Secondary — Google (dark pill) */}
            <PillButton variant="dark" icon={<GoogleIcon />} text={a('continue_google')} onClick={handleGoogleLogin} loading={googleLoading} loadingText={a('connecting')} />

            {/* More Options → bottom sheet (Discord) */}
            <button type="button" onClick={() => setShowMore(true)}
                    className="mt-5 w-full py-2.5 text-center font-semibold transition-colors"
                    style={{ color: '#9a9aa0', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#9a9aa0'; }}>
              More Options
            </button>

            {/* Footer — pinned to the bottom of the viewport */}
            <p className="mt-auto pt-12 text-center leading-relaxed" style={{ color: '#7a6b60', fontSize: 12 }}>
              {a('login_terms')}{' '}
              <button type="button" onClick={() => setShowTerms(true)} className="underline underline-offset-2" style={{ color: '#c4b3a3', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600 }}>{a('terms')}</button>
            </p>
          </div>
        </div>

        {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

        {/* MOBILE — "More Options" bottom sheet (Discord), slides up */}
        {showMore && (
          <div className="fixed inset-0 z-[9998] lg:hidden" onClick={() => setShowMore(false)}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.62)', animation: 'lq-modal-fade 0.2s ease-out' }} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-[1.75rem] px-5 pb-9 pt-3"
                 onClick={e => e.stopPropagation()}
                 style={{ background: '#161618', borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)', animation: 'lq-sheet-up 0.34s cubic-bezier(0.16,1,0.3,1)' }}>
              <div className="mx-auto mb-5 h-1 w-10 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
              <h3 className="mb-4 font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}>More Options</h3>
              <PillButton variant="dark" icon={<DiscordIcon />} text={a('continue_discord')} onClick={handleDiscordLogin} loading={discordLoading} loadingText={a('connecting')} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Pill Button (mobile, MEXC-style) — white = primary, dark = secondary ── */
const PillButton = ({ icon, text, onClick, loading = false, loadingText = 'Connecting...', variant = 'dark' }) => {
  const white = variant === 'white';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="relative w-full rounded-full font-semibold flex items-center justify-center transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: '16px 22px',
        fontSize: 'clamp(14px, 4.2vw, 16px)',
        background: white ? '#ffffff' : 'rgba(255,255,255,0.06)',
        color: white ? '#0a0a0a' : '#ffffff',
        border: white ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: white ? '0 10px 26px rgba(0,0,0,0.4)' : 'none',
      }}>
      {loading ? (
        <span className="flex items-center gap-2.5">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {loadingText}
        </span>
      ) : (
        <>
          <span className="absolute left-5 flex items-center justify-center" style={{ width: 22, height: 22 }}>{icon}</span>
          <span>{text}</span>
        </>
      )}
    </button>
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
         style={{ background: 'rgba(6,3,3,0.84)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', animation: 'lq-modal-fade 0.2s ease-out' }}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative w-full max-w-2xl flex flex-col rounded-[1.75rem] overflow-hidden"
           style={{
             maxHeight: '85vh',
             background: 'radial-gradient(ellipse at 18% 0%, rgba(150,28,28,0.28) 0%, transparent 55%), linear-gradient(160deg, #2c0d10 0%, #1c0809 38%, #110607 64%, #0a0506 100%)',
             border: '1px solid rgba(255,255,255,0.08)',
             boxShadow: '0 40px 100px rgba(0,0,0,0.85), 0 0 70px rgba(150,28,28,0.12)',
             animation: 'lq-modal-pop 0.3s cubic-bezier(0.16,1,0.3,1)',
           }}>

        {/* Gold hairline */}
        <div className="absolute top-0 left-[8%] right-[8%] h-px pointer-events-none"
             style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.5), transparent)' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 sm:px-9 pt-7 sm:pt-9 pb-5"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Terms & Conditions
            </h2>
            <p className="text-sm" style={{ color: '#9a8a7e' }}>
              Please read these terms carefully before using LuxQuant Terminal
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="flex items-center justify-center rounded-full transition-colors duration-200 flex-shrink-0 ml-4"
                  style={{ width: 36, height: 36, color: '#9a8a7e', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#9a8a7e'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
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
              <p className="text-[13px] leading-relaxed" style={{ color: '#9a8a7e' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-9 py-4 flex items-center justify-end"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)' }}>
          <button type="button" onClick={onClose}
                  className="rounded-full text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                  style={{ padding: '12px 30px', background: '#ffffff', color: '#0a0a0a', boxShadow: '0 10px 24px rgba(0,0,0,0.4)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ececef'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}>
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Login Button ── (active = black; inactive = light grey) */
const LoginButton = ({ icon, text, onClick, loading = false, loadingText = 'Connecting...', active = false, onHover }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseEnter={onHover}
    disabled={loading}
    className="lq-login-btn relative w-full rounded-full font-semibold transition-all duration-300 flex items-center justify-center active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
    style={{
      padding: '15px 22px',
      background: active ? '#0a0a0a' : '#f5f5f6',
      border: active ? '1px solid #0a0a0a' : '1px solid #e7e7ea',
      color: active ? '#ffffff' : '#18181b',
      boxShadow: active ? '0 10px 24px rgba(0,0,0,0.22)' : 'none',
      fontSize: 'clamp(13.5px, 1.7vw, 15px)',
    }}>
    {loading ? (
      <span className="flex items-center gap-2.5">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        {loadingText}
      </span>
    ) : (
      <>
        <span className="absolute left-5 flex items-center justify-center" style={{ width: 22, height: 22 }}>{icon}</span>
        <span>{text}</span>
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