---
name: client-onboarding
description: Standardizes client intake for a new Persimmon engagement. Scrapes the client's existing site with Playwright, extracts brand signals (computed colors, fonts, logo), screenshots the live site at desktop/mobile widths, catalogs the page/product inventory, and generates durable docs/PROJECT-BRIEF.md and docs/BRAND-GUIDE.md so design and build can start. Use when spinning up a new client, onboarding a brand, auditing an existing site, or extracting brand assets. Pairs with meta-new-client-project (repo scaffolding) and feeds the design system. Trigger keywords: onboard client, brand extraction, scrape site, project brief, brand guide, intake.
---

# Client Onboarding — Persimmon Patterns

Standardize intake for a new client. Capture the brand and content inventory of their existing site, then write two durable artifacts the rest of the engagement reads: `docs/PROJECT-BRIEF.md` and `docs/BRAND-GUIDE.md`.

This skill runs AFTER `meta-new-client-project` has created the repo and folder skeleton. It does NOT create the repo — it populates `docs/`.

## Core Rules

1. **Infer first, ask last.** Most intake data is in the SOW/notes or discoverable. Pull it yourself. Only ask the user for things you genuinely cannot find — a privately-held logo source, brand colors when no site exists, a provider decision the client must make.
2. **Capture visual brand, not just text.** Text scraping (WebFetch / fetch) strips CSS, fonts, and images. You get copy but no palette, type, or logo. Use Playwright to read *computed* styles and screenshot the rendered site.
3. **Never invent a palette.** If brand can't be extracted (JS-only render, asset behind auth, login wall), record logo/colors/fonts as **human-blocked open items** in `BRAND-GUIDE.md` and ask for the brand files. A public-facing visual spec cannot be written without them.
4. **Briefs, brand guides, and assets are durable; raw scrapes are scaffolding.** Extract what you need into the durable docs, then delete the raw scrape output.

## Step 1 — Gather Intake

Read from the SOW/brief the user pasted; do not interrogate:

- **Client / business name, scope, requirements** — from the SOW.
- **Existing site URL** — if named or trivially findable, audit it (Step 2). Don't ask "is there a site?" — check.
- **Project type** — infer (`internal-tool` / `marketing-site` / `hybrid`).
- **Stack** — Persimmon standard stack (Next.js 16 + TS + Prisma/Postgres + NextAuth + Tailwind) unless the SOW demands otherwise.

## Step 2 — Audit the Existing Site (Playwright)

Run this as a Node script in the repo (`scripts/onboarding/audit-site.mjs`). It uses Playwright to render the live site, read computed styles, screenshot, and inventory pages — capturing real brand signals that text scraping misses.

```js
// scripts/onboarding/audit-site.mjs
// Usage: node scripts/onboarding/audit-site.mjs https://example.com
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node audit-site.mjs <url>");
  process.exit(1);
}

const outDir = "docs/brand-assets/_audit";
const refDir = "docs/brand-assets/reference";
await mkdir(outDir, { recursive: true });
await mkdir(refDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

// --- Desktop + mobile screenshots: these ARE the brand reference ---
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.screenshot({ path: `${refDir}/home-desktop.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: `${refDir}/home-mobile.png`, fullPage: true });

// --- Read COMPUTED styles for the real palette + type ---
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: "networkidle" });

