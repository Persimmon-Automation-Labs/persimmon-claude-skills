---
name: background-job-orchestration
description: Build idempotent, resumable background pipelines on Railway for Persimmon projects. Use when wiring a long-running job (indexer, analyzer, brief generator), choosing a queue (pg-boss vs Inngest vs trigger.dev), designing a Process.status state machine, implementing retry with exponential backoff, making stages resumable, adding progress reporting, handling graceful shutdown, or debugging stuck jobs. Trigger keywords — background job, worker, queue, pg-boss, inngest, trigger.dev, idempotent, resumable, status machine, retry, exponential backoff, poison pill, SIGTERM, stuck job, indexer, analyzer, long-running.
---

# Background Job Orchestration for Persimmon Projects

## Why This Exists

Persimmon pipelines process multi-thousand-page PDFs, run per-page Claude calls, and compose briefs. None of that fits in an HTTP request. All of it must be:

1. **Persistent** — survives deploys, crashes, restarts.
2. **Idempotent** — running the same stage twice produces the same result.
3. **Resumable** — never recompute a completed stage. Claude output is expensive and non-deterministic.
4. **Observable** — you can see where a job is, why it stalled, how long it took.

Railway does NOT have serverless timeouts on long-running services, so we run workers as separate always-on services.

---

## 1. Choosing a Queue

| Option | When to use | Cost | Ops burden |
|---|---|---|---|
| **pg-boss** (Postgres-backed) | **Default for Persimmon.** Queue lives in the same DB as the app. Zero extra infra. Handles scheduling, retries, cron. | Free (uses existing Postgres) | Low |
| **Inngest** | Event-driven fan-out, step functions across external events, want a managed UI. | Free tier generous; paid above volume | Low |
| **trigger.dev v3** | SDK-first DX, managed dashboard, long-running steps as first-class. | Free tier; paid above volume | Low |
| **Raw `setInterval` in a worker** | Single-tenant, simple polling loops with zero fan-out. | Free | You own retries, idempotency, observability |

**Pick pg-boss by default.** Move off it only when you need multi-region fan-out, external event orchestration, or cron-as-a-service with a UI.

---

## 2. Persimmon Pipeline Shape

From Piccino — extrapolate for every client doc pipeline.

```
Process.status enum:
  UPLOADING → UPLOADED → INDEXING → INDEXED → ANALYZING → ANALYZED
             → GENERATING_BRIEF → BRIEF_READY
                              ↘ ERROR (from any stage)
```

Each stage:
- Owned by one job type in the queue.
- Writes its output to DB and advances `Process.status` only on success.
- Never touches the previous stage's output.
- If rerun, short-circuits when output already exists.

The state machine is the contract. Add a column `Process.statusMessage` for human-readable context and `Process.failedStage` for errors.

### Prisma schema

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
  id             String        @id @default(uuid())
  userId         String
  status         ProcessStatus @default(UPLOADING)
  statusMessage  String?
  failedStage    String?
  progressTotal  Int?          // e.g., total pages to index
  progressDone   Int?          // e.g., pages indexed
  lastHeartbeat  DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  // relations...
}
```

---

## 3. pg-boss Setup (Persimmon Default)

### Install

```bash
npm i pg-boss
```

### Initialize once (schema migration)

```ts
// src/lib/jobs/boss.ts
import PgBoss from "pg-boss";

let bossPromise: Promise<PgBoss> | null = null;

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      // pg-boss creates its own schema "pgboss" — safe to coexist with Prisma.
      schema: "pgboss",
      retryLimit: 3,
      retryDelay: 60, // seconds; pg-boss applies exponential backoff on top.
      retryBackoff: true,
      expireInHours: 24,
      archiveCompletedAfterSeconds: 7 * 24 * 3600,
      deleteAfterDays: 30,
    });
    boss.on("error", (e) => console.error("[pg-boss]", e));
    bossPromise = boss.start().then(() => boss);
  }
  return bossPromise;
}

