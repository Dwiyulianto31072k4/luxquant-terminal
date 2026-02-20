// src/components/auth/AuthGlobe.jsx
// 3D Globe component for auth pages — loads Three.js + ThreeGlobe from CDN
import { useEffect, useRef, useState } from 'react';

const CDN = {
  three:    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  orbit:    'https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js',
  globe:    'https://unpkg.com/three-globe@2.24.4/dist/three-globe.min.js',
};

/** Load a script tag, resolves when loaded. Skips if already present. */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

const LOCATIONS = [
  { lat: -6.2088,  lng: 106.8456, name: 'Jakarta' },
  { lat: 1.3521,   lng: 103.8198, name: 'Singapore' },
  { lat: 25.0330,  lng: 121.5654, name: 'Taipei' },
  { lat: 35.6762,  lng: 139.6503, name: 'Tokyo' },
  { lat: 40.7128,  lng: -74.0060, name: 'New York' },
  { lat: 51.5074,  lng: -0.1278,  name: 'London' },
  { lat: 25.2048,  lng: 55.2708,  name: 'Dubai' },
  { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
  { lat: 19.0760,  lng: 72.8777,  name: 'Mumbai' },
  { lat: -23.5505, lng: -46.6333, name: 'São Paulo' },
  { lat: 37.5665,  lng: 126.9780, name: 'Seoul' },
  { lat: 52.5200,  lng: 13.4050,  name: 'Berlin' },
];

const AuthGlobe = () => {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Load CDN scripts sequentially
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript(CDN.three);
        await loadScript(CDN.orbit);
        await loadScript(CDN.globe);
        if (!cancelled) setReady(true);
      } catch (e) {
        console.warn('Globe scripts failed to load', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Init globe once scripts are ready
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const THREE = window.THREE;
    const ThreeGlobe = window.ThreeGlobe;
    if (!THREE || !ThreeGlobe) return;

    const el = containerRef.current;
    const width  = el.clientWidth;
    const height = el.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    camera.position.set(0, 0, 280);

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1, 1, 1);
    scene.add(dir);

    // Globe
    const globe = new ThreeGlobe()
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#d4a853')
      .atmosphereAltitude(0.18);

    // Points
    globe
      .pointsData(LOCATIONS.map(l => ({ lat: l.lat, lng: l.lng, color: '#d4a853' })))
      .pointColor('color')
      .pointRadius(0.5)
      .pointAltitude(0.01);

    // Arcs from Jakarta
    const jakartaLat = -6.2088, jakartaLng = 106.8456;
    globe
      .arcsData(LOCATIONS.filter(l => l.name !== 'Jakarta').map(l => ({
        startLat: jakartaLat, startLng: jakartaLng,
        endLat: l.lat, endLng: l.lng, color: '#ffffff'
      })))
      .arcColor('color')
      .arcStroke(0.35)
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(3000);

    scene.add(globe);

    // Animate
    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [ready]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 300 }}>
      {!ready && (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(212,168,83,0.2)', borderTopColor: '#d4a853' }} />
            <span className="text-xs" style={{ color: '#6b5c52' }}>Loading Globe...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthGlobe;