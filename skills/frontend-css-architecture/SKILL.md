---
name: frontend-css-architecture
description: How to organize CSS for a Persimmon Next.js 16 + Tailwind v4 project — file structure, theme layering, dark mode, and font loading with next/font. Use when scaffolding a project's styles, deciding which file a value belongs in, setting up @layer order, adding dark mode, loading Google or self-hosted fonts in the App Router, or untangling duplicated/hardcoded style values. Does NOT define the token scale — cross-links stack-tailwind-tokens for the @theme tokens. Trigger keywords: globals.css, @layer, @theme, dark mode, next/font, font loading, CSS file structure, where does this style go, prevent style duplication, FOUT.
---

# Frontend CSS Architecture — Persimmon Patterns

How to structure styles for a Persimmon project so a value lives in one place and propagates everywhere. Tailwind v4 collapses most "CSS architecture" into a single `globals.css` with a `@theme` block — this skill owns **file structure, `@layer` order, dark mode, and font loading**. It does **not** define which tokens to use: the token scale (`--color-*`, `--font-*`, `--text-*`, spacing, radii) lives in `stack-tailwind-tokens`. Read that for the values; read this for the wiring.

## The zero-duplication promise

Every design value is declared **once**, in the `@theme` block of `globals.css` (see `stack-tailwind-tokens`). Components reference Tailwind utilities generated from those tokens (`bg-oxblood`, `text-ink`, `gap-4`) — never raw hex or arbitrary values. Changing a client's brand color is a one-line edit in `@theme`; every utility updates. If you find yourself writing `bg-[#8b1e3f]` or a hardcoded hex in two files, the value belongs in `@theme`.

## File structure

Tailwind v4 + Next 16 needs far fewer files than a vanilla setup — no `tokens.css`/`theme.css`/`base.css` split. One stylesheet, structured with `@layer`:

```
src/
  app/
    globals.css        ← the ONLY global stylesheet. Imported once in layout.tsx.
                          Holds @import "tailwindcss", the @theme token block,
                          and @layer base element defaults.
    layout.tsx         ← imports globals.css; loads fonts via next/font.
  components/
    ui/                ← reusable React components (Button, Input, Badge).
                          Variants are props, not utility-class soup. Preferred
                          over @utility/@apply (see stack-tailwind-tokens).
```

Per-client overrides are **not** a separate file — they are edits to the `@theme` block (brand color, font family). Document non-obvious deviations in `docs/decisions/`.

```tsx
// src/app/layout.tsx
import "./globals.css";
```

That single import is the whole CSS pipeline. Next + `@tailwindcss/postcss` handle the rest; no `tailwind.config.ts`, no manual `autoprefixer`.

## `@layer` order inside globals.css

Order matters for cascade resolution. Keep this shape:

```css
/* src/app/globals.css */
@import "tailwindcss";          /* must be first — pulls in base/components/utilities layers */

@theme {
  /* token scale — see stack-tailwind-tokens (do not duplicate here) */
}

@layer base {
  /* element defaults: html/body, headings, hr, tabular figures.
     Uses var(--token) / @apply only — never literals. */
  html {
    font-family: var(--font-sans);
    color: var(--color-ink);
    background: var(--color-bone);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.01em; }
  table, .kpi, [data-tabular] { font-variant-numeric: tabular-nums lining-nums; }
}

/* @utility — only for a pattern that is 3+ uses AND 4+ utilities AND identical
   everywhere. Prefer a React component. See stack-tailwind-tokens. */
@utility prose-measure { max-width: 70ch; }
```

Reach for `@apply`/`@utility` rarely — a reusable visual pattern should be a typed React component in `src/components/ui/`, where variants are props and a11y attributes are natural. `@layer base` is for genuine element-wide defaults only.

## Where a value belongs — decision tree

1. A design primitive used 2+ places (color, font, size, radius)? → the **`@theme` block** (`stack-tailwind-tokens`).
2. A client-specific value? → still the `@theme` block — edit the token, don't fork CSS.
3. An element default for every `<h1>`/`<body>`? → **`@layer base`** in `globals.css`.
4. A reusable visual pattern (button, card, badge)? → a **React component** in `components/ui/`.
5. A one-off layout for a single page? → Tailwind utilities inline in that `page.tsx`.

If you can't decide #1 vs a one-off: "Will any other Persimmon project reuse this value?" Yes → token. No → inline utility.

## Font loading with `next/font` (App Router)

In Next 16, **never** use a raw `<link href="fonts.googleapis.com">` or a manual `@font-face` for app fonts. `next/font` self-hosts the files at build time, eliminates the extra network request, removes layout shift by generating a size-adjusted fallback, and exposes the family as a CSS variable that feeds straight into `@theme`.

### Google-hosted fonts

```tsx
// src/app/layout.tsx
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",   // exposes the family as a CSS variable
  weight: "variable",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${instrumentSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Then in `globals.css`, the `@theme` token *consumes* the variable `next/font` defined:

```css
@theme {
  --font-serif: var(--font-serif), Georgia, serif;   /* next/font var + fallback stack */
  --font-sans:  var(--font-sans), system-ui, sans-serif;
}
```

(Name your `next/font` `variable` to match the token name so the chain is obvious.)

### Self-hosted / licensed fonts

For a paid or client-provided face, use `next/font/local`:

```tsx
import localFont from "next/font/local";

const sohne = localFont({
  src: [
    { path: "../fonts/soehne-regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/soehne-medium.woff2",  weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sans",
});
```

Put `.woff2` files under `src/fonts/`. **WOFF2 only** — drop legacy formats. Verify the web license before shipping a client's licensed face.

### Rules

- **`display: "swap"`** always — show the fallback immediately, swap when the font loads. Never block render.
- **`next/font` only** for app fonts — it self-hosts, preloads the used subset, and kills CLS automatically. No manual `preconnect`/`preload`/`@font-face`.
- **Variable fonts** when available — one file covers all weights.
- Cap **2 families + mono** (see the convention skills). Each family is a download and a CLS risk.

## Dark mode

**Light is the Persimmon default for every project.** Dark mode is opt-in — added when a client asks or an ops tool's operators want it. Wire it once; only **primitive tokens flip**, and every semantic utility follows through the `var()` chain.

Two triggers, both supported with one CSS block: OS preference (`prefers-color-scheme`) and an explicit user toggle (a `data-theme`/`class` attribute persisted in `localStorage`).

```css
/* globals.css — after the @theme block */
:root { color-scheme: light dark; }

/* OS preference, when the user hasn't explicitly chosen light */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-ink: #f5f1e8;
    --color-bone: #14110d;
    --color-rule: #3a3530;
  }
}

/* explicit user toggle wins over OS */
[data-theme="dark"] {
  --color-ink: #f5f1e8;
  --color-bone: #14110d;
  --color-rule: #3a3530;
}
```

Prevent the flash-of-wrong-theme by setting the attribute **before** first paint. In the App Router, an inline script in `<head>` runs before hydration:

```tsx
// src/app/layout.tsx — inside <head>
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var s=localStorage.getItem('theme');var m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=s||m;}catch(e){}})();`,
  }}
/>
```

A `"use client"` toggle button writes `localStorage.theme` and sets `document.documentElement.dataset.theme`. Both themes must independently pass WCAG 2.2 AA contrast (targets in `frontend-internal-tool-conventions`). Only redefine **primitive** color tokens in the dark block — never rewrite semantic or component-level styles.

## Content never touches the viewport edge

Every top-level section's content sits inside a container with horizontal padding at **every** width, including the tablet in-between zone where it's most often dropped. A full-bleed background is fine; its **content** keeps the side gutter.

```tsx
// a reusable container — fluid inline padding via clamp
<div className="mx-auto max-w-[1200px] px-[clamp(1rem,4vw,2rem)]">{children}</div>
```

See `frontend-responsive` for the tablet-zone gutter rule.

## What this skill does NOT cover

- The token values themselves (color/type/spacing scale) → `stack-tailwind-tokens`.
- Which fonts/colors to pick per project → `frontend-internal-tool-conventions` / `frontend-public-site-conventions`.
- Nav/layout responsiveness → `frontend-responsive`.
- Server-side data flow → `stack-server-actions`.

## Anti-patterns banned

- A `tailwind.config.ts` in a v4 project (delete it — v4 ignores it)
- A separate `tokens.css`/`theme.css` split (v4 puts tokens in `@theme` in `globals.css`)
- Raw `<link>` to Google Fonts or hand-rolled `@font-face` for app fonts (use `next/font`)
- Hardcoded hex or `bg-[#…]` arbitrary values where a token belongs
- Dark mode that rewrites semantic/component styles instead of flipping primitives
- Multiple global stylesheets imported across the app
- `@apply` cascades 5+ utilities deep instead of a React component
- Content running to the screen edge at any width

## Cross-references

- `stack-tailwind-tokens` — the `@theme` token scale, naming, on-scale enforcement (do not duplicate)
- `frontend-internal-tool-conventions` / `frontend-public-site-conventions` — which values to pick + contrast targets
- `frontend-responsive` — breakpoints, container gutters, nav layout
- `stack-server-actions` — the RSC/Server-Action layer these styles render
