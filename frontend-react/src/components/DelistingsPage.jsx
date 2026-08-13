// src/components/DelistingsPage.jsx
// Exchange Delisting Alerts — per-token, sortable/filterable, full-width,
// pagination, responsive (mobile prioritises coin · exchange · announced · peak),
// + shortcut to open the matching LuxQuant call.
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import delistingApi from "../services/delistingApi";
import CoinLogo from "./CoinLogo";
import AssistantWidget from "./assistant/AssistantWidget";
import { PageHeader } from "./ui/PageHeader";

// Top-10 global CEX (by volume) — always shown as tabs with local logos.
// Logos live in /public/exchanges/*.png (served as /exchanges/*).
const EX_META = {
  binance: { label: "Binance", domain: "binance.com", color: "#F0B90B", logo: "/exchanges/binance.png" },
  bybit: { label: "Bybit", domain: "bybit.com", color: "#F7A600", logo: "/exchanges/bybit.png" },
  okx: { label: "OKX", domain: "okx.com", color: "#dfe1e6", logo: "/exchanges/okx.png" },
  bitget: { label: "Bitget", domain: "bitget.com", color: "#00F0FF", logo: "/exchanges/bitget.png" },
  gate: { label: "Gate", domain: "gate.io", color: "#17E6A1", logo: "/exchanges/gate.png" },
  kucoin: { label: "KuCoin", domain: "kucoin.com", color: "#23AF91", logo: "/exchanges/kucoin.png" },
  mexc: { label: "MEXC", domain: "mexc.com", color: "#6B9BFF", logo: "/exchanges/mexc.png" },
  htx: { label: "HTX", domain: "htx.com", color: "#2EBD85", logo: "/exchanges/htx.png" },
  coinbase: { label: "Coinbase", domain: "coinbase.com", color: "#0052FF", logo: "/exchanges/coinbase.png" },
  bingx: { label: "BingX", domain: "bingx.com", color: "#2B6CFF", logo: "/exchanges/bingx.png" },
  // bonus (worker can still populate; tab appears when data exists)
  upbit: { label: "Upbit", domain: "upbit.com", color: "#0938B4", logo: "/exchanges/upbit.png" },
};
const TOP_EXCHANGES = [
  "binance",
  "bybit",
  "okx",
  "bitget",
  "gate",
  "kucoin",
  "mexc",
  "htx",
  "coinbase",
  "bingx",
];
const exLogo = (ex) =>
  EX_META[ex]?.logo ||
  (EX_META[ex]?.domain
    ? `https://www.google.com/s2/favicons?domain=${EX_META[ex].domain}&sz=64`
    : null);

const timeAgo = (iso) => {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
    : "—";
const fmtPrice = (p) => {
  if (p == null) return "—";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 1) return p.toFixed(6);
  return p < 100 ? p.toFixed(4) : p.toFixed(2);
};

const PAGE_SIZE = 15;

