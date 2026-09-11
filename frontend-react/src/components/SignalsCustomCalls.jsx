import { useEffect, useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import Modal from "./ui/Modal";
import { signalAlertApi, criteriaToDeskState } from "../services/signalAlertApi";
import {
  CONDITION_LABELS,
  newRule,
  prepareRules,
  ruleSummary,
  displayRuleValue,
} from "../utils/customSignalRules";

const INPUT =
  "min-h-[38px] w-full min-w-0 rounded-lg border border-ink/[0.12] bg-surface-secondary px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent";
const BUTTON =
  "min-h-[40px] rounded-lg border border-ink/[0.12] px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-ink/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const pill = (on) =>
  `min-h-[32px] rounded-full border px-2.5 py-1 text-[12px] leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
    on
      ? "border-accent bg-accent/15 font-semibold text-text-primary"
      : "border-ink/[0.14] text-text-secondary hover:bg-ink/[0.05]"
  }`;
const errorText = (e) =>
  typeof e?.response?.data?.detail === "string"
    ? e.response.data.detail
    : "Could not load or save this screen. Please try again.";

/** Presets carry the value; this only asks whether a rule already is that preset. */
const isPreset = (rule, p) =>
  !!rule && rule.op === p.op && JSON.stringify(rule.value) === JSON.stringify(p.value);

function Chips({ field, rule, onChange }) {
  const options = field.options || [];
  const value = rule?.value || [];
  const op = rule?.op || "in";
  const emit = (next, nextOp = op) =>
    onChange(next.length ? { field: field.key, op: nextOp, value: next } : null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((v) => {
          const on = value.includes(v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              className={pill(on)}
              onClick={() => emit(on ? value.filter((x) => x !== v) : [...value, v])}
            >
              {displayRuleValue(v, field)}
            </button>
          );
        })}
      </div>
      {!!value.length && (
        <button
          type="button"
          className="text-[11px] text-text-muted underline underline-offset-2 hover:text-text-primary"
          onClick={() => emit(value, op === "in" ? "not_in" : "in")}
        >
          {op === "in" ? "Exclude these instead" : "Include these instead"}
        </button>
      )}
    </div>
  );
}

function PairPicker({ field, rule, onChange }) {
  const [search, setSearch] = useState("");
  const value = rule?.value || [];
  const options = [...new Set([...(field.options || []), ...value])];
  const term = search.trim().toUpperCase();
  const visible = term ? options.filter((v) => v.includes(term)).slice(0, 60) : [];
  const emit = (next) => onChange(next.length ? { field: field.key, op: "in", value: next } : null);
  return (
    <div className="space-y-2">
      <input
        className={INPUT}
        aria-label="Search pairs"
        placeholder="Type a coin — BTC, HYPE, SOL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!!value.length && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              className="flex min-h-[30px] items-center gap-1.5 rounded-full bg-accent/12 px-2 py-1 text-[12px] text-text-primary"
              aria-label={`Remove ${v}`}
              onClick={() => emit(value.filter((x) => x !== v))}
            >
              <CoinLogo pair={v} size={16} />
              {v}
              <span aria-hidden className="text-text-muted">
                ×
              </span>
            </button>
          ))}
        </div>
      )}
      {term ? (
        <div className="max-h-[168px] overflow-y-auto rounded-lg border border-ink/[0.08]">
          {visible.map((v) => (
            <button
              key={v}
              type="button"
              className="flex w-full items-center gap-2.5 border-b border-ink/[0.04] px-2.5 py-2 text-left text-[13px] text-text-primary last:border-0 hover:bg-accent/10"
              onClick={() => {
                emit(value.includes(v) ? value : [...value, v]);
                setSearch("");
              }}
            >
              <CoinLogo pair={v} size={20} className="shrink-0" />
              <span className="min-w-0 truncate">{v}</span>
              {value.includes(v) && <span className="ml-auto text-[11px] text-text-muted">added</span>}
            </button>
          ))}
          {/* "Not in the book" and "not in your search" are different answers,
              and telling someone their pair is missing when it is not was the
              whole complaint that widened this window in the first place. */}
          {!visible.length && (
            <p className="p-2.5 text-[12px] text-text-muted">
              No pair in the signal book matches “{search.trim()}”.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">
          {field.options?.length || 0} pairs in the book. Search to add one.
        </p>
      )}
    </div>
  );
}

