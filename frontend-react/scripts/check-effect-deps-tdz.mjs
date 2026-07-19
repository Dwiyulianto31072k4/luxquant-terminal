// Effect deps must not reference a const declared later in the file.
//
// `useEffect(fn, [fetchSignals])` evaluates the deps ARRAY during render, so if
// `const fetchSignals = useCallback(...)` sits below it, the page throws a TDZ
// ReferenceError the moment it mounts. The build compiles it, eslint's default
// set says nothing, and rules-of-hooks says nothing — this exact shape shipped
// and crashed the Analyze page (fixed in ea9727e, hotfixed on the server).
//
// The blanket fix, no-use-before-define {variables:true}, flags 33 sites in
// this codebase — most of them LEGAL deferred reads inside callback bodies the
// rule cannot prove safe. This scan checks only the shape that actually
// crashes: identifiers inside a dependency array read during render.
import fs from "fs";
import path from "path";

const root = process.argv[2] || "src";
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(root);

let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const decls = {};
  lines.forEach((l, i) => {
    const m = l.match(/^\s*const (\w+) = (useCallback|useMemo|async|\()/);
    if (m && !(m[1] in decls)) decls[m[1]] = i;
  });
  lines.forEach((l, i) => {
    const m = l.match(/\}, \[([^\]]*)\]\);/);
    if (!m) return;
    for (const dep of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      const name = dep.split(".")[0].replace(/^!+/, "");
      if (name in decls && decls[name] > i) {
        console.error(`${f}:${i + 1} — deps reference '${name}' declared later (line ${decls[name] + 1}): TDZ crash at render`);
        bad++;
      }
    }
  });
}
if (bad) process.exit(1);
console.log(`effect-deps TDZ scan: ${files.length} files clean`);
