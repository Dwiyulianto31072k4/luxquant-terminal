// src/components/auth/LoginPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

/* ================================================================
   INLINE GLOBE — no separate file needed
   Loads Three.js + ThreeGlobe from CDN, renders in a div
   ================================================================ */

const GLOBE_SCRIPTS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://unpkg.com/three-globe@2.24.4/dist/three-globe.min.js',
];

const LOCATIONS = [
  { lat: -6.2088, lng: 106.8456, name: 'Jakarta' },
  { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
  { lat: 25.0330, lng: 121.5654, name: 'Taipei' },
  { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
  { lat: 40.7128, lng: -74.0060, name: 'New York' },
  { lat: 51.5074, lng: -0.1278, name: 'London' },
  { lat: 25.2048, lng: 55.2708, name: 'Dubai' },
  { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
  { lat: 19.0760, lng: 72.8777, name: 'Mumbai' },
  { lat: -23.5505, lng: -46.6333, name: 'São Paulo' },
  { lat: 37.5665, lng: 126.9780, name: 'Seoul' },
  { lat: 52.5200, lng: 13.4050, name: 'Berlin' },
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

const InlineGlobe = () => {
  const ref = useRef(null);
  const animId = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load scripts sequentially
        for (const src of GLOBE_SCRIPTS) {
          await loadScript(src);
        }
        if (cancelled) return;

        const T = window.THREE;
        const TG = window.ThreeGlobe;
        if (!T || !TG || !ref.current) { setStatus('error'); return; }

        setStatus('ready');

        const el = ref.current;
        const w = el.clientWidth || 400;
        const h = el.clientHeight || 400;

        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        el.innerHTML = ''; // clear loading spinner
        el.appendChild(renderer.domElement);

        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(50, w / h, 0.1, 2000);
        camera.position.set(0, 0, 280);

        const controls = new T.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.6;

        scene.add(new T.AmbientLight(0xffffff, 0.7));
        const dl = new T.DirectionalLight(0xffffff, 0.9);
        dl.position.set(1, 1, 1);
        scene.add(dl);

        const globe = new TG()
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .showAtmosphere(true)
          .atmosphereColor('#d4a853')
          .atmosphereAltitude(0.18);

        globe
          .pointsData(LOCATIONS.map(l => ({ lat: l.lat, lng: l.lng, color: '#d4a853' })))
          .pointColor('color').pointRadius(0.5).pointAltitude(0.01);

        const hub = LOCATIONS[0]; // Jakarta
        globe
          .arcsData(LOCATIONS.filter(l => l.name !== hub.name).map(l => ({
            startLat: hub.lat, startLng: hub.lng,
            endLat: l.lat, endLng: l.lng, color: '#ffffff'
          })))
          .arcColor('color').arcStroke(0.35)
          .arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(3000);

        scene.add(globe);

        function animate() {
          animId.current = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        const onResize = () => {
          if (!el) return;
          const nw = el.clientWidth, nh = el.clientHeight;
          if (nw && nh) {
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
          }
        };
        window.addEventListener('resize', onResize);

        // Cleanup stored for unmount
        el._cleanup = () => {
          window.removeEventListener('resize', onResize);
          if (animId.current) cancelAnimationFrame(animId.current);
          try { renderer.dispose(); } catch(e) {}
          try { if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); } catch(e) {}
        };

      } catch (err) {
        console.warn('Globe load error:', err);
        if (!cancelled) setStatus('error');
      }
    }

    init();

    return () => {
      cancelled = true;
      if (animId.current) cancelAnimationFrame(animId.current);
      if (ref.current && ref.current._cleanup) ref.current._cleanup();
    };
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 200 }}>
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36, margin: '0 auto 8px',
              border: '2px solid rgba(212,168,83,0.2)',
              borderTopColor: '#d4a853', borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ color: '#6b5c52', fontSize: 12 }}>Loading Globe...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <span style={{ color: '#6b5c52', fontSize: 12 }}>🌍 Globe unavailable</span>
        </div>
      )}
    </div>
  );
};


