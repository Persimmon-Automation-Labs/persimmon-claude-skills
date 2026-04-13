---
name: document-project
description: Audit, scaffold, or update project documentation for any Persimmon client project. Use when setting up docs for a new project, auditing existing docs, updating CLAUDE.md after architecture changes, or adding ADRs. Enforces Persimmon lean documentation conventions — CLAUDE.md + README.md + scope-of-work + ADRs, no more. Triggers — "audit docs", "update README", "update CLAUDE.md", "scaffold docs", "add ADR".
---

# Document Project — Persimmon Lean Documentation

## Overview

Every Persimmon Automation Labs client project gets exactly these docs — no more, no less:

| Document | Purpose | Audience |
|---|---|---|
| `CLAUDE.md` | Dev context: architecture, constraints, stack, conventions | Claude Code / devs |
| `README.md` | Human onboarding: status, team, setup, doc links | Anyone cloning the repo |
| `docs/reference/scope-of-work.md` | Business: deliverables, timeline, contact, financials | Client sponsor / Renato |
| `docs/decisions/` | ADRs (MADR-lite) for non-obvious architecture choices | Future maintainers |
| `docs/reference/` | Client-provided materials (specs, PDFs, samples) | Team |
| `notes/` | Meeting notes, requirements conversations | Team |
| `.github/workflows/ci.yml` | Lint, typecheck, prisma validate, build | CI |

### Hard Rules

1. **README ≤ 80 lines.** If it's longer, content belongs in CLAUDE.md or an ADR.
2. **CLAUDE.md ≤ 250 lines.** If longer, extract reference material to `docs/reference/`.
3. **ADRs ≤ 40 lines each.** Decision + context + consequences — nothing else.
4. **Financials live ONLY in `docs/reference/scope-of-work.md`.** Never in README or CLAUDE.md.
5. **Client contact info lives ONLY in README and SOW.** Never in CLAUDE.md — that's for dev context.
6. **No empty placeholder files.** Either write content or don't create the file.
7. **Don't document what linters enforce** (formatting, naming). Document intent and tradeoffs.
8. **No duplication.** CLAUDE.md owns architecture; README links to it.

---

## Modes

### Mode 1: AUDIT (default when no argument, or argument is a path)

Read all existing docs in parallel, then score and present a plan. Do not modify files in AUDIT mode without asking.

```
AUDIT — {project name} ({stack summary})
============================================

CLAUDE.md:                   [EXISTS/MISSING] — {assessment}
README.md:                   [EXISTS/MISSING] — {assessment, line count}
docs/reference/scope-of-work.md:  [EXISTS/MISSING]
docs/decisions/:             [N ADRs / MISSING]
docs/reference/:             [N files / MISSING]
notes/:                      [N files / MISSING]
.github/workflows/ci.yml:    [EXISTS/MISSING]

ISSUES:
- {list what's missing, stale, or violates rules}

PLAN:
- {numbered list of what to create/update}
```

Assessments to call out:
- README over 80 lines → flag
- CLAUDE.md over 250 lines → flag
- Payment terms in README → flag, move to SOW
- Client email in CLAUDE.md → flag, move to README
- Empty `docs/decisions/` → fine for new projects, flag if project has been running > 2 weeks
- No CI workflow → flag for any project past scaffolding

### Mode 2: SCAFFOLD (new project, no docs)

Called by `new-client-project`. Creates the full doc skeleton from templates below.

**Required inputs** (ask if missing):
- Client name, domain, project summary (1-3 sentences)
- Client contact (name, title, email — phone optional)
- Deliverables (bullet list from SOW)
- Stack deltas (if any — default is Persimmon standard)
- Timeline (from SOW)

Create directory structure:
```bash
mkdir -p docs/{decisions,reference} notes src .github/workflows
```

Then generate all files from templates below.

### Mode 3: UPDATE (specific doc update)

Parse the argument:

| Argument | Action |
|---|---|
| `update claude`, `update CLAUDE.md` | Re-read project state, regenerate CLAUDE.md |
| `update readme` | Re-read project state, regenerate README.md |
| `add adr {topic}` | Delegate to `adr-authoring` skill |
| `add note {topic}` | Create dated note in `notes/YYYY-MM-DD-{topic}.md` |
| anything else | Best judgment — likely a CLAUDE.md section update |

Before regenerating CLAUDE.md or README: read `package.json`, `prisma/schema.prisma`, `.env.example`, `src/app/` tree, and any existing `CLAUDE.md` to anchor accuracy. Do not invent details.

---

## Templates

### CLAUDE.md (≤ 250 lines)

