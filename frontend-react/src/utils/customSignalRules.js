export const CONDITION_LABELS = {
  gte: "At least",
  lte: "At most",
  between: "Between",
  eq: "Equals",
  in: "Is any of",
  not_in: "Is not",
  any: "Has any of",
  all: "Has all of",
  none: "Has none of",
};
export function displayRuleValue(value, field) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).replaceAll("_", " ");
  if (field?.key === "status") return text === "open" ? "Open" : text.toUpperCase();
  if (field?.key === "btc_confidence") return text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}
export function newRule(field) {
  return {
    field: field.key,
    op:
      field.kind === "number"
        ? "gte"
        : field.kind === "tags"
          ? "any"
          : field.kind === "boolean"
            ? "eq"
            : "in",
    value: field.kind === "boolean" ? true : field.kind === "number" ? "" : [],
  };
}
export function prepareRules(rules, fields) {
  if (!rules.length) return { error: "Add a filter to see matching signals." };
  const result = [];
  for (const rule of rules) {
    const f = fields.find((f) => f.key === rule.field);
    if (!f)
      return { error: "This saved field is no longer available. Remove it before continuing." };
    let value = rule.value;
    if (f.kind === "number") {
      const raw = rule.op === "between" ? value : [value];
      if (
        !Array.isArray(raw) ||
        raw.length !== (rule.op === "between" ? 2 : 1) ||
        raw.some((v) => v === "" || v === null || !Number.isFinite(Number(v)))
      )
        return {
          error: `Enter ${rule.op === "between" ? "both bounds" : "a value"} for ${f.label}.`,
        };
      const values = raw.map(Number);
      if (
        values.some(
          (v) =>
            (f.min != null && v < f.min) ||
            (f.max != null && v > f.max) ||
            (f.integer && !Number.isInteger(v))
        )
      )
        return {
          error: `Check the supported range for ${f.label}${f.min != null ? ` (minimum ${f.min})` : ""}${f.max != null ? ` (maximum ${f.max})` : ""}.`,
        };
      if (values.length === 2 && values[0] > values[1])
        return { error: `${f.label}: minimum cannot exceed maximum.` };
      value = rule.op === "between" ? values : values[0];
    } else if (f.kind !== "boolean" && !value?.length)
      return {
        error: `Choose at least one ${f.label === "Pair" ? "pair" : "value for " + f.label}.`,
      };
    result.push({ field: rule.field, op: rule.op, value });
  }
  return { criteria: { rules_v2: result } };
}
export function ruleSummary(rule, field) {
  const format = (v) => displayRuleValue(v, field);
  const value = Array.isArray(rule.value)
    ? rule.value.map(format).join(rule.op === "between" ? " – " : ", ")
    : format(rule.value);
  return `${field?.label || rule.field} ${CONDITION_LABELS[rule.op]?.toLowerCase() || rule.op} ${value}${field?.unit ? " " + field.unit : ""}`;
}
