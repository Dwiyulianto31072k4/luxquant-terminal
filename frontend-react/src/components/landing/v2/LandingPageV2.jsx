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
//  • Root wrapper pakai class "lp-v2" → scope font Poppins (lihat index.css).
//  • "overflow-x-hidden" di root inilah yang bikin position:sticky mati,
//    makanya HeaderV2 pakai position:fixed (jangan dibalikin ke sticky).
//
// Dipasang di route /v2 (lihat catatan integrasi App.jsx).
// ════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import Seo from "../../Seo";
import { saveRefFromURL } from "../../../utils/referralStorage";
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

  // Capture ?ref= → localStorage (sama seperti v1)
  useEffect(() => {
    saveRefFromURL();
  }, []);

  const scrollTo = (id) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="lp-v2 min-h-screen bg-bg-primary text-white relative overflow-x-hidden">
      <Seo
        title="LuxQuant Terminal — Quantitative Crypto Intelligence"
        description="LuxQuant Terminal turns market data into a quantitative edge with algorithmic analysis, on-chain intelligence, and risk scoring. Trade smarter, with confidence. Informed by data, decided by you."
        path="/"
        keywords="luxquant, crypto terminal, quantitative crypto, trading signals, on-chain intelligence, autotrade"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": "https://luxquant.tw/#organization",
          name: "LuxQuant",
          url: "https://luxquant.tw/",
          logo: {
            "@type": "ImageObject",
            url: "https://luxquant.tw/logo-512.png",
            width: 512,
            height: 512,
          },
          sameAs: ["https://x.com/luxquantcrypto"],
        }}
      />
      {/* Continuous brand canvas — ONE seamless background for every
          section (scrolls with content, no fixed-bg banding). Sections
          stay transparent so this flows through them without hard edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 0% 0%, rgba(139,26,26,0.40) 0%, transparent 50%),
            radial-gradient(ellipse at 100% 0%, rgba(139,26,26,0.30) 0%, transparent 42%),
            radial-gradient(ellipse at 50% 100%, rgba(139,26,26,0.22) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 52%, rgba(212,168,83,0.05) 0%, transparent 72%)
          `,
        }}
      />

      <HeaderV2 onNav={scrollTo} activeId={activeId} />
      <HeroSlider onNav={scrollTo} gainers={topGainers} />
      <RecentWinnersMarquee gainers={topGainers} />
      <TopGainers stats={stats} gainers={topGainers} onNav={scrollTo} />
      <Architecture />
      <TerminalPreview />
      <Performance data={performanceData} />
      <CoinSpotlight />
      <GlobalReach />
      <FreeTierV2 />
      <FaqV2 />
      <FooterV2 onNav={scrollTo} />
    </div>
  );
}