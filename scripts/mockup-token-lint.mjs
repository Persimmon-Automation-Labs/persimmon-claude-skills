#!/usr/bin/env node
// mockup-token-lint — catch undefined CSS custom properties in mockups / Tailwind v4 tokens.
//
// WHY: a typo'd token (e.g. `var(--color-surface-subtle)` when the real Tailwind v4
// `@theme` token is `--color-bg-surface`) renders as NOTHING — the rule silently
// no-ops and the screen looks broken with no error and no build failure. Tailwind's
// own build only errors on unknown *utility classes*, not on a bad `var(--x)` in an
// arbitrary value, an inline style, or a hand-written CSS block. This lint makes that
// failure loud and cheap to catch before a screen is "done".
//
// WHAT IT CHECKS: every `var(--x)` use resolves to a `--x:` definition somewhere in
// the scanned files. Definitions come from Tailwind v4 `@theme { --color-...: ... }`
// blocks, `:root {}` / `@layer` custom properties, and inline `<style>`. (Tailwind
// utility classes like `bg-brand` are NOT checked here — the Tailwind compiler already
// errors on an unknown utility; this lint covers the var() escape hatch it doesn't.)
//
// USAGE:
//   node scripts/mockup-token-lint.mjs <path> [<path> ...]
//     <path> = a mockups dir (scanned recursively) and/or token sources
//              (e.g. src/app/globals.css with the @theme block). Any *.css under
//              the given paths defines tokens; inline <style> in *.html/*.tsx too.
//   Exit 1 if any var(--x) is used with NO definition AND NO fallback.
//   Undefined-but-with-fallback is reported as a warning (exit still 0).
//
// Browser-known custom properties and anything defined in JS are not seen; for
// static mockups + the project token layer, scanning the files is the right check.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2).filter((a) => a !== "--help" && a !== "-h");
if (process.argv.includes("--help") || process.argv.includes("-h") || args.length === 0) {
  console.log("usage: node scripts/mockup-token-lint.mjs <mockups-or-css-dir> [extra-token-source ...]");
  process.exit(args.length === 0 ? 1 : 0);
}

function walk(p, out = []) {
  let st;
  try { st = statSync(p); } catch { return out; }
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === "node_modules" || name === ".git" || name === ".next") continue;
      walk(join(p, name), out);
    }
  } else if ([".html", ".htm", ".css", ".tsx", ".jsx"].includes(extname(p).toLowerCase())) {
    out.push(p);
  }
  return out;
}

const files = [...new Set(args.flatMap((a) => walk(a)))];
if (files.length === 0) {
  console.error("No .html/.css/.tsx/.jsx files found under: " + args.join(", "));
  process.exit(1);
}

const DEF_RE = /(--[A-Za-z0-9-]+)\s*:/g;        // a custom-property DEFINITION (incl. @theme tokens)
const USE_RE = /var\(\s*(--[A-Za-z0-9-]+)\s*(,)?/g; // a USE; group 2 set if a fallback follows

const defined = new Set();
const uses = []; // {file, token, hasFallback, line}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = DEF_RE.exec(text)) !== null) defined.add(m[1]);
}
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    while ((m = USE_RE.exec(line)) !== null) {
      uses.push({ file, token: m[1], hasFallback: !!m[2], line: i + 1 });
    }
  });
}

const errors = [];
const warnings = [];
for (const u of uses) {
  if (defined.has(u.token)) continue;
  (u.hasFallback ? warnings : errors).push(u);
}

const fmt = (u) => `  ${u.file}:${u.line}  ${u.token}${u.hasFallback ? "  (has fallback)" : ""}`;

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} undefined token(s) used WITH a fallback (review):`);
  warnings.forEach((u) => console.log(fmt(u)));
}
if (errors.length) {
  console.log(`\n✗  ${errors.length} undefined token(s) used with NO fallback — these render as nothing:`);
  errors.forEach((u) => console.log(fmt(u)));
  const uniq = [...new Set(errors.map((e) => e.token))].sort();
  console.log(`\nUndefined tokens: ${uniq.join(", ")}`);
  console.log(`Defined tokens scanned: ${defined.size}. Fix the typo or define the token in your @theme / token layer.`);
  process.exit(1);
}

console.log(`✓ mockup-token-lint: ${uses.length} var() uses, all defined (${defined.size} tokens, ${files.length} files).`);
process.exit(0);
