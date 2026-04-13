# Stack Research — 2026 Best Practices

Research notes that seeded the skills in this repo. Keep as a reference for future skill updates. Every section is actionable patterns, not a survey.

## Next.js 16 Server Actions + RSC

Model expected errors as return values, not thrown exceptions. Pair every action with `useActionState` on the client so validation errors and success states flow through one channel. Reserve `throw` for truly unexpected failures that should trip `error.tsx` boundaries.

For mutations, use the new two-argument `revalidateTag(tag, 'max')` for stale-while-revalidate (eventual) semantics, and `updateTag(tag)` when the very next render must see fresh data. The single-argument `revalidateTag(tag)` form is deprecated in 16.

Type-safety pattern: a Zod schema drives `FormData → parsed input`, and the action returns `{ ok: true, data } | { ok: false, fieldErrors }`, which `useActionState` surfaces.

Sources: [revalidateTag docs](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [revalidateTag vs updateTag](https://www.buildwithmatija.com/blog/nextjs-revalidate-tag-vs-update-tag-cache-invalidation)

## Prisma + pgvector

Model embeddings as unsupported: `embedding Unsupported("vector(1536)")?` with a companion `tsvector` column for BM25.

Default to HNSW over IVFFlat for legal corpora — no training step, builds online, wins speed/recall. Use `vector_cosine_ops` for L2-normalized embeddings (OpenAI, Voyage, most Cohere); `vector_l2_ops` only for magnitude-sensitive workloads.

Tune `hnsw.ef_search` per query (40 default, 100 for high-recall brief generation) via `SET LOCAL` in the transaction.

Hybrid search: `tsvector @@ plainto_tsquery('portuguese', $q)` BM25 branch + `embedding <=> $v` vector branch, combine via Reciprocal Rank Fusion (`1/(k+rank)`, k=60). Raw-SQL both branches — Prisma doesn't know the operators.

Sources: [pgvector](https://github.com/pgvector/pgvector), [HNSW vs IVFFlat (AWS)](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)

## Anthropic Claude SDK

Prompt caching is the biggest win: mark static blocks with `cache_control: { type: "ephemeral" }` — cache reads are 0.1× input price. Structure: `[system (cached) | doctrine chunks (cached, 5-min) | user query (fresh)]`.

Sonnet vs Opus routing: Sonnet handles chunk classification, metadata extraction, short Q&A, first-pass drafting. Escalate to Opus only for final brief generation spanning >20 citations, or when Sonnet's confidence / tool-call validation fails.

Structured output: beta header `anthropic-beta: structured-outputs-2025-11-13` with JSON Schema for deterministic extraction. Grammar-constrained decoding cannot violate the schema — prefer this over tool-use for single-shot extraction.

Portuguese tip: system prompts in English routinely outperform PT-BR system prompts even when output must be PT-BR. Instruct output language explicitly.

Sources: [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Structured output](https://thomas-wiegold.com/blog/claude-api-structured-output/)

## RAG over Legal Documents

Chunking: recursive character chunking with legal-aware separators (article/§ boundaries, `\n\n`, `. `) at 800-1200 tokens with 150 overlap. Naive fixed-size chunking loses doctrine structure.

Summary-Augmented Chunking (SAC): prepend a 2-3 sentence doc-level summary to every chunk to disambiguate pronoun-heavy legal prose.

Metadata inline: `{tribunal, turma, data_julgamento, relator, area, lei_citada[]}`. Always apply metadata pre-filters before vector search.

Citation grounding is non-negotiable. Every LLM claim anchors to a `{chunk_id, page, paragraph}` tuple. Render the anchor in UI with click-through to the original PDF page.

Two-stage: top-50 hybrid (BM25 + vector RRF) → cross-encoder or Cohere rerank-v3 multilingual → top-8 to LLM.

Sources: [LegalBench-RAG](https://www.emergentmind.com/topics/legalbench-rag), [Citation-Aware RAG](https://www.tensorlake.ai/blog/rag-citations)

## PDF Legal-Doc Processing

Route by document type. Digitally-generated PDFs (intimações, peças geradas pelo PJe) → `unpdf` or `pdf-parse` in Node, preserving page boundaries. Scanned docs → Mistral OCR (~1000 pages/USD) returns ordered Markdown with tables preserved. Fall back to Claude vision only when layout reasoning matters (multi-column acórdãos).

Always page-level split first: OCR per page, store `{page_number, text, bbox_of_headings}`, classify each page (`ementa | relatório | voto | dispositivo | certidão`) with a cheap Sonnet call before chunking. Page-level classification drives retrieval metadata and lets you skip junk during indexing.

Store both raw text and Markdown — Markdown for LLM context, raw text for full-text search tokenization.

## Background Jobs on Railway

Decision tree:
- One-shot cron (daily reindex) → Railway Cron service
- Bursty user-triggered pipelines (PDF upload → indexer → analyzer → brief) → **pg-boss on existing Postgres** (Persimmon default)
- Scale past ~500 jobs/sec → BullMQ on Railway Redis
- Durable-execution without ops burden → Trigger.dev v3

Pattern: every stage writes `{doc_id, stage, status, output_ref}` to a `pipeline_runs` table before completing. Each job's first action: `SELECT FOR UPDATE SKIP LOCKED` on its row; if `status='completed'`, return immediately (idempotent retry).

Use the doc's SHA-256 content hash as the idempotency key across stages so re-uploads dedupe.

Sources: [Railway Cron vs Workers vs Queues](https://docs.railway.com/guides/cron-workers-queues), [BullMQ](https://bullmq.io/)

## NextAuth v5 Credentials

JWT sessions, not database — lower latency, no extra query per request. `@auth/*-adapter` scope, not `@next-auth/*-adapter` (that's v4).

Keep JWT payload lean: `{sub, email, role, orgId}` only. JWTs are cookies — over 4KB fails silently in some proxies.

Edge-runtime: Prisma works in middleware since v5.9.1 only if you don't execute queries there. Do auth gating with the JWT alone, defer DB hits to route handlers. Split config: `auth.config.ts` (edge-safe) imported by middleware; `auth.ts` extends it with the Prisma adapter for Node-runtime routes.

In `jwt` callback, persist `role/orgId` on sign-in only (`if (user) token.role = user.role`); in `session` callback copy to `session.user`. Call `auth()` at the top of every server action — never trust the client.

Sources: [Auth.js v5 migration](https://authjs.dev/getting-started/migrating-to-v5)

## Tigris / S3 Presigned Uploads

For legal PDFs (often >25MB, scanned docs >100MB), always multipart. Server action `createUpload` calls `CreateMultipartUpload` with `ContentType: 'application/pdf'` and metadata `{user_id, case_id, sha256_expected}`, then issues part-level presigned URLs. Client uploads parts in parallel (5MB part size). Server `completeUpload` invokes `CompleteMultipartUpload` and verifies SHA-256 by streaming the completed object before enqueueing the indexer.

Content-type enforcement: presigned PUT URLs cannot constrain headers, so use POST policy uploads when you need to pin `Content-Type` and `Content-Length` ranges. For PUT uploads, re-validate server-side after completion.

Virus scanning: queue a ClamAV job on `CompleteMultipartUpload`; keep the object in a `quarantine/` prefix until clean, then `CopyObject` to `documents/`.

Sources: [Tigris Presigned](https://www.tigrisdata.com/docs/objects/presigned/), [Tigris Multipart](https://www.tigrisdata.com/docs/objects/multipart-uploads/)

## Zod + Server Actions

One Zod schema is the single source of truth. Export both schema and `type X = z.infer<typeof XSchema>`.

Pattern: `const parsed = Schema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors }`.

Apply Zod once at the boundary. Downstream functions take parsed types, never raw `unknown`. Never trust hidden form fields (user_id, role) — re-derive from `auth()`.

For complex nested inputs, don't use `FormData` — accept JSON or use `next-safe-action` / `zsa`.

## Tailwind v4

No `tailwind.config.js` for most projects. Configuration moves into CSS via `@theme`. Tokens are CSS custom properties: `--color-*`, `--spacing-*`, `--text-*`, `--radius-*`, `--font-*`, `--breakpoint-*`.

Setup: `@import "tailwindcss";` + `@theme { --color-brand-500: oklch(...); }`. Container queries built-in — use `@container` on parent + `@sm:`, `@md:` variants on children.

Migration: `npx @tailwindcss/upgrade` handles 80% automatically. Audit (a) custom plugins (API changed), (b) `theme()` function calls in CSS, (c) arbitrary values using old config refs. Build 2-5× faster (Rust Oxide engine).

## GitHub Actions CI

Minimal: `setup-node@v4` with `cache: 'npm'` → `npm ci` → parallel `typecheck`, `lint`, `build`. Cache `.next/cache` via `actions/cache@v4` keyed on lockfile + source files.

Pin Node 20 LTS. PR concurrency group cancels stale runs. Gate deploy on all checks green.

## ADR Authoring (MADR)

MADR 4.x. File: `docs/decisions/NNNN-kebab-title.md`, numbered sequentially, never renumbered.

Sections: Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Consequences.

Write one for: any decision that (a) changes a public interface or data schema, (b) introduces or removes a dependency, (c) reshapes a subsystem boundary, (d) accepts a known tradeoff you'd otherwise forget in 6 months.

Don't write for: library version bumps, bug fixes, styling choices.

Status lifecycle: `Proposed → Accepted → (Superseded by ADR-NNNN | Deprecated)`. Never edit an Accepted ADR's decision — supersede it with a new numbered ADR.

Sources: [MADR](https://adr.github.io/madr/)

## Claude Code Skill Authoring

Every skill is `SKILL.md` + optional resource files in the same folder. YAML frontmatter: `name` (≤64 chars, `^[a-z0-9-]+$`) and `description` (≤1024 chars, third person, states *what it does AND when to use it* — description drives discovery).

Body under ~500 lines. Longer content splits into `reference.md`, `examples/`, `scripts/` with relative links — progressive disclosure.

Structure: concrete decision rules first, code snippets second, narrative last. Imperative voice. Include anti-patterns and gotchas — they prevent more errors than positive instructions.

Sources: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

## Idempotency & Resumable Pipelines

Every stage is a pure function `(input_ref, run_id) → output_ref`. Persist `pipeline_runs` row `{run_id, doc_id, stage, status, input_hash, output_ref, attempts, error, updated_at}` transactionally with enqueue.

Idempotency key = SHA-256 of doc bytes. Upstream retries dedupe automatically; re-uploads short-circuit.

Worker's first step: `UPDATE pipeline_runs SET status='running', attempts=attempts+1 WHERE run_id=$1 AND status IN ('pending','failed') RETURNING *`. If zero rows, another worker owns it — exit.

Checkpointing inside a stage: for analyzer (N Claude calls), persist intermediate `{chunk_id, result}` rows as they complete, so a crashed analyzer resumes from the last unsaved chunk.

Cap `attempts` (e.g., 5) to avoid poison-message loops — surface to a dead-letter view.

## Legal-Tech Specific (Brazilian Law)

**Terminology reference** — see `skills/legal-domain-glossary/SKILL.md` for full glossary. Key structured-extraction targets:
- **Petição inicial** → `{autor, réu, causa_de_pedir, pedidos[], valor_da_causa}`
- **Sentença** → `{dispositivo, data_publicação, juiz}` — `data_publicação` drives prescrição/prazos recursais
- **Acórdão** → `{tribunal, turma, relator, ementa, voto_vencedor, data_julgamento}` — ementa is gold-standard for doctrine RAG
- **Intimação** → `{data_intimacao, prazo_dias, prazo_tipo}` (corridos vs úteis per CPC Art. 219)

**Prescrição date-math**: store every date as `{data, fonte_chunk_id, fuso: 'America/Sao_Paulo'}`. Differentiate prescrição (pretension loss) vs decadência (right loss) — never conflate. Standard prazos: 10 anos (geral CC 205), 5 anos (tributária), 3 anos (reparação civil CC 206 §3º V), 1 ano (alimentos). Marco interruptivo (CC 202): citação válida, protesto, reconhecimento — resets clock once. Prazo recursal (CPC 1.003): 15 dias úteis from `data_intimacao`, exclude start day include end day, roll forward on weekend/recesso forense (Dec 20–Jan 20).

**Cálculo validation**: never let the LLM do arithmetic. Extract structured fields `{valor_principal, data_inicio, indice (IPCA/SELIC/INPC), juros_pct_ao_mes, marco_interruptivo[]}`, compute in a deterministic service against Banco Central index tables. Present LLM output as draft with a "recalcular" button. Flag divergence >R$0.01.
