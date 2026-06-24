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

## The craft layer — why a "correct" site still looks AI-generated

A site can pass every gate above — good fonts, no indigo, AA contrast, a real concept — and **still read as slop**, because those test taste-of-*values*, not **authorship of execution**. Template/AI output is competent craft with zero **art direction**: the layer that carries tone, mood, and emotion. Authorship shows up as a few deliberate craft risks executed *consistently*. The highest-leverage levers, roughly in order:

- **Type-scale contrast is the single biggest move.** The AI default is a timid ~2:1 ratio between headline and body. Authored pages run **8:1–10:1** — a genuinely large display (`clamp(2.5rem, 6vw, 5rem)`+) against calm 16–18px body. Big type reads as confidence; even type reads as a template.
- **Tighten display type** (headlines only): letter-spacing **−0.02 to −0.04em**, line-height **0.95–1.05**. The loose "safe" tracking/leading applied everywhere is a tell. Body stays at normal tracking and ~1.5 leading.
- **Off-white surfaces, near-black ink — never pure.** Background `#FAF8F5`/`#F7F5F2`, not `#FFFFFF`; text `#1A1A1A`/`#0f172a`, not `#000`. Pure-white-under-near-black with uniform spacing is the flat, lit-from-nowhere AI look.
- **Break the template layout.** The AI skeleton is: centered hero → a **row of 3 even icon-cards** → alternating image-left/image-right → centered CTA. Earn authorship with **one off-balance choice executed throughout**: an asymmetric hero split (a 5:8 / 1:1.6 ratio, content weighted to one side, not 50/50), a broken-grid section, type or an image **bleeding off the viewport edge**, intentional whitespace *imbalance* (dense then vast) instead of uniform padding. Pick one or two and repeat them — don't make every section weird (that reads as error, not intent).
- **One signature motion, not fade-in-on-everything.** Scroll-triggered fade on every section is the **#1 template tell**. Replace it with a single crafted moment that fits the concept (a counter that ticks, one hover that reveals) and leave the rest still. Honor `prefers-reduced-motion`.
- **Texture beats flat-perfect.** A subtle grain/noise overlay, a paper or material ground, a real edge — anything signalling a hand was here — separates authored from rendered. Optional, but a cheap escape from the sterile-gradient surface.
- **One consistent image treatment**, not a stock grab-bag: a single duotone/crop/grade on every photo reads as art-directed. No generic 3D blobs, gradient-mesh backgrounds, or "diverse team laughing at laptop" stock. (Real photos > optimized real > generated-generic > stock.)

Each lever is a deliberate risk that **must trace to the concept** (`public-website-creative-direction`) — the off-balance ratio *because* the brand is "80% engineering, 20% showmanship"; the grain *because* the materials are "paper and steel." A craft risk with no concept behind it is just a different template.

**Proven values — apply as the baseline:** Three separate human craft-passes converged on the same numbers: 6:1–8:1 type scale, display weight 400–460 at −0.02/−0.035em tracking, off-white/near-black surfaces, hairlines not solid borders, asymmetric ratios instead of three even cards, editorial lists instead of card grids, one image grade, one signature motion, section padding capped at ~80px not 128px+. Build ships *from* these values; the concept may override one with a provenance line, but defaulting to safe is the failure that ships generic. If a finished page still reads as generic, diff it against these values before adding anything.

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

## Transactional pages are tools, not landing pages

Cart, checkout, order-confirmation, and account are **utility** surfaces — density and scannability beat breathing room, the opposite of a marketing page. When the same "too long / too much blank space before the content" complaint recurs across several of these, it's **one systemic cause** (a marketing-sized hero + full-width stacked sections applied to a utility page) — fix the shared root, then the page-specifics. The moves:

- **Demote the hero to a utility header** (a tight line + the key id), no tagline/subtitle. The page's job is to act, not to sell.
- **Two columns on desktop** (stacks on mobile): the primary content/receipt left, secondary facts + actions in a compact right rail — this alone halves the height vs full-width stacking.
- **Cart shows the subtotal only; the full breakdown (tax, shipping, fees) belongs on checkout** — those depend on fulfillment details the user hasn't entered yet. Cart = items + subtotal + Checkout; checkout = itemized total.
- **A status tracker is a horizontal stepper** (Received → Preparing → Ready), not stacked lines; actions are one tidy row with the destructive one (Cancel) visually quieter.

