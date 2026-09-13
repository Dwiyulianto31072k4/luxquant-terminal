/**
 * Every extracted tab, rendered.
 *
 * Lint proves the names resolve and the build proves the imports exist; neither
 * runs a line. Splitting a 2,764-line component into five is exactly the change
 * that breaks at render — a hook reading a value declared below it, or a prop
 * the parent forgot to pass — and this repo has already shipped a green build
 * that white-screened on a temporal dead zone.
 *
 * renderToString needs no DOM, so this costs no dependency. It will not lay a
 * chart out (Recharts needs a measured box) but it executes every hook and
 * every branch reached with data present, and again with nothing at all.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, o) => (o && o.defaultValue) || k }),
}));

import { renderToString } from "react-dom/server";
import BtcTab from "./BtcTab";
import LiveTab from "./LiveTab";
import OverviewTab from "./OverviewTab";
import SectorsTab from "./SectorsTab";

// The real shape of `agg`, every collection empty. Guessing it is how the first
// run of this test failed: four tabs threw on a key the fixture had not
// declared, which says nothing about the tabs and everything about the fixture.
const EMPTY_AGG = {
  alignVals: [],
  anomPts: [],
  avgBeta: null,
  betaVals: [],
  btcChg: null,
  btcPrice: null,
  closedN: 0,
  days: [],
  decoupled: 0,
  decoupledList: [],
  equity: [],
  extended: 0,
  fcN: 0,
  fcVals: [],
  funnel: {},
  leads: 0,
  maeMed: null,
  medFc: null,
  medFlow: 0,
  movers: [],
  peakPts: [],
  riskMix: { LOW: 0, NORMAL: 0, HIGH: 0 },
  rs: [],
  scatterBeta: [],
  scatterOpp: [],
  sectors: [],
  statusMix: {},
  suspects: [],
  tt1Vals: [],
  winRate: null,
};

const common = {
  agg: EMPTY_AGG,
  view: [],
  deriv: { generated_at: new Date().toISOString(), stale: false },
  openPair: () => {},
  openSignalRow: () => {},
  statusMap: {},
  pairFc: {},
  latestByPair: {},
  fcClamped: [],
  macro: null,
  filters: {},
  setF: () => {},
  selSectors: [],
  selRisks: [],
  tpHitPct: null,
};

describe("each extracted tab renders", () => {
  const cases = [
    ["BtcTab", BtcTab],
    ["LiveTab", LiveTab],
    ["OverviewTab", OverviewTab],
    ["SectorsTab", SectorsTab],
  ];

  cases.forEach(([name, Comp]) => {
    it(`${name} renders on an empty desk`, () => {
      expect(() => renderToString(<Comp {...common} />)).not.toThrow();
    });

    it(`${name} renders with no derivatives blob`, () => {
      expect(() => renderToString(<Comp {...common} deriv={null} />)).not.toThrow();
    });
  });
});
