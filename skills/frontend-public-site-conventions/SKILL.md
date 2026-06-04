---
name: frontend-public-site-conventions
description: Visual and UX conventions for Persimmon public-facing client sites — marketing, lead-gen, brochure, landing pages built in Next.js 16 + React + Tailwind v4. Optimizes for brand expression, trust-building, and conversion over data density. Use when designing or reviewing any interface aimed at first-time visitors or prospects — hero, services, about, pricing, contact, lead-capture flows. Covers font pairing (escaping Inter/Geist default), the 60-30-10 color rule, marketing type scale, lucide-react icon sizing, hero contrast, and how to avoid the generated-marketing-page ("AI slop") look. Trigger keywords: homepage, marketing site, landing page, hero, brand, lead-gen, font pairing, public website design.
---

# Public Website Conventions — Persimmon Patterns

Design rules for the public face of a Persimmon client — marketing site, landing pages, brochure pages, lead-capture flows. Different rules than internal tools: visitors evaluate credibility in seconds, brand atmosphere matters, conversion beats density.

This skill covers **what to pick**. For the token scale and CSS-first config see `stack-tailwind-tokens` (do not re-specify tokens). For nav/layout see `frontend-responsive`. For form wiring see `frontend-form-patterns` + `stack-server-actions`.

## Public site vs internal tool

| Trait | Public site | Internal tool |
|---|---|---|
| Audience | First-time visitors, prospects | Trained operators, return daily |
| Goal | Build trust, convert | Complete a task fast |
| Visual priority | Brand, emotion, atmosphere | Density, hierarchy, scannability |
| Branding | Front and center | Subtle |

Mostly hero, story, social proof, CTAs → public site (this skill). Mostly tables, forms, filters, KPIs → `frontend-internal-tool-conventions`.

## Typography — the pairing rule

Marketing sites carry brand; type does most of the work. **Two fonts maximum**: a distinctive **display** face for headings + a refined **body** face for paragraphs/UI. Wire them as `--font-serif`/`--font-sans` in the `@theme` block (see `stack-tailwind-tokens`); the Persimmon scaffold already ships Fraunces + Instrument Sans as a strong, non-default pairing.

Three reliable pairing patterns:

1. **Serif display + humanist sans body** — safest "considered" pairing. Fraunces + Public Sans, Newsreader + General Sans, Instrument Serif + Inter (accent only).
2. **Bold sans display + serif body** — editorial/long-form feel.
3. **One superfamily, two cuts** — Source Serif + Source Sans, IBM Plex Serif + IBM Plex Sans. Foolproof when the client has no brand designer.

Hard rules: pairings work when faces **share x-height/contrast** and **clash on classification** (not on mood). Body 16–18px minimum (20px for long-form). Display faces only at large sizes — most break below ~24px.

### The Inter / Geist problem

Inter is the single most-loaded web font on Earth; every AI-generated page, Vercel template, and shadcn copy-paste uses Inter or Geist. **Defaulting to Inter/Geist as the body font marks the site as templated.** What designers pick instead (all free):

- **General Sans** (Fontshare) — more personality than Inter
- **Public Sans** (Google) — government-clean, under-used
- **Bricolage Grotesque** (Google, variable) — softer, expressive
- **Manrope** / **Plus Jakarta Sans** (Google) — open apertures, less-saturated geometric

Load these via `next/font` (see `frontend-css-architecture`), self-hosted, not a raw Google Fonts `<link>`.

### Display faces that work in 2026

Playfair Display is now the default "classy serif" — replace with **Fraunces** (Persimmon default, variable), **Instrument Serif**, **Newsreader**, **DM Serif Display**, or **PP Editorial New**.

### Industry-appropriate pairings (all free)

| Industry | Pairing |
|---|---|
| Legal | Newsreader + Public Sans · Source Serif + Inter. Avoid Times New Roman. |
| Financial advisors | Fraunces + Manrope · Lora + Work Sans (skip the Cormorant + Montserrat default) |
| Healthcare | Newsreader + IBM Plex Sans · DM Serif Display + DM Sans. Humanist sans body for a11y. |
| Real estate | Fraunces + Inter · Cormorant + Jost (escape Playfair + Montserrat) |
| Professional services | Source Serif + Public Sans · Fraunces + General Sans |
| Restaurants / hospitality | Fraunces + DM Sans · Bricolage Grotesque solo. Skip script for body. |

### Marketing type scale

