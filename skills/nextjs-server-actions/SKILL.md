---
name: nextjs-server-actions
description: Next.js 16 Server Actions patterns for the Persimmon stack. Use when writing form mutations, "use server" functions, revalidating cached data, building progressive-enhancement forms, implementing optimistic UI with useOptimistic, or handling action errors. Covers input validation with Zod, typed result shapes, revalidatePath/revalidateTag, redirects, and the `dynamic = "force-dynamic"` rule for pages that read the DB or auth at request time.
---

# Next.js 16 Server Actions — Persimmon Patterns

## Core Contract

Every Server Action in a Persimmon project MUST satisfy all of these:

1. Marked `"use server"` — either at the top of a `*.ts` file (all exports become actions) or inline inside an async function inside a Server Component.
2. Input is validated with Zod before any DB call. Never trust raw `FormData`.
3. Returns a discriminated-union result shape. Never throws across the boundary.
4. Calls `revalidatePath` or `revalidateTag` after any mutation that changes rendered data.
5. On success that changes the user's context (create → detail page), calls `redirect()` AFTER revalidation.
6. Uses the shared Prisma client from `src/lib/db.ts`. Never instantiates `PrismaClient` locally.
7. Never logs PII, document contents, or secrets.

## Return Shape (Load-Bearing)

Every action returns this exact shape:

```ts
// src/lib/action-result.ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const actionOk = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const actionErr = (
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> => ({ ok: false, error, fieldErrors });
```

**Why a union, not throws**: thrown errors in Server Actions surface as opaque 500s on the client, lose field-level detail, and cannot be styled. A typed union makes the caller exhaustively handle both branches.

## File Placement

```
src/
  lib/
    db.ts                       # Prisma singleton
    action-result.ts            # ActionResult<T>
    <feature>-actions.ts        # "use server" — exports one action per file or grouped by feature
  app/
    <feature>/
      page.tsx                  # Server Component that renders the form
      <feature>-form.tsx        # Client Component that calls the action
```

Rule: if the file starts with `"use server"`, it contains ONLY actions. No helpers, no constants, no types that aren't inputs/outputs. Put helpers in a sibling `*-helpers.ts` without the directive.

## Full Example — Create a Process

### 1. The action (server)

```ts
// src/lib/process-actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

const CreateProcessInput = z.object({
  title: z.string().trim().min(3).max(200),
  clientName: z.string().trim().min(1).max(200),
  matterType: z.enum(["trabalhista", "civil", "administrativo", "bancario"]),
});

export async function createProcess(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return actionErr("Não autenticado.");

  const parsed = CreateProcessInput.safeParse({
    title: formData.get("title"),
    clientName: formData.get("clientName"),
    matterType: formData.get("matterType"),
  });

  if (!parsed.success) {
    return actionErr("Dados inválidos.", parsed.error.flatten().fieldErrors);
  }

  try {
    const proc = await db.process.create({
      data: {
        title: parsed.data.title,
        clientName: parsed.data.clientName,
        matterType: parsed.data.matterType,
        ownerId: session.user.id,
        status: "UPLOADING",
      },
      select: { id: true },
    });

    revalidatePath("/processes");
    // No redirect here — let the form decide based on the returned result.
    return actionOk({ id: proc.id });
  } catch (err) {
    // Redact — never log form contents or user id.
    console.error("[createProcess] db error", { code: (err as { code?: string }).code });
    return actionErr("Não foi possível criar o processo.");
  }
}
```

### 2. The form (client)

```tsx
// src/app/processes/new/new-process-form.tsx
"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createProcess } from "@/lib/process-actions";

export function NewProcessForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createProcess, null);

  useEffect(() => {
    if (state?.ok) router.push(`/processes/${state.data.id}`);
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="text-sm">Título</span>
        <input name="title" required minLength={3} maxLength={200} className="border" />
        {state?.ok === false && state.fieldErrors?.title && (
          <p className="text-sm text-oxblood">{state.fieldErrors.title[0]}</p>
        )}
      </label>

      <label className="block">
        <span className="text-sm">Cliente</span>
        <input name="clientName" required className="border" />
      </label>

      <label className="block">
        <span className="text-sm">Tipo</span>
        <select name="matterType" required>
          <option value="trabalhista">Trabalhista</option>
          <option value="civil">Civil</option>
          <option value="administrativo">Administrativo</option>
          <option value="bancario">Bancário</option>
        </select>
      </label>

      {state?.ok === false && !state.fieldErrors && (
        <p className="text-sm text-oxblood">{state.error}</p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Criando…" : "Criar processo"}
      </button>
    </form>
  );
}
```

### 3. The page (server)

```tsx
// src/app/processes/new/page.tsx
import { NewProcessForm } from "./new-process-form";

// MANDATORY: this page renders auth-aware UI. Without force-dynamic,
// Next 16 tries to prerender it at build time and the build fails.
export const dynamic = "force-dynamic";

export default function NewProcessPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl">Novo processo</h1>
      <NewProcessForm />
    </main>
  );
}
```

## `dynamic = "force-dynamic"` — When to Add It

Add it to any page that, at request time:

