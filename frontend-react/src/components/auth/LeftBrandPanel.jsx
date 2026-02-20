// src/components/auth/LeftBrandPanel.jsx
// Shared brand panel for Login & Register pages
// Premium glassmorphism flag badges + typewriter + globe

import { useEffect, useRef, useState } from 'react';

/* ================================================================
   TYPEWRITER — white text with gold highlights on key phrases
   ================================================================ */
const TAGLINES = [
  { parts: [{ text: 'Algorithmic ', g: false }, { text: 'Crypto Intelligence', g: true }, { text: ' 24/7', g: false }] },
  { parts: [{ text: 'Proactive Algorithms, ', g: false }, { text: 'Better Trades', g: true }] },
  { parts: [{ text: 'Founded in ', g: false }, { text: 'Taiwan 🇹🇼', g: true }, { text: ' Serving Global', g: false }] },
  { parts: [{ text: 'Data-Driven ', g: false }, { text: 'Signals', g: true }, { text: ' for Smarter Trades', g: false }] },
  { parts: [{ text: '2,000+ Traders ', g: false }, { text: 'Trust LuxQuant', g: true }] },
];

const useTypewriter = (taglines, speed = 45, delSpeed = 20, pause = 3000) => {
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

const TypewriterDisplay = () => {
  const parts = useTypewriter(TAGLINES);
  return (
    <div style={{ textAlign: 'center', minHeight: 40 }}>
      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 600, lineHeight: 1.35 }}>
        {parts.map((p, i) => (
          <span key={i} style={{ color: p.g ? '#d4a853' : '#ffffff' }}>{p.text}</span>
        ))}
        <span style={{ color: '#d4a853', fontWeight: 300, marginLeft: 1, animation: 'lq-blink 1s step-end infinite' }}>|</span>
      </p>
    </div>
  );
};

/* ================================================================
   GLASSMORPHISM FLAG BADGES — scattered with gentle bobbing
   Each badge = frosted pill with flag emoji + country name
   Individual float animation with unique duration/delay
   ================================================================ */
const FLAGS = [
  { emoji: '🇹🇼', name: 'Taiwan',    top: 4,   left: 50,  dur: 5.5, del: 0,   sz: 'lg' },
  { emoji: '🇹🇷', name: 'Turkey',    top: 18,  left: 10,  dur: 6.2, del: 0.5, sz: 'md' },
  { emoji: '🇺🇸', name: 'US',        top: 28,  left: 82,  dur: 5.8, del: 1.2, sz: 'md' },
  { emoji: '🇮🇩', name: 'Indonesia', top: 74,  left: 80,  dur: 6.5, del: 0.3, sz: 'md' },
  { emoji: '🇻🇳', name: 'Vietnam',   top: 86,  left: 56,  dur: 5.3, del: 1.8, sz: 'sm' },
  { emoji: '🇬🇧', name: 'UK',        top: 88,  left: 18,  dur: 6.0, del: 0.8, sz: 'sm' },
  { emoji: '🇯🇵', name: 'Japan',     top: 50,  left: 0,   dur: 5.7, del: 1.5, sz: 'sm' },
  { emoji: '🇮🇳', name: 'India',     top: 65,  left: 3,   dur: 6.8, del: 0.2, sz: 'sm' },
  { emoji: '🇩🇪', name: 'Germany',   top: 12,  left: 78,  dur: 5.4, del: 2.0, sz: 'sm' },
  { emoji: '🇰🇷', name: 'Korea',     top: 42,  left: 88,  dur: 6.1, del: 1.0, sz: 'sm' },
  { emoji: '🇸🇬', name: 'SG',        top: 94,  left: 38,  dur: 5.9, del: 1.4, sz: 'sm' },
  { emoji: '🇸🇦', name: 'Saudi',     top: 58,  left: 92,  dur: 6.3, del: 0.7, sz: 'sm' },
];

const SZ = {
  lg: { fs: 14, ef: 18, pad: '5px 12px 5px 8px', gap: 6 },
  md: { fs: 12, ef: 16, pad: '4px 10px 4px 7px', gap: 5 },
  sm: { fs: 11, ef: 14, pad: '3px 9px 3px 6px', gap: 4 },
};

