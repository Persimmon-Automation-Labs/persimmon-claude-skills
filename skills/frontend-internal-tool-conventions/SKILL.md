---
name: frontend-internal-tool-conventions
description: Visual and UX conventions for Persimmon internal business tools — admin panels, CRMs, dashboards, ops consoles, operator UIs built in Next.js 16 + React + Tailwind v4. Optimizes for data density, scannability, and speed-of-use over emotional impact. Use when designing or reviewing any interface employees/operators use daily rather than the public — data tables, KPI cards, status badges, form controls, dark mode, icon choice. Covers tabular figures, semantic status colors, contrast targets, density spacing, lucide-react icons, and how to avoid the generated-admin-template ("AI slop") look. Trigger keywords: admin panel, dashboard, CRM, ops UI, status badge, KPI, internal tool design, data density.
---

# Internal Tool Conventions — Persimmon Patterns

Design rules for the interfaces a Persimmon client's *operators* use day after day — admin dashboards, CRMs, process managers, reporting tools, ops consoles. Different rules than a public marketing site: users return constantly, need to act fast, and care about data clarity over brand atmosphere.

This skill covers **what to pick** (values, components, behavior). For the token scale and CSS-first config, see `stack-tailwind-tokens` — do not re-specify tokens here. For nav/layout adaptation see `frontend-responsive`. For page scaffolds see `frontend-page-templates`.

## Internal tool vs public site

| Trait | Internal tool | Public site |
|---|---|---|
| Audience | Trained operators, return daily | First-time visitors |
| Goal | Complete a task fast, see data clearly | Build trust, convert |
| Visual priority | Density, hierarchy, scannability | Brand, emotion, atmosphere |
| Branding | Subtle — get out of the way | Front and center |
| Complexity tolerance | High — users learn the UI | Low — must read instantly |

Mostly tables, forms, filters, KPIs → internal tool (this skill). Mostly hero, story, CTAs → `frontend-public-site-conventions`.

## Typography

- **Sans-serif for all data UI.** Persimmon's `--font-sans` (see `stack-tailwind-tokens`) carries tables, forms, nav. Reserve `--font-serif` for page titles only, not table cells.
- **Tabular figures on every number.** Without this, KPI columns and money cells don't align and read like body text. Apply globally in `globals.css`:

```css
/* src/app/globals.css */
@layer base {
  table, .kpi, [data-tabular] {
    font-variant-numeric: tabular-nums lining-nums;
  }
}
```

- **One family target, hard cap two** (sans for everything + mono for IDs/code/diffs). A third voice fragments the system.
- Body 14px (`text-sm`) is acceptable in dense tables — internal tools run tighter than marketing. Never below 12px (`text-xs`) for actionable text.

## Color

Internal tools lean on **semantic color** (status, severity) more than brand color. Brand identifies the tool; semantic color carries the meaning operators act on.

### Palette structure

| Role | Count | Notes |
|---|---|---|
| Brand primary | 1 token + hover/active | Logo, primary buttons, active nav |
| Neutrals (ink/bone/rule scale) | Does ~80% of the work — text, surfaces, borders | from `stack-tailwind-tokens` |
| Semantic | 4 roles | success / warning / danger / info |
| Pending/neutral status | 1 | long-lived intermediate states |

Add `--color-success`, `--color-warning`, `--color-danger`, `--color-info` to the `@theme` block in `globals.css` (the Persimmon scaffold ships `--color-moss` success / `--color-rust` warning / `--color-oxblood` danger — extend as needed). Define semantic tokens by role, never by hue.

### Data-visualization rule

**Max 6 colors per chart, ideally 3–5.** Pull from a dedicated chart palette, not the brand scale, so categories don't compete with chrome. Always pair color with a second encoding (label, shape, pattern) for accessibility. Render charts in a `"use client"` component with `recharts` (or Chart.js); see `frontend-interaction-patterns`.

### Contrast targets (WCAG 2.2 AA)

| Surface | Minimum |
|---|---|
| Body text / most table rows | **4.5:1** |
| Large text (≥24px or ≥18.66px bold), UI components, icons, borders | **3:1** |
| Focus indicators | **3:1**, ≥2px perimeter |

Tools fail contrast more than marketing sites because density tempts thin text/border weights. Hold the line. Both light and dark themes must independently pass.

### Dark mode is expected

Operators run dark mode. Wire it once and let only primitives flip — see `frontend-css-architecture` for the `prefers-color-scheme` + class-toggle mechanism in Next 16. Persimmon's default light theme stays the baseline; dark is opt-in per tool but commonly requested for ops consoles.