// Queue names — one per pipeline stage.
export const QUEUES = {
  INDEX_PROCESS: "index-process",
  ANALYZE_PROCESS: "analyze-process",
  GENERATE_BRIEF: "generate-brief",
} as const;
```

First run creates the `pgboss` schema automatically. Commit this.

---

## 4. Separate Railway Worker Service

The web service and the worker service share the repo and the DB, but run different commands. On Railway:

1. In the project, click **+ New → GitHub Repo** pointing to the same repo.
2. Name it `<client>-worker`.
3. **Settings → Deploy → Start command**: `npx tsx src/workers/index.ts`
4. **Settings → Build → Build command**: `npx prisma generate`
5. Reference the same env vars as the web service.
6. Set `numReplicas = 1` in `railway.toml` for this service — queue workers should not race for the same jobs without a locking strategy (pg-boss handles this, but keep it simple).

### Worker entrypoint

```ts
// src/workers/index.ts
import { getBoss, QUEUES } from "@/lib/jobs/boss";
import { handleIndexProcess } from "./handlers/index-process";
import { handleAnalyzeProcess } from "./handlers/analyze-process";
import { handleGenerateBrief } from "./handlers/generate-brief";

async function main(): Promise<void> {
  const boss = await getBoss();

  await boss.work(QUEUES.INDEX_PROCESS, { teamSize: 2, teamConcurrency: 1 }, handleIndexProcess);
  await boss.work(QUEUES.ANALYZE_PROCESS, { teamSize: 2, teamConcurrency: 1 }, handleAnalyzeProcess);
  await boss.work(QUEUES.GENERATE_BRIEF, { teamSize: 1, teamConcurrency: 1 }, handleGenerateBrief);

  console.log("[worker] started. listening on", Object.values(QUEUES).join(", "));

  // Graceful shutdown — drain in-flight jobs.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received. draining...`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    console.log("[worker] drained. exit.");
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
```

---

## 5. Job Handler Skeleton — Idempotent + Resumable

This is the template every handler follows. The pattern enforces idempotency and resumability.

```ts
// src/workers/handlers/index-process.ts
import type PgBoss from "pg-boss";
import { db } from "@/lib/db";
import { classifyPage } from "@/lib/ai/claude";
import { getBoss, QUEUES } from "@/lib/jobs/boss";

type IndexJobData = { processId: string };

const IDEMPOTENCY_PREFIX = "index-process";

function idempotencyKey(processId: string, pageNumber: number): string {
  return `${IDEMPOTENCY_PREFIX}:${processId}:${pageNumber}`;
}

export async function handleIndexProcess(
  jobs: PgBoss.Job<IndexJobData>[]
): Promise<void> {
  // pg-boss v10 delivers jobs in batches when teamSize > 1. Handle them serially.
  for (const job of jobs) {
    const { processId } = job.data;
    const jobId = job.id;
    await processOne({ jobId, processId });
  }
}

async function processOne({
  jobId,
  processId,
}: {
  jobId: string;
  processId: string;
}): Promise<void> {
  const log = (msg: string, extra?: Record<string, unknown>): void =>
    console.log(
      JSON.stringify({ jobId, processId, stage: "index", msg, ...extra })
    );

  const proc = await db.process.findUniqueOrThrow({ where: { id: processId } });

  // Resumability: short-circuit if already past this stage.
  if (
    proc.status === "INDEXED" ||
    proc.status === "ANALYZING" ||
    proc.status === "ANALYZED" ||
    proc.status === "GENERATING_BRIEF" ||
    proc.status === "BRIEF_READY"
  ) {
    log("already past INDEXING — skipping", { status: proc.status });
    await enqueueNext(processId, proc.status);
    return;
  }

  await db.process.update({
    where: { id: processId },
    data: { status: "INDEXING", statusMessage: "Splitting PDF...", failedStage: null },
  });

  const pages = await loadPageList(processId); // returns [{ number, key }]
  await db.process.update({
    where: { id: processId },
    data: { progressTotal: pages.length, progressDone: 0 },
  });

  for (const page of pages) {
    const key = idempotencyKey(processId, page.number);

    // Resumability per page: skip if already classified.
    const existing = await db.processDocument.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      log("page already indexed — skipping", { page: page.number });
      await bumpProgress(processId);
      continue;
    }

    // Heartbeat — lets us detect stuck jobs.
    await db.process.update({
      where: { id: processId },
      data: { lastHeartbeat: new Date(), statusMessage: `Classifying page ${page.number}...` },
    });

    const result = await withRetry(() => classifyPage(page), {
      retries: 3,
      baseMs: 1000,
      maxMs: 16_000,
    });

    await db.processDocument.create({
      data: {
        processId,
        pageNumber: page.number,
        classification: result.classification,
        summary: result.summary,
        idempotencyKey: key,
      },
    });

    await bumpProgress(processId);
  }

  await db.process.update({
    where: { id: processId },
    data: { status: "INDEXED", statusMessage: "Indexing complete" },
  });
  log("INDEXED");

  // Chain to next stage.
  const boss = await getBoss();
  await boss.send(QUEUES.ANALYZE_PROCESS, { processId });
}

