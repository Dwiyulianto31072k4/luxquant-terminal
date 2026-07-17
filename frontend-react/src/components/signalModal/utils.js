// Shared pure helpers for SignalModal (extracted from mega-file).

export const deriveChartWithCard = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!/_tp[234]_/i.test(rawUrl)) return null;
  if (/_with_card|_combined/i.test(rawUrl)) return null;
  return rawUrl.replace(/\.png$/i, "_with_card.png");
};

export const cleanPair = (pair) => {
  if (!pair) return "";
  return String(pair).replace(/USDT$/i, "").replace(/^3A/i, "").toUpperCase();
};

export const fmtPct = (n, digits = 2) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
};

export const fmtPrice = (n, digits = 6) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(digits);
};

export const statusTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("win") || s.startsWith("tp")) return "profit";
  if (s.includes("loss") || s === "sl") return "loss";
  if (s === "open") return "accent";
  return "muted";
};
