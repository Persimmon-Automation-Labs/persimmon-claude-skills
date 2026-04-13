---
name: project-xray
description: Interactive guided walkthrough of a Persimmon client project's pages, data flows, and integrations. Claude leads the user through every route, server action, and external integration — asks them to open each, explains what's happening, verifies understanding, then moves on. Output is a project-map.md doc. Use before client meetings, status emails, onboarding new devs, or when Renato asks "walk me through this project" or "where does X come from." Triggers — "walk me through", "project walkthrough", "guided tour", "project xray", "where does X come from", "how does Y work", "onboard me".
---

# Project X-Ray — Interactive Guided Walkthrough

## Overview

This skill produces a complete mental model of a Next.js 16 project (Persimmon standard stack) by walking the user through every page, data flow, and integration one at a time. Claude leads; the user follows along in their browser and editor. Output is `docs/reference/project-map.md` — a living document usable for client prep, status emails, and dev onboarding.

**When to use**:
- Before a client status meeting (so Renato can answer "how does X work?")
- Writing a status email (need to confirm what's actually wired up)
- Onboarding a new developer
- Returning to a project after weeks away
- Auditing whether a feature is actually implemented vs. stubbed

**When NOT to use**:
- If the user wants a code review (use `final-review` or review-specific skills)
- If they want to fix a bug (use `systematic-debugging`)
- If the project isn't a Next.js App Router project (this skill assumes that structure)

---

## Step 1: Enumerate the Project

Before starting the walkthrough, build the map. Run these in parallel.

### 1a. Pages (App Router)

```bash
# All page.tsx files under src/app
find src/app -name "page.tsx" | sort
```

Group by top-level segment: auth routes, dashboard routes, public routes, API (`route.ts`).

### 1b. Server Actions

```bash
# By convention, *-actions.ts holds server actions
find src/lib -name "*-actions.ts" | sort

# Or grep "use server" directive
grep -rln '"use server"' src/
```

### 1c. API Routes

```bash
find src/app -name "route.ts" | sort
```

### 1d. Prisma Models

```bash
grep -E "^model " prisma/schema.prisma
```

### 1e. External Integrations

Read `.env.example` — every env var that's not `DATABASE_URL`, `NEXTAUTH_*`, or `NODE_ENV` usually represents an external integration.

```bash
cat .env.example
```

Map env vars to integrations:
- `ANTHROPIC_API_KEY` → Claude
- `TIGRIS_*` / `S3_*` → object storage
- `OPENAI_API_KEY` → embeddings (or fallback)
- `QSTASH_*` → background jobs
- `RESEND_*` → email
- `STRIPE_*` → payments
- Custom API keys → client-specific integration

### 1f. Background Jobs / Cron

```bash
# Common locations
find src/app/api -path "*cron*" -o -path "*jobs*"
grep -rln "pg-boss\|inngest\|qstash" src/
```

### 1g. Env-driven feature flags

```bash
grep -rln "process.env\." src/lib src/app | head -30
```

---

## Step 2: Present the Map Outline

Before the walkthrough, show the user what's about to happen:

```
PROJECT X-RAY — {project name}
============================================
Found:
  {N} pages (App Router)
  {N} server actions
  {N} API routes
  {N} Prisma models
  {N} external integrations: {list}
  {N} background jobs

We'll walk through these in order:
  1. Public routes (landing, auth)
  2. Authenticated routes (dashboard, tools)
  3. Server actions (mutations)
  4. API routes (webhooks, streaming, cron)
  5. Data model (Prisma)
  6. AI layer (Claude wrapper, prompts)
  7. External integrations
  8. Background jobs

For each, I'll:
  - Tell you what it is and where it lives
  - Ask you to open it (browser or editor)
  - Explain what's happening
  - Ask you a verification question
  - Move on once you confirm

Ready? (y/n, or "skip to section N")
============================================
```

Wait for the user to confirm. If they want to skip ahead, jump to that section.

---

## Step 3: Walk Each Route

For every page, follow this loop. **Do not batch-explain multiple pages** — one at a time, always wait for the user.

### Template per page

```
─── PAGE: {route} ───
File:        src/app/{path}/page.tsx
Purpose:     {one-sentence description}
Dynamic:     {yes/no — does it export `dynamic = "force-dynamic"`?}
Auth:        {public / requires session / requires role X}

Data sources:
  - {DB query via Prisma — what table(s)}
  - {Server Action called on submit — name}
  - {Client Component boundary — where, why}

External calls:
  - {Claude API call, if any — which prompt, which model}
  - {S3 upload flow, if any}

ACTION for you:
  Open {http://localhost:3000/path} in your browser AND
  open src/app/{path}/page.tsx in your editor.
  Tell me when you're looking at both.

VERIFY:
  Can you point to where {specific thing} happens?
  (Wait for answer. If wrong, correct and re-explain that part.)
```

Only move on when the user says "got it" or equivalent. If they ask a follow-up, answer it before proceeding.

### Rules for explanations

- **Show, don't paraphrase.** Quote the actual function name, the actual file path, the actual env var.
- **Flag stubs.** If a page calls a function that just returns mocks or throws "not implemented," say so. This is the #1 reason to run xray before a client meeting.
- **Flag `dynamic` mismatches.** Any page that reads DB or `auth()` without `export const dynamic = "force-dynamic"` will break on Railway build. Call it out.
- **Flag missing Zod.** Server Actions without Zod validation are a trust-boundary hole.

---

## Step 4: Walk Server Actions

For each file in `src/lib/*-actions.ts`:

```
─── SERVER ACTIONS: {file} ───
Exports:     {action1, action2, ...}

For each action:
  - Input schema: {Zod schema name, or "NONE — flag"}
  - Auth check: {session check present? role check?}
  - DB writes: {which tables}
  - AI calls: {which prompts, which model}
  - Revalidation: {revalidatePath / revalidateTag calls}
  - Return shape: {success/error discriminated union? just throws?}

ACTION for you:
  Open {file} in your editor.
  Find action `{name}`. What does it do in one sentence?

VERIFY:
  Is this safe against {specific concern — SQL injection? unauthorized call?}
  (If unsafe, that's an ADR candidate OR an immediate fix.)
```

---

## Step 5: Walk API Routes

Focus on webhooks, streaming, and cron — these are the routes that bypass Server Actions for a reason.

```
─── API ROUTE: {method} {path} ───
File:        src/app/{path}/route.ts
Purpose:     {webhook receiver / SSE stream / cron trigger}
Auth:        {signature verification / bearer token / unauthenticated}
Idempotency: {dedupe key? replay-safe?}
```

Webhooks without signature verification → flag immediately.

---

## Step 6: Walk Data Model

One pass through `prisma/schema.prisma`:

```
─── PRISMA MODEL: {Model} ───
Fields:      {list key fields and types}
Relations:   {belongs to / has many}
Indexes:     {DB indexes — especially composite and HNSW}
Used by:     {which routes / actions read or write this}
```

Flag:
- Models with no `createdAt`/`updatedAt`
- `Json` fields without a TypeScript type narrowing somewhere
- Vector fields without HNSW index
- Unbounded `findMany` calls (grep for `.findMany(` without `take:` anywhere)

---

## Step 7: Walk AI Layer

```
─── AI LAYER ───
Wrapper:     src/lib/ai/claude.ts
Prompts:     src/lib/ai/prompts.ts
Models used: {Sonnet for X, Opus for Y}
Caching:     {cache_control on which prompts}
Persistence: {which tables store AI outputs}
Retries:     {explicit backoff? default SDK retries?}
```

Check that:
- No inline prompt strings anywhere outside `prompts.ts`
- No imports of `@anthropic-ai/sdk` outside `claude.ts`
- Every AI output is persisted (grep for Claude calls → check if the return value is written to DB)
- Prompt caching is on any stable system prompt > 1024 tokens

---

## Step 8: Walk Integrations

For every env var from Step 1e, explain where it's consumed:

```
─── INTEGRATION: {name} ───
Env vars:    {KEY_1, KEY_2}
Wrapper:     {src/lib/{integration}.ts if exists}
Used in:     {list of files calling this}
Failure mode: {what happens if the service is down?}
```

---

## Step 9: Write `docs/reference/project-map.md`

After the walkthrough, produce a clean map. Template:

```markdown
# Project Map — {Client Name}

_Last updated: {date}. Regenerate via `project-xray` skill when architecture changes._

## At a glance

| | |
|---|---|
| **Phase** | {Development / Staging / Production} |
| **Routes** | {N public + N authenticated + N API} |
| **Server Actions** | {N across M files} |
| **Prisma Models** | {list} |
| **Integrations** | {list} |

## Public routes

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing |
| `/login` | `src/app/login/page.tsx` | NextAuth credentials form |

## Authenticated routes

| Route | File | Auth | Dynamic | Purpose |
|---|---|---|---|---|
| `/dashboard` | ... | session | force-dynamic | ... |

## Server Actions

| Action | File | Input schema | Writes | AI calls |
|---|---|---|---|---|
| `createProcess` | `src/lib/process-actions.ts` | `CreateProcessSchema` | `Process`, `Document` | none |

## API Routes

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/webhooks/tigris` | Upload complete callback | HMAC signature |

## Data model

{Mermaid diagram or ASCII tree of Prisma relations}

## AI layer

- Wrapper: `src/lib/ai/claude.ts`
- Prompts: `src/lib/ai/prompts.ts` — {N prompts: list names}
- Model routing: Sonnet for {tasks}, Opus for {tasks}
- Caching: {which prompts have `cache_control`}
- Persistence: {which tables store outputs}

## Integrations

{list with env vars and purpose}

## Known gaps

- {Things flagged during walkthrough — stubs, missing auth, missing Zod, etc.}

## Open questions

- {Things the user didn't know during walkthrough — candidates for ADRs or client conversations}
```

---

## Step 10: Summary

```
PROJECT X-RAY COMPLETE — {project name}
============================================
Walked:        {N routes, N actions, N integrations}
Gaps flagged:  {count}
Output:        docs/reference/project-map.md

Recommended follow-ups:
  - {N ADR candidates — run adr-authoring}
  - {N stubs to address before client meeting}
  - {N security gaps (missing Zod, unsigned webhooks)}
============================================
```

---

## Anti-Patterns

- Do not batch multiple pages into one explanation — the user loses the thread.
- Do not skip the "verify" step — if you don't confirm understanding, the walkthrough is just narration.
- Do not invent features. If a page is a stub, say "this is a stub" — do not describe what the user probably intended.
- Do not write `project-map.md` before finishing the walkthrough — the map should reflect what you actually saw together, including gaps.
- Do not include financials, client contact info, or contract details in `project-map.md` — this doc is for dev/status use and may be shared with new team members.
