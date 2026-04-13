---
name: pdf-page-classifier
description: Per-page PDF classification pipeline for Piccino's Indexer — extracts text, classifies each page via Claude Sonnet + tool-use, persists idempotently to ProcessDocument. Use when building the indexer stage of a new legal client, debugging slow/failed classification runs, adding a new document type, or making the pipeline resumable. Trigger keywords: indexer, page classifier, PDF parse, pdf-parse, pdfjs-dist, pdftoppm, page image fallback, ProcessDocument upsert, resumable, idempotent, concurrent pages.
---

# pdf-page-classifier

The `Indexer` pipeline: take a multi-page PDF of a Brazilian judicial process, classify each page by document type, and persist one `ProcessDocument` row per page. Idempotent, resumable, concurrent.

## Input / output

**Input**: `{ processId, pdfBuffer, source }`

**Output**: N `ProcessDocument` rows, one per PDF page, with:
- `pageNumber` (1-indexed)
- `documentType` (enum)
- `date` (nullable)
- `summary` (1–2 sentences, pt-BR)
- `confidence` (0–1)
- `extractionMethod` ("text" | "vision")

## Prisma model

```prisma
model ProcessDocument {
  id               String   @id @default(cuid())
  processId        String
  process          Process  @relation(fields: [processId], references: [id], onDelete: Cascade)
  pageNumber       Int
  documentType     DocumentType
  date             DateTime?
  summary          String
  confidence       Float
  extractionMethod ExtractionMethod
  rawText          String?  @db.Text
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([processId, pageNumber])
}

enum DocumentType {
  peticao_inicial
  contestacao
  replica
  sentenca
  acordao
  despacho
  intimacao
  demonstrativo_de_debito
  procuracao
  certidao
  other
}

enum ExtractionMethod { text vision }
```

The `@@unique([processId, pageNumber])` makes upserts safe — rerunning the pipeline skips completed pages.

## Pipeline stages

```
PDF → 1. Split into pages
    → 2. Try text extraction (pdfjs-dist or pdf-parse)
    → 3. If text < 40 chars, fallback to vision:
         pdftoppm (or pdf-to-img) → PNG → Claude vision
    → 4. Classify via Sonnet + tool-use (cached system prompt)
    → 5. Upsert ProcessDocument by (processId, pageNumber)
    → 6. Emit progress event to a queue/SSE
```

## File layout

```
src/lib/indexer/
  index.ts            # top-level runIndexer
  extract-text.ts     # pdfjs-based page text
  extract-image.ts    # pdftoppm fallback
  classify-page.ts    # Claude call
  concurrency.ts      # bounded parallelism helper
```

## Text extraction — `extract-text.ts`

Prefer `pdfjs-dist` over `pdf-parse` because pdf-parse dumps the entire doc at once. We need per-page text.

```ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type ExtractedPage = { pageNumber: number; text: string };

export async function extractPages(pdfBuffer: Buffer): Promise<ExtractedPage[]> {
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer), disableFontFace: true });
  const doc = await loadingTask.promise;
  const out: ExtractedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((it): it is TextItem => "str" in it)
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ pageNumber: i, text });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}
```

## Image fallback — `extract-image.ts`

When text is empty or < 40 chars, the page is a scan. Render it to PNG and send to Claude vision.

```ts
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function renderPageToPng(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "pdfpage-"));
  const pdfPath = join(dir, "in.pdf");
  const outPrefix = join(dir, "page");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(pdfPath, pdfBuffer);
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-r", "150",                    // 150 DPI is plenty for classification
        "-f", String(pageNumber),
        "-l", String(pageNumber),
        "-png",
        pdfPath,
        outPrefix,
      ];
      const p = spawn("pdftoppm", args);
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pdftoppm exit ${code}`))));
    });
    // pdftoppm outputs e.g. page-1.png; pad varies with page count.
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    const png = files.find((f) => f.endsWith(".png"));
    if (!png) throw new Error("pdftoppm produced no output");
    return await readFile(join(dir, png));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