## Nav CTA hierarchy — one filled, at most one outlined, no duplicate destinations

A nav bar is a strict three tiers: **quiet text links = navigation** (they take you somewhere); **one filled/solid primary CTA** = the single highest-value action; **at most one outlined/ghost secondary CTA**. Never more than ~2 buttons or the hierarchy collapses, and **never two filled**. The common bug: a nav *link* and a nav *button* pointing at the **same destination** reads as redundant — relabel the button to signal intent so it's the transactional path, not a duplicate. (Button-vs-link encodes action-vs-destination; see `frontend-interaction-patterns`.)

## Emoji: never in chrome

**Hard rule: no emoji in the chrome of a public-facing site.** Cross-platform rendering is uncontrollable — the same `👍` differs on iPhone/Android/Windows. You cannot ship a homepage where a key visual renders differently per device. Public sites are judged for credibility in the first 5 seconds; trust-dependent verticals (legal, financial, healthcare, professional services) demand the bar.

Categorically wrong: nav, hero/section CTAs, feature cards (`🚀 ✨ 💡` — the single most common marketing AI-slop tell), footer/contact icons, testimonial decoration. Use real lucide/Phosphor icons instead.

One acceptable place: user-generated content the client publishes (testimonial text where the customer used emoji). Treat as the customer's words. If emoji appear in content, wrap with `role="img"` + `aria-label`; decorative inline emoji get `aria-hidden`.

## Research live references before you design (required for bespoke public pages)

The antidotes below are abstract ("asymmetric editorial layouts") until you've *looked at* sites that nail them. Designing from memory lands on the median — the template. So before the first mockup, go look, like a human designer opening a dozen tabs.

1. **Pull 8–12 live references** (WebFetch / web search) from curated-craft sources — Typewolf, Awwwards, SiteInspire, Godly, Land-book, One Page Love — across the client's **industry + 2–3 adjacent ones** (a legal site learns more from an editorial magazine than from ten other law-firm templates).
2. **Extract the specific moves**, not vibes: hero structure (asymmetric split? full-bleed? type-as-layout?), type treatment, the full-bleed↔contained rhythm, how photography is handled, what gives it texture.
3. **Find the client's ownable angle** — the true, specific story no competitor can copy (real founder narrative, named clients/cases, a heritage detail). It comes from the *business*, not the layout.
4. **Cite the references + borrowed moves** in the spec's design rationale (`workflow-brainstorm`). A hero that's "asymmetric 7/5, photo off-edge, like ⟨ref⟩" is a derived decision; "centered hero" is a default you fell into.

Do this **before** showing a first version — not as a rescue after "looks generic." Hand references to subagents too; "build the home page" with no refs produces the median.

## Build on the client's real photography (don't invent imagery)

On a bespoke public site the client's **real photos are usually the strongest differentiator** — the one thing no template or competitor has. Treat them as a primary design input, not end-stage decoration.

