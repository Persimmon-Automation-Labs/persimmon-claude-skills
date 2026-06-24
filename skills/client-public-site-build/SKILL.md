---
name: client-public-site-build
description: "Use to build and deploy a public marketing site from only a client's old site URL. One scrollable, DB-driven Next.js 16 page: scrapes brand, builds with React + Tailwind + Prisma, verifies, deploys to Railway staging; asks only the genuinely-human calls."
---

# Client Public-Site Build — old URL → Railway staging

One command — "build them a public site from their old URL" — turns a client's existing site URL into a finished, **Railway-deployed**, **one scrollable** public marketing site whose content is **DB-driven** (Prisma-backed, CRUD-able later). It runs the Persimmon public-site pipeline autonomously and stops only at the decisions that are genuinely yours, **batched into a single `AskUserQuestion`**.

Built to impress a prospect as a free gift; works standalone whether or not an internal ops tool is also coming (that platform lands at **`/admin`** on the same Next.js install later — this build **reserves** `/admin` and does **not** build CRUD pages now).

## Trigger

- "build them a free public site from their old site", "drastically improve/modernize a client's marketing site from the URL", "spin up a public site to impress <client>"

## The line — automated vs human

**A decision is HUMAN only if** it's (1) taste/brand not in the data, (2) business intent you can't derive, (3) client-relationship/customers/money/legal, or (4) irreversible & outward-facing. Everything else is derivable or absorbed by mechanism:

| Automated | Human (ask) |
|---|---|
| Stack, one-page scaffold, brand tokens, Prisma content model + read-only queries, copy drafted from real content, SEO, responsive/a11y/contrast, photo optimization, Railway DB + deploy | Creative direction · site goal/CTA · imagery scope · lead destination + contact facts · **go-live on the real domain** |

## Phase 1 — Ingest & derive (autonomous)

Scrape the old site via `client-onboarding`: Playwright **computed** brand (palette/type off body/headings/buttons/nav), desktop+mobile screenshots, **download the logo**, and a full catalog of content. **Render carousels/sliders and extract EVERY item** — testimonials/reviews are usually a JS slider that shows WebFetch only one (the "use *all* the reviews" rule). **Follow off-site content links** — the real catalog/menu/products often live one link away on a separate subdomain; crawl those and harvest the real items/photos/categories. Pull **hi-res originals** (raise CDN fill params where available). Record brand values verbatim (provenance — never invent a hex/font).

**Run deep research on the client's industry — this drives the section SET, not just the styling.** Find how the best-in-class sites for *this* business type are organized and what their signature move is. Feed it into `public-website-creative-direction` (harvest-mode: derive its intake answers from the scrape; flag any HARVESTED onliness/origin for client confirmation) to draft creative directions *and* the section list that fits this client (see "The section set is derived" below).

**Run this whole phase as `premium-web-method`'s diverge step, not a one-shot.** An AI regresses to the median by construction — so the failure mode is taking the model's *first* direction as "the design." Instead **diverge to ~5 genuinely distinct concepts** (different organizing ideas, not one in three colorways), constraints set aside; score them against the method's tests (swap, collapse, concept-before-pixels); then converge on the one the human picks and only *then* apply the brand tokens + craft baseline.

## Phase 2 — The human gates (ONE `AskUserQuestion`, ≤4)

Apply the noted **default** if a question is skipped:

1. **Creative direction** — pick one of the 2–3 proposed concepts (each = one organizing metaphor + signature element + strategy-to-token table). **Use option `preview`s.** *The marquee call — what the client sees first.*
2. **Primary goal / CTA** — what should a visitor *do*? **Derive the default from the business model + the old site's own CTA.** Wholesale distributor → *catalog request / wholesale inquiry*; service business → *call / book*; restaurant → *menu / reservation*; SaaS → *start free / sign up*; professional services → *book a consultation*. "Request a quote" is right for a quote business and wrong for a catalog or subscription one. Offer the inferred default first; surface the alternatives.
3. **Imagery scope** — optimize their real photos + propose generation prompts for gaps *(default)* · also generate the approved gap shots · no AI imagery. **For catalog/food/product businesses, AI-generated images of the *products* are a hard no** — a fabricated photo is both a fidelity violation and the single most obvious tell to a prospect who knows their own catalog.
4. **Lead destination + contact facts** — where do form leads go (Resend/email via Server Action), and is the old site's contact (phone/email/address/hours) current? (old-site as-is *(default)* · provide updated · no form).

## The section set is DERIVED, not a fixed skeleton

**The single biggest failure mode of this skill is over-fitting to a prior project.** Sections must be an **output** of the concept + content + industry research. So:

- **Include a section only if the client has real content for it AND the concept calls for it.** No multi-location story → no map. No reviews on the source → no testimonials wall (or a "confirm" placeholder, not invented ones).
- **Transform, don't force.** A prior project's section often has a *different-shaped* analog for a new client. The over-fit tell: a map with **one pin**, an **empty grid**, or a section reading as a solution looking for a problem = the skeleton was forced. **Drop or transform the section** instead.

## Phase 3 — Build (autonomous)

