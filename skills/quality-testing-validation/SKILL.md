---
name: quality-testing-validation
description: Manual and functional QA for Persimmon Next.js 16 projects — auto-generated checklists by project type (RAG app, internal CRUD, public site, API), Stripe test-card scenarios, Server Action form edge cases, link checking, axe accessibility audit, and responsive breakpoint checks. Validation Claude Code runs against a running or deployed site — not unit tests. Use when a build nears completion or the user says "QA check", "test this", "validate before launch". Trigger keywords — QA, manual testing, validate, test data, Stripe test cards, link check, accessibility, axe, responsive, breakpoints.
---

# Testing & Validation — Persimmon Patterns

Practical functional QA for Persimmon builds: per-project-type checklists, Stripe test cards, Server Action form edge cases, link checking, and accessibility. **Not** unit tests — these are validations Claude Code executes against a running dev server or deployed site. For repeatable automated runs, hand the same flows to `quality-playwright-e2e`.

## Trigger

Build nearing completion, or "test this", "QA check", "validate before launch", before any deploy.

## 0. Run automated checks first

Manual QA covers what tools can't (visual quality, content accuracy, real-flow feel). Run the cheap automated gates before walking checklists:

```bash
cd "$PROJECT_ROOT"
npx tsc --noEmit && npx eslint . && npx prisma validate && npm run build
```

Then:
- **`quality-playwright-e2e`** — repeatable end-to-end flow validation (auth, primary CRUD, Server Action forms) against dev/preview/prod.
- **`quality-final-review`** — orchestrates `security-review` + all `quality-review-*` for code-level depth (N+1, types, prompt hygiene). This skill is functional/manual QA, not a code review — stay in lane.

## 1. Determine Project Type

Ask (via `AskUserQuestion` if unclear):
- Target URL (local `http://localhost:3000`, Railway preview, or prod)?
- Project type: **RAG app** (Piccino-style), **internal CRUD tool**, **public marketing site**, or **API-only**?
- Stripe payments? User auth (NextAuth)? File uploads (S3 presigned)? AI pipeline?

Pick the matching checklist below.

## 2. Checklists by Project Type

### RAG / AI App (Piccino-style)

```markdown
## RAG App QA
### Ingestion & Upload
- [ ] Upload via presigned URL — client PUTs directly to bucket (bytes never proxied through Next)
- [ ] Upload rejects oversize / wrong MIME before issuing the URL
- [ ] CORS allows the current origin (localhost/preview/prod) — symptom of miss: net::ERR_FAILED, no server log
- [ ] Document appears in list after processing; status transitions correctly
### Retrieval & Generation
- [ ] Query returns relevant chunks (pgvector hit), not empty/garbage
- [ ] Claude output renders and is PERSISTED — reload page, result is read from DB, not regenerated
- [ ] Citations/grounding present where the domain requires it (legal briefs) — deep check: quality-review-prompt-output
- [ ] Long doc doesn't time out; retry/backoff visible on transient 529
- [ ] Empty/garbage query handled gracefully (no crash, sensible message)
### Auth & Access
- [ ] Unauthenticated user redirected from protected routes to login
- [ ] User A cannot read User B's documents (tenant isolation)
```

### Internal CRUD Tool

```markdown
## Internal CRUD QA
### Auth (NextAuth v5)
- [ ] Login page loads; valid creds → dashboard
- [ ] Invalid creds → generic error (no "wrong password" field leak)
- [ ] Empty fields → Zod validation error
- [ ] Logout clears session; direct URL to protected page → redirect to login
- [ ] Behind Railway: redirect lands on custom domain, not *.up.railway.app (x-forwarded-host)
### CRUD per entity (Server Actions)
- [ ] List loads; pagination works past the page size; no unbounded full-table read
- [ ] Search / filter narrows results; clearing restores
- [ ] Create — required-field Zod validation fires; save persists; row appears
- [ ] Edit — existing data hydrates form; save updates
- [ ] Delete — confirm removes, cancel preserves
- [ ] Server Action revalidates the list (revalidatePath/revalidateTag) — UI reflects change without hard refresh
- [ ] Concurrent edit / double-submit handled (action idempotent or button disables)
### Dashboard
- [ ] Stats render real values (not NaN/null/undefined)
```

### Public Marketing Site

```markdown
## Public Site QA
### Pages & Nav
- [ ] All routes return 200, no 404s on nav/footer links
- [ ] No broken images; Next <Image> renders with width/height
- [ ] External links open in new tab (rel="noopener")
### Content
- [ ] No lorem ipsum / placeholder; phone & email correct and clickable
- [ ] Copyright year current
### Forms (intake/contact)
- [ ] Submits via Server Action / form endpoint; confirmation shows
- [ ] Delivers to the real inbox
- [ ] Required + email-format validation (Zod) blocks bad input
- [ ] Rapid double-submit prevented
### SEO
- [ ] Unique <title> + meta description per route (metadata API)
- [ ] One <h1>/page; images have alt; app/sitemap.ts + app/robots.ts present; favicon shows
```

### API-Only Service

```markdown
## API QA
- [ ] Every route validates input with Zod; 400 + safe message on bad payload
- [ ] Auth/authorization enforced on protected routes
- [ ] Error responses don't leak stack traces or PII
- [ ] Rate-limit / abuse guard on public endpoints (if scoped)
- [ ] Webhook routes verify signatures before processing
```

