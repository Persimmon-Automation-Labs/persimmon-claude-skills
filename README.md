# Persimmon Automation Labs — Claude Code Skills

Standardized Claude Code skills for Persimmon client projects. Clone into any project's `.claude/` directory to inherit the house stack, conventions, deployment workflow, and QA checklist.

## Status

| | |
|---|---|
| **Default stack** | Next.js 16, TypeScript strict, Prisma + pgvector, Anthropic Claude SDK, NextAuth v5, Tailwind v4, Railway |
| **Skills** | Full project lifecycle — scaffolding, standards, AI patterns, infra, QA/review, domain helpers |
| **Clients** | Piccino Legal (live) |

## Quick Start

```bash
# Clone the skills into your project's .claude directory
git clone https://github.com/Persimmon-Automation-Labs/persimmon-claude-skills.git .claude

# Or sync just the skills folder into an existing .claude/
cp -r persimmon-claude-skills/skills /your/project/.claude/skills
```

See [CLAUDE.md](CLAUDE.md) for stack conventions and gotchas that every skill here assumes.

## Skills

### Meta / Process
| Skill | Triggers | What it does |
|---|---|---|
| `skill-sync` | setup skills, sync, onboard | Sync skills to a project's `.claude/`, teach usage |
| `new-client-project` | new client, onboard, SOW | Create GitHub repo in org, clone, scaffold docs, register |
| `document-project` | audit docs, update README, add ADR | Lean doc audit/scaffold/update — enforces Persimmon conventions |
| `project-xray` | walk me through, where does X come from | Interactive guided walk-through of pages, data flows, integrations |
| `adr-authoring` | ADR, decision record, architecture decision | MADR-lite ADRs for non-obvious architecture choices |

### Stack Standards
| Skill | Triggers | What it does |
|---|---|---|
| `nextjs-server-actions` | server action, form submit, mutation | Next 16 Server Actions patterns — Zod boundary, revalidate, error shape |
| `prisma-pgvector` | Prisma schema, pgvector, embeddings, HNSW | Schema design, vector columns, HNSW indexing, cosine similarity queries |
| `nextauth-credentials` | auth, login, NextAuth, session | NextAuth v5 credentials + Prisma adapter + `trustHost` + middleware |
| `zod-boundary-validation` | Zod, validate input, schema | Validation at every trust boundary (Server Actions, API, webhooks) |
| `tailwind-v4-tokens` | Tailwind, design tokens, theme | Tailwind v4 `@theme` CSS-first config, utility patterns |
| `typescript-strict-patterns` | TypeScript, strict, types | Strict-mode patterns, `unknown` over `any`, return-type discipline |

### AI / Claude
| Skill | Triggers | What it does |
|---|---|---|
| `anthropic-sdk-wrapper` | Anthropic SDK, Claude call, retry | `src/lib/ai/claude.ts` wrapper — retries, caching, model routing |
| `prompt-library` | prompt, prompt template, ai/prompts.ts | Centralized prompt templates — no inline prompts elsewhere |
| `rag-retrieval` | RAG, embeddings, retrieval, chunk | Chunking, embedding, pgvector retrieval, reranking, citation grounding |
| `legal-brief-composer` | brief generation, peça, citation | RAG-grounded brief generation — cites-only discipline, no hallucinations |
| `pdf-page-classifier` | PDF classify, page type, indexer | Per-page PDF classification pipeline (petição, sentença, intimação) |
| `portuguese-legal-prompting` | Portuguese prompt, Brazilian legal, pt-BR | Prompt craft for Portuguese legal tasks — terminology, tone, structure |

### Infrastructure
| Skill | Triggers | What it does |
|---|---|---|
| `railway-deploy` | Railway, deploy, custom domain | Railway project creation, env vars, custom domain, staged-config recovery |
| `tigris-s3-uploads` | upload, presigned URL, S3, bucket | Presigned PUT flow, CORS, multipart, content-type validation |
| `background-job-orchestration` | background job, queue, long-running | Idempotent resumable pipelines on Railway (pg-boss / Inngest / cron) |
| `github-actions-ci` | CI, GitHub Actions, workflow | Minimal Next.js CI — lint, typecheck, prisma validate, build |

### Review / QA
| Skill | Triggers | What it does |
|---|---|---|
| `review-security` | security review, audit | Headers, auth, injection, secret exposure, CSP, dependency CVEs |
| `review-performance` | performance, Core Web Vitals, slow | RSC boundaries, bundle size, DB query plans, Core Web Vitals |
| `review-type-safety` | type safety review, any, strict | Strict-mode gaps, `any` leaks, unchecked casts, missing Zod |
| `review-data-layer` | Prisma review, query review, N+1 | N+1 queries, unbounded lists, missing indexes, transaction boundaries |
| `review-prompt-output` | prompt review, hallucination, citation | Prompt hygiene, output validation, citation grounding, eval harness |
| `final-review` | final review, pre-delivery, ship check | Orchestrates all review skills before client delivery |

### Domain / Docs
| Skill | Triggers | What it does |
|---|---|---|
| `legal-domain-glossary` | prescrição, nulidade, peça, legal term | Brazilian legal terminology reference for prompts and UI copy |
| `deployment-plan` | deployment plan, go-live, sign-off | Client-facing deployment plan document |

## Architecture

Skills are self-contained folders under `skills/<name>/` with a `SKILL.md` file. Frontmatter (`name`, `description`) tells Claude when to invoke. Bodies tell Claude what to do. Optional `templates/` or `references/` sit alongside `SKILL.md` for scaffolding material.

## Project Structure

```
persimmon-claude-skills/
├── CLAUDE.md              # Stack conventions, gotchas, client context
├── README.md              # This file — catalog + quick start
├── .claude/
│   └── commands/          # Macro commands for skill maintenance
├── skills/                # One folder per skill, each with SKILL.md
├── templates/             # Shared scaffolding (next.config.ts, ci.yml, etc.)
└── docs/
    └── reference/         # Authoring notes, stack rationale
```

## Documentation

| Doc | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Stack conventions, gotchas, client context |
| [skills/](skills/) | One folder per skill |
| [templates/](templates/) | Shared file templates |
| [docs/reference/](docs/reference/) | Skill-authoring notes |

## Contributing

New skills must:
1. Have kebab-case folder name matching the `name:` frontmatter field.
2. Include `SKILL.md` with YAML frontmatter (`name`, `description`) — description must include trigger keywords.
3. Be self-contained — no cross-skill imports. If two skills share content, promote it to `templates/`.
4. Be < 300 lines. If longer, break into sub-skills or move detail into `references/`.
