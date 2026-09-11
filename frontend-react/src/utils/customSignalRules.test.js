import { describe, it, expect } from "vitest";
import { newRule, prepareRules, ruleSummary } from "./customSignalRules";
const fields = [
  { key: "rho", label: "Correlation ρ", kind: "number", min: -1, max: 1 },
  { key: "sl", label: "SL distance", kind: "number", min: 0, unit: "%" },
  { key: "tags", label: "Tags", kind: "tags" },
];
describe("Custom rules", () => {
  it("does not turn an empty input into zero", () =>
    expect(prepareRules([newRule(fields[0])], fields).error).toBeTruthy());
  it("preserves zero and exact user bounds through serialization", () =>
    expect(
      prepareRules(
        [
          { field: "rho", op: "between", value: ["-0.5", "0"] },
          { field: "sl", op: "lte", value: "2.5" },
        ],
        fields
      ).criteria.rules_v2
    ).toEqual([
      { field: "rho", op: "between", value: [-0.5, 0] },
      { field: "sl", op: "lte", value: 2.5 },
    ]));
  it("rejects inverted or impossible bounds", () => {
    expect(
      prepareRules([{ field: "rho", op: "between", value: ["1", "0"] }], fields).error
    ).toBeTruthy();
    expect(prepareRules([{ field: "rho", op: "gte", value: "1.2" }], fields).error).toBeTruthy();
  });
  it("does not accept empty tag selections", () =>
    expect(prepareRules([newRule(fields[2])], fields).error).toBeTruthy());
  it("summarizes the actual threshold instead of a preset name", () =>
    expect(ruleSummary({ field: "sl", op: "lte", value: 2.5 }, fields[1])).toBe(
      "SL distance at most 2.5 %"
    ));
});
