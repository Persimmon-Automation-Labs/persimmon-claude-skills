# Persimmon Automation Labs — Claude Code Skills

85 reusable Claude Code skills organized as **master → mothers → children** for predictable routing across every Persimmon client project. Includes a `workflow` mother that forces brainstorm-before-code discipline on non-trivial work, with a lean tiered requirements-traceability system on top. Targets the Persimmon standard stack.

| | |
|---|---|
| **Default stack** | Next.js 16, TypeScript strict, Prisma + pgvector, Anthropic Claude SDK, NextAuth v5, Tailwind v4, Railway |
| **Skills** | 85 (1 master + 12 mothers + 72 specialists) |
| **Repo** | [github.com/Persimmon-Automation-Labs/persimmon-claude-skills](https://github.com/Persimmon-Automation-Labs/persimmon-claude-skills) |
| **Guide** | [USER-GUIDE.md](USER-GUIDE.md) — scenario-based usage |
| **Clients** | Piccino Legal (live) |

## Quick start — wire into a project

Once per Persimmon project:

```bash
./scripts/install-in-project.sh /path/to/client-project --type internal-tool
# or --type marketing-site for public lead-gen sites
```

Registers this repo as a plugin marketplace and installs the `persimmon` plugin at project scope (valid `enabledPlugins` in `.claude/settings.json`, committed so every collaborator inherits it), writes `.claude/project-type`, installs a SessionStart hook that loads the routing/gate context, and appends a routing note to the project's `CLAUDE.md`. Idempotent. See [docs/decisions/0002](docs/decisions/0002-distribute-as-plugin-marketplace.md) for why this uses a plugin rather than a clone/`skillSources` model.

## How it's organized

Three levels:

1. **`persimmon` (master)** — invoked first on any Persimmon work; enforces the workflow gate, then routes to the right domain mother.
2. **12 domain mothers** — `workflow`, `stack`, `frontend`, `backend`, `ai`, `data`, `infra`, `security`, `quality`, `client-lifecycle`, `domain-legal`, `project-meta`.
3. **72 specialist children** — the implementation skills, prefixed by mother (`stack-*`, `frontend-*`, `backend-*`, `client-*`, …).

A typical session for non-trivial work: `persimmon` → `workflow` → `workflow-brainstorm` → `workflow-spec-review` → `workflow-flow-review` → (spec approved) → `workflow-plan` → domain mother → specialist. Trivial work (copy, one-line Tailwind, README edits, dependency bumps) bypasses the gate. `skip workflow:` overrides on legitimate fast-fix moments.

## Catalog

### Master
| Skill | Purpose |
|---|---|
| `persimmon` | Master router — invoke first; enforces the workflow gate; routes to the right domain mother |

### `workflow` mother (10 children)
Brainstorm-before-code discipline adapted from obra/superpowers for the TS/Prisma stack, plus a lean tiered requirements-traceability system. See [docs/decisions/0003](docs/decisions/0003-workflow-gate-typescript-stack.md) and [0005–0008](docs/decisions/).

| Skill | What it owns |
|---|---|
| `workflow` (mother) | Lifecycle routing (brainstorm → spec-review → flow-review → plan → execute → verify → debug → review → finish), tiered by project type |
| `workflow-brainstorm` | One-question dialogue → approved spec in `docs/specs/` with required `## Business meaning` + `## Skills applied` |
| `workflow-spec-review` | Adversarial red-team between brainstorm and plan — concurrency, money-state timing, unverifiable criteria, cutover/jurisdiction landmines; builds the RTM (Pass 1) |
| `workflow-flow-review` | Derives every (actor × goal) flow, scores coverage (RTM), walks the developer through each so they own the demo; logs gaps |
| `workflow-plan` | Implementation plan in `docs/plans/` — EARS criteria + Why-this-matters + `Implements:` (REQ + SCREEN) per task |
| `workflow-execute` | Task-by-task execution with `human-blocked` state for client-dependent work |
| `workflow-verify` | `tsc --noEmit` + `eslint` + `prisma validate` + tests + user-workflow checklist |
| `workflow-debug` | Systematic debugging across Next 16 / Prisma / Railway / NextAuth gotchas |
| `workflow-code-review` | Two-stage: spec compliance, then Persimmon conventions |
| `workflow-finish` | Pre-merge checklist + branch close-out |
| `workflow-traceability` | The provenance model: ID namespace, the spine, the tiering matrix (project-type × project-stage), docs/ homes, the `traceability-audit` |
| `workflow-feedback-loop` | Punch-list triage → design-question resolution → verified-on-staging close-out → serialized deploy gate |

### `stack` mother (4 children)
| Skill | What it owns |
|---|---|
| `stack` (mother) | App-code standards routing + one-screen defaults |
| `stack-server-actions` | Next 16 Server Actions — Zod boundary, revalidate, error shape, `force-dynamic` |
| `stack-typescript-strict` | Strict-mode patterns, `unknown` over `any`, explicit return types |
| `stack-zod-boundary` | Zod validation at every trust boundary |
| `stack-tailwind-tokens` | Tailwind v4 `@theme` CSS-first tokens |

### `frontend` mother (11 children)
Visual, UX, and structural conventions for any UI work — adapted from the Aslan frontend library to Next.js 16 + React + Tailwind v4.

| Skill | What it owns |
|---|---|
| `frontend` (mother) | UI routing + one-screen frontend defaults |
| `frontend-internal-tool-conventions` | Admin/CRM/ops UI — tabular figures, density, status badges, anti-AI-look |
| `frontend-public-site-conventions` | Marketing/lead-gen — font pairings, 60-30-10 color, editorial scale |
| `premium-web-method` | Diverge→select→converge pipeline to defeat typicality bias and produce genuinely original sites; includes ai-tell-lint gate |
| `public-website-creative-direction` | 8-question intake → ~5 distinct concept briefs → section hierarchy → signature element → translation table |
| `frontend-page-templates` | 8 canonical RSC + Server Action scaffolds; sticky action bar |
| `frontend-css-architecture` | `globals.css` + `@layer` order, `next/font`, dark mode |
| `frontend-responsive` | Sidebar vs top nav, hamburger, mobile-first, container queries |
| `frontend-data-tables` | Scroll wrapper, sticky last column, row-click → detail, pagination |
| `frontend-form-patterns` | Required marking, inline errors, error summary, live search, empty states |
| `frontend-feedback-system` | Toast + PRG flash + AlertDialog + Dialog + button loading (sonner + Radix) |
| `frontend-file-upload` | Drop-zone client UX on top of `infra-s3-uploads` |
| `frontend-interaction-patterns` | Button placement, modal vs page actions, section nav |
| `frontend-print-pdf` | `@media print` + `window.print()`; server-side PDF options |

### `backend` mother (8 children)
Server-side feature patterns over Server Actions / Route Handlers + Prisma.

| Skill | What it owns |
|---|---|
| `backend` (mother) | Backend feature routing + defaults |
| `backend-webhook-handler` | Raw-body signature verify, idempotency, retry semantics |
| `backend-stripe` | Order lifecycle, PaymentIntent, Elements, refunds, SAQ-A, go-live |
| `backend-notifications` | One `notify()` over Resend + Twilio, post-commit, A2P 10DLC trap |
| `backend-admin-panel` | NextAuth-guarded CRUD RSC pages, server-side pagination, recharts |
| `backend-settings-admin` | AES-256-GCM-encrypted settings table, env fallback, test-connection |
| `backend-content-management` | Typed content blocks, sanitize-on-write, media library, slug→301 |
| `backend-commerce-concurrency` | Atomic claims, `FOR UPDATE`, advisory locks, checkout holds |
| `backend-account-management` | Account/role lifecycle on NextAuth+Prisma: signup→pending→approval, invites, password reset, admin invariants |

### `ai` mother (3 children)
| Skill | What it owns |
|---|---|
| `ai` (mother) | Claude/LLM routing + AI defaults |
| `ai-sdk-wrapper` | `src/lib/ai/claude.ts` — retries, caching, model routing, token accounting |
| `ai-prompt-library` | `src/lib/ai/prompts.ts` — centralized prompt templates |
| `ai-rag-retrieval` | Chunking, embedding, hybrid search, reranking, citation grounding |

### `data` mother (4 children)
| Skill | What it owns |
|---|---|
| `data` (mother) | Data-layer routing + defaults |
| `data-prisma-pgvector` | Schema, pgvector, HNSW indexing, cosine-similarity queries |
| `data-schema-design` | Snapshot mutable values, lifecycle enums, join tables, FK/cardinality, review lenses |
| `data-booking-availability` | Reservation/slot schema, availability query, blackout/lead-time, waitlist, deposits |
| `data-db-cli` | Read-only-by-default `db` CLI (`npm run db`) + Postgres MCP setup, `--write`/`--prod` gates |

### `infra` mother (4 children)
| Skill | What it owns |
|---|---|
| `infra` (mother) | Hosting/deploy/upload/CI routing + defaults |
| `infra-railway-deploy` | Railway project, env vars, custom domain, port 8080, staged-config recovery |
| `infra-s3-uploads` | Presigned PUT, bucket CORS, multipart, content-type validation |
| `infra-background-jobs` | Idempotent resumable pipelines (pg-boss / Inngest / cron) |
| `infra-github-ci` | Minimal Next.js CI — lint, typecheck, `prisma validate`, build |

### `security` mother (4 children)
| Skill | What it owns |
|---|---|
| `security` (mother) | Auth + security-review routing |
| `security-nextauth` | NextAuth v5 + Prisma adapter, `trustHost`, middleware |
| `security-review` | Headers, auth, injection, secrets, CSP, dependency CVEs |
| `security-hardening` | Rate limiting, brute-force throttle, CSP nonces, SRI, session cookie hardening |
| `security-demo-credentials` | Standardized demo logins, env+hostname gate so demo can't reach prod |

### `quality` mother (8 children)
| Skill | What it owns |
|---|---|
| `quality` (mother) | Review/QA routing |
| `quality-final-review` | Orchestrates all review dimensions before client delivery |
| `quality-review-performance` | RSC boundaries, bundle size, query plans, Core Web Vitals |
| `quality-review-type-safety` | Strict-mode gaps, `any` leaks, unchecked casts, missing Zod |
| `quality-review-data-layer` | N+1, unbounded lists, missing indexes, transactions |
| `quality-review-prompt-output` | Prompt hygiene, output validation, citation grounding, evals |
| `quality-production-readiness` | Broad pre-launch/go-live checklist across Railway/Next/Prisma/Stripe |
| `quality-testing-validation` | Manual/functional QA by project type, Stripe test cards, link/a11y checks |
| `quality-playwright-e2e` | Automated E2E via Playwright against preview/deployed sites |

### `client-lifecycle` mother (5 children)
Bookends of a client engagement — intake/branding at the start, delivery instrumentation and handoff at the end.

| Skill | What it owns |
|---|---|
| `client-lifecycle` (mother) | Client-engagement routing + defaults |
| `client-onboarding` | Playwright site audit, brand extraction → PROJECT-BRIEF + BRAND-GUIDE |
| `client-transactional-email` | Resend/SendGrid wrapper, templates, SPF/DKIM/DMARC, retries |
| `client-seo` | Next 16 Metadata API, JSON-LD, sitemap, robots, OG, llms.txt |
| `client-analytics` | GA4/GTM, Meta Pixel, consent gating, conversion events |
| `client-handoff` | Admin manual, walkthrough, training; client owns repo + keys |
| `client-public-site-build` | End-to-end public website build on Next.js 16 — ingest, creative direction, Server Components, Railway deploy |

### `domain-legal` mother (4 children)
| Skill | What it owns |
|---|---|
| `domain-legal` (mother) | Brazilian-legal RAG routing |
| `legal-brief-composer` | RAG-grounded brief generation — cites-only, no hallucinations |
| `legal-pdf-classifier` | Per-page PDF classification (petição, sentença, intimação) |
| `legal-pt-prompting` | Portuguese legal prompt craft |
| `legal-glossary` | Brazilian legal terminology reference |

### `project-meta` mother (7 children)
| Skill | What it owns |
|---|---|
| `project-meta` (mother) | Repo lifecycle + docs routing |
| `meta-new-client-project` | GitHub repo in org, clone, scaffold docs, register |
| `meta-lifecycle-stage` | Reads `.claude/project-stage`; graduated commit/push/branch/deploy rigor (prototype→maintenance) |
| `meta-document-project` | Lean doc audit/scaffold/update |
| `meta-project-xray` | Guided walk-through of pages, data flows, integrations |
| `meta-adr-authoring` | MADR-lite ADRs for non-obvious choices (the per-project ADR home in the traceability model) |
| `meta-deployment-plan` | Client-facing deployment/go-live document |
| `meta-skill-sync` | Install/verify the Persimmon plugin in a project |

## Tech stack

All skills target the Persimmon standard stack (see [CLAUDE.md](CLAUDE.md)): Next.js 16 (App Router, RSC, Server Actions), TypeScript strict, PostgreSQL + pgvector, Prisma, S3-compatible storage, Anthropic Claude SDK, NextAuth v5, Tailwind v4, Zod, Railway, GitHub Actions CI.

## Documentation

| Doc | Purpose |
|---|---|
| [README.md](README.md) | This file — catalog and routing overview |
| [USER-GUIDE.md](USER-GUIDE.md) | Scenario-based usage (new project, feature build, QA, recovery) |
| [CLAUDE.md](CLAUDE.md) | Stack conventions + skill-authoring rules for this repo |
| [docs/decisions/](docs/decisions/) | 8 ADRs documenting the structural choices (0005–0008 dogfood the traceability system) |
| [skills.json](skills.json) | Machine-readable catalog — regenerate via `./scripts/build-registry.sh > skills.json` |
| [scripts/ai-tell-lint.mjs](scripts/ai-tell-lint.mjs) | Deterministic linter for visual AI-slop tells (purple/indigo utilities = ERROR; Inter/rounded-2xl/pure white = WARN) |

## Contributing

New skills must:
1. Have a kebab-case folder name matching the `name:` frontmatter, prefixed by the owning mother.
2. Include `SKILL.md` with YAML frontmatter (`name`, `description`) — third-person description with trigger keywords.
3. Be self-contained — no cross-skill imports. Shared content goes in `templates/` or a skill's own `references/`.
4. Be **< 500 lines**. If longer, move detail into a one-level-deep `references/` subdir.
5. Be registered: add a row to the owning mother's routing table + README catalog, then regenerate `skills.json`.

See [docs/decisions/0004](docs/decisions/0004-skill-naming-and-size-conventions.md) for naming/size conventions and the **Skill Authoring** section of [CLAUDE.md](CLAUDE.md).
