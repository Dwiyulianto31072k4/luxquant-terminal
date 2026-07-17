// Theme-aware solid colours for embeds that cannot read CSS variables
// (TradingView widgets, canvas, QR, third-party iframes).
//
// Must stay in sync with styles/index.css semantic tokens:
// luxquant → warm near-black desk
// dark → Binance neutral #0B0E11
// bright → paper white

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
 * Subscribe to <html data-theme> changes (theme toggle without full reload).
 * Returns unsubscribe fn.
 */
export function subscribeTheme(callback) {
  if (typeof document === "undefined") return () => {};
  const el = document.documentElement;
  const fire = () => {
    try {
      callback(getActiveTheme());
    } catch {
      /* ignore */
    }
  };
  const obs = new MutationObserver(fire);
  obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** rgb channel string "11 14 17" → "#0b0e11" */
function channelsToHex(channels, fallback = "#0a0506") {
  try {
    const parts = String(channels)
      .trim()
      .split(/[\s,]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
    if (parts.length < 3) return fallback;
    return (
      "#" +
      parts
        .slice(0, 3)
        .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
        .join("")
    );
  } catch {
    return fallback;
  }
}

/** Read a CSS custom property channel (e.g. --surface) as hex */
export function cssChannelHex(varName, fallback = "#0a0506") {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    return channelsToHex(raw, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Concrete rgba() for Canvas 2D / three.js / libraries that cannot parse CSS vars.
 * Prefer this over `rgb(var(--x) / a)` outside the DOM CSS engine.
 */
export function cssChannelRgba(varName, alpha = 1, fallbackChannels = "10 5 6") {
  try {
    const raw =
      getComputedStyle(document.documentElement).getPropertyValue(varName).trim() ||
      fallbackChannels;
    const parts = String(raw)
      .trim()
      .split(/[\s,]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
    if (parts.length < 3) {
      const fb = fallbackChannels.split(/[\s,]+/).map((n) => parseInt(n, 10));
      return `rgba(${fb[0] || 0}, ${fb[1] || 0}, ${fb[2] || 0}, ${alpha})`;
    }
    const a = Math.max(0, Math.min(1, Number(alpha)));
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  } catch {
    return `rgba(10, 5, 6, ${alpha})`;
  }
}

/** Desk palette snapshot for charts (recharts/canvas) — always concrete. */
export function getChartPalette(theme = getActiveTheme()) {
  const isBright = theme === "bright";
  return {
    theme,
    isBright,
    surface: cssChannelHex("--surface", isBright ? "#f5f6f8" : "#0b0e11"),
    raised: cssChannelHex("--surface-raised", isBright ? "#ffffff" : "#181c22"),
    ink: cssChannelHex("--ink", isBright ? "#0f172a" : "#ffffff"),
    fg: cssChannelHex("--fg", isBright ? "#0b0e11" : "#eaeced"),
    muted: cssChannelHex("--fg-muted", isBright ? "#64748b" : "#5e6673"),
    accent: cssChannelHex("--accent", "#f0b90b"),
    pos: cssChannelHex("--pos", "#0ecb81"),
    neg: cssChannelHex("--neg", "#f6465d"),
    grid: isBright ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)",
  };
}

/**
 * TradingView advanced-chart / widget palette.
 * Must be concrete hex/rgb — TV ignores CSS vars.
 *
 * dark / luxquant → TV theme "dark" + surface-matching bg
 * bright → TV theme "light" + white paper
 */
export function getTradingViewTheme(theme = getActiveTheme()) {
  // Prefer live CSS tokens so palette always matches the page chrome.
  const surface = cssChannelHex(
    "--surface",
    theme === "bright" ? "#f5f6f8" : theme === "dark" ? "#0b0e11" : "#0a0506"
  );
  const raised = cssChannelHex(
    "--surface-raised",
    theme === "bright" ? "#ffffff" : theme === "dark" ? "#181c22" : "#14080a"
  );
  const ink = cssChannelHex("--ink", theme === "bright" ? "#0f172a" : "#ffffff");

  // Binance desk candles (same both modes — data color, not decoration)
  const upColor = cssChannelHex("--pos", "#0ecb81");
  const downColor = cssChannelHex("--neg", "#f6465d");

  if (theme === "bright") {
    return {
      theme: "light",
      toolbar_bg: raised,
      backgroundColor: raised,
      gridColor: "rgba(15, 23, 42, 0.06)",
      textColor: "#52525b",
      lineColor: "rgba(15, 23, 42, 0.1)",
      upColor,
      downColor,
    };
  }

  // luxquant + dark: TV "dark" shell, bg matches page surface/raised
  const isBinanceDark = theme === "dark";
  return {
    theme: "dark",
    // Chart canvas matches raised card so it sits flush in desk panels
    toolbar_bg: raised,
    backgroundColor: raised,
    // Subtle grid — neutral on dark, faint gold tint only on luxquant
    gridColor: isBinanceDark ? "rgba(255, 255, 255, 0.045)" : "rgba(240, 185, 11, 0.06)",
    textColor: isBinanceDark ? "#848e9c" : "#a0a0a0",
    lineColor: isBinanceDark ? "rgba(255, 255, 255, 0.08)" : "rgba(240, 185, 11, 0.12)",
    upColor,
    downColor,
    // expose for consumers that need page bg behind iframe load
    surface,
    ink,
  };
}

/**
 * Build the JSON config blob for TradingView advanced-chart embed script.
 * @param {object} opts - symbol, interval, studies, etc. (merged over theme defaults)
 */
export function buildTradingViewEmbedConfig(opts = {}) {
  // opts.theme = app theme key (luxquant|dark|bright) — maps to TV light/dark
  const appTheme = opts.theme || getActiveTheme();
  const tv = getTradingViewTheme(appTheme);
  let timezone = "Etc/UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* keep UTC */
  }

  // Never spread opts.theme into the TV payload — TV only accepts "light"|"dark"
  return {
    autosize: true,
    symbol: opts.symbol || "BINANCE:BTCUSDT.P",
    interval: opts.interval || "240",
    timezone: opts.timezone || timezone,
    theme: tv.theme, // "light" | "dark" only
    style: "1",
    locale: opts.locale || "en",
    toolbar_bg: tv.toolbar_bg,
    backgroundColor: tv.backgroundColor,
    gridColor: tv.gridColor,
    hide_top_toolbar: opts.hide_top_toolbar ?? false,
    hide_legend: opts.hide_legend ?? false,
    hide_side_toolbar: opts.hide_side_toolbar ?? false,
    allow_symbol_change: opts.allow_symbol_change ?? true,
    save_image: opts.save_image ?? false,
    withdateranges: opts.withdateranges ?? false,
    details: opts.details ?? false,
    hotlist: opts.hotlist ?? false,
    calendar: opts.calendar ?? false,
    studies: Array.isArray(opts.studies) ? opts.studies : [],
    support_host: "https://www.tradingview.com",
    overrides: {
      "paneProperties.background": tv.backgroundColor,
      "paneProperties.backgroundType": "solid",
      "paneProperties.vertGridProperties.color": tv.gridColor,
      "paneProperties.horzGridProperties.color": tv.gridColor,
      "scalesProperties.textColor": tv.textColor,
      "scalesProperties.lineColor": tv.lineColor,
      "mainSeriesProperties.candleStyle.upColor": tv.upColor,
      "mainSeriesProperties.candleStyle.downColor": tv.downColor,
      "mainSeriesProperties.candleStyle.borderUpColor": tv.upColor,
      "mainSeriesProperties.candleStyle.borderDownColor": tv.downColor,
      "mainSeriesProperties.candleStyle.wickUpColor": tv.upColor,
      "mainSeriesProperties.candleStyle.wickDownColor": tv.downColor,
      ...(opts.overrides || {}),
    },
  };
}

/**
 * Mount TradingView advanced-chart embed into `host` element.
 * Clears host, injects container + script, returns cleanup fn.
 */
export function mountTradingViewEmbed(host, opts = {}) {
  if (!host) return () => {};
  host.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "tradingview-widget-container";
  shell.style.cssText =
    "height:100%;width:100%;background:" + getTradingViewTheme().backgroundColor;

  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  inner.style.cssText = "height:100%;width:100%";
  shell.appendChild(inner);

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.innerHTML = JSON.stringify(buildTradingViewEmbedConfig(opts));
  shell.appendChild(script);
  host.appendChild(shell);

  return () => {
    try {
      host.innerHTML = "";
    } catch {
      /* ignore */
    }
  };
}

/** Resolve a CSS channel custom property to `rgb(r, g, b)` for canvas libs */
export function cssChannelRgb(varName, fallback = "10, 5, 6") {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return `rgb(${fallback})`;
    const parts = raw.split(/\s+/).join(", ");
    return `rgb(${parts})`;
  } catch {
    return `rgb(${fallback})`;
  }
}
