// src/components/auth/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftBrandPanel, { MobileGlobeSection, TypewriterLine } from './LeftBrandPanel';

const LoginPage = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const { loginWithGoogle, loginWithTelegram, loginWithDiscord, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
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
      if (err.message !== 'Dibatalkan') {
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
      <div className="w-full lg:w-[45%] flex items-center justify-center relative flex-1 p-4 sm:p-6 lg:p-0">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,26,26,0.1) 0%, transparent 60%)' }} />
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent 10%, rgba(212,168,83,0.15) 50%, transparent 90%)' }} />
        <style>{`@keyframes lq-blink { 50% { opacity: 0; } }`}</style>

        {/* LOGO MOBILE */}
        <div className="lg:hidden absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2.5 z-30">
          <img src="/logo.png" alt="LuxQuant" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <span className="text-white font-bold tracking-wide" style={{ fontFamily: 'Playfair Display, serif', fontSize: 17 }}>LuxQuant</span>
        </div>

        {/* GLASSMORPHISM WRAPPER */}
        <div className="relative z-10 w-full max-w-md px-5 py-6 sm:px-10 sm:py-10 rounded-[2rem] transition-all duration-500 mt-16 sm:mt-20 lg:mt-0 mb-6 lg:mb-0"
             style={{ 
               background: 'rgba(255, 255, 255, 0.02)', 
               border: '1px solid rgba(212, 168, 83, 0.08)',
               backdropFilter: 'blur(20px)',
               WebkitBackdropFilter: 'blur(20px)',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
             }}>

          {/* Heading */}
          <div className="mb-1 text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1.5" style={{ fontFamily: 'Playfair Display, serif' }}>{a('login_title')}</h1>
            <p className="text-sm" style={{ color: '#8a7a6e' }}>{a('login_subtitle')}</p>
          </div>

          {/* Mobile typewriter */}
          <div className="lg:hidden mb-1 mt-2">
            <TypewriterLine mobile />
          </div>

          {/* Mobile globe — more compact */}
          <div className="lg:hidden mb-1">
            <MobileGlobeSection />
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl text-sm flex items-center gap-3 animate-pulse" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          )}

          {/* Login Buttons */}
          <div className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
            <LoginButton
              icon={<GoogleIcon />}
              text={a('continue_google') || 'Continue with Google'}
              onClick={handleGoogleLogin}
              loading={googleLoading}
              loadingText="Connecting..."
            />
            <LoginButton
              icon={<TelegramIcon />}
              text={a('continue_telegram') || 'Continue with Telegram'}
              onClick={handleTelegramLogin}
              loading={telegramLoading}
              loadingText="Connecting..."
            />
            <LoginButton
              icon={<DiscordIcon />}
              text={a('continue_discord') || 'Continue with Discord'}
              onClick={handleDiscordLogin}
              loading={discordLoading}
              loadingText="Connecting..."
            />
          </div>

          {/* Security note */}
          <div className="mt-6 sm:mt-8 flex items-center justify-center gap-2" style={{ color: '#6b5c52' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span style={{ fontSize: 11 }}>{a('secure_login') || 'Secure login — no password needed'}</span>
          </div>

          <p className="mt-4 sm:mt-6 text-center pb-1" style={{ color: '#6b5c52', fontSize: 11 }}>
            {a('login_terms')} <a href="#" className="underline hover:opacity-80 transition-opacity" style={{ color: '#b8a89a' }}>{a('terms')}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Login Button ── */
const LoginButton = ({ icon, text, onClick, loading = false, loadingText = 'Loading...' }) => (
  <button 
    type="button"
    onClick={onClick}
    disabled={loading}
    className="w-full py-3.5 sm:py-4 rounded-2xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-3 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
    style={{ 
      background: 'rgba(255,255,255,0.03)', 
      border: '1px solid rgba(212,168,83,0.2)', 
      color: '#d4cfc8',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}
    onMouseEnter={e => { 
      if (!loading) {
        e.currentTarget.style.borderColor = 'rgba(212,168,83,0.5)'; 
        e.currentTarget.style.background = 'rgba(212,168,83,0.08)'; 
        e.currentTarget.style.color = '#fff';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(212,168,83,0.15)';
      }
    }}
    onMouseLeave={e => { 
      e.currentTarget.style.borderColor = 'rgba(212,168,83,0.2)'; 
      e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; 
      e.currentTarget.style.color = '#d4cfc8';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    }}>
    {loading ? (
      <>
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span>{loadingText}</span>
      </>
    ) : (
      <>
        {icon} <span>{text}</span>
      </>
    )}
  </button>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#29ABE2">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
  </svg>
);

export default LoginPage;