// src/components/landing/v2/LandingPageV2.jsx
// ════════════════════════════════════════════════════════════════
// LandingPageV2 — orchestrator. Fetch data SEKALI (useLandingData),
// rakit section berurutan, pass data via props.
//
// Status: WIP preview. Section yang udah jadi: Header, Hero, ProofBar.
// Section berikutnya tinggal ditambah di bawah ProofBar (Live Signals
// tabs, Trust pillars, Architecture, Performance, FAQ, Footer).
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
import ProofBar from "./sections/ProofBar";
import TopGainers from "./sections/TopGainers";

export default function LandingPageV2() {
  const { stats, topGainers } = useLandingData();
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
        description="A 24/7 algorithm plus an AI market researcher — precise entries, strict risk management, and a fully transparent track record since 2023."
        path="/v2"
      />

      {/* background emas khas LuxQuant */}
      <div className="luxury-bg" />

      <HeaderV2 onNav={scrollTo} activeId={activeId} />

      <HeroSlider onNav={scrollTo} gainers={topGainers} />
      <ProofBar stats={stats} />
      <TopGainers stats={stats} gainers={topGainers} onNav={scrollTo} />

      {/* ──────────────────────────────────────────────────────────
          SECTION BERIKUTNYA — tambah di sini (semua modular):
          <Architecture ... id="how-it-works" />
          <Performance  ... id="performance" />   // reuse LivePerformanceStats
          <FaqV2        ... id="faq" />
          <FooterV2 />
          ────────────────────────────────────────────────────────── */}

      {/* spacer sementara biar scroll anchor kerasa pas section blm lengkap */}
      <div className="h-[20vh]" />
    </div>
  );
}