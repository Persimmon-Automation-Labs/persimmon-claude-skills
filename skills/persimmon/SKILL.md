---
name: persimmon
description: Master router for all Persimmon Automation Labs work. Invoke first on any task in a Persimmon client project — enforces the workflow gate on non-trivial work, then routes to the right domain mother (workflow, stack, ai, data, infra, security, quality, domain-legal, project-meta). The single entry point for new Claude sessions in a Persimmon repo. Trigger keywords: persimmon, where do I start, which skill, orient me, Persimmon defaults, new session in this repo.
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

## The domain mothers

| Mother | When to invoke | Owns |
|---|---|---|
| `workflow` | **FIRST** on any non-trivial task — brainstorm → plan → execute → verify → debug → review → finish | 7 children: workflow-brainstorm, -plan, -execute, -verify, -debug, -code-review, -finish |
| `stack` | App-code standards: Server Actions, strict TypeScript, Zod boundaries, Tailwind v4 tokens | `stack-server-actions`, `stack-typescript-strict`, `stack-zod-boundary`, `stack-tailwind-tokens` |
| `ai` | Any Claude/LLM code: SDK wrapper, prompt library, RAG retrieval | `ai-sdk-wrapper`, `ai-prompt-library`, `ai-rag-retrieval` |
| `data` | Prisma schema, pgvector, embeddings, HNSW, query design | `data-prisma-pgvector` |
| `infra` | Railway deploy, S3 uploads, background jobs, GitHub Actions CI | `infra-railway-deploy`, `infra-s3-uploads`, `infra-background-jobs`, `infra-github-ci` |
| `security` | Auth (NextAuth v5) and security review | `security-nextauth`, `security-review` |
| `quality` | Pre-delivery review across dimensions + orchestration | `quality-review-performance`, `quality-review-type-safety`, `quality-review-data-layer`, `quality-review-prompt-output`, `quality-final-review` |
| `domain-legal` | Brazilian legal RAG work (Piccino and future legal clients) | `legal-brief-composer`, `legal-pdf-classifier`, `legal-pt-prompting`, `legal-glossary` |
| `project-meta` | Repo lifecycle, docs, ADRs, onboarding, deployment plans | `meta-new-client-project`, `meta-document-project`, `meta-project-xray`, `meta-adr-authoring`, `meta-deployment-plan`, `meta-skill-sync` |

## Lifecycle decision tree — when to invoke what

### "I'm starting a new client project"

1. `project-meta` → `meta-new-client-project` — GitHub repo in the org, clone, scaffold docs, register
2. Scoping conversation — narrow SOW to MVP, agree on stack deltas
3. `stack` — Next.js 16 + TS skeleton conventions
4. `data` → `data-prisma-pgvector` — schema, pgvector extension, HNSW index
5. `security` → `security-nextauth` — auth, `trustHost`, middleware
6. `ai` → `ai-sdk-wrapper` + `ai-prompt-library` — `src/lib/ai/` baseline
7. `infra` → `infra-s3-uploads` → `infra-railway-deploy` → `infra-github-ci`
8. `quality` → `quality-final-review` before client delivery

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
