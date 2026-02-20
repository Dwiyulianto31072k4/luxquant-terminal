// src/components/auth/RegisterPage.jsx
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import {
  LeftBrandPanel, MobileLogo, BetaBadge, ErrorAlert, InputField,
  PasswordInput, GoldButton, Divider, SocialButton, GoogleIcon, TelegramIcon
} from './LoginPage';

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const { register, error, setError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setError(null);
    if (password !== confirmPassword) { setLocalError('Password tidak sama'); return; }
    if (password.length < 8) { setLocalError('Password minimal 8 karakter'); return; }
    if (username.length < 3) { setLocalError('Username minimal 3 karakter'); return; }
    setLoading(true);
    try { await register(email, username, password); navigate('/'); }
    catch (err) { /* context */ }
    finally { setLoading(false); }
  };

  const displayError = localError || error;

  const getStrength = (pwd) => {
    if (!pwd) return { level: 0, label: '', color: '' };
    let s = 0;
    if (pwd.length >= 8) s++;
    if (pwd.length >= 12) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 1) return { level: 1, label: 'Lemah', color: '#f87171' };
    if (s <= 2) return { level: 2, label: 'Cukup', color: '#fbbf24' };
    if (s <= 3) return { level: 3, label: 'Bagus', color: '#4ade80' };
    return { level: 4, label: 'Kuat', color: '#22c55e' };
  };
  const strength = getStrength(password);

  return (
    <div className="min-h-screen flex" style={{ background: '#0a0506' }}>
      <LeftBrandPanel />

      <div className="w-full lg:w-[45%] flex items-center justify-center relative overflow-y-auto">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(139,26,26,0.12) 0%, transparent 55%)'
        }} />
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{
          background: 'linear-gradient(to bottom, transparent 10%, rgba(212,168,83,0.12) 50%, transparent 90%)'
        }} />

        <div className="relative z-10 w-full max-w-md px-8 py-10">
          <MobileLogo />
          <div className="flex justify-end mb-6"><BetaBadge /></div>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>Daftar</h1>
            <p className="text-sm" style={{ color: '#6b5c52' }}>Buat akun baru untuk mulai trading</p>
          </div>

          {displayError && <ErrorAlert message={displayError} />}

          <div className="space-y-3">
            <SocialButton icon={<GoogleIcon />} text="Daftar dengan Google" onClick={() => {}} />
            <SocialButton icon={<TelegramIcon />} text="Daftar dengan Telegram" onClick={() => {}} />
          </div>

          <Divider text="Atau daftar dengan email" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <InputField label="Username" value={username} onChange={setUsername} placeholder="username_kamu" hint="Huruf, angka, dan underscore. Min 3 karakter" />

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>Password</label>
              <PasswordInput value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword(!showPassword)} placeholder="Minimal 8 karakter" />
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1,2,3,4].map(l => (
                      <div key={l} className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ background: l <= strength.level ? strength.color : 'rgba(212,168,83,0.1)' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>Konfirmasi Password</label>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} placeholder="Ulangi password" />
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs" style={{ color: '#f87171' }}>Password tidak sama</p>
              )}
              {confirmPassword && confirmPassword === password && password && (
                <p className="mt-1 text-xs flex items-center gap-1" style={{ color: '#4ade80' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Password cocok
                </p>
              )}
            </div>

            <div className="pt-1">
              <GoldButton loading={loading} text="Buat Akun" loadingText="Membuat akun..." />
            </div>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: '#6b5c52' }}>
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold hover:opacity-80 transition-opacity" style={{ color: '#d4a853' }}>Login</Link>
          </p>
          <p className="mt-3 text-center" style={{ color: '#6b5c52', fontSize: 11 }}>
            Dengan mendaftar, kamu setuju dengan <a href="#" className="underline hover:opacity-80" style={{ color: '#b8a89a' }}>Terms & Conditions</a>
            {' '}dan <a href="#" className="underline hover:opacity-80" style={{ color: '#b8a89a' }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;