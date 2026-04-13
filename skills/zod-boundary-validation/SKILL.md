---
name: zod-boundary-validation
description: Zod validation at every trust boundary on the Persimmon stack. Use when validating Server Action inputs, API route bodies, webhook payloads, search params, environment variables, or any untrusted data crossing into the app. Covers `safeParse` over `parse`, discriminated unions for polymorphic payloads, branded types for IDs, `.transform` for coercion, `@t3-oss/env-nextjs` for typed env, and anti-patterns (throwing in handlers, trusting `request.json()`, using `unknown` without narrowing).
---

# Zod Boundary Validation — Persimmon Patterns

**The rule**: every byte that enters the process from outside (form, request body, webhook, env, URL params, Claude response) passes through a Zod schema before any other code touches it.

Trust boundaries on the Persimmon stack:

1. Server Action inputs (`FormData` or typed args)
2. API route bodies (`request.json()`)
3. Webhook payloads (QStash, Stripe, Anthropic callbacks)
4. Environment variables (`process.env`)
5. URL search params (`searchParams` in page props)
6. LLM JSON outputs (Claude's structured output is not a trust boundary from a security angle, but the schema still needs to be strict because models hallucinate fields)
7. File metadata after presigned upload (client-provided filename, size, content-type)

## `safeParse` > `parse` in Handlers — Always

```ts
// WRONG — throws ZodError; surfaces as opaque 500 with no field detail
const data = MySchema.parse(input);

// RIGHT — returns a discriminated union; you handle both branches
const parsed = MySchema.safeParse(input);
if (!parsed.success) {
  return { ok: false, error: "Dados inválidos.", fieldErrors: parsed.error.flatten().fieldErrors };
}
const data = parsed.data;
```

`parse` is acceptable in two places only:

- **Pipeline-internal code** where a ZodError is a programmer bug (you just built the object).
- **Env loading** where a missing env IS a fail-fast crash.

Everywhere else: `safeParse` + typed error return.

## Server Action Pattern

```ts
// src/lib/process-actions.ts
"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

const CreateProcessInput = z.object({
  title: z.string().trim().min(3).max(200),
  clientName: z.string().trim().min(1).max(200),
  matterType: z.enum(["trabalhista", "civil", "administrativo", "bancario"]),
  notes: z.string().max(2000).optional(),
});

type CreateProcessInputT = z.infer<typeof CreateProcessInput>;

export async function createProcess(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return actionErr("Não autenticado.");

  const parsed = CreateProcessInput.safeParse({
    title: fd.get("title"),
    clientName: fd.get("clientName"),
    matterType: fd.get("matterType"),
    notes: fd.get("notes") || undefined,
  });

  if (!parsed.success) {
    return actionErr("Dados inválidos.", parsed.error.flatten().fieldErrors);
  }

  // parsed.data is fully typed as CreateProcessInputT
  const proc = await db.process.create({
    data: { ...parsed.data, ownerId: session.user.id, status: "UPLOADING" },
    select: { id: true },
  });

  return actionOk({ id: proc.id });
}
```

**FormData quirks to remember**:

- `fd.get("x")` returns `FormDataEntryValue | null` (string | File | null).
- Empty inputs return `""`, not `null` — use `.trim().min(1)` to reject.
- Checkboxes are absent when unchecked — `fd.get("flag") === "on"` is the idiomatic coerce.
- Files: use `.instanceof(File)` in Zod, or check `typeof x === "object"`.

## API Route Pattern

```ts
// src/app/api/webhooks/indexing-complete/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

const IndexingCompletePayload = z.object({
  processId: z.string().cuid(),
  pageCount: z.number().int().positive(),
  classifications: z.array(
    z.object({
      pageIndex: z.number().int().nonnegative(),
      docType: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
  ),
  finishedAt: z.string().datetime(),
});

export async function POST(request: Request) {
  // Signature verification FIRST — before even reading the body.
  const sig = request.headers.get("x-persimmon-signature");
  if (!sig || !(await verifySignature(request, sig))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Read + validate — never trust request.json() alone.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = IndexingCompletePayload.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // parsed.data is now fully typed and safe.
  await processIndexingResult(parsed.data);
  return NextResponse.json({ ok: true });
}
```

**Never** do `const { processId, pageCount } = await request.json()` — that's `any` masquerading as structured data.

## Environment Variables with `@t3-oss/env-nextjs`

```ts
// src/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
    OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  emptyStringAsUndefined: true,
});
```

Use `env.DATABASE_URL` everywhere instead of `process.env.DATABASE_URL`. Benefits:

- Missing env = crash at import time, not at first request.
- Typos are compile-time errors.
- Client-bundled secrets are impossible (server vars throw if accessed from client).
- `emptyStringAsUndefined` rescues you from `DATABASE_URL=""` silently passing.

## Discriminated Unions for Polymorphic Payloads

When a single endpoint accepts different shapes, use a discriminated union — don't nest optionals.

```ts
// WRONG — type is wide, nothing is guaranteed
const Schema = z.object({
  kind: z.string(),
  a: z.number().optional(),
  b: z.string().optional(),
});

// RIGHT — each branch is tight
const Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("foo"), a: z.number() }),
  z.object({ kind: z.literal("bar"), b: z.string() }),
]);

type SchemaT = z.infer<typeof Schema>;
// SchemaT = { kind: "foo"; a: number } | { kind: "bar"; b: string }

// Consumer gets exhaustiveness checking:
function handle(x: SchemaT) {
  switch (x.kind) {
    case "foo": return x.a;
    case "bar": return x.b;
    // no default needed — TS errors if a new variant is added
  }
}
```

Applies to: webhook event types, Claude tool-use responses, chart configs, multi-step form states.

## Branded Types for IDs

Prevents passing a `UserId` where a `ProcessId` is expected:

```ts
// src/types/brand.ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type ProcessId = Brand<string, "ProcessId">;
export type ChunkId = Brand<string, "ChunkId">;

export const UserId = (s: string): UserId => s as UserId;
export const ProcessId = (s: string): ProcessId => s as ProcessId;
```

Zod version — parse directly into branded types:

```ts
const ProcessIdSchema = z.string().cuid().brand<"ProcessId">();
type ProcessId = z.infer<typeof ProcessIdSchema>;

// Now:
function getProcess(id: ProcessId) { /* ... */ }
getProcess("abc123"); // ERROR — string isn't ProcessId
getProcess(ProcessIdSchema.parse("abc123")); // OK
```

See `typescript-strict-patterns` for the manual brand form.

## `.transform` for Coercion at the Boundary

Don't mix validation and business logic — but DO use `.transform` for format-level coercion:

```ts
const Input = z.object({
  email: z.string().trim().toLowerCase().email(),
  birthDate: z.string().transform((s, ctx) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid date" });
      return z.NEVER;
    }
    return d;
  }),
  tags: z.string().transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
  pageCount: z.coerce.number().int().positive(), // coerce string→number at form boundary
});
```

Rules:

- Use `.trim()` on every free-text string. Silent leading/trailing whitespace is a forever bug source.
- Use `.toLowerCase()` on emails before storage AND in the lookup query.
- Use `z.coerce.number()` for form inputs (FormData is always string).
- Use `.transform` + `ctx.addIssue` + `z.NEVER` for validations that also parse.

## Search Params

```tsx
// src/app/processes/page.tsx
import { z } from "zod";

const SearchParams = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(["UPLOADING", "INDEXED", "ERROR"]).optional(),
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = SearchParams.safeParse(raw);
  const { q, page, status } = parsed.success ? parsed.data : { q: undefined, page: 1, status: undefined };
  // ...
}
```

Never pass `searchParams` straight to Prisma `where`. That's SSRF-adjacent — users can inject filter clauses if your ORM query builder is loose.

## LLM Output Validation

Claude's structured output (tool use / JSON mode) should ALWAYS be parsed before use:

```ts
const ClassificationSchema = z.object({
  docType: z.enum([
    "peticao_inicial",
    "sentenca",
    "recurso",
    "intimacao",
    "demonstrativo_debito",
    "outro",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
});

const raw = await claude.complete({ /* ... */ });
const parsed = ClassificationSchema.safeParse(JSON.parse(raw.text));
if (!parsed.success) {
  // Retry with a stricter prompt OR fall back to "outro" with low confidence.
  return { docType: "outro" as const, confidence: 0, reasoning: "parse failed" };
}
```

Models drift. Fields disappear. Enums grow. Schema guards you against silent breakage.

## File Upload Metadata

After a client completes a presigned PUT to Tigris, they POST metadata back. That metadata is UNTRUSTED:

```ts
const FileMetadataInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  byteSize: z.number().int().positive().max(500 * 1024 * 1024), // 500MB cap
  contentType: z.enum(["application/pdf"]),
  storageKey: z.string().regex(/^uploads\/[a-z0-9-]+\/[a-z0-9-]+\.pdf$/),
});
```

**Always validate `storageKey`** against a regex that matches exactly your presigned-URL format. Otherwise a malicious client can point the row at someone else's file.

## Anti-Patterns

### `.parse()` inside a request handler

Throws ZodError, Next wraps it as a 500 with no field detail. Zero user value. Always `.safeParse`.

### Trusting `request.json()` directly

```ts
// WRONG
const { userId } = await request.json();
await db.user.delete({ where: { id: userId } });
```

`userId` is `any`. Could be an object, could be SQL-injection bait (Prisma handles that, but never rely on it). Validate.

### Using `z.any()` or `z.unknown()` without narrowing

```ts
// WRONG — just admits you gave up
metadata: z.any(),
```

Either describe the shape (`z.record(z.string())`, `z.object({...})`, discriminated union) or — if truly open-ended — accept `z.unknown()` but narrow immediately after with a separate sub-schema before use.

### Importing schemas across the client/server boundary casually

Schemas are fine on the client too, but anything referencing server-only constants (env, db enums) will leak. Keep input schemas in the action file or a `schemas.ts` with no server imports.

### Re-declaring the same schema in multiple places

Single source of truth per concept. Export from one place, `z.infer` the type there, import both.

### Forgetting `.trim()` on user strings

Half of "user already exists" bugs are a trailing space on the email. Always `.trim()`.

## Checklist Before Shipping a New Boundary

- [ ] Schema exists, exported, named
- [ ] Uses `safeParse` in the handler (unless it's env loading)
- [ ] Error branch returns typed result — never throws
- [ ] `.trim()` on free-text strings
- [ ] `.toLowerCase()` on emails
- [ ] `.max(...)` on all strings (DoS protection)
- [ ] `z.coerce` on numeric inputs from FormData / search params
- [ ] Discriminated union if polymorphic
- [ ] Enum not string for fixed vocabulary
- [ ] Webhook schemas validate signature BEFORE parsing body
- [ ] Field errors returned as `fieldErrors` from `.error.flatten()`

## Cross-References

- **nextjs-server-actions** — how the action boundary consumes these schemas
- **nextauth-credentials** — `authorize()` schema for login
- **prisma-pgvector** — validating embedding dim at the boundary
- **typescript-strict-patterns** — branded types via `.brand<...>()`