More dramatic than dashboards. Base 16px, pick a ratio — **1.25** content-heavy, **1.333** Persimmon default, **1.5** hero-driven luxury. Heroes routinely hit 48–80px desktop (`text-5xl`+) / 32–48px mobile. Line-height 1.1–1.2 headings, 1.5–1.65 body. Measure 60–75ch. Extend the `--text-*` scale in `@theme` if the client needs a larger display size.

## Font count per site

**Default: 2 maximum.** One display + one body. Reasons: performance (each family is a download + CLS risk — `next/font` preloads max 1–2), cognitive load (a third voice fragments hierarchy), brand coherence (Stripe, Linear, Apple all run 1–2 voices), pairing math (every added face is another clash to balance).

Exceptions where 3 can work: monospace scoped to `<pre><code>` only (functional, not a third voice); a superfamily (Plex Serif+Sans+Mono reads as one system); a logo wordmark in a custom face that never appears in body text (a graphic asset). **Hard cap: 3.**

## Color — the 60-30-10 rule

Public sites lean on **brand expression** over semantic state. 60-30-10 keeps it from getting noisy:

- **60% — dominant**: page background (Persimmon scaffold: `bg-bone`), body text
- **30% — structural**: section backgrounds, cards
- **10% — accent**: primary CTAs, links, highlights (`bg-oxblood` / `bg-brass`)

> Contrast through scarcity: when your accent only appears on primary CTAs, users instantly recognize "this is where I act."

Violating this is the #1 reason a site feels "loud" — accents bleed into 30% territory and lose their signal. Most brochure sites need **no** full success/warning/danger set; semantic tokens only if the site has interactive features.

### Industry color starting points

| Industry | Starter |
|---|---|
| Legal / financial | Navy, deep green, or burgundy + warm cream (trust + tradition) — Persimmon's oxblood + bone fits |
| Healthcare | Teal, sage, soft blue + white (calm, clinical) |
| Real estate | Charcoal + warm tan, sage + cream |
| Professional services | Brand color + neutral grays |
| Restaurants / hospitality | Warm earth, terracotta, deep green + cream |

### Contrast targets (WCAG 2.2 AA)

**4.5:1** body, **3:1** large text and UI components, **3:1** focus indicators ≥2px. Marketing sites fail most often on **hero overlays** — text over photo/video. Use a solid scrim (`bg-ink/50` minimum) or move text out of the photo region. Never put body text directly on an unscrimmed image.

### Dark mode is optional

Most lead-gen sites ship light-only. Honor `prefers-color-scheme` only if the brand has a real dark direction; a dark mode that merely inverts everything is an AI-slop tell. See `frontend-css-architecture`.

### Ban list

- **Indigo → violet gradient heros** (the canonical AI-slop tell)
- **Pure black `#000000`** — Persimmon uses `--color-ink` (`#1a1a1a`)
- **Untouched Tailwind default palette** — `grep` for `indigo-`/`violet-`/`fuchsia-` should return zero
- **Pastel rainbow accent grids** (three icon boxes in three pastels)

## Spacing — generous, atmospheric

Marketing uses 3–4× the section padding of tools. Use the `--spacing` scale from `stack-tailwind-tokens`:

| Use case | Class |
|---|---|
| Paragraph ↔ paragraph | `space-y-4` (16px) |
| Card padding | `p-6` (24px) |
| Cards in grid | `gap-6` to `gap-8` |
| Hero block top/bottom | `py-24`+ |
| Major section ↔ section | `py-20` to `py-28` (96–128px) |

For fluid section padding use a `clamp()` utility (e.g. a `--section-pad` token, ~48px mobile → ~128px desktop). Prefer `gap` over margin.

## Icons

**Persimmon default: `lucide-react`** — modern, MIT, ubiquitous in SaaS, tree-shakeable. Acceptable default for marketing.

Switch when you need to escape the lucide-everywhere feel and match brand personality: **Phosphor** (6 weights incl. duotone) for design-led/consumer, **Iconoir** (geometric) for editorial. Never mix libraries in one project.

### Size scale (marketing runs larger)

| Context | Size |
|---|---|
| Inline body, footer | `h-4 w-4`–`h-5 w-5` (16–20px) |
| Nav, button-with-label | `h-6 w-6` (24px) |
| Feature card centerpieces | `h-8 w-8`–`h-10 w-10` (32–40px) |
| Hero decorative | `h-12 w-12`+ (48px+) |

At 32px+ switch to filled/duotone — thin outlines lose presence at scale. `currentColor` inheritance; brand-color icons only for semantic accent or a deliberate hero moment.

```tsx
import { Mail } from "lucide-react";
<Mail className="h-6 w-6 text-oxblood" aria-hidden />
```

