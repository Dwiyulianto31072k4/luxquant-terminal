// src/components/auth/LeftBrandPanel.jsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/* ================================================================
   TAGLINES — translation-aware
   ================================================================ */
const getTaglines = (t) => {
  const a = (key) => t(`auth.${key}`);
  return [
    { parts: [{ text: a('tagline_1_a'), g: false }, { text: a('tagline_1_b'), g: true }, { text: a('tagline_1_c'), g: false }] },
    { parts: [{ text: a('tagline_2_a'), g: false }, { text: a('tagline_2_b'), g: true }, { text: a('tagline_2_c'), g: false }] },
    { parts: [{ text: a('tagline_3_a'), g: false }, { text: a('tagline_3_b'), g: true }, { text: a('tagline_3_c'), g: false }] },
    { parts: [{ text: a('tagline_4_a'), g: false }, { text: a('tagline_4_b'), g: true }, { text: a('tagline_4_c'), g: false }] },
    { parts: [{ text: a('tagline_5_a'), g: false }, { text: a('tagline_5_b'), g: true }, { text: a('tagline_5_c'), g: false }] },
    { parts: [{ text: a('tagline_6_a'), g: false }, { text: a('tagline_6_b'), g: true }, { text: a('tagline_6_c'), g: false }] },
  ];
};

const useTypewriter = (taglines, speed = 40, delSpeed = 18, pause = 3200) => {
  const [cc, setCc] = useState(0);
  const [idx, setIdx] = useState(0);
  const [del, setDel] = useState(false);
  const full = taglines[idx].parts.map(p => p.text).join('');

  useEffect(() => {
    let t;
    if (!del && cc === full.length) t = setTimeout(() => setDel(true), pause);
    else if (del && cc === 0) { setDel(false); setIdx(p => (p + 1) % taglines.length); }
    else t = setTimeout(() => setCc(c => c + (del ? -1 : 1)), del ? delSpeed : speed);
    return () => clearTimeout(t);
  }, [cc, del, idx, full.length, taglines, speed, delSpeed, pause]);

  let rem = cc;
  const vis = [];
  for (const p of taglines[idx].parts) {
    if (rem <= 0) break;
    vis.push({ text: p.text.substring(0, rem), g: p.g });
    rem -= vis[vis.length - 1].text.length;
  }
  return vis;
};

/* ================================================================
   TYPEWRITER DISPLAY — exported for use inside Login/Register pages
   ================================================================ */
export const TypewriterLine = ({ mobile }) => {
  const { t } = useTranslation();
  const taglines = getTaglines(t);
  const parts = useTypewriter(taglines);
  return (
    <div style={{ textAlign: mobile ? 'left' : 'center', minHeight: mobile ? 44 : 40 }}>
      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: mobile ? 15 : 26, fontWeight: 500, lineHeight: 1.5, color: '#6b5c52' }}>
        {parts.map((p, i) => (
          <span key={i} style={{ color: p.g ? '#d4a853' : '#8a7d73' }}>{p.text}</span>
        ))}
        <span style={{ color: '#d4a853', fontWeight: 300, marginLeft: 1, animation: 'lq-blink 1s step-end infinite' }}>|</span>
      </p>
    </div>
  );
};

/* ================================================================
   MOBILE GLOBE SECTION — now lightweight (no WebGL)
   ================================================================ */
