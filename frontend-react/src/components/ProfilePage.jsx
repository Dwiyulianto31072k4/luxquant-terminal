// src/components/ProfilePage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/authApi';

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [connections, setConnections] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [linkingDiscord, setLinkingDiscord] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (user) setUsername(user.username || ''); }, [user]);
  useEffect(() => { fetchConnections(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchConnections = async () => {
    try { const res = await api.get('/api/v1/profile/connections'); setConnections(res.data); } catch (err) { console.error('Failed to fetch connections:', err); }
  };

  const isGoogleLinked = connections?.google?.linked || false;
  const isTelegramLinked = connections?.telegram?.linked || false;
  const isDiscordLinked = connections?.discord?.linked || false;
  const initial = user?.username?.charAt(0).toUpperCase() || 'U';
  const avatarUrl = user?.avatar_url;
  const usernameChanged = username !== (user?.username || '');

  // ════════════════════════════════════════
  // USERNAME
  // ════════════════════════════════════════
  const validateUsername = (val) => {
    if (val.length < 3) return t('profile.username_min');
    if (val.length > 50) return t('profile.username_max');
    if (!/^[a-z0-9_]+$/.test(val)) return t('profile.username_format');
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
      showToast(t('profile.username_saved'));
    } catch (err) {
      const msg = err.response?.data?.detail || t('profile.username_failed');
      setUsernameError(msg);
      showToast(msg, 'error');
    } finally { setSaving(false); }
  };

  // ════════════════════════════════════════
  // AVATAR (auto-compress)
  // ════════════════════════════════════════
  const handleAvatarClick = () => fileInputRef.current?.click();

  const compressImage = (file, maxW = 512, maxH = 512, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Read failed'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Load failed'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width: w, height: h } = img;
          if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w = Math.round(w * r); h = Math.round(h * r); }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => blob ? resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' })) : reject(new Error('Compress failed')), 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { showToast(t('profile.avatar_format_error'), 'error'); return; }
    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed);
      const res = await api.post('/api/v1/profile/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUser(res.data);
      showToast(t('profile.avatar_saved'));
    } catch (err) { showToast(err.response?.data?.detail || t('profile.avatar_failed'), 'error'); }
    finally { setUploadingAvatar(false); e.target.value = ''; }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try { const res = await api.delete('/api/v1/profile/avatar'); setUser(res.data); showToast(t('profile.avatar_removed')); }
    catch { showToast(t('profile.avatar_remove_failed'), 'error'); }
    finally { setUploadingAvatar(false); }
  };

  // ════════════════════════════════════════
  // LINK GOOGLE
  // ════════════════════════════════════════
  const handleLinkGoogle = useCallback(() => {
    if (!window.google?.accounts?.id) { showToast(t('profile.google_not_ready'), 'error'); return; }
    setLinkingGoogle(true);
    window.google.accounts.id.initialize({
      client_id: '352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com',
      callback: async (response) => {
        try { const res = await api.post('/api/v1/profile/link-google', { id_token: response.credential }); setUser(res.data); fetchConnections(); showToast(t('profile.google_linked')); }
        catch (err) { showToast(err.response?.data?.detail || t('profile.google_link_failed'), 'error'); }
        finally { setLinkingGoogle(false); }
      }, auto_select: false,
    });
    window.google.accounts.id.prompt((n) => { if (n.isNotDisplayed() || n.isDismissedMoment()) setLinkingGoogle(false); });
  }, [t]);

  const handleUnlinkGoogle = async () => {
    try { const res = await api.delete('/api/v1/profile/unlink-google'); setUser(res.data); fetchConnections(); showToast(t('profile.google_unlinked')); }
    catch (err) { showToast(err.response?.data?.detail || t('profile.google_unlink_failed'), 'error'); }
  };

  // ════════════════════════════════════════
  // LINK / REPLACE TELEGRAM (no unlink)
  // ════════════════════════════════════════
  const handleLinkTelegram = useCallback(() => {
    setLinkingTelegram(true);
    const isReplace = isTelegramLinked;

    window.onTelegramAuth = async (telegramUser) => {
      try {
        const res = await api.post('/api/v1/profile/link-telegram', telegramUser);
        setUser(res.data); fetchConnections();
        showToast(isReplace ? t('profile.telegram_replaced') : t('profile.telegram_linked'));
      } catch (err) { showToast(err.response?.data?.detail || t('profile.telegram_link_failed'), 'error'); }
      finally { setLinkingTelegram(false); const c = document.getElementById('tg-link-overlay'); if (c) document.body.removeChild(c); }
    };

    const overlay = document.createElement('div');
    overlay.id = 'tg-link-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);';

    const card = document.createElement('div');
    card.style.cssText = 'background:#12090d;padding:32px;border-radius:20px;border:1px solid rgba(212,168,83,0.25);text-align:center;min-width:320px;max-width:380px;box-shadow:0 25px 50px rgba(0,0,0,0.5);';

    card.innerHTML = `
      <div style="margin-bottom:16px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      </div>
      <p style="color:#e8ddd0;margin-bottom:8px;font-size:18px;font-weight:700;">${isReplace ? t('profile.telegram_replace_title') : t('profile.telegram_link_title')}</p>
      <p style="color:#6b5c52;margin-bottom:24px;font-size:13px;line-height:1.6;">${isReplace ? t('profile.telegram_replace_desc') : t('profile.telegram_link_desc')}</p>
      <div id="tg-widget-slot" style="display:flex;justify-content:center;margin-bottom:20px;"></div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = t('profile.cancel');
    closeBtn.style.cssText = 'color:#8a7a6e;background:none;border:1px solid rgba(212,168,83,0.2);padding:10px 32px;border-radius:12px;cursor:pointer;font-size:14px;font-weight:500;';
    closeBtn.onclick = () => { document.body.removeChild(overlay); setLinkingTelegram(false); };
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); setLinkingTelegram(false); } };
    document.body.appendChild(overlay);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', 'LuxQuantTerminalBot');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-radius', '12');
    script.async = true;
    document.getElementById('tg-widget-slot')?.appendChild(script);
  }, [t, isTelegramLinked]);

  // ════════════════════════════════════════
  // LINK / UNLINK DISCORD
  // ════════════════════════════════════════
  const handleLinkDiscord = useCallback(async () => {
    setLinkingDiscord(true);
    try {
      const res = await api.get('/api/v1/profile/link-discord/url');
      window.location.href = res.data.url;
    } catch (err) {
      showToast(err.response?.data?.detail || t('profile.discord_link_failed') || 'Discord link failed', 'error');
      setLinkingDiscord(false);
    }
  }, [t]);

  const handleUnlinkDiscord = async () => {
    try {
      const res = await api.delete('/api/v1/profile/unlink-discord');
      setUser(res.data); fetchConnections();
      showToast(t('profile.discord_unlinked') || 'Discord unlinked');
    } catch (err) {
      showToast(err.response?.data?.detail || t('profile.discord_unlink_failed') || 'Discord unlink failed', 'error');
    }
  };

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100000] px-5 py-3.5 rounded-2xl text-sm font-medium shadow-2xl backdrop-blur-md ${
          toast.type === 'error' ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
        }`} style={{ animation: 'slideIn 0.3s ease-out' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-base">{toast.type === 'error' ? '✗' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h1 className="text-2xl font-display font-bold text-white">{t('profile.title')}</h1>
        </div>
        <p className="text-text-secondary mt-2 ml-[76px]">{t('profile.subtitle')}</p>
      </div>

      {/* ═══ PROFILE SECTION ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-gold-primary/10 bg-gold-primary/[0.03]">
          <h2 className="text-sm font-semibold text-gold-primary/80 uppercase tracking-wider">{t('profile.section_profile')}</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 sm:min-w-[130px]">
              <div className="relative group">
                <div onClick={handleAvatarClick} className="w-28 h-28 rounded-2xl overflow-hidden cursor-pointer border-2 border-gold-primary/20 hover:border-gold-primary/50 transition-all relative" style={{ boxShadow: '0 0 30px rgba(212,168,83,0.1)' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark flex items-center justify-center">
                      <span className="text-4xl font-bold text-bg-primary">{initial}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-1">
                    {uploadingAvatar ? (
                      <div className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                        <span className="text-white text-[10px] font-medium">{t('profile.change_photo')}</span>
                      </>
                    )}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div className="flex gap-3">
                <button onClick={handleAvatarClick} className="text-[11px] text-gold-primary hover:text-gold-light transition-colors font-medium">{t('profile.upload')}</button>
                {avatarUrl && (<><span className="text-text-muted/20">|</span><button onClick={handleRemoveAvatar} className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors font-medium">{t('profile.remove')}</button></>)}
              </div>
              <p className="text-text-muted/40 text-[10px] text-center max-w-[140px]">{t('profile.avatar_hint')}</p>
            </div>

            {/* Username + Email */}
            <div className="flex-1 w-full space-y-5">
              <div>
                <label className="block text-xs font-semibold text-text-muted/70 uppercase tracking-wider mb-2">{t('profile.username')}</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/50 text-sm font-mono">@</span>
                    <input type="text" value={username} onChange={handleUsernameChange} maxLength={50}
                      className="w-full pl-9 pr-3 py-3 rounded-xl text-sm text-white font-mono focus:outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${usernameError ? 'rgba(248,113,113,0.4)' : usernameChanged ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'}` }} />
                  </div>
                  <button onClick={handleSaveUsername} disabled={!usernameChanged || saving || !!usernameError}
                    className="px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{ background: usernameChanged && !usernameError ? 'linear-gradient(135deg, #d4a853, #8b6914)' : 'rgba(255,255,255,0.03)', color: usernameChanged && !usernameError ? '#0a0506' : '#4a3f39', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {saving ? <div className="w-4 h-4 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" /> : t('profile.save')}
                  </button>
                </div>
                {usernameError ? <p className="text-red-400 text-[11px] mt-2 flex items-center gap-1"><span>✗</span> {usernameError}</p> : <p className="text-text-muted/40 text-[11px] mt-2">{t('profile.username_hint')}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted/70 uppercase tracking-wider mb-2">{t('profile.email')}</label>
                <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <svg className="w-4 h-4 text-text-muted/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  <span className="text-text-muted/50 font-mono">{user?.email || '-'}</span>
                </div>
                <p className="text-text-muted/30 text-[11px] mt-1.5">{t('profile.email_readonly')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CONNECTED ACCOUNTS ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-gold-primary/10 bg-gold-primary/[0.03]">
          <h2 className="text-sm font-semibold text-gold-primary/80 uppercase tracking-wider">{t('profile.section_connections')}</h2>
        </div>
        <div className="p-6">
          <p className="text-text-muted text-xs mb-5">{t('profile.connections_desc')}</p>
          <div className="space-y-3">
            {/* Google */}
            <ConnectionCard
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
              iconBg="rgba(66,133,244,0.08)" iconBorder="rgba(66,133,244,0.15)"
              name="Google" linked={isGoogleLinked} detail={isGoogleLinked ? t('profile.connected') : t('profile.not_connected')}
              onLink={handleLinkGoogle} onUnlink={handleUnlinkGoogle} linking={linkingGoogle}
              canUnlink={true} linkLabel={t('profile.link')} unlinkLabel={t('profile.unlink')}
            />
            {/* Telegram */}
            <ConnectionCard
              icon={<svg className="w-5 h-5 text-[#0088cc]" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>}
              iconBg="rgba(0,136,204,0.08)" iconBorder="rgba(0,136,204,0.15)"
              name="Telegram" linked={isTelegramLinked} detail={isTelegramLinked ? `@${connections?.telegram?.username || 'connected'}` : t('profile.not_connected')}
              onLink={handleLinkTelegram} linking={linkingTelegram}
              canUnlink={false} linkLabel={isTelegramLinked ? t('profile.replace') : t('profile.link')}
              replaceMode={isTelegramLinked}
            />
            {/* Discord */}
            <ConnectionCard
              icon={<svg className="w-5 h-5" fill="#5865F2" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>}
              iconBg="rgba(88,101,242,0.08)" iconBorder="rgba(88,101,242,0.15)"
              name="Discord" linked={isDiscordLinked} detail={isDiscordLinked ? `@${connections?.discord?.username || 'connected'}` : t('profile.not_connected')}
              onLink={handleLinkDiscord} onUnlink={handleUnlinkDiscord} linking={linkingDiscord}
              canUnlink={true} linkLabel={t('profile.link')} unlinkLabel={t('profile.unlink')}
            />
          </div>
        </div>
      </div>

      {/* ═══ ACCOUNT INFO ═══ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-gold-primary/10 bg-gold-primary/[0.03]">
          <h2 className="text-sm font-semibold text-gold-primary/80 uppercase tracking-wider">{t('profile.section_info')}</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          <InfoItem label={t('profile.user_id')} value={`#${user?.id}`} mono />
          <InfoItem label={t('profile.role')}>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
              user?.role === 'admin' ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' :
              user?.role === 'subscriber' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
              'bg-zinc-500/15 text-zinc-400 border-zinc-500/25'
            }`}>
              {user?.role === 'admin' ? '🛡️' : user?.role === 'subscriber' ? '⭐' : '👤'} {(user?.role || 'free').toUpperCase()}
            </span>
          </InfoItem>
          <InfoItem label={t('profile.login_via')} value={(user?.auth_provider || '-').charAt(0).toUpperCase() + (user?.auth_provider || '-').slice(1)} />
          <InfoItem label={t('profile.joined')} value={user?.created_at ? new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'} />
        </div>
      </div>
    </div>
  );
};

// ─── Connection Card ───
const ConnectionCard = ({ icon, iconBg, iconBorder, name, linked, detail, onLink, onUnlink, linking, canUnlink, linkLabel, unlinkLabel, replaceMode }) => (
  <div className="flex items-center justify-between p-4 rounded-xl transition-all hover:bg-white/[0.02]" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
    <div className="flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: iconBg, border: `1px solid ${iconBorder}` }}>{icon}</div>
      <div>
        <p className="text-white text-sm font-semibold">{name}</p>
        {linked ? (
          <div className="flex items-center gap-1.5 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><p className="text-emerald-400/80 text-[11px] font-medium">{detail}</p></div>
        ) : (
          <p className="text-text-muted/50 text-[11px] mt-0.5">{detail}</p>
        )}
      </div>
    </div>
    <div className="flex gap-2">
      {linked && canUnlink && (
        <button onClick={onUnlink} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-red-400/60 border border-red-500/15 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all">{unlinkLabel}</button>
      )}
      {(!linked || replaceMode) && (
        <button onClick={onLink} disabled={linking}
          className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 ${
            replaceMode ? 'text-amber-400/80 border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/15 hover:border-amber-500/35'
            : 'text-white border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
          }`}>
          {linking ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin mx-3" /> : linkLabel}
        </button>
      )}
    </div>
  </div>
);

// ─── Info Item ───
const InfoItem = ({ label, value, mono, children }) => (
  <div>
    <p className="text-text-muted/50 text-[10px] uppercase tracking-wider font-semibold mb-1.5">{label}</p>
    {children || <p className={`text-white text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>}
  </div>
);

export default ProfilePage;