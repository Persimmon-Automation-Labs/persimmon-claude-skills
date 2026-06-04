---
name: persimmon
description: Master router for all Persimmon Automation Labs work. Invoke first on any task in a Persimmon client project — enforces the workflow gate on non-trivial work, then routes to the right domain mother (workflow, stack, frontend, backend, ai, data, infra, security, quality, client-lifecycle, domain-legal, project-meta). The single entry point for new Claude sessions in a Persimmon repo. Trigger keywords: persimmon, where do I start, which skill, orient me, Persimmon defaults, new session in this repo.
---

# Persimmon — Master Skill

The single entry point for any work in a Persimmon project. Read this first; it enforces the workflow gate, then points you at the right domain mother for the task at hand.

## Trigger

- Any Persimmon client work
- "Where do I start?" / "Which skill should I use?"
- "Persimmon defaults"
- "I just opened this project — orient me"

## Workflow gate (HARD RULE — read before anything else)

Before invoking ANY domain mother on non-trivial work, you MUST first invoke the `workflow` mother. The workflow layer forces brainstorm-before-code discipline so changes ship with an approved spec, a plan, and a **business-meaning** translation for the client's operators.

**On `internal-tool` projects** (see `.claude/project-type`), refuse to write code without:
1. An approved spec in `docs/specs/`, AND
2. A plan in `docs/plans/` for the current task.

If both are missing, respond: *"No approved spec/plan for this work. Invoke `workflow` to brainstorm and plan first."*

**On `marketing-site` projects**, a spec is required only for new pages/sections; minor edits bypass.

**Trivial bypass examples** (no workflow needed): copy/text changes, one-line Tailwind/CSS, README/CLAUDE.md edits, dependency version bumps, typos, reverting a recent commit. Rule of thumb: if the commit would mention a new file, schema/migration, route, Server Action, dependency, or use "feature/refactor" verbs — workflow is required.

**Override:** the user can type `skip workflow:` to proceed without the gate. The commit message footer gets `Workflow: skipped by user` for audit. If override fires on >20% of tasks, the bypass list is too tight.

If `.claude/project-type` is missing, ask once and offer to write it (`internal-tool` or `marketing-site`).

## Apply skills, don't improvise — and recognize a stale install

Two failure modes corrupt the work even when the right skill exists:

1. **Installed ≠ applied.** Before any design/IA/schema/architecture decision, invoke and actually *read* the relevant skill — don't work from memory of what it "probably says." If a skill has a checklist, make a TodoWrite item per item. A decision you can't trace to a skill you read (or research you ran) is improvisation; stop and do one of them.
2. **A referenced skill that isn't available means a stale/disabled plugin — not a skill that doesn't exist.** Persimmon skills ship as a versioned plugin (`persimmon@persimmon-labs`); a project pinned to an older version, or with the plugin disabled at this scope, won't see skills added since. If you cite a skill (in a spec, plan, or review) and it's **not in your available-skills list**, do NOT do what a past session did — relabel real skills as "inline methodology" and write that fiction into the spec. Instead: flag it, re-sync via `meta-skill-sync` (`claude plugin marketplace update persimmon-labs` / enable at project scope), then invoke the now-available skill. Never silently downgrade a named skill to route around its absence.

## The domain mothers

| Mother | When to invoke | Owns |
|---|---|---|
| `workflow` | **FIRST** on any non-trivial task — brainstorm → spec-review → plan → execute → verify → debug → review → finish | 8 children: workflow-brainstorm, -spec-review, -plan, -execute, -verify, -debug, -code-review, -finish |
| `stack` | App-code standards: Server Actions, strict TypeScript, Zod boundaries, Tailwind v4 tokens | `stack-server-actions`, `stack-typescript-strict`, `stack-zod-boundary`, `stack-tailwind-tokens` |
| `frontend` | Any UI work: conventions, page templates, CSS/theme, responsive, tables, forms, feedback, upload UX, print | `frontend-internal-tool-conventions`, `frontend-public-site-conventions`, `frontend-page-templates`, `frontend-css-architecture`, `frontend-responsive`, `frontend-data-tables`, `frontend-form-patterns`, `frontend-feedback-system`, `frontend-file-upload`, `frontend-interaction-patterns`, `frontend-print-pdf` |
| `backend` | Server features: webhooks, Stripe, notifications, admin panels, settings, CMS, concurrency | `backend-webhook-handler`, `backend-stripe`, `backend-notifications`, `backend-admin-panel`, `backend-settings-admin`, `backend-content-management`, `backend-commerce-concurrency` |
| `ai` | Any Claude/LLM code: SDK wrapper, prompt library, RAG retrieval | `ai-sdk-wrapper`, `ai-prompt-library`, `ai-rag-retrieval` |
| `data` | Prisma schema, pgvector, embeddings, HNSW, query design, schema-design rigor, booking/availability | `data-prisma-pgvector`, `data-schema-design`, `data-booking-availability` |
| `infra` | Railway deploy, S3 uploads, background jobs, GitHub Actions CI | `infra-railway-deploy`, `infra-s3-uploads`, `infra-background-jobs`, `infra-github-ci` |
| `security` | Auth (NextAuth v5), security review, runtime hardening, demo credentials | `security-nextauth`, `security-review`, `security-hardening`, `security-demo-credentials` |
| `quality` | Pre-delivery review across dimensions + orchestration, production readiness, testing, E2E | `quality-final-review`, `quality-review-performance`, `quality-review-type-safety`, `quality-review-data-layer`, `quality-review-prompt-output`, `quality-production-readiness`, `quality-testing-validation`, `quality-playwright-e2e` |
| `client-lifecycle` | Client engagement bookends: onboarding/brand, transactional email, SEO, analytics, handoff | `client-onboarding`, `client-transactional-email`, `client-seo`, `client-analytics`, `client-handoff` |
| `domain-legal` | Brazilian legal RAG work (Piccino and future legal clients) | `legal-brief-composer`, `legal-pdf-classifier`, `legal-pt-prompting`, `legal-glossary` |
| `project-meta` | Repo lifecycle, docs, ADRs, onboarding, deployment plans | `meta-new-client-project`, `meta-document-project`, `meta-project-xray`, `meta-adr-authoring`, `meta-deployment-plan`, `meta-skill-sync` |

