---
name: stack
description: Index of Persimmon app-code standards — Next.js 16 Server Actions, strict TypeScript patterns, Zod boundary validation, Tailwind v4 design tokens. Use when writing or reviewing application code (routes, components, mutations, types, styling). Routes to the right specialist child skill. Trigger keywords: server action, mutation, form submit, TypeScript strict, types, Zod, validate input, Tailwind, design tokens, theme.
---

# Stack — Index

Persimmon app code = Next.js 16 (App Router, Server Components, Server Actions) in strict TypeScript, validated with Zod at every boundary, styled with Tailwind v4 tokens. This mother is a map; follow the child for the actual work.

## Trigger

- "Write the Server Action for…" / "Handle this form submit / mutation"
- "Fix the types" / "strict mode" / "remove this `any`"
- "Validate this input" / "Zod schema"
- "Theme tokens" / "Tailwind setup"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `stack-server-actions` | Any mutation, form submit, or App Router data write | Next 16 Server Action patterns — Zod boundary, `revalidatePath`/`revalidateTag`, error shape, `force-dynamic` |
| `stack-typescript-strict` | Any new TS, or tightening existing code | Strict-mode patterns, `unknown` over `any`, explicit return types, narrowing |
| `stack-zod-boundary` | Any trust boundary (Server Action, API route, webhook) | Zod schemas at the edge, parse-don't-validate, error mapping |
| `stack-tailwind-tokens` | Styling setup or design-token work | Tailwind v4 `@theme` CSS-first config, token layering, utility patterns |

## How to route

1. **New mutation / form?** → `stack-server-actions` for the action shape; `stack-zod-boundary` for input parsing.
2. **Type errors / `any` leaks?** → `stack-typescript-strict`.
3. **Styling / theme?** → `stack-tailwind-tokens`.

## Persimmon stack defaults — one-screen summary

- **Server Components by default.** `"use client"` only for state, effects, or browser APIs.
- **Server Actions for mutations.** API routes only for background-job triggers, webhooks, SSE/streaming.
- **`const dynamic = "force-dynamic"`** on any page that reads the DB or `auth()` at request time.
- **Zod at every boundary**; narrow `unknown`, never trust raw input.
- **No `any`** without a justified `// eslint-disable` + reason. Explicit return types on exported functions.
- **Tailwind v4** via `@theme` tokens — no hardcoded values where a token exists.

## Anti-patterns banned

- Mutations via API routes when a Server Action fits
- Reading DB/`auth()` in a page without `force-dynamic`
- `any` as a shortcut around a real type
- Unvalidated boundary input
- Hardcoded colors/spacing outside the Tailwind token layer

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `data` | Server Actions call the Prisma client defined in `data` |
| `ai` | AI-backed actions route through `ai-sdk-wrapper` |
| `security` | Auth checks in actions follow `security-nextauth` |
| `quality` | Reviewed by `quality-review-type-safety` and `quality-review-data-layer` |