export default function DelistingsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], exchanges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "delist_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [exOpen, setExOpen] = useState(false);
  const exMenuRef = useRef(null);

  const exchangeOptions = useMemo(
    () => [
      "all",
      ...TOP_EXCHANGES,
      ...((data.exchanges || []).filter((e) => !TOP_EXCHANGES.includes(e))),
    ],
    [data.exchanges]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    delistingApi
      .list({ limit: 200 })
      .then((d) => {
        if (alive) {
          setData(d || { rows: [], exchanges: [] });
          setErr(null);
        }
      })
      .catch(() => {
        if (alive) setErr("Failed to load delistings");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, q, sort]);

  // Close exchange dropdown on outside click / Escape
  useEffect(() => {
    if (!exOpen) return;
    const onDoc = (e) => {
      if (exMenuRef.current && !exMenuRef.current.contains(e.target)) setExOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setExOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [exOpen]);

  const openCall = (e, id) => {
    e.stopPropagation();
    if (id) navigate(`/signals?signal=${id}`);
  };

  const rows = useMemo(() => {
    let r = (data.rows || []).filter((x) => x.token); // hanya baris token; buang announcement-only
    if (tab !== "all") r = r.filter((x) => x.exchange === tab);
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter((x) => (x.token || "").includes(s) || (x.title || "").toUpperCase().includes(s));
    }
    const val = (x, k) => {
      switch (k) {
        case "token":
          return x.token || "￿";
        case "announced_at":
          return x.announced_at ? new Date(x.announced_at).getTime() : -Infinity;
        case "delist_at":
          return x.delist_at ? new Date(x.delist_at).getTime() : -Infinity;
        case "current_pct":
          return x.current_pct ?? -Infinity;
        case "peak_pct":
          return x.peak_pct ?? -Infinity;
        default:
          return 0;
      }
    };
    return [...r].sort((a, b) => {
      const va = val(a, sort.key),
        vb = val(b, sort.key);
      const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, tab, q, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
    );
  const SortHead = ({ label, k, align = "right", className = "" }) => (
    <th className={`py-2.5 px-3 ${align === "left" ? "text-left" : "text-right"} ${className}`}>
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${sort.key === k ? "text-accent" : "text-text-primary/35 hover:text-text-primary/60"} ${align === "left" ? "" : "flex-row-reverse"}`}
      >
        {label}
        <span className="text-[7px]">
          {sort.key === k ? (sort.dir === "desc" ? "▼" : "▲") : "⇅"}
        </span>
      </button>
    </th>
  );

  const CallBtn = ({ x, compact }) =>
    x.call_signal_id ? (
      <button
        onClick={(e) => openCall(e, x.call_signal_id)}
        title={
          x.call_after_announce
            ? "LuxQuant called this after the delisting — open call"
            : "Open LuxQuant call"
        }
        className={`inline-flex items-center gap-1 rounded-md border font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 transition-all ${x.call_after_announce ? "bg-accent border-ink/15 text-accent hover:bg-accent/25" : "bg-ink/[0.04] border-ink/12 text-text-primary/60 hover:text-text-primary"} ${compact ? "" : ""}`}
      >
        ⚡ Call
      </button>
    ) : null;

  return (
    <div className="w-full px-4 lg:px-8 py-6">
      {/* Header — deskripsi di bawah judul */}
      <div className="mb-5 max-w-3xl">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
          Terminal · Alerts
        </span>
        <PageHeader title="Exchange Delistings" />
        <p className="text-[12px] text-text-primary/50 leading-relaxed mt-2">
          Live delisting announcements from the top 10 CEXs (Binance, Bybit, OKX, Bitget, Gate,
          KuCoin, MEXC, HTX, Coinbase, BingX).{" "}
          <span className="text-accent/85 font-medium">Peak %</span> is the highest move a token
          made since the notice — the delist "relief pump" — not just the current price.
        </p>
      </div>

      {/* Exchange dropdown + search — no cramped tab strip on mobile */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative shrink-0 sm:w-52" ref={exMenuRef}>
          <button
            type="button"
            onClick={() => setExOpen((o) => !o)}
            aria-expanded={exOpen}
            aria-haspopup="listbox"
            className={`flex w-full items-center gap-2 rounded-xl border bg-surface-raised px-3 py-2.5 text-left transition-colors ${
              exOpen
                ? "border-accent/30 ring-1 ring-accent/20"
                : "border-ink/[0.08] hover:border-ink/15"
            }`}
          >
            {tab !== "all" && exLogo(tab) ? (
              <img
                src={exLogo(tab)}
                alt=""
                width={18}
                height={18}
                className="rounded-sm object-contain bg-ink/[0.04] shrink-0"
                onError={(e) => {
                  const d = EX_META[tab]?.domain;
                  if (d && !e.currentTarget.dataset.fb) {
                    e.currentTarget.dataset.fb = "1";
                    e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
                  }
                }}
              />
            ) : (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm bg-ink/[0.06] text-[9px] font-mono text-text-muted">
                ∅
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
              {tab === "all" ? "All exchanges" : EX_META[tab]?.label || tab}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`shrink-0 text-text-muted transition-transform ${exOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {exOpen && (
            <div
              role="listbox"
              className="absolute left-0 right-0 z-40 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-ink/[0.1] bg-surface-raised py-1 shadow-xl shadow-black/40 sm:right-auto sm:w-56"
            >
              {exchangeOptions.map((ex) => {
                const active = tab === ex;
                const label = ex === "all" ? "All exchanges" : EX_META[ex]?.label || ex;
                const logo = ex !== "all" ? exLogo(ex) : null;
                return (
                  <button
                    key={ex}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setTab(ex);
                      setExOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors ${
                      active
                        ? "bg-accent/12 text-text-primary"
                        : "text-text-secondary hover:bg-ink/[0.04] hover:text-text-primary"
                    }`}
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt=""
                        width={18}
                        height={18}
                        className="rounded-sm object-contain bg-ink/[0.04] shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          const d = EX_META[ex]?.domain;
                          if (d && !e.currentTarget.dataset.fb) {
                            e.currentTarget.dataset.fb = "1";
                            e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
                          }
                        }}
                      />
                    ) : (
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm bg-ink/[0.06] text-[9px] font-mono text-text-muted">
                        ∅
                      </span>
                    )}
                    <span className="flex-1 font-medium">{label}</span>
                    {active && (
                      <span className="text-[11px] font-mono text-accent">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs sm:ml-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search token…"
            className="w-full rounded-xl border border-ink/[0.08] bg-surface py-2.5 pl-3 pr-3 font-mono text-[12px] text-text-primary placeholder-ink/30 focus:border-ink/15 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center font-mono text-[12px] text-text-primary/40">
          Loading delistings…
        </div>
      ) : err ? (
        <div className="py-20 text-center font-mono text-[12px] text-loss/70">{err}</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center font-mono text-[12px] text-text-primary/40">
          {tab === "all"
            ? "No delistings found."
            : `No recent delistings from ${EX_META[tab]?.label || tab} yet.`}
        </div>
      ) : (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink/[0.08]">
                <SortHead label="Token" k="token" align="left" />
                <th className="py-2.5 px-3 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35">
                  Exchange
                </th>
                <th className="hidden md:table-cell py-2.5 px-3 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35">
                  Announce Px
                </th>
                <SortHead label="Since" k="current_pct" className="hidden lg:table-cell" />
                <SortHead label="Peak %" k="peak_pct" />
                <SortHead label="Announced" k="announced_at" />
                <SortHead label="Delist" k="delist_at" className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((x, i) => {
                const ex = EX_META[x.exchange] || {
                  label: x.exchange,
                  domain: "",
                  color: "rgb(var(--accent-text))",
                  logo: null,
                };
                const logo = ex.logo || (ex.domain ? `https://www.google.com/s2/favicons?domain=${ex.domain}&sz=64` : null);
                return (
                  <tr
                    key={`${x.id}-${x.token || i}`}
                    onClick={() => x.url && window.open(x.url, "_blank", "noopener")}
                    className={`border-b border-ink/[0.05] transition-colors ${x.url ? "hover:bg-ink/[0.03] cursor-pointer" : ""}`}
                  >
                    {/* Token */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <CoinLogo pair={`${x.token}USDT`} size={22} />
                        <span
                          className="font-mono text-[13px] font-semibold text-text-primary"
                          title={x.title}
                        >
                          {x.token}
                        </span>
                        <CallBtn x={x} />
                      </div>
                    </td>
                    {/* Exchange — local logo always, name from sm */}
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5">
                        {logo && (
                          <img
                            src={logo}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-sm flex-shrink-0 object-contain bg-ink/[0.04]"
                            loading="lazy"
                            onError={(e) => {
                              if (ex.domain && !e.currentTarget.dataset.fb) {
                                e.currentTarget.dataset.fb = "1";
                                e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${ex.domain}&sz=64`;
                              }
                            }}
                          />
                        )}
                        <span
                          className="hidden sm:inline font-mono text-[11px]"
                          style={{ color: ex.color }}
                        >
                          {ex.label}
                        </span>
                      </span>
                    </td>
                    {/* Announce px */}
                    <td className="hidden md:table-cell py-2.5 px-3 text-right font-mono text-[11px] tabular-nums text-text-primary/60">
                      {fmtPrice(x.price_at_announce)}
                    </td>
                    {/* Since announce */}
                    <td className="hidden lg:table-cell py-2.5 px-3 text-right font-mono text-[12px] tabular-nums font-medium">
                      {x.current_pct == null ? (
                        <span className="text-text-primary/25">—</span>
                      ) : (
                        <span className={x.current_pct >= 0 ? "text-profit" : "text-loss"}>
                          {x.current_pct >= 0 ? "+" : ""}
                          {x.current_pct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    {/* Peak % */}
                    <td className="py-2.5 px-3 text-right">
                      {x.peak_pct == null ? (
                        <span
                          className="text-text-primary/25 font-mono text-[12px]"
                          title="No live USDT spot market for this token"
                        >
                          —
                        </span>
                      ) : (
                        <span
                          className={`font-mono text-[13px] tabular-nums font-bold ${x.peak_pct >= 20 ? "text-accent" : x.peak_pct >= 0 ? "text-profit" : "text-loss"}`}
                        >
                          {x.peak_pct >= 0 ? "+" : ""}
                          {x.peak_pct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    {/* Announced */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-mono text-[11px] text-text-primary/70">
                          {fmtDate(x.announced_at)}
                        </span>
                        <span className="font-mono text-[9px] text-text-primary/35">
                          {timeAgo(x.announced_at)}
                        </span>
                      </div>
                    </td>
                    {/* Delist */}
                    <td className="hidden md:table-cell py-2.5 px-3 text-right whitespace-nowrap font-mono text-[11px] text-text-primary/60">
                      {fmtDate(x.delist_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer: legend + pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <span className="font-mono text-[9px] text-text-primary/30 leading-relaxed">
              <span className="text-text-primary/45">—</span> = price/peak unavailable (no live USDT
              spot market). <span className="text-text-muted">⚡ Call</span> = open LuxQuant's call
              for this token.
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-[10px] text-text-primary/40">
                  {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} of{" "}
                  {rows.length}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={curPage <= 1}
                  className="px-2.5 py-1 rounded-md border border-ink/10 font-mono text-[10px] uppercase tracking-wider text-text-primary/70 hover:text-text-primary hover:border-ink/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Prev
                </button>
                <span className="font-mono text-[10px] tabular-nums text-text-primary/60 px-1">
                  {curPage}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={curPage >= totalPages}
                  className="px-2.5 py-1 rounded-md border border-ink/10 font-mono text-[10px] uppercase tracking-wider text-text-primary/70 hover:text-text-primary hover:border-ink/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="delistings" />
    </div>
  );
}
