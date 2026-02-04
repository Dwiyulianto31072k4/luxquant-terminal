// src/components/auth/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, error, setError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      // Error sudah di-handle di context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: '#0a0506' }}>
      {/* Background effects */}
      <div className="absolute inset-0" 
           style={{ 
             background: 'radial-gradient(ellipse at 0% 0%, rgba(139, 26, 26, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, rgba(139, 26, 26, 0.3) 0%, transparent 40%)' 
           }} />
      
      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="p-8 rounded-3xl shadow-2xl"
             style={{ 
               background: 'rgba(20, 10, 12, 0.8)', 
               backdropFilter: 'blur(20px)',
               border: '1px solid rgba(212, 168, 83, 0.2)' 
             }}>
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                 style={{ background: 'linear-gradient(135deg, #f0d890, #d4a853, #8b6914)' }}>
              <span className="text-2xl font-bold" style={{ color: '#0a0506' }}>LQ</span>
            </div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
              Welcome Back
            </h1>
            <p className="mt-2" style={{ color: '#b8a89a' }}>Login ke LuxQuant Terminal</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 rounded-xl text-sm"
                 style={{ 
                   background: 'rgba(239, 68, 68, 0.1)', 
                   border: '1px solid rgba(239, 68, 68, 0.3)',
                   color: '#f87171' 
                 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white transition-colors focus:outline-none"
                style={{ 
                  background: '#120809', 
                  border: '1px solid rgba(212, 168, 83, 0.2)',
                  '::placeholder': { color: '#6b5c52' }
                }}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white transition-colors focus:outline-none"
                style={{ 
                  background: '#120809', 
                  border: '1px solid rgba(212, 168, 83, 0.2)' 
                }}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                background: 'linear-gradient(to right, #d4a853, #8b6914)', 
                color: '#0a0506',
                boxShadow: loading ? 'none' : '0 0 30px rgba(212, 168, 83, 0.3)'
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* Register Link */}
          <p className="mt-6 text-center" style={{ color: '#6b5c52' }}>
            Belum punya akun?{' '}
            <Link to="/register" className="transition-colors hover:opacity-80" style={{ color: '#d4a853' }}>
              Daftar sekarang
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;