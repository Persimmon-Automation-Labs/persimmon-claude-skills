---
name: tailwind-v4-tokens
description: Tailwind CSS v4 design tokens and CSS-first configuration for the Persimmon stack. Use when setting up a new project's theme, defining color/type/spacing tokens, migrating from v3's `tailwind.config.ts`, using `@theme` vs `@theme inline`, adding container queries, enforcing on-scale values, or debugging missing utility classes. Covers the single-import setup, custom token naming (`--color-*`, `--font-*`), and utility-vs-component-class discipline.
---

# Tailwind CSS v4 Design Tokens — Persimmon Patterns

Tailwind v4 moves configuration from `tailwind.config.ts` into CSS. One `globals.css`, one `@theme` block, done. No more JS config, no more `content: [...]` globs (v4 auto-detects). This skill is the Persimmon house style on top of v4's conventions.

## Setup — Single File

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  /* Colors */
  --color-ink: #1a1a1a;
  --color-bone: #f5f1e8;
  --color-oxblood: #8b1e3f;
  --color-brass: #c19b4a;
  --color-rule: #d4cfc2;

  /* Typography */
  --font-serif: "Fraunces", ui-serif, Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;

  /* Type scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;

  /* Spacing — 4px base, keep it short. Off-scale is a smell. */
  --spacing: 0.25rem;

  /* Radii — Persimmon default: sharp editorial. Zero radius. */
  --radius-none: 0;
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;

  /* Borders */
  --border-width-hairline: 1px;

  /* Shadows — flat by default */
  --shadow-none: none;
}
```

That's it. No `tailwind.config.ts`. No PostCSS plugin list (handled by `@tailwindcss/postcss` or the Vite/Next plugin).

### `package.json` — the minimal Tailwind v4 deps

```json
{
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

For Next.js 16:

```js
// postcss.config.mjs
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

Next's built-in CSS pipeline picks this up automatically. Don't add `autoprefixer` — v4 includes it.

## Token Naming Rules

Tailwind v4 auto-generates utilities from `--color-*`, `--font-*`, `--text-*`, `--spacing-*`, `--shadow-*`, `--radius-*`, etc. The prefix is load-bearing.

| Prefix | Generates | Example |
|---|---|---|
| `--color-{name}` | `bg-{name}`, `text-{name}`, `border-{name}`, etc. | `--color-oxblood` → `bg-oxblood` |
| `--font-{name}` | `font-{name}` | `--font-serif` → `font-serif` |
| `--text-{name}` | `text-{name}` (size) | `--text-xl` → `text-xl` |
| `--spacing-{name}` | all spacing utilities scale from this | see below |
| `--shadow-{name}` | `shadow-{name}` | `--shadow-sm` → `shadow-sm` |
| `--radius-{name}` | `rounded-{name}` | `--radius-lg` → `rounded-lg` |
| `--breakpoint-{name}` | custom screens | `--breakpoint-3xl: 120rem;` → `3xl:` |

**Name tokens by semantic role, not appearance.** `--color-ink` not `--color-almost-black`. `--color-oxblood` not `--color-dark-red`. The names tell future readers what the token is FOR.

## Spacing — One Base, All Derived

v4's spacing is a single multiplier. Set `--spacing: 0.25rem;` and every utility becomes `n * 0.25rem`:

- `p-1` → 0.25rem
- `p-4` → 1rem
- `p-8` → 2rem
- `p-[5]` → 1.25rem (arbitrary numeric)
- `p-[17px]` → off-scale, lint rule should flag

Never add more custom `--spacing-*` vars. If the design needs 0.125rem increments, set `--spacing: 0.125rem` and adjust all numeric utilities proportionally. The scale must stay homogeneous — mixing 4px and 3px increments is how design systems rot.

## `@theme` vs `@theme inline`

```css
@theme {
  --color-brand: #8b1e3f;
}
```

- Generates utilities AND exposes the variable in `:root`.
- Variable is available to custom CSS: `color: var(--color-brand);`
- Variable value is resolved (if it references other vars, they're computed once).

```css
@theme inline {
  --color-brand: var(--color-oxblood);
}
```

- Generates utilities but does NOT flatten the reference.
- Utilities emit `var(--color-oxblood)` instead of the resolved value.
- Use when one token aliases another AND you want cascading overrides (e.g. dark mode redefining `--color-oxblood`).

**Default to `@theme`.** Use `@theme inline` only for true aliases in theming systems.

## Enforcing On-Scale Values

Off-scale values (`p-[17px]`, `text-[13px]`) are the #1 sign of design-system drift. Prevent them.

### Option A — ESLint rule (Tailwind plugin)

```json
// .eslintrc.json
{
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-custom-classname": "error",
    "tailwindcss/no-contradicting-classname": "error"
  }
}
```

### Option B — regex grep in CI

```bash
# Fails CI if any arbitrary-value square brackets exist in source (except data attrs)
! grep -rn --include='*.tsx' --include='*.ts' -E '(class|className)=[^>]*\[[0-9]+(px|rem|em)\]' src
```

### Option C — review discipline

If a designer wants `17px`, either a token is missing or the design is wrong. Add the token or push back.

## Container Queries (`@container`)

v4 has native container queries. Use them — media queries are coarse.

```css
@theme {
  --container-3xs: 16rem;
  --container-2xs: 18rem;
  /* Tailwind auto-registers @3xs, @2xs, @xs, @sm, @md, @lg, @xl, @2xl, @3xl ... */
}
```

```tsx
<section className="@container">
  <article className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
    {/* ... */}
  </article>
