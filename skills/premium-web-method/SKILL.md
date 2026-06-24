---
name: premium-web-method
description: "Use when a public page must read as truly premium and authored, not generic/templated/AI-made (the 'any company could have this' problem). Why AI regresses to the median, and the diverge-then-converge process + gates that beat it."
---

# Premium Web Method — how to reliably produce authored, not generic, design

This is the **process** skill for premium public work. `public-website-creative-direction` derives the concept; `frontend-public-site-conventions` picks the values and owns the concrete craft baseline. This skill owns the thing that makes both *actually land* instead of collapsing to the median: **why an AI defaults to generic, and the pipeline that structurally prevents it.** It is the engine the other two are steps inside.

Reach for it whenever a finished page "still looks like a normal landing page," "any company could have this," "feels AI-made," or "isn't premium" — and before building any bespoke public page, so it never gets there.

## Trigger

- "Make it premium / not generic / not AI-looking / not a template"
- "Any [X] could have this exact site" · "it still looks like a normal landing page"
- Before the first bespoke public mockup (run this as the spine; it sequences creative-direction + conventions)
- A design that passed every checklist and still reads as slop

## The thesis: authored, not assembled

**Premium is the presence of decisions; generic is their absence.** A generic site is not the product of bad taste — it is a stack of individually-correct best practices with **no governing point of view**. Every drifting margin, every default radius, every even-weighted color is an *undelegated decision* a visitor can feel as instability, and trust drops the instant they feel it. Award-tier work subordinates every choice to **one organizing idea** and enforces it with **restraint**. (Awwwards scores Usability at 30%; flawless-and-voiceless loses to opinionated-and-slightly-rough. Competence is the absence of mistakes; premium is the presence of a position.)

Three consequences, each load-bearing:
- **Restraint reads as confidence; addition reads as insecurity.** Past a point, more polish/motion/sections *inverts* into cheap. The luxury signal is what you *remove* — near-zero copy, one accent, negative space placed like type. Filling every inch says you fear the work can't hold attention alone.
- **The "premium feel" is the 5% no one was obligated to do** — alignment to a grid, smooth interruptible timing, bespoke (not clip-art) assets, the value sitting *just inside* the obvious extreme (never `#fff`/`#000`, never `scale(0)`, never `ease-in`). It's accumulated, mostly-subconscious evidence of care, and it can't be templated.
- **Engineer peaks, not uniform richness** (Peak-End). A few precisely-timed moments define memory; "animate everything" just becomes noise. Spend the wow budget *once*.

## Why an AI defaults to generic (read this — it is the whole problem)

You cannot prompt your way to premium with adjectives, and you must understand why or you'll keep trying.

An LLM regresses to the median **by construction**: human preference data carries a *typicality bias* (annotators prefer familiar, fluent, predictable output independent of quality), RLHF then sharpens the model toward the single most-typical completion, and the training corpus is itself a sea of Tailwind-tutorial defaults (the "purple gradient / Inter / hero → 3 cards → CTA" cluster). The model isn't designing — it's **averaging**. Three implications that change how you work:

1. **Prose instructions ("be premium," "be creative," "make it unique") do not move the model off its mode.** Neither does temperature (it flattens sharpness uniformly without changing *which* answer the model heads toward). The default is structural; only a different *process* beats it.
2. **Naming a banned default primes it.** "No purple, avoid Inter, don't use gradients" *raises* the activation of the forbidden token — negative constraints backfire. State the **positive target** instead; enforce bans **mechanically, downstream** (a linter), never in the spec's prose.
3. **Genericness is invisible per-output and only visible across outputs.** Each single generation looks fine; the *pool* is homogenous. So per-page review misses it — you need to generate *several distinct* options and compare, and you need mechanical cross-output checks. The first answer the model gives is the mode; treating it as "the design" is the core mistake.

## The method (a pipeline, not a prompt)

The two techniques with the strongest evidence are **divergent/convergent decomposition** (separate exploring from constraint-satisfying — the single biggest novelty lever) and **mechanical gates** (the only reliable enforcement of "less generic"). The pipeline is built from both.

**0 — Strategy-first input.** Genericness enters when the *input* is generic. Give the model non-generic raw material first: the client's real onliness, enemy, origin, materials, voice (`public-website-creative-direction` intake). A concept derived from "we are the only ___ that ___" has nowhere for the median to enter. This is the primary defense; everything below reinforces it.

**1 — Diverge before you converge.** First **look** — pull 8–12 live references (the curated galleries + exemplar shortlist are in [reference/premium-reference-atlas.md](reference/premium-reference-atlas.md)); designing premium from memory lands on the median. Then produce **N genuinely distinct directions (aim for 5)**, each with a one-line rationale and a confidence — *constraints deliberately set aside*, taste-persona on ("a senior art director with an editorial/print background"). Distinct means different organizing concepts, not one concept in three colorways. **Never accept the first single answer** — that is the mode by definition. (Asking for N-with-rationale approximates the broader distribution instead of collapsing to the peak; larger models gain more from this, not less.)

**2 — Select against a rubric, human at the gate.** Score the candidates on explicit criteria (concept ownability, signature strength, does-it-survive-the-tests below) — not "which is best." Randomize order when an agent ranks. Know that an unguided LLM judge **drifts back toward the typical** (it prefers low-perplexity, i.e. its own median), so the rubric and the human pick are what hold the line. This is the one `AskUserQuestion` gate — present the top 2 with previews.