### The dark-sidebar + light-content convention

Dark left nav anchors orientation; light content surface keeps data clarity; brand color is reserved for active state + primary CTAs. Nav rarely changes while content changes constantly — anchoring the eye on a fixed dark surface reduces cognitive load. See `frontend-responsive` for the sidebar mechanics.

## Spacing — denser than marketing

Use the `--spacing`-derived scale from `stack-tailwind-tokens`. Tools run roughly **half** the section padding of marketing sites. The 4-8-16-24 spine covers most decisions:

| Use case | Tailwind class |
|---|---|
| Inline icon ↔ text | `gap-2` (8px) |
| Label ↔ input | `gap-2` (8px) |
| Form field ↔ field | `space-y-4` (16px) |
| Action button ↔ button | `gap-3` (12px) |
| Card padding | `p-4` (16px) |
| Cards in grid | `gap-5` (24px → wired as `gap-6` if `--spacing` differs) |
| Section ↔ section | `space-y-6` to `space-y-8` |
| Sidebar nav items | `gap-1` to `gap-2` (4–8px) |

Prefer `gap` on flex/grid over margins. Density serves scanning; padding serves atmosphere — operators want the former.

## Form controls — never ship browser defaults

Browser-default inputs look unfinished. Build one styled `<Input>`/`<Select>`/`<Textarea>` set and reuse it. Baseline as a React component consuming Tailwind tokens:

```tsx
// src/components/ui/input.tsx
import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={
          "min-h-11 w-full border border-rule bg-bone px-3 py-2 font-sans text-base " +
          "text-ink transition-colors " +
          "focus-visible:border-oxblood focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-oxblood/20 " +
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          "aria-[invalid=true]:border-oxblood " +
          className
        }
        {...props}
      />
    );
  }
);
```

Rules:
- All controls share the same height (`min-h-11` = 44px, WCAG 2.5.5) and padding scale.
- Focus = visible 2–3px ring in brand color. Never remove the outline without replacing it.
- Disabled = 50% opacity + `not-allowed` cursor, no other change.
- Error state via `aria-invalid="true"` (also announced by screen readers), set from your `ActionResult` `fieldErrors` — see `stack-server-actions`. Validate with Zod at the boundary (`stack-zod-boundary`).
- Labels: `block font-medium mb-2` paired with `htmlFor`.

## Status badges

The 5-role semantic system is universal. Standardize once; map domain states onto the 5 roles. Build one `<Badge>` component:

```tsx
// src/components/ui/badge.tsx
const variants = {
  success: "bg-moss/15 text-moss",
  warning: "bg-rust/15 text-rust",
  danger:  "bg-oxblood/15 text-oxblood",
  info:    "bg-ink/10 text-ink",
  neutral: "bg-rule/40 text-ink/70",
} as const;

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof variants;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 " +
        "text-xs font-medium tabular-nums whitespace-nowrap before:h-1.5 before:w-1.5 " +
        "before:rounded-full before:bg-current before:opacity-90 before:content-['']" +
        " " + variants[variant]
      }
    >
      {children}
    </span>
  );
}
```

Domain → role mapping (Persimmon house style):

| Domain states | Variant |
|---|---|
| Pending, Draft, Awaiting Review, Uploading | `warning` |
| In Progress, Active, Processing, Sent | `info` |
| Approved, Completed, Published, Done | `success` |
| Rejected, Failed, Overdue, Cancelled, Error | `danger` |
| Archived, Closed, Inactive, N/A | `neutral` |

Rules: **Title Case** labels (`In Progress`, never `IN PROGRESS`). Pill shape only — a rounded rectangle reads as a categorical *tag*, not a status. Two sizes max. **Left-align** in table cells; centering fragments the row scan. Drive enum→variant mapping from a single map so a Prisma enum value always renders the same badge.

## Icons

**Persimmon default: `lucide-react`** — modern, MIT, ~1,800 glyphs, tree-shakeable, no sprite or loader needed. Import per-icon:

```tsx
import { Trash2, Plus, Pencil } from "lucide-react";

<button aria-label="Delete row" className="grid h-11 w-11 place-items-center">
  <Trash2 className="h-5 w-5" aria-hidden />
</button>
```

Do **not** mix icon libraries in one project (inconsistent stroke widths/radii — "Frankenstein UI"). One set, applied consistently.

### Size scale

