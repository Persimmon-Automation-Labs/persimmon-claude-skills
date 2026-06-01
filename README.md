# Persimmon Automation Labs — Claude Code Skills

46 reusable Claude Code skills organized as **master → mothers → children** for predictable routing across every Persimmon client project. Includes a `workflow` mother that forces brainstorm-before-code discipline on non-trivial work. Targets the Persimmon standard stack.

| | |
|---|---|
| **Default stack** | Next.js 16, TypeScript strict, Prisma + pgvector, Anthropic Claude SDK, NextAuth v5, Tailwind v4, Railway |
| **Skills** | 46 (1 master + 9 mothers + 36 specialists) |
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
2. **9 domain mothers** — `workflow`, `stack`, `ai`, `data`, `infra`, `security`, `quality`, `domain-legal`, `project-meta`.
3. **36 specialist children** — the implementation skills, prefixed by mother (`stack-*`, `ai-*`, …).

A typical session for non-trivial work: `persimmon` → `workflow` → `workflow-brainstorm` → (spec approved) → `workflow-plan` → domain mother → specialist. Trivial work (copy, one-line Tailwind, README edits, dependency bumps) bypasses the gate. `skip workflow:` overrides on legitimate fast-fix moments.

## Catalog

### Master
| Skill | Purpose |
|---|---|
| `persimmon` | Master router — invoke first; enforces the workflow gate; routes to the right domain mother |

### `workflow` mother (7 children)
Brainstorm-before-code discipline adapted from obra/superpowers for the TS/Prisma stack. See [docs/decisions/0003](docs/decisions/0003-workflow-gate-typescript-stack.md).

| Skill | What it owns |
|---|---|
| `workflow` (mother) | Lifecycle routing (brainstorm → plan → execute → verify → debug → review → finish), tiered by project type |
| `workflow-brainstorm` | One-question dialogue → approved spec in `docs/specs/` with required `## Business meaning` |
| `workflow-plan` | Implementation plan in `docs/plans/` — EARS criteria + Why-this-matters per task |
| `workflow-execute` | Task-by-task execution with `human-blocked` state for client-dependent work |
| `workflow-verify` | `tsc --noEmit` + `eslint` + `prisma validate` + tests + user-workflow checklist |
| `workflow-debug` | Systematic debugging across Next 16 / Prisma / Railway / NextAuth gotchas |
| `workflow-code-review` | Two-stage: spec compliance, then Persimmon conventions |
| `workflow-finish` | Pre-merge checklist + branch close-out |

### `stack` mother (4 children)
| Skill | What it owns |
|---|---|
| `stack` (mother) | App-code standards routing + one-screen defaults |
| `stack-server-actions` | Next 16 Server Actions — Zod boundary, revalidate, error shape, `force-dynamic` |
| `stack-typescript-strict` | Strict-mode patterns, `unknown` over `any`, explicit return types |
| `stack-zod-boundary` | Zod validation at every trust boundary |
| `stack-tailwind-tokens` | Tailwind v4 `@theme` CSS-first tokens |

### `ai` mother (3 children)
| Skill | What it owns |
|---|---|
| `ai` (mother) | Claude/LLM routing + AI defaults |
| `ai-sdk-wrapper` | `src/lib/ai/claude.ts` — retries, caching, model routing, token accounting |
| `ai-prompt-library` | `src/lib/ai/prompts.ts` — centralized prompt templates |
| `ai-rag-retrieval` | Chunking, embedding, hybrid search, reranking, citation grounding |

### `data` mother (1 child)
| Skill | What it owns |
|---|---|
| `data` (mother) | Data-layer routing + defaults |
| `data-prisma-pgvector` | Schema, pgvector, HNSW indexing, cosine-similarity queries |

### `infra` mother (4 children)
| Skill | What it owns |
|---|---|
| `infra` (mother) | Hosting/deploy/upload/CI routing + defaults |
| `infra-railway-deploy` | Railway project, env vars, custom domain, port 8080, staged-config recovery |
| `infra-s3-uploads` | Presigned PUT, bucket CORS, multipart, content-type validation |
| `infra-background-jobs` | Idempotent resumable pipelines (pg-boss / Inngest / cron) |
| `infra-github-ci` | Minimal Next.js CI — lint, typecheck, `prisma validate`, build |

### `security` mother (2 children)
| Skill | What it owns |
|---|---|
| `security` (mother) | Auth + security-review routing |
| `security-nextauth` | NextAuth v5 + Prisma adapter, `trustHost`, middleware |
| `security-review` | Headers, auth, injection, secrets, CSP, dependency CVEs |

### `quality` mother (5 children)
| Skill | What it owns |
|---|---|
| `quality` (mother) | Review/QA routing |
| `quality-final-review` | Orchestrates all review dimensions before client delivery |
| `quality-review-performance` | RSC boundaries, bundle size, query plans, Core Web Vitals |
| `quality-review-type-safety` | Strict-mode gaps, `any` leaks, unchecked casts, missing Zod |
| `quality-review-data-layer` | N+1, unbounded lists, missing indexes, transactions |
| `quality-review-prompt-output` | Prompt hygiene, output validation, citation grounding, evals |

### `domain-legal` mother (4 children)
| Skill | What it owns |
|---|---|
| `domain-legal` (mother) | Brazilian-legal RAG routing |
| `legal-brief-composer` | RAG-grounded brief generation — cites-only, no hallucinations |
| `legal-pdf-classifier` | Per-page PDF classification (petição, sentença, intimação) |
| `legal-pt-prompting` | Portuguese legal prompt craft |
| `legal-glossary` | Brazilian legal terminology reference |

### `project-meta` mother (6 children)
| Skill | What it owns |
|---|---|
| `project-meta` (mother) | Repo lifecycle + docs routing |
| `meta-new-client-project` | GitHub repo in org, clone, scaffold docs, register |
| `meta-document-project` | Lean doc audit/scaffold/update |
| `meta-project-xray` | Guided walk-through of pages, data flows, integrations |
| `meta-adr-authoring` | MADR-lite ADRs for non-obvious choices |
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
| [docs/decisions/](docs/decisions/) | 4 ADRs documenting the structural choices |
| [skills.json](skills.json) | Machine-readable catalog — regenerate via `./scripts/build-registry.sh > skills.json` |

## Contributing

New skills must:
1. Have a kebab-case folder name matching the `name:` frontmatter, prefixed by the owning mother.
2. Include `SKILL.md` with YAML frontmatter (`name`, `description`) — third-person description with trigger keywords.
3. Be self-contained — no cross-skill imports. Shared content goes in `templates/` or a skill's own `references/`.
4. Be **< 500 lines**. If longer, move detail into a one-level-deep `references/` subdir.
5. Be registered: add a row to the owning mother's routing table + README catalog, then regenerate `skills.json`.

See [docs/decisions/0004](docs/decisions/0004-skill-naming-and-size-conventions.md) for naming/size conventions and the **Skill Authoring** section of [CLAUDE.md](CLAUDE.md).
