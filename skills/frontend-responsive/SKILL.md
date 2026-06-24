---
name: frontend-responsive
description: Responsive navigation and layout conventions for Persimmon Next.js 16 + React + Tailwind v4 sites — sidebar for internal tools vs top nav for public sites, the hamburger pattern, breakpoint standards, and mobile-first structure. Use when building or modifying nav, layout containers, sidebars, or anything that adapts across screen widths. Covers the 4-layer responsive playbook (intrinsic grid → container queries → control min-width → media queries), accessible hamburger with focus trap, sidebar active-state triple cue, and the tablet in-between zone. Trigger keywords: sidebar, top nav, hamburger menu, breakpoints, mobile layout, responsive, drawer, nav wraps, collapse to icon rail, container query.
---

# Frontend Responsive Conventions — Persimmon Patterns

Persimmon's two frontends use different nav patterns and adapt differently. This skill owns the responsive rules; `frontend-internal-tool-conventions` and `frontend-public-site-conventions` reference here for behavior. Tokens come from `stack-tailwind-tokens`; CSS layering from `frontend-css-architecture`.

Build nav and layout as Server Components where possible; mark only the interactive shell (`"use client"`) for the hamburger toggle, drawer state, and focus trap. Tailwind v4 prefers **container queries** (`@container`) for component-level responsiveness — use them over media queries except for top-level chrome.

## Defaults at a glance

| | Internal tool | Public site |
|---|---|---|
| Desktop nav | Left sidebar, 256px expanded | Top nav, 64px height, single line |
| Tablet (768–1023px) | Sidebar → 64px icon rail (tooltips) | Top nav, hamburger if it won't fit one line |
| Mobile (<768px) | **Hamburger top-LEFT**, 288px sheet slides from left (matches sidebar) | **Hamburger top-RIGHT**, drawer slides from right |
| Sticky? | Sidebar always visible; main content scrolls | Top nav sticky on scroll; smart-hide on mobile |

## Breakpoint standard

Tailwind's set is the industry default and ships built in — use the prefixes directly:

| Prefix | Min-width | Use |
|---|---|---|
| `sm:` | 640px | large phone landscape |
| `md:` | 768px | tablet portrait |
| `lg:` | 1024px | tablet landscape / small laptop |
| `xl:` | 1280px | desktop |
| `2xl:` | 1536px | large desktop |

Mobile-first only — Tailwind utilities are min-width by default; never reach for `max-*` variants in the same project unless a chrome toggle genuinely needs it. Add custom breakpoints in `@theme` (`--breakpoint-3xl: …`) only when a real layout demands it.

## The 4-layer responsive playbook

Most "responsive" problems reach for media queries (Layer 4) when a lower layer is the answer. Viewport breakpoints are the **heaviest** tool — use them last, for top-level chrome only.

### Layer 1 — intrinsic grid (no breakpoints at all)

Cards/tiles reflow with `auto-fit` + `minmax()` + the `min(100%, X)` overflow guard:

```tsx
<div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
  {cards}
</div>
```

`auto-fit` collapses empty tracks (1 item fills the row); `minmax(_,1fr)` lets cells flex evenly; `min(100%, 280px)` prevents horizontal scroll when the container is narrower than 280px. For card grids, `auto-fit` is almost always right over `auto-fill`.

### Layer 2 — container queries (component-level)

A component knows its *container*, not the viewport — a card that's wide in the main column should restack in a 300px sidebar. Tailwind v4 has native container queries:

```tsx
<section className="@container">
  <article className="flex flex-col @md:flex-row @md:gap-6">{/* … */}</article>
</section>
```

Use container queries for cards, list rows, KPI tiles, modal contents, any widget that might also appear in a sidebar. Use media queries only for top-level page layout (sidebar visibility, nav collapse).

### Layer 3 — `min-width` on form controls (prevents flex squish)

Inside a flex parent an `<input>` can shrink below readable size. Lock a minimum:

```tsx
<input className="min-w-[180px] …" />   {/* search/text */}
<select className="min-w-[140px] …" />  {/* dropdowns */}
```

Without this, a 4-filter row in a narrow column squishes each input to ~80px. With it, the row wraps to a second line (which the filter bar handles — see `frontend-data-tables`).