| Context | Size |
|---|---|
| Inline with body, dense cells, badges | `h-4 w-4` (16px) |
| Buttons with labels, toolbars | `h-5 w-5` (20px) |
| Default UI / nav / sidebar | `h-6 w-6` (24px) |
| Section headers | `h-8 w-8` (32px) |

Never scale an icon far beyond its grid — it gets chunky. Stroke stays at lucide's default ~2px on the 24px grid.

### State and a11y

- **Outline = default, filled/solid variant = active/selected** (sidebar nav current page). Helps colorblind users distinguish current page without relying on color alone — pair with the triple-cue active state in `frontend-responsive`.
- Icons inherit `currentColor` by default in lucide — set the parent's `text-*` and the icon follows.
- Decorative icon next to a visible label → `aria-hidden`. Icon-only button → `aria-label` on the `<button>`, `aria-hidden` on the icon, plus a `title` for mouse tooltip.
- Pad the **button** to 44px, don't enlarge the icon (a 20px icon in a 44px button is correct).

## Emoji: content, not chrome

The moment an emoji becomes structural UI — nav, buttons, system icons, table/column headers — replace it with a lucide icon.

**Acceptable:** user-chosen status tags (operator picks `🔥 Hot` from a picker), reactions on comments/activity feed, page personalization the user sets, empty-state decoration *paired with text*.

**Banned:** nav icons (`💰 Revenue` → lucide `Coins`), primary action buttons (`✅ Save` → icon + label), column headers / filter labels / system status glyphs. Cross-platform emoji rendering differs per OS and breaks scannability. The test: **"👍 reaction OK, 💰 nav icon never."**

When emoji do appear in content, wrap with `role="img"` + `aria-label`; decorative inline emoji get `aria-hidden`.

## Avoiding the generated-admin look ("AI slop")

What makes a dashboard look produced by v0/Lovable/ChatGPT:

| Tell | Antidote |
|---|---|
| Untouched component-lib defaults, identical card across every section | Vary structure per content type — a list, a settings page, and a report should NOT all be the same card grid |
| Universal `rounded-2xl` everywhere | Persimmon default is sharp (`--radius-none`) — keep it; if rounding, pick one small radius and apply once |
| Colored 3–4px top/left card stripe | Drop it — it is one of the most reliable AI tells |
| `font-sans` only, no tabular figures | Apply `tabular-nums` globally to numeric content (above) |
| `Sparkles` icon next to anything labeled "AI" | Use a neutral, meaning-bearing icon |
| Centered welcome hero on a dashboard | Operators want data first — lead with KPIs and recent activity |
| Spline blobs / generic illustration in empty states | Show a real 1-row example of the populated table instead |

Density over decoration: a 36–44px row in a 600-row table beats a 72px row needing three scrolls. Visual weight should carry meaning — semantic badges, `▲ +12% / ▼ -3%` deltas, state-aware row highlighting — not perform spaciousness.

## One-screen defaults

- Sans for data UI, serif for page titles only, mono for IDs/code. Cap 2 families + mono.
- `tabular-nums lining-nums` on all numbers, globally.
- Semantic status via 5-role `<Badge>`; Title Case; pill; left-aligned in cells.
- One styled `<Input>` set, `min-h-11`, 2–3px brand focus ring, `aria-invalid` for errors.
- `lucide-react`, single library, outline default / filled active, 16/20/24/32 scale.
- Dense spacing (4-8-16-24 spine), `gap` over margin.
- Dark mode wired via primitives flip (`frontend-css-architecture`); both themes pass AA.
- No emoji in chrome.

## Anti-patterns banned

- Browser-default form controls
- Centering status badges in table cells
- Mixing two icon libraries in one project
- Emoji as nav/button/header icons
- Numbers without tabular figures
- Colored top/left card stripes and untouched lib defaults
- Charts with >6 colors or color as the only encoding
- Same card-grid structure for every page type
- Sparkles icon labeling "AI" features

## Cross-references

- `stack-tailwind-tokens` — token scale, `@theme`, semantic color naming (do not duplicate)
- `frontend-css-architecture` — file layering, dark mode, font loading in Next 16
- `frontend-responsive` — sidebar, breakpoints, active-state triple cue
- `frontend-page-templates` — list/detail/edit/dashboard scaffolds these components fill
- `frontend-public-site-conventions` — the marketing-site counterpart
- `stack-server-actions` / `stack-zod-boundary` — wiring form controls and validation
- `frontend-data-tables`, `frontend-form-patterns`, `frontend-feedback-system` — siblings
