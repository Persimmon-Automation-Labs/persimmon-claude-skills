---
name: rag-retrieval
description: Build retrieval over a document corpus with pgvector — chunking, embedding, hybrid search (BM25 + vector + RRF), metadata filters, and reranking. Use when wiring RAG for a Persimmon client (legal doctrine, case files, knowledge base), debugging poor recall, adding citation grounding, or scaling to larger corpora. Trigger keywords: RAG, pgvector, embeddings, voyage, cohere rerank, BM25, hybrid search, reciprocal rank fusion, chunking, citation grounding, retrieval.
---

# rag-retrieval

The Persimmon default RAG stack over Prisma + pgvector. Built for legal/document corpora where every generated claim must trace back to a specific chunk.

## Design principles

1. **Citation-first retrieval.** Every returned chunk carries `{ chunk_id, doc_id, page, source }`. Composers MUST cite these IDs inline. See `legal-brief-composer`.
2. **Hybrid by default.** Pure vector misses exact-term queries (case numbers, statute references). Pure BM25 misses paraphrases. Use both, fuse with RRF.
3. **Rerank before compose.** Retrieve top 40–60, rerank to top 8–12. Reranker context matters more than raw vector score for long-form composition.
4. **Chunk-level dedup.** Near-duplicate chunks waste context. Dedup by cosine ≥ 0.95 OR shared 8-gram overlap ≥ 50%.
5. **Never query an unfiltered HNSW index.** If metadata filtering is expected, either use a partial index or always include the filter.

## Stack

| Layer | Choice | Fallback |
|---|---|---|
| Vector store | Postgres + `pgvector` (HNSW, cosine) | — |
| Embeddings | Voyage `voyage-3` (1024-d, legal-tuned) | OpenAI `text-embedding-3-small` (1536-d, budget) |
| Lexical | Postgres `tsvector` + `ts_rank_cd` (pt-BR) | — |
| Reranker | Voyage `rerank-2` OR Cohere `rerank-multilingual-v3.0` | skip rerank (quality hit) |
| ORM | Prisma (raw SQL for vector ops) | — |

## Schema

```prisma
model Document {
  id          String   @id @default(cuid())
  docType     String
  source      String
  practiceArea String?
  publishedAt DateTime?
  chunks      Chunk[]
  createdAt   DateTime @default(now())
}

model Chunk {
  id          String   @id @default(cuid())
  docId       String
  doc         Document @relation(fields: [docId], references: [id], onDelete: Cascade)
  pageNumber  Int?
  ordinal     Int      // position within doc
  text        String   @db.Text
  tokenCount  Int
  // embeddings: pgvector type — needs raw migration
  // embedding  vector(1024)
  tsv         Unsupported("tsvector")?
  createdAt   DateTime @default(now())

  @@index([docId])
}
```

Raw migration for the vector column + indexes:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Chunk" ADD COLUMN embedding vector(1024);
ALTER TABLE "Chunk" ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', text)) STORED;

CREATE INDEX chunk_embedding_hnsw_idx ON "Chunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX chunk_tsv_gin_idx ON "Chunk" USING gin (tsv);
CREATE INDEX chunk_doctype_idx ON "Chunk" (("docId"));
```

## Chunking — `src/lib/rag/chunk.ts`

Rules:
- Target 512–1024 tokens per chunk.
- 15% overlap (prevents loss of info at chunk boundaries).
- Split hierarchy: `\n\n` (paragraph) → `\n` (line) → `. ` (sentence) → ` ` (word).
- Never split mid-citation or mid-table. If a boundary falls inside one, extend to the next safe boundary.

```ts
const TARGET_TOKENS = 768;
const OVERLAP_TOKENS = Math.round(TARGET_TOKENS * 0.15);
const CHARS_PER_TOKEN = 3.5;

export function recursiveSplit(text: string, targetTokens = TARGET_TOKENS): string[] {
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
  const separators = ["\n\n", "\n", ". ", " "];

  function split(input: string, depth = 0): string[] {
    if (input.length <= targetChars) return [input];
    const sep = separators[Math.min(depth, separators.length - 1)];
    const pieces = input.split(sep);
    const chunks: string[] = [];
    let buf = "";
    for (const piece of pieces) {
      const candidate = buf ? buf + sep + piece : piece;
      if (candidate.length > targetChars && buf) {
        chunks.push(buf);
        buf = piece;
      } else {
        buf = candidate;
      }
    }
    if (buf) chunks.push(buf);
    // If any chunk is still too large, recurse deeper.
    return chunks.flatMap((c) => (c.length > targetChars ? split(c, depth + 1) : [c]));
  }

  const raw = split(text);
  // Add overlap — prepend last overlapChars of prev to each chunk.
  return raw.map((c, i) => (i === 0 ? c : raw[i - 1].slice(-overlapChars) + c));
}
```

## Embedding — `src/lib/rag/embed.ts`

Voyage batch embed with a rate-limit-safe queue:

```ts
import fetch from "node-fetch";

