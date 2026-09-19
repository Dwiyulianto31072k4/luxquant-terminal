import { describe, expect, it } from "vitest";

import { prevCallHitMaxTp } from "./maxTpWarning";

describe("prevCallHitMaxTp", () => {
  it("reads the bulk-7d flag", () => {
    expect(prevCallHitMaxTp({ tp4_in_24h: true })).toBe(true);
    expect(prevCallHitMaxTp({ tp4_in_24h: false })).toBe(false);
  });

  it("reads BigStar's stored line where only risk_reasons travels", () => {
    // Pipe-joined, as stored; the detail endpoint and other pages carry this.
    const detail = {
      risk_reasons:
        "Volume rank is outside the top 200.|The same symbol has already reached TP4 within the last 24 hours.|Market cap is below 50M.",
    };
    expect(prevCallHitMaxTp({}, detail)).toBe(true);
    expect(prevCallHitMaxTp({ risk_reasons: detail.risk_reasons })).toBe(true);
  });

  it("is false for other risk lines and for nothing at all", () => {
    expect(prevCallHitMaxTp({ risk_reasons: "Market cap is below 50M." })).toBe(false);
    expect(prevCallHitMaxTp(null)).toBe(false);
    expect(prevCallHitMaxTp({}, { risk_reasons: null })).toBe(false);
  });
});
