---
name: final-review
description: Pre-delivery QA orchestrator for Persimmon client projects. Runs all review-* skills in parallel (security, performance, type-safety, data-layer, prompt-output), aggregates findings by severity, and produces a ship / don't-ship verdict. Triggers on "final review", "pre-delivery QA", "before shipping", "before we ship", "ship check", "launch check".
---

# Final Review — Persimmon Pre-Delivery QA

Orchestrator that runs every review dimension in parallel and produces a single prioritized report with a ship / don't-ship verdict. Use before delivering a Persimmon client build (e.g. Piccino) or before a production cutover.

## When To Run

- Before showing a build to the client.
- Before a production cutover or domain switch.
- After a significant schema, auth, or AI pipeline change.
- On demand — "final review", "ship check".

## Inputs

Collect these before dispatching:

| Input | Example | Required |
|---|---|---|
| `SITE_URL` | `https://sistema.piccino.com.br` | yes (required by security + performance) |
| `PROJECT_ROOT` | `/Users/renato/Projects/piccino-legal` | yes |
| `BRANCH` | `main` or PR branch under review | yes |
| `DATABASE_URL` | Railway connection string | optional (enables EXPLAIN ANALYZE in data-layer) |
| `PROJECT_TYPE` | `rag-app` / `crud-app` / `api-only` | optional; adapts which reviews run |

If any required input is missing, ask the user via `AskUserQuestion` before dispatching.

## Step 1 — Gather Context

```bash
cat "$PROJECT_ROOT/CLAUDE.md" | head -80
cat "$PROJECT_ROOT/README.md" | head -30
git -C "$PROJECT_ROOT" status
git -C "$PROJECT_ROOT" log --oneline -10
```

Note:
- Tech stack deltas from Persimmon default (if any).
- Which pipelines are live vs scaffolded.
- Recent commits (the fresh changes are the riskiest).

## Step 2 — Dispatch Parallel Reviews

Fire all five review skills in parallel. Each gets the same inputs:

```
Dimension              Skill                    Primary checks
─────────────────────────────────────────────────────────────────────────────
Security               review-security          Headers, auth, injection, secrets, uploads, AI key, deps
Performance            review-performance       RSC, bundle, images/fonts, fetch, DB, CWV, Claude parallelism
Type Safety            review-type-safety       tsconfig, any, !, ts-ignore, Zod at boundaries, Prisma types
Data Layer             review-data-layer        Schema, N+1, transactions, migrations, pgvector, pooling
Prompt & Output        review-prompt-output     Centralization, injection, output contract, citations, caching, evals
```

Each review returns a structured payload:

```json
{
  "skill": "review-data-layer",
  "counts": { "CRITICAL": 2, "HIGH": 3, "MEDIUM": 1, "LOW": 0 },
  "findings": [
    { "severity": "CRITICAL", "section": "Queries", "finding": "N+1 on /processes list", "location": "src/app/processes/page.tsx:18", "remediation": "Use include:{_count:{select:{files:true}}}" }
  ]
}
```

## Step 3 — Aggregate

Merge into one table sorted by severity (CRITICAL → HIGH → MEDIUM → LOW), then by dimension.

### Severity Matrix

| Severity | Meaning | Ship decision |
|---|---|---|
| CRITICAL | Exploitable, data-losing, crash-inducing, or contract-violating | Block |
| HIGH | Will fail in production under normal load or real users | Block unless explicit waiver |
| MEDIUM | Degrades UX or maintainability; fix in next iteration | Ship allowed, triaged |
| LOW | Polish / nit / future hardening | Ship allowed |

### Final Verdict Logic

```
if any CRITICAL         → DON'T SHIP
else if HIGH ≥ 3        → DON'T SHIP (stack of HIGHs = de facto CRITICAL)
else if HIGH ≥ 1        → SHIP WITH WAIVER (client + Persimmon sign-off on each HIGH)
else                    → SHIP
```

## Step 4 — Report

Save to `$PROJECT_ROOT/docs/qa-report-{YYYY-MM-DD}.md` and also print to chat.

### Report Template

