// src/components/auth/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import LeftBrandPanel, { MobileGlobeSection, TypewriterLine } from './LeftBrandPanel';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const { login, loginWithGoogle, loginWithTelegram, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try { 
      await login(email, password); 
    }
    catch (err) { /* handled in context */ }
    finally { setLoading(false); }
  };

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

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'rgba(212,168,83,0.2)' }} />
            <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#d4a853' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: '#8a7a6e' }}>Mengarahkan ke dashboard...</p>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1.5" style={{ fontFamily: 'Playfair Display, serif' }}>Login</h1>
            <p className="text-sm" style={{ color: '#8a7a6e' }}>Masuk ke akun LuxQuant Terminal kamu</p>
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

          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-5">
            <FormInput label="Email" type="email" value={email} onChange={setEmail} placeholder="contoh@email.com" />
            <div>
              <div className="flex justify-between items-center mb-1.5 sm:mb-2">
                <label className="block text-sm font-medium" style={{ color: '#b8a89a' }}>Password</label>
                <button type="button" className="text-xs font-medium hover:underline transition-all" style={{ color: '#d4a853' }}>Lupa password?</button>
              </div>
              <PasswordField value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword(!showPassword)} placeholder="Masukkan Password" />
            </div>
            <div className="pt-1">
              <GoldButton loading={loading} text="Masuk Terminal" loadingText="Memverifikasi..." />
            </div>
          </form>

          <Divider text="Atau masuk dengan" />
          <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
            <SocialBtn 
              icon={<GoogleIcon />} 
              text="Google" 
              onClick={handleGoogleLogin}
              loading={googleLoading}
            />
            <SocialBtn 
              icon={<TelegramIcon />} 
              text="Telegram" 
              onClick={handleTelegramLogin}
              loading={telegramLoading}
            />
          </div>

          <p className="mt-4 sm:mt-8 text-center text-sm" style={{ color: '#8a7a6e' }}>
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold transition-all hover:tracking-wide" style={{ color: '#d4a853' }}>Daftar Sekarang</Link>
          </p>
          <p className="mt-2.5 sm:mt-4 text-center pb-1" style={{ color: '#6b5c52', fontSize: 11 }}>
            Dengan login, kamu setuju dengan <a href="#" className="underline hover:opacity-80 transition-opacity" style={{ color: '#b8a89a' }}>Terms & Conditions</a>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Shared form components ── */

const FormInput = ({ label, type = 'text', value, onChange, placeholder }) => (
  <div>
    {label && <label className="block text-sm font-medium mb-1.5 sm:mb-2" style={{ color: '#b8a89a' }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3 sm:py-3.5 rounded-2xl text-white text-sm focus:outline-none transition-all duration-300"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={e => { 
        e.target.style.borderColor = '#d4a853'; 
        e.target.style.boxShadow = '0 0 0 4px rgba(212,168,83,0.15)';
        e.target.style.background = 'rgba(0,0,0,0.5)';
      }}
      onBlur={e => { 
        e.target.style.borderColor = 'rgba(212,168,83,0.15)'; 
        e.target.style.boxShadow = 'none';
        e.target.style.background = 'rgba(0,0,0,0.3)';
      }} />
  </div>
);

const PasswordField = ({ value, onChange, show, toggle, placeholder }) => (
  <div className="relative group">
    <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3 sm:py-3.5 pr-12 rounded-2xl text-white text-sm focus:outline-none transition-all duration-300"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={e => { 
        e.target.style.borderColor = '#d4a853'; 
        e.target.style.boxShadow = '0 0 0 4px rgba(212,168,83,0.15)';
        e.target.style.background = 'rgba(0,0,0,0.5)';
      }}
      onBlur={e => { 
        e.target.style.borderColor = 'rgba(212,168,83,0.15)'; 
        e.target.style.boxShadow = 'none';
        e.target.style.background = 'rgba(0,0,0,0.3)';
      }} />
    <button type="button" onClick={toggle} className="absolute right-4 top-1/2 p-1 rounded-md transition-all" style={{ transform: 'translateY(-50%)', color: '#6b5c52', background: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#d4a853'; e.currentTarget.style.background = 'rgba(212,168,83,0.1)'; }} 
      onMouseLeave={e => { e.currentTarget.style.color = '#6b5c52'; e.currentTarget.style.background = 'transparent'; }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {show ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
      </svg>
    </button>
  </div>
);

const GoldButton = ({ loading, text, loadingText }) => (
  <button type="submit" disabled={loading}
    className="w-full py-3.5 sm:py-4 font-bold rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group active:scale-[0.98]"
    style={{ background: 'linear-gradient(135deg, #d4a853 0%, #8b6914 100%)', color: '#0a0506', boxShadow: loading ? 'none' : '0 10px 25px -5px rgba(212,168,83,0.4)' }}>
    <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, #fceca1 0%, #d4a853 100%)' }} />
    <span className="relative flex justify-center items-center gap-2">
      {loading ? (
        <>
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {loadingText}
        </>
      ) : text}
    </span>
  </button>
);

const Divider = ({ text }) => (
  <div className="flex items-center gap-4 my-4 sm:my-7 opacity-70">
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.4))' }} />
    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7a6e' }}>{text}</span>
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(212,168,83,0.4))' }} />
  </div>
);

const SocialBtn = ({ icon, text, onClick, loading = false }) => (
  <button 
    type="button"
    onClick={onClick}
    disabled={loading}
    className="w-full py-3 sm:py-3.5 rounded-2xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 hover:-translate-y-1 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(212,168,83,0.15)', color: '#b8a89a' }}
    onMouseEnter={e => { 
      if (!loading) {
        e.currentTarget.style.borderColor = 'rgba(212,168,83,0.4)'; 
        e.currentTarget.style.background = 'rgba(212,168,83,0.08)'; 
        e.currentTarget.style.color = '#fff';
      }
    }}
    onMouseLeave={e => { 
      e.currentTarget.style.borderColor = 'rgba(212,168,83,0.15)'; 
      e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; 
      e.currentTarget.style.color = '#b8a89a';
    }}>
    {loading ? (
      <>
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span>Loading...</span>
      </>
    ) : (
      <>
        {icon} <span>{text}</span>
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

export default LoginPage;