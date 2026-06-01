---
name: ai
description: Index of Persimmon AI/Claude skills — the canonical Anthropic SDK wrapper, the centralized prompt library, and RAG retrieval over pgvector. Use when writing or reviewing any Claude call, prompt, embedding, or retrieval pipeline. Routes to the right specialist child skill. Trigger keywords: Claude call, Anthropic SDK, claude.ts, prompt, prompt template, RAG, embeddings, retrieval, chunk, rerank, citation grounding.
---

# AI — Index

Persimmon AI = the Anthropic Claude SDK funneled through one wrapper, prompts kept in one library, and RAG grounded on pgvector. This mother is a map; follow the child for the actual work.

## Trigger

- "Add AI to this feature" / "Call Claude for…"
- "Write the prompt for…" / "Where do prompts live?"
- "Retrieve context" / "RAG" / "embed and search"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `ai-sdk-wrapper` | Any Claude call, or fixing retry/cost/caching | `src/lib/ai/claude.ts` — retries (3, exp backoff), prompt caching, model routing (`pickModel`), token accounting, streaming |
| `ai-prompt-library` | Writing/editing any prompt | `src/lib/ai/prompts.ts` — centralized prompt templates; no inline prompt strings in business logic |
| `ai-rag-retrieval` | Retrieval-augmented features | Chunking, embedding, pgvector retrieval, reranking, citation grounding |

## How to route

1. **Calling Claude?** → `ai-sdk-wrapper` (always — never import `@anthropic-ai/sdk` directly elsewhere).
2. **Writing a prompt?** → `ai-prompt-library` (no inline prompt strings).
3. **Need grounded context?** → `ai-rag-retrieval` (uses `data-prisma-pgvector` for the vector store).

## Persimmon AI defaults — one-screen summary

- **One wrapper.** All Claude traffic through `src/lib/ai/claude.ts`. Never import the SDK elsewhere.
- **One prompt home.** All prompts in `src/lib/ai/prompts.ts`. No inline prompts in business logic.
- **Model routing**: Sonnet for classification / per-item / volume; Opus only for genuine deep reasoning (composition, multi-doc synthesis).
- **Prompt caching** (`cache_control: { type: "ephemeral" }`) on stable system/doctrine blocks meeting the per-model minimum (Sonnet 4.6 = 2,048 tokens; Opus 4.6 / Haiku 4.5 = 4,096). Below the threshold it silently no-ops.
- **Retries**: 3 with exponential backoff (1s → 4s → 16s); SDK default of 2 is too low under 529 load.
- **Persist every AI output.** Never regenerate if a result exists — expensive and non-deterministic.

## Anti-patterns banned

- Importing `@anthropic-ai/sdk` outside the wrapper
- Inline prompt strings in components/actions
- Opus where Sonnet suffices (cost)
- Regenerating an existing AI result
- Ungrounded generation when a RAG citation is required (see `legal-brief-composer`)

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `data` | RAG vector store lives in pgvector via `data-prisma-pgvector` |
| `domain-legal` | Legal generation is RAG-grounded; uses `ai-*` under the hood |
| `quality` | Prompt hygiene/output checked by `quality-review-prompt-output` |