- Calls `auth()` from NextAuth
- Reads from Prisma (`db.*`)
- Reads `cookies()` or `headers()`
- Reads `searchParams` and branches on it to fetch different data

Do NOT add it to purely static marketing pages, `/login`, or `/not-found`.

```tsx
// Every protected page in a Persimmon project
export const dynamic = "force-dynamic";
```

Skipping this on a DB-reading page breaks the Railway build — the build container has no DB network path. You'll see `PrismaClientInitializationError: Can't reach database server at postgres.railway.internal`.

## Revalidation Rules

| After this mutation | Call this |
|---|---|
| Created a `Process` | `revalidatePath("/processes")` |
| Updated a specific `Process` | `revalidatePath("/processes/[id]", "page")` + `revalidatePath("/processes")` |
| Changed a user-level setting | `revalidateTag("user:" + userId)` and tag fetches with `{ next: { tags: [...] } }` |
| Deleted anything in a list | `revalidatePath("/<list-route>")` then `redirect` away |

**Tags over paths** when you have many routes reading the same data. **Paths over tags** when revalidation is local to one route.

## Redirect Discipline

- `redirect()` throws internally — it MUST be the last statement in the happy path, after revalidation.
- Never redirect from an action based on untrusted input (`?next=<url>`) without validating against an allowlist.
- For create flows, prefer returning `{ok:true, data:{id}}` and letting the client `router.push` — this lets the form show a brief success state.
- For destructive flows (delete), redirect from the action directly.

```ts
// After a destructive action:
await db.process.delete({ where: { id, ownerId: session.user.id } });
revalidatePath("/processes");
redirect("/processes");
```

## Optimistic UI with `useOptimistic`

Use when the server is slow and the mutation is unlikely to fail (toggling a flag, reordering, small edits).

```tsx
"use client";
import { useOptimistic, startTransition } from "react";
import { togglePin } from "@/lib/process-actions";

export function PinToggle({ id, pinned }: { id: string; pinned: boolean }) {
  const [optimisticPinned, setOptimisticPinned] = useOptimistic(pinned);

  return (
    <button
      onClick={() => {
        startTransition(async () => {
          setOptimisticPinned(!optimisticPinned);
          const res = await togglePin(id);
          if (!res.ok) {
            // Revalidation will reconcile; optionally toast
          }
        });
      }}
    >
      {optimisticPinned ? "Desafixar" : "Fixar"}
    </button>
  );
}
```

Do NOT use `useOptimistic` for destructive actions — the flash of "success" followed by a bounce-back is worse than a pending spinner.

## Progressive Enhancement

Forms that call Server Actions via `action={fn}` work without JS. Keep this working:

- Use native `<input required minLength maxLength>` attributes as a first line of defense.
- Return `{ok:false}` with `fieldErrors` so the server-rendered page can show them after a POST-redirect-GET cycle.
- Don't put business logic in `onSubmit` — put it in the action.

## Anti-Patterns

### Throwing across the boundary

```ts
// WRONG — client gets an opaque 500, no field errors, no message
export async function createProcess(formData: FormData) {
  const data = schema.parse(formData); // throws ZodError
  return db.process.create({ data });  // throws PrismaError
}
```

Use `safeParse` and a try/catch around DB calls. Return `actionErr(...)`.

### Unvalidated input

```ts
// WRONG — trusting FormData shape
const title = formData.get("title") as string;  // could be null, File, wrong shape
```

Always `safeParse` through Zod. See the `zod-boundary-validation` skill.

### Logging PII

```ts
// WRONG — leaks client name, titles, emails into logs
console.error("createProcess failed", { formData, session });
```

Log only error codes, action name, and redacted IDs. Never the payload.

### Mutating without revalidation

```ts
// WRONG — UI shows stale data until the user hard-refreshes
await db.process.create({ data });
return actionOk({ id });
// missing revalidatePath("/processes")
```

### Instantiating Prisma inside the action

```ts
// WRONG — creates connection leak and bypasses the shared singleton
const prisma = new PrismaClient();
```

Always `import { db } from "@/lib/db"`.

### Using an API route instead of a Server Action for a form

For Persimmon projects, mutations go through Server Actions. API routes are reserved for:
- Webhook receivers
- Background-job triggers (QStash, cron)
- SSE / streaming endpoints
- Third-party OAuth callbacks

## Checklist Before Committing a New Action

- [ ] File starts with `"use server"` and contains only actions
- [ ] Input validated with Zod `safeParse`
- [ ] Returns `ActionResult<T>` — no throws
- [ ] Auth checked via `auth()` at the top
- [ ] Uses `db` from `@/lib/db`
- [ ] Calls `revalidatePath` or `revalidateTag` after mutation
- [ ] No PII / payload content in `console.error`
- [ ] Corresponding page has `export const dynamic = "force-dynamic"` if it reads DB/auth
- [ ] Form uses `useActionState` and renders `fieldErrors`

## Cross-References

- **zod-boundary-validation** — input schema patterns, `safeParse` discipline
- **prisma-pgvector** — the `db` client this skill assumes
- **nextauth-credentials** — the `auth()` call referenced above
- **typescript-strict-patterns** — `ActionResult<T>` discriminated union, `satisfies`
