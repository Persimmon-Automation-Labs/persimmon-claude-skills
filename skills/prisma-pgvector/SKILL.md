---
name: prisma-pgvector
description: Prisma + pgvector schema and query patterns for RAG on the Persimmon stack. Use when designing vector-indexed tables, writing embedding pipelines, choosing HNSW vs IVFFlat, picking embedding dimensions (OpenAI/Voyage/Cohere), writing cosine-distance retrieval queries, or wiring hybrid search (BM25 + vector). Covers the `Unsupported("vector(N)")` Prisma trick, raw `$queryRaw` retrieval, chunk table design, and migration workflow on Railway Postgres.
---

# Prisma + pgvector — Persimmon RAG Patterns

Every Persimmon project that does retrieval (brief generation, doctrine lookup, doc Q&A) uses Postgres + pgvector on the same Railway database. No Pinecone, no Weaviate, no external vector store. One DB, one connection pool, one backup.

## Extension Setup

pgvector isn't in the schema — it's a Postgres extension. Enable it once per database:

```sql
-- prisma/migrations/<timestamp>_enable_pgvector/migration.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Create the migration manually:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_enable_pgvector
# write migration.sql with the CREATE EXTENSION above
npx prisma migrate deploy
```

Verify on Railway:

```bash
psql "$DATABASE_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
# expect: vector | 0.8.2 (or newer)
```

If a client provides a non-Railway Postgres (Neon, Supabase, RDS), confirm `vector >= 0.5.0` before promising HNSW — earlier versions only have IVFFlat.

## Embedding Dimensions — Pick Before Touching Schema

| Provider | Model | Dim | Use when |
|---|---|---|---|
| OpenAI | `text-embedding-3-small` | **1536** | Default. Cheap, solid recall, plenty of retrieval libs tested at this dim. |
| OpenAI | `text-embedding-3-large` | **3072** | Needed only when the client has subtle semantic queries (legal nuance, financial clause distinctions). 2× storage, 2× index time. |
| Voyage | `voyage-3` | **1024** | Strong for code + technical docs. Cheaper than OpenAI large. |
| Voyage | `voyage-3-large` | **1024** | SOTA on legal/retrieval benchmarks as of 2025. Picciono-style clients. |
| Cohere | `embed-multilingual-v3.0` | **1024** | When the corpus mixes languages (pt-BR + en). |

**You cannot change dim after shipping** without re-embedding the whole corpus. Pick once, document in an ADR, stick with it.

The dim MUST match the column type exactly. `vector(1536)` will reject inserts of any other length.

## Schema Pattern — Chunk Table

Store embeddings on chunks, not whole documents. A 20-page PDF becomes ~30 chunks of ~500 tokens each.

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

model KnowledgeDocument {
  id          String                   @id @default(cuid())
  title       String
  sourceUri   String?
  matterType  String?                  // e.g. "trabalhista"
  createdAt   DateTime                 @default(now())
  updatedAt   DateTime                 @updatedAt
  chunks      KnowledgeDocumentChunk[]

  @@index([matterType])
}

model KnowledgeDocumentChunk {
  id          String            @id @default(cuid())
  documentId  String
  document    KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex  Int
  text        String            @db.Text
  tokenCount  Int
  embedding   Unsupported("vector(1536)")?
  metadata    Json              @default("{}")   // page range, heading path, citations, etc.
  createdAt   DateTime          @default(now())

  @@unique([documentId, chunkIndex])
  @@index([documentId])
}
```

### Key decisions encoded above

- `Unsupported("vector(1536)")` — Prisma doesn't have a native vector type; this is the supported escape hatch. Prisma Client sees the field as unknown, so you write/read it via `$queryRaw` (below).
- `Optional` (`?`) on `embedding` — lets you insert the chunk row first, then fill the embedding asynchronously. Critical for resumable pipelines.
- `onDelete: Cascade` on the relation — deleting a document nukes its chunks. Prevents orphan embeddings.
- `metadata Json` — always include. You will need to store page numbers, heading paths, or section tags for grounding citations.
- `@@unique([documentId, chunkIndex])` — idempotent upserts. Re-running the indexer never duplicates.

## Index — HNSW vs IVFFlat

**Use HNSW for Persimmon defaults.** IVFFlat is legacy (pgvector 0.4 and earlier) and requires a training step.

| | HNSW | IVFFlat |
|---|---|---|
| Recall | Higher | Lower |
| Build time | Slower | Faster |
| Query latency | ~O(log n) | ~O(sqrt(n)) |
| Memory | More | Less |
| Requires training | No | Yes (ANALYZE + list count tuning) |
| Good for | < 10M rows | > 10M rows, tight memory |

Every Persimmon client fits in < 10M chunks. Always HNSW.

### Creating the index (raw SQL — Prisma can't express it cleanly yet)

```sql
-- prisma/migrations/<timestamp>_chunk_hnsw_index/migration.sql
CREATE INDEX knowledge_chunk_embedding_hnsw_idx
  ON "KnowledgeDocumentChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

