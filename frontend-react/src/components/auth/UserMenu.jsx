// src/components/auth/UserMenu.jsx
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const UserMenu = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 rounded-xl transition-colors"
          style={{ 
            color: '#d4a853', 
            border: '1px solid rgba(212, 168, 83, 0.3)' 
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(212, 168, 83, 0.1)'}
          onMouseLeave={(e) => e.target.style.background = 'transparent'}
        >
          Login
        </button>
        <button
          onClick={() => navigate('/register')}
          className="px-4 py-2 font-semibold rounded-xl transition-all"
          style={{ 
            background: 'linear-gradient(to right, #d4a853, #8b6914)', 
            color: '#0a0506' 
          }}
        >
          Daftar
        </button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate('/');
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-xl transition-colors"
        style={{ 
          background: 'rgba(20, 10, 12, 0.6)', 
          border: '1px solid rgba(212, 168, 83, 0.2)' 
        }}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)' }}>
          <span className="text-sm font-bold" style={{ color: '#0a0506' }}>
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </span>
        </div>
        <span className="text-white font-medium">{user?.username}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: '#6b5c52' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl overflow-hidden z-50"
             style={{ 
               background: 'rgba(20, 10, 12, 0.95)', 
               backdropFilter: 'blur(20px)',
               border: '1px solid rgba(212, 168, 83, 0.2)' 
             }}>
          {/* User Info */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(212, 168, 83, 0.1)' }}>
            <p className="text-white font-medium">{user?.username}</p>
            <p className="text-sm" style={{ color: '#6b5c52' }}>{user?.email}</p>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button
              onClick={() => {
                navigate('/watchlist');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left transition-colors flex items-center gap-3"
              style={{ color: '#b8a89a' }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(212, 168, 83, 0.1)';
                e.target.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#b8a89a';
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              My Watchlist
            </button>
          </div>

          {/* Logout */}
          <div className="py-2" style={{ borderTop: '1px solid rgba(212, 168, 83, 0.1)' }}>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left transition-colors flex items-center gap-3"
              style={{ color: '#f87171' }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;