### Layer 4 — viewport breakpoints (chrome only)

| Problem | Right layer |
|---|---|
| Card grid should reflow | Layer 1 |
| Component appears in multiple containers | Layer 2 |
| Form control disappears in narrow flex parent | Layer 3 |
| Sidebar collapses on small viewport | Layer 4 (media/`lg:`) |
| Hamburger appears below the fit width | Layer 4 |

Reserve Layer 4 for chrome (nav, sidebar visibility). Most responsive wins come from Layers 1–3.

## Left sidebar (internal tools)

Widths (industry-converged): desktop expanded **256px**, tablet icon rail **64px** (tooltips mandatory — icon-only nav is unusable for new users without them), mobile sheet **288px** as an overlay (not push — push causes layout jank).

Behavior:
- Full sidebar at `≥1024px` (`lg:`), icon rail at 768–1023px, hidden behind a hamburger below 768px (opens as overlay sheet).
- The sidebar body **scrolls independently** of main content — sticky logo header + sticky user/settings footer inside the sidebar, scrollable middle. Use `h-screen sticky top-0 overflow-y-auto`.
- Item height **36px desktop** (mouse-targeted; 44px wastes space), **44px in the mobile sheet** (touch).

**Active state — triple cue** (single color cue fails WCAG 1.4.1 and colorblind users):

```tsx
<a
  href="/processes"
  aria-current={isActive ? "page" : undefined}
  className={
    "flex h-9 items-center gap-2 border-l-2 px-3 text-sm " +
    (isActive ? "border-oxblood bg-oxblood/10 text-ink" : "border-transparent text-ink/70")
  }
>
  {isActive ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
  Processes
</a>
```

The three cues: background fill (low-opacity brand) + colored left bar (2px) + filled icon variant (vs outline default — see `frontend-internal-tool-conventions`).

Section grouping: 3–7 items per group, uppercase 11–12px section label, 16–24px gap between groups; avoid >10 items without grouping.

## Top nav (public sites)

Height **64px desktop, 56px mobile**; never exceed 80px (eats hero space). Layout left→right: logo · nav items · secondary link ("Sign in") · primary CTA far right.

Sticky on scroll for long marketing pages, with smart-hide on mobile (hide on scroll-down, show on scroll-up). Add a subtle border/shadow when it becomes sticky to separate from content.

### Keeping it on one line

The top nav must **never** wrap to a second line and **never** break a label mid-word.

```tsx
<ul className="flex flex-nowrap min-w-0 items-center gap-6">
  <li><a className="whitespace-nowrap" href="/services">Services</a></li>
  {/* … */}
</ul>
```

1. Every link gets `whitespace-nowrap` — labels never break.
2. The list is `flex flex-nowrap` — the row never wraps.
3. **The hamburger breakpoint is content-driven, not a magic 1024px.** It is whatever width the full nav *would otherwise start to wrap* — a 7-item nav with long labels plus a CTA often needs the hamburger well above 1024px (~1100–1200px). Measure your actual nav; set the cutoff just above where it stops fitting. Use an arbitrary variant if needed: `max-[1100px]:hidden` on the list, `max-[1100px]:inline-flex` on the trigger.
4. When it doesn't fit, **collapse to the hamburger — never wrap, never silently drop primary destinations.** If a desktop nav genuinely can't fit its destinations on one line, the fix is information architecture (fold under groups), not a wrapping nav.

## Hamburger — done right, every time

The most-broken pattern on the web. These rules are non-negotiable.

### Trigger

