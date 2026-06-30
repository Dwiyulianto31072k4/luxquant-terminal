// src/components/landing/v2/sections/shared/PhoneMockup.jsx
// ════════════════════════════════════════════════════════════════
// Shared iPhone hardware frame (titanium rim + dynamic island + side
// buttons + contact shadow). Same mockup used in the hero showcase —
// drop any portrait screenshot into `src`.
// ════════════════════════════════════════════════════════════════
const hideOnError = (event) => {
  event.currentTarget.style.display = "none";
};

export default function PhoneMockup({
  src,
  alt,
  className = "",
  screenClassName = "",
  imgClassName = "block h-auto w-full",
  children,
}) {
  return (
    <div className={`relative ${className}`}>
      {/* Silver aluminium side rail — ultra thin */}
      <div className="rounded-[2.3rem] bg-gradient-to-b from-[#eceef0] via-[#b8babe] to-[#e4e5e7] p-[1px] shadow-[0_24px_56px_rgba(0,0,0,0.85),0_0_34px_rgba(212,168,83,0.12)] sm:rounded-[2.6rem] lg:rounded-[2.9rem] lg:p-[1.5px]">
        {/* Thin black display bezel */}
        <div className="overflow-hidden rounded-[2.2rem] bg-black p-[1.5px] sm:rounded-[2.5rem] lg:rounded-[2.8rem] lg:p-[2px]">
          {/* Screen — follows the screenshot's own ratio (no crop) */}
          <div className={`relative overflow-hidden rounded-[2.1rem] bg-bg-primary sm:rounded-[2.4rem] lg:rounded-[2.7rem] ${screenClassName}`}>
            <img
              src={src}
              alt={alt}
              className={`relative z-10 ${imgClassName}`}
              onError={hideOnError}
            />
            {/* Dynamic Island — proportional pill (scales with phone width via
                aspect-ratio, so it stays a correct iPhone island at any size
                instead of a flat bar on larger renders) */}
            <div className="absolute inset-x-0 top-[2.4%] z-30 flex justify-center">
              <div className="aspect-[3.4/1] w-[31%] rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" />
            </div>
          </div>
        </div>
      </div>

      {/* side buttons — aluminium, real-iPhone proportions (% of full device
          height; lower ones may fall into the card clip — intended) */}
      {/* left: action/mute · volume up · volume down */}
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[21%] h-[5%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[29%] h-[7%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      <span aria-hidden="true" className="absolute left-[-1.5px] top-[38%] h-[7%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />
      {/* right: side/power button (longer) */}
      <span aria-hidden="true" className="absolute right-[-1.5px] top-[27%] h-[13%] w-[2px] rounded-r bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]" />

      {/* floating overlay slot (e.g. live gainer badge) */}
      {children}

      {/* contact shadow */}
      <div aria-hidden="true" className="mx-auto mt-1.5 h-2.5 w-[74%] rounded-[50%] bg-black/45 blur-md" />
    </div>
  );
}
