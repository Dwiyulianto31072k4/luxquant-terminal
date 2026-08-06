// src/components/landing/v2/LandingPageV2.jsx
// ════════════════════════════════════════════════════════════════
// LandingPageV2 — orchestrator. Fetch data SEKALI (useLandingData),
// rakit section berurutan, pass data via props.
//
// Status: WIP preview. Section yang udah jadi: Header, Hero, ProofBar,
// TopGainers, GlobalReach. Berikutnya tinggal ditambah di bawah
// GlobalReach (Architecture, Performance, FAQ, Footer).
//
// Catatan:
// • Root wrapper pakai class "lp-v2" → scope font Poppins (lihat index.css).
// • "overflow-x-hidden" di root inilah yang bikin position:sticky mati,
// makanya HeaderV2 pakai position:fixed (jangan dibalikin ke sticky).
//
// Dipasang di route /v2 (lihat catatan integrasi App.jsx).
// ════════════════════════════════════════════════════════════════
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import Seo from "../../Seo";
import { saveRefFromURL } from "../../../utils/referralStorage";
import { trackFunnel } from "../../../utils/funnelAnalytics";
import { landingFaqJsonLd } from "../../../content/faq";
import useLandingData from "./useLandingData";
import HeaderV2 from "./sections/HeaderV2";
import HeroSlider from "./sections/HeroSlider";
import RecentWinnersMarquee from "./sections/RecentWinnersMarquee";
import TopGainers from "./sections/TopGainers";
import Architecture from "./sections/Architecture";
import TerminalPreview from "./sections/TerminalPreview";
import Performance from "./sections/Performance";
import CoinSpotlight from "./sections/CoinSpotlight";
import FreeTierV2 from "./sections/FreeTierV2";
import FaqV2 from "./sections/FaqV2";
import FooterV2 from "./sections/FooterV2";
import StickyLandingCta from "./sections/shared/StickyLandingCta";

// Heavy canvas globe — code-split so first paint / mid-funnel stay light.
const GlobalReach = lazy(() => import("./sections/GlobalReach"));

export default function LandingPageV2() {
  const { stats, topGainers, performanceData } = useLandingData();
  const [activeId, setActiveId] = useState("hero");
  // Hero carousel: only pull Real calls into dissolve on video slide.
  const [heroIsVideo, setHeroIsVideo] = useState(true);

  // Capture ?ref= → localStorage (sama seperti v1)
  useEffect(() => {
    saveRefFromURL();
    trackFunnel("landing_view", { source: "landing_v2", path: "/" });
  }, []);

  const scrollTo = (id) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onHeroSlideChange = useCallback((_idx, meta) => {
    setHeroIsVideo(Boolean(meta?.isVideoSlide));
  }, []);

  return (
    <div className="lp-v2 min-h-screen bg-bg-primary text-text-primary relative overflow-x-hidden">
      <Seo
        title="LuxQuant Terminal — Algo-Backed Crypto Calls"
        description="Algo-backed crypto calls with transparent, timestamped entries, targets and stops you can audit — plus free market tools. Premium unlocks live levels and the full terminal."
        path="/"
        keywords="luxquant, algo-backed crypto calls, transparent track record, crypto terminal, market pulse"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": "https://luxquant.tw/#organization",
            name: "LuxQuant",
            url: "https://luxquant.tw/",
            description:
              "Quantitative crypto market intelligence — algorithmic signals, on-chain intelligence, risk scoring, and AI research.",
            foundingDate: "2023",
            logo: {
              "@type": "ImageObject",
              url: "https://luxquant.tw/logo-512.png",
              width: 512,
              height: 512,
            },
            sameAs: ["https://x.com/luxquantcrypto", "https://t.me/LuxQuantSignal"],
            knowsAbout: [
              "cryptocurrency trading",
              "algorithmic trading signals",
              "on-chain analysis",
              "money flow",
              "Bitcoin dominance",
            ],
          },
          landingFaqJsonLd(),
        ]}
      />
      {/* Continuous brand canvas — ONE seamless background for every
 section (scrolls with content, no fixed-bg banding). Sections
 stay transparent so this flows through them without hard edges. */}
      <div aria-hidden="true" className="lux-warm-page pointer-events-none absolute inset-0 z-0" />

      <HeaderV2 onNav={scrollTo} activeId={activeId} />
      <main id="main">
        {/* Conversion order: proof → free CTA → how it works → product → depth */}
        <HeroSlider onNav={scrollTo} gainers={topGainers} onSlideChange={onHeroSlideChange} />
        <RecentWinnersMarquee gainers={topGainers} blendWithHero={heroIsVideo} />
        <TopGainers stats={stats} gainers={topGainers} onNav={scrollTo} />
        <FreeTierV2 />
        <Architecture />
        <TerminalPreview />
        <Performance data={performanceData} />
        <CoinSpotlight />
        <FaqV2 />
        {/* Brand spectacle last — lazy chunk, lowest conversion priority */}
        <Suspense
          fallback={
            <div
              className="mx-auto min-h-[200px] max-w-6xl px-4 py-12"
              aria-hidden="true"
            />
          }
        >
          <GlobalReach gainers={topGainers} stats={stats} />
        </Suspense>
      </main>
      <FooterV2 onNav={scrollTo} />
      <StickyLandingCta />
    </div>
  );
}
