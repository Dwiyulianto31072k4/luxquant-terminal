// src/components/ShariahCheckModal.jsx
// ════════════════════════════════════════════════════════════════
// ShariahCheckModal — detail hasil screening syariah untuk satu pair.
//
// Dibuka dari tombol "Shariah Check" di SignalModal. Shell-nya memakai
// <Modal> primitive, pola yang sama dengan CoinUtilityModal.
//
// ATURAN YANG TIDAK BOLEH DILANGGAR DI KOMPONEN INI:
//   1. Status tidak pernah berdiri sendiri. Setiap kali status tampil, ia
//      harus ditemani "dari mana" (basis_label) dan "kenapa" (summary).
//   2. Disclaimer selalu terlihat — bukan di balik accordion, bukan teks
//      abu-abu 9px di pojok.
//   3. `halal` yang sumbernya cuma pihak luar TIDAK boleh ditulis seolah
//      penilaian kami. Saat ini 199 dari 199 halal berasal dari Sharlife.
//   4. `unrated` bukan kolom kosong — ia membawa sebabnya, dan penegasan
//      bahwa itu bukan berarti halal maupun haram.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { Z } from "../constants/zIndex";
import CoinLogo from "./CoinLogo";

// ── Ikon ─────────────────────────────────────────────────────────
const IC = {
  check: "M20 6L9 17l-5-5",
  warn: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  x: "M18 6L6 18M6 6l12 12",
  question: "M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01",
  info: "M12 16v-4M12 8h.01",
  link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  quote: "M3 21c3 0 7-1 7-8V5a2 2 0 00-2-2H4a2 2 0 00-2 2v6a2 2 0 002 2h3",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

function Icon({ d, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// ── Tampilan per status ──────────────────────────────────────────
// Labels deliberately avoid a bare "Halal"/"Haram" headline. What we do is
// screening, not issuing rulings — the label reflects that, and the detail
// below it does the explaining.
export const SHARIAH_META = {
  halal: {
    label: "Passed screening",
    short: "Passed",
    dot: "bg-profit",
    tone: "border-profit/30 bg-profit/10 text-profit",
    icon: IC.check,
  },
  mashbooh: {
    label: "Disputed",
    short: "Grey",
    dot: "bg-accent",
    tone: "border-accent/30 bg-accent/10 text-accent",
    icon: IC.warn,
  },
  haram: {
    label: "Problematic findings",
    short: "Flagged",
    dot: "bg-negative",
    tone: "border-negative/30 bg-negative/10 text-negative",
    icon: IC.x,
  },
  unrated: {
    label: "Not yet assessed",
    short: "Unrated",
    dot: "bg-text-muted",
    tone: "border-ink/15 bg-ink/5 text-text-muted",
    icon: IC.question,
  },
  not_applicable: {
    label: "Out of scope",
    short: "N/A",
    dot: "bg-text-muted",
    tone: "border-ink/15 bg-ink/5 text-text-muted",
    icon: IC.info,
  },
};

const CRITERION_LABEL = {
  utility: "Benefit / underlying (sil'ah requirement)",
  sil_ah: "Sil'ah requirement",
  business: "Project business activity",
  riba: "Riba",
  gharar: "Gharar / maysir",
  ribawi: "Ribawi backing (sarf rules)",
  ribawi_backing: "Ribawi backing (sarf rules)",
  staking: "Staking / consensus mechanism",
  legitimacy: "Legitimacy & transparency",
};

const VERDICT_TONE = {
  pass: "text-profit",
  warn: "text-accent",
  fail: "text-negative",
  haram: "text-negative",
  mashbooh: "text-accent",
  halal: "text-profit",
};

const SOURCE_LABEL = {
  sharlife: "Sharlife (registered with SC Malaysia)",
  cryptoummah: "CryptoUmmah",
  crypto_halal: "Crypto Halal",
  crypto_islam: "Crypto Islam",
  pif: "Practical Islamic Finance",
};

// Cache antar-buka supaya modal tidak berkedip saat dibuka ulang.
const cache = new Map();

export default function ShariahCheckModal({
  pair,
  isOpen,
  onClose,
  prefetchedData,
  zIndex = Z.nestedModal,
}) {
  const [coin, setCoin] = useState(prefetchedData || cache.get(pair) || null);
  const [loading, setLoading] = useState(!prefetchedData && !cache.get(pair));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !pair) return;
    if (prefetchedData) {
      setCoin(prefetchedData);
      setLoading(false);
      return;
    }
    if (cache.has(pair)) {
      setCoin(cache.get(pair));
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/coins/${pair}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        cache.set(pair, d);
        setCoin(d);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isOpen, pair, prefetchedData]);

  const s = coin?.shariah || null;
  const meta = SHARIAH_META[s?.status] || SHARIAH_META.unrated;

  // Halal yang seluruhnya bersandar pada pihak luar harus dinyatakan begitu.
  const externalOnly = s?.basis_engine === "external_source";

  const header = (
    <div className="flex min-w-0 items-center gap-2.5">
      <CoinLogo pair={pair} size={30} />
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold text-text-primary sm:text-base">
          Shariah Check — {coin?.base_symbol || pair}
        </h2>
        <p className="truncate text-[10px] text-text-muted">
          Screening result, not a fatwa
        </p>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" padded={false} header={header} zIndex={zIndex}>
      <div className="px-3 py-4 sm:px-5 sm:py-5">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 rounded-xl bg-ink/5" />
            <div className="h-32 rounded-xl bg-ink/5" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 p-4 text-center">
            <p className="text-sm text-negative">Failed to load: {error}</p>
          </div>
        )}

        {!loading && !error && !s && (
          <div className="rounded-lg border border-ink/12 bg-ink/5 p-6 text-center">
            <p className="text-sm text-text-primary">Shariah screening is not available for this pair yet.</p>
          </div>
        )}

        {!loading && s && (
          <div className="space-y-3 sm:space-y-4">
            {/* ── STATUS + DARI MANA + KENAPA ─────────────────────── */}
            <div className={`rounded-xl border p-3 sm:p-4 ${meta.tone}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 bg-current/10 px-2.5 py-1 text-xs font-bold">
                  <Icon d={meta.icon} className="h-3.5 w-3.5" />
                  <span>{meta.label}</span>
                </span>
                {s.confidence > 0 && (
                  <span className="rounded-lg border border-ink/10 bg-ink/5 px-2 py-1 text-[10px] font-semibold text-text-muted">
                    {s.confidence}% confidence
                  </span>
                )}
                {!s.reviewed && (
                  <span className="rounded-lg border border-ink/10 bg-ink/5 px-2 py-1 text-[10px] font-semibold text-text-muted">
                    Not yet human-reviewed
                  </span>
                )}
              </div>

              {/* Ini bagian yang menjawab "sumbernya dari ... alasannya ..." */}
              {s.basis_label && (
                <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Basis of assessment
                </p>
              )}
              {s.basis_label && (
                <p className="text-xs text-text-primary/90">
                  {s.basis_label}
                  {s.basis_model && (
                    <span className="text-text-muted"> · model {s.basis_model}</span>
                  )}
                </p>
              )}

              {(s.summary || s.unrated_reason) && (
                <>
                  <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Reason
                  </p>
                  <p className="text-xs leading-relaxed text-text-primary/90">
                    {s.summary || s.unrated_reason}
                  </p>
                </>
              )}
            </div>

            {/* Halal yang murni dari pihak luar — jangan diklaim sebagai milik kami */}
            {externalOnly && (
              <div className="rounded-lg border border-ink/12 bg-ink/5 p-3">
                <p className="text-xs leading-relaxed text-text-primary/80">
                  <strong className="text-text-primary">This is not LuxQuant&apos;s own assessment.</strong>{" "}
                  Our internal screening found nothing on this asset, so the status above follows
                  an external source. Open the link below to read their own reasoning.
                </p>
              </div>
            )}

            {/* ── IDENTITAS BERMASALAH ────────────────────────────── */}
            {s.identity_status === "mismatch" && s.identity_note && (
              <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-accent">
                  <Icon d={IC.warn} className="h-3.5 w-3.5" />
                  Reference data does not match
                </p>
                <p className="text-xs leading-relaxed text-text-primary/80">{s.identity_note}</p>
              </div>
            )}

            {/* ── KRITERIA + KUTIPAN BUKTINYA ─────────────────────── */}
            {s.criteria?.length > 0 && (
              <div className="rounded-xl border border-ink/12 bg-surface-secondary p-3 sm:p-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Findings by criterion
                </p>
                <div className="space-y-3">
                  {s.criteria.map((c) => (
                    <div key={c.key} className="border-l-2 border-ink/12 pl-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs font-semibold text-text-primary">
                          {CRITERION_LABEL[c.key] || c.key}
                        </span>
                        {c.verdict && (
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              VERDICT_TONE[c.verdict] || "text-text-muted"
                            }`}
                          >
                            {c.verdict}
                          </span>
                        )}
                      </div>
                      {c.reason && (
                        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{c.reason}</p>
                      )}
                      {c.evidence && (
                        <p className="mt-1.5 flex gap-1.5 rounded-md bg-ink/5 p-2 text-[11px] italic leading-relaxed text-text-muted">
                          <Icon d={IC.quote} className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                          <span className="min-w-0 break-words">{c.evidence}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-text-muted">
                  Every finding above is quoted directly from the project&apos;s official description
                  or its official categories. If we cannot point to evidence, we do not rate that criterion.
                </p>
              </div>
            )}

            {/* ── SUMBER EKSTERNAL ────────────────────────────────── */}
            {s.sources?.length > 0 && (
              <div className="rounded-xl border border-ink/12 bg-surface-secondary p-3 sm:p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  External references
                </p>
                <div className="space-y-1.5">
                  {s.sources.map((src) => (
                    <a
                      key={src.name}
                      href={src.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-ink/5 px-2.5 py-2 transition-colors hover:border-ink/20"
                    >
                      <span className="min-w-0 truncate text-xs text-text-primary">
                        {SOURCE_LABEL[src.name] || src.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold ${
                            VERDICT_TONE[src.status] || "text-text-muted"
                          }`}
                        >
                          {SHARIAH_META[src.status]?.short || src.status}
                        </span>
                        <Icon d={IC.link} className="h-3 w-3 text-text-muted" />
                      </span>
                    </a>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
                  We link their assessment as-is. The detailed analysis is theirs — open the link
                  to read it at the original source.
                </p>
              </div>
            )}

            {/* ── DISCLAIMER: selalu terlihat, tidak disembunyikan ─── */}
            {s.disclaimer && (
              <div className="rounded-xl border border-ink/15 bg-ink/5 p-3 sm:p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <Icon d={IC.shield} className="h-3.5 w-3.5" />
                  Before you decide
                </p>
                <p className="text-xs leading-relaxed text-text-muted">{s.disclaimer}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
