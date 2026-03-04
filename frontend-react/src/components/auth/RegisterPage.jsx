// src/components/auth/RegisterPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftBrandPanel, { TypewriterLine } from './LeftBrandPanel';

const RegisterPage = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const { register, error, setError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setError(null);
    if (password !== confirmPassword) { setLocalError(a('err_password_mismatch')); return; }
    if (password.length < 8) { setLocalError(a('err_password_min')); return; }
    if (username.length < 3) { setLocalError(a('err_username_min')); return; }
    setLoading(true);
    try { await register(email, username, password); }
    catch (err) { /* handled */ }
    finally { setLoading(false); }
  };

  const displayError = localError || error;

  const getStrength = (pwd) => {
    if (!pwd) return { level: 0, label: '', color: '' };
    let s = 0;
    if (pwd.length >= 8) s++; if (pwd.length >= 12) s++;
    if (/[A-Z]/.test(pwd)) s++; if (/[0-9]/.test(pwd)) s++; if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 1) return { level: 1, label: a('strength_weak'), color: '#f87171' };
    if (s <= 2) return { level: 2, label: a('strength_fair'), color: '#fbbf24' };
    if (s <= 3) return { level: 3, label: a('strength_good'), color: '#4ade80' };
    return { level: 4, label: a('strength_strong'), color: '#22c55e' };
  };
  const strength = getStrength(password);

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'rgba(212,168,83,0.2)' }} />
            <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#d4a853' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: '#8a7a6e' }}>{a('preparing')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-x-hidden" style={{ background: '#0a0506' }}>
      <LeftBrandPanel />

      <div className="w-full lg:w-[45%] flex items-center justify-center relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-0">
        <div className="absolute inset-0 pointer-events-none fixed" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,26,26,0.1) 0%, transparent 60%)' }} />
        <div className="hidden lg:block absolute left-0 top-0 h-full w-px" style={{ background: 'linear-gradient(to bottom, transparent 10%, rgba(212,168,83,0.15) 50%, transparent 90%)' }} />
        <style>{`@keyframes lq-blink { 50% { opacity: 0; } }`}</style>

        {/* LOGO MOBILE */}
        <div className="lg:hidden absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2.5 z-30">
          <img src="/logo.png" alt="LuxQuant" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <span className="text-white font-bold tracking-wide" style={{ fontFamily: 'Playfair Display, serif', fontSize: 17 }}>LuxQuant</span>
        </div>

        {/* GLASSMORPHISM WRAPPER */}
        <div className="relative z-10 w-full max-w-md px-5 py-5 sm:px-10 sm:py-10 rounded-[2rem] transition-all duration-500 mt-16 sm:mt-20 lg:mt-10 mb-6 sm:mb-8"
             style={{ 
               background: 'rgba(255, 255, 255, 0.02)', 
               border: '1px solid rgba(212, 168, 83, 0.08)',
               backdropFilter: 'blur(20px)',
               WebkitBackdropFilter: 'blur(20px)',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
             }}>

          {/* Heading */}
          <div className="mb-1 text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1.5" style={{ fontFamily: 'Playfair Display, serif' }}>{a('register_title')}</h1>
            <p className="text-sm" style={{ color: '#8a7a6e' }}>{a('register_subtitle')}</p>
          </div>

          {/* Mobile typewriter */}
          <div className="lg:hidden mb-1 mt-2">
            <TypewriterLine mobile />
          </div>

          {/* Mobile globe — compact for register */}
          <div className="lg:hidden mb-2" style={{ margin: '0 -24px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 280, aspectRatio: '1 / 0.65', margin: '0 auto' }}>
              <MobileGlobeInner />
              <FlagBadgesCompact />
            </div>
            <p className="text-center" style={{ fontSize: 11, color: '#8a7a6e', marginTop: -2, paddingBottom: 4, letterSpacing: '0.03em' }}>
              <span style={{ color: '#d4a853' }}>🌍</span>{' '}
              {a('globe_more')} <span style={{ color: '#b8a89a', fontWeight: 600 }}>{a('globe_countries')}</span> {a('globe_trust')}
            </p>
          </div>

          {displayError && (
            <div className="mb-4 p-3.5 rounded-xl text-sm flex items-center gap-3 animate-pulse" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {displayError}
            </div>
          )}

          {/* ── FORM ── */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <FormInput label={a('email')} type="email" value={email} onChange={setEmail} placeholder={a('email_placeholder')} />
            <div>
              <FormInput label={a('username')} type="text" value={username} onChange={setUsername} placeholder={a('username_placeholder')} />
              <p className="mt-1 text-xs ml-1" style={{ color: '#8a7a6e' }}>{a('username_hint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 sm:mb-2" style={{ color: '#b8a89a' }}>{a('password')}</label>
              <PasswordField value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword(!showPassword)} placeholder={a('password_min')} />
              {password && (
                <div className="mt-2 bg-black/30 p-2 rounded-xl border border-white/5 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider w-12 text-right transition-colors" style={{ color: strength.color }}>{strength.label}</span>
                    <div className="flex-1 flex gap-1.5">
                      {[1,2,3,4].map(l => (
                        <div key={l} className="h-1.5 flex-1 rounded-full transition-all duration-300" style={{ background: l <= strength.level ? strength.color : 'rgba(255,255,255,0.08)' }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 sm:mb-2" style={{ color: '#b8a89a' }}>{a('confirm_password')}</label>
              <PasswordField value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} placeholder={a('confirm_placeholder')} />
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs flex items-center gap-1 ml-1" style={{ color: '#f87171' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  {a('password_mismatch')}
                </p>
              )}
              {confirmPassword && confirmPassword === password && password && (
                <p className="mt-1 text-xs flex items-center gap-1 ml-1" style={{ color: '#4ade80' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  {a('password_match')}
                </p>
              )}
            </div>

            <div className="pt-1 sm:pt-3">
              <GoldButton loading={loading} text={a('register_button')} loadingText={a('register_loading')} />
            </div>
          </form>

          {/* ── SOCIAL ── */}
          <Divider text={a('or_register_with')} />

          <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
            <SocialBtn icon={<GoogleIcon />} text="Google" />
            <SocialBtn icon={<TelegramIcon />} text="Telegram" />
          </div>

          <p className="mt-3 sm:mt-6 text-center text-sm" style={{ color: '#8a7a6e' }}>
            {a('has_account')}{' '}
            <Link to="/login" className="font-semibold transition-all hover:tracking-wide" style={{ color: '#d4a853' }}>{a('login_title')}</Link>
          </p>
          <p className="mt-2 sm:mt-4 text-center pb-1" style={{ color: '#6b5c52', fontSize: 11 }}>
            {a('register_terms')}{' '}
            <a href="#" className="underline hover:opacity-80 transition-opacity" style={{ color: '#b8a89a' }}>{a('terms')}</a>
            {' '}{a('and')}{' '}
            <a href="#" className="underline hover:opacity-80 transition-opacity" style={{ color: '#b8a89a' }}>{a('privacy')}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Inline globe for register ── */

const MobileGlobeInner = () => {
  const ref = useRef(null), anim = useRef(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let dead = false;
    const t = setTimeout(() => {
      if (dead || !ref.current) return;
      const T = window.THREE, TG = window.ThreeGlobe;
      if (!T || !TG) return;
      try {
        const el = ref.current, w = el.clientWidth || 300, h = el.clientHeight || 300;
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
        const g = new TG()
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .showAtmosphere(true).atmosphereColor('#d4a853').atmosphereAltitude(0.2);
        const LOCS = [
          { lat: 25.033, lng: 121.565, s: 0.9, hub: true },
          { lat: 39.933, lng: 32.860, s: 0.7 }, { lat: 40.713, lng: -74.006, s: 0.65 },
          { lat: -6.209, lng: 106.846, s: 0.6 }, { lat: 35.676, lng: 139.650, s: 0.5 },
          { lat: 51.507, lng: -0.128, s: 0.55 }, { lat: 37.567, lng: 126.978, s: 0.45 },
        ];
        g.pointsData(LOCS.map(l => ({ lat: l.lat, lng: l.lng, color: l.hub ? '#f0d890' : '#d4a853', altitude: 0.01, radius: l.s })))
          .pointColor('color').pointRadius('radius').pointAltitude('altitude');
        const hub = LOCS[0];
        g.arcsData(LOCS.filter(l => !l.hub).map(l => ({
          startLat: hub.lat, startLng: hub.lng, endLat: l.lat, endLng: l.lng,
          color: ['#f0d890', '#d4a853'], stroke: 0.4
        }))).arcColor('color').arcStroke('stroke').arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(3000);
        sc.add(g); setOk(true);
        let cleanup;
        (function loop() { anim.current = requestAnimationFrame(loop); ct.update(); r.render(sc, cam); })();
        const onR = () => { const nw = el.clientWidth, nh = el.clientHeight; if (nw && nh) { cam.aspect = nw / nh; cam.updateProjectionMatrix(); r.setSize(nw, nh); } };
        window.addEventListener('resize', onR);
        cleanup = () => { window.removeEventListener('resize', onR); if (anim.current) cancelAnimationFrame(anim.current); try { r.dispose(); } catch(e){} try { if (el?.contains(r.domElement)) el.removeChild(r.domElement); } catch(e){} };
        ref.current._cleanup = cleanup;
      } catch (e) { console.error('Globe err:', e); }
    }, 600);
    return () => { dead = true; clearTimeout(t); if (anim.current) cancelAnimationFrame(anim.current); if (ref.current?._cleanup) ref.current._cleanup(); };
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {!ok && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ width: 32, height: 32, border: '2px solid rgba(212,168,83,0.15)', borderTopColor: '#d4a853', borderRadius: '50%', animation: 'lq-spin 1s linear infinite' }} />
        </div>
      )}
      <style>{`@keyframes lq-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const FLAGS_COMPACT = [
  { emoji: '🇹🇼', name: 'Taiwan', top: 6, left: 50 },
  { emoji: '🇺🇸', name: 'US', top: 22, left: 85 },
  { emoji: '🇮🇩', name: 'Indonesia', top: 70, left: 82 },
  { emoji: '🇯🇵', name: 'Japan', top: 45, left: 2 },
  { emoji: '🇬🇧', name: 'UK', top: 85, left: 20 },
  { emoji: '🇰🇷', name: 'Korea', top: 35, left: 90 },
];

const FlagBadgesCompact = () => (
  <>
    <style>{`
      @keyframes lq-float {
        0%, 100% { transform: translateY(0px); }
        33% { transform: translateY(-8px); }
        66% { transform: translateY(-4px); }
      }
    `}</style>
    {FLAGS_COMPACT.map((f, i) => (
      <div key={i} style={{
        position: 'absolute', top: `${f.top}%`, left: `${f.left}%`, zIndex: 20,
        animation: `lq-float ${5.5 + i * 0.3}s ease-in-out ${i * 0.4}s infinite`,
        transform: 'translateX(-50%)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px 3px 5px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>{f.emoji}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.7)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{f.name}</span>
        </div>
      </div>
    ))}
  </>
);

/* ── Shared form components ── */

const FormInput = ({ label, type = 'text', value, onChange, placeholder }) => (
  <div>
    {label && <label className="block text-sm font-medium mb-1.5 sm:mb-2" style={{ color: '#b8a89a' }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3 sm:py-3.5 rounded-2xl text-white text-sm focus:outline-none transition-all duration-300"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={e => { 
        e.target.style.borderColor = '#d4a853'; 
        e.target.style.boxShadow = '0 0 0 4px rgba(212,168,83,0.15)';
        e.target.style.background = 'rgba(0,0,0,0.5)';
      }}
      onBlur={e => { 
        e.target.style.borderColor = 'rgba(212,168,83,0.15)'; 
        e.target.style.boxShadow = 'none';
        e.target.style.background = 'rgba(0,0,0,0.3)';
      }} />
  </div>
);

const PasswordField = ({ value, onChange, show, toggle, placeholder }) => (
  <div className="relative group">
    <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
      className="w-full px-4 py-3 sm:py-3.5 pr-12 rounded-2xl text-white text-sm focus:outline-none transition-all duration-300"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
      onFocus={e => { 
        e.target.style.borderColor = '#d4a853'; 
        e.target.style.boxShadow = '0 0 0 4px rgba(212,168,83,0.15)';
        e.target.style.background = 'rgba(0,0,0,0.5)';
      }}
      onBlur={e => { 
        e.target.style.borderColor = 'rgba(212,168,83,0.15)'; 
        e.target.style.boxShadow = 'none';
        e.target.style.background = 'rgba(0,0,0,0.3)';
      }} />
    <button type="button" onClick={toggle} className="absolute right-4 top-1/2 p-1 rounded-md transition-all" style={{ transform: 'translateY(-50%)', color: '#6b5c52', background: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#d4a853'; e.currentTarget.style.background = 'rgba(212,168,83,0.1)'; }} 
      onMouseLeave={e => { e.currentTarget.style.color = '#6b5c52'; e.currentTarget.style.background = 'transparent'; }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {show ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
      </svg>
    </button>
  </div>
);

const GoldButton = ({ loading, text, loadingText }) => (
  <button type="submit" disabled={loading}
    className="w-full py-3.5 sm:py-4 font-bold rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group active:scale-[0.98]"
    style={{ background: 'linear-gradient(135deg, #d4a853 0%, #8b6914 100%)', color: '#0a0506', boxShadow: loading ? 'none' : '0 10px 25px -5px rgba(212,168,83,0.4)' }}>
    <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, #fceca1 0%, #d4a853 100%)' }} />
    <span className="relative flex justify-center items-center gap-2">{loading ? (
      <>
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        {loadingText}
      </>
    ) : text}</span>
  </button>
);

const Divider = ({ text }) => (
  <div className="flex items-center gap-4 my-4 sm:my-7 opacity-70">
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.4))' }} />
    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a7a6e' }}>{text}</span>
    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(212,168,83,0.4))' }} />
  </div>
);

const SocialBtn = ({ icon, text }) => (
  <button type="button"
    className="w-full py-3 sm:py-3.5 rounded-2xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 hover:-translate-y-1 active:scale-95 shadow-sm"
    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(212,168,83,0.15)', color: '#b8a89a' }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,83,0.4)'; e.currentTarget.style.background = 'rgba(212,168,83,0.08)'; e.currentTarget.style.color = '#fff'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,168,83,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = '#b8a89a'; }}>
    {icon} <span>{text}</span>
  </button>
);

const GoogleIcon = () => <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
const TelegramIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="#29ABE2"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>;

export default RegisterPage;