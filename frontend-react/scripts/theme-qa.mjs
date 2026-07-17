#!/usr/bin/env node
/**
 * Deep theming QA — static scan (run: node scripts/theme-qa.mjs)
 * Exit 1 on critical findings.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src");

const findings = [];
const add = (sev, cat, file, line, msg) => findings.push({ sev, cat, file, line, msg });

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|css)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);

for (const file of files) {
  const rel = path.relative(path.join(SRC, ".."), file);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((l, i) => {
    const n = i + 1;
    if (/(strokeStyle|fillStyle|shadowColor)\s*=\s*["'`].*var\(--/.test(l)) {
      add("critical", "canvas-css-var", rel, n, "Canvas color uses CSS var");
    }
    if (/addColorStop\([^)]*var\(--/.test(l)) {
      add("critical", "canvas-css-var", rel, n, "addColorStop with CSS var");
    }
    if (/\.(atmosphereColor|pointColor|arcColor)\([^)]*var\(--/.test(l)) {
      add("critical", "webgl-css-var", rel, n, "three-globe color uses CSS var");
    }
    if (/\b(gold-primary|gold-light|border-line|text-emerald-|bg-emerald-|border-emerald-)\b/.test(l)) {
      if (!/--gold-primary|--gold-light|--gold-dark/.test(l)) {
        add("high", "legacy-token", rel, n, "Legacy gold/emerald class");
      }
    }
    if (/bg-accent[^"'`\n]{0,60}text-surface-raised|text-surface-raised[^"'`\n]{0,60}bg-accent/.test(l)) {
      add("high", "cta-contrast", rel, n, "bg-accent + text-surface-raised (use text-accent-fg)");
    }
  });

  // missing theme helper imports
  if (file.endsWith(".jsx") && !file.endsWith("themeColors.js")) {
    for (const h of [
      "getActiveTheme",
      "subscribeTheme",
      "getTradingViewTheme",
      "mountTradingViewEmbed",
    ]) {
      if (new RegExp(`\\b${h}\\b`).test(text) && !new RegExp(`import\\s*\\{[^}]*\\b${h}\\b`).test(text)) {
        if (!new RegExp(`function\\s+${h}\\b`).test(text)) {
          add("critical", "missing-import", rel, 0, `${h} used without import`);
        }
      }
    }
  }
}

const css = fs.readFileSync(path.join(SRC, "styles", "index.css"), "utf8");
if (/--accent:\s*rgb\(var\(--accent/.test(css)) {
  add("critical", "css-channel", "src/styles/index.css", 0, "--accent channel overwritten");
}

const by = { critical: [], high: [], med: [], info: [] };
for (const f of findings) (by[f.sev] || by.info).push(f);

console.log("=== LuxQuant Theme QA ===\n");
for (const sev of ["critical", "high", "med", "info"]) {
  const items = by[sev] || [];
  console.log(`## ${sev.toUpperCase()} (${items.length})`);
  for (const f of items.slice(0, 40)) {
    console.log(`  [${f.cat}] ${f.file}:${f.line} — ${f.msg}`);
  }
  if (items.length > 40) console.log(`  … +${items.length - 40} more`);
  console.log();
}

const crit = by.critical.length;
console.log(crit ? `FAIL — ${crit} critical` : "PASS — 0 critical");
process.exit(crit ? 1 : 0);
