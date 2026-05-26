// src/components/admin/QuickSendPopover.jsx
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  CopyIcon,
  CheckIcon,
  SendIcon,
  CloseIcon,
  ExternalLinkIcon,
} from './Icons';

const CHANNEL_LABELS = {
  telegram: { Icon: TelegramIcon, label: 'Telegram', color: '#229ED9' },
  discord: { Icon: DiscordIcon, label: 'Discord', color: '#5865F2' },
  email: { Icon: EmailIcon, label: 'Email', color: '#fbbf24' },
  generic: { Icon: CopyIcon, label: 'Copy Only', color: '#6b5c52' },
};

/**
 * QuickSendPopover — template picker + live preview.
 *
 * inline=true → block inside drawer
 * inline=false → floating modal
 */
export const QuickSendPopover = ({ user, templates, reach, onClose, inline = false }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [rendered, setRendered] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (templates && templates.length > 0 && !selectedId) {
      const first = templates.find((t) => t.id !== 'custom');
      if (first) setSelectedId(first.id);
    }
  }, [templates, selectedId]);

  const renderTemplate = useCallback(
    async (templateId, custom = null) => {
      if (!templateId || !user?.id) return;
      setLoading(true);
      try {
        const result = await adminApi.renderOutreachTemplate(templateId, user.id, custom);
        setRendered(result);
      } catch (err) {
        console.error('Render failed:', err);
        setRendered(null);
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (selectedId === 'custom') {
      if (customMessage.trim().length > 0) {
        renderTemplate(selectedId, customMessage);
      } else {
        setRendered({
          template_id: 'custom',
          channel: reach.telegram.available
            ? 'telegram'
            : reach.discord.available
            ? 'discord'
            : reach.email.available
            ? 'email'
            : 'generic',
          subject: null,
          body: '',
          deep_link: reach.telegram.deep_link || reach.discord.deep_link || reach.email.deep_link,
          fallback_link: null,
          can_send: false,
        });
      }
    } else if (selectedId) {
      renderTemplate(selectedId);
    }
  }, [selectedId, customMessage, renderTemplate, reach]);

  const handleCopy = async () => {
    if (!rendered?.body) return;
    try {
      let text = rendered.body;
      if (rendered.subject) {
        text = `Subject: ${rendered.subject}\n\n${rendered.body}`;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleSend = async () => {
    await handleCopy();
    if (rendered?.deep_link) {
      window.open(rendered.deep_link, '_blank', 'noopener,noreferrer');
    }
    if (onClose && !inline) onClose();
  };

  const channelInfo = rendered
    ? CHANNEL_LABELS[rendered.channel] || CHANNEL_LABELS.generic
    : null;
  const ChannelIcon = channelInfo?.Icon;

  const content = (
    <div
      className={inline ? '' : 'w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden max-h-[85vh]'}
      style={inline ? {} : { background: '#12090d', border: '1px solid rgba(212,168,83,0.25)' }}
    >
      {!inline && (
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Quick Send</h3>
            <p className="text-[10px]" style={{ color: '#6b5c52' }}>
              To: @{user.username}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center"
            style={{ color: '#8a7a6e' }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      <div className={inline ? 'space-y-4' : 'flex-1 overflow-y-auto p-5 space-y-4'}>
        {/* Template picker */}
        <div>
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Pick Template
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {templates.map((t) => {
              const isSelected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="text-left p-2.5 rounded-lg border transition-all"
                  style={{
                    background: isSelected ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.02)',
                    borderColor: isSelected ? 'rgba(212,168,83,0.4)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <p
                    className="text-[11px] font-semibold tracking-tight"
                    style={{ color: isSelected ? '#d4a853' : '#fff' }}
                  >
                    {t.label}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: '#6b5c52' }}>
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom message input */}
        {selectedId === 'custom' && (
          <div>
            <p
              className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Compose Custom Message
            </p>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={5}
              placeholder={`Halo {username},\n\nKamu juga bisa pakai placeholder seperti {plan_name}, {expires_at}, dst.`}
              className="w-full px-3 py-2 rounded-md text-xs text-white focus:outline-none resize-none font-mono"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: '#6b5c52' }}>
              Placeholders:{' '}
              {
                '{username} {plan_name} {expires_at} {expires_in_days} {last_login} {first_login} {referrer_username}'
              }
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <div
              className="inline-flex items-center gap-2 text-xs"
              style={{ color: '#6b5c52' }}
            >
              <div
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }}
              />
              Rendering...
            </div>
          </div>
        )}

        {/* Preview */}
        {!loading && rendered && (
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* Preview header */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex items-center gap-1.5">
                {ChannelIcon && <ChannelIcon size={12} colored />}
                <span
                  className="text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: channelInfo?.color }}
                >
                  via {channelInfo?.label}
                </span>
                {!rendered.can_send && (
                  <span
                    className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ml-1"
                    style={{
                      background: 'rgba(248,113,113,0.12)',
                      color: '#f87171',
                      border: '1px solid rgba(248,113,113,0.25)',
                    }}
                  >
                    Copy only
                  </span>
                )}
              </div>
              {rendered.deep_link && (
                <a
                  href={rendered.deep_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] hover:underline truncate ml-2 max-w-[40%] font-mono"
                  style={{ color: '#60a5fa' }}
                >
                  <span className="truncate">
                    {rendered.deep_link.replace(/^https?:\/\//, '')}
                  </span>
                  <ExternalLinkIcon size={10} />
                </a>
              )}
            </div>

            {rendered.subject && (
              <div
                className="px-3 py-2"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  Subject
                </p>
                <p className="text-xs text-white">{rendered.subject}</p>
              </div>
            )}

            <div className="px-3 py-2.5 max-h-64 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-sans" style={{ color: '#c9b59e' }}>
                {rendered.body || (
                  <span style={{ color: '#4a3f39' }}>(empty — type your message above)</span>
                )}
              </pre>
            </div>
          </div>
        )}

        {/* Actions */}
        {!loading && rendered && rendered.body && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
              style={{
                background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                color: copied ? '#34d399' : '#fff',
                border: `1px solid ${
                  copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)'
                }`,
              }}
            >
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {rendered.deep_link && (
              <button
                onClick={handleSend}
                className="flex-1 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #d4a853, #8b6914)',
                  color: '#0a0506',
                }}
              >
                <SendIcon size={12} />
                Send → {channelInfo?.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}
    >
      {content}
    </div>
  );
};