const BATCH_SIZE = 128;          // Voyage max
const CONCURRENCY = 2;           // stay under rate limit
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

async function embedBatch(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3", input: texts, input_type: inputType }),
  });
  if (!res.ok) throw new Error(`voyage embed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) batches.push(texts.slice(i, i + BATCH_SIZE));

  const results: number[][] = new Array(texts.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const batchIdx = cursor++;
      if (batchIdx >= batches.length) return;
      const offset = batchIdx * BATCH_SIZE;
      const embs = await embedBatch(batches[batchIdx], "document");
      embs.forEach((e, i) => (results[offset + i] = e));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [emb] = await embedBatch([text], "query");
  return emb;
}
```

Persist:

```ts
import { db } from "@/lib/db";

export async function storeChunks(docId: string, chunks: { text: string; pageNumber?: number; ordinal: number }[]) {
  const embeddings = await embedDocuments(chunks.map((c) => c.text));
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const vec = `[${embeddings[i].join(",")}]`;
    await db.$executeRaw`
      INSERT INTO "Chunk" (id, "docId", "pageNumber", ordinal, text, "tokenCount", embedding, "createdAt")
      VALUES (gen_random_uuid()::text, ${docId}, ${c.pageNumber ?? null}, ${c.ordinal},
              ${c.text}, ${Math.round(c.text.length / 3.5)}, ${vec}::vector, NOW())
    `;
  }
}
```

## Retrieval — `src/lib/rag/retrieve.ts`

### Vector search

```ts
export type RetrievedChunk = {
  chunkId: string;
  docId: string;
  pageNumber: number | null;
  source: string;
  text: string;
  vectorScore: number;   // 1 - cosine distance
  lexicalScore: number;  // ts_rank_cd
  fusedScore: number;    // RRF
};

export async function vectorSearch(
  queryEmb: number[],
  opts: { topK?: number; docType?: string; practiceArea?: string; since?: Date } = {},
): Promise<RetrievedChunk[]> {
  const vec = `[${queryEmb.join(",")}]`;
  const rows = await db.$queryRaw<any[]>`
    SELECT c.id AS "chunkId", c."docId", c."pageNumber", d.source, c.text,
           1 - (c.embedding <=> ${vec}::vector) AS "vectorScore"
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."docId"
    WHERE (${opts.docType}::text IS NULL OR d."docType" = ${opts.docType})
      AND (${opts.practiceArea}::text IS NULL OR d."practiceArea" = ${opts.practiceArea})
      AND (${opts.since}::timestamp IS NULL OR d."publishedAt" >= ${opts.since})
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${opts.topK ?? 30}
  `;
  return rows.map((r) => ({ ...r, lexicalScore: 0, fusedScore: 0 }));
}
```

### Lexical search

```ts
export async function lexicalSearch(
  query: string,
  opts: { topK?: number; docType?: string } = {},
): Promise<RetrievedChunk[]> {
  const rows = await db.$queryRaw<any[]>`
    SELECT c.id AS "chunkId", c."docId", c."pageNumber", d.source, c.text,
           ts_rank_cd(c.tsv, plainto_tsquery('portuguese', ${query})) AS "lexicalScore"
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."docId"
    WHERE c.tsv @@ plainto_tsquery('portuguese', ${query})
      AND (${opts.docType}::text IS NULL OR d."docType" = ${opts.docType})
    ORDER BY "lexicalScore" DESC
    LIMIT ${opts.topK ?? 30}
  `;
  return rows.map((r) => ({ ...r, vectorScore: 0, fusedScore: 0 }));
}
```

### Reciprocal rank fusion

```ts
const RRF_K = 60;

export function fuseRRF(...rankedLists: RetrievedChunk[][]): RetrievedChunk[] {
  const scores = new Map<string, RetrievedChunk & { fused: number }>();
  for (const list of rankedLists) {
    list.forEach((item, idx) => {
      const rank = idx + 1;
      const existing = scores.get(item.chunkId);
      const add = 1 / (RRF_K + rank);
      if (existing) {
        existing.fused += add;
        // merge scores from whichever list had them
        existing.vectorScore = Math.max(existing.vectorScore, item.vectorScore);
        existing.lexicalScore = Math.max(existing.lexicalScore, item.lexicalScore);
      } else {
        scores.set(item.chunkId, { ...item, fused: add });
      }
    });
  }
  return Array.from(scores.values())
    .sort((a, b) => b.fused - a.fused)
    .map(({ fused, ...rest }) => ({ ...rest, fusedScore: fused }));
}
```

### Hybrid top-level

```ts
export async function hybridSearch(query: string, opts: {
  topK?: number;
  retrievalK?: number;
  docType?: string;
  practiceArea?: string;
}): Promise<RetrievedChunk[]> {
  const retrievalK = opts.retrievalK ?? 40;
  const queryEmb = await embedQuery(query);
  const [vec, lex] = await Promise.all([
    vectorSearch(queryEmb, { ...opts, topK: retrievalK }),
    lexicalSearch(query, { ...opts, topK: retrievalK }),
  ]);
  const fused = fuseRRF(vec, lex);
  return dedupChunks(fused).slice(0, opts.topK ?? 20);
}
```

## Dedup

```ts
export function dedupChunks(chunks: RetrievedChunk[], simThreshold = 0.95): RetrievedChunk[] {
  const kept: RetrievedChunk[] = [];
  for (const c of chunks) {
    const dup = kept.some((k) => jaccard8gram(k.text, c.text) >= 0.5);
    if (!dup) kept.push(c);
  }
  return kept;
}

function ngrams(s: string, n = 8): Set<string> {
  const norm = s.toLowerCase().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (let i = 0; i <= norm.length - n; i++) out.add(norm.slice(i, i + n));
  return out;
}

function jaccard8gram(a: string, b: string): number {
  const A = ngrams(a), B = ngrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}
```

## Reranking — `src/lib/rag/rerank.ts`

```ts
export async function rerank(query: string, chunks: RetrievedChunk[], topK = 10): Promise<RetrievedChunk[]> {
  if (chunks.length <= topK) return chunks;
  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "rerank-2",
      query,
      documents: chunks.map((c) => c.text),
      top_k: topK,
    }),
  });
  if (!res.ok) {
    console.warn(`[rerank] ${res.status}, falling back to fused order`);
    return chunks.slice(0, topK);
  }
  const data = (await res.json()) as { data: { index: number; relevance_score: number }[] };
  return data.data.map((r) => ({ ...chunks[r.index], fusedScore: r.relevance_score }));
}
```

## Top-level retrieval used by composers

```ts
export async function retrieveForComposition(query: string, opts: {
  topK?: number;
  docType?: string;
  practiceArea?: string;
}): Promise<RetrievedChunk[]> {
  const fused = await hybridSearch(query, { ...opts, retrievalK: 50, topK: 30 });
  return rerank(query, fused, opts.topK ?? 10);
}
```

Returned shape includes the fields a composer needs to cite: `chunkId`, `docId`, `pageNumber`, `source`. The brief composer wraps each as `<source id="{chunkId}" origin="{source}">...</source>` — see `legal-brief-composer`.

## Checklist — standing up RAG on a new Persimmon project

- [ ] `pgvector` extension enabled in Railway DB
- [ ] `Document` + `Chunk` Prisma models
- [ ] Raw migration for `vector(1024)` column, HNSW index, `tsv` generated column, GIN index
- [ ] `VOYAGE_API_KEY` in env (or `OPENAI_API_KEY` for budget stack)
- [ ] `src/lib/rag/{chunk,embed,retrieve,rerank}.ts` in place
- [ ] Ingest script persists chunks WITH embeddings in one transaction per doc
- [ ] Retrieval returns `chunkId` + `docId` + `pageNumber` to every caller

## Anti-patterns

- Pure vector retrieval when users paste case numbers or statute IDs. You'll miss them.
- Forgetting `vector_cosine_ops` on the HNSW index (defaults to L2).
- Re-embedding on every query. Cache embeddings in `Chunk.embedding` ONCE at ingest.
- Passing raw unfused lists to a composer — you'll waste context on duplicates.
- Rerank over 200+ chunks — API cost spikes. Retrieve 40–60, rerank to ~10.

## Related skills

- `prisma-pgvector` — the schema/migration scaffolding.
- `legal-brief-composer` — consumes `retrieveForComposition` and enforces citation grounding.
- `prompt-library` — retrieval-aware prompt templates wrap chunks in `<sources>`.
