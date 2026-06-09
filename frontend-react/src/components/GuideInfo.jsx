import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * InfoTip — small "?" icon that toggles a popover with a short explanation.
 * Click to open; click outside or Esc to close.
 */
export const InfoTip = ({ text, title, side = 'top', className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pos =
    side === 'bottom' ? 'top-full mt-2' :
    side === 'left' ? 'right-full mr-2 top-1/2 -translate-y-1/2' :
    side === 'right' ? 'left-full ml-2 top-1/2 -translate-y-1/2' :
    'bottom-full mb-2';

  return (
    <span className={`relative inline-flex ${className}`} ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="More info"
        className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border text-[9px] font-mono leading-none transition-colors ${
          open ? 'border-gold-primary/60 text-gold-primary bg-gold-primary/10' : 'border-text-muted/40 text-text-muted/70 hover:border-gold-primary/50 hover:text-gold-primary'
        }`}
      >
        ?
      </button>
      {open && (
        <span
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${pos} left-1/2 -translate-x-1/2 z-[70] w-60 normal-case tracking-normal text-left cursor-default`}
        >
          <span className="relative block bg-[#0d0a07] border border-gold-primary/40 rounded-lg shadow-2xl p-3 overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />
            {title && <span className="block font-mono text-[10px] uppercase tracking-wider text-gold-primary mb-1">{title}</span>}
            <span className="block font-mono text-[11px] leading-relaxed text-text-muted">{text}</span>
          </span>
        </span>
      )}
    </span>
  );
};

// content row
const Row = ({ title, desc, warn }) => (
  <div className="py-3.5 border-b border-white/[0.06] last:border-0">
    {title && <p className="font-mono text-[11px] uppercase tracking-wider text-white mb-1.5">{title}</p>}
    <p className="font-mono text-[12px] leading-relaxed text-text-muted normal-case tracking-normal">{desc}</p>
    {warn && (
      <p className="font-mono text-[11px] leading-relaxed text-amber-400/90 normal-case tracking-normal mt-2 pl-2.5 border-l-2 border-amber-400/40">{warn}</p>
    )}
  </div>
);

/**
 * GuideModal — two-column layout: section nav (left) + content (right).
 */
export const GuideModal = ({ onClose }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState('stats');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const sections = [
    { id: 'stats', label: t('guide.sec_stats') },
    { id: 'intel', label: t('guide.sec_intel') },
    { id: 'pattern', label: t('guide.sec_pattern') },
    { id: 'table', label: t('guide.sec_table') },
  ];

  const renderContent = () => {
    switch (active) {
      case 'stats':
        return (
          <>
            <Row title={t('guide.today_act_t')} desc={t('guide.today_act_d')} />
            <Row title={t('guide.today_wr_t')} desc={t('guide.today_wr_d')} />
            <Row title={t('guide.overall_wr_t')} desc={t('guide.overall_wr_d')} />
            <Row title={t('guide.this_week_t')} desc={t('guide.this_week_d')} />
          </>
        );
      case 'intel':
        return (
          <>
            <Row title={t('guide.streak_t')} desc={t('guide.streak_d')} />
            <Row title={t('guide.decoupled_t')} desc={t('guide.decoupled_d')} />
            <Row title={t('guide.align_t')} desc={t('guide.align_d')} />
            <Row title={t('guide.worth_t')} desc={t('guide.worth_d')} />
            <Row title={t('guide.avoid_t')} desc={t('guide.avoid_d')} />
          </>
        );
      case 'pattern':
        return (
          <>
            <Row title={t('guide.pattern_t')} desc={t('guide.pattern_d')} warn={t('guide.pattern_warn')} />
            <Row title="" desc={t('guide.pattern_use')} />
          </>
        );
      case 'table':
        return (
          <>
            <Row title={t('guide.track_t')} desc={t('guide.track_d')} />
            <Row title={t('guide.btccorr_t')} desc={t('guide.btccorr_d')} />
            <Row title={t('guide.verdict_t')} desc={t('guide.verdict_d')} />
            <Row title={t('guide.tagbadge_t')} desc={t('guide.tagbadge_d')} />
          </>
        );
      default:
        return null;
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl h-[78vh] max-h-[640px] bg-[#0a0805] border border-gold-primary/25 rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

        <button
          onClick={onClose}
          aria-label={t('guide.close')}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-md text-text-muted/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="flex flex-1 min-h-0">
          {/* LEFT: section nav */}
          <div className="w-48 shrink-0 border-r border-white/[0.06] bg-white/[0.015] py-5 px-3 flex flex-col">
            <div className="px-2 mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gold-primary/50 text-gold-primary text-[9px] font-mono">?</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary/80">{t('guide.button')}</span>
              </div>
            </div>
            <nav className="flex flex-col gap-0.5">
              {sections.map((s) => {
                const on = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`text-left px-3 py-2.5 rounded-md font-mono text-[11px] tracking-wide transition-all ${
                      on
                        ? 'bg-gold-primary/10 border border-gold-primary/30 text-gold-primary'
                        : 'border border-transparent text-text-muted hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto px-2 pt-4">
              <p className="font-mono text-[9px] leading-relaxed text-text-muted/50 normal-case tracking-normal">
                {t('guide.disclaimer')}
              </p>
            </div>
          </div>

          {/* RIGHT: content */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <h2 className="font-display text-2xl text-white tracking-tight">
                {sections.find((s) => s.id === active)?.label}
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1">{t('guide.subtitle')}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default GuideModal;
