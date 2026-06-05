// src/components/ApiKeysPage.jsx
// ════════════════════════════════════════════════════════════════
// API Keys — subscriber self-service untuk generate/lihat/revoke key
// yang dipakai bot/agent narik data dari Public Data API.
//
// Layout: ikut konvensi page lain (ProfilePage/ReferralPage) —
// max-w container + space-y, TANPA background sendiri (biarin luxury-bg
// app tembus). Card pakai bg-white/[0.02] border-white/5 biar nyatu.
//
// Backend (JWT): POST/GET/PATCH/DELETE /api/v1/api-keys
// Data API (key): https://luxquant.tw/api/public/v1/...
//
// Daftar key: active tampil semua; revoked dipotong 3 terbaru biar
// nggak makan tempat, sisanya di balik toggle "lihat semua".
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiKeysApi } from '../services/api';

const PUBLIC_BASE = 'https://luxquant.tw/api/public/v1';
const MAX_REVOKED_VISIBLE = 3;

function deriveActiveAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'premium' || user.role === 'subscriber') {
    if (!user.subscription_expires_at) return true;
    return new Date(user.subscription_expires_at) > new Date();
  }
  return false;
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(s, t) {
  if (!s) return t('apiKeys.never');
  const d = new Date(s);
  if (isNaN(d)) return t('apiKeys.never');
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('apiKeys.just_now');
  if (m < 60) return `${m}m ${t('apiKeys.ago')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${t('apiKeys.ago')}`;
  const days = Math.floor(h / 24);
  return `${days}d ${t('apiKeys.ago')}`;
}

const ApiKeysPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasAccess = deriveActiveAccess(user);

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [showAllRevoked, setShowAllRevoked] = useState(false);

  const activeCount = keys.filter((k) => k.is_active).length;
  const atLimit = activeCount >= 2;

  // active dulu (apa adanya), lalu revoked diurut terbaru -> lama.
  const activeKeys = keys.filter((k) => k.is_active);
  const revokedKeys = keys
    .filter((k) => !k.is_active)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const visibleRevoked = showAllRevoked ? revokedKeys : revokedKeys.slice(0, MAX_REVOKED_VISIBLE);
  const hiddenRevokedCount = revokedKeys.length - visibleRevoked.length;
  const displayedKeys = [...activeKeys, ...visibleRevoked];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiKeysApi.list();
      setKeys(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('apiKeys.err_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (creating || atLimit) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(name.trim() || null);
      setJustCreated(created);
      setCopied(false);
      setName('');
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || t('apiKeys.err_create'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm(t('apiKeys.confirm_revoke'))) return;
    setRevokingId(id);
    setError(null);
    try {
      await apiKeysApi.revoke(id);
      if (justCreated && justCreated.id === id) setJustCreated(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || t('apiKeys.err_revoke'));
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-2 lg:px-0 space-y-6">
      {/* Header */}
      <header className="pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1 h-3 rounded-full bg-gold-primary" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
            {t('apiKeys.eyebrow')}
          </span>
        </div>
        <h1
          className="text-3xl sm:text-4xl text-white"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, letterSpacing: '-0.025em' }}
        >
          {t('apiKeys.title')}
        </h1>
        <p className="text-text-muted text-xs sm:text-sm mt-1.5 max-w-2xl">
          {t('apiKeys.subtitle')}
        </p>
      </header>

      {/* Non-subscriber upsell */}
      {!hasAccess && (
        <div
          className="rounded-2xl p-5 border border-gold-primary/20 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(212,168,83,0.08), rgba(255,255,255,0.01))' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-gold-primary/10 border border-gold-primary/25">
              <svg className="w-5 h-5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">{t('apiKeys.locked_title')}</h3>
              <p className="text-text-secondary text-[13px] mt-1">{t('apiKeys.locked_desc')}</p>
              <button
                onClick={() => navigate('/pricing')}
                className="mt-3 px-4 py-2 rounded-lg text-[13px] font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all"
              >
                {t('apiKeys.upgrade_cta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-[13px] text-red-400 border border-red-500/25 bg-red-500/10">
          {error}
        </div>
      )}

      {/* Generate */}
      {hasAccess && (
        <div className="rounded-2xl p-5 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">{t('apiKeys.create_title')}</h2>
            <span className="font-mono text-[11px] text-text-muted">{activeCount}/2 {t('apiKeys.active')}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={t('apiKeys.name_placeholder')}
              maxLength={60}
              className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white bg-white/[0.03] border border-white/10 placeholder:text-text-muted/70 focus:outline-none focus:border-gold-primary/40 focus:ring-1 focus:ring-gold-primary/20 transition-colors"
            />
            <button
              onClick={handleCreate}
              disabled={creating || atLimit}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {creating ? t('apiKeys.creating') : t('apiKeys.create_btn')}
            </button>
          </div>
          {atLimit && (
            <p className="text-amber-400/80 text-[11px] mt-2">{t('apiKeys.limit_warn')}</p>
          )}
        </div>
      )}

      {/* Just-created key (once) */}
      {justCreated && (
        <div
          className="rounded-2xl p-5 border border-gold-primary/40 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(212,168,83,0.10), rgba(255,255,255,0.01))' }}
        >
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/60 to-transparent" />
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-white font-semibold text-sm">{t('apiKeys.created_title')}</h3>
          </div>
          <p className="text-amber-400/90 text-[12px] mb-3">⚠ {t('apiKeys.created_warn')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2.5 rounded-lg font-mono text-[12px] sm:text-[13px] text-gold-light bg-black/40 border border-white/10 break-all">
              {justCreated.key}
            </code>
            <button
              onClick={() => copyKey(justCreated.key)}
              className="px-3 py-2.5 rounded-lg text-[12px] font-semibold bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/25 transition-colors whitespace-nowrap"
            >
              {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
            </button>
          </div>
          <button
            onClick={() => setJustCreated(null)}
            className="mt-3 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {t('apiKeys.dismiss')}
          </button>
        </div>
      )}

      {/* Keys list */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3">{t('apiKeys.your_keys')}</h2>

        {loading ? (
          <div className="rounded-2xl p-8 border border-white/5 bg-white/[0.02] flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-gold-primary/30 border-t-gold-primary animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-2xl p-8 border border-white/5 bg-white/[0.02] text-center">
            <p className="text-text-muted text-sm">{t('apiKeys.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedKeys.map((k) => (
              <div
                key={k.id}
                className={`rounded-xl p-4 border bg-white/[0.02] transition-colors ${
                  k.is_active ? 'border-white/5' : 'border-white/[0.03] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium truncate">
                        {k.name || t('apiKeys.untitled')}
                      </span>
                      {k.is_active ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          {t('apiKeys.status_active')}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-500/15 text-red-400 border border-red-500/20">
                          {t('apiKeys.status_revoked')}
                        </span>
                      )}
                    </div>
                    <code className="block font-mono text-[12px] text-text-secondary mt-1 truncate">
                      {k.key_prefix}{'\u2022'.repeat(8)}
                    </code>
                    <p className="text-[11px] text-text-muted mt-1">
                      {t('apiKeys.created')} {fmtDate(k.created_at)}
                      {k.is_active && (
                        <> · {t('apiKeys.last_used')} {fmtRelative(k.last_used_at, t)}</>
                      )}
                    </p>
                  </div>

                  {k.is_active && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokingId === k.id}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-400/80 border border-red-500/25 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 whitespace-nowrap flex-shrink-0"
                    >
                      {revokingId === k.id ? t('apiKeys.revoking') : t('apiKeys.revoke')}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Toggle lihat semua / lebih sedikit (cuma kalau revoked > 3) */}
            {revokedKeys.length > MAX_REVOKED_VISIBLE && (
              <button
                onClick={() => setShowAllRevoked((v) => !v)}
                className="w-full mt-1 py-2 rounded-lg text-[12px] font-medium text-text-muted hover:text-text-secondary border border-white/5 hover:border-white/10 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
              >
                {showAllRevoked
                  ? t('apiKeys.show_less', { defaultValue: 'Show less' })
                  : t('apiKeys.show_all_revoked', {
                      defaultValue: 'Show all revoked ({{n}})',
                      n: revokedKeys.length,
                    })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* How to use */}
      <div className="rounded-2xl p-5 border border-white/5 bg-white/[0.02]">
        <h2 className="text-white font-semibold text-sm mb-3">{t('apiKeys.usage_title')}</h2>
        <p className="text-text-secondary text-[13px] mb-3">{t('apiKeys.usage_desc')}</p>
        <pre className="px-4 py-3 rounded-lg font-mono text-[11px] sm:text-[12px] text-text-secondary bg-black/40 border border-white/5 overflow-x-auto">
{`curl ${PUBLIC_BASE}/signals \\
  -H "Authorization: Bearer YOUR_KEY"`}
        </pre>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
          {[
            ['GET /signals', t('apiKeys.ep_signals')],
            ['GET /signals/updates', t('apiKeys.ep_updates')],
            ['GET /journey/{id}', t('apiKeys.ep_journey')],
            ['GET /enrichment/{id}', t('apiKeys.ep_enrichment')],
            ['GET /btc-correlation/recent', t('apiKeys.ep_corr')],
            ['GET /market-pulse/feed', t('apiKeys.ep_pulse')],
          ].map(([ep, desc]) => (
            <div key={ep} className="flex items-baseline gap-2 min-w-0">
              <code className="font-mono text-[11px] text-gold-primary/80 whitespace-nowrap">{ep}</code>
              <span className="text-text-muted truncate">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-4">
          {t('apiKeys.usage_note')}
        </p>
      </div>
    </div>
  );
};

export default ApiKeysPage;
