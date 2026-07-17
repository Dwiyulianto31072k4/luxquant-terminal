// src/components/landing/v2/useLandingData.js
// ════════════════════════════════════════════════════════════════
// Single data source for LandingPageV2.
// Fetch SEKALI di sini, hasilnya di-pass ke tiap section via props.
// Jangan fetch di dalam section — biar API nggak kepanggil dobel.
// Re-use endpoint yang SUDAH dipakai LandingPage (v1):
// - /api/v1/signals/analyze → stats + win_rate_trend + risk
// - /api/v1/signals/top-performers → gainers (daily + weekly)
// ════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";

export default function useLandingData() {
  const [performanceData, setPerformanceData] = useState(null);
  const [topGainers, setTopGainers] = useState([]);

  // ── Performance stats (win rate, trend, risk distribution) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = localStorage.getItem("access_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch("/api/v1/signals/analyze?time_range=all&trend_mode=weekly", {
          headers,
        });
        if (res.ok && alive) setPerformanceData(await res.json());
      } catch (e) {
        console.warn("[v2] stats fetch failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Top gainers (daily + weekly, interleaved) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [resDaily, resWeekly] = await Promise.all([
          fetch("/api/v1/signals/top-performers?limit=20&days=1"),
          fetch("/api/v1/signals/top-performers?limit=20&days=7"),
        ]);

        let daily = [];
        let weekly = [];
        if (resDaily.ok) {
          const d = await resDaily.json();
          daily = (d?.top_gainers || []).map((i) => ({ ...i, type: "Daily" }));
        }
        if (resWeekly.ok) {
          const w = await resWeekly.json();
          weekly = (w?.top_gainers || []).map((i) => ({ ...i, type: "Weekly" }));
        }

        const combined = [];
        const max = Math.max(daily.length, weekly.length);
        for (let i = 0; i < max; i++) {
          if (daily[i]) combined.push(daily[i]);
          if (weekly[i]) combined.push(weekly[i]);
        }
        if (alive) setTopGainers(combined);
      } catch (e) {
        console.warn("[v2] top gainers fetch failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return {
    performanceData,
    stats: performanceData?.stats || null,
    topGainers,
  };
}
