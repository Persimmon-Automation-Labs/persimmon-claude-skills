#!/usr/bin/env node
// ai-tell-lint.mjs — the mechanical genericness gate for public sites. Catches
// the VISUAL/markup AI-slop tells that copy lints and contrast checks don't:
// the Tailwind-default purple palette, the indigo→violet gradient hero,
// Inter/Geist as the only font, pure #fff/#000, blanket rounded-2xl, and
// feature-card emoji.
//
//   node scripts/ai-tell-lint.mjs [path ...]  # defaults to src/ public/ styles/ app/
//
// WHY a linter and not a prompt: research is clear that telling a model
// "no purple, avoid Inter" *primes* the banned token (negative constraints
// backfire), and self-critique self-inflates — so the only reliable enforcement
// of "less generic" is a deterministic gate. See the `premium-web-method` skill.
//
// Two tiers:
//   ERROR (exit 1) — unambiguous slop on a bespoke Persimmon site: Tailwind
//     indigo/violet/fuchsia/purple utilities, and any purple→purple gradient.
//   WARN  (exit 0) — context-dependent: bare Tailwind-purple hexes, Inter/Geist,
//     rounded-2xl/3xl, pure-white bg / pure-black text, decorative emoji.
//
// Note: targets the Tailwind *defaults*. A brand that is genuinely purple should
// use custom shades in @theme (not the default hexes/classes), which won't trip this.

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = process.argv.slice(2);
const DEFAULTS = ["src", "public", "styles", "app", "components"];
const EXTS = new Set([
  ".tsx", ".ts", ".jsx", ".js", ".mjs",
  ".css", ".scss",
]);

// ── ERROR patterns (unambiguous AI-slop) ──────────────────────────────────
// Tailwind purple-family utility classes — the canonical "v0/Lovable" palette.
const PURPLE_UTIL = /\b(?:bg|text|from|via|to|border|ring|fill|stroke|decoration|outline|accent|shadow|caret)-(?:indigo|violet|fuchsia|purple)-\d{2,3}\b/;
// Tailwind default purple hexes (indigo/violet/purple/fuchsia 300–800).
const PURPLE_HEX = /#(?:c7d2fe|a5b4fc|818cf8|6366f1|4f46e5|4338ca|3730a3|ddd6fe|c4b5fd|a78bfa|8b5cf6|7c3aed|6d28d9|5b21b6|d8b4fe|c084fc|a855f7|9333ea|7e22ce|f0abfc|e879f9|d946ef|c026d3)\b/gi;
// from-…-to-… across the purple family = the gradient hero tell.
const GRAD_UTIL = /\b(?:from|via|to)-(?:indigo|violet|fuchsia|purple)-\d{2,3}\b/g;

// ── WARN patterns (context-dependent) ─────────────────────────────────────
const FONT_TELL = /(?:font-family|--font[\w-]*)\s*:[^;{}]*\b(Inter|Geist)\b/i;
const ROUNDED_TELL = /\brounded-(?:2xl|3xl)\b/;
const PURE_BG = /background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/i;
const PURE_TEXT = /(?<![-\w])color\s*:\s*(?:#000(?:000)?|black)\b/i;
// Curated feature-card / "AI" emoji (the single most common marketing slop tell).
const EMOJI = ["🚀","✨","💡","🎯","🔥","⚡","💪","🙌","👇","👉","✅","🎉","💬","🌟","⭐","📈","🛠️","🤖","💯","🥇","🔑","📌","💎"];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXTS.has(extname(e.name))) yield p;
  }
}

const roots = ROOTS.length ? ROOTS : DEFAULTS;
let errors = 0, warns = 0, files = 0;
const err = (f, i, m) => { console.error(`✗ ${f}:${i + 1}  ${m}`); errors++; };
const warn = (f, i, m) => { console.warn(`⚠ ${f}:${i + 1}  ${m}`); warns++; };

for (const root of roots) {
  let st; try { st = statSync(root); } catch { continue; }
  const targets = st.isDirectory() ? walk(root) : [root];
  for (const f of targets) {
    files++;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      // ERRORS
      if (PURPLE_UTIL.test(line))
        err(f, i, `Tailwind indigo/violet/fuchsia/purple utility — the canonical AI-slop palette. Use the project's custom @theme tokens.`);
      const isGradient = /gradient/i.test(line);
      const hexHits = line.match(PURPLE_HEX) || [];
      const gradUtilHits = line.match(GRAD_UTIL) || [];
      if ((isGradient && hexHits.length >= 2) || gradUtilHits.length >= 2)
        err(f, i, `purple→purple gradient — the #1 AI hero tell. Replace with the brand's own palette.`);

      // WARNS
      if (hexHits.length && !(isGradient && hexHits.length >= 2))
        warn(f, i, `Tailwind-default purple hex (${hexHits[0]}) — intentional? Prefer a custom brand shade in @theme.`);
      const fm = line.match(FONT_TELL);
      if (fm) warn(f, i, `${fm[1]} as a font — reads templated (frontend-public-site-conventions). Deliberate is fine; otherwise reach for more personality.`);
      if (ROUNDED_TELL.test(line)) warn(f, i, `rounded-2xl/3xl — blanket large radius is a template tell; vary radius by role.`);
      if (PURE_BG.test(line)) warn(f, i, `pure white background — premium grounds are off-white (#FAF7F1-ish), never #fff.`);
      if (PURE_TEXT.test(line)) warn(f, i, `pure black text — premium ink is near-black (#1C1612-ish), never #000.`);
      for (const e of EMOJI) {
        if (line.includes(e)) { warn(f, i, `emoji "${e}" in site chrome — use a real icon (frontend-public-site-conventions: no emoji in chrome).`); break; }
      }
    });
  }
}

console.log(`\nai-tell-lint: scanned ${files} files · ${errors} error(s) · ${warns} warning(s)`);
console.log("NOTE: layout-cluster slop (centered hero → 3 even cards → CTA) can't be linted — that's a human/rubric gate (premium-web-method, the five tests).");
process.exit(errors ? 1 : 0);