const brand = await page.evaluate(() => {
  const sel = ["body", "h1", "h2", "a", "button", "nav", "header"];
  const colors = {};
  const fonts = {};
  for (const s of sel) {
    const el = document.querySelector(s);
    if (!el) continue;
    const cs = getComputedStyle(el);
    for (const k of ["color", "backgroundColor"]) {
      const v = cs[k];
      if (v && v !== "rgba(0, 0, 0, 0)") colors[v] = (colors[v] || 0) + 1;
    }
    const fam = cs.fontFamily?.split(",")[0]?.replace(/["']/g, "").trim();
    if (fam) fonts[fam] = (fonts[fam] || 0) + 1;
  }
  // Logo candidate: header img/svg or og:image
  const logo =
    document.querySelector("header img, [class*=logo] img, header svg")?.getAttribute?.("src") ||
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    null;
  // Real photo library: content images (skip logos/icons/sprites) — usually the
  // strongest differentiator on a bespoke public site.
  const photos = [...document.querySelectorAll("img")]
    .map((i) => i.currentSrc || i.src)
    .filter((s) => s && !/logo|icon|sprite|svg/i.test(s));
  return { colors, fonts, logo, photos: [...new Set(photos)].slice(0, 40) };
});

// --- Page inventory (internal nav) ---
const pages = await page.evaluate(() => {
  const host = location.host;
  const seen = {};
  for (const a of document.querySelectorAll("a[href]")) {
    try {
      const u = new URL(a.href, location.href);
      const text = a.textContent.trim();
      if (u.host === host && text && text.length < 80) seen[u.pathname] ??= text;
    } catch {}
  }
  return seen;
});

const meta = await page.evaluate(() => ({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.content ?? "",
}));

await writeFile(
  `${outDir}/site-audit.json`,
  JSON.stringify({ url, ...meta, ...brand, pages, scrapedAt: new Date().toISOString() }, null, 2),
);

console.log("Audit:", `${outDir}/site-audit.json`);
console.log("Colors:", Object.keys(brand.colors).length, "Fonts:", Object.keys(brand.fonts).length);
await browser.close();
```

If the in-repo Playwright isn't set up yet, you may also drive the browser interactively with the `mcp__plugin_playwright__*` MCP tools (navigate, take_screenshot, evaluate) to pull the same signals.

**Logo download + optimization.** Download the logo candidate, then process variants with `sharp` (see `client-image-optimization`):

```js
import sharp from "sharp";
await sharp("docs/brand-assets/_audit/logo-raw.png")
  .resize({ width: 512, withoutEnlargement: true })
  .png()
  .toFile("docs/brand-assets/logo.png");
```

**Harvest the real photo library** (not just the logo). Download the `photos` candidates to `docs/brand-assets/photos/`, and write a one-paragraph **visual signature** in `BRAND-GUIDE.md` — the recurring look (e.g. "high-key daylight on linen" + "B&W heritage portraits") — so a bespoke public design is built on real imagery with one consistent treatment (`frontend-public-site-conventions` → "Build on the client's real photography"). If photos can't be fetched, record imagery as a human-blocked open item — never plan around stock/AI images.

## Step 3 — Write docs/BRAND-GUIDE.md

```markdown
# Brand Guide — {Client Name}

## Source
Extracted from {url} on {date} via Playwright computed-style audit + screenshots.

## Colors
| Role       | Value     | Notes |
|------------|-----------|-------|
| Primary    | #XXXXXX   |       |
| Secondary  | #XXXXXX   |       |
| Accent     | #XXXXXX   |       |
| Background | #XXXXXX   |       |
| Text       | #XXXXXX   |       |

## Typography
| Role     | Font      | Source       |
|----------|-----------|--------------|
| Headings | {font}    | Google Fonts |
| Body     | {font}    | Google Fonts |

These map directly to Tailwind v4 tokens — see `stack-tailwind-tokens` to wire them into `@theme`.

## Logo
- File: `brand-assets/logo.png` (+ optimized variants)
- Background: transparent / solid

## Photography
- Library: `brand-assets/photos/` ({count} images)
- Visual signature: {the recurring look — e.g. "high-key daylight on linen grounds" + "B&W heritage portraits"}
- Treatment to apply site-wide: {one consistent tone/grain/contrast recipe}

## Tone
{Formal / casual / technical — observed from site copy.}

## Open Items (human-blocked)
- [ ] {e.g. "Vector logo source — brand colors unverifiable from raster only"}
```

## Step 4 — Write docs/PROJECT-BRIEF.md

```markdown
# Project Brief — {Client Name}

## Client
- Name: {client name}
- Business: {what they do}
- Current site: {url or "none"}

## Scope
- Type: New build / Redesign / Migration
- Priority: {HIGH/MEDIUM/LOW}
- Timeline: {if known}

## Current Site Analysis
- Pages: {count} identified
- Content quality: keep / rewrite / mixed
- Mobile responsive: Yes / No / Partial

## Page Inventory

Capture the **real content blocks** on each page (hero copy, sections, offerings, story text, hours, team/purveyor lists, legal/allergen notices, menus/price lists — including content trapped in PDFs/images), not just the page list. This is the source for the spec's content-parity check (`workflow-brainstorm`), which verifies nothing real is silently dropped in a redesign.

| Page    | Path     | Keep      | Content blocks (real copy/sections) | Notes |
|---------|----------|-----------|-------------------------------------|-------|
| Home    | /        | Redesign  | {hero copy, intro, services, hours} |       |
| About   | /about   | Keep copy | {founder story verbatim, values}    |       |
| Contact | /contact | Rebuild   | {address, hours, phone, map}        |       |

## Requirements
- [ ] {requirement}

## Stack
Persimmon standard stack (Next.js 16, TS strict, Prisma + Postgres/pgvector,
NextAuth v5, Tailwind v4, Zod, Anthropic Claude SDK, S3 storage, Railway, GitHub Actions).
Note any deltas from the SOW here.

## Brand Assets
See `BRAND-GUIDE.md`.

## Open Questions
- [ ] {question}
```

## Step 5 — Artifact Lifecycle

| Artifact | Location | Lifecycle |
|---|---|---|
| `PROJECT-BRIEF.md` | `docs/` | **Permanent, living.** Update as scope confirms; resolve open questions inline. |
| `BRAND-GUIDE.md` | `docs/` | **Permanent, living.** Promote from open-item to final once assets confirmed. |
| Brand assets (logo, images) | `docs/brand-assets/` | **Permanent.** Source + optimized variants. |
| Real photo library (harvested) | `docs/brand-assets/photos/` | **Permanent.** The client's actual photos — a primary design input for bespoke public pages (`frontend-public-site-conventions`). Keep originals; `client-image-optimization` derives variants. |
| Reference screenshots | `docs/brand-assets/reference/` | **Keep until launch**, then optional. |
| Raw scrape (`site-audit.json`, raw logo) | `docs/brand-assets/_audit/` | **Transient.** Delete after the durable docs are populated. Add `docs/brand-assets/_audit/` to `.gitignore` — never commit raw scrapes. |

When onboarding finishes, clean up `_audit/` so the next reader isn't confused about what's authoritative.

## One-Screen Defaults

- Playwright over text scraping for any public-facing redesign.
- Computed styles, not regex over HTML, for the real palette.
- Two screenshots (1440px + 390px) per key page → `reference/`.
- Brand can't be extracted → open items, never invented colors.
- `_audit/` is gitignored and deleted at the end.

## Anti-patterns banned

- Inventing a palette/typeface when extraction failed (record open items instead).
- Committing raw scrape JSON / fetched HTML to the repo.
- Text-only scraping (WebFetch) as the sole brand source — it loses all visual brand.
- Treating `PROJECT-BRIEF.md` / `BRAND-GUIDE.md` as throwaway — they are durable inputs the whole engagement reads.
- Re-running the scraper instead of reading the already-written brief.
- Creating the repo here — that's `meta-new-client-project`.

## Cross-references

- **meta-new-client-project** — creates the repo + folder skeleton this skill populates.
- **meta-document-project** — keeps `docs/` coherent as the engagement evolves.
- **client-image-optimization** — `sharp` logo/asset processing.
- **stack-tailwind-tokens** — turns the brand guide palette into `@theme` tokens.
- **client-seo** / **client-analytics** — launch-time concerns for the new site.