</section>
```

Works in Server Components, no JS cost. Prefer over `md:`/`lg:` for component-level responsive behavior.

## Utility vs Component-Class Discipline

**Default**: everything is utilities. No `.btn`, no `.card`.

**Exception**: when a pattern appears 3+ times AND has 4+ utilities AND all instances are semantically identical, extract with `@utility` (v4) or a React component (preferred).

```css
/* v4 syntax — new utility */
@utility btn-primary {
  @apply inline-flex items-center gap-2 px-4 py-2 font-sans text-sm;
  background: var(--color-oxblood);
  color: var(--color-bone);
}
```

Use `@apply` sparingly. Most of the time, make a React component:

```tsx
export function Button({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="inline-flex items-center gap-2 border border-ink px-4 py-2 font-sans text-sm hover:bg-ink hover:text-bone transition"
    >
      {children}
    </button>
  );
}
```

Component beats utility class because:

- Variants are props, not class combinations.
- Ref forwarding, a11y attributes, and imperative control are natural.
- TypeScript types the API.

## Migration from v3

If inheriting a v3 codebase:

1. Delete `tailwind.config.ts` (back it up first).
2. Move theme extensions into `@theme {...}` in `globals.css`:
   - `colors.brand.500` → `--color-brand-500`
   - `fontFamily.serif` → `--font-serif`
   - `fontSize.xl` → `--text-xl`
3. Change the CSS entry from `@tailwind base; @tailwind components; @tailwind utilities;` to `@import "tailwindcss";`.
4. Remove `postcss.config.js` `tailwindcss: {}` and replace with `@tailwindcss/postcss`.
5. Upgrade packages: `npm i -D tailwindcss@^4 @tailwindcss/postcss@^4`.
6. Hunt for v3-only plugins (`@tailwindcss/forms`, `@tailwindcss/typography`) — most have v4 equivalents as imports inside `globals.css`:
   ```css
   @import "tailwindcss";
   @plugin "@tailwindcss/typography";
   ```
7. Run `npm run build` and fix missing utilities. v4 dropped some v3 edge cases.

### Known v3→v4 gotchas

- `content: [...]` is gone. v4 uses automatic scanning. If utilities don't appear, check that files end in `.ts/.tsx/.js/.jsx/.html` and aren't in `.gitignore`.
- `ring-*` semantics changed. `ring` without color now uses `--color-ring` — add it to `@theme`.
- Default border color. v3 was `currentColor`, v4 is a gray. If your app relied on the default, set `--color-border` or add borders with explicit colors.
- `bg-white`/`text-gray-*` still exist but Persimmon convention bans them — use semantic tokens (`bg-bone`, `text-ink`).

## Persimmon House Tokens (Reference Scaffold)

Drop this into a new Persimmon project and tweak per client:

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  /* Palette — editorial/archival */
  --color-ink: #1a1a1a;
  --color-bone: #f5f1e8;
  --color-oxblood: #8b1e3f;
  --color-brass: #c19b4a;
  --color-rule: #d4cfc2;
  --color-moss: #4a5d3a;       /* success */
  --color-rust: #a84a2e;       /* warning */

  /* Families */
  --font-serif: "Fraunces", ui-serif, Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;

  /* Type scale — editorial */
  --text-xs: 0.75rem;     /* 12 — fine print, labels */
  --text-sm: 0.875rem;    /* 14 — captions, meta */
  --text-base: 1rem;      /* 16 — body */
  --text-lg: 1.125rem;    /* 18 — emphasized body */
  --text-xl: 1.25rem;     /* 20 — H4 */
  --text-2xl: 1.5rem;     /* 24 — H3 */
  --text-3xl: 1.875rem;   /* 30 — H2 */
  --text-4xl: 2.25rem;    /* 36 — H1 */
  --text-5xl: 3rem;       /* 48 — display */

  /* Spacing base */
  --spacing: 0.25rem;

  /* Radii — sharp, no rounding */
  --radius-none: 0;

  /* Borders — hairline is the default rule */
  --border-width-hairline: 1px;

  /* Shadows — flat */
  --shadow-none: none;
}

/* Global base styles — minimal */
@layer base {
  html {
    font-family: var(--font-sans);
    color: var(--color-ink);
    background: var(--color-bone);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4 {
    font-family: var(--font-serif);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--color-rule);
  }
}
```

