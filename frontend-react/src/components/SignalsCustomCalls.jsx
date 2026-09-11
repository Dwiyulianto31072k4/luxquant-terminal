// Custom — full call screen. Coins are picked from a preview as BASEUSDT.
// Worth / pair WR are not options.

import { useEffect, useMemo, useRef, useState } from "react";
import CoinLogo from "./CoinLogo";
import { GEN_COINS } from "../content/coins.generated";
import Modal from "./ui/Modal";
import { SegGroup, DESK_SHELL, deskSegClass, deskChipClass } from "./ui/SegGroup";
import {
  signalAlertApi,
  emptyCriteria,
  collectAlertCriteria,
  criteriaIsEmpty,
  criteriaToDeskState,
  MCAP_PRESETS,
  toUsdtPair,
  pairBase,
} from "../services/signalAlertApi";

function ChipRow({ options, value, onToggle }) {
  const selected = value || [];
  return (
    <div className={`${DESK_SHELL} flex-wrap`}>
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            className={deskSegClass(on)}
            onClick={() => onToggle(o.key, on)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Pill({ children, logo, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink/[0.1] bg-surface-secondary py-0.5 pl-1 pr-1.5 font-mono text-[10px] uppercase text-text-primary">
      {logo}
      {children}
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-loss">
        ×
      </button>
    </span>
  );
}

const LBL = "mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";

function CoinPicker({ catalog, selected, onAdd, onRemove, placeholder }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef(null);

  const hits = useMemo(() => {
    const raw = q.trim();
    if (raw.length < 1) return [];
    const needle = raw.toUpperCase().replace(/[-/_\s]/g, "");
    const want = toUsdtPair(raw);
    const sel = new Set((selected || []).map((p) => toUsdtPair(p)));
    const hits = catalog
      .filter((c) => {
        if (sel.has(c.pair)) return false;
        const name = (c.name || "").toUpperCase().replace(/[-/_\s]/g, "");
        return (
          c.pair === want ||
          c.base === needle ||
          c.base.startsWith(needle) ||
          c.pair.startsWith(needle) ||
          name.startsWith(needle) ||
          name.includes(needle)
        );
      })
      .sort((a, b) => {
        const score = (c) =>
          c.pair === want || c.base === needle ? 0 : c.base.startsWith(needle) ? 1 : 2;
        return score(a) - score(b) || a.base.localeCompare(b.base);
      })
      .slice(0, 8);
    if (
      !hits.length &&
      /^[A-Z0-9]{2,15}$/.test(needle) &&
      !sel.has(want)
    ) {
      return [{ pair: want, base: pairBase(want), name: null, future: true }];
    }
    return hits;
  }, [q, catalog, selected]);

  const pick = (pair) => {
    onAdd(toUsdtPair(pair));
    setQ("");
    setHi(0);
  };

  return (
    <div ref={box} className="relative">
      <input
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (hits[hi]) pick(hits[hi].pair);
          } else if (e.key === "Escape") {
            setQ("");
          }
        }}
        className="w-full rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 py-2 font-mono text-[12px] text-text-primary"
      />
      {q.trim() && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-raised shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-text-muted">
              No ticker matches. Try the Binance symbol (XPL), not a long name.
            </p>
          ) : (
            hits.map((c, i) => (
              <button
                key={c.pair}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(c.pair)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                  i === hi ? "bg-accent/10" : "hover:bg-ink/[0.04]"
                }`}
              >
                <CoinLogo pair={c.pair} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[12px] font-semibold text-text-primary">
                    {c.base}
                  </span>
                  <span className="block font-mono text-[10px] text-text-muted">
                    {c.pair}
                    {c.name && c.name.toUpperCase() !== c.base ? ` · ${c.name}` : ""}
                    {c.future ? " · not on this week's desk — still ok for Telegram" : ""}
                    {c.onDesk === false && !c.future ? " · history" : ""}
                  </span>
                </span>
                {c.pair === toUsdtPair(q) ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-accent">exact</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
      {selected?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((p) => (
            <Pill
              key={p}
              logo={<CoinLogo pair={toUsdtPair(p)} size={14} />}
              onRemove={() => onRemove(p)}
            >
              {pairBase(p)}
              <span className="text-text-muted">USDT</span>
            </Pill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TagPicker({ catalog, selected, onToggle }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const n = q.trim().toUpperCase().replace(/\s+/g, "_");
    if (!n) return catalog.slice(0, 24);
    return catalog.filter((t) => t.key.includes(n) || t.label.toUpperCase().includes(q.trim().toUpperCase())).slice(0, 24);
  }, [q, catalog]);
  return (
    <div>
      <input
        value={q}
        placeholder="Search tags…"
        onChange={(e) => setQ(e.target.value)}
        className="mb-1.5 w-full rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 py-1.5 font-mono text-[12px] text-text-primary"
      />
      <ChipRow
        options={hits}
        value={selected}
        onToggle={onToggle}
      />
    </div>
  );
}

export default function SignalsCustomCalls({
  deskState,
  onApply,
  show,
  tagWr = [],
  pairs = [],
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [name, setName] = useState("Custom");
  const [form, setForm] = useState(emptyCriteria);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [appliedId, setAppliedId] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const catalog = useMemo(() => {
    const desk = new Set((pairs || []).map((p) => toUsdtPair(p)).filter(Boolean));
    const seen = new Set();
    const out = [];
    const add = (pair, name) => {
      const p = toUsdtPair(pair);
      if (!p || seen.has(p)) return;
      seen.add(p);
      out.push({
        pair: p,
        base: pairBase(p),
        name: name || null,
        onDesk: desk.has(p),
      });
    };
    for (const c of GEN_COINS || []) add(c.symbol, c.name);
    for (const raw of pairs || []) add(raw, null);
    out.sort((a, b) => Number(b.onDesk) - Number(a.onDesk) || a.base.localeCompare(b.base));
    return out;
  }, [pairs]);

  const refresh = () =>
    signalAlertApi
      .list()
      .then((d) => {
        setItems(d.items || []);
        setTelegramLinked(!!d.telegram_linked);
        setTelegram(!!d.telegram);
        const first = d.items?.[0];
        if (first?.criteria) {
          setForm({ ...emptyCriteria(), ...first.criteria });
          setName(first.name || "Custom");
        }
      })
      .catch(() => {});

  useEffect(() => {
    if (show) refresh();
  }, [show]);

  const tagOptions = useMemo(
    () =>
      (tagWr || [])
        .filter((t) => t?.tag)
        .map((t) => ({
          key: t.tag,
          label: String(t.tag).replace(/_/g, " "),
        })),
    [tagWr]
  );

  if (!show) return null;
  const mine = items[0] || null;

  const toggleList = (key, item, on) => {
    const cur = form[key] || [];
    set({ [key]: on ? cur.filter((x) => x !== item) : [...cur, item] });
  };

  const apply = (row) => {
    const c = { ...emptyCriteria(), ...(row.criteria || {}) };
    onApply?.(criteriaToDeskState(c));
    setAppliedId(row.id);
    setForm(c);
    setName(row.name || "Custom");
  };

  const persist = async () => {
    if (criteriaIsEmpty(form)) {
      setError("Pick at least one rule.");
      return null;
    }
    setError("");
    const payload = { name: name.trim() || "Custom", criteria: form };
    const row = mine
      ? await signalAlertApi.patch(mine.id, payload)
      : await signalAlertApi.create({ ...payload, enabled: false });
    setItems((prev) => {
      if (mine) return prev.map((x) => (x.id === row.id ? row : x));
      return [...prev, row];
    });
    setAppliedId(row.id);
    onApply?.(criteriaToDeskState(form));
    return row;
  };

  const save = async () => {
    setBusy(true);
    try {
      await persist();
    } catch (e) {
      const d = e?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const toggleTelegram = async (on) => {
    setBusy(true);
    setError("");
    try {
      let row = mine;
      if (!row) {
        row = await persist();
        if (!row) return;
      }
      row = await signalAlertApi.patch(row.id, {
        telegram: on,
        enabled: on ? true : row.enabled,
      });
      setTelegram(on);
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(
        detail === "LINK_TELEGRAM_REQUIRED"
          ? "Link Telegram in Notifications first."
          : detail || "Could not update Telegram."
      );
    } finally {
      setBusy(false);
    }
  };

  const mcapKey =
    MCAP_PRESETS.find((p) => p.min === form.min_mcap && p.max === form.max_mcap)?.key || "any";

  return (
    <>
      <button
        type="button"
        className={`${deskChipClass(!!appliedId)} !h-8 !px-2 sm:!h-7 sm:!px-2.5`}
        title="Build a custom call screen"
        onClick={() => {
          if (mine && appliedId !== mine.id) apply(mine);
          else setOpen(true);
        }}
      >
        Custom
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="full"
        eyebrow="Filters"
        title="Custom"
        subtitle="Pick exact pairs from the desk. BTC, BTCUSDT and bitcoin all become BTCUSDT."
        footer={() => (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-text-primary">Send to Telegram</span>
                <span className="text-[11.5px] text-text-muted">
                  {telegramLinked
                    ? "DM when a new call matches this screen"
                    : "Link Telegram in Notifications first"}
                </span>
              </span>
              <button
                type="button"
                disabled={busy || !telegramLinked}
                onClick={() => toggleTelegram(!telegram)}
                className={`h-7 w-12 shrink-0 rounded-full border ${
                  telegram ? "border-accent bg-accent" : "border-ink/20 bg-ink/[0.06]"
                }`}
                aria-label="Send to Telegram"
                aria-pressed={telegram}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-surface-raised shadow-sm transition-transform ${
                    telegram ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {mine ? (
                <button
                  type="button"
                  onClick={() => {
                    apply(mine);
                    setOpen(false);
                  }}
                  className="rounded-md border border-ink/[0.1] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted"
                >
                  Show on desk
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-md bg-accent px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-fg disabled:opacity-40"
              >
                {mine ? "Save & show" : "Save this screen"}
              </button>
            </div>
          </div>
        )}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <section>
              <p className={LBL}>Start from</p>
              <div className={`${DESK_SHELL} flex-wrap`}>
                {[
                  ["blank", "Blank", emptyCriteria()],
                  ["runners", "Runners", { ...emptyCriteria(), runners: true, exclude_confound: true, edge_top: 20 }],
                  ["liquid", "Liquid", { ...emptyCriteria(), max_volume_rank: 40 }],
                  ["tight", "Tight stop", { ...emptyCriteria(), max_sl_pct: 2.5, risk_level: ["low"] }],
                  ["desk", "This desk", collectAlertCriteria(deskState)],
                ].map(([k, lab, crit]) => (
                  <button
                    key={k}
                    type="button"
                    className={deskSegClass(false)}
                    onClick={() => setForm({ ...emptyCriteria(), ...crit })}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className={LBL}>Name</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                className="w-full rounded-md border border-ink/[0.1] bg-surface-secondary px-3 py-2 text-[13px] text-text-primary"
              />
            </section>

            <section>
              <p className={LBL}>Only these coins</p>
              <CoinPicker
                catalog={catalog}
                selected={form.pairs}
                placeholder="Search BTC, bitcoin, BTCUSDT…"
                onAdd={(p) => {
                  if (!form.pairs?.includes(p)) toggleList("pairs", p, false);
                }}
                onRemove={(p) => toggleList("pairs", p, true)}
              />
              <p className={`${LBL} mt-3`}>Never these</p>
              <CoinPicker
                catalog={catalog}
                selected={form.exclude_pairs}
                placeholder="Exclude a pair…"
                onAdd={(p) => {
                  if (!form.exclude_pairs?.includes(p)) toggleList("exclude_pairs", p, false);
                }}
                onRemove={(p) => toggleList("exclude_pairs", p, true)}
              />
            </section>

            <section>
              <p className={LBL}>Setup at publish</p>
              <ChipRow
                options={[{ key: "runners", label: "Runners tags (live)" }]}
                value={form.runners ? ["runners"] : []}
                onToggle={() => set({ runners: !form.runners })}
              />
              <div className="mt-2">
                <SegGroup
                  size="sm"
                  aria-label="Tag match"
                  value={form.tag_match || "any"}
                  onChange={(k) => set({ tag_match: k })}
                  options={[
                    { key: "any", label: "Any tag" },
                    { key: "all", label: "All tags" },
                  ]}
                />
              </div>
              <div className="mt-2">
                <TagPicker catalog={tagOptions} selected={form.tags} onToggle={(k, on) => toggleList("tags", k, on)} />
              </div>
              <div className="mt-2">
                <ChipRow
                  options={[
                    { key: "ex", label: "Skip late / parabolic" },
                    { key: "smc", label: "SMC golden only" },
                  ]}
                  value={[
                    ...(form.exclude_confound ? ["ex"] : []),
                    ...(form.smc_golden ? ["smc"] : []),
                  ]}
                  onToggle={(k, on) => {
                    if (k === "ex") set({ exclude_confound: !on });
                    if (k === "smc") set({ smc_golden: !on });
                  }}
                />
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section>
              <p className={LBL}>Quality</p>
              <ChipRow
                options={[
                  { key: "low", label: "Low" },
                  { key: "normal", label: "Normal" },
                  { key: "high", label: "High" },
                ]}
                value={form.risk_level}
                onToggle={(k, on) => toggleList("risk_level", k, on)}
              />
              <div className="mt-2">
                <ChipRow
                  options={[
                    { key: "long", label: "Long" },
                    { key: "short", label: "Short" },
                  ]}
                  value={form.direction}
                  onToggle={(k, on) => toggleList("direction", k, on)}
                />
              </div>
              <div className="mt-2">
                <ChipRow
                  options={[
                    { key: "A", label: "A" },
                    { key: "B", label: "B" },
                    { key: "C", label: "C" },
                  ]}
                  value={form.rating}
                  onToggle={(k, on) => toggleList("rating", k, on)}
                />
              </div>
              <div className="mt-2">
                <p className={LBL}>Min confidence</p>
                <SegGroup
                  size="sm"
                  value={String(form.min_confidence || "0")}
                  onChange={(k) => set({ min_confidence: Number(k) || null })}
                  options={[
                    { key: "0", label: "Off" },
                    { key: "60", label: "60" },
                    { key: "70", label: "70" },
                    { key: "80", label: "80" },
                  ]}
                />
              </div>
            </section>

            <section>
              <p className={LBL}>Size &amp; stop</p>
              <SegGroup
                size="sm"
                value={mcapKey}
                onChange={(k) => {
                  const p = MCAP_PRESETS.find((x) => x.key === k) || MCAP_PRESETS[0];
                  set({ min_mcap: p.min, max_mcap: p.max });
                }}
                options={MCAP_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
              />
              <div className="mt-2">
                <p className={LBL}>Volume rank at most</p>
                <SegGroup
                  size="sm"
                  value={String(form.max_volume_rank || "0")}
                  onChange={(k) => set({ max_volume_rank: Number(k) || null })}
                  options={[
                    { key: "0", label: "Any" },
                    { key: "20", label: "Top 20" },
                    { key: "50", label: "Top 50" },
                    { key: "100", label: "Top 100" },
                  ]}
                />
              </div>
              <div className="mt-2">
                <p className={LBL}>Stop distance</p>
                <SegGroup
                  size="sm"
                  value={
                    form.max_sl_pct === 1.5
                      ? "tight"
                      : form.max_sl_pct === 3
                        ? "mid"
                        : form.min_sl_pct === 3
                          ? "wide"
                          : "any"
                  }
                  onChange={(k) => {
                    if (k === "tight") set({ min_sl_pct: null, max_sl_pct: 1.5 });
                    else if (k === "mid") set({ min_sl_pct: null, max_sl_pct: 3 });
                    else if (k === "wide") set({ min_sl_pct: 3, max_sl_pct: null });
                    else set({ min_sl_pct: null, max_sl_pct: null });
                  }}
                  options={[
                    { key: "any", label: "Any" },
                    { key: "tight", label: "≤ 1.5%" },
                    { key: "mid", label: "≤ 3%" },
                    { key: "wide", label: "≥ 3%" },
                  ]}
                />
              </div>
            </section>

            <section>
              <p className={LBL}>Vs BTC</p>
              <ChipRow
                options={[
                  { key: "dec", label: "Decoupled" },
                  { key: "al", label: "Align ≥ 70" },
                ]}
                value={[
                  ...(form.btc_decoupled ? ["dec"] : []),
                  ...(form.min_btc_align >= 70 ? ["al"] : []),
                ]}
                onToggle={(k, on) => {
                  if (k === "dec") set({ btc_decoupled: !on });
                  if (k === "al") set({ min_btc_align: on ? null : 70 });
                }}
              />
            </section>

            <section>
              <p className={LBL}>On the desk (not Telegram)</p>
              <p className="mb-1.5 text-[11.5px] text-text-muted">
                New Telegram calls arrive as open. These only shape the list here.
              </p>
              <SegGroup
                size="sm"
                value={form.status?.[0] || "all"}
                onChange={(k) => set({ status: k === "all" ? [] : [k] })}
                options={[
                  { key: "all", label: "Any status" },
                  { key: "open", label: "Open" },
                  { key: "updated", label: "Hit" },
                ]}
              />
              <div className="mt-2">
                <p className={LBL}>Edge cut</p>
                <SegGroup
                  size="sm"
                  value={String(form.edge_top || "0")}
                  onChange={(k) => set({ edge_top: Number(k) || null })}
                  options={[
                    { key: "0", label: "Off" },
                    { key: "20", label: "Top 20%" },
                    { key: "10", label: "Top 10%" },
                  ]}
                />
              </div>
            </section>

            {error ? <p className="text-[12px] text-loss">{error}</p> : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