async function bumpProgress(processId: string): Promise<void> {
  await db.process.update({
    where: { id: processId },
    data: { progressDone: { increment: 1 }, lastHeartbeat: new Date() },
  });
}

async function enqueueNext(processId: string, status: string): Promise<void> {
  const boss = await getBoss();
  if (status === "INDEXED") await boss.send(QUEUES.ANALYZE_PROCESS, { processId });
  if (status === "ANALYZED") await boss.send(QUEUES.GENERATE_BRIEF, { processId });
  // ... etc
}

async function loadPageList(_processId: string): Promise<{ number: number; key: string }[]> {
  // implementation — list files, split PDF by page, etc.
  return [];
}

// Exponential backoff retry — wrap every flaky external call.
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs: number; maxMs: number }
): Promise<T> {
  let attempt = 0;
  let delay = opts.baseMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt > opts.retries) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 4, opts.maxMs);
    }
  }
}
```

### Unique constraint for idempotency

```prisma
model ProcessDocument {
  id              String @id @default(uuid())
  processId       String
  pageNumber      Int
  classification  String
  summary         String?
  idempotencyKey  String @unique  // <-- enforce idempotency at DB level
  createdAt       DateTime @default(now())
}
```

The `@unique` is load-bearing. Even if two workers race, only one insert wins.

---

## 6. Enqueuing from a Server Action

When the user hits "Start analysis", the Server Action enqueues the first stage.

```ts
// src/lib/process-actions.ts
"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBoss, QUEUES } from "@/lib/jobs/boss";

const StartSchema = z.object({ processId: z.string().uuid() });

export async function startProcessing(input: z.infer<typeof StartSchema>): Promise<void> {
  const parsed = StartSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthenticated");

  const proc = await db.process.findFirstOrThrow({
    where: { id: parsed.processId, userId: session.user.id },
  });
  if (proc.status !== "UPLOADED") throw new Error(`Cannot start from ${proc.status}`);

  const boss = await getBoss();
  await boss.send(QUEUES.INDEX_PROCESS, { processId: proc.id }, {
    // pg-boss singleton prevents double-enqueue within the window.
    singletonKey: `index:${proc.id}`,
    singletonSeconds: 3600,
  });
}
```

`singletonKey` prevents the user from spamming the button and enqueueing duplicate work.

---

## 7. Progress Reporting to the UI

The client polls `Process.status + progressDone/progressTotal` every 2-5s. Later, upgrade to SSE (`/api/processes/[id]/stream`) for push updates — but polling first. Ship it before optimizing.

```tsx
"use client";
import { useEffect, useState } from "react";

