import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  applySignalFilters,
  datesFromParam,
  datesToParam,
  filtersToParams,
  parseFilters,
} from "./signalFilters";

const sig = (over = {}) => ({
  signal_id: Math.random().toString(36).slice(2),
  pair: "BTCUSDT",
  status: "open",
  risk_level: "high",
  created_at: "2026-08-30T10:00:00+00:00",
  important_tags: [],
  ...over,
});

const run = (signals, over) => applySignalFilters(signals, { ...DEFAULT_FILTERS, ...over });

describe("status buckets", () => {
  // These three used to fall through to `default: return true` here, so the
  // filter silently returned the unfiltered list.
  const all = [
    sig({ status: "open" }),
    sig({ status: "tp1" }),
    sig({ status: "tp2" }),
    sig({ status: "tp3" }),
    sig({ status: "closed_win" }),
    sig({ status: "closed_loss" }),
  ];

  it("tp1_plus takes TP1 and above, never open or the stop", () => {
    const got = run(all, { statusFilter: "tp1_plus" }).map((s) => s.status);
    expect(got).toEqual(["tp1", "tp2", "tp3", "closed_win"]);
  });

  it("tp2_plus excludes TP1", () => {
    expect(run(all, { statusFilter: "tp2_plus" }).map((s) => s.status)).toEqual([
      "tp2",
      "tp3",
      "closed_win",
    ]);
  });

  it("full_tp is TP3 and above", () => {
    expect(run(all, { statusFilter: "full_tp" }).map((s) => s.status)).toEqual([
      "tp3",
      "closed_win",
    ]);
  });

  it("every bucket is a real subset — none is a silent no-op", () => {
    for (const f of ["tp1_plus", "tp2_plus", "full_tp"]) {
      expect(run(all, { statusFilter: f }).length).toBeLessThan(all.length);
    }
  });
});

describe("risk buckets partition the set", () => {
  const all = [
    sig({ risk_level: "low" }),
    sig({ risk_level: "medium" }),
    sig({ risk_level: "med" }),
    sig({ risk_level: "normal" }),
    sig({ risk_level: "high" }),
    sig({ risk_level: "" }),
    sig({ risk_level: null }),
  ];

  it("normal covers medium, med and normal alike", () => {
    expect(run(all, { riskFilter: "normal" })).toHaveLength(3);
  });

  it("unrated reaches the rows no other bucket matches", () => {
    expect(run(all, { riskFilter: "unrated" })).toHaveLength(2);
  });

  it("low + normal + high + unrated adds up to the whole set", () => {
    const total = ["low", "normal", "high", "unrated"].reduce(
      (n, f) => n + run(all, { riskFilter: f }).length,
      0
    );
    expect(total).toBe(all.length);
  });
});

describe("tag match mode", () => {
  const all = [
    sig({ important_tags: ["a", "b"] }),
    sig({ important_tags: ["a"] }),
    sig({ important_tags: ["c"] }),
  ];

  it("any matches either tag", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: "any" })).toHaveLength(2);
  });

  it("all demands every tag — it used to be ignored and behave like any", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: "all" })).toHaveLength(1);
  });

  it("defaults to any when unset", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: undefined })).toHaveLength(2);
  });
});

describe("url round-trip", () => {
  it("carries the tag match mode", () => {
    const f = { ...DEFAULT_FILTERS, selectedTags: ["x"], tagMatchMode: "all" };
    expect(parseFilters(new URLSearchParams(filtersToParams(f).toString())).tagMatchMode).toBe(
      "all"
    );
  });

  it("omits the default so the url stays clean", () => {
    expect(filtersToParams({ ...DEFAULT_FILTERS }).toString()).not.toContain("tagmode");
  });
});

