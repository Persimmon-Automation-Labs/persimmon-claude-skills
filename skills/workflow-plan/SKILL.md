---
name: workflow-plan
description: Turn an approved Persimmon spec into an implementation plan. Use as step 2 of the workflow, after a spec is approved and before execution. Produces a task-by-task plan with EARS acceptance criteria and a Why-this-matters line per task. Trigger keywords: plan, implementation plan, break into tasks, acceptance criteria, EARS, how to build this.
---

# Workflow — Plan

Step 2 of the Persimmon workflow. Convert an approved spec into a plan an enthusiastic junior engineer could follow.

## Prerequisites

An approved spec exists in `docs/specs/`. If not, go back to `workflow-brainstorm`.

## Process

1. **Decompose into small, ordered tasks.** Each task touches a named set of files and is independently verifiable.
2. **Write EARS acceptance criteria** per task: `While <precondition>, when <trigger>, the <system> shall <response>`.
3. **Add a `**Why this matters:**` line** per task tying it to the spec's Business meaning. Mechanical tasks use the escape hatch: `**Why this matters:** Mechanical — enables [Task N].`
4. **Mark client-blocked tasks** with `human-blocked` so `workflow-execute` skips them until unblocked.
5. **Write the plan** to the CLIENT repo at `docs/plans/YYYY-MM-DD-{topic}.md`.

## Plan template

```markdown
# {Title} — Plan
Spec: docs/specs/YYYY-MM-DD-{topic}.md

## Task 1 — {short name}   [state: ready | human-blocked]
**Files:** src/app/…, prisma/schema.prisma, src/lib/ai/prompts.ts
**Why this matters:** …
**Implements:** {REQ-ID(s) — e.g. `REQ-PIC-AUTH-002`} · Spec §{section} · {SCREEN-ID = mockup file, e.g. `SCREEN-login`} {— or "no screen: backend/infra task"}
**Acceptance (EARS):**
- While a user is authenticated, when they submit the form, the Server Action shall validate with Zod and persist via the shared Prisma client.
- While the page reads the DB, the page shall export `const dynamic = "force-dynamic"`.

## Task 2 — …
```

The `**Implements:**` line is the `built` link in the RTM (`workflow-traceability`). At T1/T2 the REQ + SCREEN IDs are required so `traceability-audit` can resolve task→requirement→screen without prose-matching. A UI task with no mockup citation is a red flag — the mockup is the design target; build to it, not to imagination.

## Before handoff — traceability checklist (tiered)

- [ ] Every task has `**Why this matters:**` and (at T1/T2) an `**Implements:**` line citing its spec section/criterion (REQ-ID) and the specific mockup file (SCREEN-ID), or explicitly "no mockup: backend/infra".
- [ ] **Every screen in the spec's `mockups/` has at least one task that implements it** — no mockup left unbuilt (reverse-traceability).
- [ ] Every task has a file-touch list, EARS acceptance criteria, and user-workflow verification steps.
- [ ] Human-blocked tasks are marked `human-blocked`.

## Output

A plan at `docs/plans/YYYY-MM-DD-{topic}.md`. Hand off to `workflow-execute`.

## Persimmon-specific reminders to encode in tasks

- New DB-reading page → `force-dynamic`.
- New mutation → Server Action + `stack-zod-boundary` + `revalidate*`.
- New Claude call → through `ai-sdk-wrapper`; new prompt → in `ai-prompt-library`.
- New upload → presigned PUT + bucket CORS origin.
- New secret → Railway/GitHub env, never code.

## Relationship to other skills

Preceded by `workflow-brainstorm`; executed by `workflow-execute`; verified against by `workflow-verify`.