- **Harvest first** — `client-onboarding` captures the photo library alongside the logo. Use the client's actual photos (existing site, provided folder, their Instagram) if you can fetch them.
- **Read the visual signature, lock ONE treatment** — real libraries have a look (e.g. "high-key daylight on linen" + "B&W heritage"). One consistent tone/grain/contrast recipe makes a mixed phone-photo set read as one branded library.
- **Build the layout around the photos** — full-bleed↔contained rhythm, art-directed crops, captions naming real people/places. Don't drop them into generic card slots.
- **Never substitute stock or AI-generated imagery** (it's in the tells table). If real photos are missing, mark imagery a human-blocked open item and wireframe with labeled placeholders — don't paper over it with a gradient mesh or Spline blob.
- `client-image-optimization` is the **downstream pipeline** (sharp, responsive variants) once art direction is set — it doesn't choose the imagery.

## Avoiding the generated-marketing look ("AI slop")

What makes a public site look produced by v0/Lovable/ChatGPT in 10 minutes:

| Category | Tell |
|---|---|
| Color | Indigo→violet gradient hero · pastel rainbow accents · glassmorphism overuse |
| Type | Inter/Geist as the only font · gradient text headline · a single italic "accent word" dropped into a heading for fake flair |
| Layout | Centered pill badge → 64pt headline → 2 same-size CTAs → 3-up feature grid → "1-2-3 steps" → logo soup → identical pricing cards · decorative `01 / 02 / 03` section numbers · a tiny uppercase eyebrow label stacked over every section heading · a horizontally-scrolling word/marquee strip used as filler |
| Components | `rounded-2xl` everywhere · one uniform radius + one shadow on everything · 3-4px colored card stripe · untouched shadcn/lib defaults · Sparkles next to "AI" |
| Imagery | Spline 3D blobs · unDraw/Storyset illustrations · "person at laptop" stock · gradient meshes · AI-generated hero images instead of the client's real photos |
| Copy | "Unlock the power of…" · "Transform your…" · three-word value props with no specificity · invented taglines when the client already has real homepage copy |

### Antidotes

1. **Pick a personality before a palette** — banking-serious, startup-playful, editorial-considered, luxury-restrained. Personality determines everything downstream.
2. **Custom palette, not Tailwind defaults** — Persimmon's editorial tokens (ink/bone/oxblood/brass) are a strong start. Document deviations in the design-system doc.
3. **Type pairing, not single Inter** — see Typography.
4. **Asymmetric editorial layouts** — left-align the hero; break the 3-up grid with a varied-cell bento; replace "1-2-3 steps" with a timeline or narrative.
5. **Vary structure per content type** — Services side-by-side, About long-form, Pricing comparison table. Three treatments on one site is *good*.
6. **Real imagery** — bespoke photography of the client's actual office/team/work, real product screenshots. unDraw + Spline blobs read as generic.
7. **Real icons, single library, no Sparkles for "AI."**
8. **Concrete copy** — "Payments infrastructure for the internet" beats "Unlock seamless payments." Specific numbers, real nouns, customer language. Vague copy enables vague layouts.

### The system test — a required self-audit before any public page is shown

Before showing a bespoke public page to the client (or returning it from a subagent), run an explicit tell audit and **remove every hit** — don't wait for the client to catch them:

0. **Run `node scripts/ai-tell-lint.mjs`** — the mechanical gate that catches what a manual sweep misses: Tailwind indigo/violet/purple palette and the purple→purple gradient hero **fail hard**; Inter/Geist, pure `#fff`/`#000`, blanket `rounded-2xl`, and feature-card emoji **warn**. Treat any error as a hard fix. **Bans live in the linter, not in your prose** — never write "no purple/Inter" into a spec or prompt, because naming a default primes it; let `ai-tell-lint` enforce it downstream.
1. **Walk the tells table** against the actual page; flag each hit by name (centered-hero+3-card grid, single italic accent word, `01/02` numbers, eyebrow-over-every-heading, marquee, uniform radius/shadow, untouched shadcn defaults, fade-in-on-every-section). Fix them, don't rationalize.
2. **The hero-clarity gate:** does the hero state in plain words *what the company does and for whom* before any stylistic flourish? If a clever line stands alone with no plain descriptor, it fails.
3. **Swap test:** *"Could this same page, colors and logo swapped, ship for any other client?"* If yes, it's too generic — personality must be load-bearing, so changing the brand makes the whole page fall apart.
4. **Real-content test:** is the client's actual copy, real photos, and true story doing the work — or is invented filler standing in?
5. **The defect-gate walk:** the bugs clients catch by hand. (a) **Row alignment** — do cards/columns align with the *longest and shortest real content*, or does an uneven blurb push one CTA lower? (b) **Dead space beside a narrow heading** — is a ~30ch header sitting alone in a full-width row with an empty right half? Pair it, span it, or fill it. (c) **Duplicate-destination CTAs** — two buttons with the same label/target? (d) **List completeness** — is every real team member/product/location rendered, or was one silently dropped?

For bespoke public screens this audit is part of the **definition of done** — `workflow-brainstorm`'s bespoke-design gate points here.

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