export const MobileGlobeSection = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  return (
    <div className="lg:hidden" style={{ margin: '0 -16px' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto' }}>
        <DeviceMockup compact />
      </div>
      <p className="text-center" style={{ fontSize: 12, color: '#6b5c52', marginTop: 8, paddingBottom: 8, letterSpacing: '0.03em' }}>
        <span style={{ color: '#d4a853' }}>📊</span>{' '}
        {a('globe_more')} <span style={{ color: '#b8a89a', fontWeight: 600 }}>{a('globe_countries')}</span> {a('globe_trust')}
      </p>
    </div>
  );
};

/* ================================================================
   DEVICE MOCKUP — Mac + Phone (replaces Globe)
   ================================================================ */
const DeviceMockup = ({ compact = false }) => {
  const macMaxW = compact ? 280 : 500;
  const phoneW = compact ? 80 : 130;

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes lq-float-device {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes lq-float-phone {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '120%', height: '120%',
        background: 'radial-gradient(ellipse at center, rgba(212,168,83,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Mac Mockup */}
      <div style={{
        position: 'relative', maxWidth: macMaxW, width: '100%',
        animation: 'lq-float-device 7s ease-in-out infinite',
        perspective: '1200px',
      }}>
        <div style={{
          transform: compact ? 'none' : 'rotateY(-8deg) rotateX(3deg)',
          transformStyle: 'preserve-3d',
        }}>
          {/* Screen */}
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 10',
            background: '#0a0805',
            borderRadius: compact ? '0.5rem 0.5rem 0 0' : '1rem 1rem 0 0',
            border: `${compact ? 3 : 6}px solid #2a2a2a`,
            borderBottom: 'none',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(212,168,83,0.1)',
          }}>
            {/* Camera notch */}
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: '12%', height: compact ? 8 : 14,
              background: '#0a0805', borderRadius: '0 0 4px 4px', zIndex: 30,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}>
              <div style={{ width: compact ? 3 : 5, height: compact ? 3 : 5, borderRadius: '50%', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>

            <img
              src="/mockups/hero-mac-dashboard.png"
              alt="Dashboard Preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: 0.95 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {/* Fallback */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#0a0506', zIndex: -1,
            }}>
              <img src="/logo.png" alt="" style={{ width: compact ? 24 : 48, height: compact ? 24 : 48, borderRadius: 12, opacity: 0.3 }} onError={e => e.target.style.display = 'none'} />
            </div>
          </div>

          {/* Mac base */}
          <div style={{
            position: 'relative', width: '104%', left: '-2%',
            height: compact ? 4 : 8,
            background: 'linear-gradient(to bottom, #4a4a4a, #0a0a0a)',
            borderRadius: '0 0 4px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{ width: '15%', height: compact ? 1 : 3, background: '#222', borderRadius: '0 0 2px 2px' }} />
          </div>
        </div>
      </div>

      {/* Phone Mockup — overlapping right */}
      <div style={{
        position: 'absolute',
        right: compact ? '-5%' : '-8%',
        bottom: compact ? '-5%' : '-10%',
        zIndex: 30,
        animation: 'lq-float-phone 5s ease-in-out infinite 1s',
      }}>
        <div style={{
          width: phoneW,
          aspectRatio: '9 / 19.5',
          background: '#000',
          borderRadius: compact ? '1.2rem' : '2rem',
          border: `${compact ? 3 : 5}px solid #2a2a2a`,
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(212,168,83,0.2)',
          position: 'relative',
        }}>
          {/* Dynamic island */}
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '35%', height: compact ? 8 : 14,
            background: '#000', borderRadius: '0 0 8px 8px', zIndex: 30,
          }} />

          <div style={{
            position: 'absolute', inset: compact ? 1 : 2,
            borderRadius: compact ? '0.9rem' : '1.6rem',
            overflow: 'hidden', background: '#0a0506',
          }}>
            <img
              src="/mockup-hp.png"
              alt="LuxQuant Mobile"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#0a0506', zIndex: -1,
            }}>
              <img src="/logo.png" alt="" style={{ width: compact ? 20 : 32, height: compact ? 20 : 32, borderRadius: 8, opacity: 0.4 }} onError={e => e.target.style.display = 'none'} />
            </div>
          </div>

          {/* Home indicator */}
          <div style={{
            position: 'absolute', bottom: compact ? 2 : 4, left: '50%', transform: 'translateX(-50%)',
            width: '35%', height: compact ? 2 : 3,
            background: 'rgba(255,255,255,0.2)', borderRadius: 999, zIndex: 30,
          }} />
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   DESKTOP TYPEWRITER
   ================================================================ */
const DesktopTypewriter = () => {
  const { t } = useTranslation();
  const taglines = getTaglines(t);
  const parts = useTypewriter(taglines);
  return (
    <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 600, lineHeight: 1.4 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ color: p.g ? '#d4a853' : '#ffffff' }}>{p.text}</span>
      ))}
      <span style={{ color: '#d4a853', fontWeight: 300, marginLeft: 1, animation: 'lq-blink 1s step-end infinite' }}>|</span>
    </p>
  );
};

/* ================================================================
   DESKTOP LEFT PANEL — only visible on lg+
   ================================================================ */
const LeftBrandPanel = () => {
  const { t } = useTranslation();
  return (
    <>
      <style>{`
        @keyframes lq-spin { to { transform: rotate(360deg); } }
        @keyframes lq-blink { 50% { opacity: 0; } }
      `}</style>

      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ flexDirection: 'column' }}>
        {/* BG layers */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #1a0a0c 0%, #0d0405 50%, #110607 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 15%, rgba(139,26,26,0.35) 0%, transparent 55%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 85% 85%, rgba(100,18,18,0.18) 0%, transparent 50%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(212,168,83,0.04) 0%, transparent 45%)' }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent 10%, rgba(212,168,83,0.12) 50%, transparent 90%)' }} />
        <div className="absolute top-0 right-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent, rgba(212,168,83,0.08), transparent)' }} />

        <div className="relative z-10 flex h-full px-10 xl:px-14 pt-8 pb-6" style={{ flexDirection: 'column' }}>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LuxQuant" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }} />
            <span className="text-white font-bold tracking-wide" style={{ fontFamily: 'Playfair Display, serif', fontSize: 18 }}>LuxQuant</span>
          </div>

          {/* Center */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Typewriter */}
            <div style={{ marginBottom: 36, position: 'relative', zIndex: 30, textAlign: 'center', minHeight: 40 }}>
              <DesktopTypewriter />
            </div>

            {/* Device Mockup (replaces Globe) */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 520, aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DeviceMockup />
            </div>
          </div>

          {/* Bottom */}
          <div style={{ borderTop: '1px solid rgba(212,168,83,0.06)', paddingTop: 10, textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#3d352f', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('auth.copyright')}</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeftBrandPanel;