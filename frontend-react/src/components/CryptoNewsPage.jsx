// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News Feed v3
// Grid layout, pagination, detail modal with article extract
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_BASE = "/api/v1";
const PAGE_SIZE = 24;

// ════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
};

const getDomainColor = (domain) => {
  const colors = {
    "tradingview.com": "#2962FF", "cointelegraph.com": "#2563eb",
    "coindesk.com": "#6366f1", "decrypt.co": "#10b981",
    "bitcoinworld.co.in": "#f59e0b", "bitcoinmagazine.com": "#ef4444",
    "theblock.co": "#8b5cf6", "cryptoslate.com": "#06b6d4",
    "newsbtc.com": "#F7931A", "beincrypto.com": "#22c55e",
    "cryptobriefing.com": "#3b82f6", "coinpedia.org": "#14b8a6",
    "u.today": "#f97316",
  };
  if (!domain) return "#d4a24e";
  const key = Object.keys(colors).find((d) => domain.includes(d));
  return key ? colors[key] : "#d4a24e";
};

const DOMAIN_FALLBACKS = {
  "tradingview.com": { image: "/api/v1/news-images/tradingview_logo.png" },
};

const getDomainFallbackImage = (domain) => {
  if (!domain) return null;
  const key = Object.keys(DOMAIN_FALLBACKS).find((d) => domain.includes(d));
  return key ? DOMAIN_FALLBACKS[key].image : null;
};

const shortDomain = (domain) => {
  if (!domain) return "";
  return domain.replace(".com", "").replace(".co.in", "").replace(".co", "").replace(".org", "");
};

const getImageSrc = (item) => {
  if (item.image_url && item.image_url !== "webpage_photo") return item.image_url;
  return getDomainFallbackImage(item.domain);
};

// ════════════════════════════════════════════
// Sub Components
// ════════════════════════════════════════════

const DomainBadge = ({ domain, size = "sm" }) => {
  if (!domain) return null;
  const color = getDomainColor(domain);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${size === "lg" ? "text-[10px]" : "text-[9px]"}`} style={{ background: `${color}20`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {shortDomain(domain)}
    </span>
  );
};

const FilterPill = ({ label, active, onClick, count }) => (
  <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 ${active ? "bg-gold-primary/20 text-gold-primary border border-gold-primary/40" : "bg-white/[0.03] text-text-muted border border-white/5 hover:text-white hover:border-white/15"}`}>
    {label}
    {count !== undefined && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${active ? "bg-gold-primary/30 text-gold-primary" : "bg-white/5 text-text-muted"}`}>{count}</span>}
  </button>
);

const LoadingSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse">
        <div className="h-36 bg-white/5" />
        <div className="p-3 space-y-2"><div className="h-4 bg-white/5 rounded w-3/4" /><div className="h-3 bg-white/5 rounded w-1/2" /></div>
      </div>
    ))}
  </div>
);

// ════════════════════════════════════════════
// News Detail Modal
// ════════════════════════════════════════════

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  // Fetch extract on mount
  useEffect(() => {
    if (!item?.id) return;
    setLoading(true);
    fetch(`${API_BASE}/crypto-news-feed/extract/${item.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setExtract(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item?.id]);

  // Close with animation
  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!item) return null;

  const imgSrc = extract?.top_image || getImageSrc(item);
  const summary = extract?.summary || item.description || null;
  const fullText = extract?.full_text || item.raw_text || null;
  const keywords = extract?.keywords || [];
  const authors = extract?.authors || [];
  const isPhoto = item.content_type === "photo";
  const color = getDomainColor(item.domain);

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${closing ? "news-modal-out" : "news-modal-in"}`} onClick={handleClose}>
      <style>{`
        .news-modal-in { background: rgba(0,0,0,0); backdrop-filter: blur(0px); animation: nmOverlayIn .3s ease forwards; }
        .news-modal-out { animation: nmOverlayOut .2s ease forwards; }
        .news-modal-out .nm-card { animation: nmCardOut .2s ease forwards; }
        @keyframes nmOverlayIn { to { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); } }
        @keyframes nmOverlayOut { from { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); } to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); } }
        .nm-card { animation: nmCardIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes nmCardIn { from { opacity: 0; transform: scale(.95) translateY(16px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes nmCardOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.95) translateY(16px); } }
        .nm-scroll::-webkit-scrollbar { width: 4px; }
        .nm-scroll::-webkit-scrollbar-track { background: transparent; }
        .nm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      <div className="nm-card relative w-full max-w-2xl max-h-[90vh] bg-[#0c0a0f] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px z-10" style={{ background: `linear-gradient(to right, transparent, ${color}40, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <DomainBadge domain={item.domain} size="lg" />
            {isPhoto && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400">PHOTO</span>}
            <span className="text-text-muted text-[10px]">{timeAgo(item.created_at)}</span>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-text-muted hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="nm-scroll overflow-y-auto flex-1">
          {/* Image */}
          {imgSrc && (
            <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-black/30">
              <img src={imgSrc} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = "none"; }} />
            </div>
          )}

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Title */}
            <h2 className="text-white text-lg sm:text-xl font-bold leading-snug">{item.title}</h2>

            {/* Authors */}
            {authors.length > 0 && (
              <p className="text-text-muted text-[11px]">By {authors.join(", ")}</p>
            )}

            {/* Summary */}
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-white/5 rounded w-full" />
                <div className="h-3 bg-white/5 rounded w-5/6" />
                <div className="h-3 bg-white/5 rounded w-4/6" />
              </div>
            ) : summary ? (
              <div className="space-y-2">
                <h3 className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-4 rounded-full" style={{ background: color }} />
                  Summary
                </h3>
                <p className="text-text-secondary text-[13px] leading-relaxed">{summary}</p>
              </div>
            ) : null}

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] border border-white/5 text-text-muted">#{kw}</span>
                ))}
              </div>
            )}

            {/* Full text preview */}
            {fullText && fullText !== summary && (
              <div className="space-y-2">
                <h3 className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-4 rounded-full" style={{ background: color }} />
                  Article Preview
                </h3>
                <p className="text-text-muted text-[12px] leading-relaxed line-clamp-[8] whitespace-pre-line">
                  {fullText.slice(0, 800)}{fullText.length > 800 ? "..." : ""}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer — CTA */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-white/5 flex-shrink-0">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background: `${color}20`, color }}>
              Read Full Article
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          ) : (
            <div className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm text-text-muted bg-white/[0.03]">No external link</div>
          )}
          <button onClick={handleClose} className="px-4 py-2.5 rounded-xl text-sm text-text-muted bg-white/[0.03] border border-white/5 hover:text-white hover:border-white/15 transition-all">Close</button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// News Card
// ════════════════════════════════════════════

const NewsCard = ({ item, featured = false, onSelect }) => {
  const imgSrc = getImageSrc(item);
  const isPhoto = item.content_type === "photo";
  const isHeadline = item.content_type === "headline";

  // Featured large card
  if (featured) {
    return (
      <div onClick={() => onSelect(item)} className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/25 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,.3)]">
        <div className="relative h-48 sm:h-56 overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center"><span className="text-4xl opacity-10">{isPhoto ? "📷" : "📰"}</span></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute top-3 left-3"><DomainBadge domain={item.domain} /></div>
          {isPhoto && <div className="absolute top-3 right-3"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/30 text-purple-300">PHOTO</span></div>}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-white font-semibold text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors">{item.title}</h3>
          </div>
        </div>
        <div className="px-4 py-2.5 flex items-center gap-2">
          {item.description && <p className="text-text-muted text-[11px] line-clamp-1 flex-1">{item.description}</p>}
          <span className="text-text-muted text-[10px] whitespace-nowrap">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    );
  }

  // Headline (no image)
  if (isHeadline && !imgSrc) {
    return (
      <div onClick={() => onSelect(item)} className="group cursor-pointer p-3 rounded-xl bg-white/[0.015] border border-white/5 hover:border-gold-primary/20 transition-all duration-300 border-l-2 border-l-gold-primary/40">
        <h4 className="text-white text-[12px] font-semibold line-clamp-2 leading-snug group-hover:text-gold-primary transition-colors">{item.title}</h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gold-primary/10 text-gold-primary/80"><span className="w-1.5 h-1.5 rounded-full bg-gold-primary/60" />Headline</span>
          <span className="text-text-muted text-[10px]">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    );
  }

  // Grid card
  return (
    <div onClick={() => onSelect(item)} className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/25 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,.25)] flex flex-col">
      <div className="relative h-36 overflow-hidden flex-shrink-0">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { e.target.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center"><span className="text-3xl opacity-10">{isPhoto ? "📷" : "📰"}</span></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute top-2 left-2"><DomainBadge domain={item.domain} /></div>
        {isPhoto && <div className="absolute top-2 right-2"><span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-500/30 text-purple-300">PHOTO</span></div>}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="text-white text-[12px] font-semibold line-clamp-2 leading-snug group-hover:text-gold-primary transition-colors flex-1">{item.title}</h4>
        <div className="flex items-center justify-between mt-2">
          <span className="text-text-muted text-[10px]">{timeAgo(item.created_at)}</span>
          <span className="text-gold-primary/50 text-[10px] group-hover:text-gold-primary transition-colors">Details →</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// Pagination
// ════════════════════════════════════════════

const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  const getPages = () => {
    const p = [];
    const s = Math.max(1, page - 2), e = Math.min(totalPages, page + 2);
    if (s > 1) { p.push(1); if (s > 2) p.push("..."); }
    for (let i = s; i <= e; i++) p.push(i);
    if (e < totalPages) { if (e < totalPages - 1) p.push("..."); p.push(totalPages); }
    return p;
  };
  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-all">← Prev</button>
      {getPages().map((p, i) => p === "..." ? <span key={`d${i}`} className="text-text-muted text-[11px] px-1">…</span> : (
        <button key={p} onClick={() => onChange(p)} className={`w-8 h-8 rounded-lg text-[11px] font-medium transition-all ${p === page ? "bg-gold-primary/20 text-gold-primary border border-gold-primary/40" : "bg-white/[0.03] border border-white/5 text-text-muted hover:text-white"}`}>{p}</button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-all">Next →</button>
    </div>
  );
};

// ════════════════════════════════════════════
// Trending Sidebar
// ════════════════════════════════════════════

const TrendingSidebar = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 6) || [];
  const maxDC = topDomains.length > 0 ? topDomains[0].count : 1;
  return (
    <div className="space-y-4">
      {trending?.trending?.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">Trending Now</h3>
          <div className="flex flex-wrap gap-1.5">
            {trending.trending.slice(0, 12).map((t, i) => (
              <button key={t.topic} onClick={() => onSearchTopic(t.topic)} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:scale-105 ${i < 3 ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/25" : "bg-white/[0.04] text-text-muted border border-white/5 hover:text-white"}`}>
                {i < 3 && <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold-primary/20 text-gold-primary text-[8px] font-bold mr-1">{i + 1}</span>}
                {t.topic}<span className="text-[8px] opacity-50 ml-1">×{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {topDomains.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">Top Sources</h3>
          <div className="space-y-2">
            {topDomains.map(d => (
              <div key={d.domain} className="space-y-1">
                <div className="flex justify-between items-center"><span className="text-[11px] text-text-secondary truncate">{d.domain}</span><span className="text-[10px] text-text-muted font-mono">{d.count}</span></div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(d.count / maxDC) * 100}%`, background: getDomainColor(d.domain), opacity: 0.6 }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {stats && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">Activity</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-[11px]"><span className="text-text-muted">Last hour</span><span className="text-white font-bold">{stats.last_hour} articles</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-text-muted">Last 6 hours</span><span className="text-white font-bold">{stats.last_6h} articles</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-text-muted">3-day total</span><span className="text-white font-bold">{stats.total} articles</span></div>
          </div>
          {stats.hourly?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">24h Activity</p>
              <div className="flex items-end gap-0.5 h-8">
                {stats.hourly.slice().reverse().slice(0, 24).map((h, i) => {
                  const max = Math.max(...stats.hourly.map(x => x.count), 1);
                  return <div key={i} className="flex-1 rounded-t bg-gold-primary/30 hover:bg-gold-primary/60 transition-colors" style={{ height: `${Math.max((h.count / max) * 100, 4)}%` }} title={`${h.count} articles`} />;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

const CryptoNewsPage = () => {
  const [allItems, setAllItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);

  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimeout = useRef(null);

  const fetchFeed = useCallback(async (pg = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (pg - 1) * PAGE_SIZE });
      if (activeFilter !== "all") params.set("content_type", activeFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`${API_BASE}/crypto-news-feed/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) { console.error("News feed error:", err); }
    finally { setLoading(false); }
  }, [activeFilter, searchQuery]);

  const fetchMeta = useCallback(async () => {
    try {
      const [sR, tR] = await Promise.all([fetch(`${API_BASE}/crypto-news-feed/stats`), fetch(`${API_BASE}/crypto-news-feed/trending`)]);
      if (sR.ok) setStats(await sR.json());
      if (tR.ok) setTrending(await tR.json());
    } catch (err) { console.error("News meta error:", err); }
  }, []);

  useEffect(() => {
    fetchFeed(page); fetchMeta();
    const iv = setInterval(() => { fetchFeed(page); fetchMeta(); }, 60000);
    return () => clearInterval(iv);
  }, [activeFilter, searchQuery, page]);

  const handleSearchInput = (val) => {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setSearchQuery(val); setPage(1); }, 400);
  };
  const handleSearchTopic = (topic) => { setSearchInput(topic); setSearchQuery(topic); setPage(1); };
  const handleFilterChange = (filter) => { setActiveFilter(filter); setPage(1); };
  const handlePageChange = (p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const featuredItems = useMemo(() => {
    if (page !== 1 || activeFilter !== "all" || searchQuery) return [];
    return allItems.filter(i => i.content_type === "article" && i.description && i.image_url && i.image_url !== "webpage_photo").slice(0, 2);
  }, [allItems, page, activeFilter, searchQuery]);

  const gridItems = useMemo(() => {
    const fIds = new Set(featuredItems.map(f => f.id));
    return allItems.filter(i => !fIds.has(i.id));
  }, [allItems, featuredItems]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Modal */}
      {selectedItem && <NewsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">Crypto News</h1>
          <p className="text-text-muted text-xs sm:text-sm mt-0.5">Real-time crypto news aggregator — 3 day rolling window</p>
        </div>
        {stats && (
          <div className="flex flex-wrap gap-2">
            {[{ i: "📰", l: "Total", v: stats.total }, { i: "🔗", l: "Articles", v: stats.articles }, { i: "📷", l: "Photos", v: stats.photos }, { i: "⏰", l: "1h", v: stats.last_hour }].map(s => (
              <div key={s.l} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-sm">{s.i}</span><span className="text-[11px] text-text-muted">{s.l}</span><span className="text-[11px] text-white font-bold">{s.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" value={searchInput} onChange={e => handleSearchInput(e.target.value)} placeholder="Search news..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 focus:ring-1 focus:ring-gold-primary/20 transition-all" />
          {searchInput && <button onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterPill label="All" active={activeFilter === "all"} onClick={() => handleFilterChange("all")} count={stats?.total} />
          <FilterPill label="Articles" active={activeFilter === "article"} onClick={() => handleFilterChange("article")} count={stats?.articles} />
          <FilterPill label="Photos" active={activeFilter === "photo"} onClick={() => handleFilterChange("photo")} count={stats?.photos} />
          <FilterPill label="Headlines" active={activeFilter === "headline"} onClick={() => handleFilterChange("headline")} count={stats?.headlines} />
        </div>
      </div>

      {/* Main */}
      {loading ? <LoadingSkeleton /> : allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4"><span className="text-2xl opacity-30">📰</span></div>
          <p className="text-text-muted text-sm">{searchQuery ? `No news found for "${searchQuery}"` : "No news available yet"}</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
          <div className="flex-1 min-w-0 space-y-4">
            {featuredItems.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {featuredItems.map(item => <NewsCard key={item.id} item={item} featured onSelect={setSelectedItem} />)}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {gridItems.map(item => <NewsCard key={item.id} item={item} onSelect={setSelectedItem} />)}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-20"><TrendingSidebar trending={trending} stats={stats} onSearchTopic={handleSearchTopic} /></div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-text-muted text-[10px]">Auto-refresh every 60s — Page {page} of {totalPages || 1}</span>
      </div>
    </div>
  );
};

export default CryptoNewsPage;