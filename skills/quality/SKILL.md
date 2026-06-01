---
name: quality
description: Index of Persimmon review/QA skills — performance, type-safety, data-layer, and prompt-output reviews, plus the final-review orchestrator that runs them all before client delivery. Use when reviewing a change, preparing for delivery, or running pre-merge QA. Routes to the right specialist child skill. Trigger keywords: review, QA, pre-delivery, ship check, final review, performance, Core Web Vitals, type safety, N+1, hallucination, citation.
---

# Quality — Index

Persimmon quality = a set of focused review passes plus an orchestrator that runs them before delivery. This mother is a map; follow the child for the actual work.

## Trigger

- "Review this change" / "pre-delivery QA" / "ship check"
- "Is this fast enough / type-safe / DB-efficient?"
- "Final review before the client sees it"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `quality-final-review` | Before any client delivery | Orchestrates all review-* dimensions + `security-review`; produces a go/no-go summary |
| `quality-review-performance` | Perf concerns | RSC boundaries, bundle size, DB query plans, Core Web Vitals |
| `quality-review-type-safety` | Type rigor | Strict-mode gaps, `any` leaks, unchecked casts, missing Zod |
| `quality-review-data-layer` | DB review | N+1 queries, unbounded lists, missing indexes, transaction boundaries |
| `quality-review-prompt-output` | AI output review | Prompt hygiene, output validation, citation grounding, eval harness |

## How to route

1. **Delivering?** → `quality-final-review` (it pulls in the others + `security-review`).
2. **Single dimension?** → invoke the matching `quality-review-*` child directly.

## Persimmon quality defaults — one-screen summary

- **Final review is mandatory before client delivery** — never skip.
- **Review dimensions**: performance, type-safety, data-layer, prompt-output, security.
- **Type-safety**: no `any` without justification; Zod at every boundary.
- **Data-layer**: no N+1, no unbounded lists, indexes present, transactions where needed.
- **AI output**: every claim grounded/cited where the domain requires it (e.g. legal briefs).
- **Verification is evidence-based**: run `tsc --noEmit`, `eslint`, `prisma validate`, tests — don't assert "looks fine".

## Anti-patterns banned

- Shipping to a client without `quality-final-review`
- Declaring a review passed without running the checks
- Ignoring N+1 / unbounded lists "for now"
- Accepting ungrounded AI output where citations are required

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `workflow` | `workflow-verify` and `workflow-code-review` invoke these children |
| `security` | `security-review` is folded into `quality-final-review` |
| `stack` / `data` / `ai` | Each review dimension audits the matching domain |
