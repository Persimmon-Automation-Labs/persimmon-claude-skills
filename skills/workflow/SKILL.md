---
name: workflow
description: Index of the Persimmon workflow discipline — brainstorm → plan → execute → verify → debug → review → finish. Routes work to the right child skill. Invoked FIRST on any non-trivial task per the persimmon master skill's workflow gate. Skips for trivial edits (copy, one-line Tailwind, dependency bumps, typos, README). Trigger keywords: workflow, where do I begin, new feature, spec, plan, brainstorm.
---

# Workflow — Index

The workflow mother enforces brainstorm-before-code discipline on every non-trivial Persimmon task. It exists so we never ship code that drifts from what the client agreed to, and so the team understands the business meaning of every change before it ships. Adapted from obra/superpowers for the Persimmon Next.js/TypeScript/Prisma stack.

This is the **first** mother to invoke on any non-trivial work. The `persimmon` master skill's workflow gate routes here before any domain mother.

## Trigger

- "Starting work on a new feature / page / integration"
- "Where do I begin?" / "Workflow for this task"
- Any non-trivial Persimmon task — the SessionStart hook routes here automatically

## What counts as "non-trivial" (workflow required)

If the commit message would mention any of these, workflow is required:
- A new file, route, or page
- A new Prisma model / schema column / migration
- A new Server Action or API route
- A new dependency
- A new prompt or AI pipeline step
- "feature/refactor" verbs

Trivial work bypasses straight to the relevant domain mother: copy/text changes, one-line Tailwind tweaks, README/CLAUDE.md edits, dependency version bumps, typos, reverting a recent commit.

## Project-type tiers

Two gate strengths, selected by `.claude/project-type`:

| Tier | Strength |
|---|---|
| `internal-tool` | Full workflow required on every non-trivial task (e.g. piccino-legal) |
| `marketing-site` | Workflow required only for new pages or new sections |

If `.claude/project-type` is missing, ask once and offer to write it.

## The child skills (lifecycle order)

| Phase | Child | When to invoke |
|---|---|---|
| 1. Decide what to build | `workflow-brainstorm` | Any non-trivial feature/page/change. Produces an approved spec at `docs/specs/YYYY-MM-DD-{topic}.md` with a required `## Business meaning` section. |
| 2. Decide how to build it | `workflow-plan` | After a spec is approved. Produces `docs/plans/YYYY-MM-DD-{topic}.md` with EARS acceptance criteria + a `**Why this matters:**` line per task. |
| 3. Build it | `workflow-execute` | Executes a plan task-by-task. Models `human-blocked` state for tasks waiting on client replies. |
| 4. Confirm it works | `workflow-verify` | Plan-Execute-Verify loop: `tsc --noEmit`, `eslint`, `prisma validate`, `vitest`/Playwright, Zod-boundary check, manual user-workflow checklist. |
| 5. Debug when it doesn't | `workflow-debug` | Systematic debugging for the Persimmon stack — Railway logs, Prisma client cache, force-dynamic prerender crashes, NextAuth UntrustedHost, CORS. |
| 6. Review before merge | `workflow-code-review` | Two-stage review: spec-compliance vs `docs/specs/`, then Persimmon conventions via the `quality` review-* skills. |
| 7. Ship and close out | `workflow-finish` | Pre-merge checklist (CI green, force-dynamic audited, env vars set, CLAUDE.md updated) and branch cleanup. |

## The escape hatch — `skip workflow:`

The user can override the gate by typing `skip workflow:` followed by what they want. Claude proceeds without the workflow children and appends `Workflow: skipped by user` to the commit footer. Track usage; if it fires on >20% of tasks, loosen the trivial-bypass list above.

## Folder convention

| Path (in the CLIENT repo, never here) | What lives there |
|---|---|
| `docs/specs/YYYY-MM-DD-{topic}.md` | Approved spec (source of truth), includes `## Business meaning` |
| `docs/plans/YYYY-MM-DD-{topic}.md` | Implementation plan with EARS criteria + Why-this-matters per task |
| `docs/decisions/` | ADRs (MADR-lite) for non-obvious architecture choices — see `meta-adr-authoring` |

## Persimmon defaults for workflow artifacts

- **Specs and plans live in the client project repo**, never in the skills repo.
- **Spec template requires `## Business meaning`** — what the change means for the client's operators, not just the code.
- **Plan requires `**Why this matters:**`** per task — mechanical tasks use the escape hatch `Mechanical — enables [Task X]`.
- **Verify steps are user workflows**, not raw assertions. `✓ [ ] Operator opens Process #1234 → Briefs tab → sees generated brief with citations`.
- **EARS notation** for acceptance criteria: `While <precondition>, when <trigger>, the <system> shall <response>`.

## Relationship to other mothers

`workflow-verify` and `workflow-code-review` lean on the `quality` mother's review-* children. `workflow-debug` references gotchas owned by `infra`, `data`, and `security`.
