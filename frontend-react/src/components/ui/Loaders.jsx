// src/components/ui/Loaders.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Loading system (v1)
// Best-practice loading UX (Facebook/LinkedIn/YouTube pattern):
// • LoadingScreen — branded full-screen loader for COLD BOOT and
// full-page route transitions (logo + gold ring + shimmer bar).
// Visually identical to the zero-JS pre-boot loader in index.html
// so the handoff is seamless (no flash / no layout jump).
// • Skeleton / PageSkeleton — content placeholders for IN-APP route
// & data loads. Skeletons feel ~20–30% faster than spinners and
// kill layout shift by mirroring the final layout.
// Spinners are reserved for short discrete actions (save/auth/pay).
// ════════════════════════════════════════════════════════════════

const BRAND_BG = "#0a0506";
const GOLD = "rgb(var(--accent))";

// ── Shared shimmer keyframes (injected once per loader instance) ──
export const ShimmerStyles = () => (
 <style>{`
 @keyframes lqShimmer { 100% { transform: translateX(100%); } }
 @keyframes lqSpin { to { transform: rotate(360deg); } }
 @keyframes lqBreathe { 0%,100% { opacity:.85; transform: scale(1); } 50% { opacity:1; transform: scale(1.04); } }
 @keyframes lqBarSlide { 0% { left:-40%; } 100% { left:100%; } }
 @keyframes lqFadeIn { from { opacity:0; } to { opacity:1; } }
 .lqsk { position: relative; overflow: hidden; background: rgb(var(--ink) / 0.05); border-radius: 8px; }
 .lqsk::after { content:""; position:absolute; inset:0; transform: translateX(-100%);
 background: linear-gradient(90deg, transparent, rgb(var(--ink) / 0.07), transparent);
 animation: lqShimmer 1.4s infinite; }
 /* Group shimmer: one sweep across an existing multi-bar skeleton block */
 .lqsk-group { position: relative; overflow: hidden; }
 .lqsk-group::after { content:""; position:absolute; inset:0; transform: translateX(-100%); pointer-events:none;
 background: linear-gradient(90deg, transparent, rgb(var(--ink) / 0.06), transparent);
 animation: lqShimmer 1.6s infinite; }
 `}</style>
);

// ═══════════════════════════════════════════
// LoadingScreen — branded full-screen loader
// ═══════════════════════════════════════════
export function LoadingScreen({ label = "Loading LuxQuant", fullscreen = true }) {
 return (
 <div
 className={`${fullscreen ? "fixed inset-0" : "min-h-[60vh] w-full"} z-[90000] flex items-center justify-center`}
 style={{ background: fullscreen ? BRAND_BG : "transparent", animation: "lqFadeIn .2s ease" }}
 role="status"
 aria-live="polite"
 aria-label={label}
 >
 <ShimmerStyles />
 {/* faint radial gold glow behind emblem */}
 <div
 className="pointer-events-none absolute"
 style={{
 width: 340, height: 340, borderRadius: "50%",
 background: `radial-gradient(circle, ${GOLD}22 0%, transparent 62%)`,
 filter: "blur(6px)",
 }}
 />
 <div className="relative flex flex-col items-center gap-6">
 {/* Emblem: rotating gold ring + breathing logo */}
 <div className="relative" style={{ width: 72, height: 72 }}>
 <span
 className="absolute inset-0 rounded-full"
 style={{ border: `2px solid ${GOLD}22` }}
 />
 <span
 className="absolute inset-0 rounded-full"
 style={{
 border: "2px solid transparent",
 borderTopColor: GOLD,
 borderRightColor: `${GOLD}99`,
 animation: "lqSpin 0.9s linear infinite",
 }}
 />
 <div className="absolute inset-0 flex items-center justify-center" style={{ animation: "lqBreathe 2.4s ease-in-out infinite" }}>
 <img
 src="/logo.png"
 alt="LuxQuant"
 width={34}
 height={34}
 style={{ objectFit: "contain" }}
 onError={(e) => { e.currentTarget.style.display = "none"; }}
 />
 </div>
 </div>

 {/* Wordmark */}
 <div className="flex flex-col items-center gap-3">
 <span
 className="font-mono uppercase"
 style={{ color: "rgb(var(--fg))", fontSize: 13, letterSpacing: "0.42em", textIndent: "0.42em", fontWeight: 600 }}
 >
 LuxQuant
 </span>
 {/* Indeterminate shimmer bar */}
 <div style={{ position: "relative", width: 140, height: 2, borderRadius: 2, background: "rgb(var(--ink) / 0.08)", overflow: "hidden" }}>
 <span
 style={{
 position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 2,
 background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
 animation: "lqBarSlide 1.15s ease-in-out infinite",
 }}
 />
 </div>
 {label ? (
 <span className="font-mono" style={{ color: "rgb(var(--fg-muted))", fontSize: 10, letterSpacing: "0.16em" }}>
 {label}…
 </span>
 ) : null}
 </div>
 </div>
 </div>
 );
}

// ═══════════════════════════════════════════
// Skeleton primitive
// ═══════════════════════════════════════════
export function Skeleton({ className = "", style }) {
 return <div className={`lqsk ${className}`} style={style} />;
}

// ═══════════════════════════════════════════
// PageSkeleton — generic content app-shell placeholder
// Used as the Suspense fallback for in-shell route content. Mirrors the
// common terminal layout (eyebrow + title, stat cards, then a data list)
// so route switches feel instant and don't shift layout.
// ═══════════════════════════════════════════
export function PageSkeleton() {
 return (
 <div className="w-full px-1 py-2 animate-[lqFadeIn_.2s_ease]" role="status" aria-label="Loading content">
 <ShimmerStyles />

 {/* Header */}
 <div className="mb-6 space-y-2">
 <Skeleton className="h-2.5 w-24" />
 <Skeleton className="h-7 w-56 max-w-[70%]" />
 <Skeleton className="h-3 w-80 max-w-[90%]" />
 </div>

 {/* Stat cards */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="rounded-lg border border-ink/[0.06] bg-ink/[0.015] p-4 space-y-3">
 <Skeleton className="h-2 w-16" />
 <Skeleton className="h-6 w-24" />
 <Skeleton className="h-1 w-full" />
 </div>
 ))}
 </div>

 {/* Data list / table */}
 <div className="rounded-lg border border-ink/[0.06] overflow-hidden">
 <div className="flex items-center justify-between px-4 py-3 border-b border-ink/[0.06]">
 <Skeleton className="h-2.5 w-28" />
 <Skeleton className="h-2.5 w-16" />
 </div>
 {[...Array(8)].map((_, i) => (
 <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-ink/[0.04]">
 <Skeleton className="h-7 w-7 !rounded-full shrink-0" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-3 w-1/3" />
 <Skeleton className="h-2 w-1/2" />
 </div>
 <Skeleton className="h-4 w-16 shrink-0" />
 <Skeleton className="hidden sm:block h-4 w-14 shrink-0" />
 </div>
 ))}
 </div>
 </div>
 );
}

export default LoadingScreen;
