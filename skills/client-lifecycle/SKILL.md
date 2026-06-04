---
name: client-lifecycle
description: Index of Persimmon client-facing lifecycle skills — onboarding/brand extraction, transactional email, SEO metadata, analytics, and handoff/training for client engagements. Persimmon clients keep the code and the keys; these skills cover the start-of-engagement intake and the end-of-engagement delivery. Use when onboarding a new client, extracting brand assets, setting up transactional email, adding SEO/structured data, wiring analytics, or producing a handoff manual and training. Routes to the right specialist child. Trigger keywords: client, onboarding, brand, brand guide, project brief, handoff, training, user manual, transactional email, Resend, SEO, metadata, sitemap, JSON-LD, analytics, GA4, conversion tracking, deliverability.
---

# Client-lifecycle — Index

Persimmon engagements are scoped: the client keeps the code and the keys, no subscription lock-in. This mother covers the **bookends** of an engagement — intake/branding at the start, and email/SEO/analytics/handoff toward delivery. This is a map; follow the child for the work.

## Trigger

- "Onboard a new client / extract their brand"
- "Set up transactional email / improve deliverability"
- "Add SEO metadata / structured data / sitemap"
- "Wire up analytics / conversion tracking"
- "Produce the handoff manual and train the client"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `client-onboarding` | Start of engagement | Playwright site audit, brand/asset extraction → `docs/PROJECT-BRIEF.md` + `docs/BRAND-GUIDE.md` |
| `client-transactional-email` | Sending email | Resend (primary) / SendGrid (alt) wrapper, HTML templates, SPF/DKIM/DMARC, retries |
| `client-seo` | Public-facing pages | Next 16 Metadata API, JSON-LD, `app/sitemap.ts`, `app/robots.ts`, OG, `/llms.txt` |
| `client-analytics` | Tracking | GA4/GTM via `@next/third-parties`, Meta Pixel, consent gating, conversion events |
| `client-handoff` | End of engagement | Non-technical admin manual, walkthrough, training agenda; client owns repo + keys |

## How to route

1. **New client** → `client-onboarding` (after `meta-new-client-project` creates the repo).
2. **Going live, public site** → `client-seo` + `client-analytics`, email via `client-transactional-email`.
3. **Delivering** → `client-handoff` (after `quality-final-review` and `meta-deployment-plan`).

## Persimmon client-lifecycle defaults — one-screen summary

- **The client owns the repo and the keys** — every credential, env var, and bucket is theirs; document them at handoff.
- **Email** through one `src/lib/email/` wrapper (Resend default); verify SPF/DKIM/DMARC before launch.
- **SEO** via the Next 16 Metadata API and file conventions (`app/sitemap.ts`, `app/robots.ts`) — not hand-rolled `<head>` tags.
- **Analytics IDs are the sanctioned `NEXT_PUBLIC_*` exception**; everything else stays server-side. Gate tracking behind consent.
- **Brand + handoff artifacts are durable docs** in the client repo, not throwaway chat output.

## Anti-patterns banned

- Hardcoding the client's API keys, or leaving them in Persimmon's accounts at handoff
- Sending email straight from a Server Action instead of through the `src/lib/email/` wrapper
- Hand-rolled `<head>` SEO tags instead of `generateMetadata`
- Firing analytics/pixels before consent
- Delivering without a written admin manual and credential inventory

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `project-meta` | `meta-new-client-project` precedes onboarding; `meta-deployment-plan` pairs with handoff |
| `quality` | `quality-final-review` + `quality-production-readiness` gate delivery before `client-handoff` |
| `frontend` | `frontend-public-site-conventions` styles the pages these skills instrument |
| `stack` / `infra` | Email/analytics wrappers live in `src/lib/`; `infra-railway-deploy` owns the env vars handed over |
