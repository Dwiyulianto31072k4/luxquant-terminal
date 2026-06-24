// src/components/landing/v2/sections/slides/HeroSlideStandard.jsx
// ════════════════════════════════════════════════════════════════
// SLIDE 2 — "Standard" statement (gaya Synex), versi dark/gold.
//   • TANPA frame device — dashboard panel datar, rounded, dan
//     bawahnya FADE ilang ke background (mask) → kesan "tenggelam".
//   • Whitespace lega, copy pendek.
//   • Headline dua-nada: baris 1 redup, baris 2 solid + 1 kata gold.
//   • Aksen gold hemat; gak ada hijau (gak ada data di sini).
// Hanya KONTEN slide — wrapper/animasi ada di HeroSlider.
// ════════════════════════════════════════════════════════════════
export default function HeroSlideStandard() {
  return (
    <div className="w-full flex flex-col items-center text-center">
      {/* eyebrow */}
      <p className="text-gold-primary/70 text-[11px] sm:text-xs font-medium uppercase tracking-[0.32em] mb-6">
        Quantitative Crypto Intelligence
      </p>

      {/* headline dua-nada (Synex) */}
      <h1 className="font-bold tracking-tight leading-[1.05] mb-6 text-[2.5rem] sm:text-[3.4rem] lg:text-[4.3rem]">
        <span className="block text-white/30 font-semibold">A New Standard</span>
        <span className="block text-white">
          in{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b]">
            Algorithmic
          </span>{" "}
          Trading
        </span>
      </h1>

      {/* subcopy — pendek (2 baris) */}
      <p className="text-white/55 text-base sm:text-lg leading-relaxed max-w-xl mb-14">
        One terminal that reads the market in real time — precise entries,
        strict risk, a fully transparent record.
      </p>

      {/* dashboard — datar, rounded, fade ke bg (no device frame) */}
      <div className="relative w-full max-w-4xl mx-auto">
        {/* ambient gold glow (depth) */}
        <div className="absolute inset-x-6 top-4 h-2/3 bg-gold-primary/[0.06] blur-[120px] rounded-full pointer-events-none" />

        {/* hairline gold di tepi atas panel */}
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-[68%] h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent z-20" />

        {/* panel: rounded + mask fade bawah → 'tenggelam' */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, #000 0%, #000 56%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, #000 0%, #000 56%, transparent 100%)",
          }}
        >
          <img
            src="/mockups/hero-mac-dashboard.png"
            alt="LuxQuant terminal"
            className="w-full max-h-[440px] lg:max-h-[560px] object-cover object-top"
            onError={(e) => (e.target.style.display = "none")}
          />
        </div>
      </div>
    </div>
  );
}