```
Persimmon Final Review — {PROJECT_NAME}
Site:    {SITE_URL}
Branch:  {BRANCH}
Commit:  {SHORT_SHA}
Date:    {YYYY-MM-DD HH:MM}
Reviewer: Claude (final-review)

==================================================================
SUMMARY
==================================================================
  Security        [PASS/WARN/FAIL]   C:_  H:_  M:_  L:_
  Performance     [PASS/WARN/FAIL]   C:_  H:_  M:_  L:_
  Type Safety     [PASS/WARN/FAIL]   C:_  H:_  M:_  L:_
  Data Layer      [PASS/WARN/FAIL]   C:_  H:_  M:_  L:_
  Prompt & Output [PASS/WARN/FAIL]   C:_  H:_  M:_  L:_

  TOTALS          CRITICAL:_  HIGH:_  MEDIUM:_  LOW:_

  VERDICT: [SHIP | SHIP WITH WAIVER | DON'T SHIP]

==================================================================
CRITICAL — must fix before delivery
==================================================================
1. [security]  HSTS missing on next.config.ts
   Location:   next.config.ts
   Risk:       Chrome flags password forms "Not Secure"; MITM on first load
   Fix:        Add Strict-Transport-Security header (see review-security §1)

2. [data]      new PrismaClient() in src/app/api/jobs/route.ts:5
   Risk:       Exhausts Postgres connection pool on hot reload / fan-out
   Fix:        Import { db } from "@/lib/db"

==================================================================
HIGH — fix before delivery (or document waiver)
==================================================================
...

==================================================================
MEDIUM — schedule for next iteration
==================================================================
...

==================================================================
LOW — nice to have
==================================================================
...

==================================================================
ARTIFACTS
==================================================================
- Lighthouse JSON:   /tmp/lh.json
- tsc log:           /tmp/tsc.log
- npm audit:         /tmp/audit.json
- build log:         /tmp/build.log
```

## Step 5 — Sign-Off

Once CRITICAL items are zero, the report is signable. Append:

```
==================================================================
SIGN-OFF
==================================================================
Engineer (Persimmon):  Renato Prado         Date: ___  Signature: ___
Client rep:            {client name}        Date: ___  Signature: ___

Waivers (HIGH items deliberately shipped):
  - [ ] #__ — reason: ____________________  Owner: ____  ETA: ____
```

No sign-off section unless zero CRITICAL.

## Acceptance Criteria

A build is shippable when:
1. CRITICAL count = 0 across all five dimensions.
2. Each HIGH is either resolved or documented in the waivers list with a named owner and ETA.
3. `npx tsc --noEmit` exits 0.
4. `npm run build` exits 0.
5. `npm audit --omit=dev` has zero `critical`.
6. Lighthouse mobile LCP ≤ 4s and CLS ≤ 0.25.
7. Every Server Action and API route validates input with Zod.
8. Every Claude call path has a DB short-circuit for existing results.

## Failure Criteria

Block the ship on any of:
- Any CRITICAL in any dimension.
- HSTS missing on HTTPS app.
- `trustHost: true` missing when deploying behind Railway.
- Destructive migration without backfill.
- Unvalidated user input reaching a Claude `system` prompt.
- `NEXT_PUBLIC_*` carrying an API key.
- Any `new PrismaClient()` outside `src/lib/db.ts`.

## Adapting Scope

| Project type | Emphasize | De-emphasize |
|---|---|---|
| RAG app (Piccino-style) | prompt-output, data-layer (pgvector), security (uploads) | — |
| Internal CRUD | data-layer, type-safety, security (auth) | prompt-output |
| API-only service | security, data-layer, type-safety | performance (CWV) |
| Early MVP | CRITICAL only; WARN instead of FAIL on MEDIUM items | full strictness |

Read the project's `CLAUDE.md` to pick the scope. Document the choice in the report header.

## Commands (one-liners for the human follow-up)

```bash
cd "$PROJECT_ROOT" && npx tsc --noEmit
cd "$PROJECT_ROOT" && npm run build
cd "$PROJECT_ROOT" && npm audit --omit=dev --json > /tmp/audit.json
curl -sI "$SITE_URL" | head -30
npx lighthouse "$SITE_URL" --preset=desktop --only-categories=performance --output=json --output-path=/tmp/lh.json --chrome-flags="--headless=new"
```

## Related Skills

- `review-security`
- `review-performance`
- `review-type-safety`
- `review-data-layer`
- `review-prompt-output`

Each can also be invoked standalone if only one dimension needs checking.
