// src/components/ui/Loaders.jsx
// ════════════════════════════════════════════════════════════════
// Loading system — top-app pattern (Linear / Stripe / Coinbase / Apple)
//
// Cold boot & full-page: thin spinner only. No logo, no wordmark.
// Branding on every load reads amateur; product apps stay silent.
// In-app routes: PageSkeleton (content placeholders, no brand stamp).
// Spinners: short discrete actions (save / auth / pay) only.
// ════════════════════════════════════════════════════════════════

// ── Shared keyframes (injected once per loader instance) ──
export const ShimmerStyles = () => (
  <style>{`
 @keyframes lqShimmer { 100% { transform: translateX(100%); } }
 @keyframes lqSpin { to { transform: rotate(360deg); } }
 @keyframes lqFadeIn { from { opacity:0; } to { opacity:1; } }
 .lqsk { position: relative; overflow: hidden; background: rgb(var(--ink) / 0.05); border-radius: 8px; }
 .lqsk::after { content:""; position:absolute; inset:0; transform: translateX(-100%);
 background: linear-gradient(90deg, transparent, rgb(var(--ink) / 0.07), transparent);
 animation: lqShimmer 1.4s infinite; }
 .lqsk-group { position: relative; overflow: hidden; }
 .lqsk-group::after { content:""; position:absolute; inset:0; transform: translateX(-100%); pointer-events:none;
 background: linear-gradient(90deg, transparent, rgb(var(--ink) / 0.06), transparent);
 animation: lqShimmer 1.6s infinite; }
 `}</style>
);

/**
 * Minimal full-screen (or block) loader.
 * Same visual language as index.html preboot — seamless handoff.
 * @param {string} [label] — screen-reader only (not shown)
 * @param {boolean} [fullscreen=true]
 */
export function LoadingScreen({ label = "Loading", fullscreen = true }) {
  return (
    <div
      className={`${fullscreen ? "lq-modal-safe fixed inset-0" : "min-h-[50vh] w-full"} z-[90000] flex items-center justify-center`}
      style={{
        // Solid surface — match preboot handoff; avoid theme flash
        background: fullscreen ? "#0a0506" : "transparent",
        animation: "lqFadeIn .18s ease",
      }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <ShimmerStyles />
      {/* Quiet spinner — Stripe / Linear weight */}
      <div
        className="relative shrink-0"
        style={{ width: 28, height: 28 }}
        aria-hidden
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: "1.5px solid rgb(255 255 255 / 0.08)",
          }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: "1.5px solid transparent",
            borderTopColor: "rgb(255 255 255 / 0.55)",
            animation: "lqSpin 0.7s linear infinite",
          }}
        />
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
// Used as Suspense fallback for in-shell route content.
// ═══════════════════════════════════════════
export function PageSkeleton() {
  return (
    <div
      className="w-full px-1 py-2 animate-[lqFadeIn_.2s_ease]"
      role="status"
      aria-label="Loading content"
    >
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
