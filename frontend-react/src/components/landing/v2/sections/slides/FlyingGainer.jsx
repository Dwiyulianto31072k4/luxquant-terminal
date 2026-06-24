// src/components/landing/v2/sections/slides/FlyingGainer.jsx
// Chip gainer cycling dari data nyata. Dipakai di slide hero.
import { useEffect, useState } from "react";
import CoinLogo from "../../../../CoinLogo";

export default function FlyingGainer({ gainers, anchor = "left" }) {
  const [idx, setIdx] = useState(0);
  const coins = (gainers || []).slice(0, 20);

  useEffect(() => {
    if (coins.length === 0) return;
    const iv = setInterval(() => setIdx((p) => (p + 1) % coins.length), 3500);
    return () => clearInterval(iv);
  }, [coins.length]);

  if (coins.length === 0) return null;
  const item = coins[idx];
  const symbol = item?.pair?.replace(/USDT$/i, "").replace(/^3A/, "") || "???";
  const anim = anchor === "left" ? "v2FlyLeft" : "v2FlyRight";

  return (
    <div
      key={idx}
      className="absolute z-40 pointer-events-none"
      style={{ top: "42%", left: "50%", animation: `${anim} 3.5s ease-out both` }}
    >
      <div
        className="flex flex-col gap-1 px-4 py-2.5 rounded-2xl border border-gold-primary/30"
        style={{
          background: "rgba(10,5,6,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 15px rgba(212,168,83,0.15)",
        }}
      >
        <div className="flex items-center gap-2">
          <CoinLogo pair={item.pair} size={20} />
          <span className="text-white text-sm font-bold">{symbol}</span>
          <span className="text-green-400 text-sm font-bold font-mono">
            +{item.gain_pct?.toFixed(1)}%
          </span>
        </div>
        <span className="text-gold-primary/70 text-[9px] font-mono tracking-widest uppercase text-left mt-1 block">
          {item?.type ? `${item.type} Top Gainer` : "Top Gainer"}
        </span>
      </div>
    </div>
  );
}
