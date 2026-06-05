// src/components/autotrade/AccountsOverview.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Accounts Overview
// Dashboard-style summary for user, bot IP, and demo portfolio charts
// ════════════════════════════════════════════════════════════════

const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

const DEMO_PORTFOLIO = {
  value: 184560.28,
  dailyChange: 4360.84,
  changePercent: 2.42,
  allocation: [
    { label: "BTC", value: 41, color: "#d4a853" },
    { label: "ETH", value: 24, color: "#f0d890" },
    { label: "USDT", value: 18, color: "#c7a96a" },
    { label: "Altcoins", value: 11, color: "#8f6a2a" },
    { label: "Staked", value: 6, color: "#b98b3c" },
  ],
  growth: [
    { label: "Mon", value: 156420 },
    { label: "Tue", value: 160880 },
    { label: "Wed", value: 158640 },
    { label: "Thu", value: 167920 },
    { label: "Fri", value: 171400 },
    { label: "Sat", value: 178180 },
    { label: "Sun", value: 184560 },
  ],
};

const SectionHeader = ({ label, subtitle }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="font-mono uppercase tracking-[0.25em] text-gold-primary/80 text-[11px]">
          {label}
        </span>
      </div>
      {subtitle && (
        <p className="text-text-muted text-sm font-mono">{subtitle}</p>
      )}
    </div>
  </div>
);

const MetricCard = ({ label, value, sublabel, tone = "neutral" }) => {
  const valueColor = {
    neutral: "text-white",
    gold: "text-gold-primary",
    positive: "text-emerald-400",
    negative: "text-red-400",
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0805] p-4">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60 mb-2">
        {label}
      </p>
      <p
        className={`text-2xl font-semibold tabular-nums tracking-tight ${valueColor}`}
      >
        {value}
      </p>
      {sublabel && (
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 mt-1.5">
          {sublabel}
        </p>
      )}
    </div>
  );
};

const UserPill = ({ label, value }) => (
  <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
    <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60 mb-1">
      {label}
    </p>
    <p className="text-white text-sm font-mono truncate">{value}</p>
  </div>
);

const AllocationChart = ({ items }) => {
  const radius = 44;
  const stroke = 14;
  const total = items.reduce((sum, current) => sum + current.value, 0);
  const circumference = 2 * Math.PI * radius;
  const separator = circumference * 0.012;
  const normalized = items.map((item, index) => ({
    ...item,
    pct: item.value / total,
  }));
  let offset = 0;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0906] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
      <SectionHeader
        label="Portfolio Allocation"
        subtitle="Demo allocation split for the current portfolio."
      />

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5 items-center">
        <div className="mx-auto relative w-40 h-40">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={stroke}
            />
            <circle
              cx="60"
              cy="60"
              r={radius - 11}
              fill="none"
              stroke="rgba(212,168,83,0.12)"
              strokeWidth="1.25"
            />
            {normalized.map((item) => {
              const sliceLength = item.pct * circumference;
              const visibleLength = Math.max(sliceLength - separator, 0);
              const currentOffset = -offset * circumference + separator / 2;
              offset += item.pct;
              return (
                <circle
                  key={item.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${visibleLength} ${circumference}`}
                  strokeDashoffset={currentOffset}
                  strokeLinecap="butt"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gold-primary/60">
              Allocation
            </span>
            <span className="text-lg font-semibold text-white">100%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="text-sm text-white font-mono">
                    {item.label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-white tabular-nums">
                  {item.value}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const GrowthChart = ({ points }) => {
  const width = 640;
  const height = 220;
  const padding = 24;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = Math.max(max - min, 1);
  const stepX = (width - padding * 2) / (points.length - 1);
  const linePoints = points
    .map((point, index) => {
      const x = padding + index * stepX;
      const y =
        height -
        padding -
        ((point.value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const fillPath = `${linePoints} ${width - padding},${height - padding} ${padding},${height - padding}`;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0906] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
      <SectionHeader
        label="Portfolio Growth"
        subtitle="Demo equity curve over the last 7 sessions."
      />

      <div className="mt-5">
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4a853" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#d4a853" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3].map((tick) => {
              const y = padding + ((height - padding * 2) / 3) * tick;
              return (
                <line
                  key={tick}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                />
              );
            })}

            <polygon points={fillPath} fill="url(#growthFill)" />
            <polyline
              points={linePoints}
              fill="none"
              stroke="#d4a853"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {points.map((point, index) => {
              const x = padding + index * stepX;
              const y =
                height -
                padding -
                ((point.value - min) / range) * (height - padding * 2);
              return (
                <circle
                  key={point.label}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#f0d890"
                  stroke="#0c0906"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
            {points.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AccountsOverview({ userLabel, botIp, onConnect }) {
  const portfolioValue = DEMO_PORTFOLIO.value;
  const portfolioNet = DEMO_PORTFOLIO.dailyChange;
  const netTone =
    portfolioNet > 0 ? "positive" : portfolioNet < 0 ? "negative" : "neutral";

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/35 to-transparent" />

        <div className="p-5 sm:p-6 space-y-5">
          <SectionHeader
            label="Accounts Overview"
            subtitle="Demo portfolio snapshot with allocation and growth for fast reading."
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
            <div className="rounded-2xl border border-white/[0.06] bg-[#0a0805] p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/70">
                    Logged in user
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mt-1">
                    {userLabel}
                  </h3>
                  <p className="text-sm text-text-muted font-mono mt-2">
                    Demo portfolio data is shown here so the page is easy to
                    understand at a glance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onConnect}
                  className="group inline-flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
                  style={{
                    background:
                      "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                  }}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Connect Exchange
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5">
                <UserPill label="Bot IP" value={botIp} />
                <UserPill
                  label="Portfolio value"
                  value={fmtUsd(portfolioValue)}
                />
                <UserPill
                  label="Daily change"
                  value={`${portfolioNet >= 0 ? "+" : ""}${fmtUsd(portfolioNet)} (${DEMO_PORTFOLIO.changePercent.toFixed(2)}%)`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <MetricCard
                label="Portfolio Value"
                value={fmtUsd(portfolioValue)}
                sublabel="estimated USDT value"
                tone="gold"
              />
              <MetricCard
                label="Net PnL"
                value={`${portfolioNet >= 0 ? "+" : ""}${fmtUsd(portfolioNet)}`}
                sublabel="account performance"
                tone={netTone}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-4">
            <AllocationChart items={DEMO_PORTFOLIO.allocation} />
            <GrowthChart points={DEMO_PORTFOLIO.growth} />
          </div>
        </div>
      </div>
    </div>
  );
}
