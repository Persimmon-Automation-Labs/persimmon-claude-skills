---
name: review-type-safety
description: TypeScript strict-mode audit for Persimmon stack. Checks tsconfig strictness, any leaks, non-null assertions, ts-ignore usage, missing return types, Zod validation at trust boundaries (Server Actions, API routes), and Prisma type usage. Triggers on "type safety review", "type audit", "strictness check", "pre-launch", "before shipping".
---

# Type-Safety Review — Persimmon Stack

Strict-mode TypeScript audit. Persimmon's rule: `strict: true`, `any` is banned unless justified, every trust boundary validated with Zod.

## Inputs

- `PROJECT_ROOT` — absolute path to repo root

## Procedure

### Section 1 — tsconfig

```bash
cat "$PROJECT_ROOT/tsconfig.json" | jq '.compilerOptions | {strict, noUncheckedIndexedAccess, noImplicitAny, noImplicitReturns, exactOptionalPropertyTypes, noUnusedLocals, noFallthroughCasesInSwitch}'
```

| Flag | Required | Severity |
|---|---|---|
| `strict: true` | yes | CRITICAL |
| `noUncheckedIndexedAccess: true` | yes | HIGH |
| `noImplicitReturns: true` | yes | MEDIUM |
| `noFallthroughCasesInSwitch: true` | yes | MEDIUM |
| `exactOptionalPropertyTypes: true` | recommended | LOW |

Then verify typecheck is clean:

```bash
cd "$PROJECT_ROOT" && npx tsc --noEmit 2>&1 | tee /tmp/tsc.log
```

Any error = FAIL. Count by file:
```bash
grep -E "^[^ ].*\.tsx?\(" /tmp/tsc.log | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

### Section 2 — `any` Leaks

```bash
grep -rn ": any\b\| as any\b\|any\[\]\|any>\|Record<string, any>\|Array<any>" "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" | grep -v "// reason:" | grep -v "node_modules"
```

Persimmon rule: zero `any` unless followed by `// reason: <why>` on the same line.

| Count | Verdict |
|---|---|
| 0 | PASS |
| 1–5 with `// reason:` on all | WARN |
| any without `// reason:` | FAIL |

**Remediation — narrow with Zod:**

```ts
// BAD
function handle(input: any) { return input.email.toLowerCase(); }
// GOOD
const Schema = z.object({ email: z.string().email() });
function handle(input: unknown) {
  const { email } = Schema.parse(input);
  return email.toLowerCase();
}
```

### Section 3 — Non-Null Assertions `!`

```bash
grep -rnE "[a-zA-Z0-9_\)\]]!\." "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" | grep -v "!=" | grep -v "!==" | grep -v "// reason:"
```

Replace with `invariant` so failures throw a named error rather than silent `undefined` propagation:

```ts
// src/lib/invariant.ts
export function invariant<T>(v: T | null | undefined, msg: string): asserts v is T {
  if (v == null) throw new Error(`Invariant: ${msg}`);
}

// usage
const user = await db.user.findUnique({ where: { id } });
invariant(user, `user not found: ${id}`);
user.email; // narrowed, no `!`
```

Every `!` without `// reason:` = HIGH.

### Section 4 — `@ts-ignore` / `@ts-expect-error`

```bash
grep -rnE "@ts-ignore|@ts-expect-error|@ts-nocheck" "$PROJECT_ROOT/src"
```

Rules:
- `@ts-nocheck` anywhere under `src/` = CRITICAL.
- `@ts-ignore` = FAIL; replace with `@ts-expect-error <reason>`.
- `@ts-expect-error` without a comment explaining why = WARN.
- `@ts-expect-error` with a reason + a linked ticket = PASS.

### Section 5 — Exported Function Return Types

Configure ESLint to enforce:

```js
// eslint.config.mjs
import tseslint from "typescript-eslint";
export default tseslint.config({
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": "error",
  },
});
```

Then:
```bash
cd "$PROJECT_ROOT" && npx eslint "src/**/*.{ts,tsx}" 2>&1 | tee /tmp/eslint.log
grep -c "explicit-module-boundary-types" /tmp/eslint.log
```

Any count > 0 = FAIL for affected files.

### Section 6 — Zod at Trust Boundaries

Every Server Action and API route must validate input with Zod before the first DB touch.

Find Server Actions:
```bash
grep -rln '"use server"' "$PROJECT_ROOT/src"
```