- **Placement follows the desktop nav:** internal tools (left sidebar) → hamburger **top-LEFT**, drawer from the left (matches the mental model "the sidebar is hidden behind this button"). Public sites (top nav) → hamburger **top-RIGHT**, drawer from the right (top-left would fight the logo).
- Never bottom on web (that's an app pattern). Icon: three lines. Pair with the word "Menu" when space allows.
- A real `<button>` (never a `<div>`), minimum **44×44px** target.

```tsx
"use client";
import { Menu } from "lucide-react";

<button
  type="button"
  aria-label={open ? "Close menu" : "Open menu"}
  aria-expanded={open}
  aria-controls="nav-drawer"
  onClick={() => setOpen((o) => !o)}
  className="grid h-11 w-11 place-items-center"
>
  <Menu className="h-6 w-6" aria-hidden />
</button>
```

### Drawer

Slide in from the **same side the trigger sits on** (left for internal-tool sheet, right for public drawer), **~240ms ease-out** (>300ms feels broken). Width **288px** (sidebar sheet) or **80vw / full-width** (public drawer). Backdrop fades in behind.

### Closing — all four must work

1. X icon top-corner of the drawer (≥44px)
2. Tap the backdrop
3. Swipe-to-dismiss on mobile
4. **ESC key**

On close, **return focus to the trigger button**. While open, **trap focus** inside the drawer (Tab cycles within; Shift+Tab backward). A small headless library (e.g. Radix Dialog) gives focus-trap, ESC, backdrop, and `aria-*` for free — prefer it over hand-rolling:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
// Dialog.Root manages open state, focus trap, ESC, and backdrop close.
```

### Never

- **Never on desktop** when the nav fits — hamburger on desktop costs users seconds per task and cuts engagement. Only collapse below the content-driven fit width.
- **Never hide the primary CTA** inside the hamburger — keep "Contact"/"Sign up" visible next to the trigger on mobile.
- Never a `<div>` trigger (no keyboard/SR support). Never skip `aria-expanded`/`aria-controls`/`aria-label`.

## Tablet middle ground (768–1023px, and just above)

**The most broken zone — and the one desktop+mobile previews never catch.** Test at **768, 900, 1024, and ~1100px** every time.

- **Internal:** icon-rail mode (64px sidebar, hover tooltips).
- **Public:** full nav must still be **one line** here; if it doesn't fit, collapse to the hamburger at this width — never wrap or stack labels.
- **Side gutters must hold** — content keeps its `px-[clamp(...)]` gutter and never touches the screen edge (see `frontend-css-architecture` → "Content never touches the viewport edge"). This zone is where the gutter is most often lost.

## Mobile bottom tab bar — for app-like internal tools

For internal tools with ≤5 **frequent** sections — the screens an operator touches multiple times per session — a **bottom tab bar** is the best-practice mobile pattern (the iOS/Android native app convention). When to choose it over a hamburger:

| Pattern | When | Why |
|---|---|---|
| **Bottom tab bar** | ≤5 sections, all roughly equal frequency, app-like cadence | Thumb-reachable, single tap, always visible — operators don't have to hunt |
| **Hamburger drawer** | >5 sections, or a public/occasional-use tool | Bottom bar with >5 items loses meaning; hamburger scales |

Implementation: `fixed bottom-0` bar with icon + label tabs (44px touch targets, `aria-current="page"` on the active tab). The desktop sidebar stays unchanged — the bottom bar is a mobile-only override (hidden at `md:` and above). Record the choice in `.claude/project-rules.md` so it doesn't get reversed later.

**Section hubs as the complement:** on desktop, a section hub (a landing page for a major category) can replace a dedicated sidebar group — the hub lists the sub-sections as a card grid. On mobile, the hub is the "section home" you reach from the bottom tab. This keeps the nav flat and avoids the nested hamburger → sub-menu pattern.

## Anti-patterns banned

- Hamburger on desktop when the nav fits
- Fixed nav >80px tall
- Sidebar that scrolls with the page body (must scroll independently)
- `<div>` hamburger triggers; missing `aria-*`
- Icon-only collapsed sidebar with no tooltips
- Primary CTA hidden inside the hamburger
- Nav open/close animations >300ms
- Mixing min-width and max-width approaches inconsistently across the project
- Single-cue (color-only) active sidebar state
- Content touching the viewport edge in the tablet zone

## Cross-references

- `frontend-css-architecture` — CSS layering, container gutters, dark mode, `next/font`
- `stack-tailwind-tokens` — breakpoints, spacing, color tokens used here
- `frontend-internal-tool-conventions` — sidebar icon/color choices, active-state styling
- `frontend-public-site-conventions` — top-nav typography/color choices
- `frontend-data-tables` — the filter-bar wrap behavior referenced in Layer 3
- `frontend-page-templates` — page anatomy the sidebar + action bar wrap