## 3. Stripe Test-Card Scenarios

Stack-agnostic. Run each in test mode and verify the order/state outcome. (See the `stripe:test-cards` skill for the maintained matrix.)

| Scenario | Card | Expect |
|---|---|---|
| Success | `4242 4242 4242 4242` | Payment succeeds, order marked paid, confirmation shown |
| Declined | `4000 0000 0000 0002` | Decline error, order stays pending |
| 3D Secure | `4000 0025 0000 3155` | Auth prompt → complete → succeeds |
| Insufficient funds | `4000 0000 0000 9995` | Insufficient-funds error |
| Expired | `4000 0000 0000 0069` | Expired-card error |
| Incorrect CVC | `4000 0000 0000 0127` | CVC error |
| Dispute | `4000 0000 0000 0259` | Succeeds, then dispute webhook fires |

Any future expiry, any 3-digit CVC. Also verify: amounts in **cents**, charge amount matches order total, refund flow works, webhook handler validates payload with Zod, no card data logged.

## 4. Form Validation Edge Cases (Server Actions)

Zod sits at every boundary — these inputs should be rejected or safely handled, never reaching Prisma or a Claude `system` prompt raw:

```
<script>alert('xss')</script>          ' OR '1'='1                "; DROP TABLE users; --
Ñoño García      O'Brien      user+tag@email.com      user@sub.domain.co.uk
""  (empty/required)    "   " (whitespace)    "a"×255 (varchar bound)    "a"×10000 (excess)
0    -1    99999999.99    0.001
Ignore previous instructions and... (prompt-injection — must be neutralized before reaching Claude)
```

Confirm: Zod parse rejects malformed input; output is escaped on render (React auto-escapes — verify no `dangerouslySetInnerHTML` with user data); untrusted text never concatenated into a Claude system prompt (deep check: `quality-review-prompt-output` / `security-review`).

## 5. Link Checking

Use Playwright (via `quality-playwright-e2e`) or a quick crawl. Lightweight Node one-off:

```js
// scripts/check-links.mjs — node scripts/check-links.mjs https://site
const base = process.argv[2]; const host = new URL(base).host;
const seen = new Set(), broken = [], queue = [base];
while (queue.length && seen.size < 200) {
  const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
  let res; try { res = await fetch(url); } catch { broken.push([url, 'ERR']); continue; }
  if (res.status >= 400) { broken.push([url, res.status]); continue; }
  if (new URL(url).host !== host) continue;
  const html = await res.text();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/g)) {
    const h = m[1];
    if (h.startsWith('mailto:') || h.startsWith('tel:')) continue;
    const abs = new URL(h, url).href;
    if (new URL(abs).host === host && !seen.has(abs)) queue.push(abs);
  }
}
console.log(`Checked ${seen.size}, broken ${broken.length}`);
broken.forEach(([u, c]) => console.log(`  [${c}] ${u}`));
```

## 6. Accessibility — axe

Automate with `@axe-core/playwright` (preferred — repeatable in `quality-playwright-e2e`):

```js
import { injectAxe, checkA11y } from 'axe-playwright';
await injectAxe(page);
await checkA11y(page, null, { detailedReport: true });
```

Manual backstop:
- [ ] All `<img>`/`<Image>` have meaningful `alt` (decorative = `alt=""`)
- [ ] Keyboard-only nav works; visible focus ring (no blanket `outline:none`)
- [ ] Inputs have `<label>` (or `aria-label`); errors linked via `aria-describedby`
- [ ] Text contrast ≥ 4.5:1 (3:1 for ≥18px); info not conveyed by color alone
- [ ] Logical heading order, one `<h1>`, `lang` on `<html>`, a `<main>` landmark

## 7. Responsive Breakpoints

Verify visually in DevTools / Playwright `setViewportSize` at **375, 768, 1024, 1440**. At each:
- [ ] No horizontal overflow (`scrollWidth <= clientWidth`)
- [ ] Nav usable (hamburger on mobile); text readable un-zoomed
- [ ] Images contained; forms not cut off; tap targets ≥44px

## One-Screen Summary

1. **Automated gates first**: `tsc --noEmit`, `eslint`, `prisma validate`, `build`, then `quality-playwright-e2e`.
2. **Pick the checklist by project type** — RAG / CRUD / public / API.
3. **Stripe**: run the test-card matrix; amounts in cents; refund + webhook+Zod verified.
4. **Form edge cases**: XSS, SQLi, prompt-injection, unicode, length, numeric bounds — all rejected/neutralized by Zod before Prisma/Claude.
5. **Links** clean, **axe** clean, **375/768/1024/1440** no overflow.
6. **Persist check**: reload AI/CRUD results — they read from DB, not regenerate.

## Anti-patterns banned

- Treating this as a code review — delegate N+1/types/prompt-hygiene to `quality-review-*`.
- Skipping the automated gates and going straight to manual clicking.
- Testing Stripe with live keys, or asserting "payments work" without running the decline/3DS cards.
- Submitting forms only with happy-path data — edge cases are the point.
- Calling a11y "fine" without running axe.
- Verifying AI output once but never reloading to confirm it persisted.
