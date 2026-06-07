---
name: workflow-flow-review
description: "Derives EVERY user flow from a spec (actors × goals), scores each for coverage across spec prose / EARS acceptance criteria / plan task / mockup, and walks the developer through them one at a time in plain language so the human owns the flows — not just the AI. Surfaces gaps to a gaps-backlog. Use after a spec (and ideally mockups) exist, before or alongside workflow-plan, or to audit an existing spec's completeness. This is a workflow-traceability (RTM) pass. Trigger keywords: flow review, are all flows covered, walk me through the flows, RTM, coverage, user journeys, missing flows."
---

# Workflow — Flow Review (requirements traceability + human ownership)

A spec can be internally consistent and still silently miss whole user journeys, or address them in prose but never in a mockup or an acceptance criterion. This skill is the **flow-coverage audit**: enumerate every flow the product implies, score how completely each is addressed across all four layers, and — critically — **walk the human developer through each flow in plain language so they own it.** The second goal matters as much as the first: you must be able to demo the app and explain every journey to the client, not just trust that the AI built something. You leave this pass able to explain every flow.

It is a Requirements Traceability Matrix (RTM) adapted for Persimmon specs. It catches the pilot-blocking gaps a happy-path read misses — missing password-reset, operator identity at a shared terminal, trial/past-due UX, conflict-resolution UI.

## Trigger

- "Are all the user flows covered / well addressed?"
- "Walk me through the flows" / "Explain flow N"
- After `workflow-brainstorm` produces a spec (+ mockups), before or alongside `workflow-plan`
- Auditing an existing/inherited spec for completeness before building
- Before a client demo, to make sure you can narrate every journey

## What a "flow" is

A flow = **one actor pursuing one goal end to end.** Derive them, don't guess:

1. **Enumerate actors** from the spec (e.g. anonymous prospect, org admin, manager, operator, viewer, platform admin). Every role in the auth/roles section is an actor.
2. **For each actor, list their goals** — the things they come to the product to accomplish (sign up, log in, recover password, create a record, run a report, connect an integration, resolve a sync conflict, manage billing…).
3. **Each (actor, goal) pair is a flow.** Include the unglamorous ones that specs habitually drop: account recovery, invite/accept, empty/zero states, error/failure paths, lockout/expiry, logout, "no access" states. These are where the real gaps hide.

Number the flows so you and the developer can refer to them ("flow 6").

## The coverage score — four layers

For each flow, check whether it is addressed at each layer, with evidence:

| Layer | Present means… | Evidence to cite |
|---|---|---|
| **Spec prose** | The spec describes the journey | section / heading |
| **EARS criterion** | An acceptance criterion makes it testable | the EARS line |
| **Plan task** | A task builds it (once a plan exists) | task id |
| **Mockup** | A screen renders it | `mockups/{file}.html` |

Verdict per flow: **MATCH** (all relevant layers present) · **PARTIAL** (prose only, or no mockup/criterion) · **GAP** (missing or undefined behavior). Backend/infra flows legitimately have no mockup — note that, don't score it as a gap.

Render the result as the **RTM, in the shape `traceability-audit` generates and parses** (`workflow-traceability`): `FLOW · personas · source · screens · covered · built · verified · usable`. Keep the registry at `docs/requirements/flows.md`. Column meanings:

- **personas / source** — anchor each flow to named `PERSONA-`s (not bare role labels) and a source (`SOW §` | `REQ-` | `ADR-`). A flow with neither is an orphan the audit flags.
- **screens** — the `SCREEN-` (mockup filename) each flow step touches; the flow↔view join.
- **covered** — the REQ/EARS the flow satisfies (the four-layer scan above).
- **built** — the plan task (`Implements:` cite). **verified** — a tagged automated test (`vitest`/Playwright) **OR** a dated manual user-workflow checklist item (never force E2E). **usable** — a human completed the task scenario (see usability pass below); `TODO` until then.

Run `node <persimmon-skills>/scripts/traceability-audit.mjs <docs-root>` to mechanically check the links and print this table — but remember it only checks authored nodes; **the completeness claim below is yours to sign** (ADR-0008).

