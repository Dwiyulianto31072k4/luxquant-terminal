// src/components/landing/LandingGlobe.jsx
import { useEffect, useRef, useState } from 'react';

const SCRIPTS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three-globe@2.24.4/dist/three-globe.min.js',
];

const POINTS = [
  { lat: 25.03, lng: 121.57, label: 'Taipei' },
  { lat: -6.21, lng: 106.85, label: 'Jakarta' },
  { lat: 1.35, lng: 103.82, label: 'Singapore' },
  { lat: 35.68, lng: 139.69, label: 'Tokyo' },
  { lat: 37.57, lng: 126.98, label: 'Seoul' },
  { lat: 22.32, lng: 114.17, label: 'Hong Kong' },
  { lat: 40.71, lng: -74.01, label: 'New York' },
  { lat: 51.51, lng: -0.13, label: 'London' },
  { lat: 19.08, lng: 72.88, label: 'Mumbai' },
  { lat: -33.87, lng: 151.21, label: 'Sydney' },
  { lat: 55.76, lng: 37.62, label: 'Moscow' },
  { lat: 48.86, lng: 2.35, label: 'Paris' },
];

const LandingGlobe = () => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let renderer, scene, camera, globe, frameId;

    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });

    const init = async () => {
      try {
        for (const src of SCRIPTS) await loadScript(src);
        if (!containerRef.current || !window.THREE || !window.ThreeGlobe) return;

        const THREE = window.THREE;
        const ThreeGlobe = window.ThreeGlobe;
        const el = containerRef.current;
        const w = el.clientWidth;
        const h = el.clientHeight;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
        camera.position.z = 280;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);

        globe = new ThreeGlobe()
          .globeImageUrl('https://unpkg.com/three-globe@2.24.4/example/img/earth-night.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe@2.24.4/example/img/earth-topology.png')
          .pointsData(POINTS)
          .pointColor(() => '#d4a853')
          .pointAltitude(0.07)
          .pointRadius(0.5)
          .arcsData(POINTS.slice(1).map(p => ({ startLat: POINTS[0].lat, startLng: POINTS[0].lng, endLat: p.lat, endLng: p.lng })))
          .arcColor(() => ['rgba(212, 168, 83, 0.6)', 'rgba(212, 168, 83, 0.1)'])
          .arcStroke(0.5)
          .arcDashLength(0.4)
          .arcDashGap(0.2)
          .arcDashAnimateTime(2000)
          .atmosphereColor('#d4a853')
          .atmosphereAltitude(0.15);

        const globeMat = globe.globeMaterial();
        globeMat.bumpScale = 10;
        globeMat.emissive = new THREE.Color(0x220000);
        globeMat.emissiveIntensity = 0.1;

        scene.add(globe);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dl = new THREE.DirectionalLight(0xffffff, 0.8);
        dl.position.set(1, 1, 1);
        scene.add(dl);

        setLoading(false);

        const animate = () => {
          frameId = requestAnimationFrame(animate);
          globe.rotation.y += 0.002;
          renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
          if (!containerRef.current) return;
          const nw = containerRef.current.clientWidth;
          const nh = containerRef.current.clientHeight;
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      } catch (e) {
        console.warn('Globe init failed:', e);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (renderer) {
        renderer.dispose();
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default LandingGlobe;