---
name: typescript-strict-patterns
description: TypeScript strict-mode patterns for the Persimmon stack. Use when setting up `tsconfig.json`, writing exhaustive state machines, replacing `any` with `unknown` + narrowing, branding IDs, avoiding non-null assertions, using `satisfies` vs type assertions, writing type guards, or enforcing return-type annotations. Includes helper files for `invariant()` and `assertNever()` plus tsconfig scaffolding.
---

# TypeScript Strict Patterns — Persimmon

Every Persimmon project ships with strict TypeScript. Strict mode is the cheapest bug-finder money can buy — catch a class of errors at build time instead of at 2am from a client. This skill is what "strict" actually means in practice and how to stay out of its way.

## `tsconfig.json` — The Scaffold

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,

    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,

    "forceConsistentCasingInFileNames": true,

    "incremental": true,
    "allowJs": false,
    "noEmit": true,

    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### What each strict flag actually buys you

- `strict: true` — bundles `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc. Non-negotiable.
- `noUncheckedIndexedAccess: true` — `arr[0]` is `T | undefined`, not `T`. Forces handling empty arrays and missing map keys. Yes, it's more verbose. Yes, it prevents real bugs.
- `exactOptionalPropertyTypes: true` — `{ x?: string }` won't accept `{ x: undefined }`. You have to omit the key or make it `x?: string | undefined`. Catches sloppy `delete obj.x` patterns.
- `noImplicitOverride: true` — class methods need explicit `override`.
- `noFallthroughCasesInSwitch: true` — switch without `break`/`return` errors.

### Do NOT disable under pressure

The temptation during a rushed feature: set `noUncheckedIndexedAccess: false` to unblock a PR. Don't. Fix the call site. Every time the rule is disabled "temporarily" it never comes back, and the project accumulates unchecked indices that become `undefined` at runtime six months later.

## `unknown` Over `any` — Always

`any` turns off type checking. `unknown` turns it on and forces you to narrow before use.

```ts
// WRONG
function parse(input: any) {
  return input.foo.bar; // compiles, crashes at runtime
}

