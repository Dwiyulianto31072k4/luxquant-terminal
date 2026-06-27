// src/components/landing/v2/sections/Performance.jsx
// ════════════════════════════════════════════════════════════════
// Performance — reuses LivePerformanceStats (the verified track-record
// dashboard) from the original landing page. Copied in as-is for now;
// we'll restyle it for v2 later.
// ════════════════════════════════════════════════════════════════
import { LivePerformanceStats } from "../../LandingPage";

export default function Performance({ data }) {
  return (
    <section
      id="performance"
      className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 lg:px-8 lg:py-24"
    >
      <LivePerformanceStats data={data} />
    </section>
  );
}
