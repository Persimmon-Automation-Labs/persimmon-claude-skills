---
name: workflow-code-review
description: Two-stage pre-merge review for Persimmon work — spec compliance, then Persimmon conventions. Use as step 6 of the workflow before merging a branch. Trigger keywords: code review, review before merge, PR review, check against spec, ready to merge.
---

# Workflow — Code Review

Step 6 of the Persimmon workflow. Two stages, in order.

## Stage 1 — Spec compliance

1. Open the spec at `docs/specs/` and the plan at `docs/plans/`.
2. For each acceptance criterion, confirm the code actually meets it (not "looks like it").
3. Flag scope drift: anything built that the spec didn't cover, or any goal/non-goal violated. Drift means either the spec is updated and re-approved, or the code is cut.
4. Confirm the `## Business meaning` outcome is genuinely delivered.

## Stage 2 — Persimmon conventions

Run the `quality` review dimensions against the diff:

- `quality-review-type-safety` — no `any`, Zod at boundaries, explicit return types
- `quality-review-data-layer` — no N+1, bounded lists, indexes, transactions
- `quality-review-performance` — RSC boundaries, bundle size, query plans
- `quality-review-prompt-output` — prompt hygiene, grounded/cited output
- `security-review` — headers, auth, secrets, injection, CVEs

Plus the master anti-patterns: SDK imported only in `claude.ts`, no inline prompts, `force-dynamic` present, no `NEXT_PUBLIC_*` secrets, presigned uploads.

## Output

A review verdict: approve, or a specific list of required changes (each linked to the rule/skill it violates). Comment the rule for any rejection.

## Relationship to other skills

Consumes the `quality` and `security` mothers. Precedes `workflow-finish`. For the dialogue discipline of giving/receiving review, `superpowers:requesting-code-review` / `receiving-code-review` are compatible.
