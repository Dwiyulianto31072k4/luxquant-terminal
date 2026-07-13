// src/components/SectorCoinsModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Sector → Coins drill-down modal
// Klik satu baris "Sector Rotation" → daftar SEMUA koin dalam naratif itu
// (CoinGecko category), diurut market cap. Koin yang di-call LuxQuant
// ditandai badge "Call" dan bisa diklik buka SignalModal.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import Modal from "./ui/Modal";
import moneyFlowApi from "../services/moneyFlowApi";

const fmtUSD = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const pctColor = (v) =>
  v === null || v === undefined ? "text-text-muted"
  : Number(v) > 0 ? "text-emerald-400"
  : Number(v) < 0 ? "text-red-400" : "text-white/70";

const Spinner = ({ className = "" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
  </svg>
);

export default function SectorCoinsModal({ sector, isOpen, onClose, onOpenSignal, loadingSym }) {
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "market_cap", dir: "desc" });

  const categoryId = sector?.category_id;

  useEffect(() => {
    if (!isOpen || !categoryId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    setQ("");
    setSort({ key: "market_cap", dir: "desc" });
    moneyFlowApi
      .getSectorCoins(categoryId, { limit: 100 })
      .then((d) => { if (alive) setCoins(d?.coins || []); })
      .catch(() => { if (alive) setErr("Gagal memuat koin untuk naratif ini"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isOpen, categoryId]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const rows = useMemo(() => {
    let r = coins;
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter(
        (c) => (c.symbol || "").toUpperCase().includes(s) || (c.name || "").toUpperCase().includes(s)
      );
    }
    const val = (x, k) => {
      switch (k) {
        case "symbol": return (x.symbol || "￿");
        case "price_change_24h": return x.price_change_24h ?? -Infinity;
        case "market_cap": return x.market_cap ?? -Infinity;
        default: return 0;
      }
    };
    return [...r].sort((a, b) => {
      const va = val(a, sort.key), vb = val(b, sort.key);
      const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [coins, q, sort]);

  const luxCount = coins.filter((c) => c.is_luxquant_signal).length;

  const SortBtn = ({ label, k, className = "" }) => {
    const active = sort.key === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
          active ? "text-gold-primary" : "text-white/35 hover:text-white/60"
        } ${className}`}
      >
        {label}
        <span className="text-[7px]">{active ? (sort.dir === "desc" ? "▼" : "▲") : "⇅"}</span>
      </button>
    );
  };

  const header = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex -space-x-1.5 shrink-0">
        {(sector?.top_3_coins || []).slice(0, 3).map((url, k) => (
          <img key={k} src={url} alt="" className="w-6 h-6 rounded-full border border-[#0a0805] bg-white/5" onError={(e) => (e.target.style.display = "none")} />
        ))}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-gold-primary/80">Naratif · Coins</p>
        <h2 className="text-base sm:text-lg font-semibold text-white truncate">{sector?.name || "Sector"}</h2>
      </div>
      {sector?.mcap_change_24h != null && (
        <span className={`ml-auto shrink-0 font-mono text-sm tabular-nums font-semibold ${pctColor(sector.mcap_change_24h)}`}>
          {fmtPct(sector.mcap_change_24h)}
        </span>
      )}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" placement="bottom" padded={false} header={header}>
      {/* Toolbar: search + count */}
      <div className="sticky top-0 z-10 bg-[#0a0805] flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-white/[0.06]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari koin…"
          className="flex-1 min-w-0 pl-3 pr-3 py-1.5 bg-[#120c08] border border-white/[0.08] rounded-md text-white placeholder-white/30 font-mono text-[12px] focus:border-gold-primary/40 focus:outline-none"
        />
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/70">
          {coins.length} coin{luxCount ? ` · ${luxCount} call` : ""}
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1.6rem_1fr_5rem_6rem] sm:grid-cols-[2rem_1fr_6rem_7rem] gap-2 px-4 sm:px-5 py-2 border-b border-white/[0.06]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">#</span>
        <SortBtn label="Coin" k="symbol" />
        <SortBtn label="24h" k="price_change_24h" className="justify-self-end flex-row-reverse" />
        <SortBtn label="Mcap" k="market_cap" className="justify-self-end flex-row-reverse" />
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-16 text-center font-mono text-[12px] text-white/40">Memuat koin…</div>
      ) : err ? (
        <div className="py-16 text-center font-mono text-[12px] text-red-400/70">{err}</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center font-mono text-[12px] text-white/40">
          {q ? `Tidak ada koin cocok "${q}".` : "Tidak ada koin untuk naratif ini."}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {rows.map((c, i) => {
            const called = c.is_luxquant_signal;
            const clickable = called && !!onOpenSignal;
            const isLoading = loadingSym === c.symbol;
            return (
              <div
                key={c.coin_id || c.symbol}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onOpenSignal(c) : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenSignal(c); } } : undefined}
                className={`grid grid-cols-[1.6rem_1fr_5rem_6rem] sm:grid-cols-[2rem_1fr_6rem_7rem] gap-2 items-center px-4 sm:px-5 py-2.5 transition-colors ${
                  called ? "border-l-2 border-gold-primary/50" : "border-l-2 border-transparent"
                } ${clickable ? "cursor-pointer hover:bg-gold-primary/[0.06]" : "hover:bg-white/[0.02]"}`}
              >
                <span className="font-mono text-[11px] tabular-nums text-text-muted/40">
                  {c.market_cap_rank || i + 1}
                </span>
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.image ? (
                    <img src={c.image} alt="" className="w-6 h-6 rounded-full bg-white/5 flex-shrink-0" onError={(e) => (e.target.style.display = "none")} />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-white/5 flex-shrink-0" />
                  )}
                  <span className={`text-sm font-semibold truncate ${called ? "text-gold-primary" : "text-white"}`}>
                    {c.symbol}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-text-muted/60 truncate">{c.name}</span>
                  {called && (
                    <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary border border-gold-primary/30">
                      Call
                    </span>
                  )}
                  {clickable && (
                    isLoading ? (
                      <Spinner className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/70" />
                    ) : (
                      <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    )
                  )}
                </div>
                <span className={`font-mono text-[13px] tabular-nums text-right font-semibold ${pctColor(c.price_change_24h)}`}>
                  {fmtPct(c.price_change_24h)}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-right text-text-muted whitespace-nowrap">
                  {fmtUSD(c.market_cap)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-4 sm:px-5 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted/40 border-t border-white/[0.05]">
        Semua koin dalam naratif · <span className="text-gold-primary/70">Call</span> = ada signal LuxQuant, klik buat buka · Data: CoinGecko
      </p>
    </Modal>
  );
}
