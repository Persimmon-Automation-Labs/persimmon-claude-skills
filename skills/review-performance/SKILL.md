---
name: review-performance
description: Performance audit for Persimmon Next.js 16 + Prisma + Claude stack. Checks RSC boundaries, bundle size, image and font loading, data-fetching patterns, DB query plans and N+1, Core Web Vitals via Lighthouse, and Claude call parallelism and prompt caching. Triggers on "performance review", "performance audit", "page is slow", "optimize", "pre-launch", "before shipping".
---

# Performance Review — Persimmon Stack

Performance audit for Next.js 16 (App Router) + Prisma + Claude apps. Runs standalone or via `final-review`.

## Inputs

- `SITE_URL` — deployed URL
- `PROJECT_ROOT` — repo root
- `DATABASE_URL` — optional; if supplied, runs `EXPLAIN ANALYZE` on suspect queries

## Procedure

### Section 1 — RSC / Client Boundary

Client components ship JS to the browser. Most Persimmon UI should be server.

```bash
grep -rln '"use client"' "$PROJECT_ROOT/src/app" "$PROJECT_ROOT/src/components"
```

For each hit, open the file and verify it needs one of:
- `useState` / `useReducer` / `useRef`
- `useEffect`
- browser-only API (`window`, `document`, `localStorage`)
- event handlers that can't be form-action Server Actions

| Verdict | Criteria |
|---|---|
| PASS | Client component is small (<150 lines), wraps only the interactive piece |
| WARN | Client component renders a large subtree; extract a `<Client/>` island |
| FAIL | Client component with no hook / browser API — delete the directive |

**Remediation — island pattern:**

```tsx
// page.tsx (server)
import { LikeButton } from "./like-button";
export default async function Page() {
  const post = await db.post.findFirst();
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
      <LikeButton id={post.id} /> {/* only this is client */}
    </article>
  );
}
```

### Section 2 — Bundle Size

```bash
cd "$PROJECT_ROOT" && npm run build 2>&1 | tee /tmp/build.log
grep -E "Route|First Load JS|├|└" /tmp/build.log
```

| First Load JS | Verdict |
|---|---|
| ≤ 100 KB | PASS |
| 100–200 KB | WARN |
| > 200 KB | FAIL — run `@next/bundle-analyzer` and trim |

Install analyzer on demand:
```bash
cd "$PROJECT_ROOT" && npm i -D @next/bundle-analyzer && ANALYZE=true npm run build
```

Common culprits: `moment` (use `date-fns`), full `lodash` (use `lodash-es` + named imports), `@radix-ui/*` imported at root instead of per-primitive, client-side `pdfjs`.

### Section 3 — Images

```bash
grep -rn "<img " "$PROJECT_ROOT/src"
```

Every `<img>` must be `<Image>` from `next/image` with explicit `width`/`height`. Above-the-fold images: `priority`. Hero / LCP candidates: `priority fetchPriority="high"`. Avatars and lists: default (lazy).

```tsx
import Image from "next/image";
<Image src="/hero.jpg" alt="..." width={1280} height={640} priority sizes="100vw" />
```

FAIL on:
- Any `<img>` in `src/app` or `src/components`
- Remote images not configured in `next.config.ts#images.remotePatterns`
- Missing `alt`

### Section 4 — Fonts

```bash
grep -rn "<link.*fonts.googleapis\|@import.*fonts" "$PROJECT_ROOT/src"
grep -rn "next/font" "$PROJECT_ROOT/src/app/layout.tsx"
```

FAIL on `<link rel="stylesheet" href="...fonts.googleapis.com...">` — causes render-blocking CSS + FOUT. Use `next/font`:

```ts
import { Fraunces, Instrument_Sans } from "next/font/google";
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
```

### Section 5 — Data Fetching

```bash
grep -rn "fetch(" "$PROJECT_ROOT/src" | grep -v "node_modules"
```

Every `fetch` that hits our own API or a third party should specify cache:

```ts
// static, build-time
await fetch(url, { cache: "force-cache" });
// ISR
await fetch(url, { next: { revalidate: 60, tags: ["process-list"] } });
// dynamic
await fetch(url, { cache: "no-store" });
```

Grep waterfalls — sequential awaits that could be parallel:

```bash
grep -rnB1 -A6 "await db\." "$PROJECT_ROOT/src" | grep -B1 -A3 "await db\..*\n.*await db\."
```

**Remediation — parallelize:**

```ts
// BAD (waterfall)
const user = await db.user.findFirst(...);
const processes = await db.process.findMany({ where: { ownerId: user.id } });
// GOOD
const [user, processes] = await Promise.all([
  db.user.findFirst(...),
  db.process.findMany({ where: { ownerId: session.userId } }),
]);
```

### Section 6 — Database

Cross-ref `prisma/schema.prisma` indexes against query patterns.

```bash
grep -rn "findMany\|findFirst\|findUnique" "$PROJECT_ROOT/src" | wc -l
grep -E "@@index|@unique" "$PROJECT_ROOT/prisma/schema.prisma"
```