This gives you, out of the box, utilities like:

- `bg-ink` / `bg-bone` / `bg-oxblood`
- `text-ink` / `text-oxblood` / `text-moss`
- `border-rule`
- `font-serif` / `font-sans`
- `text-xs` … `text-5xl` (overriding Tailwind defaults with on-brand sizes)

## Anti-Patterns

### `tailwind.config.ts` in a v4 project

If it exists, delete it. v4 ignores it. Its presence confuses future readers.

### `bg-white`, `text-gray-500`, `bg-black`

Off-brand. Always use semantic tokens. CI should grep for these and fail.

```bash
! grep -rn --include='*.tsx' -E '\b(bg-white|bg-black|text-gray-[0-9]+|bg-gray-[0-9]+)\b' src
```

### Arbitrary hex in className

```tsx
// WRONG
<div className="bg-[#8b1e3f]">

// RIGHT — add to theme, reference by name
<div className="bg-oxblood">
```

If the color exists nowhere else, it still belongs in `@theme`. Future you will thank present you.

### `@apply` cascades 10 layers deep

If a `.btn` does `@apply btn-base btn-primary btn-large rounded-md shadow-sm ...`, it's time to become a React component.

### Adding shadows and radii "just this once"

Persimmon's default is flat + sharp. Every shadow and radius is a deliberate deviation, discussed with the client, documented in the design-system doc. Not a drive-by.

### Inline style objects for anything themeable

```tsx
// WRONG
<div style={{ color: "#1a1a1a", fontFamily: "Fraunces" }}>

// RIGHT
<div className="text-ink font-serif">
```

## Checklist for a New Project's Theme

- [ ] `globals.css` has `@import "tailwindcss";` as the first line
- [ ] Single `@theme` block with all tokens
- [ ] Every color has a semantic name, not a visual one
- [ ] `--spacing` set once, drives all spacing utilities
- [ ] Type scale defined with `--text-{xs..5xl}`
- [ ] Font families declared with `--font-{serif,sans,mono}`
- [ ] Radii / shadows documented (even if zeroed out)
- [ ] `@layer base` sets html/body defaults once
- [ ] CI grep blocks `bg-white` / `bg-black` / `text-gray-*`
- [ ] CI grep blocks arbitrary values `[17px]` / `[#abc]`
- [ ] No `tailwind.config.ts` in the repo

## Cross-References

- **nextjs-server-actions** — components that render these tokens
- **typescript-strict-patterns** — typing props that accept token-based classNames