For each file, open and verify:
```bash
grep -nE "export (async )?function|\.safeParse|\.parse\(" "$PROJECT_ROOT/src/lib/process-actions.ts"
```

Rule: every exported `async function` must call `Schema.safeParse` (or `.parse`) on its input before any side effect.

API routes:
```bash
find "$PROJECT_ROOT/src/app/api" -name "route.ts" 2>/dev/null
```

Each `route.ts` POST/PUT/PATCH/DELETE handler must parse `await req.json()` with Zod.

**Remediation:**

```ts
// src/lib/process-actions.ts
"use server";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  fileIds: z.array(z.string().uuid()).min(1),
});

export async function createProcess(input: unknown) {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten() } as const;
  }
  const session = await auth();
  invariant(session?.user?.id, "unauthenticated");
  const process = await db.process.create({
    data: { ...parsed.data, ownerId: session.user.id },
  });
  return { ok: true, process } as const;
}
```

| Trust boundary | PASS criteria |
|---|---|
| Server Action | Zod `.safeParse`/`.parse` before any `db.*` write |
| API route | same; return 400 on parse failure |
| Webhook | verify signature + Zod parse body |
| Env | `src/lib/env.ts` parses `process.env` with Zod at boot |

FAIL per boundary missing validation.

### Section 7 — Prisma Types

Avoid hand-rolled types that drift from schema. Use generated types.

```bash
grep -rn "type.*Process\s*=\|interface.*Process\s*{" "$PROJECT_ROOT/src" | grep -v "ProcessFile\|Processing"
```

Any hand-written `type Process = { ... }` duplicating schema fields = WARN.

**Remediation — use `GetPayload`:**

```ts
import type { Prisma } from "@prisma/client";

type ProcessWithFiles = Prisma.ProcessGetPayload<{
  include: { files: true };
}>;

type ProcessListItem = Prisma.ProcessGetPayload<{
  select: { id: true; title: true; status: true; createdAt: true };
}>;
```

### Section 8 — Discriminated Unions Narrowed Properly

```bash
grep -rnE "if \(.*\.type === " "$PROJECT_ROOT/src"
grep -rnE "switch \(.*\.type\)" "$PROJECT_ROOT/src"
```

Each discriminated-union consumer should either:
- Cover all variants in a `switch` with an exhaustive `default: const _: never = x;`, or
- Narrow via `if` branch and handle each case.

Exhaustiveness check pattern:
```ts
function render(x: Node): string {
  switch (x.type) {
    case "text": return x.value;
    case "element": return x.children.map(render).join("");
    default: { const _exhaustive: never = x; return _exhaustive; }
  }
}
```

Missing exhaustive default = WARN.

## Report Format

```
Type-Safety Audit — {PROJECT_NAME}
Date: {YYYY-MM-DD}

| # | Section            | Finding                                   | Severity | Location                           |
|---|--------------------|-------------------------------------------|----------|------------------------------------|
| 1 | tsconfig           | noUncheckedIndexedAccess=false            | HIGH     | tsconfig.json                      |
| 2 | any leaks          | 7 `: any` without reason                  | HIGH     | 5 files (see list)                 |
| 3 | non-null           | 12 `!` usages without `// reason:`        | HIGH     | src/app/processes/[id]/page.tsx    |
| 4 | ts-expect-error    | 3 without explanation                     | MEDIUM   | src/lib/ai/claude.ts:44            |
| 5 | return types       | 8 exported fns missing explicit return    | MEDIUM   | src/lib/*.ts                       |
| 6 | Zod boundary       | requestUploadUrl skips safeParse          | CRITICAL | src/lib/process-actions.ts:18      |
| 7 | Prisma types       | hand-rolled `type Process`                | LOW      | src/types/process.ts:3             |
| 8 | Union narrowing    | no exhaustive default in render()         | MEDIUM   | src/components/node-renderer.tsx   |

Summary: CRITICAL=1 HIGH=3 MEDIUM=3 LOW=1
Verdict: NEEDS WORK — fix boundary validation.
```

## Failure Criteria

- `strict: false` or `strict` missing → block.
- Any `@ts-nocheck` in `src/` → block.
- Any Server Action or API route without Zod parse before side effects → block.
- `npx tsc --noEmit` errors → block.

## Integration with `final-review`

Return JSON: `{ "skill": "review-type-safety", "counts": {...}, "findings": [...] }`.