```markdown
# {Client Name} — Claude Code Context

## What This File Is

AI assistant context for this project. For project overview and team info, see [README.md](README.md). For contract and financial details, see [docs/reference/scope-of-work.md](docs/reference/scope-of-work.md).

## Project Summary

{1-3 sentences: what this does, who it's for, current phase}

## Architecture

{System boundaries — our scope vs. not-our-scope}
{Data flow: ingestion → processing → retrieval → UI}
{Key integrations: Claude API, Tigris/S3, external APIs}

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components, Server Actions)
- **Language**: TypeScript (strict)
- **DB**: PostgreSQL + pgvector (Prisma)
- **AI**: Anthropic Claude SDK — Sonnet for volume, Opus for complex reasoning
- **Auth**: NextAuth v5 (credentials, Prisma adapter, JWT sessions)
- **Storage**: {Railway Tigris / R2 / S3}
- **Styling**: Tailwind CSS v4
- **Hosting**: Railway (app + DB + bucket)
- **CI**: GitHub Actions

{Document stack deltas if any — e.g., "uses Clerk instead of NextAuth because client already has Clerk org"}

## Key Files

| Path | Purpose |
|---|---|
| `src/lib/db.ts` | Shared Prisma client (never instantiate elsewhere) |
| `src/lib/ai/claude.ts` | Anthropic SDK wrapper — retries, caching, model routing |
| `src/lib/ai/prompts.ts` | All prompt templates (no inline prompts in business logic) |
| `src/lib/*-actions.ts` | Server Actions per domain |
| `prisma/schema.prisma` | DB schema |
| `next.config.ts` | Security headers, image domains |

## Constraints

- All pages that read DB or `auth()` must `export const dynamic = "force-dynamic"`. Build fails otherwise.
- NextAuth behind Railway edge needs `trustHost: true` and `x-forwarded-host` handling in middleware.
- Tigris/S3 bucket CORS must include every upload origin (localhost, preview URLs, prod).
- Persist every AI output. Never regenerate on page load — expensive and non-deterministic.
- Validate every boundary input with Zod (Server Actions, API routes, webhooks).
- Never log secrets, PII, or document contents.

## Conventions

- Components: `PascalCase.tsx`
- Routes: `kebab-case/page.tsx`
- Utilities: `kebab-case.ts`
- Prisma models: `PascalCase` singular
- Timestamps: `createdAt`/`updatedAt` on every model
- Enums in Postgres, not string constants

## Key Behaviors

{Business rules the system must enforce correctly — domain-specific invariants}

## Known Gotchas

{Project-specific — e.g., "CNPJ validation is lenient on input but strict on storage"}
```

### README.md (≤ 80 lines)

```markdown
# {Client Name} — {One-line description}

{1-2 sentence description of what this product does and for whom.}

## Status

| | |
|---|---|
| **Phase** | {Pre-development / Development / Staging / Production} |
| **Stack** | Next.js 16, TypeScript, Prisma + pgvector, Claude SDK, Railway |
| **Timeline** | {from SOW} |
| **Live URL** | {prod URL or TBD} |

## Team

| Name | Role | Contact |
|---|---|---|
| {Client contact} | Client sponsor | {email} |
| Renato Prado | Lead (Persimmon Automation Labs) | renato@persimmonlabs.com |

## Architecture

See [CLAUDE.md](CLAUDE.md) for full architecture, stack, and conventions.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in secrets
pnpm prisma migrate dev
pnpm dev
```

## Documentation

| Doc | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Architecture, constraints, dev conventions |
| [docs/reference/scope-of-work.md](docs/reference/scope-of-work.md) | Deliverables, timeline, contract |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records |
| [docs/reference/](docs/reference/) | Client-provided materials |
```

### docs/reference/scope-of-work.md

```markdown
# Scope of Work — {Client Name}

**Proposal**: {number or N/A}
**Signed**: {YYYY-MM-DD or "pending"}
**Timeline**: {from SOW}
**Client Contact**: {Name, Title — email, phone}

## Deliverables

| Item | Description | Acceptance |
|---|---|---|
| {feature} | {what it does} | {how we verify} |

## Financials

{Fee, payment schedule, invoicing cadence — this is the ONLY place these appear}

## Out of Scope

{What we explicitly agreed not to build}

## Key Considerations

{Open questions, risks, dependencies — keep updated as they resolve}
```

### .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm prisma validate
      - run: pnpm build
        env:
          DATABASE_URL: postgres://user:pass@localhost:5432/build
          SKIP_ENV_VALIDATION: "1"
```

### ADR — see `adr-authoring` skill

Delegate ADR creation to the `adr-authoring` skill. Do not inline ADR templates here.

---

## After Making Changes

Show summary:

```
DONE — {project name}
============================================
[CREATED/UPDATED] CLAUDE.md     — {brief}
[CREATED/UPDATED] README.md     — {brief}
[CREATED] docs/reference/scope-of-work.md
[CREATED] docs/decisions/{NNN-name}.md
[CREATED] .github/workflows/ci.yml
============================================
```

Do NOT auto-commit. Let the user review, then they commit.

---

## Anti-Patterns

- Do not put payment terms or invoice numbers in README or CLAUDE.md.
- Do not duplicate architecture sections between CLAUDE.md and README.
- Do not create empty scaffolded files ("TBD", "Coming soon", "See below"). Write content or skip the file.
- Do not add shields.io badges to private repos.
- Do not document what ESLint/Prettier/TypeScript already enforce.
- Do not paste the full SOW PDF into `scope-of-work.md` — extract the signed terms, link the PDF in `docs/reference/`.
- Do not put client team Slack handles in CLAUDE.md — they go in README "Team" table.
