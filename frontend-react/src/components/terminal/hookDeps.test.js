import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// A useMemo / useCallback dependency ARRAY is evaluated the moment the hook is
// called — not when its callback later runs. So listing a `const` that is
// declared further down the component reads it inside its temporal dead zone
// and throws on the first render.
//
// That took /terminal down on 2026-09-14: `viewBase` listed `narrMap`, which
// was declared 66 lines below it, and the page rendered
// "Cannot access 're' before initialization". Lint passed. 247 tests passed.
// The production build passed. The deployed source was correct. None of those
// execute a render, so none of them could see it.
//
// This does, statically, on every file in the folder.
const DIR = new URL(".", import.meta.url).pathname;

/** `  const name = ` at component-body indentation, plus destructured forms. */
const DECL = /^\s{2}const\s+(?:\[\s*([A-Za-z0-9_,\s]+?)\s*\]|\{\s*([A-Za-z0-9_,\s]+?)\s*\}|([A-Za-z0-9_$]+))\s*=/;

function declLines(src) {
  const at = new Map();
  src.split("\n").forEach((line, i) => {
    const m = line.match(DECL);
    if (!m) return;
    const names = (m[1] || m[2] || m[3] || "").split(",").map((x) => x.trim().split(":").pop().trim());
    for (const n of names) if (n && !at.has(n)) at.set(n, i + 1);
  });
  return at;
}

/** Every `}, [a, b, c]);` closing a hook, with the line it sits on. */
function depArrays(src) {
  const out = [];
  src.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*\},\s*\[([^\]]*)\]\s*\)?;?\s*$/);
    if (!m) return;
    const deps = m[1]
      .split(",")
      .map((d) => d.trim().split(/[.?[(]/)[0].trim())
      .filter((d) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(d));
    if (deps.length) out.push({ line: i + 1, deps });
  });
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".jsx") && !f.includes(".bak"));

describe("no hook reads a const from inside its temporal dead zone", () => {
  it("checks every component in components/terminal", () => {
    expect(files.length).toBeGreaterThan(0);
    const problems = [];

    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      const at = declLines(src);
      for (const { line, deps } of depArrays(src)) {
        for (const d of deps) {
          const declared = at.get(d);
          // Only flag a const declared LATER in the same file. Imports, props
          // and module constants are not in `at`, and are fine.
          if (declared != null && declared > line) {
            problems.push(`${f}: dep "${d}" used on line ${line} but declared on ${declared}`);
          }
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
});
