import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import SignalHistoryTab from "./SignalHistoryTab";
import EnrichmentBadge from './EnrichmentBadge';

const SignalModal = ({ signal, isOpen, onClose, onSwitchSignal }) => {
  const { t } = useTranslation();

  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const coinInfoFetchedRef = useRef(false);

  const [signalDetail, setSignalDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinInfoLoading, setCoinInfoLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  // State untuk Peak Price & Toggle TradingView di Tab Trade
  const [peakPrice, setPeakPrice] = useState(null);
  const [showTV, setShowTV] = useState(false);

  // State untuk AI Prompt copy
  const [promptCopied, setPromptCopied] = useState(false);

  const [overrideSignal, setOverrideSignal] = useState(null);

  // --- SEMUA HOOKS (useEffect) HARUS ADA DI ATAS SEBELUM RETURN KONDISIONAL ---

  // 1. Kunci scroll body saat modal buka
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // 2. Fetch data detail sinyal saat modal dibuka
  useEffect(() => {
    const currentSignal = overrideSignal || signal;
    if (!isOpen || !currentSignal) return;
    setSignalDetail(null);
    setCoinInfo(null);
    setCoinInfoLoading(false);
    coinInfoFetchedRef.current = false;
    setIsClosing(false);
    setLightboxImg(null);
    setPeakPrice(null);
    setShowTV(false);
    setPromptCopied(false);

    const fetchDetail = async () => {
      try {
        const r = await fetch(
          `/api/v1/signals/detail/${currentSignal.signal_id}`,
        );
        if (r.ok) setSignalDetail(await r.json());
      } catch (e) {
        console.error("Failed to fetch signal detail:", e);
      }
    };
    fetchDetail();
  }, [isOpen, signal, overrideSignal]);

  // 3. Fetch data CoinGecko saat buka tab Research
  useEffect(() => {
    if (!isOpen || !signal || activeTab !== "research") return;
    if (coinInfo || coinInfoFetchedRef.current) return;

    const sym = (signal.pair || "").replace(/USDT$/i, "").toUpperCase();
    if (!sym) return;

    coinInfoFetchedRef.current = true;
    setCoinInfoLoading(true);

    fetch(`/api/v1/coingecko/coin-info/${sym}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setCoinInfo(data);
      })
      .catch((err) => console.error("[SignalModal] coin-info error:", err))
      .finally(() => setCoinInfoLoading(false));
  }, [isOpen, signal, activeTab, coinInfo]);

  // 4. Fetch Peak Price AFTER highest TP hit — Binance → Bybit fallback chain
  // Shows how much higher price went BEYOND the last target hit
  useEffect(() => {
    if (!isOpen || !signal || !signalDetail?.entry || !signal.created_at)
      return;

    const fetchPeakPrice = async () => {
      try {
        const entryVal = Number(signalDetail.entry);
        const symbol = (signal.pair || "").replace("USDT", "") + "USDT";

        // Determine direction
        const firstTp = signal.target1 ? Number(signal.target1) : null;
        const isShort = firstTp !== null && firstTp < entryVal;

        // Find the highest hit TP and its timestamp
        const tpUpdates =
          signalDetail.updates?.filter((u) =>
            u?.update_type?.toLowerCase()?.startsWith("tp"),
          ) || [];
        if (tpUpdates.length === 0) return; // no TPs hit, nothing to show

        // Get the last (highest) TP update — this is where we start measuring
        const lastTpUpdate = tpUpdates[tpUpdates.length - 1];
        const lastTpPrice = Number(lastTpUpdate.price);
        const startTime = new Date(lastTpUpdate.update_at).getTime();

        // Also check target values for the highest hit TP price
        let highestTpPrice = lastTpPrice;
        const targetValues = [
          signal.target1,
          signal.target2,
          signal.target3,
          signal.target4,
        ];
        targetValues.forEach((tv, i) => {
          if (!tv || !hitTargets[i]) return;
          const p = Number(tv);
          if (isShort) {
            if (p > 0 && p < highestTpPrice) highestTpPrice = p;
          } else {
            if (p > highestTpPrice) highestTpPrice = p;
          }
        });

        // Helper: find peak strictly beyond the highest TP
        const extractPeak = (candles, getHigh, getLow) => {
          if (!Array.isArray(candles) || candles.length === 0) return null;
          let best = highestTpPrice;
          candles.forEach((c) => {
            const high = getHigh(c);
            const low = getLow(c);
            if (isShort) {
              if (low > 0 && low < best) best = low;
            } else {
              if (high > best) best = high;
            }
          });
          // Only return if peak is strictly beyond highest TP
          if (isShort) return best < highestTpPrice ? best : null;
          return best > highestTpPrice ? best : null;
        };

        const binanceH = (c) => parseFloat(c[2]);
        const binanceL = (c) => parseFloat(c[3]);
        const bybitH = (c) => parseFloat(c.high);
        const bybitL = (c) => parseFloat(c.low);

        let peak = null;

        // === 1. BINANCE FUTURES ===
        try {
          const res = await fetch(
            `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&limit=500`,
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0)
              peak = extractPeak(data, binanceH, binanceL);
          }
        } catch (e) {
          console.warn("[PeakPrice] Binance futures failed:", e.message);
        }

        // === 2. BINANCE SPOT ===
        if (peak === null) {
          try {
            const res = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&limit=500`,
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0)
                peak = extractPeak(data, binanceH, binanceL);
            }
          } catch (e) {
            console.warn("[PeakPrice] Binance spot failed:", e.message);
          }
        }

        // === 3. BYBIT ID LINEAR ===
        if (peak === null) {
          try {
            const endTime = Date.now();
            const res = await fetch(
              `https://api.bybit.id/v5/market/kline?category=linear&symbol=${symbol}&interval=60&start=${startTime}&end=${endTime}&limit=200`,
            );
            if (res.ok) {
              const json = await res.json();
              const list = (json?.result?.list || []).map((k) => ({
                high: k[2],
                low: k[3],
              }));
              peak = extractPeak(list, bybitH, bybitL);
            }
          } catch (e) {
            console.warn("[PeakPrice] Bybit ID linear failed:", e.message);
          }
        }

        // === 4. BYBIT GLOBAL LINEAR ===
        if (peak === null) {
          try {
            const endTime = Date.now();
            const res = await fetch(
              `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=60&start=${startTime}&end=${endTime}&limit=200`,
            );
            if (res.ok) {
              const json = await res.json();
              const list = (json?.result?.list || []).map((k) => ({
                high: k[2],
                low: k[3],
              }));
              peak = extractPeak(list, bybitH, bybitL);
            }
          } catch (e) {
            console.warn("[PeakPrice] Bybit global linear failed:", e.message);
          }
        }

        // === 5. BYBIT ID SPOT ===
        if (peak === null) {
          try {
            const endTime = Date.now();
            const res = await fetch(
              `https://api.bybit.id/v5/market/kline?category=spot&symbol=${symbol}&interval=60&start=${startTime}&end=${endTime}&limit=200`,
            );
            if (res.ok) {
              const json = await res.json();
              const list = (json?.result?.list || []).map((k) => ({
                high: k[2],
                low: k[3],
              }));
              peak = extractPeak(list, bybitH, bybitL);
            }
          } catch (e) {
            console.warn("[PeakPrice] Bybit ID spot failed:", e.message);
          }
        }

        // Only show if peak exists (strictly beyond highest TP)
        if (peak !== null) {
          setPeakPrice(peak);
        }
      } catch (error) {
        console.error("[PeakPrice] All providers failed:", error);
      }
    };

    fetchPeakPrice();
  }, [isOpen, signal, signalDetail]);

  // 5. Handle tombol Escape (Esc)
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        if (lightboxImg) setLightboxImg(null);
        else {
          setIsClosing(true);
          setTimeout(() => {
            setIsClosing(false);
            onClose();
          }, 200);
        }
      }
    };
    if (isOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, lightboxImg, onClose]);

  // 6. Handle Render TradingView di Tab Utama (Chart)
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "Etc/UTC";
    }
  };

  useEffect(() => {
    if (
      !isOpen ||
      !signal ||
      !chartContainerRef.current ||
      activeTab !== "chart"
    )
      return;

    chartContainerRef.current.innerHTML = "";
    const symbol = `BINANCE:${signal.pair || ""}.P`;
    const timezone = getUserTimezone();

    const createWidget = (sym, tz) => {
      if (!chartContainerRef.current) return;
      try {
        widgetRef.current = new window.TradingView.widget({
          container_id: "tv_chart_modal_main",
          autosize: true,
          symbol: sym,
          interval: "60",
          timezone: tz,
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0d0d0d",
          enable_publishing: false,
          backgroundColor: "#0d0d0d",
          gridColor: "rgba(212, 168, 83, 0.06)",
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          save_image: true,
          calendar: false,
          hide_volume: false,
          withdateranges: true,
          details: true,
          hotlist: false,
          studies: ["STD;SMA"],
          support_host: "https://www.tradingview.com",
          overrides: {
            "mainSeriesProperties.candleStyle.upColor": "#22c55e",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
          },
        });
      } catch (e) {
        console.error("TradingView widget error:", e);
      }
    };

    const loadTV = () => {
      if (window.TradingView) createWidget(symbol, timezone);
      else {
        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = () => createWidget(symbol, timezone);
        document.head.appendChild(s);
      }
    };

    const timer = setTimeout(loadTV, 100);
    return () => {
      clearTimeout(timer);
      widgetRef.current = null;
    };
  }, [isOpen, signal, activeTab]);

  // 7. Handle Render TradingView Mini di Tab Trade
  // Definisikan variabel URL gambar lebih awal untuk digunakan di useEffect ini
  const entryImg = signalDetail?.entry_chart_url || signal?.entry_chart_url;
  const afterImg = signalDetail?.latest_chart_url || signal?.latest_chart_url;
  const showInteractiveRight = showTV || (!afterImg && entryImg);

  useEffect(() => {
    let widget = null;
    const shouldMountTV =
      isOpen &&
      activeTab === "trade" &&
      ((!entryImg && !afterImg) || (entryImg && showInteractiveRight));

    const initTV = () => {
      if (!document.getElementById("tv_chart_modal_side")) return;
      widget = new window.TradingView.widget({
        container_id: "tv_chart_modal_side",
        autosize: true,
        symbol: `BINANCE:${signal?.pair || ""}.P`,
        interval: "60",
        timezone: getUserTimezone(),
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0a0a0f",
        enable_publishing: false,
        backgroundColor: "#0d0d0d",
        gridColor: "rgba(212, 168, 83, 0.05)",
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        studies: ["STD;SMA"],
      });
    };

    if (shouldMountTV) {
      const timer = setTimeout(() => {
        if (window.TradingView) initTV();
        else {
          const s = document.createElement("script");
          s.src = "https://s3.tradingview.com/tv.js";
          s.async = true;
          s.onload = initTV;
          document.head.appendChild(s);
        }
      }, 100);
      return () => {
        clearTimeout(timer);
        if (widget) {
          try {
            widget.remove();
          } catch (e) {}
        }
      };
    }
  }, [
    isOpen,
    activeTab,
    signal?.pair,
    entryImg,
    afterImg,
    showInteractiveRight,
  ]);

  // === RETURN NULL HARUS DITARUH SETELAH SEMUA USE-EFFECT ===
  if (!isOpen || !signal) return null;
  const activeSignal = overrideSignal || signal;

  const handleCloseClick = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setOverrideSignal(null);
      onClose();
    }, 200);
  };

  // === SAFE MATH HELPERS (Anti-Crash) ===
  const getCoinSymbol = (pair) =>
    pair?.replace(/USDT$/i, "").toUpperCase() || "";
  const coinSymbol = getCoinSymbol(signal?.pair);
  const coinSymbolLower = coinSymbol.toLowerCase();

  const calcPct = (target, entry) => {
    const tNum = Number(target);
    const eNum = Number(entry);
    if (!tNum || !eNum) return null;
    return (((tNum - eNum) / eNum) * 100).toFixed(2);
  };

  const formatShortDateTime = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const calcTimeDiff = (from, to) => {
    if (!from || !to) return null;
    const ms = new Date(to) - new Date(from);
    if (ms < 0) return null;
    const m = Math.floor(ms / 60000),
      h = Math.floor(m / 60),
      d = Math.floor(h / 24);
    if (d > 0) {
      const rh = h % 24;
      return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
    }
    if (h > 0) {
      const rm = m % 60;
      return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
    }
    return `${m}m`;
  };

  const formatPrice = (val) => {
    const p = Number(val);
    if (isNaN(p) || p <= 0) return "-";
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    return p < 100 ? p.toFixed(4) : p.toFixed(2);
  };

  const formatBigNum = (val) => {
    const n = Number(val);
    if (isNaN(n) || n <= 0) return "-";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  // === SAFE CALCULATIONS ===
  const entryPrice = signal?.entry ? Number(signal.entry) : 0;
  const lastTpUpdate =
    signalDetail?.updates?.length > 0
      ? signalDetail.updates[signalDetail.updates.length - 1]
      : null;
  const lastPrice = lastTpUpdate?.price ? Number(lastTpUpdate.price) : 0;

  let lastPricePct = null;
  if (lastPrice > 0 && entryPrice > 0) {
    lastPricePct = (
      (Math.abs(lastPrice - entryPrice) / entryPrice) *
      100
    ).toFixed(2);
  }

  let peakPricePct = null;
  if (peakPrice > 0 && entryPrice > 0) {
    peakPricePct = (
      (Math.abs(Number(peakPrice) - entryPrice) / entryPrice) *
      100
    ).toFixed(2);
  }

  // === SIGNAL DATA ===
  const getUpdateInfo = (type) =>
    signalDetail?.updates?.find((u) => u.update_type === type) || null;
  const getHitTargets = () => {
    const s = signal?.status?.toLowerCase() || "";
    const updates = signalDetail?.updates || [];
    const has = (tp) => updates.some((u) => u.update_type === tp);
    if (updates.length === 0) {
      if (s === "closed_win" || s === "tp4") return [true, true, true, true];
      if (s === "tp3") return [true, true, true, false];
      if (s === "tp2") return [true, true, false, false];
      if (s === "tp1") return [true, false, false, false];
      return [false, false, false, false];
    }
    return [
      has("tp1") || has("tp2") || has("tp3") || has("tp4"),
      has("tp2") || has("tp3") || has("tp4"),
      has("tp3") || has("tp4"),
      has("tp4"),
    ];
  };
  const hitTargets = getHitTargets();
  const isStopped = ["closed_loss", "sl"].includes(
    signal?.status?.toLowerCase(),
  );
  const statusLabel =
    signal?.status === "open"
      ? t("modal.latest")
      : signal?.status?.toUpperCase() || "OPEN";

  const targets = [
    {
      label: "TP1",
      value: signal.target1,
      pct: calcPct(signal.target1, signal.entry),
      hit: hitTargets[0],
      reachedAt: getUpdateInfo("tp1")?.update_at,
    },
    {
      label: "TP2",
      value: signal.target2,
      pct: calcPct(signal.target2, signal.entry),
      hit: hitTargets[1],
      reachedAt: getUpdateInfo("tp2")?.update_at,
    },
    {
      label: "TP3",
      value: signal.target3,
      pct: calcPct(signal.target3, signal.entry),
      hit: hitTargets[2],
      reachedAt: getUpdateInfo("tp3")?.update_at,
    },
    {
      label: "TP4",
      value: signal.target4,
      pct: calcPct(signal.target4, signal.entry),
      hit: hitTargets[3],
      reachedAt: getUpdateInfo("tp4")?.update_at,
    },
  ].filter((t) => t.value);

  const stops = [
    {
      label: "SL1",
      value: signal.stop1,
      pct: calcPct(signal.stop1, signal.entry),
      hit: isStopped,
      reachedAt:
        getUpdateInfo("sl")?.update_at || getUpdateInfo("sl1")?.update_at,
    },
    {
      label: "SL2",
      value: signal.stop2,
      pct: calcPct(signal.stop2, signal.entry),
      hit: false,
      reachedAt: getUpdateInfo("sl2")?.update_at,
    },
  ].filter((s) => s.value);

  const statusStyles = {
    open: "bg-cyan-500",
    tp1: "bg-green-500",
    tp2: "bg-lime-500",
    tp3: "bg-yellow-500",
    tp4: "bg-orange-500",
    closed_win: "bg-green-600",
    closed_loss: "bg-red-500",
    sl: "bg-red-500",
  };

  // === LINKS ===
  const researchLinks = [
    {
      name: "TradingView",
      url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal?.pair || ""}.P`,
      logo: "https://static.tradingview.com/static/images/logo-preview.png",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=tradingview.com&sz=64",
      color:
        "from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400",
    },
    {
      name: "CoinGlass",
      url: `https://www.coinglass.com/currencies/${coinSymbol}`,
      logo: "https://www.coinglass.com/favicon.svg",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=coinglass.com&sz=64",
      color:
        "from-cyan-600/20 to-cyan-800/10 border-cyan-500/30 hover:border-cyan-400",
    },
    {
      name: "CoinGecko",
      url: `https://www.coingecko.com/en/coins/${coinSymbolLower}`,
      logo: "https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=coingecko.com&sz=64",
      color:
        "from-green-600/20 to-green-800/10 border-green-500/30 hover:border-green-400",
    },
    {
      name: "CoinMarketCap",
      url: `https://coinmarketcap.com/currencies/${coinSymbolLower}/`,
      logo: "https://s2.coinmarketcap.com/static/cloud/img/coinmarketcap_1.svg",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=coinmarketcap.com&sz=64",
      color:
        "from-blue-500/20 to-blue-700/10 border-blue-400/30 hover:border-blue-300",
    },
    {
      name: "DexScreener",
      url: `https://dexscreener.com/search?q=${coinSymbol}`,
      logo: "https://dexscreener.com/favicon.png",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64",
      color:
        "from-lime-600/20 to-lime-800/10 border-lime-500/30 hover:border-lime-400",
    },
  ];
  const sentimentLinks = [
    {
      name: "Twitter / X",
      url: `https://x.com/search?q=%24${coinSymbol}&src=typed_query&f=live`,
      logo: "https://abs.twimg.com/favicons/twitter.3.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=x.com&sz=64",
      color:
        "from-gray-600/20 to-gray-800/10 border-gray-500/30 hover:border-gray-400",
    },
  ];

  // 10+ Exchange Links
  const tradeLinks = [
    {
      name: "Binance",
      url: `https://www.binance.com/en/futures/${signal?.pair || ""}`,
      logo: "https://public.bnbstatic.com/static/images/common/favicon.ico",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=binance.com&sz=64",
      color: "from-yellow-500/10 to-yellow-700/5 hover:border-yellow-500/30",
    },
    {
      name: "Bybit",
      url: `https://www.bybit.com/trade/usdt/${coinSymbol}USDT`,
      logo: "https://www.bybit.com/favicon.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=bybit.com&sz=64",
      color: "from-orange-500/10 to-orange-700/5 hover:border-orange-500/30",
    },
    {
      name: "OKX",
      url: `https://www.okx.com/trade-swap/${coinSymbolLower}-usdt-swap`,
      logo: "https://static.okx.com/cdn/assets/imgs/226/DF679CE5D9C03767.png",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=okx.com&sz=64",
      color: "from-white/5 to-gray-700/5 hover:border-white/20",
    },
    {
      name: "Bitget",
      url: `https://www.bitget.com/futures/usdt/${coinSymbol}USDT`,
      logo: "https://img.bitgetimg.com/image/third/1702472462805.png",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=bitget.com&sz=64",
      color: "from-cyan-500/10 to-cyan-700/5 hover:border-cyan-500/30",
    },
    {
      name: "KuCoin",
      url: `https://www.kucoin.com/trade/base/${coinSymbol}-USDT`,
      logo: "https://assets.staticimg.com/cms/media/3zL1evPzOWDEnG0XW2zI1cW8kXpZlQikvOWeB6N6X.ico",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=kucoin.com&sz=64",
      color: "from-green-500/10 to-green-700/5 hover:border-green-500/30",
    },
    {
      name: "MEXC",
      url: `https://www.mexc.com/exchange/${coinSymbol}_USDT`,
      logo: "https://www.mexc.com/favicon.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=mexc.com&sz=64",
      color: "from-blue-500/10 to-blue-700/5 hover:border-blue-500/30",
    },
    {
      name: "HTX",
      url: `https://www.htx.com/en-us/trade/${coinSymbol}_usdt`,
      logo: "https://www.htx.com/favicon.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=htx.com&sz=64",
      color: "from-indigo-500/10 to-indigo-700/5 hover:border-indigo-500/30",
    },
    {
      name: "Gate.io",
      url: `https://www.gate.io/trade/${coinSymbol}_USDT`,
      logo: "https://www.gate.io/favicon.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=gate.io&sz=64",
      color: "from-red-500/10 to-red-700/5 hover:border-red-500/30",
    },
    {
      name: "Kraken",
      url: `https://pro.kraken.com/app/trade/${coinSymbol}-USD`,
      logo: "https://www.kraken.com/favicon.ico",
      fallbackLogo:
        "https://www.google.com/s2/favicons?domain=kraken.com&sz=64",
      color: "from-purple-500/10 to-purple-700/5 hover:border-purple-500/30",
    },
    {
      name: "BingX",
      url: `https://bingx.com/en-us/spot/${coinSymbol}USDT/`,
      logo: "https://bingx.com/favicon.ico",
      fallbackLogo: "https://www.google.com/s2/favicons?domain=bingx.com&sz=64",
      color: "from-blue-400/10 to-blue-600/5 hover:border-blue-400/30",
    },
  ];

  // === TIMELINE (HORIZONTAL) — SL ON LEFT OF ENTRY ===
  const buildTimeline = () => {
    const ev = [];

    // SL goes FIRST (left of entry)
    if (signal?.stop1) {
      const su = getUpdateInfo("sl") || getUpdateInfo("sl1");
      ev.push({
        label: "SL",
        sub: isStopped ? formatShortDateTime(su?.update_at) : "Pending",
        detail: `${formatPrice(signal.stop1)}`,
        pct: `${calcPct(signal.stop1, signal?.entry)}%`,
        icon: isStopped ? "✗" : "⊘",
        active: isStopped,
        color: isStopped ? "text-red-400" : "text-gray-500",
        border: isStopped ? "border-red-500/30" : "border-gray-700",
        bg: isStopped ? "bg-red-500/10" : "bg-[#111]",
      });
    }

    // ENTRY in the middle
    ev.push({
      label: "ENTRY",
      sub: formatShortDateTime(signal?.created_at),
      detail: `@ ${formatPrice(signal?.entry)}`,
      icon: "📡",
      active: true,
      color: "text-gold-primary",
      border: "border-gold-primary/30",
      bg: "bg-gold-primary/10",
    });

    // TPs go RIGHT of entry — unified green color for elegance
    const tps = [
      {
        k: "tp1",
        l: "TP1",
        v: signal?.target1,
        c: "text-green-400",
        b: "border-green-500/30",
        bg: "bg-green-500/10",
      },
      {
        k: "tp2",
        l: "TP2",
        v: signal?.target2,
        c: "text-green-400",
        b: "border-green-500/30",
        bg: "bg-green-500/10",
      },
      {
        k: "tp3",
        l: "TP3",
        v: signal?.target3,
        c: "text-green-400",
        b: "border-green-500/30",
        bg: "bg-green-500/10",
      },
      {
        k: "tp4",
        l: "TP4",
        v: signal?.target4,
        c: "text-green-400",
        b: "border-green-500/30",
        bg: "bg-green-500/10",
      },
    ];

    tps.forEach((tp, i) => {
      if (!tp.v) return;
      const u = getUpdateInfo(tp.k);
      const h = hitTargets[i];
      ev.push({
        label: tp.l,
        sub: h ? formatShortDateTime(u?.update_at) : "Pending",
        detail: `${formatPrice(tp.v)}`,
        pct: `+${calcPct(tp.v, signal?.entry)}%`,
        icon: h ? "✓" : (i + 1).toString(),
        active: h,
        color: h ? tp.c : "text-gray-500",
        border: h ? tp.b : "border-gray-700",
        bg: h ? tp.bg : "bg-[#111]",
      });
    });

    return ev;
  };
  const timeline = buildTimeline();
  const LinkIcon = () => (
    <svg
      className="w-2.5 h-2.5 text-white/40 group-hover:text-white/70"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );

  // === AI PROMPT GENERATOR ===
  const generateAIPrompt = () => {
    const direction = (() => {
      if (!signal?.entry || !signal?.target1) return "LONG";
      return Number(signal.target1) > Number(signal.entry) ? "LONG" : "SHORT";
    })();

    const tpList = [
      signal?.target1,
      signal?.target2,
      signal?.target3,
      signal?.target4,
    ]
      .filter(Boolean)
      .map(
        (tp, i) =>
          `  - TP${i + 1}: $${formatPrice(tp)} (${calcPct(tp, signal?.entry) > 0 ? "+" : ""}${calcPct(tp, signal?.entry)}%)`,
      )
      .join("\n");

    const slList = [signal?.stop1, signal?.stop2]
      .filter(Boolean)
      .map(
        (sl, i) =>
          `  - SL${i + 1}: $${formatPrice(sl)} (${calcPct(sl, signal?.entry)}%)`,
      )
      .join("\n");

    const currentStatus = signal?.status?.toUpperCase() || "OPEN";
    const hitCount = hitTargets.filter(Boolean).length;

    const riskReward = (() => {
      if (!signal?.entry || !signal?.target4 || !signal?.stop1) return null;
      const reward = Math.abs(Number(signal.target4) - Number(signal.entry));
      const risk = Math.abs(Number(signal.stop1) - Number(signal.entry));
      if (risk === 0) return null;
      return (reward / risk).toFixed(2);
    })();

    const coinInfoSection = coinInfo
      ? `
## Additional Context from CoinGecko:
- Full Name: ${coinInfo.name || "N/A"} (${coinInfo.symbol || "N/A"})
- Categories: ${coinInfo.categories?.join(", ") || "N/A"}
- Current Price: $${coinInfo.market_data?.current_price?.toLocaleString() || "N/A"}
- Market Cap: ${coinInfo.market_data?.market_cap ? formatBigNum(coinInfo.market_data.market_cap) : "N/A"} (Rank #${coinInfo.market_data?.market_cap_rank || "N/A"})
- 24h Volume: ${coinInfo.market_data?.total_volume ? formatBigNum(coinInfo.market_data.total_volume) : "N/A"}
- 24h Change: ${coinInfo.market_data?.price_change_24h_pct != null ? `${coinInfo.market_data.price_change_24h_pct.toFixed(2)}%` : "N/A"}
- 7d Change: ${coinInfo.market_data?.price_change_7d_pct != null ? `${coinInfo.market_data.price_change_7d_pct.toFixed(2)}%` : "N/A"}
- ATH: $${coinInfo.market_data?.ath?.toLocaleString() || "N/A"} (${coinInfo.market_data?.ath_change_pct != null ? `${coinInfo.market_data.ath_change_pct.toFixed(1)}% from ATH` : ""})
- Circulating Supply: ${coinInfo.market_data?.circulating_supply ? `${(coinInfo.market_data.circulating_supply / 1e6).toFixed(1)}M` : "N/A"}`
      : "";

    const prompt = `You are an expert cryptocurrency derivatives trader and technical analyst. I need you to analyze the following trading signal and provide a comprehensive trade evaluation.

## Signal Details:
- Pair: ${signal?.pair || "N/A"} (USDT Perpetual Futures)
- Direction: ${direction}
- Entry Price: $${formatPrice(signal?.entry)}
- Signal Date: ${signal?.created_at ? new Date(signal.created_at).toLocaleString() : "N/A"}
- Current Status: ${currentStatus}${hitCount > 0 ? ` (${hitCount} target${hitCount > 1 ? "s" : ""} hit)` : ""}

## Take Profit Targets:
${tpList || "  - None specified"}

## Stop Loss Levels:
${slList || "  - None specified"}

## Risk Parameters:
- Risk Level: ${signal?.risk_level || "N/A"}
- Market Cap Category: ${signal?.market_cap || "N/A"}
- Volume Rank: ${signal?.volume_rank_num ? `#${signal.volume_rank_num}/${signal.volume_rank_den}` : "N/A"}${riskReward ? `\n- Risk/Reward Ratio (to TP4): 1:${riskReward}` : ""}
${coinInfoSection}

## Please Analyze:
1. **Trade Setup Quality**: Evaluate the entry price relative to the targets and stop loss. Is the risk-reward ratio favorable? Are the TP levels realistic based on typical price action for this asset?

2. **Position Sizing Recommendation**: Based on the risk level and stop loss distance, what percentage of portfolio would you recommend allocating? Consider the market cap category and volume.

3. **Key Technical Levels**: What are the critical support and resistance levels to watch near the entry, TPs, and SL? Any confluence zones?

4. **Risk Assessment**: What are the main risks for this trade? Consider market conditions, the asset's volatility profile, and any potential catalysts that could invalidate the setup.

5. **Trade Management Strategy**: How should the trader manage this position? When to move SL to breakeven? Should partial profits be taken at each TP level? Recommended trailing stop approach?

6. **Overall Verdict**: Rate this signal (Strong Buy / Buy / Neutral / Avoid) and explain your reasoning. Would you take this trade? What would make you more confident or cause you to skip it?

Provide actionable, specific advice. Be direct about both the strengths and weaknesses of this setup. Think like a professional risk manager, not a hype trader.`;

    return prompt;
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generateAIPrompt());
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = generateAIPrompt();
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    }
  };

  // === renderTargetsPanel === (Diubah jadi fungsi biasa agar tidak re-mount)
  const renderTargetsPanel = (layout) => {
    const isCompact = layout === "bottom";
    return (
      <div className={isCompact ? "p-2.5 space-y-1.5" : "p-2.5 space-y-2"}>
        <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-lg p-2 border border-gold-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gold-primary/70 text-[8px] uppercase tracking-wider font-medium">
                {t("modal.entry")}
              </p>
              <p
                className={`font-mono font-bold text-gold-primary ${isCompact ? "text-sm" : "text-lg"}`}
              >
                {formatPrice(signal?.entry)}
              </p>
            </div>
            <p className="text-[9px] text-gold-primary/70">
              {formatShortDateTime(signal?.created_at)}
            </p>
          </div>
        </div>
        {isCompact ? (
          <div className="grid grid-cols-2 gap-1.5">
            {targets.map((t, i) => (
              <div
                key={i}
                className={`px-2 py-1.5 rounded-lg ${t.hit ? "bg-green-500/10 border border-green-500/20" : "bg-white/[0.02] border border-white/5"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-4 h-4 rounded text-[7px] font-bold flex items-center justify-center ${t.hit ? "bg-green-500 text-white" : "bg-gray-700 text-gray-400"}`}
                    >
                      {t.hit ? "✓" : i + 1}
                    </div>
                    <div>
                      <span
                        className={`text-[10px] font-semibold ${t.hit ? "text-green-400" : "text-text-muted"}`}
                      >
                        {t.label}
                      </span>
                      <p
                        className={`text-[9px] font-mono ${t.hit ? "text-white/70" : "text-text-muted/60"}`}
                      >
                        {formatPrice(t.value)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold ${t.hit ? "text-green-400" : "text-text-muted"}`}
                  >
                    +{t.pct}%
                  </span>
                </div>
                {t.hit && t.reachedAt && (
                  <p className="text-[8px] text-green-400/60 mt-0.5 pl-[22px]">
                    ✓ {formatShortDateTime(t.reachedAt)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#111]/80 rounded-lg p-2 border border-green-500/15">
            <p className="text-green-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">
              🎯 {t("modal.targets")}
            </p>
            <div className="space-y-1">
              {targets.map((t, i) => (
                <div
                  key={i}
                  className={`p-1.5 rounded ${t.hit ? "bg-green-500/10 border border-green-500/20" : "bg-white/[0.02] border border-white/5"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center ${t.hit ? "bg-green-500 text-white" : "bg-gray-700 text-gray-400"}`}
                      >
                        {t.hit ? "✓" : i + 1}
                      </div>
                      <span
                        className={`text-[10px] font-medium ${t.hit ? "text-green-400" : "text-text-muted"}`}
                      >
                        {t.label}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono ${t.hit ? "text-green-400" : "text-text-muted"}`}
                    >
                      +{t.pct}%
                    </span>
                  </div>
                  <p
                    className={`text-[10px] font-mono mt-0.5 ${t.hit ? "text-white" : "text-text-muted"}`}
                  >
                    {formatPrice(t.value)}
                  </p>
                  {t.hit && t.reachedAt && (
                    <p className="text-[8px] text-green-400/60 mt-0.5">
                      ✓ {formatShortDateTime(t.reachedAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {stops.length > 0 &&
          (isCompact ? (
            <div className="flex gap-1.5">
              {stops.map((s, i) => (
                <div
                  key={i}
                  className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-between ${s.hit ? "bg-red-500/10 border border-red-500/20" : "bg-white/[0.02] border border-white/5"}`}
                >
                  <span
                    className={`text-[10px] font-semibold ${s.hit ? "text-red-400" : "text-text-muted"}`}
                  >
                    {s.label}{" "}
                    <span className="font-mono text-[9px]">
                      {formatPrice(s.value)}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold ${s.hit ? "text-red-400" : "text-text-muted"}`}
                  >
                    {s.pct}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#111]/80 rounded-lg p-2 border border-red-500/15">
              <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">
                🛑 {t("modal.stop_loss")}
              </p>
              <div className="space-y-1">
                {stops.map((s, i) => (
                  <div
                    key={i}
                    className={`p-1.5 rounded ${s.hit ? "bg-red-500/10 border border-red-500/20" : "bg-white/[0.02] border border-white/5"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-medium ${s.hit ? "text-red-400" : "text-text-muted"}`}
                      >
                        {s.label}
                      </span>
                      <span
                        className={`text-[10px] font-mono ${s.hit ? "text-red-400" : "text-text-muted"}`}
                      >
                        {s.pct}%
                      </span>
                    </div>
                    <p
                      className={`text-[10px] font-mono mt-0.5 ${s.hit ? "text-white" : "text-text-muted"}`}
                    >
                      {formatPrice(s.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {!isCompact && (
          <>
            {signal?.volume_rank_num && (
              <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/15">
                <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-0.5">
                  📊 {t("modal.vol_rank")}
                </p>
                <p className="text-base font-bold text-white">
                  #{signal.volume_rank_num}
                  <span className="text-text-muted text-xs font-normal ml-1">
                    / {signal.volume_rank_den}
                  </span>
                </p>
              </div>
            )}
            {(signal?.risk_level || signal?.market_cap) && (
              <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/10 space-y-1">
                {signal.risk_level && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-[9px]">
                      {t("modal.risk_level")}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${signal.risk_level?.toLowerCase()?.startsWith("low") ? "bg-green-500/15 text-green-400" : signal.risk_level?.toLowerCase()?.startsWith("high") ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}
                    >
                      {signal.risk_level}
                    </span>
                  </div>
                )}
                {signal.market_cap && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-[9px]">
                      {t("modal.market_cap")}
                    </span>
                    <span className="text-white text-[9px] font-medium">
                      {signal.market_cap}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {isCompact &&
          (signal.volume_rank_num ||
            signal.risk_level ||
            signal.market_cap) && (
            <div className="flex items-center gap-2 flex-wrap">
              {signal.volume_rank_num && (
                <div className="flex items-center gap-1 px-2 py-1 bg-[#111]/80 rounded-lg border border-gold-primary/10">
                  <span className="text-text-muted text-[9px]">📊</span>
                  <span className="text-white text-[10px] font-bold">
                    #{signal.volume_rank_num}
                  </span>
                  <span className="text-text-muted text-[9px]">
                    / {signal.volume_rank_den}
                  </span>
                </div>
              )}
              {signal.risk_level && (
                <div
                  className={`px-2 py-1 rounded-lg text-[9px] font-bold ${signal.risk_level?.toLowerCase().startsWith("low") ? "bg-green-500/15 text-green-400 border border-green-500/20" : signal.risk_level?.toLowerCase().startsWith("high") ? "bg-red-500/15 text-red-400 border border-red-500/20" : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"}`}
                >
                  {signal.risk_level}
                </div>
              )}
              {signal.market_cap && (
                <div className="flex items-center gap-1 px-2 py-1 bg-[#111]/80 rounded-lg border border-gold-primary/10">
                  <span className="text-text-muted text-[9px]">
                    {t("modal.cap")}
                  </span>
                  <span className="text-white text-[9px] font-medium">
                    {signal.market_cap}
                  </span>
                </div>
              )}
            </div>
          )}
      </div>
    );
  };

  // ========== RENDER ==========
  const modalContent = (
    <>
      <div
        className={`signal-modal-overlay ${isClosing ? "signal-modal-closing" : ""}`}
      >
        <div className="signal-modal-backdrop" onClick={handleCloseClick} />
        <div className="signal-modal-container">
          <div className="signal-modal-content">
            {/* Drag handle mobile */}
            <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* HEADER */}
            <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-3 sm:px-4 py-2 z-10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CoinLogo pair={signal?.pair} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h2 className="text-white font-display text-sm font-semibold truncate">
                        {signal?.pair}
                      </h2>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white flex-shrink-0 ${statusStyles[signal?.status?.toLowerCase()] || "bg-gray-500"}`}
                      >
                        {signal?.status?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-text-muted text-[10px] truncate">
                      {formatShortDateTime(signal?.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  
                  {/* ═══ TOMBOL JOURNAL (HEADER) ═══ */}
                  <button
                    onClick={() => {
                      sessionStorage.setItem('journal_prefill', JSON.stringify({
                        signal_id: signal.signal_id,
                        pair: signal.pair,
                        planned_entry: signal.entry,
                        planned_tp1: signal.target1,
                        planned_tp2: signal.target2,
                        planned_tp3: signal.target3,
                        planned_tp4: signal.target4,
                        planned_sl: signal.stop1,
                      }));
                      handleCloseClick();
                      setTimeout(() => { window.location.href = '/journal'; }, 300);
                    }}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-bold bg-gold-primary/10 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/20 hover:border-gold-primary/60 transition-all mr-0.5 sm:mr-1"
                    title="Journal This Trade"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    <span className="hidden sm:inline">Journal</span>
                  </button>
                  {/* END TOMBOL JOURNAL */}

                  <div className="flex items-center bg-[#111] rounded-lg p-0.5 border border-gold-primary/15">
                    {["chart", "trade", "research", "history"].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-semibold transition-all whitespace-nowrap ${activeTab === tab ? "bg-gold-primary text-black" : "text-text-secondary hover:text-white hover:bg-white/5"}`}
                      >
                        <span className="sm:hidden">
                          {tab === "chart"
                            ? "📈"
                            : tab === "trade"
                              ? "💹"
                              : tab === "research"
                                ? "🔍"
                                : "📊"}
                        </span>
                        <span className="hidden sm:inline">
                          {tab === "chart"
                            ? `📈 ${t("modal.chart")}`
                            : tab === "trade"
                              ? `💹 ${t("modal.trade")}`
                              : tab === "research"
                                ? `🔍 ${t("modal.research")}`
                                : "📊 History"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleCloseClick}
                    className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0 ml-1 sm:ml-2"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* TAB 1: CHART */}
              {activeTab === "chart" && (
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                  <div className="flex-1 min-w-0 min-h-0 bg-[#0d0d0d]">
                    <div
                      id="tv_chart_modal_main"
                      ref={chartContainerRef}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="hidden lg:block w-52 flex-shrink-0 bg-[#0a0a0a] border-l border-gold-primary/20 overflow-y-auto custom-scrollbar">
                    {renderTargetsPanel("sidebar")}
                  </div>
                  <div className="lg:hidden flex-shrink-0 bg-[#0a0a0a] border-t border-gold-primary/20 overflow-y-auto custom-scrollbar mobile-targets-panel">
                    {renderTargetsPanel("bottom")}
                  </div>
                </div>
              )}

              {/* TAB 2: TRADE (REVISED) */}
              {activeTab === "trade" && (
                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 custom-scrollbar bg-[#0a0a0a]">
                  <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-gold-primary text-xs sm:text-sm font-semibold flex items-center gap-2">
                        📸 {t("modal.trade_proof")}
                      </span>
                    </div>

                    {/* Gambar Before & After / TV */}
                    {!entryImg && !afterImg ? (
                      <div className="w-full h-[350px] sm:h-[450px] bg-[#0d0d0d] rounded-xl border border-white/5 overflow-hidden relative shadow-lg">
                        <div
                          id="tv_chart_modal_side"
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row items-stretch gap-4 sm:gap-5 w-full">
                        {/* KIRI: BEFORE */}
                        <div className="flex-1 w-full min-w-0 flex flex-col">
                          <div className="flex items-center justify-between mb-2 px-1 min-h-[28px]">
                            <span className="text-blue-400 text-[10px] sm:text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                              {t("modal.before_entry")}
                            </span>
                            {entryPrice > 0 && (
                              <span className="text-[10px] sm:text-[11px] font-mono font-medium text-white/80 bg-[#0d0d0d] px-2 py-1 rounded border border-white/5 flex items-center">
                                Entry:{" "}
                                <span className="text-white ml-1">
                                  ${formatPrice(entryPrice)}
                                </span>
                              </span>
                            )}
                          </div>
                          {entryImg ? (
                            <div
                              className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d] h-[250px] sm:h-[300px] w-full cursor-zoom-in shadow-md"
                              onClick={() => setLightboxImg(entryImg)}
                            >
                              <img
                                src={entryImg}
                                alt="Entry Chart"
                                className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
                                <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] sm:text-xs px-3 py-1.5 rounded font-medium backdrop-blur-sm shadow-xl">
                                  🔍 Fullscreen
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-white/10 bg-[#0d0d0d] flex flex-col items-center justify-center h-[250px] sm:h-[300px] w-full text-text-muted">
                              <span className="text-2xl mb-2">⏳</span>
                              <p className="text-xs">Waiting for Chart</p>
                            </div>
                          )}
                        </div>

                        {/* SEPARATOR */}
                        <div className="hidden md:flex flex-col items-center justify-center w-8 shrink-0 relative mt-6">
                          <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/30 via-white/10 to-green-500/30 -translate-y-1/2 z-0" />
                          <div className="relative z-10 bg-[#0a0a0a] border border-white/10 text-white/50 w-7 h-7 rounded-full flex items-center justify-center">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13 5l7 7-7 7M5 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                        </div>

                        {/* KANAN: AFTER */}
                        <div className="flex-1 w-full min-w-0 flex flex-col">
                          <div className="flex items-center justify-between mb-2 px-1 min-h-[28px]">
                            <span
                              className={`text-[10px] sm:text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 ${isStopped ? "text-red-400" : "text-green-400"}`}
                            >
                              {t("modal.after")} ({statusLabel})
                            </span>
                            <div className="flex items-center gap-2">
                              {showInteractiveRight && afterImg && (
                                <button
                                  onClick={() => setShowTV(false)}
                                  className="text-[9px] sm:text-[10px] text-text-muted hover:text-white flex items-center gap-1 bg-[#0d0d0d] hover:bg-white/5 px-2 py-1 rounded border border-white/5 transition-colors"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                    />
                                  </svg>
                                  Back
                                </button>
                              )}
                              {lastPrice > 0 && (
                                <span className="text-[10px] sm:text-[11px] font-mono font-medium text-white/80 bg-[#0d0d0d] px-2 py-1 rounded border border-white/5 flex items-center gap-1">
                                  Last:{" "}
                                  <span className="text-white">
                                    ${formatPrice(lastPrice)}
                                  </span>
                                  {lastPricePct && (
                                    <span
                                      className={`ml-1 font-bold ${isStopped ? "text-red-400" : "text-green-400"}`}
                                    >
                                      {lastPricePct}%
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          {showInteractiveRight ? (
                            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d] h-[250px] sm:h-[300px] w-full shadow-md">
                              <div
                                id="tv_chart_modal_side"
                                className="absolute inset-0 w-full h-full"
                              />
                            </div>
                          ) : (
                            <div
                              className={`relative group rounded-xl overflow-hidden border bg-[#0d0d0d] h-[250px] sm:h-[300px] w-full shadow-md ${isStopped ? "border-red-500/20" : "border-white/10"}`}
                            >
                              <img
                                src={afterImg}
                                alt="Latest Chart"
                                className="absolute inset-0 w-full h-full object-contain"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                                <button
                                  onClick={() => setShowTV(true)}
                                  className="px-4 py-2 bg-white/10 text-white hover:bg-white/20 rounded-lg font-bold text-xs transition-colors border border-white/20 flex items-center gap-2"
                                >
                                  <span>Interactive Chart</span>
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                                    />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setLightboxImg(afterImg)}
                                  className="text-white/60 hover:text-white text-[10px] underline"
                                >
                                  🔍 Fullscreen
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Peak Price (FULL WIDTH) */}
                    {peakPrice && entryPrice > 0 && (
                      <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-center gap-4 shadow-sm">
                        <div className="flex flex-col items-center sm:items-end">
                          <span className="text-white text-xs sm:text-sm font-bold uppercase tracking-widest text-center sm:text-right">
                            Highest Price After Called
                          </span>
                        </div>
                        <div className="hidden sm:block h-6 w-px bg-white/10"></div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-mono font-bold text-white">
                            ${formatPrice(peakPrice)}
                          </span>
                          <span className="text-sm font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 font-mono">
                            {peakPricePct}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Enrichment / Confidence Score */}
                    {signalDetail?.enrichment && (
                      <div>
                        <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                          🧠 Signal Confidence
                        </h4>
                        <EnrichmentBadge enrichment={signalDetail.enrichment} />
                      </div>
                    )}

                    {/* Timeline Horizontal */}
                    <div>
                      <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                        ⏱️ Signal Journey
                      </h4>
                      <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4 w-full overflow-x-auto custom-scrollbar">
                        <div className="flex items-start min-w-[600px] relative pt-2 pb-4">
                          <div className="absolute top-[20px] left-8 right-8 h-[2px] bg-white/5 z-0" />
                          {timeline.map((ev, i) => {
                            const isLast = i === timeline.length - 1;
                            const showActiveLine =
                              !isLast && ev.active && timeline[i + 1]?.active;
                            return (
                              <div
                                key={i}
                                className="relative flex flex-col items-center flex-1 w-0 group z-10"
                              >
                                {showActiveLine && (
                                  <div
                                    className={`absolute top-[10px] left-[50%] w-full h-[2px] ${ev.border} z-0`}
                                  />
                                )}
                                <div
                                  className={`relative z-10 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${ev.bg} ${ev.border} ${ev.color}`}
                                >
                                  {ev.icon}
                                </div>
                                <div className="mt-3 text-center flex flex-col items-center px-1 w-full max-w-[80px]">
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider ${ev.color}`}
                                  >
                                    {ev.label}
                                  </span>
                                  {ev.pct && (
                                    <span
                                      className={`text-[9px] font-mono mt-0.5 ${ev.color}`}
                                    >
                                      {ev.pct}
                                    </span>
                                  )}
                                  <span className="text-[8px] text-text-muted mt-1 leading-tight">
                                    {ev.sub}
                                  </span>
                                  <span className="text-[8px] text-white/50 font-mono mt-0.5 truncate w-full">
                                    {ev.detail}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Data / Exchanges Grid — CENTERED */}
                    <div>
                      <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                        🏦 Trade on Exchanges
                      </h4>
                      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                        {/* Tombol Telegram */}
                        {signalDetail?.message_link && (
                          <a
                            href={signalDetail.message_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center gap-1.5 p-2 w-[calc(33.333%-0.5rem)] sm:w-[calc(20%-0.75rem)] max-w-[140px] bg-gradient-to-b from-blue-500/10 to-blue-900/10 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all group"
                          >
                            <span className="text-xl">✈️</span>
                            <span className="text-blue-400 text-[9px] sm:text-[10px] font-bold group-hover:text-blue-300 truncate w-full text-center">
                              View Telegram
                            </span>
                          </a>
                        )}

                        {/* List Exchange (10+) */}
                        {tradeLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex flex-col items-center gap-1.5 p-2 w-[calc(33.333%-0.5rem)] sm:w-[calc(20%-0.75rem)] max-w-[140px] bg-gradient-to-b ${link.color} rounded-lg border border-white/5 hover:bg-white/5 transition-all group`}
                          >
                            <img
                              src={link.logo}
                              alt={link.name}
                              className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = link.fallbackLogo;
                              }}
                            />
                            <span className="text-white/70 text-[9px] sm:text-[10px] font-medium group-hover:text-white truncate w-full text-center">
                              {link.name}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RESEARCH */}
              {activeTab === "research" && (
                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-[#0a0a0a]">
                  <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-3 sm:mb-5">
                      <h3 className="text-base sm:text-lg font-display text-white mb-1">
                        {t("modal.research_analytics")}
                      </h3>
                      <p className="text-text-muted text-xs sm:text-sm">
                        {t("modal.deep_dive")}{" "}
                        <span className="text-gold-primary font-semibold">
                          {coinSymbol}
                        </span>
                      </p>
                    </div>
                    {coinInfoLoading && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15 mb-4 sm:mb-5 animate-pulse">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-full bg-gold-primary/10" />
                          <div>
                            <div className="h-4 bg-gold-primary/10 rounded w-32 mb-1" />
                            <div className="h-3 bg-white/5 rounded w-48" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-3 bg-white/5 rounded w-full" />
                          <div className="h-3 bg-white/5 rounded w-5/6" />
                          <div className="h-3 bg-white/5 rounded w-4/6" />
                        </div>
                      </div>
                    )}
                    {coinInfo && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15 mb-4 sm:mb-5">
                        <div className="flex items-center gap-3 mb-3">
                          {coinInfo.image_thumb && (
                            <img
                              src={coinInfo.image_thumb}
                              alt={coinInfo.name}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div>
                            <h4 className="text-white font-semibold text-sm">
                              {coinInfo.name}{" "}
                              <span className="text-text-muted font-normal">
                                ({coinInfo.symbol})
                              </span>
                            </h4>
                            {coinInfo.categories?.length > 0 && (
                              <p className="text-text-muted text-[10px]">
                                {coinInfo.categories.join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                        {coinInfo.description && (
                          <p className="text-text-muted text-xs leading-relaxed mb-3 line-clamp-4 sm:line-clamp-none">
                            {coinInfo.description}
                          </p>
                        )}
                        {coinInfo.market_data && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/5">
                            {coinInfo.market_data.current_price != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.price")}
                                </p>
                                <p className="text-white text-xs font-mono">
                                  $
                                  {coinInfo.market_data.current_price.toLocaleString()}
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.market_cap != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.market_cap")}
                                </p>
                                <p className="text-white text-xs">
                                  {formatBigNum(
                                    coinInfo.market_data.market_cap,
                                  )}
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.market_cap_rank != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.rank")}
                                </p>
                                <p className="text-white text-xs font-mono">
                                  #{coinInfo.market_data.market_cap_rank}
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.total_volume != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.vol_24h")}
                                </p>
                                <p className="text-white text-xs">
                                  {formatBigNum(
                                    coinInfo.market_data.total_volume,
                                  )}
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.price_change_24h_pct !=
                              null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  24h
                                </p>
                                <p
                                  className={`text-xs font-mono ${coinInfo.market_data.price_change_24h_pct >= 0 ? "text-green-400" : "text-red-400"}`}
                                >
                                  {coinInfo.market_data.price_change_24h_pct >=
                                  0
                                    ? "+"
                                    : ""}
                                  {coinInfo.market_data.price_change_24h_pct.toFixed(
                                    2,
                                  )}
                                  %
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.price_change_7d_pct !=
                              null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  7d
                                </p>
                                <p
                                  className={`text-xs font-mono ${coinInfo.market_data.price_change_7d_pct >= 0 ? "text-green-400" : "text-red-400"}`}
                                >
                                  {coinInfo.market_data.price_change_7d_pct >= 0
                                    ? "+"
                                    : ""}
                                  {coinInfo.market_data.price_change_7d_pct.toFixed(
                                    2,
                                  )}
                                  %
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.ath != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.ath")}
                                </p>
                                <p className="text-white text-xs font-mono">
                                  ${coinInfo.market_data.ath.toLocaleString()}
                                </p>
                                {coinInfo.market_data.ath_change_pct !=
                                  null && (
                                  <p className="text-red-400/70 text-[8px] font-mono">
                                    {coinInfo.market_data.ath_change_pct.toFixed(
                                      1,
                                    )}
                                    %
                                  </p>
                                )}
                              </div>
                            )}
                            {coinInfo.market_data.circulating_supply !=
                              null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.supply")}
                                </p>
                                <p className="text-white text-xs">
                                  {(
                                    coinInfo.market_data.circulating_supply /
                                    1e6
                                  ).toFixed(1)}
                                  M
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        {coinInfo.links && (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                            {coinInfo.links.homepage && (
                              <a
                                href={coinInfo.links.homepage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-gold-primary/70 hover:text-gold-primary bg-gold-primary/10 px-2 py-1 rounded transition-colors"
                              >
                                🌐 {t("modal.website")}
                              </a>
                            )}
                            {coinInfo.links.twitter && (
                              <a
                                href={`https://twitter.com/${coinInfo.links.twitter}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-blue-400/70 hover:text-blue-400 bg-blue-500/10 px-2 py-1 rounded transition-colors"
                              >
                                🐦 @{coinInfo.links.twitter}
                              </a>
                            )}
                            {coinInfo.links.telegram && (
                              <a
                                href={`https://t.me/${coinInfo.links.telegram}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-cyan-400/70 hover:text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded transition-colors"
                              >
                                📨 Telegram
                              </a>
                            )}
                            {coinInfo.links.subreddit && (
                              <a
                                href={coinInfo.links.subreddit}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-orange-400/70 hover:text-orange-400 bg-orange-500/10 px-2 py-1 rounded transition-colors"
                              >
                                🤖 Reddit
                              </a>
                            )}
                            {coinInfo.links.github && (
                              <a
                                href={coinInfo.links.github}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-gray-400/70 hover:text-gray-400 bg-gray-500/10 px-2 py-1 rounded transition-colors"
                              >
                                💻 GitHub
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {!coinInfo && !coinInfoLoading && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-white/5 mb-4 sm:mb-5 text-center">
                        <p className="text-text-muted text-xs">
                          {t("modal.no_info")}{" "}
                          <span className="text-gold-primary font-mono">
                            {coinSymbol}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* === AI PROMPT GENERATOR SECTION === */}
                    <div className="mb-4 sm:mb-5">
                      <div className="bg-gradient-to-br from-[#111] to-[#0d0d0d] rounded-xl border border-purple-500/20 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-purple-500/10 bg-purple-500/5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                              <span className="text-xs">🤖</span>
                            </div>
                            <div>
                              <h4 className="text-purple-300 text-xs sm:text-sm font-semibold">
                                AI Trade Analysis Prompt
                              </h4>
                              <p className="text-text-muted text-[9px] sm:text-[10px]">
                                Copy & paste to any AI (ChatGPT, Claude, Gemini,
                                etc.)
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleCopyPrompt}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold transition-all duration-300 ${
                              promptCopied
                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                : "bg-purple-500/15 text-purple-300 border border-purple-500/25 hover:bg-purple-500/25 hover:text-purple-200 active:scale-95"
                            }`}
                          >
                            {promptCopied ? (
                              <>
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                Copied!
                              </>
                            ) : (
                              <>
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                  />
                                </svg>
                                Copy Prompt
                              </>
                            )}
                          </button>
                        </div>
                        {/* Prompt Preview */}
                        <div className="p-3 sm:p-4 max-h-[280px] overflow-y-auto custom-scrollbar">
                          <pre className="text-[10px] sm:text-[11px] text-text-secondary font-mono leading-relaxed whitespace-pre-wrap break-words select-all">
                            {generateAIPrompt()}
                          </pre>
                        </div>
                        {/* Footer hint */}
                        <div className="px-3 sm:px-4 py-2 border-t border-purple-500/10 bg-purple-500/[0.03]">
                          <p className="text-[9px] sm:text-[10px] text-text-muted flex items-center gap-1.5">
                            <svg
                              className="w-3 h-3 text-purple-400/60 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>
                              This prompt includes all signal details
                              {coinInfo
                                ? ", market data from CoinGecko,"
                                : ""}{" "}
                              and asks AI for trade setup analysis, position
                              sizing, risk assessment, and trade management
                              strategy.
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 sm:mb-5">
                      <p className="text-gold-primary text-xs font-semibold mb-2.5 sm:mb-3">
                        🔗 {t("modal.research_links")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {researchLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-r ${link.color} rounded-lg transition-all group border active:scale-95`}
                          >
                            <img
                              src={link.logo}
                              alt={link.name}
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = link.fallbackLogo;
                              }}
                            />
                            <span className="text-[10px] sm:text-[11px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">
                              {link.name}
                            </span>
                            <LinkIcon />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "history" && (
                <SignalHistoryTab
                  signal={signal}
                  onSwitchSignal={(newSignal) => {
                    if (onSwitchSignal) {
                      onSwitchSignal(newSignal);
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FULLSCREEN LIGHTBOX - OVERLAY GAMBAR */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[200000] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt="Fullscreen Chart"
            className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white bg-white/10 hover:bg-white/20 p-2 sm:p-3 rounded-full transition-colors backdrop-blur-sm"
            onClick={() => setLightboxImg(null)}
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* === STYLES === */}
      <style>{`
        .signal-modal-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; isolation: isolate; }
        .signal-modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.85); }
        .signal-modal-container { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 0; }
        .signal-modal-content { position: relative; width: 100%; max-width: 1400px; height: 100%; background: #0a0506; border: 1px solid rgba(212,168,83,0.4); display: flex; flex-direction: column; overflow: hidden; }

        @media(min-width:640px) {
          .signal-modal-container { padding: 12px; }
          .signal-modal-content { max-height: calc(100vh - 24px); border-radius: 16px; box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212,168,83,0.1); }
        }
        @media(min-width:1024px) {
          .signal-modal-container { padding: 20px; }
          .signal-modal-content { max-height: 880px; }
        }
        @media(max-width:639px) {
          .signal-modal-content { max-height: 100%; height: 100%; border-radius: 0; border: none; }
        }
        @supports(height:100dvh) { .signal-modal-overlay { height: 100dvh; } }

        .mobile-targets-panel { max-height: 40vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }

        .signal-modal-backdrop { animation: smBI .25s ease-out; }
        .signal-modal-content { animation: smCI .3s cubic-bezier(.16,1,.3,1); }
        .signal-modal-closing .signal-modal-backdrop { animation: smBO .2s ease-in forwards; }
        .signal-modal-closing .signal-modal-content { animation: smCO .2s ease-in forwards; }
        @keyframes smBI { from{opacity:0} to{opacity:1} }
        @keyframes smBO { from{opacity:1} to{opacity:0} }
        @keyframes smCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes smCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @media(max-width:639px) {
          .signal-modal-content { animation: smUp .3s cubic-bezier(.16,1,.3,1); }
          .signal-modal-closing .signal-modal-content { animation: smDn .2s ease-in forwards; }
          @keyframes smUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
          @keyframes smDn { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(40px)} }
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }

        /* TradingView Overrides */
        #tv_chart_modal_main, #tv_chart_modal_side { background: #0d0d0d !important; }
        .tradingview-widget-container { background: #0d0d0d !important; }
        .tradingview-widget-container__widget { background: #0d0d0d !important; }
        .tradingview-widget-copyright { display: none !important; }
        iframe { background: #0d0d0d !important; border: none !important; }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default SignalModal;