// RIGHT
function parse(input: unknown) {
  if (!isRecord(input) || typeof input.foo !== "object" || input.foo === null) {
    throw new Error("invalid input");
  }
  if (!("bar" in input.foo)) throw new Error("missing bar");
  return (input.foo as { bar: unknown }).bar;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
```

In practice, 99% of `unknown` inputs come from a trust boundary — use Zod (`zod-boundary-validation` skill) to narrow. Manual type guards are for internal parsing of things you already trust (AST walks, tool output that's been structurally validated but needs a narrower type).

### Legitimate uses of `any`

Count: three.

1. `@ts-expect-error` with a reason comment on a library that has wrong types.
2. Generic constraints where the inner type doesn't matter: `<T extends (...args: any[]) => unknown>`.
3. Legacy migration where the alternative is rewriting half the codebase in one PR.

Anywhere else, `any` needs an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a reason. No reason = not allowed.

## Explicit Return Types on Exported Functions

```ts
// WRONG — return type inferred as Promise<Process | null>; callers don't know
export async function getProcess(id: string) {
  return db.process.findUnique({ where: { id } });
}

// RIGHT — documents the contract, stable across refactors
export async function getProcess(id: string): Promise<Process | null> {
  return db.process.findUnique({ where: { id } });
}
```

Rule: every exported function has an explicit return type. Internal/private functions can infer.

Why:

- The return type is the function's contract. Changes should be deliberate, visible in diff.
- Editor hover shows the declared type, not a computed 7-line intersection.
- Build errors point at the source, not 20 call sites.

Enforce with ESLint:

```json
{
  "rules": {
    "@typescript-eslint/explicit-module-boundary-types": "error"
  }
}
```

## `satisfies` over Type Assertions

```ts
// WRONG — assertion. If the shape is wrong, the error is silenced.
const config = { host: "localhost", port: "3000" } as Config;

// RIGHT — satisfies. Checks shape AND preserves the exact literal types.
const config = { host: "localhost", port: 3000 } satisfies Config;

// Downstream, config.host is "localhost" (literal), not string.
```

Use `satisfies` when:

- You want to assert an object matches an interface
- You also want TypeScript to remember the specific literal values

Use `as` ONLY when:

- Narrowing after a manual type guard you've written
- Interop with untyped/poorly-typed libraries (and file a PR to them)
- Converting `unknown` to a known shape AFTER validating with Zod

Never `as` to silence an error. That's how runtime crashes enter production.

## Branded Types for IDs

Same string type, different meanings — TypeScript can't tell them apart by default. Brand them.

```ts
// src/types/brand.ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type ProcessId = Brand<string, "ProcessId">;
export type DocumentId = Brand<string, "DocumentId">;
export type ChunkId = Brand<string, "ChunkId">;

// Constructors — single source of truth for how a raw string becomes a brand
export const UserId = (s: string): UserId => {
  if (!/^c[a-z0-9]{24}$/.test(s)) throw new Error(`invalid UserId: ${s}`);
  return s as UserId;
};

export const ProcessId = (s: string): ProcessId => {
  if (!/^c[a-z0-9]{24}$/.test(s)) throw new Error(`invalid ProcessId: ${s}`);
  return s as ProcessId;
};
```

Now:

```ts
function deleteProcess(id: ProcessId): Promise<void> { /* ... */ }

const uid: UserId = UserId(session.user.id);
await deleteProcess(uid); // ERROR — Argument of type 'UserId' is not assignable to 'ProcessId'
```

Types cost nothing at runtime (`Brand` is an intersection, erased). They prevent an entire class of argument-swap bugs.

### Zod brand integration

```ts
const ProcessIdSchema = z.string().cuid().brand<"ProcessId">();
export type ProcessId = z.infer<typeof ProcessIdSchema>;

// In an action:
const parsed = ProcessIdSchema.safeParse(fd.get("id"));
if (!parsed.success) return actionErr("invalid id");
const id: ProcessId = parsed.data;
```

Same outcome, validated at the boundary. See `zod-boundary-validation`.

## `invariant()` Instead of `!`

Non-null assertion (`!`) tells TypeScript "trust me" and disables the check. It's a silent bug if wrong.

```ts
// WRONG — crashes at runtime with "Cannot read properties of undefined" if empty
const first = items[0]!;
```

```ts
// src/lib/invariant.ts
export function invariant(
  condition: unknown,
  message: string | (() => string) = "Invariant failed"
): asserts condition {
  if (condition) return;
  const msg = typeof message === "function" ? message() : message;
  throw new Error(`Invariant failed: ${msg}`);
}
```

```ts
// RIGHT — same ergonomics, explicit failure path
const first = items[0];
invariant(first, "items was unexpectedly empty");
// first is now narrowed to the non-undefined type
first.doSomething();
```

`invariant` is a TypeScript `assertion function` (note `asserts condition`) — the compiler narrows based on it. Same terseness as `!`, but it throws a real error with a real message instead of `TypeError: undefined`.

Rule: the only `!` in the codebase should be in this file. Everywhere else: `invariant`, early `return`, or a type guard.

## `assertNever()` for Exhaustive Switches

Pair with discriminated unions to guarantee every state is handled.

```ts
// src/lib/assert-never.ts
export function assertNever(value: never, context?: string): never {
  throw new Error(
    `Unreachable: unexpected value ${JSON.stringify(value)}` +
      (context ? ` in ${context}` : "")
  );
}
```

```ts
type ProcessStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "INDEXING"
  | "INDEXED"
  | "ANALYZING"
  | "ANALYZED"
  | "GENERATING_BRIEF"
  | "BRIEF_READY"
  | "ERROR";

function statusLabel(s: ProcessStatus): string {
  switch (s) {
    case "UPLOADING":        return "Enviando";
    case "UPLOADED":         return "Enviado";
    case "INDEXING":         return "Indexando";
    case "INDEXED":          return "Indexado";
    case "ANALYZING":        return "Analisando";
    case "ANALYZED":         return "Analisado";
    case "GENERATING_BRIEF": return "Gerando peça";
    case "BRIEF_READY":      return "Peça pronta";
    case "ERROR":            return "Erro";
    default: return assertNever(s, "statusLabel");
  }
}
```

Add a new status to `ProcessStatus` and every switch using `assertNever` becomes a compile error until you handle the new variant. This is the #1 pattern for safe state-machine evolution.

## Discriminated Unions for State

Any state with >1 shape should be a discriminated union, not a bag of optionals.

```ts
// WRONG — every field is optional; nothing is guaranteed
type AsyncState<T> = {
  loading?: boolean;
  data?: T;
  error?: Error;
};

// RIGHT — each branch is tight
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };
```

Consumers pattern-match:

```tsx
function View({ state }: { state: AsyncState<Process[]> }) {
  switch (state.status) {
    case "idle": return null;
    case "loading": return <Spinner />;
    case "success": return <List items={state.data} />;
    case "error": return <Error msg={state.error.message} />;
    default: return assertNever(state);
  }
}
```

`state.data` is typed only in the `success` branch. No `state.data!` needed.

## `as const` for Literal Types

```ts
// Inferred as string[]
const STATUSES = ["draft", "published", "archived"];

// Inferred as readonly ["draft", "published", "archived"]
const STATUSES = ["draft", "published", "archived"] as const;
type Status = (typeof STATUSES)[number]; // "draft" | "published" | "archived"
```

Use `as const`:

- On arrays you want as tuples of literal types
- On objects that should be deeply immutable
- When building enums in pure TS (avoid TS `enum` — the runtime emit is weird)

## Type Guards — Custom Narrowers

```ts
export function isNonEmpty<T>(a: readonly T[]): a is readonly [T, ...T[]] {
  return a.length > 0;
}

