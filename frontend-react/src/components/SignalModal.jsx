import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import SignalHistoryTab from "./SignalHistoryTab";
import DeepAnalysis from "./DeepAnalysis";
import SignalJourneyExtended from "./SignalJourneyExtended";
import CoinCategoryBadge from "./CoinCategoryBadge";
import CoinUtilityModal from "./CoinUtilityModal";
import { useCurrency } from "../context/CurrencyContext";
import { convertPrice, formatLocalPrice } from "../utils/currencyHelpers";
import BTCCorrelationBadge from "./BTCCorrelationBadge";
import BTCCorrelationModal from "./BTCCorrelationModal";
import { Ic } from "./signalIcons";
import { shareSignal } from "../services/shareSignal";
import IndicatorGuideModal from "./IndicatorGuideModal";


const deriveChartWithCard = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!/_tp[234]_/i.test(rawUrl)) return null;
  if (/_with_card|_combined/i.test(rawUrl)) return null;
  return rawUrl.replace(/\.png$/i, "_with_card.png");
};


const SignalModal = ({
  signal,
  isOpen,
  onClose,
  onSwitchSignal,
  initialTab = "chart",
  onTabChange,
}) => {
  const { t } = useTranslation();
  const { currency, rates, shouldShowLocal } = useCurrency();

  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const coinInfoFetchedRef = useRef(false);

  const [signalDetail, setSignalDetail] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinInfoLoading, setCoinInfoLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  // State untuk Peak Price & Toggle TradingView di Tab Trade
  const [peakPrice, setPeakPrice] = useState(null);
  const [showTV, setShowTV] = useState(false);

  // State untuk AI Prompt copy
  const [promptCopied, setPromptCopied] = useState(false);

  // State untuk Share signal (toast "Link copied")
  const [shareCopied, setShareCopied] = useState(false);
  const [savingImg, setSavingImg] = useState(false);
  const [tweetUrl, setTweetUrl] = useState(null);

  const [overrideSignal, setOverrideSignal] = useState(null);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [showCoinUtility, setShowCoinUtility] = useState(false);
  const [showBtcCorrelation, setShowBtcCorrelation] = useState(false);
  const [showIndicatorGuide, setShowIndicatorGuide] = useState(false);
  // Toggle "always show indicators" (MACD/RSI/BB) di chart — di-remember per user (DB).
  const [showIndicators, setShowIndicators] = useState(true);
  const [livePrice, setLivePrice] = useState(null);
  const [liveChange24h, setLiveChange24h] = useState(null);
  const [derivMetrics, setDerivMetrics] = useState(null);
  // true = fetch live (Binance & Bybit) sama-sama gagal → kemungkinan geo-block.
  const [liveBlocked, setLiveBlocked] = useState(false);

  // === STABLE IDENTITY KEYS (anti "refresh terus") ===
  // Parent bisa re-render & mengirim object `signal`/`overrideSignal` BARU
  // walau isinya sama. Kalau dependency array pakai object itu langsung,
  // semua efek (fetch detail, peak, TradingView) ikut re-run tiap render →
  // modal kelihatan refresh/kedip. Turunkan jadi primitif stabil di bawah,
  // lalu pakai INI di dependency array — efek cuma jalan saat sinyal beneran ganti.
  const _activeForKey = overrideSignal || signal;
  const signalKey = _activeForKey?.signal_id ?? _activeForKey?.id ?? null;
  const pairKey = (signal?.pair || "").toUpperCase();

  // --- SEMUA HOOKS (useEffect) HARUS ADA DI ATAS SEBELUM RETURN KONDISIONAL ---

  // 1. Kunci scroll body saat modal buka
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // 1b. ROUTING FIX: sinkronkan tab aktif dari URL (?tab=...) — penting untuk
  // kasus di mana signal-nya SAMA (tidak remount) tapi user pencet tombol
  // back/forward browser dan hanya parameter `tab` yang berubah.
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  // Load preferensi "show indicators" dari server saat modal dibuka (sekali).
  // Optimistic dari cache lokal dulu biar instan, lalu sinkron dari DB.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    try {
      const cached = localStorage.getItem("pref_chart_indicators");
      if (cached !== null) setShowIndicators(cached === "1");
    } catch {}
    const token = localStorage.getItem("access_token");
    if (!token) return;
    (async () => {
      try {
        const r = await fetch("/api/v1/profile/ui-prefs", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok && alive) {
          const d = await r.json();
          if (typeof d?.chart_indicators === "boolean") {
            setShowIndicators(d.chart_indicators);
            try { localStorage.setItem("pref_chart_indicators", d.chart_indicators ? "1" : "0"); } catch {}
          }
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [isOpen]);

  // Fetch X tweet URL for this signal (TP2+ posts only); hides IG button if none.
  useEffect(() => {
    const cs = overrideSignal || signal;
    const sid = cs?.signal_id ?? cs?.id;
    if (!isOpen || !sid) { setTweetUrl(null); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/v1/og/signal/${sid}/tweet`);
        const d = await r.json();
        if (alive) setTweetUrl(d?.url || null);
      } catch { if (alive) setTweetUrl(null); }
    })();
    return () => { alive = false; };
  }, [isOpen, signalKey]);

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
    setShowDeepAnalysis(false);
    setActiveTab(initialTab);

    const fetchDetail = async () => {
      try {
        // Attach Authorization header if user is logged in
        const token = localStorage.getItem("access_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const r = await fetch(
          `/api/v1/signals/detail/${currentSignal.signal_id}`,
          { headers },
        );
        if (r.ok) setSignalDetail(await r.json());
      } catch (e) {
        console.error("Failed to fetch signal detail:", e);
      }
    };
    fetchDetail();
  }, [isOpen, signalKey]);

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
  }, [isOpen, signalKey, signalDetail]);

  // 4b. Live price + derivatives metrics (polling 10s) — Binance -> Bybit fallback
  useEffect(() => {
    if (!isOpen || !signal?.pair) return;
    const symbol = (signal.pair || "").replace(/USDT$/i, "") + "USDT";
    let alive = true;
    setLiveBlocked(false); // reset saat pair ganti / modal buka

    const applyData = (d) => {
      if (!alive || !d) return;
      if (d.price > 0) setLivePrice(d.price);
      if (d.change24h !== null && d.change24h !== undefined) setLiveChange24h(d.change24h);
      setDerivMetrics({
        funding: d.funding, nextFundingMs: d.nextFundingMs,
        oiUsd: d.oiUsd, oiChange24h: d.oiChange24h,
        lsLong: d.lsLong, lsShort: d.lsShort,
      });
    };

    // --- Binance Futures (primary) ---
    const fetchBinance = async () => {
      const [pmRes, oiRes, lsRes, oi24Res, tickRes] = await Promise.allSettled([
        fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
        fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=1`),
        fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
        fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`),
      ]);
      if (pmRes.status !== "fulfilled" || !pmRes.value.ok) return null;
      const pm = await pmRes.value.json();
      const price = parseFloat(pm.markPrice);
      if (!(price > 0)) return null;
      const out = { price, funding: parseFloat(pm.lastFundingRate) * 100,
        nextFundingMs: parseInt(pm.nextFundingTime),
        oiUsd: null, oiChange24h: null, lsLong: null, lsShort: null, change24h: null };
      if (oiRes.status === "fulfilled" && oiRes.value.ok) {
        const o = await oiRes.value.json();
        out.oiUsd = parseFloat(o.openInterest) * price;
      }
      if (oi24Res.status === "fulfilled" && oi24Res.value.ok) {
        const a = await oi24Res.value.json();
        if (Array.isArray(a) && a.length >= 2) {
          const old = parseFloat(a[0].sumOpenInterestValue);
          const now = parseFloat(a[a.length - 1].sumOpenInterestValue);
          if (old > 0) out.oiChange24h = ((now - old) / old) * 100;
        }
      }
      if (lsRes.status === "fulfilled" && lsRes.value.ok) {
        const l = await lsRes.value.json();
        if (Array.isArray(l) && l.length) {
          out.lsLong = Math.round(parseFloat(l[0].longAccount) * 100);
          out.lsShort = Math.round(parseFloat(l[0].shortAccount) * 100);
        }
      }
      if (tickRes.status === "fulfilled" && tickRes.value.ok) {
        const tk = await tickRes.value.json();
        out.change24h = parseFloat(tk.priceChangePercent);
      }
      return out;
    };

    // --- Bybit (fallback — accessible from ID/more regions) ---
    const fetchBybit = async () => {
      const [tkRes, oiRes, lsRes] = await Promise.allSettled([
        fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`),
        fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=25`),
        fetch(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`),
      ]);
      if (tkRes.status !== "fulfilled" || !tkRes.value.ok) return null;
      const tj = await tkRes.value.json();
      const tk = tj?.result?.list?.[0];
      if (!tk) return null;
      const price = parseFloat(tk.markPrice || tk.lastPrice);
      if (!(price > 0)) return null;
      const out = {
        price,
        funding: parseFloat(tk.fundingRate || 0) * 100,
        nextFundingMs: tk.nextFundingTime ? parseInt(tk.nextFundingTime) : null,
        change24h: tk.price24hPcnt != null ? parseFloat(tk.price24hPcnt) * 100 : null,
        oiUsd: tk.openInterestValue ? parseFloat(tk.openInterestValue)
              : (tk.openInterest ? parseFloat(tk.openInterest) * price : null),
        oiChange24h: null, lsLong: null, lsShort: null,
      };
      if (oiRes.status === "fulfilled" && oiRes.value.ok) {
        const oj = await oiRes.value.json();
        const list = oj?.result?.list || [];
        if (list.length >= 2) {
          const now = parseFloat(list[0].openInterest);
          const old = parseFloat(list[list.length - 1].openInterest);
          if (old > 0) out.oiChange24h = ((now - old) / old) * 100;
        }
      }
      if (lsRes.status === "fulfilled" && lsRes.value.ok) {
        const lj = await lsRes.value.json();
        const l = lj?.result?.list?.[0];
        if (l) {
          out.lsLong = Math.round(parseFloat(l.buyRatio) * 100);
          out.lsShort = Math.round(parseFloat(l.sellRatio) * 100);
        }
      }
      return out;
    };

    const fetchLiveData = async () => {
      let data = null;
      try { data = await fetchBinance(); } catch (_) {}
      if (!data) { try { data = await fetchBybit(); } catch (_) {} }
      // Kedua provider gagal → tandai blocked (fallback pesan VPN di UI).
      if (alive) setLiveBlocked(!data);
      applyData(data);
    };

    fetchLiveData();
    const iv = setInterval(fetchLiveData, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [isOpen, signal?.pair]);

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
    const container = chartContainerRef.current;
    container.innerHTML = "";

    const symbol = `BINANCE:${signal.pair || ""}.P`;
    const timezone = getUserTimezone();

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.cssText = "height:100%;width:100%";

    const widgetInner = document.createElement("div");
    widgetInner.className = "tradingview-widget-container__widget";
    widgetInner.style.cssText = "height:100%;width:100%";
    widgetContainer.appendChild(widgetInner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: "240",
      timezone: timezone,
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(13, 13, 13, 1)",
      gridColor: "rgba(128,128,138,0.08)",
      hide_top_toolbar: false,
      hide_legend: false,
      // Drawing toolbar (trendline, fib, dll) SELALU tampil — penting buat analisa.
      // (dulu disembunyikan otomatis di layar sempit; sekarang dipertahankan.)
      hide_side_toolbar: false,
      hide_drawing_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: false,
      hide_volume: false,
      withdateranges: true,
      studies: showIndicators
        ? ["STD;MACD", "STD;RSI", "STD;Bollinger_Bands"]
        : [],
      support_host: "https://www.tradingview.com",
    });

    widgetContainer.appendChild(script);
    container.appendChild(widgetContainer);

    return () => {
      container.innerHTML = "";
    };
  }, [isOpen, pairKey, activeTab, showIndicators]);

  // 7. Handle Render TradingView Mini di Tab Trade
  // Definisikan variabel URL gambar lebih awal untuk digunakan di useEffect ini
  // OPSI B: hide charts for redacted (non-subscriber on open signal)
  const entryImg = signalDetail?.is_redacted
    ? null
    : signalDetail?.entry_chart_url || signal?.entry_chart_url;
  const rawAfterImg = signalDetail?.is_redacted
    ? null
    : signalDetail?.latest_chart_url || signal?.latest_chart_url;
  const afterImg = deriveChartWithCard(rawAfterImg) || rawAfterImg;
  const showInteractiveRight = showTV || (!afterImg && entryImg);

  useEffect(() => {
    const shouldMountTV =
      isOpen &&
      activeTab === "trade" &&
      ((!entryImg && !afterImg) || (entryImg && showInteractiveRight));

    if (!shouldMountTV) return;

    const timer = setTimeout(() => {
      const container = document.getElementById("tv_chart_modal_side");
      if (!container) return;
      container.innerHTML = "";

      const symbol = `BINANCE:${signal?.pair || ""}.P`;
      const timezone = getUserTimezone();

      const widgetContainer = document.createElement("div");
      widgetContainer.className = "tradingview-widget-container";
      widgetContainer.style.cssText = "height:100%;width:100%";

      const widgetInner = document.createElement("div");
      widgetInner.className = "tradingview-widget-container__widget";
      widgetInner.style.cssText = "height:100%;width:100%";
      widgetContainer.appendChild(widgetInner);

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true,
        symbol: symbol,
        interval: "240",
        timezone: timezone,
        theme: "dark",
        style: "1",
        locale: "en",
        backgroundColor: "rgba(13, 13, 13, 1)",
        gridColor: "rgba(128,128,138,0.08)",
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: false,
        hide_drawing_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        studies: [],
        support_host: "https://www.tradingview.com",
      });

      widgetContainer.appendChild(script);
      container.appendChild(widgetContainer);
    }, 100);

    return () => {
      clearTimeout(timer);
    };
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

  // Toggle indikator chart + persist ke DB (dan cache lokal buat instan).
  const toggleIndicators = () => {
    setShowIndicators((prev) => {
      const next = !prev;
      try { localStorage.setItem("pref_chart_indicators", next ? "1" : "0"); } catch {}
      const token = localStorage.getItem("access_token");
      if (token) {
        fetch("/api/v1/profile/ui-prefs", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ chart_indicators: next }),
        }).catch(() => {});
      }
      return next;
    });
  };

  const handleShare = async (e) => {
    if (e) e.stopPropagation();
    const res = await shareSignal(activeSignal);
    if (res.method === "clipboard" && res.ok) {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  // ── Share to Instagram via X tweet link (card-friendly) ──
  const handleShareTweet = async (e) => {
    e?.stopPropagation?.();
    if (!tweetUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: tweetUrl });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    // Fallback: copy tweet link.
    try {
      await navigator.clipboard?.writeText(tweetUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (_) {}
  };

  // === SAFE MATH HELPERS (Anti-Crash) ===
  const getCoinSymbol = (pair) =>
    pair?.replace(/USDT$/i, "").toUpperCase() || "";
  const coinSymbol = getCoinSymbol(signal?.pair);
  const coinSymbolLower = coinSymbol.toLowerCase();

  // === REDACTED FLAG ===
  // Backend marks signalDetail.is_redacted=true when user is non-subscriber
  // viewing an OPEN signal. In that case entry/TP/SL/charts are null in the response.
  const isRedacted = signalDetail?.is_redacted === true;

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
  ].filter((tp) => tp.value);

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

  // Quiet status chips — outline, not neon fills
  const statusStyles = {
    open: "bg-white/[0.06] text-text-secondary border border-white/10",
    tp1: "bg-positive/10 text-positive border border-positive/20",
    tp2: "bg-positive/10 text-positive border border-positive/20",
    tp3: "bg-positive/10 text-positive border border-positive/20",
    tp4: "bg-positive/15 text-positive border border-positive/25",
    closed_win: "bg-positive/10 text-positive border border-positive/20",
    closed_loss: "bg-negative/10 text-negative border border-negative/20",
    sl: "bg-negative/10 text-negative border border-negative/20",
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
        "from-green-600/20 to-green-800/10 border-positive/30 hover:border-green-400",
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
      color: "from-green-500/10 to-green-700/5 hover:border-positive/30",
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
      color: "from-red-500/10 to-red-700/5 hover:border-negative/30",
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
        color: isStopped ? "text-negative" : "text-gray-500",
        border: isStopped ? "border-negative/30" : "border-gray-700",
        bg: isStopped ? "bg-negative/10" : "bg-surface-secondary",
      });
    }

    // ENTRY in the middle
    ev.push({
      label: "ENTRY",
      sub: formatShortDateTime(signal?.created_at),
      detail: `@ ${formatPrice(signal?.entry)}`,
      icon: "•",
      active: true,
      color: "text-text-secondary",
      border: "border-white/10",
      bg: "bg-white/[0.04]",
    });

    // TPs go RIGHT of entry — unified green color for elegance
    const tps = [
      {
        k: "tp1",
        l: "TP1",
        v: signal?.target1,
        c: "text-positive",
        b: "border-positive/30",
        bg: "bg-positive/10",
      },
      {
        k: "tp2",
        l: "TP2",
        v: signal?.target2,
        c: "text-positive",
        b: "border-positive/30",
        bg: "bg-positive/10",
      },
      {
        k: "tp3",
        l: "TP3",
        v: signal?.target3,
        c: "text-positive",
        b: "border-positive/30",
        bg: "bg-positive/10",
      },
      {
        k: "tp4",
        l: "TP4",
        v: signal?.target4,
        c: "text-positive",
        b: "border-positive/30",
        bg: "bg-positive/10",
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
        bg: h ? tp.bg : "bg-surface-secondary",
      });
    });

    return ev;
  };
  const timeline = buildTimeline();
  const LinkIcon = () => (
    <svg
      className="w-2.5 h-2.5 text-text-primary/40 group-hover:text-text-primary/70"
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

    // === Local currency line helper (multi-currency display) ===
  // Renders a small secondary price line below USDT prices.
  // Hidden when user uses USD or rates not loaded — zero visual noise.
  const LocalPriceLine = ({ usdtValue, size = "sm", align = "left" }) => {
    if (!shouldShowLocal || usdtValue == null) return null;
    const localValue = convertPrice(Number(usdtValue), currency, rates);
    if (localValue == null) return null;

    const sizeClass = size === "lg" ? "text-[10px]" : size === "md" ? "text-[9px]" : "text-[8px]";
    const alignClass = align === "right" ? "text-right" : "text-left";

    return (
      <p className={`${sizeClass} ${alignClass} font-mono text-text-muted leading-tight mt-0.5`}>
        ≈ {formatLocalPrice(localValue, currency)}
      </p>
    );
  };

  const formatCountdown = (ms) => {
    if (!ms) return null;
    const diff = ms - Date.now();
    if (diff <= 0) return "now";
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatOiUsd = (val) => {
    if (!val || val <= 0) return "\u2014";
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${(val / 1e3).toFixed(1)}K`;
  };

  // === renderTargetsPanel === (Diubah jadi fungsi biasa agar tidak re-mount)
  // STYLING: semua wrapper kartu sekarang pakai .lq-card (boxy + hover glow),
  // tile dalam pakai .lq-tile. Logika & data tidak berubah.
  const renderTargetsPanel = (layout) => {
    const isCompact = layout === "bottom";

    if (isRedacted) {
      return (
        <div className="p-3 space-y-2">
          <div className="lq-card p-6 min-h-[280px] flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4 text-text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-text-primary font-semibold text-base mb-2">Live signal</h3>
            <p className="text-text-muted text-xs leading-relaxed max-w-[260px] mb-4">
              This call is still <span className="text-text-primary font-medium">open</span>. Subscribe to view entry, targets, stop-loss, and charts.
            </p>
            <button type="button" onClick={() => { window.location.href = "/pricing"; }}
              className="lq-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold">
              {Ic.lock("w-3.5 h-3.5")} Subscribe
            </button>
            <p className="text-[10px] text-text-muted mt-3">Closed signals stay free as track record.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-3 space-y-2">
        {/* ── LIVE PRICE + PnL ── */}
        {livePrice && (() => {
          const entryNum = signal?.entry ? Number(signal.entry) : 0;
          const pnlRaw = entryNum > 0 ? ((livePrice - entryNum) / entryNum) * 100 : null;
          const isShortDir = signal?.target1 && Number(signal.target1) < entryNum;
          const pnlPct = isShortDir && pnlRaw !== null ? -pnlRaw : pnlRaw;
          const up = pnlPct !== null && pnlPct > 0;
          const down = pnlPct !== null && pnlPct < 0;
          return (
            <div className="lq-card">
              <div className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-positive" />
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted font-medium">Mark</span>
                  </span>
                  {liveChange24h !== null && (
                    <span className={`text-[9px] font-mono tabular-nums ${liveChange24h >= 0 ? "text-positive" : "text-negative"}`}>
                      {liveChange24h >= 0 ? "+" : ""}{liveChange24h.toFixed(2)}% · 24h
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`font-mono font-semibold leading-none truncate tabular-nums ${isCompact ? "text-lg" : "text-xl"} ${up ? "text-positive" : down ? "text-negative" : "text-text-primary"}`}>
                      {formatPrice(livePrice)}
                    </p>
                    <LocalPriceLine usdtValue={livePrice} size="md" />
                  </div>
                  {pnlPct !== null && (
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono tabular-nums font-medium flex-shrink-0 border ${
                      up ? "bg-positive/10 text-positive border-positive/15" :
                      down ? "bg-negative/10 text-negative border-negative/15" :
                      "bg-white/[0.03] text-text-muted border-white/10"
                    }`}>
                      {up ? "+" : down ? "−" : ""}{Math.abs(pnlPct).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── ENTRY ── */}
        <div className="lq-card">
          <div className="p-3">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-text-muted text-[9px] uppercase tracking-[0.12em] font-medium">{t("modal.entry")}</p>
              <p className="text-[9px] text-text-muted flex-shrink-0 whitespace-nowrap">{formatShortDateTime(signal?.created_at)}</p>
            </div>
            <p className={`font-mono font-semibold text-text-primary leading-none truncate tabular-nums ${isCompact ? "text-base" : "text-lg"}`}>{formatPrice(signal?.entry)}</p>
            <LocalPriceLine usdtValue={signal?.entry} size="md" />
          </div>
        </div>

        {/* ── DEEP ANALYSIS ── */}
        {signalDetail?.enrichment && (
          <button type="button" onClick={() => setShowDeepAnalysis(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-medium bg-white/[0.03] text-text-secondary border border-white/[0.08] hover:bg-white/[0.05] hover:text-text-primary transition-colors">
            {Ic.cpu("w-3.5 h-3.5")}<span>Deep analysis</span>
          </button>
        )}

        {/* ── TARGETS ── */}
        <div className="lq-card p-2.5">
          <p className="text-[9px] uppercase tracking-[0.12em] text-text-muted font-medium mb-2 flex items-center gap-1.5 px-0.5">
            {Ic.target("w-3 h-3")} {t("modal.targets")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {targets.map((tg, i) => (
              <div key={i} className={`lq-tile p-2 ${
                tg.hit
                  ? "bg-positive/[0.06] border-positive/20"
                  : ""
              }`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="flex items-center gap-1 min-w-0">
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-semibold flex-shrink-0 ${
                      tg.hit ? "bg-positive/20 text-positive" : "bg-white/[0.06] text-text-muted"
                    }`}>{tg.hit ? "✓" : i + 1}</span>
                    <span className={`text-[10px] font-medium truncate ${tg.hit ? "text-positive" : "text-text-secondary"}`}>{tg.label}</span>
                  </span>
                  <span className={`text-[9px] font-mono tabular-nums flex-shrink-0 ${tg.hit ? "text-positive" : "text-text-muted"}`}>+{tg.pct}%</span>
                </div>
                <p className={`text-[11px] font-mono leading-none truncate tabular-nums ${tg.hit ? "text-text-primary" : "text-text-secondary"}`}>{formatPrice(tg.value)}</p>
                <LocalPriceLine usdtValue={tg.value} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* ── STOP LOSS ── */}
        {stops.length > 0 && (
          <div className="lq-card p-2.5">
            <p className="text-[9px] uppercase tracking-[0.12em] text-text-muted font-medium mb-2 flex items-center gap-1.5 px-0.5">
              {Ic.stop("w-3 h-3")} {t("modal.stop_loss")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {stops.map((s, i) => (
                <div key={i} className={`lq-tile p-2 ${
                  s.hit
                    ? "bg-negative/[0.06] border-negative/20"
                    : ""
                }`}>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-[10px] font-medium truncate ${s.hit ? "text-negative" : "text-text-secondary"}`}>{s.label}</span>
                    <span className={`text-[9px] font-mono tabular-nums flex-shrink-0 ${s.hit ? "text-negative" : "text-text-muted"}`}>{s.pct}%</span>
                  </div>
                  <p className={`text-[11px] font-mono leading-none truncate tabular-nums ${s.hit ? "text-text-primary" : "text-text-secondary"}`}>{formatPrice(s.value)}</p>
                  <LocalPriceLine usdtValue={s.value} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DERIVATIVES (tile kotak + L/S bar chart) ── */}
        {derivMetrics && (() => {
          const { funding, nextFundingMs, oiUsd, oiChange24h, lsLong, lsShort } = derivMetrics;
          const countdown = formatCountdown(nextFundingMs);
          const fundingPos = funding > 0;
          return (
            <div className="lq-card">
              <div className="px-2.5 py-1.5 border-b border-white/[0.05] flex items-center gap-1.5">
                <span className="text-[8.5px] uppercase tracking-[0.12em] text-text-muted font-medium">Derivatives · Perp</span>
              </div>

              <div className="grid grid-cols-2 gap-px bg-white/[0.04]">
                <div className="p-2.5 bg-surface-raised">
                  <p className="text-[8px] text-text-muted uppercase tracking-wider mb-1">Funding</p>
                  <p className={`text-[12px] font-mono font-semibold leading-none tabular-nums ${fundingPos ? "text-negative" : "text-positive"}`}>
                    {funding >= 0 ? "+" : ""}{funding.toFixed(4)}%
                  </p>
                  <p className="text-[7.5px] text-text-muted mt-1 leading-tight">
                    {fundingPos ? "longs pay" : "shorts pay"}{countdown ? ` · ${countdown}` : ""}
                  </p>
                </div>
                <div className="p-2.5 bg-surface-raised">
                  <p className="text-[8px] text-text-muted uppercase tracking-wider mb-1">Open interest</p>
                  <p className="text-[12px] font-mono font-bold text-text-primary leading-none">{formatOiUsd(oiUsd)}</p>
                  {oiChange24h !== null && (
                    <p className={`text-[7.5px] font-mono mt-1 leading-tight ${oiChange24h >= 0 ? "text-positive/70" : "text-negative/70"}`}>
                      {oiChange24h >= 0 ? "+" : ""}{oiChange24h.toFixed(2)}% · 24h
                    </p>
                  )}
                </div>
              </div>

              {/* L/S bar chart */}
              {lsLong !== null && lsShort !== null && (
                <div className="px-2.5 py-2.5 border-t border-white/[0.05]">
                  <p className="text-[8px] text-text-primary/40 uppercase tracking-wider mb-1.5">L/S · Top Traders</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-bold text-positive w-8 flex-shrink-0">{lsLong}%</span>
                    <div className="flex-1 flex h-2.5 rounded-sm overflow-hidden bg-white/5">
                      <div className="h-full bg-gradient-to-r from-green-500/80 to-green-400/55" style={{ width: `${lsLong}%` }} />
                      <div className="h-full bg-gradient-to-r from-red-400/55 to-red-500/80" style={{ width: `${lsShort}%` }} />
                    </div>
                    <span className="text-[12px] font-mono font-bold text-negative w-8 text-right flex-shrink-0">{lsShort}%</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[7.5px] uppercase tracking-wider text-positive/50 font-medium">Long</span>
                    <span className="text-[7.5px] uppercase tracking-wider text-negative/50 font-medium">Short</span>
                  </div>
                </div>
              )}

              {/* Links (tanpa disclaimer) */}
              <div className="px-2.5 py-1.5 border-t border-white/[0.05] bg-black/20 flex items-center gap-1.5 flex-wrap">
                {[
                  { label: "TradingView", url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal?.pair || ""}.P` },
                  { label: "Metrics", url: `/market-pulse?pair=${signal?.pair || ""}` },
                  { label: "Binance", url: `https://www.binance.com/en/futures/${signal?.pair || ""}` },
                ].map((link, i, arr) => (
                  <span key={link.label} className="flex items-center gap-1.5">
                    <a href={link.url} target={link.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                       className="text-[8px] text-text-primary/30 hover:text-text-secondary transition-colors">{link.label}</a>
                    {i < arr.length - 1 && <span className="text-text-primary/15 text-[8px]">·</span>}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── FALLBACK: live/derivatives data ke-block (geo) → saran VPN ── */}
        {!derivMetrics && liveBlocked && (
          <div className="lq-card bg-surface-raised">
                        <div className="p-3 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                <svg className="h-4 w-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
                </svg>
              </div>
              <p className="text-[11px] font-semibold text-text-primary/85">Live data unavailable</p>
              <p className="mx-auto mt-1 max-w-[250px] text-[9px] leading-relaxed text-text-primary/45">
                Derivatives data (funding, open interest, long/short) is blocked on your
                network or region. Turn on a <span className="text-text-secondary font-medium">VPN</span> and reopen
                this signal to see real-time metrics.
              </p>
            </div>
          </div>
        )}

        {/* ── META: volume / risk / cap ── */}
        {(signal?.volume_rank_num || signal?.risk_level || signal?.market_cap) && (
          <div className="lq-card bg-surface-raised p-2 space-y-1.5">
            {signal?.volume_rank_num && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-text-primary/40 uppercase tracking-wider flex items-center gap-1.5 min-w-0">{Ic.bars("w-3 h-3")} {t("modal.vol_rank")}</span>
                <span className="text-[11px] font-bold text-text-primary font-mono flex-shrink-0">
                  #{signal.volume_rank_num}<span className="text-text-primary/35 text-[9px] font-normal ml-0.5">/ {signal.volume_rank_den}</span>
                </span>
              </div>
            )}
            {signal?.risk_level && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-text-primary/40 uppercase tracking-wider min-w-0">{t("modal.risk_level")}</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 border ${
                  signal.risk_level?.toLowerCase()?.startsWith("low") ? "bg-positive/10 text-positive border-positive/15" :
                  signal.risk_level?.toLowerCase()?.startsWith("high") ? "bg-negative/10 text-negative border-negative/15" :
                  "bg-white/[0.04] text-text-secondary border-white/10"
                }`}>{signal.risk_level}</span>
              </div>
            )}
            {signal?.market_cap && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-text-primary/40 uppercase tracking-wider min-w-0">{t("modal.market_cap")}</span>
                <span className="text-[10px] text-text-primary font-medium flex-shrink-0 text-right">{signal.market_cap}</span>
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

            {/* HEADER — exchange trade ticket style */}
            <div className="z-10 flex-shrink-0 border-b border-white/[0.06] bg-surface-raised px-3 py-2.5 sm:px-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CoinLogo pair={signal?.pair} size={28} />
                  <div className="min-w-0 flex-1">
                    {/* Baris 1: Pair name + status */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h2 className="truncate font-mono text-[15px] font-semibold text-text-primary sm:text-base">
                        {signal?.pair}
                      </h2>
                      <span
                        className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusStyles[signal?.status?.toLowerCase()] || "bg-white/[0.06] text-text-muted border border-white/10"}`}
                      >
                        {signal?.status?.toUpperCase()}
                      </span>
                    </div>

                    {/* Baris 2: Coin Category Badge (dual pill + tagline) */}
<CoinCategoryBadge
  pair={signal?.pair}
  onClick={() => setShowCoinUtility(true)}
/>

{/* Baris 2b: BTC Correlation Badge + How-to-use-indicator */}
<div className="mt-1 flex items-center gap-1.5 flex-wrap">
  <BTCCorrelationBadge
    signalId={signal?.signal_id}
    onClick={() => setShowBtcCorrelation(true)}
  />
  <button
    type="button"
    onClick={() => setShowIndicatorGuide(true)}
    title="How to use indicator"
    aria-label="How to use indicator"
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wide border border-white/10 text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-colors"
  >
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3a1 1 0 0 1 1 1v15h16a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><rect x="6" y="11" width="3" height="6" rx="1"/><rect x="11" y="7" width="3" height="10" rx="1"/><rect x="16" y="9" width="3" height="8" rx="1"/></svg>
    <span><span className="sm:hidden">Guide</span><span className="hidden sm:inline">Indicator guide</span></span>
  </button>
</div>

                    {/* Baris 3: Timestamp */}
                    <p className="text-text-muted text-[10px] truncate">
                      {formatShortDateTime(signal?.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:gap-1.5 sm:flex-shrink-0">
                  {/* ═══ EXPLORE ON X (cashtag search) ═══ */}
                  <a
                    href={`https://x.com/search?q=${encodeURIComponent("$" + (signal?.pair || "").replace(/USDT$|USDC$|USD$/i, ""))}&src=typed_query&f=live`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Explore $${(signal?.pair || "").replace(/USDT$|USDC$|USD$/i, "")} on X`}
                    className="mr-0.5 inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-text-primary/80 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-text-primary sm:mr-1 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
                  >
                    <span className="hidden sm:inline text-text-muted">Explore on</span>
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="X" role="img">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  {/* ═══ TOMBOL JOURNAL (HEADER) ═══ */}
                  <button
                    onClick={() => {
                      sessionStorage.setItem(
                        "journal_prefill",
                        JSON.stringify({
                          signal_id: signal.signal_id,
                          pair: signal.pair,
                          planned_entry: signal.entry,
                          planned_tp1: signal.target1,
                          planned_tp2: signal.target2,
                          planned_tp3: signal.target3,
                          planned_tp4: signal.target4,
                          planned_sl: signal.stop1,
                        }),
                      );
                      handleCloseClick();
                      setTimeout(() => {
                        window.location.href = "/journal";
                      }, 300);
                    }}
                    className="mr-0.5 flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] font-medium text-text-primary/65 transition hover:bg-white/[0.04] hover:text-text-primary sm:mr-1 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
                    title="Journal This Trade"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Journal</span>
                  </button>
                  {/* END TOMBOL JOURNAL */}

                  <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.08]">
                    {[
                      { id: "chart", label: t("modal.chart"), icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" rx="0.5" /><rect x="13.5" y="6" width="3" height="11" rx="0.5" /></svg>
                      )},
                      { id: "trade", label: t("modal.trade"), icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10 3 14l4 4" /><path d="M3 14h13" /><path d="m17 14 4-4-4-4" /><path d="M21 10H8" /></svg>
                      )},
                      { id: "research", label: t("modal.research"), icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                      )},
                      { id: "history", label: "History", icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
                      )},
                    ].map(({ id, label, icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setActiveTab(id); onTabChange && onTabChange(id); }}
                        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-[11px] font-medium transition-colors whitespace-nowrap ${activeTab === id ? "bg-white/[0.1] text-text-primary" : "text-text-muted hover:text-text-primary hover:bg-white/[0.04]"}`}
                      >
                        {icon}
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseClick}
                    className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-md transition-colors flex-shrink-0 ml-1 sm:ml-2"
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

                  {/* INSTAGRAM (share X tweet link) — only when a tweet exists */}
                  {tweetUrl && (
                    <button
                      onClick={handleShareTweet}
                      title="Share to Instagram"
                      aria-label="Share to Instagram"
                      className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-md transition-colors ml-1"
                    >
                      {Ic.instagram("w-3.5 h-3.5")}
                    </button>
                  )}
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleShare}
                      title="Share signal"
                      aria-label="Share signal"
                      className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-md transition-colors ml-1"
                    >
                      {Ic.share("w-3.5 h-3.5")}
                    </button>
                    {shareCopied && (
                      <span className="absolute top-full right-0 mt-1.5 whitespace-nowrap px-2 py-1 rounded-md bg-surface-raised border border-white/10 text-text-primary text-[10px] font-medium shadow-lg z-20">
                        Link copied
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* TAB 1: CHART */}
              {activeTab === "chart" && (
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                  <div className="relative flex-1 min-w-0 min-h-0 bg-surface-raised">
                    {/* Floating control: toggle indikator (MACD/RSI/BB), di-remember per user */}
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
                      <button
                        onClick={toggleIndicators}
                        title={showIndicators ? "Hide indicators (MACD · RSI · BB)" : "Show indicators (MACD · RSI · BB)"}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-medium uppercase tracking-[0.1em] backdrop-blur-md transition-colors ${
                          showIndicators
                            ? "bg-surface/80 border-white/15 text-text-primary"
                            : "bg-surface/60 border-white/10 text-text-muted hover:text-text-primary"
                        }`}
                      >
                        <span className={`relative flex h-3 w-5 items-center rounded-full transition-colors ${showIndicators ? "bg-white/40" : "bg-white/15"}`}>
                          <span className={`absolute h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${showIndicators ? "translate-x-2.5" : "translate-x-0.5"}`} />
                        </span>
                        Indicators
                      </button>
                    </div>
                    <div
                      id="tv_chart_modal_main"
                      ref={chartContainerRef}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="hidden lg:block w-72 xl:w-80 flex-shrink-0 bg-surface-raised border-l border-line/20 overflow-y-auto custom-scrollbar">
                    {renderTargetsPanel("sidebar")}
                  </div>
                  <div className="lg:hidden flex-shrink-0 bg-surface-raised border-t border-line/20 overflow-y-auto custom-scrollbar mobile-targets-panel">
                    {renderTargetsPanel("bottom")}
                  </div>
                </div>
              )}

              {/* TAB 2: TRADE — symmetric proof desk */}
              {activeTab === "trade" && (
                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar bg-surface-raised">
                  <div className="max-w-6xl mx-auto space-y-5 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted flex items-center gap-2">
                        {Ic.camera("w-3.5 h-3.5")} {t("modal.trade_proof")}
                      </span>
                      <span className="font-mono text-[10px] text-text-muted/60">
                        Execution proof · signal progress
                      </span>
                    </div>

                    {!entryImg && !afterImg ? (
                      <div className="relative w-full h-[320px] sm:h-[400px] rounded-xl border border-white/[0.08] bg-surface-secondary overflow-hidden">
                        <div id="tv_chart_modal_side" className="absolute inset-0 w-full h-full" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-0 items-stretch">
                        {/* BEFORE */}
                        <div className="min-w-0 flex flex-col rounded-xl border border-white/[0.08] bg-surface-secondary/40 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06]">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                              {t("modal.before_entry")}
                            </span>
                            {entryPrice > 0 && (
                              <span className="font-mono text-[11px] tabular-nums text-text-primary/80">
                                Entry <span className="text-text-primary font-semibold">${formatPrice(entryPrice)}</span>
                              </span>
                            )}
                          </div>
                          <div className="p-2 flex-1 flex flex-col">
                            {entryImg ? (
                              <button
                                type="button"
                                onClick={() => setLightboxImg(entryImg)}
                                className="relative group h-[220px] sm:h-[280px] w-full overflow-hidden rounded-lg border border-white/[0.06] bg-[#0a0a0c] cursor-zoom-in"
                              >
                                <img
                                  src={entryImg}
                                  alt="Entry Chart"
                                  className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.01] transition-transform"
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <div className="flex h-[220px] sm:h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 text-text-muted">
                                {Ic.clock("w-5 h-5 mb-2 opacity-50")}
                                <p className="text-[11px]">Waiting for chart</p>
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!entryImg}
                                onClick={() => entryImg && setLightboxImg(entryImg)}
                                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] text-[11px] font-medium text-text-primary/80 transition hover:bg-white/[0.08] disabled:opacity-35 disabled:pointer-events-none"
                              >
                                Full size
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* CENTER RAIL */}
                        <div className="hidden md:flex flex-col items-center justify-center px-2.5 shrink-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-surface-raised text-text-muted">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="md:hidden flex items-center justify-center py-0.5">
                          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/50">↓ after</span>
                        </div>

                        {/* AFTER */}
                        <div className="min-w-0 flex flex-col rounded-xl border border-white/[0.08] bg-surface-secondary/40 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06]">
                            <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${isStopped ? "text-negative" : "text-positive"}`}>
                              {t("modal.after")} · {statusLabel}
                            </span>
                            <div className="flex items-center gap-2">
                              {showInteractiveRight && afterImg && (
                                <button
                                  type="button"
                                  onClick={() => setShowTV(false)}
                                  className="font-mono text-[9px] uppercase tracking-wide text-text-muted hover:text-text-primary"
                                >
                                  Snapshot
                                </button>
                              )}
                              {lastPrice > 0 && (
                                <span className="font-mono text-[11px] tabular-nums text-text-primary/80">
                                  Last <span className="text-text-primary font-semibold">${formatPrice(lastPrice)}</span>
                                  {lastPricePct && (
                                    <span className={`ml-1 font-semibold ${isStopped ? "text-negative" : "text-positive"}`}>
                                      {lastPricePct}%
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-2 flex-1 flex flex-col">
                            {showInteractiveRight ? (
                              <div className="relative h-[220px] sm:h-[280px] w-full overflow-hidden rounded-lg border border-white/[0.06] bg-[#0a0a0c]">
                                <div id="tv_chart_modal_side" className="absolute inset-0 h-full w-full" />
                              </div>
                            ) : afterImg ? (
                              <div className="relative h-[220px] sm:h-[280px] w-full overflow-hidden rounded-lg border border-white/[0.06] bg-[#0a0a0c]">
                                <img
                                  src={afterImg}
                                  alt="Latest Chart"
                                  className="absolute inset-0 h-full w-full object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    if (rawAfterImg && e.target.src !== rawAfterImg) {
                                      e.target.onerror = null;
                                      e.target.src = rawAfterImg;
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex h-[220px] sm:h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 text-text-muted">
                                {Ic.clock("w-5 h-5 mb-2 opacity-50")}
                                <p className="text-[11px]">Waiting for chart</p>
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-1.5">
                              {!showInteractiveRight ? (
                                <button
                                  type="button"
                                  onClick={() => setShowTV(true)}
                                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] text-[11px] font-semibold text-text-primary transition hover:bg-white/[0.12]"
                                >
                                  <svg className="h-3 w-3 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 3 3 5-6" />
                                  </svg>
                                  Live chart
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setShowTV(false)}
                                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] text-[11px] font-medium text-text-primary/80 transition hover:bg-white/[0.08]"
                                >
                                  Show snapshot
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!afterImg}
                                onClick={() => afterImg && setLightboxImg(afterImg)}
                                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] px-3 text-[11px] font-medium text-text-muted transition hover:text-text-primary disabled:opacity-35 disabled:pointer-events-none"
                              >
                                Full
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Peak Price (FULL WIDTH) */}
                    {peakPrice && entryPrice > 0 && (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-surface-raised px-4 py-3 sm:flex-row sm:gap-4">
                        <div className="flex flex-col items-center sm:items-end">
                          <span className="text-center text-[10px] font-medium uppercase tracking-wider text-text-muted sm:text-right">
                            Highest after call
                          </span>
                        </div>
                        <div className="hidden h-5 w-px bg-white/10 sm:block" />
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-base font-semibold tabular-nums text-text-primary sm:text-lg">
                            ${formatPrice(peakPrice)}
                          </span>
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[12px] font-semibold text-emerald-400">
                            {peakPricePct}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Timeline Vertical — responsive, no horizontal scroll */}
                    <div>
                      <h4 className="text-text-secondary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                        {Ic.clock("w-4 h-4")} Signal Journey
                      </h4>
                      <div className="lq-card bg-surface-raised p-4 w-full">
                        <div className="flex flex-col">
                          {timeline.map((ev, i) => {
                            const isLast = i === timeline.length - 1;
                            const nextReached = !isLast && timeline[i + 1]?.active;
                            return (
                              <div key={i} className="flex gap-3 group">
                                {/* Node + connector rail */}
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`relative z-10 w-7 h-7 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-bold ${ev.bg} ${ev.border} ${ev.color}`}
                                  >
                                    {ev.icon}
                                  </div>
                                  {!isLast && (
                                    <div
                                      className={`w-[2px] flex-1 min-h-[22px] ${nextReached ? "bg-white/25" : "bg-white/10"}`}
                                    />
                                  )}
                                </div>
                                {/* Content */}
                                <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"} pt-0.5`}>
                                  <div className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                      <span
                                        className={`text-xs font-bold uppercase tracking-wider ${ev.color}`}
                                      >
                                        {ev.label}
                                      </span>
                                      {ev.pct && (
                                        <span className={`text-[11px] font-mono ${ev.color}`}>
                                          {ev.pct}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-text-primary/60 font-mono whitespace-nowrap">
                                      {ev.detail}
                                    </span>
                                  </div>
                                  <span className="block text-[10px] text-text-muted mt-0.5">
                                    {ev.sub}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <SignalJourneyExtended signalId={signal?.signal_id} />

                    {/* Data / Exchanges Grid — CENTERED */}
                    <div>
                      <h4 className="text-text-secondary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                        {Ic.bank("w-4 h-4")} Trade on Exchanges
                      </h4>
                      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                        {/* Tombol Telegram */}
                        {signalDetail?.message_link && (
                          <a
                            href={signalDetail.message_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lq-tile flex flex-col items-center gap-1.5 p-2 w-[calc(33.333%-0.5rem)] sm:w-[calc(20%-0.75rem)] max-w-[140px] bg-gradient-to-b from-blue-500/10 to-blue-900/10 !border-blue-500/20 hover:!border-blue-500/45 hover:bg-blue-500/20 group text-text-secondary"
                          >
                            {Ic.send("w-5 h-5")}
                            <span className="text-text-secondary text-[9px] sm:text-[10px] font-bold group-hover:text-blue-300 truncate w-full text-center">
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
                            className={`lq-tile flex flex-col items-center gap-1.5 p-2 w-[calc(33.333%-0.5rem)] sm:w-[calc(20%-0.75rem)] max-w-[140px] bg-gradient-to-b ${link.color} hover:bg-white/5 group`}
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
                            <span className="text-text-primary/70 text-[9px] sm:text-[10px] font-medium group-hover:text-text-primary truncate w-full text-center">
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
                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-surface-raised">
                  <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-3 sm:mb-5">
                      <h3 className="text-base sm:text-lg font-display text-text-primary mb-1">
                        {t("modal.research_analytics")}
                      </h3>
                      <p className="text-text-muted text-xs sm:text-sm">
                        {t("modal.deep_dive")}{" "}
                        <span className="text-text-secondary font-semibold">
                          {coinSymbol}
                        </span>
                      </p>
                    </div>
                    {coinInfoLoading && (
                      <div className="lq-card p-3 sm:p-4 mb-4 sm:mb-5 animate-pulse">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-full bg-white/[0.04]" />
                          <div>
                            <div className="h-4 bg-white/[0.04] rounded w-32 mb-1" />
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
                      <div className="lq-card p-3 sm:p-4 mb-4 sm:mb-5">
                        <div className="flex items-center gap-3 mb-3">
                          {coinInfo.image_thumb && (
                            <img
                              src={coinInfo.image_thumb}
                              alt={coinInfo.name}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div>
                            <h4 className="text-text-primary font-semibold text-sm">
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
                                <p className="text-text-primary text-xs font-mono">
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
                                <p className="text-text-primary text-xs">
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
                                <p className="text-text-primary text-xs font-mono">
                                  #{coinInfo.market_data.market_cap_rank}
                                </p>
                              </div>
                            )}
                            {coinInfo.market_data.total_volume != null && (
                              <div>
                                <p className="text-text-muted text-[9px] uppercase">
                                  {t("modal.vol_24h")}
                                </p>
                                <p className="text-text-primary text-xs">
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
                                  className={`text-xs font-mono ${coinInfo.market_data.price_change_24h_pct >= 0 ? "text-positive" : "text-negative"}`}
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
                                  className={`text-xs font-mono ${coinInfo.market_data.price_change_7d_pct >= 0 ? "text-positive" : "text-negative"}`}
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
                                <p className="text-text-primary text-xs font-mono">
                                  ${coinInfo.market_data.ath.toLocaleString()}
                                </p>
                                {coinInfo.market_data.ath_change_pct !=
                                  null && (
                                  <p className="text-negative/70 text-[8px] font-mono">
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
                                <p className="text-text-primary text-xs">
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
                                className="flex items-center gap-1 text-[9px] text-text-secondary hover:text-text-secondary bg-white/[0.04] px-2 py-1 rounded-md transition-colors"
                              >
                                {Ic.globe("w-3 h-3")} {t("modal.website")}
                              </a>
                            )}
                            {coinInfo.links.twitter && (
                              <a
                                href={`https://twitter.com/${coinInfo.links.twitter}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[9px] text-text-secondary/70 hover:text-text-secondary bg-blue-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                {Ic.xLogo("w-3 h-3")} @{coinInfo.links.twitter}
                              </a>
                            )}
                            {coinInfo.links.telegram && (
                              <a
                                href={`https://t.me/${coinInfo.links.telegram}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[9px] text-cyan-400/70 hover:text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                {Ic.send("w-3 h-3")} Telegram
                              </a>
                            )}
                            {coinInfo.links.subreddit && (
                              <a
                                href={coinInfo.links.subreddit}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[9px] text-orange-400/70 hover:text-orange-400 bg-orange-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                {Ic.chat("w-3 h-3")} Reddit
                              </a>
                            )}
                            {coinInfo.links.github && (
                              <a
                                href={coinInfo.links.github}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[9px] text-gray-400/70 hover:text-gray-400 bg-gray-500/10 px-2 py-1 rounded-md transition-colors"
                              >
                                {Ic.code("w-3 h-3")} GitHub
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {!coinInfo && !coinInfoLoading && (
                      <div className="lq-card p-3 sm:p-4 mb-4 sm:mb-5 text-center">
                        <p className="text-text-muted text-xs">
                          {t("modal.no_info")}{" "}
                          <span className="text-text-secondary font-mono">
                            {coinSymbol}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* === AI PROMPT GENERATOR SECTION === */}
                    <div className="mb-4 sm:mb-5">
                      <div className="lq-card bg-gradient-to-br from-surface-secondary to-surface-secondary">
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-line/10 bg-white/[0.03]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-text-secondary">
                              {Ic.cpu("w-3.5 h-3.5")}
                            </div>
                            <div>
                              <h4 className="text-text-secondary text-xs sm:text-sm font-semibold">
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all duration-300 ${
                              promptCopied
                                ? "bg-positive/20 text-positive border border-positive/30"
                                : "bg-white/[0.06] text-text-secondary border border-white/10 hover:bg-white/[0.08] hover:text-text-secondary active:scale-95"
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
                        <div className="px-3 sm:px-4 py-2 border-t border-line/10 bg-white/[0.02]">
                          <p className="text-[9px] sm:text-[10px] text-text-muted flex items-center gap-1.5">
                            <svg
                              className="w-3 h-3 text-text-muted flex-shrink-0"
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
                      <p className="text-text-secondary text-xs font-semibold mb-2.5 sm:mb-3 flex items-center gap-1.5">
                        {Ic.link("w-3.5 h-3.5")} {t("modal.research_links")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {researchLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-r ${link.color} rounded-md transition-all group border active:scale-95`}
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
                            <span className="text-[10px] sm:text-[11px] font-medium text-text-primary/80 group-hover:text-text-primary whitespace-nowrap">
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

      {/* Deep Analysis Overlay */}
      <DeepAnalysis
        signalId={signal?.signal_id}
        enrichment={signalDetail?.enrichment}
        isOpen={showDeepAnalysis}
        onClose={() => setShowDeepAnalysis(false)}
        pair={signal?.pair}
      />

      {/* === NEW: Coin Utility Detail Modal === */}
      <CoinUtilityModal
        pair={signal?.pair}
        isOpen={showCoinUtility}
        onClose={() => setShowCoinUtility(false)}
      />

      {/* === BTC Correlation Modal === */}
<IndicatorGuideModal
  isOpen={showIndicatorGuide}
  onClose={() => setShowIndicatorGuide(false)}
/>

<BTCCorrelationModal
  signalId={signal?.signal_id}
  pair={signal?.pair}
  isOpen={showBtcCorrelation}
  onClose={() => setShowBtcCorrelation(false)}
/>

      {/* FULLSCREEN LIGHTBOX - OVERLAY GAMBAR */}
      {lightboxImg && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          style={{ zIndex: 300000 }}
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt="Fullscreen Chart"
            className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-text-primary bg-white/10 hover:bg-white/20 p-2 sm:p-3 rounded-full transition-colors backdrop-blur-sm"
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

      {/* === STYLES — token-driven, timeless (Binance/TV density, no gold glows) === */}
      <style>{`
        .lq-card {
          position: relative;
          border-radius: 10px;
          border: 1px solid rgb(var(--fg) / 0.08);
          background: rgb(var(--surface-raised));
          overflow: hidden;
          transition: border-color .2s ease, background-color .2s ease;
        }
        .lq-card:hover { border-color: rgb(var(--fg) / 0.12); }

        .lq-tile {
          border-radius: 8px;
          border: 1px solid rgb(var(--fg) / 0.07);
          background: rgb(var(--fg) / 0.02);
          transition: border-color .15s ease, background-color .15s ease;
        }
        .lq-tile:hover { border-color: rgb(var(--fg) / 0.12); background: rgb(var(--fg) / 0.035); }

        .lq-btn-primary, .lq-btn-gold {
          background: rgb(var(--fg) / 0.92);
          color: rgb(var(--surface));
          border: none;
          transition: opacity .15s ease, transform .12s ease;
        }
        .lq-btn-primary:hover, .lq-btn-gold:hover { opacity: 0.92; }
        .lq-btn-primary:active, .lq-btn-gold:active { transform: scale(0.98); }

        .signal-modal-overlay {
          position: fixed; inset: 0; z-index: 200000;
          display: flex; align-items: flex-end; justify-content: center;
          isolation: isolate;
        }
        .signal-modal-backdrop {
          position: absolute; inset: 0;
          background: rgb(0 0 0 / 0.72);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .signal-modal-container {
          position: relative; z-index: 1; width: 100%; height: 100%;
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0; pointer-events: none;
        }
        .signal-modal-container > * { pointer-events: auto; }
        .signal-modal-content {
          position: relative; width: 100%;
          max-width: min(1280px, 100%);
          height: min(94dvh, 100%); max-height: 94dvh;
          background: rgb(var(--surface));
          border: none; border-top: 1px solid rgb(var(--fg) / 0.08);
          border-radius: 16px 16px 0 0;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 -12px 40px rgb(0 0 0 / 0.45);
          color: rgb(var(--fg));
        }

        @media (min-width: 640px) {
          .signal-modal-overlay { align-items: center; }
          .signal-modal-container { align-items: center; padding: 16px; }
          .signal-modal-content {
            height: min(90dvh, 900px);
            max-height: min(90dvh, 900px);
            border-radius: 14px;
            border: 1px solid rgb(var(--fg) / 0.08);
            box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
          }
        }
        @media (min-width: 1024px) {
          .signal-modal-container { padding: 20px; }
          .signal-modal-content { max-width: 1280px; height: min(88dvh, 860px); }
        }
        @media (min-width: 1440px) {
          .signal-modal-content { max-width: 1360px; }
        }
        @supports (height: 100dvh) { .signal-modal-overlay { height: 100dvh; } }

        .mobile-targets-panel {
          max-height: min(42vh, 360px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .signal-modal-backdrop { animation: smBI .22s ease-out; }
        .signal-modal-content { animation: smSheetUp .3s cubic-bezier(.16,1,.3,1); }
        .signal-modal-closing .signal-modal-backdrop { animation: smBO .18s ease-in forwards; }
        .signal-modal-closing .signal-modal-content { animation: smSheetDn .2s ease-in forwards; }
        @keyframes smBI { from{opacity:0} to{opacity:1} }
        @keyframes smBO { from{opacity:1} to{opacity:0} }
        @keyframes smCI { from{opacity:0;transform:scale(.98) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes smCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.98)} }
        @keyframes smSheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes smSheetDn { from{transform:translateY(0)} to{transform:translateY(100%)} }
        @media (min-width: 640px) {
          .signal-modal-content { animation: smCI .28s cubic-bezier(.16,1,.3,1); }
          .signal-modal-closing .signal-modal-content { animation: smCO .18s ease-in forwards; }
        }
        @media (prefers-reduced-motion: reduce) {
          .signal-modal-backdrop, .signal-modal-content,
          .signal-modal-closing .signal-modal-backdrop,
          .signal-modal-closing .signal-modal-content { animation: none; }
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgb(var(--fg) / 0.14); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(var(--fg) / 0.22); }

        #tv_chart_modal_main, #tv_chart_modal_side,
        .tradingview-widget-container,
        .tradingview-widget-container__widget,
        #tv_chart_modal_main iframe, #tv_chart_modal_side iframe {
          background: rgb(var(--surface-raised)) !important;
        }
        .tradingview-widget-copyright { display: none !important; }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default SignalModal;