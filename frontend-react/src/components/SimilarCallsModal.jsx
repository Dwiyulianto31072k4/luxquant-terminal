// "Calls that look like this one" — the setup, not the coin.
//
// The History tab already answers "what has this PAIR done before". This
// answers the other question a desk asks: this shape of setup, wherever it
// showed up, how did it go. So the same pair is excluded by default — it would
// only repeat what the tab beside it already says.
//
// Similarity is an IDF-weighted overlap of the `important` tags, computed
// server-side. The weighting is the whole point and is measured, not assumed:
// every call carries ~33 tags and ~10 important ones, but PATTERN_CONFLICTING
// sits on 99.94% of the book and FRESH_BREAKOUT on 80%. Counting shared tags
// flat would rank by how ordinary a call is. See the endpoint's docstring.
//
// It reports; it does not forecast. The rate below is over the RESOLVED
// neighbours only, with the count next to it, because an open call has not
// failed and a thin sample should read as thin.
import { useCallback, useEffect, useState } from "react";

import CoinLogo from "./CoinLogo";
import Modal from "./ui/Modal";

const API_BASE = import.meta.env.VITE_API_URL || "";

const OUTCOME_STYLE = {
  tp1: "text-profit border-profit/30 bg-profit/10",
  tp2: "text-profit border-profit/30 bg-profit/10",
  tp3: "text-profit border-profit/30 bg-profit/10",
  tp4: "text-accent border-accent/40 bg-accent/10",
  sl: "text-negative border-negative/30 bg-negative/10",
};

const sym = (pair) => String(pair || "").replace(/USDT$/i, "");

function when(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function SimilarCallsModal({ isOpen, onClose, signal, onSwitchSignal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signalId = signal?.signal_id;

  const load = useCallback(async () => {
    if (!signalId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/v1/signals/${signalId}/similar?limit=20`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [signalId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const s = data?.summary;
  const items = data?.items || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Similar setups"
      subtitle={
        signal?.pair
          ? `Calls whose distinctive tags overlap ${sym(signal.pair)}'s — other pairs only`
          : undefined
      }
      size="lg"
    >
      {loading && (
        <div className="py-10 text-center text-[12px] text-text-muted">
          Matching setups across the last 90 days…
        </div>
      )}

      {error && !loading && (
        <div className="py-8 text-center">
          <p className="text-[12px] text-negative">Could not load similar calls ({error}).</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 min-h-11 rounded-lg border border-ink/15 px-4 text-[12px] text-text-primary"
          >
            Try again
          </button>
        </div>
      )}

      {/* Two different nothings, and saying the wrong one makes the feature
          look broken. A call is tagged by the enricher AFTER it is published,
          so a fresh call has no fingerprint yet — that is "not analysed", not
          "nothing matches". Found by testing against the newest call on the
          book, which returned zero for exactly this reason. */}
      {!loading && !error && items.length === 0 && (
        <div className="py-10 text-center text-[12px] text-text-muted">
          {s?.basis_tags?.length ? (
            "No call in the last 90 days shares enough of this setup to be worth showing."
          ) : (
            <>
              This call has not been tagged yet, so there is nothing to match on.
              <span className="mt-1 block text-[11px]">
                Tags are written shortly after a call is published — try again in a little while.
              </span>
            </>
          )}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {/* Say what the number is over, next to the number. A rate without
              its denominator is the thing that makes a desk overconfident. */}
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-ink/[0.07] bg-surface-raised px-3 py-2">
            <span className="font-mono text-[18px] font-bold text-text-primary">
              {s?.win_rate != null ? `${s.win_rate}%` : "—"}
            </span>
            <span className="text-[11px] text-text-muted">
              reached TP1 or better, of the{" "}
              <strong className="text-text-primary">{s?.resolved ?? 0}</strong> resolved among
              these {s?.returned ?? 0}
            </span>
            {s?.tp3_plus > 0 && (
              <span className="text-[11px] text-text-muted">
                · {s.tp3_plus} ran to TP3+
              </span>
            )}
            {s?.sl > 0 && <span className="text-[11px] text-text-muted">· {s.sl} stopped</span>}
          </div>

          {s?.basis_tags?.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
                Matched on this call&apos;s tags
              </p>
              <div className="flex flex-wrap gap-1">
                {s.basis_tags.slice(0, 12).map((t) => (
                  <span
                    key={t}
                    className="rounded border border-ink/10 bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-text-muted"
                  >
                    {t.toLowerCase().replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-[52vh] space-y-1 overflow-y-auto">
            {items.map((c) => (
              <button
                key={c.signal_id}
                type="button"
                onClick={() => {
                  onSwitchSignal?.(c);
                  onClose?.();
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-ink/[0.06] bg-surface-raised px-2 py-2 text-left transition-colors hover:border-ink/15 hover:bg-ink/[0.03] sm:gap-3 sm:px-3"
              >
                <CoinLogo pair={c.pair} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] font-bold text-text-primary">
                    {sym(c.pair)}
                    <span className="text-text-muted">/USDT</span>
                  </span>
                  <span className="block text-[10px] text-text-muted">
                    {c.shared_count} shared · {Math.round((c.score || 0) * 100)}% match ·{" "}
                    {when(c.created_at)}
                  </span>
                </span>
                {c.outcome && (
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                      OUTCOME_STYLE[c.outcome] || "text-text-muted border-ink/15"
                    }`}
                  >
                    {c.outcome}
                  </span>
                )}
                {c.gain_pct != null && (
                  <span
                    className={`shrink-0 font-mono text-[11px] ${
                      c.gain_pct >= 0 ? "text-profit" : "text-negative"
                    }`}
                  >
                    {c.gain_pct >= 0 ? "+" : ""}
                    {c.gain_pct}%
                  </span>
                )}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-text-muted">
            Matched on tag overlap, rarer tags weighted higher. This describes what happened to
            similar setups — it is not a forecast for this one.
          </p>
        </>
      )}
    </Modal>
  );
}