export function isDefined<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}

export function hasKey<K extends PropertyKey>(
  obj: object,
  key: K
): obj is Record<K, unknown> {
  return key in obj;
}
```

Usage:

```ts
const items = await db.process.findMany({ where: { ownerId } });
if (isNonEmpty(items)) {
  const first = items[0]; // typed as the element type — no undefined, no !
}

const defined = maybes.filter(isDefined); // T[] instead of (T | undefined)[]
```

`filter(isDefined)` is idiomatic and worth memorizing — it's the cleanest way to drop nullable elements with correct typing.

## Generics with Constraints

```ts
// Bad — T is unconstrained, works on anything, produces garbage errors
function pick<T, K>(obj: T, keys: K[]): unknown { /* ... */ }

// Good — K is constrained to keys of T
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    out[k] = obj[k];
  }
  return out;
}
```

Use `extends` to say what a type parameter looks like. Think of it as "where T is a kind of ___".

## `Readonly`, `ReadonlyArray`, `as const`

Prefer readonly by default for function parameters — documents that the function won't mutate:

```ts
function sum(nums: readonly number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
```

For deeply frozen config:

```ts
const CONFIG = {
  maxUploadMB: 500,
  allowedTypes: ["application/pdf"],
} as const;

CONFIG.maxUploadMB = 600; // ERROR — readonly
```

## Anti-Patterns

### `any`-shaped shortcuts

```ts
const x: any = apiResponse;
```

Gets you past today, costs you next month. Validate at the boundary and stop carrying `any` inward.

### `!` sprinkled through the codebase

```ts
const user = session.user!;
const first = items[0]!;
const id = process.env.DATABASE_URL!;
```

Three runtime crashes waiting. Replace with `invariant(...)`, narrow with a guard, or use validated env.

### Type assertions to silence errors

```ts
const user = apiResult as User;
```

If `apiResult` isn't a `User`, nothing catches it. Validate or narrow.

### Mutable global state with wide types

```ts
let cache: any = {};
```

Type it. Or better, don't have mutable global state.

### `enum` instead of `as const` unions

```ts
// AVOID — produces runtime object, weird type semantics
enum Status { Draft = "draft", Published = "published" }

// PREFER — pure type, no runtime cost
const STATUS = ["draft", "published"] as const;
type Status = (typeof STATUS)[number];
```

`enum` has historical bugs (numeric reverse mapping, const vs non-const weirdness). `as const` unions are clearer.

### Inferred return types on exports

```ts
export function getUser(id: string) {
  /* ... 30 lines ... */
}
```

Call-site hover shows a computed type. Diffs lose signal. Add `: Promise<User | null>`.

### Re-exporting types with `export type` vs `export` ambiguity

```ts
// Ambiguous under isolatedModules
export { User } from "./types";
```

Use `export type` for type-only exports:

```ts
export type { User } from "./types";
```

Required under `isolatedModules: true` (which is required for Next.js).

## The Two Helper Files Every Persimmon Project Ships

```ts
// src/lib/invariant.ts
export function invariant(
  condition: unknown,
  message: string | (() => string) = "Invariant failed"
): asserts condition {
  if (condition) return;
  const msg = typeof message === "function" ? message() : message;
  throw new Error(`Invariant failed: ${msg}`);
}
```

```ts
// src/lib/assert-never.ts
export function assertNever(value: never, context?: string): never {
  throw new Error(
    `Unreachable: unexpected value ${JSON.stringify(value)}` +
      (context ? ` in ${context}` : "")
  );
}
```

Drop both in at project scaffolding time. They pay for themselves within the first month.

## Checklist for Strict-Mode Hygiene

- [ ] `tsconfig.json` has `strict: true` + `noUncheckedIndexedAccess: true`
- [ ] Every exported function has an explicit return type
- [ ] Zero `any` outside documented escape hatches
- [ ] Zero `!` outside `invariant.ts`
- [ ] `invariant.ts` and `assert-never.ts` exist
- [ ] Discriminated unions instead of optional-field state bags
- [ ] IDs are branded (`UserId`, `ProcessId`, etc.)
- [ ] `satisfies` used instead of `as` for object-shape assertions
- [ ] `as const` on literal arrays/objects
- [ ] `readonly` on array params
- [ ] ESLint enforces `explicit-module-boundary-types`, `no-explicit-any`, `consistent-type-exports`
- [ ] `npx tsc --noEmit` runs clean in CI

## Cross-References

- **zod-boundary-validation** — where `unknown` gets narrowed
- **nextjs-server-actions** — `ActionResult<T>` discriminated union, `satisfies`
- **prisma-pgvector** — branded `ChunkId` / `DocumentId` in retrieval signatures
- **nextauth-credentials** — session type augmentation via `declare module`
