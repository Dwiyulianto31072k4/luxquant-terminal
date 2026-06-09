import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * InfoTip — small "?" icon that toggles a popover with a short explanation.
 * Usage: <InfoTip text="..." />  or  <InfoTip i18nKey="guide.today_wr_d" title="..." />
 * Click to open; click outside or the icon again to close. Keyboard accessible.
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

/**
 * GuideModal — full guide listing every filter / metric / column.
 * Triggered by a "Guide" button; rendered via portal.
 */
const Row = ({ title, desc, warn }) => (
  <div className="py-3 border-b border-white/[0.06] last:border-0">
    <p className="font-mono text-[11px] uppercase tracking-wider text-white mb-1">{title}</p>
    <p className="font-mono text-[11px] leading-relaxed text-text-muted normal-case tracking-normal">{desc}</p>
    {warn && (
      <p className="font-mono text-[11px] leading-relaxed text-amber-400/90 normal-case tracking-normal mt-1.5 pl-2 border-l border-amber-400/40">{warn}</p>
    )}
  </div>
);

const Section = ({ label, children }) => (
  <div className="mb-5">
    <div className="flex items-center gap-3 mb-1">
      <span className="h-px w-6 bg-gold-primary/40" />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/80">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/30 via-white/[0.06] to-transparent" />
    </div>
    {children}
  </div>
);

export const GuideModal = ({ onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const content = (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl my-8 bg-[#0a0805] border border-gold-primary/25 rounded-lg shadow-2xl overflow-hidden"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

        {/* header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="font-display text-xl text-white tracking-tight">{t('guide.title')}</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1">{t('guide.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('guide.close')}
            className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted/60 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <Section label={t('guide.sec_stats')}>
            <Row title={t('guide.today_act_t')} desc={t('guide.today_act_d')} />
            <Row title={t('guide.today_wr_t')} desc={t('guide.today_wr_d')} />
            <Row title={t('guide.overall_wr_t')} desc={t('guide.overall_wr_d')} />
            <Row title={t('guide.this_week_t')} desc={t('guide.this_week_d')} />
          </Section>

          <Section label={t('guide.sec_intel')}>
            <Row title={t('guide.streak_t')} desc={t('guide.streak_d')} />
            <Row title={t('guide.decoupled_t')} desc={t('guide.decoupled_d')} />
            <Row title={t('guide.align_t')} desc={t('guide.align_d')} />
            <Row title={t('guide.worth_t')} desc={t('guide.worth_d')} />
            <Row title={t('guide.avoid_t')} desc={t('guide.avoid_d')} />
          </Section>

          <Section label={t('guide.sec_pattern')}>
            <Row title={t('guide.pattern_t')} desc={t('guide.pattern_d')} warn={t('guide.pattern_warn')} />
            <Row title="" desc={t('guide.pattern_use')} />
          </Section>

          <Section label={t('guide.sec_table')}>
            <Row title={t('guide.track_t')} desc={t('guide.track_d')} />
            <Row title={t('guide.btccorr_t')} desc={t('guide.btccorr_d')} />
            <Row title={t('guide.verdict_t')} desc={t('guide.verdict_d')} />
            <Row title={t('guide.tagbadge_t')} desc={t('guide.tagbadge_d')} />
          </Section>

          <p className="font-mono text-[10px] leading-relaxed text-text-muted/60 normal-case tracking-normal pt-2 border-t border-white/[0.06]">
            {t('guide.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default GuideModal;