`m` and `ef_construction` are the standard defaults — don't tune until you've measured.

**Never query on a filtered subset if the index isn't also filtered.** If you add `WHERE matterType = 'trabalhista'`, either create a partial index or add a btree index on `matterType` and let the planner pick — on small corpora the planner will scan anyway.

## Embedding a Chunk — The Write Path

```ts
// src/lib/ai/embeddings.ts
import OpenAI from "openai";
import { db } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedChunk(chunkId: string, text: string): Promise<void> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== 1536) {
    throw new Error(`Embedding dim mismatch: expected 1536, got ${vec?.length}`);
  }

  // Prisma can't bind a vector through its normal client — use $executeRaw.
  // Cast array -> text -> vector. This is the portable form.
  const literal = `[${vec.join(",")}]`;
  await db.$executeRaw`
    UPDATE "KnowledgeDocumentChunk"
    SET embedding = ${literal}::vector
    WHERE id = ${chunkId}
  `;
}
```

Batch embed in parallel with a concurrency limit (p-limit, concurrency 5–10). OpenAI rate limits at 3000 RPM for `text-embedding-3-small`.

## Retrieval Query — Cosine Distance

pgvector operators:

| Op | Meaning | Use when |
|---|---|---|
| `<->` | L2 (euclidean) distance | Rarely. Only if embeddings aren't normalized. |
| `<=>` | Cosine distance | **Default.** All OpenAI/Voyage embeddings are L2-normalized → cosine is correct. |
| `<#>` | Negative inner product | Equivalent to cosine on normalized vectors; fractionally faster. |

Always `ORDER BY embedding <=> query LIMIT k`. Never filter by a similarity threshold without a LIMIT — your index won't be used.

```ts
// src/lib/ai/rag.ts
import { db } from "@/lib/db";

export type RetrievedChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  metadata: unknown;
  distance: number;
};

export async function retrieve(
  queryEmbedding: number[],
  opts: { k?: number; matterType?: string } = {}
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 8;
  if (queryEmbedding.length !== 1536) {
    throw new Error(`Query dim mismatch: expected 1536, got ${queryEmbedding.length}`);
  }
  const literal = `[${queryEmbedding.join(",")}]`;

  if (opts.matterType) {
    return db.$queryRaw<RetrievedChunk[]>`
      SELECT c.id, c."documentId", c."chunkIndex", c.text, c.metadata,
             c.embedding <=> ${literal}::vector AS distance
      FROM "KnowledgeDocumentChunk" c
      JOIN "KnowledgeDocument" d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
        AND d."matterType" = ${opts.matterType}
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${k}
    `;
  }

  return db.$queryRaw<RetrievedChunk[]>`
    SELECT c.id, c."documentId", c."chunkIndex", c.text, c.metadata,
           c.embedding <=> ${literal}::vector AS distance
    FROM "KnowledgeDocumentChunk" c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${k}
  `;
}
```

### Why `$queryRaw` and not Prisma's query builder

Prisma Client doesn't know the `vector` type. It can't parameterize `<=>`. Use `$queryRaw` for retrieval — it's the documented path. Parameters are still bound (no SQL injection) as long as you use the tagged template form.

### Cosine distance vs similarity

`<=>` returns **distance**, where 0 = identical and 2 = opposite. Similarity = `1 - (distance / 2)`. Convert in the app layer if the UI wants a 0–100 score.

## Hybrid Search — BM25 + Vector

For legal / regulatory corpora, keyword match matters (client names, article numbers like "art. 5º", case IDs). Combine full-text search with vector.

### Add a tsvector column + GIN index

```sql
ALTER TABLE "KnowledgeDocumentChunk"
  ADD COLUMN text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(text, ''))) STORED;

CREATE INDEX knowledge_chunk_tsv_gin_idx
  ON "KnowledgeDocumentChunk"
  USING GIN (text_tsv);
```

