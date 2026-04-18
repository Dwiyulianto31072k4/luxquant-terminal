// src/components/autotrade/PnLShareModal.jsx
import { useState, useEffect, useRef } from "react";
import { getOrderPnLCard } from "../../services/autotradeApi";
import CoinLogo from "../CoinLogo";

const EXCHANGE_LOGOS = {
  binance: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  bybit: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png",
  okx: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png",
  bitget: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png",
  mexc: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png",
};

const EXCHANGE_DEEPLINKS = {
  binance: {
    futures: (pair) => `https://www.binance.com/en/futures/${pair}`,
    spot: (pair) => `https://www.binance.com/en/trade/${pair.replace("USDT", "_USDT")}`,
  },
  bybit: {
    futures: (pair) => `https://www.bybit.com/trade/usdt/${pair}`,
    spot: (pair) => `https://www.bybit.com/en/trade/spot/${pair.replace("USDT", "/USDT")}`,
  },
  okx: {
    futures: (pair) => `https://www.okx.com/trade-swap/${pair.toLowerCase().replace("usdt", "-usdt-swap")}`,
    spot: (pair) => `https://www.okx.com/trade-spot/${pair.toLowerCase().replace("usdt", "-usdt")}`,
  },
  bitget: {
    futures: (pair) => `https://www.bitget.com/futures/usdt/${pair}`,
    spot: (pair) => `https://www.bitget.com/spot/${pair}`,
  },
  mexc: {
    futures: (pair) => `https://www.mexc.com/exchange/${pair.replace("USDT", "_USDT")}?type=linear_swap`,
    spot: (pair) => `https://www.mexc.com/exchange/${pair.replace("USDT", "_USDT")}`,
  },
};

function fmtUsd(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}$${abs.toFixed(2)}`;
  return `${v < 0 ? "-" : ""}$${abs.toFixed(4)}`;
}

function fmtPrice(n) {
  if (!n) return "-";
  const v = Number(n);
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

function fmtPct(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// Load html2canvas dynamically (not bundled in main app)
async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.html2canvas;
}

// Generate QR code SVG data URL
function generateQRDataUrl(url, size = 80) {
  // Use free public QR API (server-side render)
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=0&qzone=1`;
}

