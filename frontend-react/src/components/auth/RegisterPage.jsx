// src/components/auth/RegisterPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const { register, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // FIX BLANK PAGE: Navigate when auth state is settled
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setError(null);

    if (password !== confirmPassword) {
      setLocalError('Password tidak sama');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password minimal 8 karakter');
      return;
    }

    if (username.length < 3) {
      setLocalError('Username minimal 3 karakter');
      return;
    }

    setLoading(true);

    try {
      await register(email, username, password);
      // Navigation happens via useEffect when isAuthenticated becomes true
    } catch (err) {
      // Error sudah di-handle di context
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    // TODO: Implement Google OAuth
    console.log('Google register clicked');
  };

  const handleTelegramRegister = () => {
    // TODO: Implement Telegram login
    console.log('Telegram register clicked');
  };

  const displayError = localError || error;

  // Password strength indicator
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    
    if (score <= 1) return { level: 1, label: 'Lemah', color: '#f87171' };
    if (score <= 2) return { level: 2, label: 'Cukup', color: '#fbbf24' };
    if (score <= 3) return { level: 3, label: 'Bagus', color: '#4ade80' };
    return { level: 4, label: 'Kuat', color: '#22c55e' };
  };

  const strength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex" style={{ background: '#0a0506' }}>
      
      {/* ===== LEFT SIDE - Brand Showcase ===== */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background gradient layers */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, #1a0a0c 0%, #0d0405 40%, #120608 100%)'
        }} />
        
        {/* Gold radial glow */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(212, 168, 83, 0.08) 0%, transparent 60%)'
        }} />
        
        {/* Red accent glow */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 80% 20%, rgba(139, 26, 26, 0.3) 0%, transparent 50%)'
        }} />
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(212, 168, 83, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212, 168, 83, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Decorative elements */}
        <div className="absolute top-12 left-12 w-20 h-20 rounded-full opacity-10" style={{
          background: 'linear-gradient(135deg, #d4a853, #8b6914)',
          filter: 'blur(20px)'
        }} />
        <div className="absolute bottom-20 right-16 w-32 h-32 rounded-full opacity-10" style={{
          background: 'linear-gradient(135deg, #8b1a1a, #c42020)',
          filter: 'blur(30px)'
        }} />

        {/* Vertical line separator */}
        <div className="absolute top-0 right-0 w-px h-full opacity-20" style={{
          background: 'linear-gradient(to bottom, transparent, #d4a853, transparent)'
        }} />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #f0d890, #d4a853, #8b6914)',
              boxShadow: '0 4px 20px rgba(212, 168, 83, 0.3)'
            }}>
              <span className="text-xl font-bold" style={{ color: '#0a0506', fontFamily: 'Playfair Display, serif' }}>LQ</span>
            </div>
            <div>
              <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>LuxQuant</h2>
              <p className="text-[10px] uppercase tracking-[3px]" style={{ color: '#6b5c52' }}>Trading Terminal</p>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="mb-8">
              <div className="w-16 h-0.5 mb-6" style={{ background: 'linear-gradient(to right, #d4a853, transparent)' }} />
              <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                Bergabung dengan
                <br />
                <span style={{ color: '#d4a853' }}>LuxQuant</span>
              </h1>
              <p className="text-base leading-relaxed" style={{ color: '#b8a89a' }}>
                Buat akun gratis dan mulai akses sinyal trading premium, 
                analisis performa, dan market data real-time.
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-4">
              {[
                { icon: '✨', title: 'Gratis untuk Memulai', desc: 'Akses fitur dasar tanpa biaya' },
                { icon: '🔔', title: 'Notifikasi Real-time', desc: 'Alert instan untuk sinyal baru' },
                { icon: '📈', title: 'Performance Analytics', desc: 'Lacak win rate dan metrik trading' },
              ].map((feature, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 rounded-xl transition-all duration-300 group hover:translate-x-1" style={{
                  background: 'rgba(212, 168, 83, 0.03)',
                  border: '1px solid rgba(212, 168, 83, 0.08)'
                }}>
                  <span className="text-xl mt-0.5">{feature.icon}</span>
                  <div>
                    <h3 className="text-white font-semibold text-sm">{feature.title}</h3>
                    <p className="text-xs mt-0.5" style={{ color: '#6b5c52' }}>{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom - Trust signals */}
          <div className="flex items-center gap-6">
            {[
              { value: '1K+', label: 'Members' },
              { value: '85%+', label: 'Win Rate' },
              { value: '100%', label: 'Free Start' },
            ].map((stat, idx) => (
              <div key={idx}>
                <p className="text-2xl font-bold" style={{ color: '#d4a853', fontFamily: 'JetBrains Mono, monospace' }}>{stat.value}</p>
                <p className="text-xs uppercase tracking-wider" style={{ color: '#6b5c52' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== RIGHT SIDE - Register Form ===== */}
      <div className="w-full lg:w-[45%] flex items-center justify-center relative overflow-y-auto">
        {/* Subtle background */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(139, 26, 26, 0.15) 0%, transparent 60%)'
        }} />
        
        {/* Vertical separator */}
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{
          background: 'linear-gradient(to bottom, transparent 10%, rgba(212, 168, 83, 0.15) 50%, transparent 90%)'
        }} />

        <div className="relative z-10 w-full max-w-md px-8 py-10">
          
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-3" style={{
              background: 'linear-gradient(135deg, #f0d890, #d4a853, #8b6914)',
              boxShadow: '0 4px 20px rgba(212, 168, 83, 0.3)'
            }}>
              <span className="text-xl font-bold" style={{ color: '#0a0506', fontFamily: 'Playfair Display, serif' }}>LQ</span>
            </div>
            <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>LuxQuant Terminal</h2>
          </div>

          {/* BETA badge */}
          <div className="flex justify-end mb-4">
            <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full" style={{
              background: 'rgba(212, 168, 83, 0.15)',
              color: '#d4a853',
              border: '1px solid rgba(212, 168, 83, 0.3)'
            }}>Beta</span>
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Daftar
            </h1>
            <p style={{ color: '#6b5c52', fontSize: '14px' }}>
              Buat akun baru untuk mulai trading
            </p>
          </div>

          {/* Error Alert */}
          {displayError && (
            <div className="mb-5 p-4 rounded-xl text-sm flex items-center gap-3" style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {displayError}
            </div>
          )}

          {/* Social Register Buttons */}
          <div className="space-y-3 mb-6">
            <button
              onClick={handleGoogleRegister}
              className="w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-3"
              style={{ background: 'rgba(18, 8, 9, 0.6)', border: '1px solid rgba(212, 168, 83, 0.12)', color: '#b8a89a' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212, 168, 83, 0.3)'; e.currentTarget.style.background = 'rgba(212, 168, 83, 0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212, 168, 83, 0.12)'; e.currentTarget.style.background = 'rgba(18, 8, 9, 0.6)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Daftar dengan Google
            </button>

            <button
              onClick={handleTelegramRegister}
              className="w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-3"
              style={{ background: 'rgba(18, 8, 9, 0.6)', border: '1px solid rgba(212, 168, 83, 0.12)', color: '#b8a89a' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212, 168, 83, 0.3)'; e.currentTarget.style.background = 'rgba(212, 168, 83, 0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212, 168, 83, 0.12)'; e.currentTarget.style.background = 'rgba(18, 8, 9, 0.6)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#29ABE2">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Daftar dengan Telegram
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px" style={{ background: 'rgba(212, 168, 83, 0.1)' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: '#6b5c52' }}>Atau daftar dengan email</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(212, 168, 83, 0.1)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8a89a' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white transition-all duration-200 focus:outline-none text-sm"
                style={{ background: 'rgba(18, 8, 9, 0.8)', border: '1px solid rgba(212, 168, 83, 0.15)' }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.15)'}
                placeholder="you@example.com" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8a89a' }}>Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white transition-all duration-200 focus:outline-none text-sm"
                style={{ background: 'rgba(18, 8, 9, 0.8)', border: '1px solid rgba(212, 168, 83, 0.15)' }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.15)'}
                placeholder="username_kamu" required />
              <p className="mt-1 text-xs" style={{ color: '#6b5c52' }}>Huruf, angka, dan underscore. Min 3 karakter</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8a89a' }}>Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl text-white transition-all duration-200 focus:outline-none text-sm"
                  style={{ background: 'rgba(18, 8, 9, 0.8)', border: '1px solid rgba(212, 168, 83, 0.15)' }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.5)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(212, 168, 83, 0.15)'}
                  placeholder="Minimal 8 karakter" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#6b5c52' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#d4a853'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#6b5c52'}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div key={level} className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ background: level <= strength.level ? strength.color : 'rgba(212, 168, 83, 0.1)' }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8a89a' }}>Konfirmasi Password</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl text-white transition-all duration-200 focus:outline-none text-sm"
                  style={{ background: 'rgba(18, 8, 9, 0.8)', border: `1px solid ${confirmPassword && confirmPassword !== password ? 'rgba(239, 68, 68, 0.4)' : 'rgba(212, 168, 83, 0.15)'}` }}
                  onFocus={(e) => { if (!(confirmPassword && confirmPassword !== password)) { e.target.style.borderColor = 'rgba(212, 168, 83, 0.5)'; } }}
                  onBlur={(e) => { if (!(confirmPassword && confirmPassword !== password)) { e.target.style.borderColor = 'rgba(212, 168, 83, 0.15)'; } }}
                  placeholder="Ulangi password" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#6b5c52' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#d4a853'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#6b5c52'}>
                  {showConfirm ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs" style={{ color: '#f87171' }}>Password tidak sama</p>
              )}
              {confirmPassword && confirmPassword === password && password && (
                <p className="mt-1 text-xs flex items-center gap-1" style={{ color: '#4ade80' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  Password cocok
                </p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3.5 font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group mt-2"
              style={{ background: 'linear-gradient(135deg, #d4a853 0%, #8b6914 100%)', color: '#0a0506', boxShadow: loading ? 'none' : '0 4px 25px rgba(212, 168, 83, 0.25)' }}>
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, #f0d890 0%, #d4a853 100%)' }} />
              <span className="relative">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Membuat akun...
                  </span>
                ) : 'Buat Akun'}
              </span>
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: '#6b5c52' }}>
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold transition-colors hover:opacity-80" style={{ color: '#d4a853' }}>Login</Link>
          </p>

          <p className="mt-3 text-center" style={{ color: '#6b5c52', fontSize: '11px' }}>
            Dengan mendaftar, kamu setuju dengan{' '}
            <a href="#" className="underline transition-colors hover:opacity-80" style={{ color: '#b8a89a' }}>Terms & Conditions</a>
            {' '}dan{' '}
            <a href="#" className="underline transition-colors hover:opacity-80" style={{ color: '#b8a89a' }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;