import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  applySignalFilters,
  datesFromParam,
  datesToParam,
  edgeTopCutFromScores,
  filtersToParams,
  isRunnersSelection,
  parseFilters,
  RUNNERS_EDGE_TOP,
  runnersRecipeState,
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

describe("Edge top N% is measured against the whole book", () => {
  // 20 calls yesterday scoring 1..20, 5 today scoring 17..21. Top 20% of the
  // 25-call book is the 5 highest: 21, 20, 20, 19, 19 → cut 19. Viewing only
  // today used to take the cut over today's 5 rows (top 1 → 21) and hid the
  // 19 and 20 that the Runners topic, measured on the book, had posted.
  const book = [];
  const scores = {};
  for (let i = 1; i <= 20; i++) {
    const s = sig({ created_at: "2026-09-18T10:00:00+00:00" });
    scores[s.signal_id] = { score: i };
    book.push(s);
  }
  const today = [17, 18, 19, 20, 21].map((sc) => {
    const s = sig({ created_at: "2026-09-19T10:00:00+00:00" });
    scores[s.signal_id] = { score: sc };
    book.push(s);
    return s;
  });

  it("keeps a day's call that clears the book's cut, even when the day alone would not", () => {
    const out = applySignalFilters(
      book,
      { ...DEFAULT_FILTERS, edgeTop: 20, selectedDates: ["2026-09-19"] },
      { edgeScoreMap: scores }
    );
    expect(out.map((s) => scores[s.signal_id].score).sort((a, b) => a - b)).toEqual([19, 20, 21]);
    expect(out.every((s) => today.includes(s))).toBe(true);
  });
});

describe("Runners membership comes from the server", () => {
  // The Runners topic decides each call once, at publish, against the seven-
  // day book. The tab must hold that same set — not re-derive it from tags
  // and a cut that move after the post.
  const runners = { tags: ["A", "B"], edge_top: 30, ids: ["posted", "old"] };
  const rows = [
    sig({ signal_id: "posted", created_at: "2026-09-19T08:30:00+00:00", important_tags: ["A"] }),
    // Posted yesterday under a tag that has since rotated out of the set.
    sig({ signal_id: "old", created_at: "2026-09-18T08:30:00+00:00", important_tags: ["VOL_SPIKE_3X"] }),
    // Carries a runner tag and scores high today, but was not chosen.
    sig({ signal_id: "notchosen", created_at: "2026-09-19T09:00:00+00:00", important_tags: ["B"] }),
  ];
  const scores = { posted: { score: 60 }, old: { score: 50 }, notchosen: { score: 99 } };
  const runnersState = { ...DEFAULT_FILTERS, selectedTags: ["B", "A"], tagMatchMode: "any", edgeTop: 30 };

  it("recognises the state every entry point applies", () => {
    // The rail button and the playbook's "Screen runners" both apply this.
    expect(isRunnersSelection(runnersRecipeState(["A", "B"]), runners)).toBe(true);
    expect(isRunnersSelection(runnersRecipeState(["A", "B", "OLD"]), runners)).toBe(false);
  });

  it("takes the server's Edge cut, 30 when it has not answered", () => {
    expect(runnersRecipeState(["A"]).edgeTop).toBe(RUNNERS_EDGE_TOP);
    expect(RUNNERS_EDGE_TOP).toBe(30);
    expect(runnersRecipeState(["A"], 25).edgeTop).toBe(25);
    // A state built for another cut is not the mode the server describes.
    expect(isRunnersSelection(runnersRecipeState(["A", "B"], 20), runners)).toBe(false);
  });

  it("recognises the mode in any tag order, and nothing looser", () => {
    expect(isRunnersSelection(runnersState, runners)).toBe(true);
    expect(isRunnersSelection({ ...runnersState, selectedTags: ["A"] }, runners)).toBe(false);
    expect(isRunnersSelection({ ...runnersState, selectedTags: ["A", "B", "C"] }, runners)).toBe(false);
    expect(isRunnersSelection({ ...runnersState, tagMatchMode: "all" }, runners)).toBe(false);
    expect(isRunnersSelection({ ...runnersState, edgeTop: 10 }, runners)).toBe(false);
    expect(isRunnersSelection(runnersState, null)).toBe(false);
    expect(isRunnersSelection(runnersState, { ...runners, ids: undefined })).toBe(false);
  });

  it("shows exactly the decided calls, and the day chip only picks which", () => {
    const all = applySignalFilters(rows, { ...runnersState, selectedDates: [] }, { edgeScoreMap: scores, runners });
    expect(all.map((s) => s.signal_id).sort()).toEqual(["old", "posted"]);
    const today = applySignalFilters(rows, { ...runnersState, selectedDates: ["2026-09-19"] }, { edgeScoreMap: scores, runners });
    expect(today.map((s) => s.signal_id)).toEqual(["posted"]);
  });

  it("still ANDs the other filters", () => {
    const out = applySignalFilters(rows, { ...runnersState, selectedDates: [], searchPair: "ZZZ" }, { edgeScoreMap: scores, runners });
    expect(out).toHaveLength(0);
  });

  it("falls back to tags + cut when the server set is missing", () => {
    const out = applySignalFilters(rows, { ...runnersState, selectedDates: [] }, { edgeScoreMap: scores });
    expect(out.every((s) => s.signal_id !== "old")).toBe(true);
  });
});

describe("a manual Edge cut uses the server's book scores", () => {
  // The browser's own scores read ~1.9 above the server's; a cut taken over
  // them sat at 67.0 while the topic's was 65.2. With the book's list given,
  // the cut is the server's to the decimal.
  const book = Array.from({ length: 20 }, (_, i) => 50 + i); // 50..69
  it("matches signal_screen._percentile_cut", () => {
    // top 20% of 20 = 4 rows: 69, 68, 67, 66 → cut 66.
    expect(edgeTopCutFromScores(book, 20)).toBe(66);
    expect(edgeTopCutFromScores(book.slice(0, 9), 20)).toBe(null);
  });

  it("keeps a row at the server cut that local scores would have dropped", () => {
    const rows = Array.from({ length: 20 }, (_, i) => sig({ signal_id: `r${i}`, created_at: "2026-09-19T00:00:00+00:00" }));
    const local = Object.fromEntries(rows.map((r, i) => [r.signal_id, { score: 52 + i }])); // inflated scale
    local.r5 = { score: 66 }; // the server's number for one row
    const out = applySignalFilters(rows, { ...DEFAULT_FILTERS, selectedDates: [], edgeTop: 20 }, { edgeScoreMap: local, bookScores: book });
    expect(out.map((s) => s.signal_id)).toContain("r5");
  });
});
