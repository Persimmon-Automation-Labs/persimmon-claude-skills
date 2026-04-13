---
name: review-data-layer
description: Prisma schema, query, and migration audit for Persimmon stack. Checks timestamps, indexes, enums, cascade rules, N+1, unbounded reads, transactions, migration hygiene, pgvector HNSW index, and connection pooling. Triggers on "data layer review", "schema audit", "prisma review", "database review", "pre-launch", "before shipping".
---

# Data-Layer Review — Persimmon Stack

Prisma + Postgres + pgvector audit. Runs standalone or via `final-review`.

## Inputs

- `PROJECT_ROOT` — repo root
- `DATABASE_URL` — optional; enables `EXPLAIN ANALYZE` on live DB

## Procedure

### Section 1 — Schema Hygiene

```bash
cat "$PROJECT_ROOT/prisma/schema.prisma"
```

For every `model`:

| Check | PASS criteria | Severity |
|---|---|---|
| Timestamps | `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` | MEDIUM |
| Primary key | `id String @id @default(cuid())` or `uuid()` — never auto-increment int for user-facing | LOW |
| Enums | status-like fields use Postgres `enum`, not `String` | MEDIUM |
| Foreign keys indexed | every relation scalar appears in `@@index` or is `@unique` | HIGH |
| Cascade rules | `onDelete` is explicit (`Cascade`, `SetNull`, `Restrict`) — never left implicit | HIGH |
| No naked `String?` | optional fields have explicit meaning documented in `///` comment | LOW |

**Example — good Persimmon model:**

```prisma
enum ProcessStatus {
  UPLOADING
  UPLOADED
  INDEXING
  INDEXED
  ANALYZING
  ANALYZED
  GENERATING_BRIEF
  BRIEF_READY
  ERROR
}

model Process {
  id         String         @id @default(cuid())
  title      String
  status     ProcessStatus  @default(UPLOADING)
  ownerId    String
  owner      User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  files      ProcessFile[]
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  @@index([ownerId, createdAt(sort: Desc)])
  @@index([status])
}
```

### Section 2 — Query Patterns

**N+1 detection:**
```bash
grep -rnB1 -A5 "\.map(async" "$PROJECT_ROOT/src" | grep -B3 -A2 "db\."
grep -rn "for (const .* of .*) {" "$PROJECT_ROOT/src" | head
```

For each hit, verify the DB call is outside the loop or uses `include` / `Promise.all` on a batched query.

**Before:**
```ts
for (const process of processes) {
  process.files = await db.processFile.findMany({ where: { processId: process.id } });
}
```
**After:**
```ts
const processes = await db.process.findMany({
  include: { files: { orderBy: { position: "asc" } } },
});
```

**`select` vs `include`:**
```bash
grep -rn "include:" "$PROJECT_ROOT/src" | wc -l
grep -rn "select:" "$PROJECT_ROOT/src" | wc -l
```

Rule: `include` pulls the full relation row. For list views and dropdowns, prefer `select` with only the columns rendered. FAIL if a list view uses `include` on a wide model (>10 columns).

**Cursor pagination vs offset:**
```bash
grep -rn "skip:" "$PROJECT_ROOT/src"
```

Any `skip: N` > ~100 on a growing table = WARN. Replace with cursor:

```ts
const page = await db.process.findMany({
  take: 25,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  orderBy: { createdAt: "desc" },
});
```

**Unbounded reads:**
```bash
grep -rn "findMany" "$PROJECT_ROOT/src" | grep -v "take:"
```

Every `findMany` on a user-growing table without `take` = FAIL.

### Section 3 — Transactions

```bash
grep -rn "prisma.\$transaction\|db.\$transaction" "$PROJECT_ROOT/src"
```

Multi-write flows (create process + create N files + update status) must be in one `$transaction`. Scan Server Actions:

```bash
grep -rnB2 -A20 "\"use server\"" "$PROJECT_ROOT/src" | grep -cE "db\.(process|processFile|brief)\.(create|update|delete)"
```

**Remediation:**

```ts
await db.$transaction(async (tx) => {
  const proc = await tx.process.create({ data: {...} });
  await tx.processFile.createMany({ data: fileIds.map((id, i) => ({ processId: proc.id, s3Key: id, position: i })) });
  await tx.process.update({ where: { id: proc.id }, data: { status: "UPLOADED" } });
});
```

Missing transaction on a 3-step flow = HIGH.

### Section 4 — Migrations

```bash
ls "$PROJECT_ROOT/prisma/migrations" 2>/dev/null
cat "$PROJECT_ROOT/prisma/migrations/*/migration.sql" 2>/dev/null | grep -E "DROP COLUMN|DROP TABLE|ALTER COLUMN.*NOT NULL"
```

| Check | PASS criteria |
|---|---|
| Named migrations | folder names are descriptive (`20250115_add_brief_table`), not `migration1` |
| Destructive changes | each `DROP COLUMN` / `DROP TABLE` has a paired data-migration step in the same PR or documented in `docs/decisions/` |
| NOT NULL added to existing column | preceded by data backfill + default, not bare |
| `prisma migrate deploy` in CI | verified in `.github/workflows/*.yml` |