const FlagBadges = () => (
  <>
    <style>{`
      @keyframes lq-float {
        0%, 100% { transform: translateY(0px); }
        33% { transform: translateY(-10px); }
        66% { transform: translateY(-5px); }
      }
    `}</style>
    {FLAGS.map((f, i) => {
      const s = SZ[f.sz];
      return (
        <div key={i} style={{
          position: 'absolute', top: `${f.top}%`, left: `${f.left}%`, zIndex: 20,
          animation: `lq-float ${f.dur}s ease-in-out ${f.del}s infinite`,
          transform: 'translateX(-50%)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: s.gap, padding: s.pad,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
            whiteSpace: 'nowrap', cursor: 'default',
          }}>
            <span style={{ fontSize: s.ef, lineHeight: 1 }}>{f.emoji}</span>
            <span style={{
              fontSize: s.fs, fontWeight: 500,
              color: 'rgba(255,255,255,0.7)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              letterSpacing: '0.02em',
            }}>{f.name}</span>
          </div>
        </div>
      );
    })}
  </>
);

/* ================================================================
   GLOBE — THREE.js from index.html
   ================================================================ */
const LOCS = [
  { lat: 25.033, lng: 121.565, s: 0.9, hub: true },
  { lat: 39.933, lng: 32.860, s: 0.7 }, { lat: 40.713, lng: -74.006, s: 0.65 },
  { lat: -6.209, lng: 106.846, s: 0.6 }, { lat: 21.029, lng: 105.854, s: 0.55 },
  { lat: 51.507, lng: -0.128, s: 0.55 }, { lat: 35.676, lng: 139.650, s: 0.5 },
  { lat: 19.076, lng: 72.878, s: 0.5 }, { lat: 52.520, lng: 13.405, s: 0.45 },
  { lat: 24.714, lng: 46.675, s: 0.45 }, { lat: 37.567, lng: 126.978, s: 0.45 },
  { lat: 52.368, lng: 4.904, s: 0.35 }, { lat: 9.082, lng: 7.495, s: 0.35 },
  { lat: 22.319, lng: 114.169, s: 0.35 }, { lat: 14.600, lng: 120.984, s: 0.35 },
  { lat: 25.205, lng: 55.271, s: 0.35 }, { lat: 48.857, lng: 2.352, s: 0.3 },
  { lat: -33.869, lng: 151.209, s: 0.25 }, { lat: -23.551, lng: -46.633, s: 0.25 },
  { lat: 1.352, lng: 103.820, s: 0.25 }, { lat: 3.139, lng: 101.687, s: 0.2 },
];

