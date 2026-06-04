---
name: quality-production-readiness
description: Broad pre-launch / go-live checklist for Persimmon Next.js 16 + Prisma + Railway projects. Audits Railway deploy config (PORT 8080, force-dynamic, env vars, custom domain), NextAuth/trustHost, error boundaries and logging, Postgres/backup integrity, Stripe live-key cutover, SEO/metadata, accessibility, and client handoff readiness. Delegates deep code-level checks to the review-* skills and security-review rather than restating them. Use before any client handoff, production cutover, or domain switch. Trigger keywords — production ready, go live, pre-launch check, launch checklist, ship to production, cutover, handoff, audit.
---

# Production Readiness — Persimmon Patterns

Broad pre-launch checklist that confirms a Persimmon build is actually deployable, operable, and handoff-ready. This is the **operational/launch layer**: deploy config, runtime, ops, content, handoff. It does **not** re-audit code internals — for those, run the focused reviews:

| Concern | Owning skill |
|---|---|
| Security (headers, auth, injection, secrets, uploads, prompt-injection, deps) | `security-review` |
| Performance (RSC, bundle, CWV, N+1, caching) | `quality-review-performance` |
| Type safety (strict, `any`, Zod boundaries) | `quality-review-type-safety` |
| Data layer (schema, migrations, transactions, pgvector) | `quality-review-data-layer` |
| AI output (prompt hygiene, citations, evals) | `quality-review-prompt-output` |
| **All of the above, aggregated, ship/no-ship verdict** | `quality-final-review` |

**Run `quality-final-review` first** (it dispatches every review-* + `security-review`). This skill covers what those don't: getting the thing live and handed off. Cross-link, don't duplicate.

## Trigger

"production ready", "go live", "pre-launch", "launch checklist", "cutover", "handoff", or any imminent production deploy / domain switch.

## Evidence Rule

Every check is PASS / WARN / FAIL with a file:line or command output. Never assert "looks fine". Baseline commands:

```bash
cd "$PROJECT_ROOT"
npx tsc --noEmit            # must exit 0
npx eslint .                # must exit 0
npx prisma validate         # schema sound
npm run build               # Next build must succeed (catches prerender crashes)
npm test                    # if a suite exists
curl -sI "$SITE_URL" | head -30   # live headers / status
```

---

## 1. Railway Deploy Config

The Persimmon-specific failure surface. See `infra-railway-deploy` for fixes.

- [ ] **`force-dynamic` on every DB/`auth()` page** — Next 16 prerenders by default; the build container has no DB path, so any page reading the DB or `auth()` at request time crashes the build. Confirm `export const dynamic = "force-dynamic"` is present.
  ```bash
  grep -rL 'force-dynamic' src/app --include='page.tsx' | xargs grep -l 'auth()\|prisma\|from "@/lib/db"' 2>/dev/null
  ```
- [ ] **Container port = 8080** — Railway sets `PORT=8080`; the public domain `targetPort` must match (not 3000). Mismatch = 502.
- [ ] **`npm run build` succeeds locally** — green build is the single best prerender-crash predictor before pushing.
- [ ] **All env vars set in Railway** — `DATABASE_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `ANTHROPIC_API_KEY`, S3 keys, `NEXTAUTH_URL`. None in `NEXT_PUBLIC_*` (that ships secrets to the client — `security-review` blocks on this).
- [ ] **Schema applies on deploy** — exactly one of `prisma db push` (build step) or `prisma migrate deploy` (release job). Pick one per project; don't run both.
- [ ] **Custom domain wired + SSL valid** — `curl -sI https://customdomain` returns 200 over TLS, not a `*.up.railway.app` redirect loop. No staged-config drift (Settings → Source disconnect/reconnect drains a stuck draft).
- [ ] **Auto-deploy on `main`** — push-to-deploy confirmed; rollback = redeploy a prior commit from the Railway dashboard.

## 2. Runtime & Error Handling

cPanel PHP error logs → Railway logs + Next error boundaries.

- [ ] **`error.tsx` + `not-found.tsx` exist** — at least at the app root, ideally per route segment. No raw Next error overlay reaches users in production.
- [ ] **`global-error.tsx` present** — catches render failures in the root layout.
- [ ] **No `console.log` of PII / secrets / document contents** — redact in error reports.
  ```bash
  grep -rn 'console\.\(log\|error\|warn\)' src/ | grep -i 'password\|token\|secret\|email\|cpf\|document'
  ```
- [ ] **No leftover debug output** — `console.log`, `debugger`, `TODO`-fail stubs removed from request paths.
- [ ] **Railway logs are clean on smoke test** — load the live site, exercise one core flow, confirm no unhandled exceptions or stack traces in `railway logs`.
- [ ] **Claude calls wrapped in retry** — exponential backoff (3 retries: 1s→4s→16s); 529/overloaded is common. SDK default of 2 is too low under load.

## 3. Data & Backup Integrity

MySQL backup → Postgres / Railway backups.

- [ ] **Railway Postgres backups enabled** — automated snapshots on, retention known.
- [ ] **Pre-cutover snapshot taken** — manual backup immediately before go-live; restore path documented.
- [ ] **Migrations are reversible / backfilled** — no destructive migration without a backfill (a `quality-final-review` block condition). `prisma migrate status` clean.
- [ ] **AI outputs persisted, never regenerated on load** — every Claude result short-circuits to the DB if it exists (expensive + non-deterministic otherwise). Spot-check the read path.
- [ ] **pgvector index present if RAG** — HNSW (`vector_cosine_ops`) built; queries filtered. Deep check lives in `quality-review-data-layer`.
- [ ] **Seed/demo data not leaking to prod** — demo accounts gated behind an env + hostname check; never live on the production domain.

## 4. Payments — Stripe Cutover (if applicable)

Stack-agnostic; test cards unchanged. Use the `stripe:test-cards` skill for the full matrix.

- [ ] **Live keys set, not `sk_test_`/`pk_test_`** — and only server-side (never `NEXT_PUBLIC_`).
- [ ] **Webhook endpoint registered at production URL** — and signature verified via the `stripe-signature` header, not trusting the POST body.
- [ ] **Amounts in cents** — no off-by-100× ($50 = `5000`).
- [ ] **Smoke charge + refund** — one real test-mode charge (`4242 4242 4242 4242`) and refund succeed end to end before flipping to live.
- [ ] **No card data logged or stored.**
- [ ] **Webhook handler validates payload with Zod** — it's a trust boundary like any other.

## 5. SEO & Metadata

Next App Router `metadata` API, not `<head>` tags.

- [ ] **`metadata` / `generateMetadata` per route** — unique `title` (<60 chars) + `description` (120–160). No duplicated defaults.
- [ ] **Open Graph + Twitter card** on shareable pages (`openGraph`, `twitter` in `metadata`).
- [ ] **`app/sitemap.ts` and `app/robots.ts`** present and not blocking real pages.
- [ ] **Favicon / `app/icon.png`** set.
- [ ] **`metadataBase` set** — otherwise OG image URLs resolve relative and break.
- [ ] **Internal-only tools `noindex`** — admin/client dashboards should not be crawlable.

## 6. Accessibility & Mobile

Keep — verify with axe + Playwright (see `quality-testing-validation` / `quality-playwright-e2e`).

- [ ] **axe scan clean** on key routes — no serious/critical violations.
- [ ] **Responsive at 375px** — no horizontal overflow; touch targets ≥44px.
- [ ] **All images have meaningful `alt`** — Next `<Image>` `alt` prop present (decorative = `alt=""`).
- [ ] **Forms keyboard-navigable, inputs labelled** — correct `type` (`email`, `tel`) for mobile keyboards.
- [ ] **One `<h1>` per page, logical heading order, `lang` on `<html>`.**