## Walk the human through them — one at a time

This is the half that makes the developer *own* the app. After the table, go flow by flow (or on request, "explain flow N"). For each flow, in plain language:

1. **Who and why** — the actor and what they're trying to accomplish, in the client's domain language (not code).
2. **What they see and do, step by step** — front to back, referencing the actual mockup screens so it's concrete ("they open the case, pick the Briefs tab, see the generated brief with citations, click to export").
3. **How well it's addressed** — the verdict and *why*, citing the four layers.
4. **The gaps, and your recommendation** — what's undefined, and the best-practice way to close it (cite a skill, or research it per the `persimmon` "apply skills, don't improvise" rule).

One flow per turn when the user is reading along; don't dump all of them. The goal is comprehension, not coverage-theater. Answer "but why is this flow here?" and "isn't there a better way to do this?" honestly — challenge weakly-justified flows (a flow that exists only because the schema allows it may be YAGNI for v1).

## Log gaps — don't fix silently

Every GAP (and every decision the walkthrough settles) goes to a running **gaps backlog** in the project, not lost in chat:

- File: `docs/specs/{topic}-gaps-backlog.md`
- Status key: `📋 open (fix later)` · `🔧 fixing now` · `✅ done` · `⏸️ deferred/out-of-scope`
- One stub per gap: the flow it came from, a one-line description, and (when decided) the ratified best-practice resolution.
- Costly/irreversible gaps (money, law, live data, schema) also become **Client Questions** (`docs/context/open-questions.md`) and **Risk register** rows — same rule as `workflow-brainstorm` / `workflow-spec-review`.

Append new gaps as you find them across the walkthrough; never silently drop one because it "looks small."

## Feeding the results back

- **Gaps that are engineering/industry decisions** → resolve with the best-practice method (`persimmon` "apply skills, don't improvise"), write the resolution into the spec (bump its version), and into the gaps backlog as `✅`.
- **Gaps that are the client's call** → Client Questions log; keep designing around them.
- **Confirmed coverage** → the RTM table becomes a checklist `workflow-plan` must satisfy: every flow with a mockup needs a plan task (forward traceability), and every mockup needs a flow (reverse). This is exactly the `**Implements:**` citation `workflow-plan` now requires.

## Output

1. The **RTM table** (all flows × four layers × verdict) — saved into the spec or alongside it at `docs/requirements/flows.md`.
2. A **gaps backlog** file with every GAP logged.
3. (Interactive) a **plain-language walkthrough** of each flow on request, so the human can demo the app and knows what every journey does.

## Anti-patterns

- **Happy-path-only enumeration** — skipping recovery, invite/accept, empty states, error paths, lockout/expiry, logout, no-access. That's where the pilot-blocking gaps live.
- **Scoring prose as coverage** — a flow described but with no mockup and no acceptance criterion is PARTIAL, not MATCH.
- **Fixing gaps silently in chat** — they must land in the backlog (and Client Questions / Risk register if costly) or they evaporate.
- **Coverage-theater** — dumping a 30-row table without walking the human through it defeats the ownership goal.
- **Calling a green audit "complete"** — the audit links authored nodes; completeness is the human-signed four-source claim (ADR-0008).
- **Not challenging weak flows** — if a flow is only there because the schema allows it and no persona needs it, say so (YAGNI).

## Relationship to other skills

| Skill | Relationship |
|---|---|
| `workflow` | Mother; this runs after `workflow-brainstorm`/`workflow-spec-review`, before/with `workflow-plan` |
| `workflow-traceability` | The model home — IDs, the spine, the tiering matrix, the audit this pass runs |
| `workflow-brainstorm` | Produces the spec + mockups this audits; content-parity + SOW-coverage are sibling traceability checks |
| `workflow-spec-review` | Red-teams the spec's correctness; this checks flow *coverage* (complementary) |
| `workflow-plan` | Consumes the RTM — every covered flow needs a task; its `**Implements:**` citations are the forward link |
| `persimmon` | The apply-skills + research rules used to resolve each gap |
