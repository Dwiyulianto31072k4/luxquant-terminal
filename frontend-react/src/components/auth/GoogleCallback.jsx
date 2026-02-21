// src/components/auth/GoogleCallback.jsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const GoogleCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useEffect(() => {
    // Parse token dari URL (misal: /auth/google/callback?token=xxx&refresh_token=yyy)
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');
    const userStr = params.get('user');

    if (token && refreshToken) {
      // Simpan token
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshToken);
      
      if (userStr) {
        try {
          const user = JSON.parse(decodeURIComponent(userStr));
          setUser(user);
        } catch (e) {
          console.error('Failed to parse user data', e);
        }
      }
      
      // Redirect ke dashboard
      navigate('/', { replace: true });
    } else {
      // Jika gagal, redirect ke login
      navigate('/login', { replace: true });
    }
  }, [location, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'rgba(212,168,83,0.2)' }} />
          <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#d4a853' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: '#8a7a6e' }}>Menyelesaikan login Google...</p>
      </div>
    </div>
  );
};

export default GoogleCallback;