export default function PnLShareModal({ order, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [copyState, setCopyState] = useState("idle"); // idle | copying | copied | fail
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !order) return;
    setLoading(true);
    setError("");
    setData(null);

    getOrderPnLCard(order.id)
      .then((d) => setData(d))
      .catch((e) => setError(e.message || "Failed to fetch live data"))
      .finally(() => setLoading(false));
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  const isLong = data?.side === "buy" || data?.side === "long";
  const sideColor = isLong ? "#0ecb81" : "#f6465d";
  const sideLabel = isLong ? "LONG" : "SHORT";

  const roeColor = (data?.roe_pct || 0) >= 0 ? "#0ecb81" : "#f6465d";
  const pnlColor = (data?.unrealized_pnl || 0) >= 0 ? "#0ecb81" : "#f6465d";

  const exchangeLogo = EXCHANGE_LOGOS[data?.exchange_id] || null;
  const deeplinks = EXCHANGE_DEEPLINKS[data?.exchange_id];
  const deeplinkFn = deeplinks?.[data?.market_type];
  const deeplinkUrl = deeplinkFn ? deeplinkFn(data?.pair) : null;

  const referralUrl = data?.referral_url || "https://luxquant.tw";
  const qrUrl = generateQRDataUrl(referralUrl, 120);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloadLoading(true);
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2, // 2x for retina
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      const link = document.createElement("a");
      link.download = `luxquant-pnl-${data?.pair || "card"}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("Failed to generate image: " + e.message);
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;
    setCopyState("copying");
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopyState("copied");
          setTimeout(() => setCopyState("idle"), 2000);
        } catch (e) {
          console.error(e);
          setCopyState("fail");
          setTimeout(() => setCopyState("idle"), 2000);
        }
      });
    } catch (e) {
      console.error(e);
      setCopyState("fail");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center bg-bg-card border border-white/10 text-white hover:bg-white/10 transition z-10 shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Loading state */}
        {loading && (
          <div className="bg-bg-card border border-white/10 rounded-2xl p-12 flex flex-col items-center">
            <div className="w-10 h-10 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mb-3" />
            <p className="text-white font-semibold">Fetching live data…</p>
            <p className="text-xs text-text-muted mt-1">Querying {order.exchange_id.toUpperCase()} API</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-bg-card border border-red-500/30 rounded-2xl p-8">
            <p className="text-red-400 font-semibold mb-2">Failed to load PnL data</p>
            <p className="text-xs text-text-muted mb-4">{error}</p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 text-white text-sm font-semibold"
            >
              Close
            </button>
          </div>
        )}

        {/* Card + actions */}
        {data && !loading && (
          <div>
            {/* THE CARD (what gets screenshotted) */}
            <div
              ref={cardRef}
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(145deg, #0b0908 0%, #1a1410 50%, #0b0908 100%)",
                border: "1px solid rgba(212,168,83,0.3)",
                padding: "28px 24px",
                minHeight: "480px",
              }}
            >
              {/* Decorative corner accents */}
              <div
                className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none"
                style={{ background: roeColor }}
              />
              <div
                className="absolute bottom-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: "#d4a853" }}
              />

              {/* Header — LuxQuant branding + exchange */}
              <div className="relative flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                    style={{
                      background: "linear-gradient(135deg, #d4a853, #8b6914)",
                      color: "#0a0506",
                    }}
                  >
                    LQ
                  </div>
                  <div>
                    <p className="text-white font-display font-bold text-sm leading-none">LuxQuant</p>
                    <p className="text-[9px] text-gold-primary mt-0.5">AutoTrade</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {exchangeLogo && (
                    <img
                      src={exchangeLogo}
                      alt={data.exchange_id}
                      crossOrigin="anonymous"
                      className="w-6 h-6 rounded"
                      style={{ objectFit: "contain" }}
                    />
                  )}
                  <span className="text-[11px] text-white font-bold uppercase">{data.exchange_id}</span>
                  {data.live_verified && (
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded ml-1"
                      style={{ background: "rgba(14,203,129,0.2)", color: "#0ecb81", border: "1px solid rgba(14,203,129,0.3)" }}
                    >
                      ● LIVE
                    </span>
                  )}
                </div>
              </div>

              {/* Pair + side */}
              <div className="relative flex items-center gap-3 mb-5">
                <CoinLogo pair={data.pair} size={48} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-display font-bold text-xl leading-none">{data.pair}</h3>
                    <span
                      className="text-[10px] font-black uppercase px-2 py-0.5 rounded"
                      style={{ background: `${sideColor}20`, color: sideColor, border: `1px solid ${sideColor}60` }}
                    >
                      {sideLabel}
                    </span>
                    {data.market_type === "futures" && (
                      <span
                        className="text-[10px] font-black uppercase px-2 py-0.5 rounded"
                        style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.3)" }}
                      >
                        {data.leverage}x · {data.margin_mode === "cross" ? "CROSS" : "ISOLATED"}
                      </span>
                    )}
                    {data.market_type === "spot" && (
                      <span
                        className="text-[10px] font-black uppercase px-2 py-0.5 rounded"
                        style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.3)" }}
                      >
                        SPOT
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* BIG ROE% display */}
              <div className="relative text-center py-4 mb-4">
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">
                  {data.market_type === "futures" ? "ROI (ROE)" : "PnL"}
                </p>
                <p
                  className="font-display font-black leading-none"
                  style={{
                    color: roeColor,
                    fontSize: "52px",
                    textShadow: `0 0 30px ${roeColor}60`,
                  }}
                >
                  {fmtPct(data.market_type === "futures" ? data.roe_pct : data.pnl_pct)}
                </p>
                <p className="text-lg font-display font-bold mt-2" style={{ color: pnlColor }}>
                  {fmtUsd(data.unrealized_pnl)}
                </p>
              </div>

              {/* Price details grid */}
              <div className="relative grid grid-cols-2 gap-2 mb-4">
                <div
                  className="rounded-lg p-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <p className="text-[9px] text-text-muted uppercase tracking-wider">Entry Price</p>
                  <p className="text-white font-mono text-sm font-semibold mt-0.5">{fmtPrice(data.entry_price)}</p>
                </div>
                <div
                  className="rounded-lg p-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <p className="text-[9px] text-text-muted uppercase tracking-wider">Mark Price</p>
                  <p className="text-white font-mono text-sm font-semibold mt-0.5">{fmtPrice(data.mark_price)}</p>
                </div>
              </div>

              {/* Footer — QR + referral */}
              <div
                className="relative flex items-center justify-between mt-4 pt-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div>
                  <p className="text-[9px] text-text-muted uppercase tracking-widest mb-1">
                    Start auto-trading at
                  </p>
                  <p className="text-white font-display font-bold text-sm">luxquant.tw</p>
                  <p className="text-[9px] text-gold-primary mt-0.5">
                    {new Date(data.generated_at).toLocaleString()}
                  </p>
                </div>
                <div
                  className="p-1.5 rounded-lg bg-white"
                  style={{ width: 64, height: 64 }}
                >
                  <img
                    src={qrUrl}
                    alt="QR"
                    crossOrigin="anonymous"
                    width={52}
                    height={52}
                    style={{ width: 52, height: 52 }}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons (not included in screenshot) */}
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownload}
                  disabled={downloadLoading}
                  className="px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-40 transition flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(to right, #d4a853, #b8891f)",
                    color: "#0a0506",
                    boxShadow: "0 4px 16px rgba(212,168,83,0.25)",
                  }}
                >
                  {downloadLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download PNG
                    </>
                  )}
                </button>
                <button
                  onClick={handleCopy}
                  disabled={copyState === "copying"}
                  className="px-4 py-3 rounded-xl font-bold text-sm border border-white/10 text-white hover:bg-white/5 transition flex items-center justify-center gap-2"
                >
                  {copyState === "copying" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Copying…
                    </>
                  ) : copyState === "copied" ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Copied
                    </>
                  ) : copyState === "fail" ? (
                    <span className="text-red-400">Failed</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                      </svg>
                      Copy Image
                    </>
                  )}
                </button>
              </div>

              {/* Verify button */}
              {deeplinkUrl && (
                <a
                  href={deeplinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-4 py-2.5 rounded-xl text-center text-xs font-semibold text-text-muted hover:text-white hover:bg-white/5 transition border border-white/5"
                >
                  <svg className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Verify on {data.exchange_id.toUpperCase()} →
                </a>
              )}

              {/* Trust note */}
              <p className="text-[10px] text-center text-text-muted leading-relaxed px-2">
                Card generated from live {data.exchange_id.toUpperCase()} API data via your own API key.{" "}
                Click "Verify" above to cross-check on {data.exchange_id.toUpperCase()} directly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