- **One scrollable page**, sticky nav (logo + smooth-scroll anchors + the CTA; hamburger drawer below the measured wrap width), executing the chosen direction over the **derived** section set (above). Hero · proof · about are near-universal; everything else is earned by real content. Scaffold + tokens per `stack-tailwind-tokens`; components per `frontend-public-site-conventions`.
- **Build from the authored-craft baseline, not safe defaults** (`frontend-public-site-conventions` → craft layer). Ship *from* the proven values — 6:1–8:1 type scale, light display weight with negative tracking, off-white/near-black surfaces, asymmetric ratios + editorial lists instead of card grids, one signature motion, ~80px section padding. The chosen concept must produce a **bespoke structural artifact** — a decorative motif alone is not a signature element.
- **Self-host fonts** (`next/font`, WOFF2, `font-display:swap`). Never runtime Google Fonts link.
- **DB-driven content** (`data-prisma-pgvector`): `site_settings` (contact/social/stats) + a content table **per section the client actually has**, each with `id/sortOrder/isActive/createdAt/updatedAt`; the page reads through small **read-only Server Component queries**. Schema designed for later CRUD; **no CRUD UI now**; `/admin` reserved.
- **Copy**: drafted from the old site's *real* content + their vocabulary. The hero must **say what the business is and sells** (comprehension), not only be distinctive. **Never invent facts** (guardrail below).
- **Images**: `client-image-optimization` (WebP/srcset, `next/image`). SEO via `client-seo`; lead form via Server Action → Resend email (`client-transactional-email`); keep social links + contact button.
- **Geography/map section only when there's a real multi-place story** — accurate SVG + Prisma-backed pins. A one-pin map signals the section doesn't belong — drop it.

## Phase 4 — Verify (autonomous, gated)

`node scripts/ai-tell-lint.mjs` + `quality-playwright-e2e`: **0 horizontal overflow / no overlap at 360·768·900·1024·1280**, nav never wraps, **WCAG AA on every text pair** (fix near-misses), map keyboard-accessible if present, images properly optimized.

Three gates beyond pixels (passing the render audit isn't enough — a site can have 0 overflow, AA contrast, and a concept and still look AI-generated):

- **Hero comprehension — the 5-second test.** A cold visitor must know within ~5 seconds *what this business is, what it sells, and what to do next*. Clarity gates before cleverness.
- **Over-fit check.** Walk the section set: any one-pin map, empty grid, or section with no real content = forced skeleton → drop/transform it.
- **AI-slop craft audit (`frontend-public-site-conventions` → craft layer).** Is the headline-to-body type scale a real **8:1–10:1**, or a timid 2:1? Are surfaces **off-white/near-black**, not pure `#fff`/`#000`? Is the layout anything other than **centered-hero → 3 even icon-cards → alternating images → centered CTA**? Is there **one** signature motion rather than fade-in-on-every-section? Does at least one deliberate craft risk **trace to the concept**? If it reads as generated, the fix is the concept *executed in pixels* — loop back to craft, don't add features.

**Walk the defect gates (`frontend-public-site-conventions`):** (a) row/card **alignment** holds with the longest *and* shortest real content; (b) no **dead space beside a narrow heading**; (c) no **duplicate-destination CTAs**; (d) **list completeness** — every real team member/product/location renders.

## Phase 5 — Deploy to Railway staging + go-live (human)

Push to `main` — Railway auto-deploys. Run `prisma db push` + seed script. Return the live Railway preview URL. **Going live on the client's real domain is the one outward-facing, irreversible step — a separate human confirm** (`meta-deployment-plan` if replacing an incumbent).

## The content-honesty guardrail (non-negotiable)

Publish **only facts verifiable from the old site** (and the off-site links you followed). Never invent testimonials, stats, credentials, awards, bios, or pricing; never pass a generated image off as the client's real product or facility.

- **Unconfirmed claims and fabricated imagery are HARD go-live blockers.** A site can deploy to *staging* with placeholders, but a number/testimonial/credential you couldn't verify blocks the real-domain go-live until the client confirms or supplies it.
- **Thin source material is common — the honest output is "strong but thin + a confirm-list," never papered-over filler.** A gorgeous shell with an honest gap-list beats a gorgeous fake.

This overrides "make it impressive."

## Output

A deployed **Railway staging URL** + a one-screen brief: the chosen direction, the **derived section set** (and any section deliberately dropped/transformed — name it), the 4 decisions (defaults noted), verify results including the hero-comprehension + over-fit checks, and the **go-live blocker list** — split into *hard blockers* (unverified claims, fabricated imagery, missing real catalog/contact) and softer confirms (HARVESTED onliness/origin wording).

## Relationship to Other Skills

| Skill | Role |
|---|---|
| `premium-web-method` | The anti-generic process (diverge→select→converge→gate) this pipeline runs on |
| `client-onboarding` | Scrape: computed brand, slider full-extract, hi-res originals, logo, content catalog |
| `public-website-creative-direction` / `frontend-public-site-conventions` / `frontend-css-architecture` | The diverged directions + conventions + token system |
| `client-image-optimization` | WebP/srcset + `next/image` optimization |
| `data-prisma-pgvector` / `data-schema-design` | The DB content model |
| `client-seo` · `client-transactional-email` | SEO + lead form via Server Action + Resend |
| `quality-playwright-e2e` · `infra-railway-deploy` | Verify + Railway staging deploy |
| `meta-deployment-plan` | The deferred real-domain go-live |