`pdftoppm` is part of `poppler-utils`. Install on Railway with a Nixpacks config:

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["nodejs-20_x", "poppler_utils"]
```

## Classification — `classify-page.ts`

```ts
import { callClaude } from "@/lib/ai/claude";
import { pageClassifierPrompt, PAGE_CLASSIFIER_TOOL } from "@/lib/ai/prompts";
import { z } from "zod";

const ClassificationOut = z.object({
  documentType: z.enum([
    "peticao_inicial","contestacao","replica","sentenca","acordao","despacho",
    "intimacao","demonstrativo_de_debito","procuracao","certidao","other",
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  summary: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
});

export type PageClassification = z.infer<typeof ClassificationOut>;

export async function classifyTextPage(pageText: string): Promise<PageClassification> {
  const { system, messages } = pageClassifierPrompt(pageText);
  const { toolUses } = await callClaude({
    task: "classify-page",                        // -> sonnet
    system,                                        // cached (it's long + stable)
    messages,
    tools: [PAGE_CLASSIFIER_TOOL],
    toolChoice: { type: "tool", name: "emit_classification" },
    maxTokens: 800,
    label: "indexer:classify-text",
  });
  return ClassificationOut.parse(toolUses[0].input);
}

export async function classifyImagePage(pngBuffer: Buffer): Promise<PageClassification> {
  const b64 = pngBuffer.toString("base64");
  const { toolUses } = await callClaude({
    task: "classify-page",
    system: PAGE_CLASSIFIER_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
          { type: "text", text: "Classifique esta página escaneada." },
        ],
      },
    ],
    tools: [PAGE_CLASSIFIER_TOOL],
    toolChoice: { type: "tool", name: "emit_classification" },
    maxTokens: 800,
    label: "indexer:classify-image",
  });
  return ClassificationOut.parse(toolUses[0].input);
}
```

## Concurrency — `concurrency.ts`

```ts
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
```

`limit = 5` for Claude — safely under rate limits while keeping throughput high.

## Top-level — `index.ts`

```ts
import { db } from "@/lib/db";
import { extractPages } from "./extract-text";
import { renderPageToPng } from "./extract-image";
import { classifyTextPage, classifyImagePage } from "./classify-page";
import { pool } from "./concurrency";

const MIN_TEXT_CHARS = 40;
const PAGE_CONCURRENCY = 5;

export type IndexerProgress = { pageNumber: number; total: number; status: "done" | "skipped" | "error" };

export async function runIndexer(input: {
  processId: string;
  pdfBuffer: Buffer;
  onProgress?: (p: IndexerProgress) => void;
}) {
  const pages = await extractPages(input.pdfBuffer);

  // Idempotency: fetch already-classified page numbers.
  const existing = await db.processDocument.findMany({
    where: { processId: input.processId },
    select: { pageNumber: true },
  });
  const alreadyDone = new Set(existing.map((r) => r.pageNumber));

  await pool(pages, PAGE_CONCURRENCY, async (page) => {
    if (alreadyDone.has(page.pageNumber)) {
      input.onProgress?.({ pageNumber: page.pageNumber, total: pages.length, status: "skipped" });
      return;
    }

    try {
      let cls;
      let method: "text" | "vision";
      if (page.text.length >= MIN_TEXT_CHARS) {
        cls = await classifyTextPage(page.text);
        method = "text";
      } else {
        const png = await renderPageToPng(input.pdfBuffer, page.pageNumber);
        cls = await classifyImagePage(png);
        method = "vision";
      }

      await db.processDocument.upsert({
        where: { processId_pageNumber: { processId: input.processId, pageNumber: page.pageNumber } },
        create: {
          processId: input.processId,
          pageNumber: page.pageNumber,
          documentType: cls.documentType,
          date: cls.date ? new Date(cls.date) : null,
          summary: cls.summary,
          confidence: cls.confidence,
          extractionMethod: method,
          rawText: method === "text" ? page.text : null,
        },
        update: {
          documentType: cls.documentType,
          date: cls.date ? new Date(cls.date) : null,
          summary: cls.summary,
          confidence: cls.confidence,
          extractionMethod: method,
          rawText: method === "text" ? page.text : null,
        },
      });
      input.onProgress?.({ pageNumber: page.pageNumber, total: pages.length, status: "done" });
    } catch (err) {
      console.error(`[indexer] page ${page.pageNumber} failed`, err);
      input.onProgress?.({ pageNumber: page.pageNumber, total: pages.length, status: "error" });
      // do NOT throw — one bad page shouldn't kill the run; the page stays unclassified and will be retried.
    }
  });
}
```

## Resumability

Re-running the indexer on the same `processId`:
- Skips pages already in `ProcessDocument` (idempotent by `@@unique([processId, pageNumber])`).
- Failed pages (logged error, not written) are retried on next run.
- If you want to FORCE re-classification, delete the row first or add a `--force` flag that does `deleteMany` first.

## Background job wrapping

Run the indexer off the request thread:

```ts
// Server Action kicks off, returns immediately
"use server";
import { runIndexer } from "@/lib/indexer";

