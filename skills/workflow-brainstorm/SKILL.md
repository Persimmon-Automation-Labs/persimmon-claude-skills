---
name: workflow-brainstorm
description: Brainstorm-before-code design dialogue for Persimmon work. Use as step 1 of the workflow on any non-trivial feature, page, integration, or schema change — BEFORE writing code. Produces an approved spec with a required Business meaning section. Trigger keywords: brainstorm, design this, spec, what should we build, scope this feature, requirements.
---

# Workflow — Brainstorm

Step 1 of the Persimmon workflow. Turn a rough request into an approved spec **before** any code. Adapted from obra/superpowers `brainstorming`.

## Trigger

- Any non-trivial new feature, page, integration, or schema change
- Routed here by the `workflow` mother / `persimmon` gate

## Process

1. **Ask one question at a time.** Refine the rough idea through a dialogue — do not dump a list of 10 questions. Cover: who operates this, what problem it solves, what success looks like, what's explicitly out of scope, and what data/integrations it touches.
2. **Surface alternatives.** Present 2–3 viable approaches with trade-offs (effort, risk, fit to the Persimmon stack). Recommend one.
3. **Present the design in sections** short enough to read. Get explicit sign-off per section before moving on.
4. **Write the spec** to the CLIENT repo at `docs/specs/YYYY-MM-DD-{topic}.md` using the template below.
5. **Block approval** if the `## Business meaning` section is missing or empty.

## Spec template

```markdown
# {Title}

## Business meaning
What this change means for the client's operators (not the code). Who does what
differently, and why it matters to the firm. (REQUIRED — approval blocks without it.)

## Problem
The concrete problem, in the operator's words.

## Goals / Non-goals
- Goal: …
- Non-goal: … (what we are deliberately NOT doing)

## Approach
Chosen approach + why, with the alternatives considered and rejected.

## Stack impact
New routes / Server Actions / Prisma models / migrations / prompts / env vars / deps.
Flag anything that needs `force-dynamic`, a new bucket/CORS origin, or a new secret.

## Risks & open questions
Anything still unknown or client-blocked.

## Acceptance (high level)
Bullet outcomes a human can verify. (Detailed EARS criteria come in `workflow-plan`.)

## Skills applied            ← REQUIRED at T1/T2 (workflow-traceability)
The provenance footer: which skills were READ for which decisions (e.g. "IA →
frontend-public-site-conventions; data model → data-schema-design; auth →
security-nextauth"), and a `Decisions needing research:` line listing what was
researched. An empty footer on a non-trivial spec is a defect — it means the
design can't be traced to applied skills. `workflow-spec-review` verifies this.
```

## Traceability (tiered — see `workflow-traceability`)

Per the tiering matrix (`project-type` × `project-stage`):

- **At T1/T2** (operated surfaces / past prototype), give every acceptance criterion a stable **`REQ-<PROJ>-<AREA>-<NNN>`** ID and a cited **source** (`SOW §x` | `ADR-<NNNN>` | `constitution:<skill>`), kept in `docs/requirements/requirements.md`; name each screen by its **mockup filename** (`SCREEN-<slug>`) and capture the actors as a **persona registry** (`docs/requirements/personas.md`). IDs are what let `traceability-audit` and `workflow-flow-review` link the spine without prose-matching. A criterion whose source is neither the SOW nor a skill must point to an **ADR** (`meta-adr-authoring`).
- **At T0** (marketing/prototype) skip IDs except on money/auth/data criteria.
- **Mockups:** before a mockup set is "done", run the token-lint so a typo'd `var(--token)` (which renders as *nothing* — invisible breakage) is caught: `node <persimmon-skills>/scripts/mockup-token-lint.mjs docs/specs/<topic>/mockups src/app/globals.css`. Subagents reintroduce this constantly — put the lint in their return criteria.

## Bespoke public-facing design — extra gates

When the spec covers a bespoke public page (marketing home, storefront, customer-facing screen), three extra gates apply (internal/admin screens are exempt — they're deliberately templated):

- **Research references first.** Before designing, pull live references and extract specific moves — see `frontend-public-site-conventions` → "Research live references before you design." Cite them in the Approach section. A bespoke layout is a *derived* decision, not a default you fell into; skipping this is what produces a generic first draft.
- **Brand values carry provenance.** Every color/font the spec states must trace to `BRAND-GUIDE.md` — tagged `extracted from live CSS {url} {date}` (computed value, not a guess), `from client brand book`, `Persimmon scaffold default — provisional`, or `human-blocked — pending client`. A bare hex/font with no provenance is invented — fix it or mark it human-blocked. Never log a color/font that isn't in the captured brand (a past project shipped an invented navy + a font that wasn't on the site).
- **Content parity (redesigns).** Every real content block on the old site (from `client-onboarding`'s inventory — including content trapped in PDFs/images) maps to the new design, or is explicitly flagged "dropped — confirm with client." Forward traceability for content, the way SOW coverage is for scope. Generic mockups silently drop what makes the business specific.

Definition of done for the page itself: it passes the `frontend-public-site-conventions` "system test" (the anti-AI-tell self-audit). Hand references + the brand guide to any subagent that builds a screen — they don't inherit this.

## Output

An approved spec at `docs/specs/YYYY-MM-DD-{topic}.md` in the client repo. On approval, hand off to `workflow-plan`.

## When NOT to use

Trivial edits (copy, one-line Tailwind, dependency bumps, typos) bypass — go straight to the relevant domain mother.

## Relationship to other skills

Followed by `workflow-plan`. The spec is the source of truth `workflow-code-review` checks against.
