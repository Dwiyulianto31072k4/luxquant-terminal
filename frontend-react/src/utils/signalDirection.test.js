import { describe, expect, it } from "vitest";

import { isShortSignal, signalDirection } from "./signalDirection";

// This rule lives in three codebases that share no modules (here,
// journey_fetcher.py, /opt/luxquant/signal_side.py) and has already cost 70
// signals their journey rows. These cases are the ones the backend's docstring
// names, so a drift in any one of them fails here.

describe("the stop decides first", () => {
  it("stop below entry is a long", () => {
    expect(signalDirection({ entry: 100, stop1: 98, target1: 104 })).toBe("long");
  });

  it("stop above entry is a short, even when TP1 sits above entry too", () => {
    // A short whose TP1 rounded upward would read as a long from targets alone.
    expect(signalDirection({ entry: 100, stop1: 102, target1: 101 })).toBe("short");
  });

  it("stop equal to entry decides nothing and falls through", () => {
    expect(signalDirection({ entry: 100, stop1: 100, target1: 96 })).toBe("short");
  });
});

describe("then the furthest target, TP4 first", () => {
  it("TP1 landing on the entry tick is not a short", () => {
    // The regression: `target1 < entry` was false here, but `target1 === entry`
    // used to be treated as ambiguous and dropped the row entirely.
    expect(signalDirection({ entry: 100, target1: 100, target4: 118 })).toBe("long");
  });

  it("reads TP4 rather than TP1 when they disagree in reliability", () => {
    expect(signalDirection({ entry: 100, target1: 100, target2: 100, target4: 82 })).toBe(
      "short"
    );
  });

  it("falls back through TP3 and TP2 when TP4 is missing", () => {
    expect(signalDirection({ entry: 100, target1: 100, target2: 107 })).toBe("long");
  });
});

describe("it never throws, and never invents a short", () => {
  it("no usable level at all reads long — the only direction this desk publishes", () => {
    expect(signalDirection({ entry: 100 })).toBe("long");
    expect(signalDirection({ entry: 100, stop1: 100, target1: 100 })).toBe("long");
  });

  it("an unusable entry reads long instead of raising", () => {
    // journey_persistor called the throwing version while building the record,
    // so a raise here meant a missing row, not a visible error.
    expect(signalDirection({ entry: 0, stop1: 5 })).toBe("long");
    expect(signalDirection({})).toBe("long");
    expect(signalDirection(null)).toBe("long");
  });

  it("survives strings and nulls from the API", () => {
    expect(signalDirection({ entry: "100", stop1: "98" })).toBe("long");
    expect(signalDirection({ entry: "100", stop1: null, target4: "121" })).toBe("long");
    // Zero and negative levels are treated as absent, not as "below entry".
    expect(signalDirection({ entry: 100, stop1: 0, target4: 118 })).toBe("long");
  });
});

describe("isShortSignal is the same rule", () => {
  it("agrees with signalDirection", () => {
    const short = { entry: 100, stop1: 103, target1: 94 };
    const long = { entry: 100, stop1: 97, target1: 106 };
    expect(isShortSignal(short)).toBe(true);
    expect(isShortSignal(long)).toBe(false);
  });
});
