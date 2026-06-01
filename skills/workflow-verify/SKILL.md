---
name: workflow-verify
description: Plan-Execute-Verify loop for the Persimmon stack. Use as step 4 of the workflow to confirm a task or feature actually works before moving on or merging. Runs the TypeScript/Prisma toolchain and user-workflow checks. Trigger keywords: verify, confirm it works, run checks, does this pass, acceptance, test it.
---

# Workflow — Verify

Step 4 of the Persimmon workflow. Confirm the work satisfies its acceptance criteria using evidence, not assertions. This replaces aslan's PHP-audit + Playwright loop with the Persimmon TypeScript/Prisma toolchain.

## The verification loop

Run validator → fix → repeat until clean:

1. **Type check:** `npx tsc --noEmit` — zero errors. No new `any`.
2. **Lint:** `npx eslint .` (or `npm run lint`) — zero errors.
3. **Schema:** `npx prisma validate`; if the schema changed, `npx prisma migrate diff` is clean / migration applied.
4. **Tests:** `npx vitest run` (unit) and/or `npx playwright test` (E2E) for the touched surface.
5. **Boundaries:** confirm every new Server Action / API route / webhook parses input with Zod (`stack-zod-boundary`).
6. **Build sanity:** `npm run build` — and confirm any DB/`auth()`-reading page exports `const dynamic = "force-dynamic"` (or the Railway build will prerender-crash).

## User-workflow checklist (not raw assertions)

Write acceptance as operator workflows and check them off:

```
- [ ] Operator logs in → lands on dashboard (auth + trustHost OK)
- [ ] Operator opens Process #1234 → Briefs tab → sees generated brief WITH citations
- [ ] Operator uploads a PDF → presigned PUT succeeds (no net::ERR_FAILED)
- [ ] AI output is persisted and not regenerated on reload
```

## Output

A pass/fail record per acceptance item. On any fail → `workflow-debug`. On all pass → `workflow-code-review`.

## Relationship to other skills

Invokes the `quality` review-* children for deeper dimension checks. Failures route to `workflow-debug`.