describe("a drilled-down desk survives a reload and a shared link", () => {
  // The desk could build six sort levels and put exactly one of them in a URL,
  // because encodeSorts/decodeSorts were written for this and then imported by
  // nothing. Reloading threw away every level below the first.
  const round = (f) => parseFilters(new URLSearchParams(filtersToParams(f).toString()));

  it("carries the whole sort chain, not just its head", () => {
    const sorts = [
      { field: "turnover", order: "desc" },
      { field: "edge_score", order: "asc" },
      { field: "win_rate", order: "desc" },
      { field: "created_at", order: "desc" },
    ];
    expect(round({ ...DEFAULT_FILTERS, sorts }).sorts).toEqual(sorts);
  });

  it("writes the chain as one readable param", () => {
    const p = filtersToParams({
      ...DEFAULT_FILTERS,
      sorts: [
        { field: "turnover", order: "desc" },
        { field: "edge_score", order: "asc" },
      ],
    });
    expect(p.get("sort")).toBe("turnover:desc,edge_score:asc");
    expect(p.has("order")).toBe(false);
  });

  it("leaves the default chain out of the URL entirely", () => {
    expect(filtersToParams({ ...DEFAULT_FILTERS }).has("sort")).toBe(false);
  });

  it("still understands the old single-field links", () => {
    const legacy = parseFilters(new URLSearchParams("sort=edge_score&order=asc"));
    expect(legacy.sorts).toEqual([{ field: "edge_score", order: "asc" }]);
    expect(legacy.sortBy).toBe("edge_score");
    expect(legacy.sortOrder).toBe("asc");
  });

  it("keeps sortBy/sortOrder mirroring the head for old callers", () => {
    const out = round({
      ...DEFAULT_FILTERS,
      sorts: [
        { field: "volume", order: "asc" },
        { field: "created_at", order: "desc" },
      ],
    });
    expect(out.sortBy).toBe("volume");
    expect(out.sortOrder).toBe("asc");
  });

  it("carries the page, so reloading does not drop you back to the first one", () => {
    expect(round({ ...DEFAULT_FILTERS, page: 7 }).page).toBe(7);
    expect(filtersToParams({ ...DEFAULT_FILTERS, page: 1 }).has("page")).toBe(false);
    expect(parseFilters(new URLSearchParams("page=0")).page).toBe(1);
    expect(parseFilters(new URLSearchParams("page=junk")).page).toBe(1);
  });

  it("carries narratives and the journal filter", () => {
    const out = round({ ...DEFAULT_FILTERS, narratives: ["AI", "RWA"], journalFilter: "taken" });
    expect(out.narratives).toEqual(["AI", "RWA"]);
    expect(out.journalFilter).toBe("taken");
  });

  it("round-trips a deep desk whole", () => {
    const deep = {
      ...DEFAULT_FILTERS,
      searchPair: "PYTH",
      statusFilter: "open",
      riskFilter: "low",
      streakFilter: "hot",
      corrDecoupled: true,
      corrHighAlign: true,
      edgeTop: 20,
      selectedTags: ["VOL_CLIMAX", "LIQ_VERY_LOW"],
      tagMatchMode: "all",
      narratives: ["AI"],
      journalFilter: "skipped",
      page: 3,
      sorts: [
        { field: "turnover", order: "desc" },
        { field: "verdict", order: "desc" },
      ],
    };
    const out = round(deep);
    for (const k of Object.keys(deep)) {
      if (k === "sortBy" || k === "sortOrder") continue;
      expect(out[k], k).toEqual(deep[k]);
    }
  });
});

describe("dates: absent is not the same as none", () => {
  const TODAY = "2026-09-13";

  it("leaves today out of the URL", () => {
    expect(datesToParam([TODAY], TODAY)).toBe(null);
    expect(datesFromParam(null, TODAY)).toEqual([TODAY]);
  });

  it("says 'all' out loud when every day is wanted", () => {
    // [] means all days. Without a distinct token it is indistinguishable from
    // "no dates param", which means today — the opposite.
    expect(datesToParam([], TODAY)).toBe("all");
    expect(datesFromParam("all", TODAY)).toEqual([]);
  });

  it("round-trips an explicit multi-day pick", () => {
    const picked = ["2026-09-11", "2026-09-12"];
    expect(datesFromParam(datesToParam(picked, TODAY), TODAY)).toEqual(picked);
  });
});

describe("the boot contract SignalsPage relies on", () => {
  // SignalsPage seeds fifteen useState initializers straight off this object.
  // A key renamed here becomes `undefined` there, and `undefined` filters do
  // not throw — they silently behave like "no filter", which is precisely the
  // failure that is invisible in a test that only checks round-tripping.
  const NEEDED = [
    "searchPair",
    "statusFilter",
    "riskFilter",
    "streakFilter",
    "corrDecoupled",
    "corrHighAlign",
    "edgeTop",
    "selectedTags",
    "tagMatchMode",
    "showWatchlistOnly",
    "narratives",
    "journalFilter",
    "page",
    "sorts",
  ];

  it("names every field the desk boots from, on an empty URL", () => {
    const boot = parseFilters(new URLSearchParams(""));
    for (const k of NEEDED) expect(boot, k).toHaveProperty(k);
    for (const k of NEEDED) expect(boot[k], k).not.toBeUndefined();
  });

  it("boots an empty URL to exactly the old hard-coded defaults", () => {
    // Nobody arriving with a bare /signals may see a different desk than before.
    const boot = parseFilters(new URLSearchParams(""));
    expect(boot.searchPair).toBe("");
    expect(boot.statusFilter).toBe("all");
    expect(boot.riskFilter).toBe("all");
    expect(boot.streakFilter).toBe("all");
    expect(boot.corrDecoupled).toBe(false);
    expect(boot.corrHighAlign).toBe(false);
    expect(boot.edgeTop).toBe(null);
    expect(boot.selectedTags).toEqual([]);
    expect(boot.tagMatchMode).toBe("any");
    expect(boot.showWatchlistOnly).toBe(false);
    expect(boot.narratives).toEqual([]);
    expect(boot.journalFilter).toBe("all");
    expect(boot.page).toBe(1);
    expect(boot.sorts).toEqual([{ field: "created_at", order: "desc" }]);
  });

  it("survives junk in every param instead of booting broken", () => {
    const junk = parseFilters(
      new URLSearchParams("q=&status=&risk=&edgetop=abc&tags=&sort=&page=-4&narr=&tagmode=")
    );
    expect(junk.edgeTop).toBe(null);
    expect(junk.selectedTags).toEqual([]);
    expect(junk.narratives).toEqual([]);
    expect(junk.page).toBe(1);
    expect(junk.tagMatchMode).toBe("any");
    expect(junk.sorts).toEqual([{ field: "created_at", order: "desc" }]);
  });
});