export function ProcessStatusBadge({ processId }: { processId: string }) {
  const [state, setState] = useState<{ status: string; done: number; total: number } | null>(null);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      const res = await fetch(`/api/processes/${processId}/status`);
      if (res.ok) setState(await res.json());
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [processId]);

  if (!state) return null;
  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  return <div>{state.status} — {pct}%</div>;
}
```

---

## 8. Stuck-Job Detection

A worker can die mid-job (OOM, SIGKILL, Railway deploy). pg-boss will re-deliver eventually, but you want faster detection.

### Heartbeat

Every handler updates `process.lastHeartbeat` at least every 30s. Add a cron check (pg-boss supports cron):

```ts
// src/workers/index.ts (in main())
await boss.schedule("stuck-job-check", "*/5 * * * *"); // every 5 min
await boss.work("stuck-job-check", async () => {
  const stuck = await db.process.findMany({
    where: {
      status: { in: ["INDEXING", "ANALYZING", "GENERATING_BRIEF"] },
      lastHeartbeat: { lt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 min stale
    },
  });
  for (const p of stuck) {
    console.warn(JSON.stringify({ msg: "stuck job", processId: p.id, status: p.status }));
    // Requeue the appropriate stage — resumability makes this safe.
    const boss = await getBoss();
    if (p.status === "INDEXING") await boss.send(QUEUES.INDEX_PROCESS, { processId: p.id });
    if (p.status === "ANALYZING") await boss.send(QUEUES.ANALYZE_PROCESS, { processId: p.id });
    if (p.status === "GENERATING_BRIEF") await boss.send(QUEUES.GENERATE_BRIEF, { processId: p.id });
  }
});
```

Because handlers are resumable, requeuing is safe — completed pages short-circuit, only the unfinished work runs.

---

## 9. Poison-Pill Handling

A job that fails every retry must land in a dead-letter state, not loop forever burning Claude credits.

pg-boss default: after `retryLimit` (3) failures, the job moves to `failed` state. Listen for failures:

```ts
await boss.onComplete(QUEUES.INDEX_PROCESS, async (job) => {
  if (job.data.state === "failed") {
    const processId = job.data.request?.data?.processId;
    if (processId) {
      await db.process.update({
        where: { id: processId },
        data: {
          status: "ERROR",
          failedStage: "INDEXING",
          statusMessage: String(job.data.response ?? "unknown error"),
        },
      });
    }
  }
});
```

Surface `ERROR` + `failedStage` + `statusMessage` in the UI. Offer a "Retry" button that re-enqueues at the failed stage.

---

## 10. Graceful Shutdown on SIGTERM

Railway sends SIGTERM ~30s before killing the container on deploys. `boss.stop({ graceful: true })` waits for in-flight jobs to finish (up to the timeout) before quitting.

Inside handlers, guard long Claude calls with the shutdown signal if you care about sub-30s precision — otherwise the 30s drain covers most cases.

---

## 11. Observability — Structured Logs

Every log line from a handler includes `jobId` and `processId` (and `pipeline`/`stage`). One line, one JSON object. Railway's log viewer lets you filter by substring, so consistency matters.

```ts
const log = (msg: string, extra?: Record<string, unknown>): void =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), jobId, processId, stage: "index", msg, ...extra }));
```

Never log:
- Full document content (PII risk).
- API keys.
- Raw prompts (prompt-injection attack surface in logs).

---

## 12. Troubleshooting

### Job runs twice
- Idempotency key missing or not `@unique` — add it. The DB constraint is the safety net.

### Worker dies silently, no logs
- Probably an unhandled promise rejection. Add `process.on("unhandledRejection", e => { console.error(e); process.exit(1); })` so Railway restarts it.

### Jobs pile up, worker idle
- Worker service is down. Check `railway status` on the worker service. If auto-deploy stopped, see `railway-deploy` skill §10 (serviceConnect drift).

### Claude 529 overloaded retries forever
- The retry wrapper is retrying too aggressively. Cap at 3 retries with exponential backoff. Let pg-boss handle the outer retry (1 → 4 → 16s inside, then pg-boss adds another 3 attempts).

### `progressTotal` stays at 0
- Set it BEFORE the loop starts. A user polling the page sees 0/0 and assumes it's stuck.

### Two workers pick up the same job
- `teamSize` > 1 with no locking — pg-boss does lock correctly, but custom logic (e.g., updating `status` before `findOrCreate`) can still race. Wrap the claim in a transaction: `UPDATE process SET status='INDEXING' WHERE id=$1 AND status='UPLOADED' RETURNING *`. If zero rows, another worker claimed it.

### Jobs finish but UI never updates
- Client is polling a cached endpoint. Add `export const dynamic = "force-dynamic"` and `Cache-Control: no-store`.

### Prisma connection exhaustion on the worker
- Worker opens a new Prisma client per job. Use the shared `src/lib/db.ts` singleton — one `PrismaClient` per process.

---

## 13. Checklist

- [ ] Queue choice is pg-boss (or documented override with reason in ADR).
- [ ] Worker runs as a separate Railway service with `numReplicas = 1`.
- [ ] `Process.status` enum mirrors the pipeline exactly.
- [ ] Every handler: short-circuit if status already past, update status on success, never on failure.
- [ ] Idempotency key on every persisted artifact (unique DB constraint).
- [ ] `withRetry` wraps every external call (Claude, S3, etc.).
- [ ] Heartbeat + stuck-job cron.
- [ ] Dead-letter handler writes `ERROR` + `failedStage`.
- [ ] Graceful shutdown on SIGTERM.
- [ ] Structured logs with `jobId` + `processId` on every line.
- [ ] UI polls status every 2-5s (or uses SSE).
- [ ] `singletonKey` on enqueue prevents duplicate fan-out.
