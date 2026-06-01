---
name: workflow-finish
description: Pre-merge checklist and branch close-out for Persimmon work. Use as step 7 of the workflow once review passes — confirm CI is green and the project is shippable, then clean up the branch. Trigger keywords: finish, close out, ready to ship, merge checklist, wrap up, done.
---

# Workflow — Finish

Step 7 (final) of the Persimmon workflow. Confirm the change is genuinely shippable, then close the branch.

## Pre-merge checklist

```
- [ ] workflow-code-review approved (spec compliance + conventions)
- [ ] CI green: lint, tsc --noEmit, prisma validate, build (see infra-github-ci)
- [ ] Every DB/auth()-reading page exports `const dynamic = "force-dynamic"`
- [ ] New env vars set in Railway (and documented in .env.example)
- [ ] New bucket CORS origins applied (if uploads changed)
- [ ] Migrations applied / db push strategy honored (one per project)
- [ ] AI outputs persist; no regeneration on reload
- [ ] Spec + plan committed in the client repo (docs/specs, docs/plans)
- [ ] CLAUDE.md updated if a new architectural pattern was introduced
- [ ] ADR written (meta-adr-authoring) if a non-obvious decision was made
```

## Close-out

1. Merge per the project's branch policy (Railway auto-deploys on push to `main`).
2. Verify the live deploy: app loads, no 500s, core flow works (smoke-test).
3. Delete the feature branch.
4. If this was a client deliverable, hand off to `meta-deployment-plan` + `quality-final-review`.

## Relationship to other skills

Preceded by `workflow-code-review`. Pairs with `infra-railway-deploy` (deploy), `infra-github-ci` (CI), and `meta-deployment-plan` (client sign-off).