export async function startIndexing(processId: string) {
  const process = await db.process.findUniqueOrThrow({ where: { id: processId } });
  const pdf = await downloadFromS3(process.pdfKey);

  // On Railway: spawn a background task via the `/api/jobs/indexer` route
  // or a worker service; do NOT await here if the PDF is big.
  fetch(`${process.env.INTERNAL_URL}/api/jobs/indexer`, {
    method: "POST",
    body: JSON.stringify({ processId }),
    headers: { "x-internal-secret": process.env.INTERNAL_SECRET! },
  }).catch(console.error);

  return { started: true };
}
```

Progress goes to a Postgres `Job` table the UI polls, or an SSE stream.

## Checklist — production-ready indexer

- [ ] `pdfjs-dist` installed, `poppler_utils` in nixpacks
- [ ] `ProcessDocument` model with `@@unique([processId, pageNumber])`
- [ ] Prompt + tool schema in `prompts.ts`, cached via wrapper
- [ ] Zod validates classification output before upsert
- [ ] Concurrency capped at 5 Claude calls
- [ ] Per-page errors logged, not fatal
- [ ] Reruns skip already-classified pages
- [ ] Progress emitted to a persistent `Job` table
- [ ] Background execution — no long-running Server Action

## Performance / cost

| Item | Value |
|---|---|
| Sonnet per text page | ~$0.003 (500 input, 200 output tokens) |
| Sonnet per image page | ~$0.015 (2K image tokens + 200 output) |
| 100-page text PDF | ~$0.30 |
| 100-page scanned PDF | ~$1.50 |
| Cache savings on system prompt | ~75% on input after first call |
| Throughput (5 concurrent) | ~60 pages/min for text, ~20 pages/min for image |

## Anti-patterns

- Using `pdf-parse` for multi-page because its API is simpler — you lose per-page boundaries.
- Sending vision for every page to "be safe." You're paying 5x for no gain on born-digital PDFs.
- Skipping `@@unique([processId, pageNumber])` — two concurrent runs will duplicate rows.
- Parsing the classification output by regex. Use tool-use + Zod.
- Running 20 concurrent pages — 429s from Anthropic, and the wrapper's retry blows through budget.
- Putting `pdftoppm` in Dockerfile but not in nixpacks — Railway builds will look fine locally and fail in production.

## Related skills

- `anthropic-sdk-wrapper` — provides `callClaude` with retries, caching, cost logs.
- `prompt-library` — hosts `pageClassifierPrompt`, `PAGE_CLASSIFIER_TOOL`, `PAGE_CLASSIFIER_SYSTEM`.
- `portuguese-legal-prompting` — pt-BR register rules for the classifier's system prompt.
- `legal-brief-composer` — downstream consumer of `ProcessDocument` rows via the analyzer step.
