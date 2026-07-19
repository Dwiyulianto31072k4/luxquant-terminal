// Load the three.js globe stack on demand, once, deduped across callers.
//
// These three scripts used to sit as <script defer> tags in index.html, which
// meant EVERY visitor on EVERY page downloaded ~800KB of CDN JavaScript for a
// globe that only renders on the landing and register pages. The globe
// components already self-loaded via an identical inline helper (querySelector
// dedupe), so the global tags were pure waste for anyone opening /signals.
//
// Callers must still guard `if (!window.THREE) return` — on CDN failure the
// globe is simply absent, never a crash. That contract is unchanged.
const SCRIPTS = [
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
  "https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js",
  "https://unpkg.com/three-globe@2.24.4/dist/three-globe.min.js",
];

const load = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

export async function ensureThree() {
  // sequential — OrbitControls and three-globe attach to window.THREE
  for (const src of SCRIPTS) await load(src);
  return Boolean(window.THREE && window.ThreeGlobe);
}