const GlobeViz = () => {
  const ref = useRef(null), anim = useRef(null), cleanup = useRef(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let dead = false;
    const t = setTimeout(() => {
      if (dead || !ref.current) return;
      const T = window.THREE, TG = window.ThreeGlobe;
      if (!T || !TG) return;
      try {
        const el = ref.current, w = el.clientWidth || 500, h = el.clientHeight || 500;
        const r = new T.WebGLRenderer({ antialias: true, alpha: true });
        r.setClearColor(0x000000, 0); r.setPixelRatio(Math.min(window.devicePixelRatio, 2)); r.setSize(w, h);
        el.appendChild(r.domElement);
        const sc = new T.Scene(), cam = new T.PerspectiveCamera(50, w / h, 0.1, 2000);
        cam.position.set(0, 0, 280);
        const ct = new T.OrbitControls(cam, r.domElement);
        ct.enableDamping = true; ct.dampingFactor = 0.06; ct.enableZoom = false; ct.enablePan = false;
        ct.autoRotate = true; ct.autoRotateSpeed = 0.8;
        sc.add(new T.AmbientLight(0xffffff, 0.6));
        const dl = new T.DirectionalLight(0xfff5e0, 1.0); dl.position.set(1, 1, 1); sc.add(dl);
        const rl = new T.DirectionalLight(0xd4a853, 0.3); rl.position.set(-2, -1, -1); sc.add(rl);
        const g = new TG()
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .showAtmosphere(true).atmosphereColor('#d4a853').atmosphereAltitude(0.2);
        g.pointsData(LOCS.map(l => ({ lat: l.lat, lng: l.lng, color: l.hub ? '#f0d890' : '#d4a853', altitude: l.hub ? 0.02 : 0.01, radius: l.s })))
          .pointColor('color').pointRadius('radius').pointAltitude('altitude');
        const hub = LOCS[0];
        g.arcsData(LOCS.filter(l => !l.hub).map(l => ({
          startLat: hub.lat, startLng: hub.lng, endLat: l.lat, endLng: l.lng,
          color: l.s >= 0.5 ? ['#f0d890', '#d4a853'] : ['rgba(212,168,83,0.5)', 'rgba(212,168,83,0.15)'],
          stroke: l.s >= 0.5 ? 0.5 : 0.25
        }))).arcColor('color').arcStroke('stroke').arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(3000);
        g.ringsData(LOCS.filter(l => l.s >= 0.5).map(l => ({
          lat: l.lat, lng: l.lng, maxR: l.hub ? 4 : 2.5,
          propagationSpeed: l.hub ? 2 : 3, repeatPeriod: l.hub ? 1200 : 1800
        }))).ringColor(() => t => `rgba(212,168,83,${1 - t})`)
          .ringMaxRadius('maxR').ringPropagationSpeed('propagationSpeed').ringRepeatPeriod('repeatPeriod');
        sc.add(g); setOk(true);
        (function loop() { anim.current = requestAnimationFrame(loop); ct.update(); r.render(sc, cam); })();
        const onR = () => { const nw = el.clientWidth, nh = el.clientHeight; if (nw && nh) { cam.aspect = nw / nh; cam.updateProjectionMatrix(); r.setSize(nw, nh); } };
        window.addEventListener('resize', onR);
        cleanup.current = () => { window.removeEventListener('resize', onR); if (anim.current) cancelAnimationFrame(anim.current); try { r.dispose(); } catch(e){} try { if (el?.contains(r.domElement)) el.removeChild(r.domElement); } catch(e){} };
      } catch (e) { console.error('Globe err:', e); }
    }, 500);
    return () => { dead = true; clearTimeout(t); if (anim.current) cancelAnimationFrame(anim.current); if (cleanup.current) cleanup.current(); };
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {!ok && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ width: 36, height: 36, border: '2px solid rgba(212,168,83,0.15)', borderTopColor: '#d4a853', borderRadius: '50%', animation: 'lq-spin 1s linear infinite' }} />
        </div>
      )}
    </div>
  );
};

/* ================================================================
   LEFT BRAND PANEL — main export
   ================================================================ */
const LOGO_IMG = 'https://raw.githubusercontent.com/Dwiyulianto31072k4/luxquant/main/logolqemas.png';

const LeftBrandPanel = () => (
  <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ flexDirection: 'column' }}>
    {/* BG layers */}
    <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #1a0a0c 0%, #0d0405 50%, #110607 100%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 15%, rgba(139,26,26,0.35) 0%, transparent 55%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 85% 85%, rgba(100,18,18,0.18) 0%, transparent 50%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(212,168,83,0.04) 0%, transparent 45%)' }} />
    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent 10%, rgba(212,168,83,0.12) 50%, transparent 90%)' }} />
    <div className="absolute top-0 right-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent, rgba(212,168,83,0.08), transparent)' }} />
    <style>{`
      @keyframes lq-spin { to { transform: rotate(360deg); } }
      @keyframes lq-blink { 50% { opacity: 0; } }
    `}</style>

    <div className="relative z-10 flex h-full px-10 xl:px-14 pt-8 pb-6" style={{ flexDirection: 'column' }}>
      {/* Logo */}
      <div className="flex items-center gap-3">
        <img src={LOGO_IMG} alt="LuxQuant" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }}
          onError={(e) => { e.target.style.display = 'none'; }} />
        <span className="text-white font-bold tracking-wide" style={{ fontFamily: 'Playfair Display, serif', fontSize: 18 }}>LuxQuant</span>
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* Typewriter — above globe with spacing */}
        <div style={{ marginBottom: 36, position: 'relative', zIndex: 30 }}>
          <TypewriterDisplay />
        </div>
        {/* Globe + flag badges */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 500, aspectRatio: '1 / 1' }}>
          <GlobeViz />
          <FlagBadges />
        </div>
      </div>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid rgba(212,168,83,0.06)', paddingTop: 10, textAlign: 'center' }}>
        <p style={{ fontSize: 10, color: '#3d352f', letterSpacing: '0.1em', textTransform: 'uppercase' }}>© 2025 LuxQuant Algorithm · All rights reserved</p>
      </div>
    </div>
  </div>
);

export default LeftBrandPanel;