## 7. Security Headers (delegated)

Don't re-audit here — `security-review` owns the full pass. Just confirm it ran and the four headers landed in `next.config.ts`:

- [ ] `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] `trustHost: true` in `auth.ts` (mandatory behind Railway's edge).
- [ ] `curl -sI "$SITE_URL"` shows the headers live.

If `security-review` hasn't run, run it now — do not hand-roll the check.

## 8. Client Handoff

- [ ] **Admin credentials delivered** to the client (out of band, not in the repo).
- [ ] **Demo credentials gated** — env + hostname check; never render on the production domain.
- [ ] **Core user flows verified end to end** on the live site (login → primary CRUD/RAG flow → result persisted). Automate via `quality-playwright-e2e`.
- [ ] **Contact/intake forms deliver** to the client's real inbox.
- [ ] **Browser pass** — Chrome, Safari, Firefox, Edge + mobile Safari/Chrome.
- [ ] **Analytics installed** if scoped.
- [ ] **Client docs present** — `CLAUDE.md`, `README.md` (status table), `docs/reference/scope-of-work.md`. No financials in README, no architecture in README.
- [ ] **CI green on `main`** — `infra-github-ci` (lint, typecheck, `prisma validate`, build).

---

## One-Screen Summary

1. **Run `quality-final-review` first** — it covers security/perf/types/data/AI. This skill is the launch+ops layer on top.
2. **Build must be green** — `tsc --noEmit`, `eslint`, `prisma validate`, `npm run build`, all exit 0. That alone catches most Railway prerender crashes.
3. **`force-dynamic` on every DB/`auth()` page**; **port 8080**; secrets server-side only.
4. **Snapshot the DB before cutover.** AI outputs persisted, never regenerated.
5. **Stripe live keys + verified webhook**; amounts in cents; smoke charge+refund.
6. **error.tsx / not-found.tsx / global-error.tsx** exist; Railway logs clean on smoke test.
7. **Metadata, sitemap, robots, favicon**; axe clean; 375px responsive.
8. **Handoff**: gated demo creds, core flows verified live, client docs present, CI green.

### Output Format

```
=== PRODUCTION READINESS — {project} — {date} ===
Reviews (delegated):  final-review VERDICT: [SHIP | WAIVER | DON'T SHIP]
Railway Deploy:    n/m PASS | _ WARN | _ FAIL
Runtime/Errors:    n/m PASS | _ WARN | _ FAIL
Data/Backup:       n/m PASS | _ WARN | _ FAIL
Payments:          n/m PASS | _ WARN | _ FAIL
SEO/Metadata:      n/m PASS | _ WARN | _ FAIL
A11y/Mobile:       n/m PASS | _ WARN | _ FAIL
Sec Headers:       n/m PASS | _ WARN | _ FAIL  (see security-review)
Handoff:           n/m PASS | _ WARN | _ FAIL

GO-LIVE: [GO | GO WITH WAIVERS | NO-GO]

=== BLOCKERS ===
1. [FAIL] src/app/processes/page.tsx — reads prisma, no force-dynamic → build will crash on Railway
2. [FAIL] ANTHROPIC_API_KEY exposed as NEXT_PUBLIC_ in .env → secret in client bundle (see security-review)
```

## Anti-patterns banned

- Re-auditing code internals here instead of delegating to `security-review` / `quality-review-*`.
- Declaring go-live without a green `npm run build` (Railway prerender crash waiting to happen).
- A DB/`auth()` page missing `export const dynamic = "force-dynamic"`.
- Any secret in `NEXT_PUBLIC_*`; live Stripe keys client-side.
- Cutover without a fresh DB snapshot or a documented rollback.
- Regenerating AI output on page load instead of reading the persisted result.
- Demo credentials reachable on the production domain.
- Marking a check PASS without evidence (file:line or command output).