## Lifecycle decision tree — when to invoke what

### "I'm starting a new client project"

1. `project-meta` → `meta-new-client-project` — GitHub repo in the org, clone, scaffold docs, register
2. `client-lifecycle` → `client-onboarding` — site audit, brand extraction → PROJECT-BRIEF + BRAND-GUIDE
3. Scoping conversation — narrow SOW to MVP, agree on stack deltas
4. `stack` + `frontend` — Next.js 16 + TS skeleton, `frontend-css-architecture` + the right conventions child by project type
5. `data` → `data-schema-design` → `data-prisma-pgvector` — model rigor, schema, pgvector, HNSW
6. `security` → `security-nextauth` (+ `security-hardening` for runtime protections) — auth, `trustHost`, middleware
7. `ai` → `ai-sdk-wrapper` + `ai-prompt-library` — `src/lib/ai/` baseline
8. `infra` → `infra-s3-uploads` → `infra-railway-deploy` → `infra-github-ci`
9. `quality` → `quality-final-review` + `quality-production-readiness` before client delivery
10. `client-lifecycle` → `client-handoff` — manual + training; client keeps code and keys

### "I inherited / am extending an existing project"

1. Read the project's `README.md` and `CLAUDE.md`
2. `project-meta` → `meta-project-xray` to map pages, data flows, integrations
3. Match the change to a domain mother; go through `workflow` first if non-trivial

### "I'm doing pre-delivery QA"

1. `quality` → `quality-final-review` orchestrates the review-* children
2. Address `security-review`, `quality-review-*` findings before sign-off

## Persimmon defaults — one-screen summary

- **Stack**: Next.js 16 (App Router, RSC, Server Actions), TypeScript strict, Prisma + pgvector, Anthropic Claude SDK, NextAuth v5, Tailwind v4, Zod, Railway, GitHub Actions CI.
- **Server Components by default**; `"use client"` only for state/effects/browser APIs.
- **Any page reading DB or `auth()` at request time exports `const dynamic = "force-dynamic"`** (or the Railway build prerender crashes).
- **All Claude traffic through `src/lib/ai/claude.ts`**; all prompts in `src/lib/ai/prompts.ts`. Persist every AI output; never regenerate.
- **Zod at every trust boundary** (Server Actions, API routes, webhooks). `unknown` over `any`.
- **Uploads**: presigned URL → client PUTs directly to the bucket. Never proxy bytes through Next.
- **NextAuth v5 behind Railway**: `trustHost: true`; middleware reads `x-forwarded-host`.
- **Prompt caching** on stable system prompts that meet the per-model token minimum (Sonnet 4.6 = 2,048; Opus 4.6 / Haiku 4.5 = 4,096).
- **Secrets server-side only** — never `NEXT_PUBLIC_*`.

## Cross-cutting anti-patterns banned

- Importing `@anthropic-ai/sdk` outside `src/lib/ai/claude.ts`
- Inline prompt strings in business logic (use `ai-prompt-library`)
- Reading DB/`auth()` in a page without `force-dynamic`
- `any` without a justified `// eslint-disable` + reason
- Unvalidated boundary input (missing Zod)
- Proxying upload bytes through Next instead of presigned PUT
- Regenerating an AI output that already exists
- Secrets in `NEXT_PUBLIC_*` or client bundles
- Querying a filtered-subset HNSW index without the filter

## See also

- `USER-GUIDE.md` (repo root) — scenario-based usage with concrete commands
- `docs/decisions/` — ADRs documenting why the repo is structured this way
- `CLAUDE.md` — base stack conventions every client project inherits
