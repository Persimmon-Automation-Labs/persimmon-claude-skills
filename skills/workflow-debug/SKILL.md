---
name: workflow-debug
description: Systematic debugging for the Persimmon stack. Use as step 5 of the workflow when a verification check fails or behavior is wrong. Covers the recurring Next.js 16 / Prisma / Railway / NextAuth gotchas. Trigger keywords: debug, broken, failing, error, 500, build fails, not working, why is this happening.
---

# Workflow — Debug

Step 5 of the Persimmon workflow. Systematic over ad-hoc: reproduce, isolate, form a hypothesis, test the cheapest hypothesis first, fix, then re-run `workflow-verify`.

## Method

1. **Reproduce** deterministically — exact steps, environment (local vs Railway), and the precise error text.
2. **Isolate** — narrow to one layer (build, request, DB, auth, AI, upload).
3. **Hypothesize & test** — cheapest check first. Change one thing at a time.
4. **Fix and verify** — re-run the relevant `workflow-verify` checks; confirm no regression.

## Persimmon recurring gotchas (check these first)

| Symptom | Likely cause | Fix |
|---|---|---|
| Railway build fails on a page | Page reads DB/`auth()` without `force-dynamic`; build container has no DB path | Add `export const dynamic = "force-dynamic"` |
| `UntrustedHost` from NextAuth | Behind Railway edge without trust | `trustHost: true` in `auth.ts`; middleware reads `x-forwarded-host` |
| Upload fails, `net::ERR_FAILED`, no server log | Bucket CORS missing the origin | Add origin via `PutBucketCorsCommand` |
| Stale types/enums after schema change | Running dev server holds old Prisma client | Restart `npm run dev` after `db push` |
| Site reachable but domain wrong | Container port mismatch | Public domain `targetPort` must be `8080`, not 3000 |
| Frequent 529 / overloaded | Too few Claude retries | Wrap calls with 3 retries, exp backoff (handled in `ai-sdk-wrapper`) |
| Vector search returns junk | Querying filtered-subset HNSW index without the filter | Always include the filter |
| Automation stopped on Railway | Staged-config draft reverted live mutations | Settings → Source → Disconnect → Reconnect |

## Output

A root-cause note (1–3 lines) and the fix. Then return to `workflow-verify`.

## Relationship to other skills

Pulls domain knowledge from `infra`, `data`, `security`, `ai`. For a general debugging discipline, the upstream `superpowers:systematic-debugging` skill is compatible.