function TagPicker({ field, rule, onChange }) {
  const [search, setSearch] = useState("");
  const value = rule?.value || [];
  const op = rule?.op || "any";
  const options = [...new Set([...(field.options || []), ...value])];
  const visible = options
    .filter((v) => v.toLowerCase().replaceAll("_", " ").includes(search.toLowerCase()))
    .slice(0, 80);
  const emit = (next, nextOp = op) =>
    onChange(next.length ? { field: field.key, op: nextOp, value: next } : null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {["any", "all", "none"].map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={op === o}
            className={pill(op === o)}
            onClick={() => (value.length ? emit(value, o) : onChange({ field: field.key, op: o, value: [] }))}
          >
            {CONDITION_LABELS[o]}
          </button>
        ))}
      </div>
      {!!value.length && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              className="min-h-[30px] rounded-full bg-accent/12 px-2 py-1 text-left text-[12px] text-text-primary"
              aria-label={`Remove ${v}`}
              onClick={() => emit(value.filter((x) => x !== v))}
            >
              {displayRuleValue(v, field)} <span aria-hidden className="text-text-muted">×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className={INPUT}
        aria-label="Search tags"
        placeholder="Search tags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-[150px] overflow-y-auto rounded-lg border border-ink/[0.08]">
        {visible.map((v) => (
          <label
            key={v}
            className="flex min-h-[36px] cursor-pointer items-center gap-2.5 border-b border-ink/[0.04] px-2.5 py-1.5 text-[12px] text-text-primary last:border-0 hover:bg-ink/[0.03]"
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[#e6ad00]"
              checked={value.includes(v)}
              onChange={(e) => emit(e.target.checked ? [...value, v] : value.filter((x) => x !== v))}
            />
            <span className="min-w-0 break-words">{displayRuleValue(v, field)}</span>
          </label>
        ))}
        {!visible.length && (
          <p className="p-2.5 text-[12px] text-text-muted">No tag matches that search.</p>
        )}
      </div>
    </div>
  );
}

/** Presets plus one optional custom row. Custom writes gte / lte / between
    from whichever bounds are filled, so nobody has to pick an operator. */