Use `'portuguese'` for pt-BR corpora (Piccino), `'english'` for en.

### Hybrid query — Reciprocal Rank Fusion (RRF)

```ts
export async function retrieveHybrid(
  queryText: string,
  queryEmbedding: number[],
  k = 8
): Promise<RetrievedChunk[]> {
  const literal = `[${queryEmbedding.join(",")}]`;
  return db.$queryRaw<RetrievedChunk[]>`
    WITH vector_hits AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${literal}::vector) AS rank
      FROM "KnowledgeDocumentChunk"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 50
    ),
    text_hits AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(text_tsv, plainto_tsquery('portuguese', ${queryText})) DESC) AS rank
      FROM "KnowledgeDocumentChunk"
      WHERE text_tsv @@ plainto_tsquery('portuguese', ${queryText})
      LIMIT 50
    ),
    fused AS (
      SELECT id, SUM(1.0 / (60 + rank)) AS score FROM (
        SELECT id, rank FROM vector_hits
        UNION ALL
        SELECT id, rank FROM text_hits
      ) u
      GROUP BY id
      ORDER BY score DESC
      LIMIT ${k}
    )
    SELECT c.id, c."documentId", c."chunkIndex", c.text, c.metadata, 0::double precision AS distance
    FROM fused f
    JOIN "KnowledgeDocumentChunk" c ON c.id = f.id
    ORDER BY f.score DESC
  `;
}
```

RRF with k=60 is the published default. Don't tune until you A/B test.

## Migration Workflow on Railway

1. Make schema changes in `prisma/schema.prisma`.
2. Locally: `npx prisma migrate dev --name <desc>` — creates migration SQL and applies to dev DB.
3. Inspect the generated SQL. If it touches `vector` / `Unsupported`, Prisma may emit `-- CreateTable` but skip the vector column. **Edit the migration** to add the column explicitly if needed.
4. For index changes, write a separate empty migration (`npx prisma migrate dev --create-only --name <desc>`) and drop the SQL in yourself.
5. Commit. Push. Railway runs `prisma migrate deploy` as part of the build (or at boot, depending on project).
6. **After enum / model changes, restart the dev server.** The running Prisma client caches the old generated types.

## Anti-Patterns

### Putting embeddings on the parent document, not chunks

```prisma
// WRONG — can't retrieve passages, only whole docs
model KnowledgeDocument {
  embedding Unsupported("vector(1536)")
}
```

A 20-page PDF has too many topics to fit in one 1536-dim vector. Always chunk.

### No dim check before insert

Inserting a wrong-length vector fails at the DB with a cryptic message. Validate length in the embedding helper:

```ts
if (vec.length !== 1536) throw new Error(`...`);
```

### Similarity threshold with no LIMIT

```sql
-- WRONG — full scan; the HNSW index isn't used
SELECT * FROM chunks WHERE embedding <=> $1 < 0.3;
```

Always `ORDER BY ... LIMIT k`, then filter by distance in the app layer if needed.

### Regenerating embeddings on every query

Query embeddings are ephemeral. Chunk embeddings are expensive and deterministic. **Persist chunk embeddings once.** Never re-embed on page load. See Persimmon CLAUDE.md, "Persist every AI output."

### Mixing embedding models in one table

If you ever switch from `text-embedding-3-small` (1536) to `voyage-3` (1024), you need a new column, a new index, and a backfill — not a swap in place. Track the provider+dim in a sibling column if you plan to ever migrate.

## Checklist for Adding a New Vector Table

- [ ] Decided on dim (document in ADR)
- [ ] Column declared as `Unsupported("vector(N)")`, nullable
- [ ] Table has `chunkIndex` + `@@unique([parentId, chunkIndex])`
- [ ] HNSW index created via raw SQL migration
- [ ] Embedding helper validates dim before insert
- [ ] Retrieval uses `$queryRaw` with `<=>` and `LIMIT`
- [ ] For pt-BR corpora, also added tsvector + GIN for hybrid
- [ ] Write path persists chunks first, fills embeddings async (resumable)

## Cross-References

- **nextjs-server-actions** — how retrieval is called from a brief-generation action
- **zod-boundary-validation** — validating query text before embedding
- **typescript-strict-patterns** — branded types for `ChunkId`, `DocumentId`
