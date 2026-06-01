---
name: data
description: Index of Persimmon data-layer skills — Prisma schema design, pgvector vector columns, HNSW indexing, and cosine-similarity queries on PostgreSQL. Use when designing or changing the database, adding embeddings, or tuning vector search. Routes to the right specialist child skill. Trigger keywords: Prisma schema, migration, pgvector, embeddings, HNSW, vector column, cosine similarity, database design.
---

# Data — Index

Persimmon data = PostgreSQL with `pgvector`, accessed through Prisma with one shared client. This mother is a map; follow the child for the actual work.

## Trigger

- "Design the schema for…" / "Add a Prisma model / migration"
- "Store embeddings" / "vector column" / "pgvector"
- "Search by similarity" / "HNSW index"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `data-prisma-pgvector` | Any schema design, migration, vector column, or similarity query | Prisma schema patterns, pgvector extension setup, HNSW indexing (`vector_cosine_ops`), cosine-similarity queries, the one-shared-client rule |

## Persimmon data defaults — one-screen summary

- **One Prisma client** in `src/lib/db.ts`. Never instantiate `PrismaClient` elsewhere.
- **Migrations**: `prisma migrate dev` locally. On Railway, apply via `prisma db push` in the build step OR a migrate-deploy job — pick one per project and stick with it.
- **After `db push` with enum/model changes**: restart the dev server (the running Prisma client is stale).
- **pgvector index**: HNSW beats IVFFlat for recall + latency under ~10M rows. Build with `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`.
- **Never query a filtered-subset HNSW index without the filter.**
- **Naming**: models `PascalCase` singular; fields `camelCase`; `createdAt`/`updatedAt` on every model; Postgres enums, not string constants.

## Anti-patterns banned

- Instantiating `PrismaClient` outside `src/lib/db.ts`
- Mixing `migrate` and `db push` strategies in one project
- Unfiltered queries against a filtered-subset vector index
- String constants where a Postgres enum belongs

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `ai` | `ai-rag-retrieval` stores/searches embeddings here |
| `stack` | Server Actions read/write through the shared Prisma client |
| `quality` | N+1, unbounded lists, missing indexes flagged by `quality-review-data-layer` |