function RangePicker({ field, rule, onChange, minLabel = "Min", maxLabel = "Max" }) {
  const presets = field.presets || [];
  const matched = presets.find((p) => isPreset(rule, p));
  const [custom, setCustom] = useState(() => !!rule && !matched);
  const [lo, setLo] = useState(() =>
    !rule || matched ? "" : rule.op === "lte" ? "" : String(rule.op === "between" ? rule.value[0] : rule.value)
  );
  const [hi, setHi] = useState(() =>
    !rule || matched ? "" : rule.op === "lte" ? String(rule.value) : rule.op === "between" ? String(rule.value[1]) : ""
  );
  const emitCustom = (nextLo, nextHi) => {
    setLo(nextLo);
    setHi(nextHi);
    const a = nextLo.trim();
    const b = nextHi.trim();
    if (a && b) onChange({ field: field.key, op: "between", value: [Number(a), Number(b)] });
    else if (a) onChange({ field: field.key, op: "gte", value: Number(a) });
    else if (b) onChange({ field: field.key, op: "lte", value: Number(b) });
    else onChange(null);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = isPreset(rule, p);
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={on}
              className={pill(on)}
              onClick={() => {
                setCustom(false);
                setLo("");
                setHi("");
                onChange(on ? null : { field: field.key, op: p.op, value: p.value });
              }}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          className={pill(custom)}
          onClick={() => {
            const next = !custom;
            setCustom(next);
            if (!next) {
              setLo("");
              setHi("");
              onChange(null);
            } else if (matched) onChange(null);
          }}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          {[
            [minLabel, lo, (v) => emitCustom(v, hi)],
            [maxLabel, hi, (v) => emitCustom(lo, v)],
          ].map(([label, v, set]) => (
            <label key={label} className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
                {label}
                {field.unit ? ` · ${field.unit}` : ""}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step={field.integer ? "1" : "any"}
                min={field.min}
                max={field.max}
                className={INPUT}
                aria-label={`${field.label} ${label}`}
                value={v}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recency reads forwards ("last 7 days") while the stored value counts
    backwards (age <= 7). The control hides that; the summary line restores it. */
function RecencyPicker({ field, rule, onChange }) {
  return (
    <RangePicker
      field={field}
      rule={rule}
      onChange={onChange}
      minLabel="Older than"
      maxLabel="Within"
    />
  );
}

function BoolPicker({ field, rule, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[
        ["Any", null],
        ["Yes", true],
        ["No", false],
      ].map(([label, v]) => {
        const on = v === null ? !rule : rule?.value === v;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            className={`${pill(on)} flex-1`}
            onClick={() => onChange(v === null ? null : { field: field.key, op: "eq", value: v })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Fallback for fields with no designed control: the old operator + value pair. */
function RawPicker({ field, rule, onChange }) {
  const ops =
    field.kind === "number"
      ? ["gte", "lte", "between", "eq"]
      : field.kind === "tags"
        ? ["any", "all", "none"]
        : ["in", "not_in"];
  const active = rule || newRule(field);
  const set = (next) => onChange(next);
  if (field.kind === "choice" && field.options) return <Chips field={field} rule={rule} onChange={onChange} />;
  if (field.kind === "tags") return <TagPicker field={field} rule={rule} onChange={onChange} />;
  return (
    <div className="space-y-2">
      <select
        aria-label={`${field.label} condition`}
        className={INPUT}
        value={active.op}
        onChange={(e) =>
          set({
            ...active,
            op: e.target.value,
            value: e.target.value === "between" ? ["", ""] : "",
          })
        }
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {CONDITION_LABELS[op]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        {(active.op === "between" ? active.value : [active.value]).map((v, i) => (
          <input
            key={i}
            type="number"
            inputMode="decimal"
            step={field.integer ? "1" : "any"}
            min={field.min}
            max={field.max}
            className={INPUT}
            aria-label={`${field.label} ${active.op === "between" ? (i ? "maximum" : "minimum") : "value"}`}
            placeholder={active.op === "between" ? (i ? "Max" : "Min") : field.unit || "Value"}
            value={v}
            onChange={(e) =>
              set({
                ...active,
                value:
                  active.op === "between"
                    ? active.value.map((x, j) => (i === j ? e.target.value : x))
                    : e.target.value,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

const CONTROLS = {
  pairs: PairPicker,
  chips: Chips,
  recency: RecencyPicker,
  range: RangePicker,
  bool: BoolPicker,
  tags: TagPicker,
};

function FilterCard({ field, rule, total, onChange }) {
  const Control = CONTROLS[field.control] || RawPicker;
  const coverage = total ? Math.round((field.available / total) * 100) : 100;
  const active = !!rule;
  return (
    <section
      className={`rounded-xl border p-3 transition-colors ${
        active ? "border-accent/45 bg-accent/[0.05]" : "border-ink/[0.1] bg-surface-raised"
      }`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold leading-tight text-text-primary">
            {field.label}
          </h3>
          {field.sublabel && (
            <p className="text-[10.5px] leading-tight text-text-muted">{field.sublabel}</p>
          )}
        </div>
        {active ? (
          <button
            type="button"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        ) : (
          coverage < 80 && (
            /* A filter that quietly drops three signals in five is not the same
               instrument as one that covers the book. "No match" and "we never
               recorded it" read identically in a result count, so the card has
               to say which one it is before anyone relies on it. */
            <span
              className="shrink-0 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] text-text-muted"
              title={`${field.available.toLocaleString()} of ${total.toLocaleString()} calls carry this value. The rest can never match.`}
            >
              {coverage}% have it
            </span>
          )
        )}
      </div>
      <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-text-muted" title={field.hint}>
        {field.hint}
      </p>
      <Control field={field} rule={rule} onChange={onChange} />
    </section>
  );
}

export default function SignalsCustomCalls({ active = false, onApply, show }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState("new");
  const [rules, setRules] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [linked, setLinked] = useState(false);
  const [notify, setNotify] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [savedSignature, setSavedSignature] = useState("");
  // Range and search controls hold their own half-typed state. Bumping this
  // remounts every card, so "Clear all" and switching saved screens actually
  // empty the boxes instead of leaving stale text behind a cleared rule.
  const [resetToken, setResetToken] = useState(0);
  const fields = useMemo(() => catalog?.fields || [], [catalog]);
  const order = useMemo(() => new Map(fields.map((f, i) => [f.key, i])), [fields]);
  const primary = fields.filter((f) => f.tier === "primary");
  const rest = fields.filter((f) => f.tier !== "primary");
  const groups = [...new Set(primary.map((f) => f.group))];
  const prepared = useMemo(() => prepareRules(rules, fields), [rules, fields]);
  const wire = prepared.criteria ? JSON.stringify(prepared.criteria) : "";
  const signature = JSON.stringify({ rules, name, notify, telegram });
  const dirty = signature !== savedSignature;
  const current = items.find((i) => String(i.id) === selected);
  const ruleFor = (key) => rules.find((r) => r.field === key);
  // Rules are kept in catalog order so the saved wire format, the review list
  // and the cards all read the same way regardless of what was set first.
  const setRule = (key) => (next) =>
    setRules((prev) => {
      const without = prev.filter((r) => r.field !== key);
      if (!next) return without;
      return [...without, next].sort((a, b) => order.get(a.field) - order.get(b.field));
    });
  // TP1–TP4 % and stop distance are fixed multiples of one number (measured
  // correlation 0.99), so two of them at once is the same filter twice — and
  // opposite bounds on two rungs match nothing at all, with no error to explain
  // why. The screen says so rather than returning a silent zero.
  const ladder = rules.filter((r) => fields.find((f) => f.key === r.field)?.family === "ladder");
  function loadRow(row, tg = telegram) {
    const next = row?.criteria?.rules_v2 || [];
    setSelected(row ? String(row.id) : "new");
    setRules(next);
    setName(row?.name || "");
    setNotify(!!row?.enabled);
    setTelegram(tg);
    setLegacy(!!row && !row.criteria?.rules_v2);
    setSavedSignature(
      JSON.stringify({ rules: next, name: row?.name || "", notify: !!row?.enabled, telegram: tg })
    );
    setError("");
    setMessage("");
    setResetToken((v) => v + 1);
  }
  async function start() {
    setOpen(true);
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const [c, d] = await Promise.all([signalAlertApi.catalog(), signalAlertApi.list()]);
      setCatalog(c);
      setItems(d.items || []);
      setLinked(d.telegram_linked);
      if (!(active && rules.length)) loadRow(d.items?.[0], !!d.telegram);
    } catch (e) {
      setCatalog(null);
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!open || !wire || legacy || loading) {
      setPreview(null);
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    setPreview(null);
    const timer = setTimeout(
      () =>
        signalAlertApi
          .preview(JSON.parse(wire), controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) {
              setPreview({ ...data, wire });
              setChecking(false);
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) {
              setPreview({ error: errorText(e), wire });
              setChecking(false);
            }
          }),
      400
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, wire, legacy, loading, previewRetry]);
  const ready =
    !loading && !legacy && !!wire && !checking && preview?.wire === wire && !preview?.error;
  function apply() {
    if (!ready) return;
    onApply?.(criteriaToDeskState(prepared.criteria));
    setOpen(false);
  }
  async function save() {
    if (!ready || !name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = { name: name.trim(), criteria: prepared.criteria, enabled: notify };
      let row;
      if (current) row = await signalAlertApi.patch(current.id, { ...payload, telegram });
      else {
        row = await signalAlertApi.create({ ...payload, enabled: false });
        // Record the created screen before optional delivery settings, so retry
        // updates it instead of accidentally creating a duplicate.
        setItems((prev) => [...prev, row]);
        setSelected(String(row.id));
        if (notify || telegram) row = await signalAlertApi.patch(row.id, { ...payload, telegram });
      }
      setItems((prev) => [...prev.filter((i) => i.id !== row.id), row].sort((a, b) => a.id - b.id));
      setSelected(String(row.id));
      setSavedSignature(signature);
      setMessage("Screen saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        onClick={start}
        className={`${BUTTON} ${active ? "border-accent bg-accent/10" : "bg-surface-secondary"}`}
      >
        Custom{active ? " · active" : ""}
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Custom screen"
        eyebrow="SIGNALS"
        subtitle={
          catalog
            ? `Set anything you care about — everything else stays open. ${catalog.total.toLocaleString()} calls in the book.`
            : "Filter the same values you see in the signal table and details."
        }
        size="2xl"
        footer={
          <div className="space-y-2.5">
            <div aria-live="polite" className="text-[13px] text-text-primary">
              {checking ? (
                "Checking matching signals…"
              ) : preview?.error ? (
                <span className="text-loss">
                  {preview.error}{" "}
                  <button type="button" className={BUTTON} onClick={() => setPreviewRetry((v) => v + 1)}>
                    Retry results
                  </button>
                </span>
              ) : ready ? (
                <>
                  <strong>{preview.signal_ids.length.toLocaleString()}</strong> of{" "}
                  {preview.total.toLocaleString()} calls match
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {preview.unavailable.toLocaleString()} excluded — one of your filters was never
                    recorded for them
                  </span>
                </>
              ) : (
                <span className="text-text-muted">
                  {legacy ? "Choose a new screen to use the current filters." : prepared.error}
                </span>
              )}
            </div>
            {ladder.length > 1 && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-2 text-[11px] leading-snug text-text-secondary">
                Target size, stop distance and the TP rungs are fixed multiples of one number — they
                move together. Using {ladder.length} of them at once is the same filter repeated, and
                opposite bounds match nothing.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={apply}
                className="min-h-[44px] flex-1 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg disabled:opacity-40"
              >
                View results{ready ? ` · ${preview.signal_ids.length.toLocaleString()}` : ""}
              </button>
              <button
                type="button"
                disabled={!ready || !name.trim() || busy || (!current && items.length >= 5)}
                onClick={save}
                className={`${BUTTON} flex-1`}
              >
                {busy ? "Saving…" : "Save screen"}
              </button>
            </div>
          </div>
        }
      >
        {loading ? (
          <p className="py-12 text-center text-text-muted">Loading available filters…</p>
        ) : (
          <div className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-loss/20 bg-loss/5 p-3 text-[13px] text-loss"
              >
                {error}
                {!catalog && (
                  <button className={`${BUTTON} ml-2`} onClick={start}>
                    Retry
                  </button>
                )}
              </div>
            )}
            {message && (
              <p role="status" className="text-[13px] text-profit">
                {message}
              </p>
            )}
            {catalog && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <label className="min-w-[180px] flex-1 text-[11px] text-text-muted">
                    Saved screens
                    <select
                      className={`${INPUT} mt-1`}
                      value={selected}
                      onChange={(e) =>
                        loadRow(items.find((i) => String(i.id) === e.target.value) || null)
                      }
                    >
                      <option value="new">New screen</option>
                      {items.map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    {dirty && !!rules.length && (
                      <span className="text-[11px] text-text-muted">Unsaved changes</span>
                    )}
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={!rules.length}
                      onClick={() => {
                        setRules([]);
                        setMessage("");
                        setResetToken((v) => v + 1);
                      }}
                    >
                      Clear all{rules.length ? ` · ${rules.length}` : ""}
                    </button>
                  </div>
                </div>
                {legacy ? (
                  <div className="rounded-xl border border-ink/[0.1] p-4 text-[13px] text-text-secondary">
                    This screen uses the previous filter system. Its saved rules have been kept.
                    Create a new screen to use fields from the signal details.
                    <button className={`${BUTTON} mt-3 block`} onClick={() => loadRow(null)}>
                      Create new screen
                    </button>
                  </div>
                ) : (
                  <>
                    {/* One page, everything visible. The captions orient; they do
                        not hide anything, because a filter nobody can find is a
                        filter nobody uses. */}
                    {groups.map((group) => (
                      <div key={group}>
                        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                          {group}
                        </p>
                        <div className="grid items-start gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                          {primary
                            .filter((f) => f.group === group)
                            .map((f) => (
                              <FilterCard
                                key={`${f.key}:${resetToken}`}
                                field={f}
                                rule={ruleFor(f.key)}
                                total={catalog.total}
                                onChange={setRule(f.key)}
                              />
                            ))}
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-ink/[0.08] pt-3">
                      <button
                        type="button"
                        className={`${BUTTON} w-full border-dashed`}
                        aria-expanded={advanced}
                        onClick={() => setAdvanced((v) => !v)}
                      >
                        {advanced ? "Hide" : "Show"} {rest.length} advanced fields
                        <span className="ml-1 text-text-muted">
                          · published prices, TP rungs, BTC statistics
                        </span>
                      </button>
                      {advanced && (
                        <div className="mt-2.5 grid items-start gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                          {rest.map((f) => (
                            <FilterCard
                              key={`${f.key}:${resetToken}`}
                              field={f}
                              rule={ruleFor(f.key)}
                              total={catalog.total}
                              onChange={setRule(f.key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {!!wire && (
                      <details className="rounded-lg border border-ink/[0.08] p-3">
                        <summary className="cursor-pointer text-[13px] font-medium text-text-primary">
                          Review {rules.length} condition{rules.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-text-muted">
                          {prepared.criteria.rules_v2.map((r) => (
                            <li key={r.field} className="break-words">
                              {ruleSummary(
                                r,
                                fields.find((f) => f.key === r.field)
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <section className="space-y-2.5 border-t border-ink/[0.08] pt-3">
                      <label className="block text-[11px] text-text-muted">
                        Screen name
                        <input
                          className={`${INPUT} mt-1`}
                          maxLength={40}
                          placeholder="Name this screen to save it"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <details>
                        <summary className="min-h-[40px] cursor-pointer py-2 text-[13px] font-medium text-text-primary">
                          Notifications <span className="text-text-muted">· optional</span>
                        </summary>
                        <div className="space-y-2 pb-2 text-[13px] text-text-primary">
                          <label className="flex min-h-[40px] items-center gap-3">
                            <input
                              type="checkbox"
                              checked={notify}
                              onChange={(e) => setNotify(e.target.checked)}
                            />
                            Notify me about new matching calls
                          </label>
                          <label
                            className={`flex min-h-[40px] items-center gap-3 ${!linked ? "opacity-50" : ""}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!linked}
                              checked={telegram}
                              onChange={(e) => setTelegram(e.target.checked)}
                            />
                            Send signal-match notifications to Telegram
                          </label>
                          <p className="text-[11px] leading-relaxed text-text-muted">
                            {!linked ? "Link Telegram in Notifications first. " : ""}Telegram
                            delivery applies to all your enabled Custom screens. Changes take effect
                            when you save. Alerts use these same conditions for new calls after
                            saving, with a 12-hour lookback; older desk results are not sent.
                          </p>
                        </div>
                      </details>
                    </section>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
