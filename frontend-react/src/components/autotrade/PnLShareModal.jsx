// src/components/autotrade/PnLShareModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell pakai <Modal>. KARTU PnL (cardRef, yang di-
// screenshot) TIDAK diubah — itu aset share. Yang distandarisasi:
// shell + tombol (Download = GoldButton, Copy = GhostButton).
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { getOrderPnLCard } from "../../services/autotradeApi";
import Modal from "../ui/Modal";
import { GoldButton, GhostButton } from "./AutoTradeUI";
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

function generateQRDataUrl(url, size = 80) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=0&qzone=1`;
}

export default function PnLShareModal({ order, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [copyState, setCopyState] = useState("idle");
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

  if (!order) return null;

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
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, logging: false, useCORS: true, allowTaint: true });
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
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, logging: false, useCORS: true, allowTaint: true });
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
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
    <Modal isOpen={isOpen} onClose={onClose} size="sm" accent={false}>
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-10">
          <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-gold-primary/20 border-t-gold-primary" />
          <p className="font-semibold text-text-primary">Fetching live data…</p>
          <p className="mt-1 text-xs text-text-muted">Querying {order.exchange_id.toUpperCase()} API</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div>
          <p className="mb-2 font-semibold text-rose-400">Failed to load PnL data</p>
          <p className="mb-4 text-xs text-text-muted">{error}</p>
          <GhostButton onClick={onClose} className="w-full">Close</GhostButton>
        </div>
      )}

      {/* Card + actions */}
      {data && !loading && (
        <div>
          {/* ░░░ KARTU — JANGAN DIUBAH (aset screenshot) ░░░ */}
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-2xl"
            style={{
              background: "linear-gradient(145deg, #0b0908 0%, #1a1410 50%, #0b0908 100%)",
              border: "1px solid rgba(212,168,83,0.3)",
              padding: "28px 24px",
              minHeight: "480px",
            }}
          >
            <div className="pointer-events-none absolute left-0 top-0 h-32 w-32 rounded-full opacity-30 blur-3xl" style={{ background: roeColor }} />
            <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-40 rounded-full opacity-20 blur-3xl" style={{ background: "#d4a853" }} />

            <div className="relative mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black" style={{ background: "linear-gradient(135deg, #d4a853, #8b6914)", color: "#0a0506" }}>LQ</div>
                <div>
                  <p className="font-display text-sm font-bold leading-none text-text-primary">LuxQuant</p>
                  <p className="mt-0.5 text-[9px] text-gold-primary">AutoTrade</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {exchangeLogo && <img src={exchangeLogo} alt={data.exchange_id} crossOrigin="anonymous" className="h-6 w-6 rounded" style={{ objectFit: "contain" }} />}
                <span className="text-[11px] font-bold uppercase text-text-primary">{data.exchange_id}</span>
                {data.live_verified && (
                  <span className="ml-1 rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "rgba(14,203,129,0.2)", color: "#0ecb81", border: "1px solid rgba(14,203,129,0.3)" }}>● LIVE</span>
                )}
              </div>
            </div>

            <div className="relative mb-5 flex items-center gap-3">
              <CoinLogo pair={data.pair} size={48} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl font-bold leading-none text-text-primary">{data.pair}</h3>
                  <span className="rounded px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${sideColor}20`, color: sideColor, border: `1px solid ${sideColor}60` }}>{sideLabel}</span>
                  {data.market_type === "futures" && (
                    <span className="rounded px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.3)" }}>{data.leverage}x · {data.margin_mode === "cross" ? "CROSS" : "ISOLATED"}</span>
                  )}
                  {data.market_type === "spot" && (
                    <span className="rounded px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.3)" }}>SPOT</span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mb-4 py-4 text-center">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-text-muted">{data.market_type === "futures" ? "ROI (ROE)" : "PnL"}</p>
              <p className="font-display font-black leading-none" style={{ color: roeColor, fontSize: "52px", textShadow: `0 0 30px ${roeColor}60` }}>{fmtPct(data.market_type === "futures" ? data.roe_pct : data.pnl_pct)}</p>
              <p className="mt-2 font-display text-lg font-bold" style={{ color: pnlColor }}>{fmtUsd(data.unrealized_pnl)}</p>
            </div>

            <div className="relative mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[9px] uppercase tracking-wider text-text-muted">Entry Price</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{fmtPrice(data.entry_price)}</p>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[9px] uppercase tracking-wider text-text-muted">Mark Price</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{fmtPrice(data.mark_price)}</p>
              </div>
            </div>

            <div className="relative mt-4 flex items-center justify-between pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <p className="mb-1 text-[9px] uppercase tracking-widest text-text-muted">Start auto-trading at</p>
                <p className="font-display text-sm font-bold text-text-primary">luxquant.tw</p>
                <p className="mt-0.5 text-[9px] text-gold-primary">{new Date(data.generated_at).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-white p-1.5" style={{ width: 64, height: 64 }}>
                <img src={qrUrl} alt="QR" crossOrigin="anonymous" width={52} height={52} style={{ width: 52, height: 52 }} />
              </div>
            </div>
          </div>
          {/* ░░░ END KARTU ░░░ */}

          {/* Action buttons (di luar screenshot) */}
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <GoldButton onClick={handleDownload} disabled={downloadLoading} className="flex items-center justify-center gap-2">
                {downloadLoading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download
                  </>
                )}
              </GoldButton>

              <GhostButton onClick={handleCopy} disabled={copyState === "copying"} className="flex items-center justify-center gap-2">
                {copyState === "copying" ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Copying…
                  </>
                ) : copyState === "copied" ? (
                  <>
                    <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied
                  </>
                ) : copyState === "fail" ? (
                  <span className="text-rose-400">Failed</span>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    Copy
                  </>
                )}
              </GhostButton>
            </div>

            {deeplinkUrl && (
              <a
                href={deeplinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md border border-white/5 px-4 py-2.5 text-center text-xs font-semibold text-text-muted transition hover:bg-white/5 hover:text-text-primary"
              >
                <svg className="-mt-0.5 mr-1.5 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Verify on {data.exchange_id.toUpperCase()} →
              </a>
            )}

            <p className="px-2 text-center text-[10px] leading-relaxed text-text-muted">
              Card generated from live {data.exchange_id.toUpperCase()} API data via your own API key. Click "Verify" to cross-check on {data.exchange_id.toUpperCase()} directly.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