A11y: `aria-hidden` on decorative icons; icon-only links need a visually-hidden label.

## Emoji: never in chrome

**Hard rule: no emoji in the chrome of a public-facing site.** Cross-platform rendering is uncontrollable — the same `👍` differs on iPhone/Android/Windows. You cannot ship a homepage where a key visual renders differently per device. Public sites are judged for credibility in the first 5 seconds; trust-dependent verticals (legal, financial, healthcare, professional services) demand the bar.

Categorically wrong: nav, hero/section CTAs, feature cards (`🚀 ✨ 💡` — the single most common marketing AI-slop tell), footer/contact icons, testimonial decoration. Use real lucide/Phosphor icons instead.

One acceptable place: user-generated content the client publishes (testimonial text where the customer used emoji). Treat as the customer's words. If emoji appear in content, wrap with `role="img"` + `aria-label`; decorative inline emoji get `aria-hidden`.

## Avoiding the generated-marketing look ("AI slop")

What makes a public site look produced by v0/Lovable/ChatGPT in 10 minutes:

| Category | Tell |
|---|---|
| Color | Indigo→violet gradient hero · pastel rainbow accents · glassmorphism overuse |
| Type | Inter/Geist as the only font · gradient text headline · a single italic "accent word" in Instrument Serif |
| Layout | Centered pill badge → 64pt headline → 2 same-size CTAs → 3-up feature grid → "1-2-3 steps" → logo soup → identical pricing cards |
| Components | `rounded-2xl` everywhere · 3-4px colored card stripe · untouched lib defaults · Sparkles next to "AI" |
| Imagery | Spline 3D blobs · unDraw/Storyset illustrations · "person at laptop" stock · gradient meshes |
| Copy | "Unlock the power of…" · "Transform your…" · three-word value props with no specificity |

### Antidotes

1. **Pick a personality before a palette** — banking-serious, startup-playful, editorial-considered, luxury-restrained. Personality determines everything downstream.
2. **Custom palette, not Tailwind defaults** — Persimmon's editorial tokens (ink/bone/oxblood/brass) are a strong start. Document deviations in the design-system doc.
3. **Type pairing, not single Inter** — see Typography.
4. **Asymmetric editorial layouts** — left-align the hero; break the 3-up grid with a varied-cell bento; replace "1-2-3 steps" with a timeline or narrative.
5. **Vary structure per content type** — Services side-by-side, About long-form, Pricing comparison table. Three treatments on one site is *good*.
6. **Real imagery** — bespoke photography of the client's actual office/team/work, real product screenshots. unDraw + Spline blobs read as generic.
7. **Real icons, single library, no Sparkles for "AI."**
8. **Concrete copy** — "Payments infrastructure for the internet" beats "Unlock seamless payments." Specific numbers, real nouns, customer language. Vague copy enables vague layouts.

### The system test

Before shipping ask: *"Could this same homepage, colors and logo swapped, ship for any other client?"* If yes, it's too generic. Personality must be load-bearing — change the brand and the whole page should fall apart.

## One-screen defaults

- 2 fonts: distinctive display + refined body. Never default to Inter/Geist as the only voice.
- Body ≥16px, heroes 48–80px desktop, line-height 1.5–1.65 body / 1.1–1.2 headings.
- 60-30-10 color; accent scarce (CTAs/links only); no indigo→violet, no pure black.
- Hero text over images needs a scrim (`bg-ink/50`+) or stays out of the photo.
- Generous section padding (`py-20`+), `gap` over margin.
- `lucide-react`, single library, larger sizes than tools, filled at 32px+.
- No emoji in chrome. Dark mode optional and only if the brand has a real direction.

## Anti-patterns banned

- Inter/Geist as the only/body font
- Indigo→violet gradient hero, pastel rainbow accents
- Body text on an unscrimmed photo
- `🚀 ✨ 💡` feature-card emoji
- Spline blobs / unDraw illustrations
- More than 3 font families
- Untouched Tailwind default palette
- Same layout for every section type
- Vague "Unlock/Transform" hero copy

## Cross-references

- `stack-tailwind-tokens` — token scale, `@theme`, font/color naming (do not duplicate)
- `frontend-css-architecture` — `next/font` loading, layering, dark mode in Next 16
- `frontend-responsive` — top nav, hamburger, breakpoints for public sites
- `frontend-internal-tool-conventions` — the admin/ops counterpart
- `frontend-form-patterns` + `stack-server-actions` — lead-capture form wiring
- `frontend-page-templates` — marketing page scaffolds
