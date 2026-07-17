// Theme-aware solid colours for embeds that cannot read CSS variables
// (TradingView widgets, canvas, QR, third-party iframes).

export function getActiveTheme() {
  try {
    return document.documentElement?.dataset?.theme || "luxquant";
  } catch {
    return "luxquant";
  }
}

/** True when the active theme is light paper desk */
export function isBrightTheme(theme = getActiveTheme()) {
  return theme === "bright";
}

/**
 * TradingView advanced-chart palette.
 * Must be concrete hex/rgb — TV ignores CSS vars.
 */
export function getTradingViewTheme(theme = getActiveTheme()) {
  if (theme === "bright") {
    return {
      theme: "light",
      toolbar_bg: "#ffffff",
      backgroundColor: "#ffffff",
      gridColor: "rgba(15, 23, 42, 0.06)",
      textColor: "#3f3f46",
      lineColor: "rgba(15, 23, 42, 0.1)",
      upColor: "#059669",
      downColor: "#dc2626",
    };
  }
  // luxquant + dark share a near-black terminal chart
  return {
    theme: "dark",
    toolbar_bg: "#0a0805",
    backgroundColor: "#0a0805",
    gridColor: "rgba(212, 168, 83, 0.05)",
    textColor: "#a0a0a0",
    lineColor: "rgba(212, 168, 83, 0.12)",
    upColor: "#56c996",
    downColor: "#e07288",
  };
}

/** Resolve a CSS channel custom property to `rgb(r, g, b)` for canvas libs */
export function cssChannelRgb(varName, fallback = "10, 5, 6") {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    if (!raw) return `rgb(${fallback})`;
    const parts = raw.split(/\s+/).join(", ");
    return `rgb(${parts})`;
  } catch {
    return `rgb(${fallback})`;
  }
}
