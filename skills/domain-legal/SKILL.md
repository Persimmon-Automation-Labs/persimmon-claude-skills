---
name: domain-legal
description: Index of Persimmon Brazilian-legal domain skills — RAG-grounded brief composition, per-page PDF classification, Portuguese legal prompting, and the legal terminology glossary. Use on legal-RAG client work (piccino-legal and future legal clients). Routes to the right specialist child skill. Trigger keywords: legal brief, peça, citation, PDF classify, petição, sentença, intimação, Portuguese prompt, Brazilian legal, pt-BR, prescrição, nulidade, legal term.
---

# Domain-Legal — Index

The Brazilian-legal vertical: RAG-grounded document analysis and generation for legal clients (currently Almeida Prado e Piccino Advogados). This mother is a map; follow the child for the actual work. All generation is RAG-grounded and cites-only — never hallucinate legal content.

## Trigger

- "Generate a brief / peça" / "compose with citations"
- "Classify these PDF pages" / "petição vs sentença vs intimação"
- "Write the Portuguese legal prompt for…"
- "What does <legal term> mean?" / glossary lookups

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `legal-brief-composer` | Generating a legal brief/peça | RAG-grounded composition, cites-only discipline, no hallucinations |
| `legal-pdf-classifier` | Indexing legal PDFs | Per-page classification pipeline (petição, sentença, intimação, etc.) |
| `legal-pt-prompting` | Crafting Portuguese legal prompts | Terminology, tone, structure for pt-BR legal tasks |
| `legal-glossary` | Terminology reference | Brazilian legal terms for prompts and UI copy |

## How to route

1. **Generating legal text?** → `legal-brief-composer` (always cites-only; uses `ai-*` + `ai-rag-retrieval`).
2. **Processing PDFs?** → `legal-pdf-classifier`.
3. **Prompt craft?** → `legal-pt-prompting` (+ `legal-glossary` for terms).

## Domain defaults — one-screen summary

- **Cites-only generation.** Every legal claim must be grounded in a retrieved source; no invented citations or holdings.
- **Persist every output** (briefs, classifications) — never regenerate (see `ai` defaults).
- **Portuguese, pt-BR legal register** — use `legal-glossary` terms consistently.
- **Classification is per-page** and persisted, feeding retrieval.

## Anti-patterns banned

- Ungrounded legal generation (hallucinated citations/holdings)
- Regenerating an existing brief/classification
- Mixing Portuguese legal register with casual translation
- Inline prompts — legal prompts live in `ai-prompt-library`

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `ai` | Uses `ai-sdk-wrapper`, `ai-prompt-library`, `ai-rag-retrieval` |
| `data` | Documents + embeddings stored via `data-prisma-pgvector` |
| `quality` | Output grounding checked by `quality-review-prompt-output` |
