# Persimmon Skills — Claude Code Context

## What This File Is

AI assistant context for the Persimmon Automation Labs skills library. Contains stack conventions, client context, and the rules that every skill in this repo assumes. For the skill catalog and setup, see [README.md](README.md).

## Company Context

**Company**: Persimmon Automation Labs
**GitHub Org**: [Persimmon-Automation-Labs](https://github.com/Persimmon-Automation-Labs)
**Business**: Custom AI-powered operational tooling for small-to-mid firms (legal, professional services, creative shops).
**Model**: Scoped engagements — client keeps the code and the keys. No subscription lock-in.

## Default Stack

Skills in this repo assume a Persimmon "standard stack" unless the skill itself says otherwise. This is what we build on by default:

- **Framework**: Next.js 16 (App Router, Server Components, Server Actions)
- **Language**: TypeScript (strict)
- **Database**: PostgreSQL + `pgvector` (for RAG)
- **ORM**: Prisma
- **Storage**: S3-compatible object storage (Railway Tigris, Cloudflare R2, or AWS S3)
- **AI**: Anthropic Claude SDK — Sonnet for volume, Opus for complex reasoning
- **Auth**: NextAuth.js v5 (credentials or OAuth) with Prisma adapter, JWT sessions
- **Styling**: Tailwind CSS v4
- **Validation**: Zod at every trust boundary
- **Hosting**: Railway (app + DB + bucket in one project)
- **CI**: GitHub Actions (lint, typecheck, prisma validate, build)
- **CD**: Railway auto-deploy on push to `main`

## Client Projects (Current)

| Client | Domain | Repo | Live URL |
|---|---|---|---|
| Almeida Prado e Piccino Advogados | Legal process analysis (Brazilian law) | `piccino-legal` (private) | https://sistema.piccino.com.br |

When adding a new client, document them here and in the project index.

## Coding Standards

### TypeScript
- `strict: true` in `tsconfig.json`. No `any` unless justified with a `// eslint-disable` and a reason.
- All exported functions have explicit return types.
- `unknown` over `any` for untrusted input; narrow with Zod before use.

### Next.js 16
- Server Components by default. Add `"use client"` only when you need client state, effects, or browser APIs.
- **Any page that reads the DB or `auth()` at request time must export `const dynamic = "force-dynamic"`** — otherwise the build prerenders it, the build container can't reach the DB, and the build fails on Railway.
- Server Actions for mutations. API routes only for background job triggers, webhooks, SSE/streaming.
- File uploads: server issues a presigned URL → client PUTs directly to the bucket. Never proxy upload bytes through Next.

### Prisma
- One shared client in `src/lib/db.ts`. Never instantiate `PrismaClient` anywhere else.
- Migrations via `prisma migrate dev` locally. On Railway, schema applies via `prisma db push` in the build step or a migration deploy job. Pick one per project and stick with it.
- After `db push` with enum/model changes: restart the dev server; the running Prisma client is stale.

### Claude SDK
- All Claude calls go through `src/lib/ai/claude.ts`. Never import `@anthropic-ai/sdk` elsewhere.
- All prompts live in `src/lib/ai/prompts.ts`. No inline prompt strings in business logic.
- Route by model: Sonnet for classification / per-item / volume tasks; Opus only when a task genuinely needs deeper reasoning (composition, multi-doc synthesis).
- Use prompt caching (`cache_control: { type: "ephemeral" }`) on any stable system prompt or doctrine block > 1024 tokens.
- Persist every AI output. Never regenerate if a result already exists — expensive and non-deterministic.

### Security
- Validate every boundary input with Zod (Server Actions, API routes, webhook payloads).
- Never log secrets, PII, or document contents. Redact in error reports.
- HSTS + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: strict-origin-when-cross-origin` in `next.config.ts`.
- Anthropic / OpenAI / S3 keys are server-side only. Never expose to client bundles — keep them out of `NEXT_PUBLIC_*`.
- NextAuth v5 behind a proxy: `trustHost: true` is mandatory. Middleware redirects must use `x-forwarded-host` (Railway's edge host differs from the internal hostname).

### File Organization
- Components: `PascalCase.tsx`
- Routes: `kebab-case/page.tsx`
- Utilities: `kebab-case.ts`
- Prisma models: `PascalCase` (singular)
- DB tables: Prisma default (`snake_case` via `@@map` only when integrating with non-Prisma readers)

## Database Naming

- Database: `{project}_prod` / `{project}_dev`
- Prisma models: `PascalCase`, singular (`Process`, not `Processes`)
- Fields: `camelCase` in Prisma, mapped to `snake_case` in Postgres via `@map` only if external tools need it
- Timestamps: `createdAt` / `updatedAt` on every model
- Enums in Postgres, not string constants

## Common Gotchas

### Next 16 + Prisma + Railway builds fail
Pages that hit the DB or `auth()` must `export const dynamic = "force-dynamic"`. Next 16 prerenders by default; the build container has no DB network path, so prerender crashes.

### NextAuth v5 `UntrustedHost`
Behind Railway's edge: set `trustHost: true` in `auth.ts`. Also read `x-forwarded-host` in middleware when constructing redirect URLs, or the user gets bounced to `*.up.railway.app` instead of the custom domain.

### Tigris / S3 browser uploads silently fail
Bucket CORS must include every origin that uploads — `http://localhost:3000`, preview URLs, production domains. Apply via `PutBucketCorsCommand`. Symptom: `net::ERR_FAILED` with no server log.

### Railway managed bucket not provisioned
Buckets created via the Railway API stay staged until the dashboard "Deploy" is committed once. After the first manual deploy, automation works.

### Railway staged-config drift
`serviceConnect` / `deploymentTriggerUpdate` mutations go into a per-environment draft. Committing an older draft reverts your live mutations. If automation stops working, Settings → Source → Disconnect → Reconnect drains the draft.

### Railway container port
Default is `8080` (from `PORT` env). Public domain `targetPort` must match — not 3000.

### Prisma client cache after `db push`
The running dev server keeps the old generated client. Restart `npm run dev` after enum or model changes.

### Claude API retries
Network / 529 overloaded errors are common. Wrap every call in exponential backoff (3 retries, 1s → 4s → 16s). The SDK's default retry count is 2 — usually not enough under load.

### pgvector index choice
HNSW beats IVFFlat for recall + latency on most workloads < 10M rows. Build with `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` and never query without a filter if the index is on a filtered subset.

## Per-Project Pipeline

For a new client, skills chain in this order:

1. **`new-client-project`** — GitHub repo in `Persimmon-Automation-Labs`, clone, scaffold docs, register.
2. **Scoping conversation** — narrow SOW to MVP, agree on stack deltas (if any).
3. **`nextjs-project-scaffolding`** — Next.js 16 + TS + Prisma + Tailwind skeleton, env template.
4. **`prisma-pgvector`** — schema, migrations, pgvector extension, HNSW index.
5. **`nextauth-credentials`** — auth, `trustHost`, middleware.
6. **`claude-sdk-wrapper`** + **`prompt-library`** — `src/lib/ai/` baseline.
7. **`tigris-s3-uploads`** — bucket + CORS + presigned-URL flow.
8. **`railway-deploy`** — project creation, env vars, custom domain.
9. **`github-actions-ci`** — lint/typecheck/build pipeline.
10. **`final-review`** — pre-delivery QA across all review dimensions.

### Client Project Doc Conventions

Every client folder gets exactly:
- `CLAUDE.md` — dev context (starts with "What This File Is" preamble)
- `README.md` — human onboarding (status table, team, docs table)
- `docs/reference/scope-of-work.md` — signed SOW (ONLY place for financials)
- `docs/reference/design-system.md` — tokens + anti-patterns (if custom design)
- `docs/decisions/` — ADRs (MADR-lite) for architecture choices
- `docs/reference/` — client-provided materials
- `notes/` — meeting notes, requirements
- `.github/workflows/ci.yml` — lint, typecheck, build

**Never put** payment terms in README, architecture in README (link to CLAUDE.md), or client contact info in CLAUDE.md.

## When In Doubt

1. **Ask** rather than assume (use `AskUserQuestion`).
2. **Persist** AI outputs — never regenerate on page load.
3. **Redact** PII before logging.
4. **Document** non-obvious decisions in `docs/decisions/`.

## Links

- Org: https://github.com/Persimmon-Automation-Labs
- Anthropic docs: https://docs.anthropic.com
- Next.js 16 docs: https://nextjs.org/docs
- Prisma + pgvector: https://www.prisma.io/docs/orm/prisma-client/queries/full-text-search
- Railway docs: https://docs.railway.app