If the project uses `prisma db push` instead of migrations (Persimmon allows either — "pick one and stick with it"), verify there is no `prisma/migrations` folder mixed in and the README documents the choice.

### Section 5 — pgvector

For RAG projects (e.g. Piccino knowledge base):

```bash
grep -rnE "vector\(|pgvector|Unsupported\(\"vector" "$PROJECT_ROOT/prisma/schema.prisma"
grep -rnE "CREATE INDEX.*hnsw\|vector_cosine_ops" "$PROJECT_ROOT/prisma/migrations"
```

| Check | PASS criteria | Severity |
|---|---|---|
| Extension enabled | `CREATE EXTENSION IF NOT EXISTS vector;` in an early migration | CRITICAL |
| Embedding column | `embedding vector(1536)` matches model output dim (`text-embedding-3-small` = 1536, voyage-3 = 1024) | CRITICAL |
| HNSW index | `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` | HIGH |
| Consistent operator | search queries use `<=>` (cosine distance) to match the index | HIGH |
| Pre-filter index | if you filter by `tenantId` before vector search, composite partial index or app-level filter |

**Example migration SQL:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "KnowledgeDocumentChunk"
  ADD COLUMN "embedding" vector(1536);

CREATE INDEX "KnowledgeDocumentChunk_embedding_idx"
  ON "KnowledgeDocumentChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Query:
```ts
const rows = await db.$queryRaw<Array<{ id: string; distance: number }>>`
  SELECT id, embedding <=> ${queryVec}::vector AS distance
  FROM "KnowledgeDocumentChunk"
  WHERE "tenantId" = ${tenantId}
  ORDER BY embedding <=> ${queryVec}::vector
  LIMIT 10;
`;
```

### Section 6 — Connection Pooling

Railway + Prisma requires pgbouncer for app runtime and a direct URL for migrations.

```bash
grep -nE "DATABASE_URL|DIRECT_URL" "$PROJECT_ROOT/prisma/schema.prisma" "$PROJECT_ROOT/.env.example"
```

| Check | PASS criteria |
|---|---|
| `datasource db` | has `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")` |
| `DATABASE_URL` | includes `?pgbouncer=true&connection_limit=1` on serverless / Railway |
| `DIRECT_URL` | points at the non-pooled host, used for `migrate deploy` |

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Section 7 — Shared Client + No Stray Instantiation

```bash
grep -rn "new PrismaClient" "$PROJECT_ROOT/src" | grep -v "src/lib/db.ts"
```

Zero results = PASS. Any other instantiation = FAIL (exhausts Postgres connection limit on hot-reload).

Canonical `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

### Section 8 — EXPLAIN the hot paths

For the 3 busiest read queries (list pages, dashboards):

```bash
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id, title, status, \"createdAt\" FROM \"Process\" WHERE \"ownerId\" = 'u_xxx' ORDER BY \"createdAt\" DESC LIMIT 25;"
```

Look for:
- `Index Scan` = good.
- `Seq Scan` on > 10k rows = FAIL (missing index).
- `Rows Removed by Filter` >> returned rows = wrong index.
- Total time > 50ms on a list view = investigate.

## Report Format

```
Data-Layer Audit — {PROJECT_NAME}
Date: {YYYY-MM-DD}

| # | Section         | Finding                                       | Severity | Location                            |
|---|-----------------|-----------------------------------------------|----------|-------------------------------------|
| 1 | Schema          | Process.ownerId not indexed                   | HIGH     | prisma/schema.prisma:42             |
| 2 | Queries         | N+1: file counts per process                  | CRITICAL | src/app/processes/page.tsx:18       |
| 2 | Queries         | findMany without take                         | HIGH     | src/lib/process-actions.ts:55       |
| 3 | Transactions    | createProcess does 3 writes w/o transaction   | HIGH     | src/lib/process-actions.ts:40       |
| 4 | Migrations      | migration adds NOT NULL w/o backfill          | CRITICAL | prisma/migrations/.../migration.sql |
| 5 | pgvector        | HNSW index missing                            | HIGH     | prisma/migrations/*                 |
| 6 | Pooling         | DATABASE_URL lacks pgbouncer=true             | MEDIUM   | .env.example:3                      |
| 7 | Shared client   | new PrismaClient() in 2 places                | CRITICAL | src/app/api/jobs/route.ts:5         |
| 8 | EXPLAIN         | /processes list 240ms, Seq Scan               | HIGH     | live DB                             |

Summary: CRITICAL=3 HIGH=4 MEDIUM=1 LOW=0
Verdict: DON'T SHIP — migration + client instantiation + N+1 are all blockers.
```

## Failure Criteria

- Any `new PrismaClient()` outside `src/lib/db.ts` → block.
- Migration that drops or NOT-NULLs an existing column without backfill → block.
- N+1 on a user-facing page → block.
- pgvector projects without HNSW index → block.
- `findMany` without `take` on a user-growing table → block.

## Integration with `final-review`

Return JSON: `{ "skill": "review-data-layer", "counts": {...}, "findings": [...] }`. Data-layer FAIL is the earliest signal — `final-review` should surface these first, since they often cause build-time or runtime crashes that mask other findings.