**3 — Converge.** Take the *one* selected seed, and only *now* apply the constraints — brand tokens, requirements, a11y, the concrete craft baseline (`frontend-public-site-conventions` craft layer). Applying constraints during step 1 causes "premature constraint satisfaction": the model spends its exploration budget on compliance and lands on the average. Diverge unconstrained; converge constrained.

**4 — Positive framing only.** Write specs as positive targets ("warm cream ground, ink-black text, one ochre accent, editorial serif at 7:1 scale"), never as bans. The banned-defaults list lives in a *linter*, not in the prompt.

**5 — Mechanical gates.** Prompts and self-critique are unreliable (a model self-bias-inflates its own work; a critique loop with no external anchor can make things *worse*). The only dependable enforcement of "not generic" is deterministic: run `node scripts/ai-tell-lint.mjs` — the visual genericness gate that catches Tailwind purple palette + gradient hero (fail hard), Inter/Geist, pure `#fff`/`#000`, blanket `rounded-2xl`, and feature-card emoji (warn). Treat any error as a hard fix. The bans live *here*, in the linter, never in the spec's prose (naming them primes them). What a linter can't catch — the centered-hero → 3-even-cards → CTA layout cluster — stays a human/rubric gate (the five tests above). A critique pass must check against an **external artifact** (the rubric, the brief, the linter output, the reference principles) — cap it at 1–2 iterations, never loop on self-judgment.

## The five tests (checkable, before a mockup is "done")

Each is a sharp, abstract gate — apply to the concept and the rendered page:

- **Swap test** — swap the logo and colors. Does the page fall apart? If it still works for any competitor, the personality isn't load-bearing → it's generic. Personality must be structural, so changing the brand breaks the page.
- **Collapse test** — remove the organizing device (the scroll choreography, the metaphor, the signature element). Does comprehension collapse? If the content survives intact, the device was *decoration* → demote it. A true concept is load-bearing structure; a theme survives its own removal.
- **Concept-before-pixels** — can you state the concept in 3–4 sentences of prose *before* any visual exists (the steps, the tension, the reveal)? If it's only expressible as a look, it's a skin invented at the surface, not a concept.
- **Second-job test** — for any flourish (texture, motion, 3D, illustration): does it do a job *beyond* looking good (reduce banding, encode the brand argument, aid comprehension, guide attention)? Only-aesthetic + costly → cut it.
- **Form-agrees-with-argument** — the experience itself is a claim. Does the *way it's built* assert the same thing the copy asserts? (A firm selling calm clarity must not ship a busy, baroque page.)

## Where "authored" actually shows up (the levers)

Abstract principles only — the concrete values live in `frontend-public-site-conventions` (the craft layer and the authored-craft baseline) and the concept derivation in `public-website-creative-direction`. The premium signal concentrates in:

- **One organizing idea, made the *medium* not the subject.** The strongest concepts *are* the material of the design (the data drives the particles; the firm's own work-order becomes the interface), not a motif laid on top. Design the **one signature moment first**, with the most care, then keep everything else quiet.
- **Contrast as the engine, restraint as the charge.** The oversized headline lands *because* the body is calm; the one accent pops *because* the neutrals dominate; the full-bleed image breathes *because* the text was contained; the single motion delights *because* the rest is still. Emphasis is a function of how much you withhold.
- **Type-as-architecture.** A distinctive display + a calm body, dramatic scale (a real 6:1–8:1, not a timid 2:1), carry the whole hierarchy with no decoration. Premium sites are routinely *type + grid alone*.
- **Negative space and editorial rhythm.** Treat the page like a magazine: a grid you break *deliberately*, contained↔full-bleed cadence, whitespace placed as composition. Uniform card-grids read as a CMS dump.
- **Choreographed motion, a small vocabulary.** Two easing curves, staggered entrances, one signature beat — interruptible, performance-budgeted, reduced-motion-aware. A small motion vocabulary *is* the sophistication.
- **Materiality as a visible decision.** Subtle grain (5–15% / brand-tint 2–5% — if a visitor can *name* the texture it's too loud), honest depth via layering and real edges (not fake shadow), and the **real thing** — real photography, the actual product — never stock or obvious-AI imagery, which now read as *negative* trust signals.

A small, coherent, constrained vocabulary beats a large one every time: one accent, two curves, one display + one body face, one spacing modulus. Premium is the *consistency of a constrained system*; slop is many ad-hoc choices.

## When NOT to use this skill

- Internal/admin tools — distinctiveness is a defect there; use `frontend-internal-tool-conventions`.
- T0/brochure work the client bought for speed, not a concept — apply the house defaults in `frontend-public-site-conventions` and skip the divergence step; don't fake a concept the engagement didn't pay for.
- Picking specific fonts/colors/values — that's `frontend-public-site-conventions`; deriving the concept itself — that's `public-website-creative-direction`. This skill sequences them.

## Relationship to Other Skills

| Skill | What it owns |
|---|---|
| `premium-web-method` (this) | The anti-generic *process* (diverge→select→converge→gate), the theory of premium, and why an AI regresses to the median |
| `public-website-creative-direction` | Step 0–1 content: the intake, the one organizing concept, the signature element, the strategy→token table |
| `frontend-public-site-conventions` | Step 3 values + the concrete authored-craft baseline and the AI-tell audit |
| `frontend-css-architecture` | Where the converged tokens get wired without duplication |
| `client-public-site-build` | The end-to-end pipeline that invokes this method on a real client URL |
