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
import { useCallback, useEffect, useState } from "react";
import Seo from "../../Seo";
import { saveRefFromURL } from "../../../utils/referralStorage";
import { landingFaqJsonLd } from "../../../content/faq";
import useLandingData from "./useLandingData";
import HeaderV2 from "./sections/HeaderV2";
import HeroSlider from "./sections/HeroSlider";
import RecentWinnersMarquee from "./sections/RecentWinnersMarquee";
import TopGainers from "./sections/TopGainers";
import GlobalReach from "./sections/GlobalReach";
import Architecture from "./sections/Architecture";
import TerminalPreview from "./sections/TerminalPreview";
import Performance from "./sections/Performance";
import CoinSpotlight from "./sections/CoinSpotlight";
import FreeTierV2 from "./sections/FreeTierV2";
import FaqV2 from "./sections/FaqV2";
import FooterV2 from "./sections/FooterV2";

export default function LandingPageV2() {
  const { stats, topGainers, performanceData } = useLandingData();
  const [activeId, setActiveId] = useState("hero");
  // Hero carousel: only pull Real calls into dissolve on video slide.
  const [heroIsVideo, setHeroIsVideo] = useState(true);

  // Capture ?ref= → localStorage (sama seperti v1)
  useEffect(() => {
    saveRefFromURL();
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
        title="LuxQuant Terminal — Quantitative Crypto Intelligence"
        description="LuxQuant Terminal turns market data into a quantitative edge with algorithmic analysis, on-chain intelligence, and risk scoring. Trade smarter, with confidence. Informed by data, decided by you."
        path="/"
        keywords="luxquant, crypto terminal, quantitative crypto, trading signals, on-chain intelligence, autotrade"
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
      <HeroSlider onNav={scrollTo} gainers={topGainers} onSlideChange={onHeroSlideChange} />
      <RecentWinnersMarquee gainers={topGainers} blendWithHero={heroIsVideo} />
      <TopGainers stats={stats} gainers={topGainers} onNav={scrollTo} />
      <Architecture />
      <TerminalPreview />
      <Performance data={performanceData} />
      <CoinSpotlight />
      <GlobalReach gainers={topGainers} />
      <FreeTierV2 />
      <FaqV2 />
      <FooterV2 onNav={scrollTo} />
    </div>
  );
}
