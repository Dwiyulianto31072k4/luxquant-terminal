import { useEffect, useMemo, useRef, useState } from "react";
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
  "min-h-[44px] w-full min-w-0 rounded-lg border border-ink/[0.12] bg-surface-secondary px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent";
const BUTTON =
  "min-h-[44px] rounded-lg border border-ink/[0.12] px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-ink/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const errorText = (e) =>
  typeof e?.response?.data?.detail === "string"
    ? e.response.data.detail
    : "Could not load or save this screen. Please try again.";

function Values({ field, value, onChange }) {
  const [search, setSearch] = useState("");
  const options = [...new Set([...(field.options || []), ...(value || [])])];
  const visible = options.filter((v) =>
    v.toLowerCase().replaceAll("_", " ").includes(search.toLowerCase().replaceAll("_", " "))
  );
  return (
    <div className="space-y-2">
      {options.length > 7 && (
        <input
          className={INPUT}
          aria-label={`Search ${field.label} values`}
          placeholder={`Search ${field.label.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {!!value.length && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              className="min-h-[36px] max-w-full break-words rounded-md bg-accent/10 px-2 py-1 text-left text-[12px] text-text-primary"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              {field.key === "pair" ? (
                <CoinLogo pair={v} size={14} className="mr-1 inline-block align-[-2px]" />
              ) : null}
              {displayRuleValue(v, field)} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[200px] overflow-y-auto rounded-lg border border-ink/[0.08]">
        {visible.map((v) => (
          <label
            key={v}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-ink/[0.04] px-3 py-2 text-[13px] text-text-primary hover:bg-ink/[0.03]"
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[#e6ad00]"
              checked={value.includes(v)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))
              }
            />
            {field.key === "pair" ? (
              <CoinLogo pair={v} size={20} className="shrink-0" />
            ) : null}
            <span className="min-w-0 break-words">{displayRuleValue(v, field)}</span>
          </label>
        ))}
        {!visible.length && (
          /* Two different situations used to share one sentence. With the book
             no longer clipped to a week, "nothing matches your search" and
             "this field has no values at all" are genuinely different answers,
             and telling someone their pair is not in the book when it is was
             the whole complaint. */
          <p className="p-3 text-[13px] text-text-muted">
            {search.trim()
              ? `No ${field.label.toLowerCase()} matches “${search.trim()}”.`
              : `No ${field.label.toLowerCase()} values in the signal book yet.`}
          </p>
        )}
      </div>
    </div>
  );
}

function RuleCard({ rule, field, onChange, onRemove, focus }) {
  const cardRef = useRef(null);
  useEffect(() => {
    if (focus) cardRef.current?.querySelector("select, input")?.focus();
  }, [focus]);
  const ops =
    field.kind === "number"
      ? ["gte", "lte", "between", "eq"]
      : field.kind === "tags"
        ? ["any", "all", "none"]
        : field.kind === "boolean"
          ? ["eq"]
          : ["in", "not_in"];
  return (
    <section ref={cardRef} className="rounded-xl border border-ink/[0.1] bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-text-muted">{field.group}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-text-primary">{field.label}</h3>
        </div>
        <button
          type="button"
          className="min-h-[44px] min-w-[44px] rounded-lg text-[22px] text-text-muted hover:bg-ink/[0.05]"
          aria-label={`Remove ${field.label} filter`}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-text-muted">{field.hint}</p>
      <div className="space-y-3">
        {field.kind !== "boolean" && (
          <select
            aria-label={`${field.label} condition`}
            className={INPUT}
            value={rule.op}
            onChange={(e) =>
              onChange({
                ...rule,
                op: e.target.value,
                value:
                  field.kind === "number"
                    ? e.target.value === "between"
                      ? ["", ""]
                      : ""
                    : rule.value,
              })
            }
          >
            {ops.map((op) => (
              <option key={op} value={op}>
                {CONDITION_LABELS[op]}
              </option>
            ))}
          </select>
        )}
        {field.kind === "number" ? (
          <div className="flex items-center gap-2">
            {(rule.op === "between" ? rule.value : [rule.value]).map((v, i) => (
              <label key={i} className="min-w-0 flex-1">
                <span className="mb-1 block text-[11px] text-text-muted">
                  {rule.op === "between" ? (i === 0 ? "Minimum" : "Maximum") : "Value"}
                  {field.unit ? ` (${field.unit})` : ""}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.integer ? "1" : "any"}
                  min={field.min}
                  max={field.max}
                  className={INPUT}
                  aria-label={`${field.label} ${rule.op === "between" ? (i ? "maximum" : "minimum") : "value"}`}
                  value={v}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      value:
                        rule.op === "between"
                          ? rule.value.map((x, j) => (i === j ? e.target.value : x))
                          : e.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
        ) : field.kind === "boolean" ? (
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={rule.value === v}
                onClick={() => onChange({ ...rule, value: v })}
                className={`${BUTTON} flex-1 ${rule.value === v ? "border-accent bg-accent/10" : ""}`}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        ) : (
          <Values
            field={field}
            value={rule.value}
            onChange={(value) => onChange({ ...rule, value })}
          />
        )}
      </div>
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
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [focusField, setFocusField] = useState(null);
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [linked, setLinked] = useState(false);
  const [notify, setNotify] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [savedSignature, setSavedSignature] = useState("");
  const addRef = useRef(null);
  const fields = catalog?.fields || [];
  const prepared = useMemo(() => prepareRules(rules, catalog?.fields || []), [rules, catalog]);
  const wire = prepared.criteria ? JSON.stringify(prepared.criteria) : "";
  const signature = JSON.stringify({ rules, name, notify, telegram });
  const dirty = signature !== savedSignature;
  const current = items.find((i) => String(i.id) === selected);
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
    setPicker(false);
    setFocusField(null);
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
  const availableFields = fields.filter(
    (f) =>
      !rules.some((r) => r.field === f.key) &&
      `${f.label} ${f.group}`.toLowerCase().includes(search.toLowerCase())
  );
  const groups = [...new Set(availableFields.map((f) => f.group))];
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
        title="Custom signals"
        eyebrow="SIGNALS"
        subtitle="Filter the same values you see in the signal table and details."
        size="2xl"
        footer={
          <div className="space-y-3">
            <div aria-live="polite" className="text-[13px] text-text-primary">
              {checking ? (
                "Checking matching signals…"
              ) : preview?.error ? (
                <span className="text-loss">{preview.error} <button type="button" className={BUTTON} onClick={() => setPreviewRetry(v => v + 1)}>Retry results</button></span>
              ) : ready ? (
                <>
                  <strong>{preview.signal_ids.length}</strong> of {preview.total} signals match
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {preview.unavailable} missing required data · excluded from these results
                  </span>
                </>
              ) : (
                <span className="text-text-muted">
                  {legacy ? "Choose a new screen to use the current filters." : prepared.error}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={apply}
                className="min-h-[44px] flex-1 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg disabled:opacity-40"
              >
                View results{ready ? ` · ${preview.signal_ids.length}` : ""}
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
          <div className="space-y-5">
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
                {!!items.length && (
                  <label className="block text-[12px] text-text-muted">
                    Saved screens
                    <select
                      className={`${INPUT} mt-1`}
                      value={selected}
                      onChange={(e) => loadRow(items.find((i) => String(i.id) === e.target.value))}
                    >
                      <option value="new">New screen</option>
                      {items.map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-[15px] font-semibold text-text-primary">
                          Match all conditions
                        </h2>
                        <p className="mt-1 text-[12px] text-text-muted">
                          Across the signal book since{" "}
                          {new Date(catalog.window_start).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          })}{" "}
                          · 00:00 UTC. Day and search controls can narrow your results afterwards.
                        </p>
                      </div>
                      {!!rules.length && (
                        <button
                          type="button"
                          className={BUTTON}
                          onClick={() => {
                            setRules([]);
                            setMessage("");
                          }}
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                    {!rules.length && (
                      <div className="rounded-xl border border-dashed border-ink/[0.15] px-5 py-8 text-center">
                        <h3 className="text-[16px] font-semibold text-text-primary">
                          Start with a field you know
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-muted">
                          Choose Pair, Status, Risk, a price level, or a value from BTC Correlation
                          and Deep Analysis. You set the conditions.
                        </p>
                        <button
                          type="button"
                          className={`${BUTTON} mt-4 border-accent bg-accent/10`}
                          onClick={() => setPicker(true)}
                        >
                          + Add filter
                        </button>
                      </div>
                    )}
                    <div className="grid items-start gap-3 md:grid-cols-2">
                      {rules.map((r, i) => {
                        const f = fields.find((f) => f.key === r.field);
                        return f ? (
                          <RuleCard
                            key={r.field}
                            focus={focusField === r.field}
                            rule={r}
                            field={f}
                            onRemove={() => setRules((prev) => prev.filter((_, j) => i !== j))}
                            onChange={(next) =>
                              setRules((prev) => prev.map((r, j) => (i === j ? next : r)))
                            }
                          />
                        ) : null;
                      })}
                    </div>
                    {!!rules.length && (
                      <button
                        ref={addRef}
                        type="button"
                        className={`${BUTTON} w-full border-dashed`}
                        onClick={() => {
                          setPicker(!picker);
                          setSearch("");
                        }}
                        aria-expanded={picker}
                      >
                        + Add filter
                      </button>
                    )}
                    {picker && (
                      <section
                        className="rounded-xl border border-ink/[0.12] bg-surface-secondary p-3 sm:p-4"
                        aria-label="Available filters"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-[14px] font-semibold text-text-primary">
                            Choose a field
                          </h3>
                          <button
                            type="button"
                            aria-label="Close field picker"
                            className={BUTTON}
                            onClick={() => setPicker(false)}
                          >
                            Close
                          </button>
                        </div>
                        <input
                          autoFocus
                          className={INPUT}
                          aria-label="Search filter fields"
                          placeholder="Search fields…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto">
                          {groups.map((group) => (
                            <div key={group}>
                              <p className="mb-1 text-[11px] font-semibold text-text-muted">
                                {group}
                              </p>
                              <div className="grid gap-1 sm:grid-cols-2">
                                {availableFields
                                  .filter((f) => f.group === group)
                                  .map((f) => (
                                    <button
                                      key={f.key}
                                      type="button"
                                      className="min-h-[52px] rounded-lg bg-surface-raised p-3 text-left hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                      onClick={() => {
                                        setFocusField(f.key);
                                        setRules((prev) => [...prev, newRule(f)]);
                                        setPicker(false);
                                        setSearch("");
                                      }}
                                    >
                                      <span className="block text-[13px] font-medium text-text-primary">
                                        {f.label}
                                      </span>
                                      <span className="block text-[11px] text-text-muted">
                                        {f.available} signals with data
                                        {f.unit ? ` · ${f.unit}` : ""}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          ))}
                          {!groups.length && (
                            <p className="p-3 text-[13px] text-text-muted">
                              No other fields match your search.
                            </p>
                          )}
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
                          Price and Vol 24h are live values. Edge uses a separate score calculation.
                          These are not available as saved filters yet.
                        </p>
                      </section>
                    )}
                    {!!wire && (
                      <details className="rounded-lg border border-ink/[0.08] p-3">
                        <summary className="cursor-pointer text-[13px] font-medium text-text-primary">
                          Review {rules.length} condition{rules.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 space-y-2 text-[12px] leading-relaxed text-text-muted">
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
                    <section className="space-y-3 border-t border-ink/[0.08] pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[14px] font-semibold text-text-primary">
                          Save for later
                        </h3>
                        {dirty && !!rules.length && (
                          <span className="text-[11px] text-text-muted">Unsaved changes</span>
                        )}
                      </div>
                      <label className="block text-[12px] text-text-muted">
                        Screen name
                        <input
                          className={`${INPUT} mt-1`}
                          maxLength={40}
                          placeholder="Give your screen a name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <details>
                        <summary className="min-h-[44px] cursor-pointer py-3 text-[13px] font-medium text-text-primary">
                          Notifications <span className="text-text-muted">· optional</span>
                        </summary>
                        <div className="space-y-2 pb-2 text-[13px] text-text-primary">
                          <label className="flex min-h-[44px] items-center gap-3">
                            <input
                              type="checkbox"
                              checked={notify}
                              onChange={(e) => setNotify(e.target.checked)}
                            />
                            Notify me about new matching calls
                          </label>
                          <label
                            className={`flex min-h-[44px] items-center gap-3 ${!linked ? "opacity-50" : ""}`}
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
