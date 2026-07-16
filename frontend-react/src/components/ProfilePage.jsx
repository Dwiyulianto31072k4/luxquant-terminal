// src/components/ProfilePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Profile — Flowscan-inspired luxury redesign
//   - Responsive: 1-col mobile → 2-col tablet → multi-col desktop
//   - Wider max-w-6xl, denser layout
//   - Account Info as KPI strip at top
//   - Display Preferences with live BTC ticker preview
//   - Subtle borders, light typography, tabular-nums
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useTranslation } from 'react-i18next';
import api from '../services/authApi';
import { ensureTelegram, openTelegramAuth } from '../utils/telegramLoader';
import CountryCurrencyPicker from './CountryCurrencyPicker';
import VipGroupCard from './VipGroupCard';
import { convertPrice, formatLocalPrice, formatUsdtPrice } from '../utils/currencyHelpers';

// ─── Lazy-load Google Identity Services — hanya saat dibutuhkan ───
// AuthContext tidak lagi me-load GSI global (login Google sekarang pakai
// OAuth2 redirect), jadi fitur "Link Google" di sini load script-nya sendiri.
const loadGsiScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById('google-gsi-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const { rates, supported } = useCurrency();
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [connections, setConnections] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [linkingDiscord, setLinkingDiscord] = useState(false);
  const [toast, setToast] = useState(null);

  // ─── BTC live ticker for preview ───
  const [btcTicker, setBtcTicker] = useState(null);

  useEffect(() => { if (user) setUsername(user.username || ''); }, [user]);
  useEffect(() => { fetchConnections(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);

  // Preload Telegram widget script saat halaman dibuka, supaya tombol
  // "Link / Replace" Telegram langsung siap pakai begitu diklik.
  useEffect(() => { ensureTelegram().catch(() => {}); }, []);

  // Fetch BTC live ticker every 30s for the preview section
  useEffect(() => {
    let cancelled = false;
    const fetchBtc = async () => {
      try {
        const res = await api.get('/api/v1/market/btc-ticker');
        if (!cancelled) setBtcTicker(res.data);
      } catch (err) {
        // Silent fail — preview just won't show if unavailable
      }
    };
    fetchBtc();
    const interval = setInterval(fetchBtc, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchConnections = async () => {
    try { const res = await api.get('/api/v1/profile/connections'); setConnections(res.data); }
    catch (err) { console.error('Failed to fetch connections:', err); }
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
  // AVATAR
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
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast(t('profile.avatar_format_error'), 'error'); return;
    }
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
  // DISPLAY PREFERENCES (Country & Currency)
  // ════════════════════════════════════════
  const handleCountryChange = async (newCountry) => {
    setSavingPreferences(true);
    try {
      const payload = newCountry ? { country_code: newCountry } : { country_code: '' };
      const res = await api.put('/api/v1/profile', payload);
      setUser(res.data);
      showToast(newCountry
        ? t('profile.country_saved', 'Country updated to ') + newCountry
        : t('profile.country_cleared', 'Country cleared'));
    } catch (err) {
      const msg = err.response?.data?.detail || t('profile.country_failed', 'Failed to update country');
      showToast(typeof msg === 'string' ? msg : 'Update failed', 'error');
    } finally { setSavingPreferences(false); }
  };

  const handleCurrencyChange = async (newCurrency) => {
    if (!newCurrency || newCurrency === user?.currency_code) return;
    setSavingPreferences(true);
    try {
      const res = await api.put('/api/v1/profile', { currency_code: newCurrency });
      setUser(res.data);
      showToast(t('profile.currency_saved', 'Currency updated to ') + newCurrency);
    } catch (err) {
      const msg = err.response?.data?.detail || t('profile.currency_failed', 'Failed to update currency');
      showToast(typeof msg === 'string' ? msg : 'Update failed', 'error');
    } finally { setSavingPreferences(false); }
  };

  // ════════════════════════════════════════
  // CONNECTIONS — Google
  // ════════════════════════════════════════
  const handleLinkGoogle = useCallback(async () => {
    setLinkingGoogle(true);
    try {
      await loadGsiScript();
    } catch {
      showToast(t('profile.google_not_ready'), 'error');
      setLinkingGoogle(false);
      return;
    }
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

  // ─── Telegram ───
  // Pakai openTelegramAuth() yang sama dengan login flow — deterministik,
  // tidak ada inject <script> per-klik. Popup OAuth Telegram kebuka langsung.
  // PENTING: openTelegramAuth() dipanggil sebelum await pertama (anti popup-blocker).
  const handleLinkTelegram = useCallback(async () => {
    const isReplace = isTelegramLinked;
    setLinkingTelegram(true);
    try {
      const telegramUser = await openTelegramAuth();
      const res = await api.post('/api/v1/profile/link-telegram', telegramUser);
      setUser(res.data);
      fetchConnections();
      showToast(isReplace ? t('profile.telegram_replaced') : t('profile.telegram_linked'));
    } catch (err) {
      if (err.message === 'cancelled') return; // user batal — diam
      if (err.message === 'not-ready') {
        showToast(t('profile.telegram_not_ready', 'Telegram is still loading. Please try again.'), 'error');
      } else {
        showToast(err.response?.data?.detail || t('profile.telegram_link_failed'), 'error');
      }
    } finally {
      setLinkingTelegram(false);
    }
  }, [t, isTelegramLinked]);

  // ─── Discord ───
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
  // DERIVED
  // ════════════════════════════════════════
  const showLocal = user?.currency_code && user.currency_code !== 'USD' && rates?.[user.currency_code];
  const btcPrice = btcTicker?.price;
  const btcLocal = (showLocal && btcPrice) ? convertPrice(btcPrice, user.currency_code, rates) : null;
  const btcChangePct = btcTicker?.price_change_pct;

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-6xl mx-auto px-1 sm:px-2 lg:px-0">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-md text-xs font-medium shadow-2xl backdrop-blur-md ${
          toast.type === 'error' ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
        }`} style={{ animation: 'slideIn 0.3s ease-out' }}>
          <div className="flex items-center gap-2"><span>{toast.type === 'error' ? '✗' : '✓'}</span><span>{toast.message}</span></div>
        </div>
      )}

      {/* ═══ HEADER — Flowscan style ═══ */}
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/70 mb-2">
            Account
          </p>
          <h1 className="text-xl sm:text-2xl font-light text-white tracking-tight">
            {t('profile.title', 'Profile Settings')}
          </h1>
          <p className="text-text-muted text-xs sm:text-sm mt-1">
            {t('profile.subtitle', 'Manage your profile and connected accounts')}
          </p>
        </div>
        {user?.id && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-white/[0.03] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              ID #{user.id}
            </span>
          </div>
        )}
      </div>

      {/* ═══ KPI STRIP — Account info as horizontal metrics ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <KpiCard label="Role" value={user?.role ? user.role.toUpperCase() : 'FREE'} accent={
          user?.role === 'admin' || user?.role === 'co_admin' || user?.role === 'founder'
            ? 'purple'
            : user?.role === 'subscriber' || user?.role === 'premium'
            ? 'green'
            : 'muted'
        } />
        <KpiCard label="Login Via" value={(user?.auth_provider || 'local').charAt(0).toUpperCase() + (user?.auth_provider || 'local').slice(1)} />
        <KpiCard label="Logins" value={user?.login_count != null ? String(user.login_count) : '—'} mono />
        <KpiCard label="Joined" value={user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
      </div>

      {/* ═══ MAIN 2-COL GRID ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">

        {/* ═══ LEFT — PROFILE + DISPLAY PREFS ═══ */}
        <div className="xl:col-span-2 space-y-3 sm:space-y-4">

          {/* PROFILE Card */}
          <Section title={t('profile.section_profile', 'Profile')}>
            <div className="flex flex-col sm:flex-row items-start gap-5 p-4 sm:p-5">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2.5 w-full sm:w-auto sm:min-w-[110px]">
                <div className="relative group">
                  <div onClick={handleAvatarClick}
                    className="w-24 h-24 rounded-md overflow-hidden cursor-pointer border border-gold-primary/20 hover:border-gold-primary/50 transition-all relative"
                    style={{ boxShadow: 'inset 0 1px 2px -1px rgba(0,0,0,0.4)' }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark flex items-center justify-center">
                        <span className="text-3xl font-light text-bg-primary">{initial}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-1">
                      {uploadingAvatar ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                          <span className="text-white text-[9px] font-mono uppercase tracking-wider">Edit</span>
                        </>
                      )}
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAvatarClick} className="font-mono text-[10px] uppercase tracking-wider text-gold-primary hover:text-gold-light transition-colors">
                    {t('profile.upload', 'Upload')}
                  </button>
                  {avatarUrl && (<>
                    <span className="text-text-muted/20">|</span>
                    <button onClick={handleRemoveAvatar} className="font-mono text-[10px] uppercase tracking-wider text-red-400/60 hover:text-red-400 transition-colors">
                      {t('profile.remove', 'Remove')}
                    </button>
                  </>)}
                </div>
                <p className="text-text-muted/40 text-[9px] text-center max-w-[120px]">{t('profile.avatar_hint', 'JPG, PNG, WebP or GIF')}</p>
              </div>

              {/* Username + Email */}
              <div className="flex-1 w-full space-y-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mb-2">
                    {t('profile.username', 'Username')}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50 text-sm font-mono">@</span>
                      <input type="text" value={username} onChange={handleUsernameChange} maxLength={50}
                        className="w-full pl-8 pr-3 py-2.5 rounded-md text-sm text-white font-mono focus:outline-none transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${usernameError ? 'rgba(248,113,113,0.4)' : usernameChanged ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'}` }} />
                    </div>
                    <button onClick={handleSaveUsername} disabled={!usernameChanged || saving || !!usernameError}
                      className="px-4 py-2.5 rounded-md font-mono text-[10px] uppercase tracking-wider font-bold transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                      style={{
                        background: usernameChanged && !usernameError ? 'linear-gradient(135deg, #d4a853, #8b6914)' : 'rgba(255,255,255,0.03)',
                        color: usernameChanged && !usernameError ? '#0a0506' : '#4a3f39',
                        border: '1px solid rgba(255,255,255,0.04)'
                      }}>
                      {saving ? <div className="w-3.5 h-3.5 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" /> : t('profile.save', 'Save')}
                    </button>
                  </div>
                  {usernameError
                    ? <p className="text-red-400 text-[10px] mt-1.5 flex items-center gap-1"><span>✗</span> {usernameError}</p>
                    : <p className="text-text-muted/40 text-[10px] mt-1.5">{t('profile.username_hint', 'Lowercase letters, numbers, and underscores')}</p>}
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mb-2">
                    {t('profile.email', 'Email')}
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <svg className="w-3.5 h-3.5 text-text-muted/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    <span className="text-text-muted/60 font-mono text-xs truncate">{user?.email || '-'}</span>
                  </div>
                  <p className="text-text-muted/30 text-[10px] mt-1.5">{t('profile.email_readonly', 'Email cannot be changed')}</p>
                </div>
              </div>
            </div>
          </Section>

          {/* DISPLAY PREFERENCES Card */}
          <Section
            title={t('profile.section_preferences', 'Display Preferences')}
            badge={savingPreferences && <span className="font-mono text-[9px] uppercase tracking-wider text-gold-primary/70 flex items-center gap-1.5"><span className="w-2.5 h-2.5 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" /> Saving</span>}
          >
            <div className="p-4 sm:p-5">
              <p className="text-text-muted text-xs mb-4">
                {t('profile.preferences_desc', 'Choose your country to see prices in your local currency alongside USDT in signals and charts.')}
              </p>

              <CountryCurrencyPicker
                country={user?.country_code || null}
                currency={user?.currency_code || 'USD'}
                supportedCurrencies={supported}
                onCountryChange={handleCountryChange}
                onCurrencyChange={handleCurrencyChange}
                disabled={savingPreferences}
              />

              {/* ═══ LIVE BTC PREVIEW — replaces static rows ═══ */}
              {showLocal && (
                <div className="mt-4 rounded-md overflow-hidden border border-gold-primary/15" style={{ background: 'rgba(212,168,83,0.03)' }}>
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-gold-primary/10 bg-gold-primary/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-wider text-gold-primary/80 font-semibold">
                        Live Conversion · BTC
                      </span>
                    </div>
                    {btcChangePct != null && (
                      <span className={`font-mono text-[10px] font-semibold tabular-nums ${btcChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {btcChangePct >= 0 ? '+' : ''}{btcChangePct.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    {btcPrice ? (
                      <>
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="font-mono text-2xl sm:text-3xl font-light text-white tabular-nums">
                            ${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-text-muted/40 text-base">≈</span>
                          <span className="font-mono text-xl sm:text-2xl font-light text-gold-primary tabular-nums">
                            {btcLocal != null ? formatLocalPrice(btcLocal, user.currency_code) : '—'}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-text-muted/50 uppercase tracking-wider">
                            BTC / {user.currency_code}
                          </span>
                          <span className="text-text-muted/40">
                            1 USDT ≈ {formatLocalPrice(rates[user.currency_code], user.currency_code)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-text-muted/50">
                        <div className="w-3 h-3 border-2 border-gold-primary/20 border-t-gold-primary/60 rounded-full animate-spin" />
                        <span className="text-xs">Loading live price...</span>
                      </div>
                    )}
                  </div>

                  <div className="px-3.5 py-2 border-t border-gold-primary/10 bg-gold-primary/[0.02]">
                    <p className="text-text-muted/40 text-[9px] font-mono uppercase tracking-wider">
                      {t('profile.preview_note', 'Auto-refresh every 30s · Rates from CoinGecko')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* ═══ RIGHT — CONNECTED ACCOUNTS ═══ */}
        <div className="xl:col-span-1">
          <Section title={t('profile.section_connections', 'Connections')}>
            <div className="p-4 sm:p-5">
              <p className="text-text-muted text-xs mb-4">
                {t('profile.connections_desc', 'Link other accounts so you can login with multiple methods')}
              </p>
              <div className="space-y-2">
                <ConnectionRow
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                  iconBg="rgba(66,133,244,0.06)" iconBorder="rgba(66,133,244,0.2)"
                  name="Google" linked={isGoogleLinked}
                  detail={isGoogleLinked ? t('profile.connected', 'Connected') : t('profile.not_connected', 'Not connected')}
                  onLink={handleLinkGoogle} onUnlink={handleUnlinkGoogle} linking={linkingGoogle}
                  canUnlink={true} linkLabel={t('profile.link', 'Link')} unlinkLabel={t('profile.unlink', 'Unlink')}
                />
                <ConnectionRow
                  icon={<svg className="w-4 h-4 text-[#0088cc]" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>}
                  iconBg="rgba(0,136,204,0.06)" iconBorder="rgba(0,136,204,0.2)"
                  name="Telegram" linked={isTelegramLinked}
                  detail={isTelegramLinked ? `@${connections?.telegram?.username || 'connected'}` : t('profile.not_connected', 'Not connected')}
                  onLink={handleLinkTelegram} linking={linkingTelegram}
                  canUnlink={false} linkLabel={isTelegramLinked ? t('profile.replace', 'Replace') : t('profile.link', 'Link')}
                  replaceMode={isTelegramLinked}
                />
                <ConnectionRow
                  icon={<svg className="w-4 h-4" fill="#5865F2" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>}
                  iconBg="rgba(88,101,242,0.06)" iconBorder="rgba(88,101,242,0.2)"
                  name="Discord" linked={isDiscordLinked}
                  detail={isDiscordLinked ? `@${connections?.discord?.username || 'connected'}` : t('profile.not_connected', 'Not connected')}
                  onLink={handleLinkDiscord} onUnlink={handleUnlinkDiscord} linking={linkingDiscord}
                  canUnlink={true} linkLabel={t('profile.link', 'Link')} unlinkLabel={t('profile.unlink', 'Unlink')}
                />
              </div>
            </div>
          </Section>

          <div className="mt-3 sm:mt-4">
            <VipGroupCard onToast={showToast} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

const Section = ({ title, badge, children }) => (
  <div className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.015]"
    style={{ boxShadow: 'inset 0 1px 2px -1px rgba(0,0,0,0.3)' }}>
    <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-white/[0.05] bg-white/[0.015]">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/70 font-semibold">
        {title}
      </h2>
      {badge}
    </div>
    {children}
  </div>
);

const KpiCard = ({ label, value, accent = 'default', mono = false }) => {
  const accentClasses = {
    purple: 'text-purple-300',
    green: 'text-emerald-300',
    muted: 'text-zinc-400',
    default: 'text-white',
  };
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 sm:px-4 sm:py-3"
      style={{ boxShadow: 'inset 0 1px 2px -1px rgba(0,0,0,0.3)' }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/60 mb-1">{label}</p>
      <p className={`text-sm sm:text-base font-light tabular-nums truncate ${mono ? 'font-mono' : ''} ${accentClasses[accent] || accentClasses.default}`}>
        {value}
      </p>
    </div>
  );
};

const ConnectionRow = ({ icon, iconBg, iconBorder, name, linked, detail, onLink, onUnlink, linking, canUnlink, linkLabel, unlinkLabel, replaceMode }) => (
  <div className="flex items-center justify-between p-3 rounded-md transition-all hover:bg-white/[0.02]"
    style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, border: `1px solid ${iconBorder}` }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-medium">{name}</p>
        {linked ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400/80 text-[10px] font-mono truncate">{detail}</p>
          </div>
        ) : (
          <p className="text-text-muted/50 text-[10px] font-mono mt-0.5">{detail}</p>
        )}
      </div>
    </div>
    <div className="flex gap-1.5 flex-shrink-0">
      {linked && canUnlink && (
        <button onClick={onUnlink}
          className="px-2.5 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider font-semibold text-red-400/60 border border-red-500/15 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all">
          {unlinkLabel}
        </button>
      )}
      {(!linked || replaceMode) && (
        <button onClick={onLink} disabled={linking}
          className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider font-bold transition-all disabled:opacity-50 ${
            replaceMode
              ? 'text-amber-400/80 border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/15 hover:border-amber-500/35'
              : 'text-white border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
          }`}>
          {linking ? <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin mx-2" /> : linkLabel}
        </button>
      )}
    </div>
  </div>
);

export default ProfilePage;