/* ================================================================
   LOGIN PAGE
   ================================================================ */

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // FIX BLANK PAGE: Navigate when auth state is settled
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try { await login(email, password); /* navigate via useEffect */ }
    catch (err) { /* context */ }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0a0506' }}>
      <LeftBrandPanel />

      {/* RIGHT — Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(139,26,26,0.12) 0%, transparent 55%)'
        }} />
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{
          background: 'linear-gradient(to bottom, transparent 10%, rgba(212,168,83,0.12) 50%, transparent 90%)'
        }} />

        <div className="relative z-10 w-full max-w-md px-8 py-12">
          <MobileLogo />
          <div className="flex justify-end mb-8"><BetaBadge /></div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>Login</h1>
            <p className="text-sm" style={{ color: '#6b5c52' }}>Masuk ke akun LuxQuant Terminal kamu</p>
          </div>

          {error && <ErrorAlert message={error} />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="Masukkan Email" />
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>Password</label>
              <PasswordInput value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword(!showPassword)} placeholder="Masukkan Password" />
              <div className="flex justify-end mt-2">
                <button type="button" className="text-xs hover:opacity-80 transition-opacity" style={{ color: '#d4a853' }}>Lupa password?</button>
              </div>
            </div>
            <GoldButton loading={loading} text="Login" loadingText="Loading..." />
          </form>

          <Divider text="Atau" />
          <div className="space-y-3">
            <SocialButton icon={<GoogleIcon />} text="Login dengan Google" onClick={() => {}} />
            <SocialButton icon={<TelegramIcon />} text="Login dengan Telegram" onClick={() => {}} />
          </div>

          <p className="mt-8 text-center text-sm" style={{ color: '#6b5c52' }}>
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold hover:opacity-80 transition-opacity" style={{ color: '#d4a853' }}>Daftar Sekarang</Link>
          </p>
          <p className="mt-3 text-center" style={{ color: '#6b5c52', fontSize: 11 }}>
            Dengan login, kamu setuju dengan <a href="#" className="underline hover:opacity-80" style={{ color: '#b8a89a' }}>Terms & Conditions</a>
          </p>
        </div>
      </div>
    </div>
  );
};


/* ================================================================
   SHARED COMPONENTS — exported for RegisterPage
   ================================================================ */

export const LeftBrandPanel = () => (
  <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ flexDirection: 'column' }}>
    <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #1a0a0c 0%, #0d0405 50%, #110607 100%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 15%, rgba(139,26,26,0.35) 0%, transparent 55%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 85% 85%, rgba(100,18,18,0.18) 0%, transparent 50%)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(212,168,83,0.03) 0%, transparent 45%)' }} />
    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent 10%, rgba(212,168,83,0.12) 50%, transparent 90%)' }} />
    <div className="absolute top-0 right-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent, rgba(212,168,83,0.08), transparent)' }} />

    <div className="relative z-10 flex h-full px-12 xl:px-16 pt-10 pb-10" style={{ flexDirection: 'column' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{
          background: 'linear-gradient(135deg, #f0d890, #d4a853, #8b6914)', boxShadow: '0 4px 20px rgba(212,168,83,0.2)'
        }}>
          <span className="text-lg font-bold" style={{ color: '#0a0506', fontFamily: 'Playfair Display, serif' }}>LQ</span>
        </div>
        <span className="text-white text-lg font-bold tracking-wide" style={{ fontFamily: 'Playfair Display, serif' }}>LuxQuant</span>
      </div>

      {/* Center content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 560, margin: '0 auto', width: '100%' }}>
        <h1 className="text-4xl xl:text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif', lineHeight: 1.15 }}>
          Premium Algorithm-Powered
        </h1>
        <h2 className="text-4xl xl:text-5xl font-bold mb-5" style={{ fontFamily: 'Playfair Display, serif', color: '#d4a853', fontStyle: 'italic', lineHeight: 1.15 }}>
          Crypto Trading Signals
        </h2>
        <p className="text-sm mb-6" style={{ color: '#b8a89a', lineHeight: 1.7, maxWidth: 420 }}>
          Systematic, objective, and data-driven signals powered by sophisticated algorithms.
        </p>

        {/* Globe container */}
        <div style={{ width: '100%', maxWidth: 380, aspectRatio: '1 / 1' }}>
          <InlineGlobe />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-center gap-10">
        {[
          { value: '85%+', label: 'Win Rate' },
          { value: '500+', label: 'Signals' },
          { value: '24/7', label: 'Monitoring' },
        ].map((s, i) => (
          <div key={i} className="text-center">
            <p className="text-lg font-bold mb-0.5" style={{ color: '#d4a853', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</p>
            <p style={{ fontSize: 10, color: '#6b5c52', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const MobileLogo = () => (
  <div className="lg:hidden text-center mb-10">
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f0d890, #d4a853, #8b6914)' }}>
        <span className="text-lg font-bold" style={{ color: '#0a0506', fontFamily: 'Playfair Display, serif' }}>LQ</span>
      </div>
      <span className="text-white text-lg font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>LuxQuant</span>
    </div>
  </div>
);

export const BetaBadge = () => (
  <span style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 999, background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.25)' }}>Beta</span>
);

export const ErrorAlert = ({ message }) => (
  <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    {message}
  </div>
);

export const InputField = ({ label, type = 'text', value, onChange, placeholder, hint }) => (
  <div>
    <label className="block text-sm font-medium mb-2" style={{ color: '#b8a89a' }}>{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3.5 rounded-xl text-white text-sm focus:outline-none transition-all duration-200"
      style={{ background: 'rgba(18,8,9,0.8)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={(e) => { e.target.style.borderColor = 'rgba(212,168,83,0.5)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'rgba(212,168,83,0.15)'; }} />
    {hint && <p className="mt-1 text-xs" style={{ color: '#6b5c52' }}>{hint}</p>}
  </div>
);

export const PasswordInput = ({ value, onChange, show, toggle, placeholder }) => (
  <div className="relative">
    <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3.5 pr-12 rounded-xl text-white text-sm focus:outline-none transition-all duration-200"
      style={{ background: 'rgba(18,8,9,0.8)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={(e) => { e.target.style.borderColor = 'rgba(212,168,83,0.5)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'rgba(212,168,83,0.15)'; }} />
    <button type="button" onClick={toggle} className="absolute right-4 top-1/2" style={{ transform: 'translateY(-50%)', color: '#6b5c52', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#d4a853'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#6b5c52'; }}>
      {show ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      )}
    </button>
  </div>
);

export const GoldButton = ({ loading, text, loadingText }) => (
  <button type="submit" disabled={loading}
    className="w-full py-3.5 font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
    style={{ background: 'linear-gradient(135deg, #d4a853 0%, #8b6914 100%)', color: '#0a0506', boxShadow: loading ? 'none' : '0 4px 25px rgba(212,168,83,0.2)' }}>
    <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, #f0d890 0%, #d4a853 100%)' }} />
    <span className="relative">{loading ? (
      <span className="flex items-center justify-center gap-2">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        {loadingText}
      </span>
    ) : text}</span>
  </button>
);

export const Divider = ({ text }) => (
  <div className="flex items-center gap-4 my-6">
    <div className="flex-1 h-px" style={{ background: 'rgba(212,168,83,0.1)' }} />
    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b5c52' }}>{text}</span>
    <div className="flex-1 h-px" style={{ background: 'rgba(212,168,83,0.1)' }} />
  </div>
);

export const SocialButton = ({ icon, text, onClick }) => (
  <button onClick={onClick} type="button"
    className="w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-3"
    style={{ background: 'rgba(18,8,9,0.6)', border: '1px solid rgba(212,168,83,0.1)', color: '#b8a89a' }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,83,0.25)'; e.currentTarget.style.background = 'rgba(212,168,83,0.04)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,83,0.1)'; e.currentTarget.style.background = 'rgba(18,8,9,0.6)'; }}>
    {icon}{text}
  </button>
);

export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
);

export const TelegramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#29ABE2"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
);

export default LoginPage;