Rules:
- Every foreign key used in a `where` clause must have `@@index([fkField])`.
- Every `orderBy` column on lists must be indexed (often composite with filter column).
- Every `findMany` without `take` → FAIL (unbounded read).

**EXPLAIN ANALYZE** the slowest routes:

```bash
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT * FROM \"Process\" WHERE \"ownerId\" = '...' ORDER BY \"createdAt\" DESC LIMIT 25;"
```

Look for `Seq Scan` on large tables → missing index. `Rows Removed by Filter` high → wrong index.

**N+1 detection:**

```bash
grep -rnB2 -A10 "\.map(async" "$PROJECT_ROOT/src" | grep -B5 -A2 "db\."
```

Any `.map(async x => db...)` inside render / action → N+1.

**Before:**
```ts
const processes = await db.process.findMany();
const rows = await Promise.all(processes.map(async p => ({
  ...p,
  fileCount: await db.processFile.count({ where: { processId: p.id } }),
})));
```

**After:**
```ts
const processes = await db.process.findMany({
  include: { _count: { select: { files: true } } },
});
```

Or:
```ts
const processes = await db.process.findMany({
  select: { id: true, title: true, status: true, createdAt: true }, // select > include when full relation not needed
});
```

### Section 7 — Core Web Vitals (Lighthouse)

```bash
npx lighthouse "$SITE_URL" \
  --output=json --output-path=/tmp/lh.json \
  --only-categories=performance \
  --chrome-flags="--headless=new --no-sandbox" \
  --throttling-method=simulate --preset=desktop
jq '.audits | {lcp: .["largest-contentful-paint"].displayValue, inp: .["interaction-to-next-paint"].displayValue, cls: .["cumulative-layout-shift"].displayValue, tbt: .["total-blocking-time"].displayValue}' /tmp/lh.json
```

| Metric | PASS | WARN | FAIL |
|---|---|---|---|
| LCP | ≤ 2.5 s | 2.5–4 s | > 4 s |
| INP | ≤ 200 ms | 200–500 ms | > 500 ms |
| CLS | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| TBT | ≤ 200 ms | 200–600 ms | > 600 ms |

Also run `--preset=mobile` once — mobile is the real test.

### Section 8 — Claude Call Patterns

```bash
grep -rn "claude.messages.create\|await callClaude" "$PROJECT_ROOT/src"
```

Check:
- Multiple independent Claude calls wrapped in `Promise.all` (per-page classification is parallelizable — 20× speedup on a 2000-page PDF vs sequential).
- `cache_control: { type: "ephemeral" }` on any system block > 1024 tokens or reused doctrine block.
- Sonnet for volume, Opus only for composition per ADR.
- No Claude call inside a React render path — always a Server Action or background job.

**Remediation — parallel + cached:**

```ts
const results = await Promise.all(
  pages.map(p => claude.messages.create({
    model: "claude-sonnet-4-5-20250929",
    system: [
      { type: "text", text: DOCTRINE, cache_control: { type: "ephemeral" } }, // cached across calls
      { type: "text", text: CLASSIFIER_SYSTEM },
    ],
    messages: [{ role: "user", content: `<user_input>${p.text}</user_input>` }],
    max_tokens: 512,
  }))
);
```

## Report Format

```
Performance Audit — {PROJECT_NAME}
URL: {SITE_URL}   Date: {YYYY-MM-DD}

| # | Section           | Finding                                       | Severity | Location                    |
|---|-------------------|-----------------------------------------------|----------|-----------------------------|
| 1 | RSC boundary      | LoginForm is client for no reason             | MEDIUM   | src/app/login/page.tsx:1    |
| 2 | Bundle            | /processes route 340 KB First Load            | HIGH     | .next build output          |
| 3 | Images            | <img> on /processes/[id] hero                 | HIGH     | src/app/processes/[id]/.tsx |
| 4 | Fonts             | Google Fonts <link>                           | MEDIUM   | src/app/layout.tsx:8        |
| 5 | Fetch             | 4-call waterfall in Painel                    | HIGH     | src/app/page.tsx:22         |
| 6 | DB                | N+1 on file counts; Seq Scan on Process.owner | CRITICAL | src/app/processes/page.tsx  |
| 7 | CWV (mobile)      | LCP 5.8s                                      | CRITICAL | Lighthouse                  |
| 8 | Claude            | sequential per-page classify, no cache_control| HIGH     | src/lib/processing/indexer  |

Summary: CRITICAL=2 HIGH=4 MEDIUM=2 LOW=0
Verdict: NEEDS WORK — fix CRITICAL before delivery.
```

## Failure Criteria

- Mobile LCP > 4s or CLS > 0.25 → block.
- Any unbounded `findMany` on a growing table → block.
- Any detected N+1 on a user-facing page → block.
- Claude calls in a request path that could be background → block.

## Integration with `final-review`

Return JSON: `{ "skill": "review-performance", "counts": {...}, "findings": [...], "lighthouse": {...} }`.
