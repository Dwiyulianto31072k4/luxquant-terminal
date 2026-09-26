// Effect deps must not reference a const declared later in the same function.
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
// crashes: identifiers inside a hook's dependency array, read during render.
//
// It resolves names with eslint's own scope analysis. The first version matched
// names file-wide with a regex, so `function Plot({ model })` looked like it read
// the `const model` another component declares 400 lines later: seven false
// alarms kept CI red from 20 Sep 2026. The self-test below pins both halves —
// the crash is still caught, the shadowed name is not.
//
// espree, eslint-scope and eslint-visitor-keys are eslint's own parser and
// scope analyser: they ship with the eslint devDependency, top level in the lockfile.
import fs from "fs";
import path from "path";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";
import * as visitorKeys from "eslint-visitor-keys";

const PARSE = { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true, loc: true };
const HOOK = /^use[A-Z]/;

function hookName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return "";
}

function walk(node, visit) {
  visit(node);
  for (const key of visitorKeys.KEYS[node.type] || visitorKeys.getKeys(node)) {
    const child = node[key];
    for (const c of Array.isArray(child) ? child : [child]) {
      if (c && typeof c.type === "string") walk(c, visit);
    }
  }
}

export function findTdz(source) {
  const ast = espree.parse(source, PARSE);
  const inDeps = new Set();
  walk(ast, (node) => {
    if (node.type !== "CallExpression" || !HOOK.test(hookName(node.callee))) return;
    for (const arg of node.arguments) {
      if (arg.type === "ArrayExpression") walk(arg, (n) => n.type === "Identifier" && inDeps.add(n));
    }
  });

  const scopes = eslintScope.analyze(ast, {
    ecmaVersion: 2022,
    sourceType: "module",
    childVisitorKeys: visitorKeys.KEYS,
    fallback: "iteration",
  });
  const found = [];
  for (const scope of scopes.scopes) {
    for (const ref of scope.references) {
      if (!inDeps.has(ref.identifier) || !ref.resolved) continue;
      const def = ref.resolved.defs[0];
      // Parameters, imports and function declarations exist before the body
      // runs; `var` reads as undefined rather than throwing.
      if (!def || def.type !== "Variable" || def.parent.kind === "var") continue;
      const sameRender = ref.resolved.scope.variableScope === ref.from.variableScope;
      if (sameRender && def.name.range[0] > ref.identifier.range[0]) {
        found.push({ name: ref.identifier.name, line: ref.identifier.loc.start.line, declLine: def.name.loc.start.line });
      }
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

function selfTest() {
  const crash = `
    function Page() {
      useEffect(() => { load(); }, [load]);
      const load = useCallback(() => {}, []);
      return null;
    }`;
  const shadowed = `
    function Plot({ model }) {
      useEffect(() => {}, [model]);
      return <div />;
    }
    function Large({ rows }) {
      const model = useMemo(() => rows, [rows]);
      return <Plot model={model} />;
    }`;
  const caught = findTdz(crash);
  const alarms = findTdz(shadowed);
  if (caught.length !== 1 || caught[0].name !== "load" || alarms.length !== 0) {
    console.error("effect-deps TDZ scan: SELF-TEST FAILED — the checker itself is broken", { caught, alarms });
    process.exit(2);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  selfTest();
  const root = process.argv[2] || "src";
  const files = [];
  (function collect(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) collect(p);
      else if (/\.jsx?$/.test(e.name)) files.push(p);
    }
  })(root);

  let bad = 0;
  for (const f of files) {
    let found;
    try {
      found = findTdz(fs.readFileSync(f, "utf8"));
    } catch (err) {
      console.error(`${f}: could not parse (${err.message}) — the scan cannot vouch for this file`);
      bad++;
      continue;
    }
    for (const t of found) {
      console.error(`${f}:${t.line} — deps reference '${t.name}' declared later (line ${t.declLine}): TDZ crash at render`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`effect-deps TDZ scan: ${files.length} files clean (self-test passed)`);
}
