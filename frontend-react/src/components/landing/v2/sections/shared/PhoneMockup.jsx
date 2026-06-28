// src/components/landing/v2/sections/shared/PhoneMockup.jsx
// ════════════════════════════════════════════════════════════════
// Shared iPhone hardware frame (titanium rim + dynamic island + side
// buttons + contact shadow). Same mockup used in the hero showcase —
// drop any portrait screenshot into `src`.
// ════════════════════════════════════════════════════════════════
const hideOnError = (event) => {
  event.currentTarget.style.display = "none";
};

export default function PhoneMockup({ src, alt, className = "", children }) {
  return (
    <div className={`relative ${className}`}>
      {/* Silver aluminium side rail — ultra thin */}
      <div className="rounded-[0.95rem] bg-gradient-to-b from-[#eceef0] via-[#b8babe] to-[#e4e5e7] p-[1px] shadow-[0_24px_56px_rgba(0,0,0,0.85),0_0_34px_rgba(212,168,83,0.12)] sm:rounded-[1.15rem] lg:rounded-[1.5rem] lg:p-[1.5px]">
        {/* Thin black display bezel */}
        <div className="overflow-hidden rounded-[0.9rem] bg-black p-[1.5px] sm:rounded-[1.1rem] lg:rounded-[1.44rem] lg:p-[2px]">
          {/* Screen — follows the screenshot's own ratio (no crop) */}
          <div className="relative overflow-hidden rounded-[0.8rem] bg-bg-primary sm:rounded-[1rem] lg:rounded-[1.32rem]">
            <img
              src={src}
              alt={alt}
              className="relative z-10 block h-auto w-full"
              onError={hideOnError}
            />
            {/* Dynamic Island */}
            <div className="absolute inset-x-0 top-[5px] z-30 flex justify-center sm:top-[6px] lg:top-[9px]">
              <div className="h-[8px] w-[30%] rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:h-[9px] lg:h-[13px]" />
            </div>
          </div>
        </div>
      </div>

      {/* side buttons — aluminium */}
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[20%] h-[6%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[30%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[42%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      <span aria-hidden="true" className="absolute right-[-1.5px] top-[28%] h-[12%] w-[2px] rounded-r bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />

      {/* floating overlay slot (e.g. live gainer badge) */}
      {children}

      {/* contact shadow */}
      <div aria-hidden="true" className="mx-auto mt-1.5 h-2.5 w-[74%] rounded-[50%] bg-black/45 blur-md" />
    </div>
  );
}
