// src/components/ProfilePage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/authApi';

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const fileInputRef = useRef(null);

  // ─── State ───
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [connections, setConnections] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (user) setUsername(user.username || '');
  }, [user]);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchConnections = async () => {
    try {
      const res = await api.get('/api/v1/profile/connections');
      setConnections(res.data);
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    }
  };

  // ════════════════════════════════════════
  // USERNAME
  // ════════════════════════════════════════
  const validateUsername = (val) => {
    if (val.length < 3) return 'Minimal 3 karakter';
    if (val.length > 50) return 'Maksimal 50 karakter';
    if (!/^[a-z0-9_]+$/.test(val)) return 'Hanya huruf kecil, angka, dan underscore';
    return '';
  };

  const handleUsernameChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(val);
    setUsernameError(val ? validateUsername(val) : '');
  };

  const handleSaveUsername = async () => {
    if (!username || username === user?.username) return;
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }

    setSaving(true);
    try {
      const res = await api.put('/api/v1/profile', { username });
      setUser(res.data);
      showToast('Username berhasil diubah');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Gagal mengubah username';
      setUsernameError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════
  // AVATAR
  // ════════════════════════════════════════
  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran file maksimal 2MB', 'error');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast('Format file tidak didukung', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/v1/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUser(res.data);
      showToast('Avatar berhasil diubah');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal upload avatar', 'error');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await api.delete('/api/v1/profile/avatar');
      setUser(res.data);
      showToast('Avatar dihapus');
    } catch (err) {
      showToast('Gagal menghapus avatar', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ════════════════════════════════════════
  // LINK GOOGLE
  // ════════════════════════════════════════
  const handleLinkGoogle = useCallback(() => {
    if (!window.google?.accounts?.id) {
      showToast('Google SDK belum siap. Coba refresh halaman.', 'error');
      return;
    }

    setLinkingGoogle(true);

    window.google.accounts.id.initialize({
      client_id: '352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com',
      callback: async (response) => {
        try {
          const res = await api.post('/api/v1/profile/link-google', { id_token: response.credential });
          setUser(res.data);
          fetchConnections();
          showToast('Google berhasil dihubungkan');
        } catch (err) {
          showToast(err.response?.data?.detail || 'Gagal menghubungkan Google', 'error');
        } finally {
          setLinkingGoogle(false);
        }
      },
      auto_select: false,
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isDismissedMoment()) {
        setLinkingGoogle(false);
      }
    });
  }, []);

  const handleUnlinkGoogle = async () => {
    try {
      const res = await api.delete('/api/v1/profile/unlink-google');
      setUser(res.data);
      fetchConnections();
      showToast('Google berhasil dilepas');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal melepas Google', 'error');
    }
  };

  // ════════════════════════════════════════
  // LINK TELEGRAM
  // ════════════════════════════════════════
  const handleLinkTelegram = useCallback(() => {
    setLinkingTelegram(true);

    window.onTelegramAuth = async (telegramUser) => {
      try {
        const res = await api.post('/api/v1/profile/link-telegram', telegramUser);
        setUser(res.data);
        fetchConnections();
        showToast('Telegram berhasil dihubungkan');
      } catch (err) {
        showToast(err.response?.data?.detail || 'Gagal menghubungkan Telegram', 'error');
      } finally {
        setLinkingTelegram(false);
        const container = document.getElementById('telegram-link-container');
        if (container) document.body.removeChild(container);
      }
    };

    // Create popup overlay
    const container = document.createElement('div');
    container.id = 'telegram-link-container';
    container.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);';

    const card = document.createElement('div');
    card.style.cssText = 'background:#1a1014;padding:32px;border-radius:16px;border:1px solid rgba(212,168,83,0.3);text-align:center;min-width:300px;';

    const title = document.createElement('p');
    title.textContent = 'Hubungkan Telegram';
    title.style.cssText = 'color:#b8a89a;margin-bottom:20px;font-size:16px;font-weight:600;';
    card.appendChild(title);

    const widgetDiv = document.createElement('div');
    widgetDiv.style.cssText = 'display:flex;justify-content:center;margin-bottom:16px;';

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', 'LuxQuantTerminalBot');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-radius', '12');
    script.async = true;
    widgetDiv.appendChild(script);
    card.appendChild(widgetDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Batal';
    closeBtn.style.cssText = 'color:#8a7a6e;background:none;border:1px solid rgba(212,168,83,0.2);padding:8px 24px;border-radius:12px;cursor:pointer;font-size:14px;margin-top:8px;';
    closeBtn.onclick = () => {
      document.body.removeChild(container);
      setLinkingTelegram(false);
    };
    card.appendChild(closeBtn);

    container.appendChild(card);
    container.onclick = (e) => {
      if (e.target === container) {
        document.body.removeChild(container);
        setLinkingTelegram(false);
      }
    };

    document.body.appendChild(container);
  }, []);

  const handleUnlinkTelegram = async () => {
    try {
      const res = await api.delete('/api/v1/profile/unlink-telegram');
      setUser(res.data);
      fetchConnections();
      showToast('Telegram berhasil dilepas');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal melepas Telegram', 'error');
    }
  };

  // Note: link-telegram uses the existing /auth/telegram/link endpoint data format
  // We need a wrapper that posts to /profile/link-telegram with TelegramLogin schema

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  const initial = user?.username?.charAt(0).toUpperCase() || 'U';
  const avatarUrl = user?.avatar_url;
  const isGoogleLinked = connections?.google?.linked || false;
  const isTelegramLinked = connections?.telegram?.linked || false;
  const usernameChanged = username !== (user?.username || '');

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-xl text-sm font-medium shadow-2xl animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error'
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h1 className="text-2xl font-display font-bold text-white">Profile Settings</h1>
        </div>
        <p className="text-text-secondary mt-2 ml-[76px]">Kelola profil dan akun terhubung</p>
      </div>

      {/* ═══ AVATAR & USERNAME ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 p-6">
        <h2 className="text-sm font-semibold text-gold-primary/70 uppercase tracking-wider mb-5">Profil</h2>

        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <div
                onClick={handleAvatarClick}
                className="w-24 h-24 rounded-2xl overflow-hidden cursor-pointer border-2 border-gold-primary/20 hover:border-gold-primary/50 transition-all relative"
                style={{ boxShadow: '0 0 20px rgba(212,168,83,0.15)' }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark flex items-center justify-center">
                    <span className="text-3xl font-bold text-bg-primary">{initial}</span>
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploadingAvatar ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                    </svg>
                  )}
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAvatarClick} className="text-[11px] text-gold-primary hover:text-gold-light transition-colors">
                Upload
              </button>
              {avatarUrl && (
                <>
                  <span className="text-text-muted/30">·</span>
                  <button onClick={handleRemoveAvatar} className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors">
                    Hapus
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Username */}
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-text-muted mb-2">Username</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  maxLength={50}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${usernameError ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.06)'}` }}
                  onFocus={e => e.target.style.borderColor = usernameError ? 'rgba(248,113,113,0.6)' : 'rgba(212,168,83,0.3)'}
                  onBlur={e => e.target.style.borderColor = usernameError ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.06)'}
                />
              </div>
              <button
                onClick={handleSaveUsername}
                disabled={!usernameChanged || saving || !!usernameError}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: usernameChanged && !usernameError ? 'linear-gradient(135deg, #d4a853, #8b6914)' : 'rgba(255,255,255,0.03)',
                  color: usernameChanged && !usernameError ? '#0a0506' : '#6b5c52',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                {saving ? '...' : 'Simpan'}
              </button>
            </div>
            {usernameError && <p className="text-red-400 text-[11px] mt-1.5">{usernameError}</p>}
            <p className="text-text-muted/50 text-[11px] mt-1.5">Huruf kecil, angka, dan underscore. Minimal 3 karakter.</p>

            {/* Email (read only) */}
            <label className="block text-xs font-medium text-text-muted mb-2 mt-5">Email</label>
            <div className="px-3 py-2.5 rounded-xl text-sm text-text-muted/60" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              {user?.email || '-'}
            </div>
            <p className="text-text-muted/40 text-[11px] mt-1">Email tidak dapat diubah</p>
          </div>
        </div>
      </div>

      {/* ═══ CONNECTED ACCOUNTS ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 p-6">
        <h2 className="text-sm font-semibold text-gold-primary/70 uppercase tracking-wider mb-5">Akun Terhubung</h2>
        <p className="text-text-muted text-xs mb-5">Hubungkan akun lain agar bisa login dengan beberapa metode.</p>

        <div className="space-y-3">
          {/* Google */}
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.2)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Google</p>
                {isGoogleLinked ? (
                  <p className="text-emerald-400 text-[11px]">Terhubung</p>
                ) : (
                  <p className="text-text-muted text-[11px]">Belum terhubung</p>
                )}
              </div>
            </div>
            {isGoogleLinked ? (
              <button
                onClick={handleUnlinkGoogle}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400/70 border border-red-500/20 hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                Lepas
              </button>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={linkingGoogle}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-all disabled:opacity-50"
              >
                {linkingGoogle ? '...' : 'Hubungkan'}
              </button>
            )}
          </div>

          {/* Telegram */}
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,136,204,0.1)', border: '1px solid rgba(0,136,204,0.2)' }}>
                <svg className="w-5 h-5 text-[#0088cc]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Telegram</p>
                {isTelegramLinked ? (
                  <p className="text-emerald-400 text-[11px]">
                    @{connections?.telegram?.username || 'connected'}
                  </p>
                ) : (
                  <p className="text-text-muted text-[11px]">Belum terhubung</p>
                )}
              </div>
            </div>
            {isTelegramLinked ? (
              <button
                onClick={handleUnlinkTelegram}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400/70 border border-red-500/20 hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                Lepas
              </button>
            ) : (
              <button
                onClick={handleLinkTelegram}
                disabled={linkingTelegram}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white border border-[#0088cc]/30 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 transition-all disabled:opacity-50"
              >
                {linkingTelegram ? '...' : 'Hubungkan'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACCOUNT INFO (read-only) ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 p-6">
        <h2 className="text-sm font-semibold text-gold-primary/70 uppercase tracking-wider mb-5">Informasi Akun</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-text-muted text-[11px] mb-1">User ID</p>
            <p className="text-white text-sm font-mono">#{user?.id}</p>
          </div>
          <div>
            <p className="text-text-muted text-[11px] mb-1">Role</p>
            <p className="text-white text-sm capitalize">{user?.role || 'free'}</p>
          </div>
          <div>
            <p className="text-text-muted text-[11px] mb-1">Login via</p>
            <p className="text-white text-sm capitalize">{user?.auth_provider || '-'}</p>
          </div>
          <div>
            <p className="text-text-muted text-[11px] mb-1">Bergabung</p>
            <p className="text-white text-sm">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;