---
name: security
description: Index of Persimmon security skills — NextAuth v5 authentication and the security review pass (headers, auth, injection, secret exposure, CSP, dependency CVEs). Use when implementing auth/login/sessions or auditing a project for security before delivery. Routes to the right specialist child skill. Trigger keywords: auth, login, NextAuth, session, trustHost, middleware, security review, audit, CSP, headers, secrets, injection.
---

# Security — Index

Persimmon security = NextAuth v5 (credentials/OAuth) with a Prisma adapter and JWT sessions, plus a dedicated security review pass before delivery. This mother is a map; follow the child for the actual work.

## Trigger

- "Add auth / login" / "NextAuth" / "sessions" / "protect this route"
- "Security review" / "audit before delivery" / "check headers / CSP"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `security-nextauth` | Implementing or fixing auth | NextAuth v5 credentials + Prisma adapter, JWT sessions, `trustHost: true`, middleware reading `x-forwarded-host`, route protection |
| `security-review` | Pre-delivery audit (also part of `quality`) | Headers, auth gaps, injection, secret exposure, CSP, dependency CVEs |

## How to route

1. **Auth work?** → `security-nextauth`.
2. **Auditing?** → `security-review` (invoked standalone or via `quality-final-review`).

## Persimmon security defaults — one-screen summary

- **NextAuth v5 behind Railway**: `trustHost: true` is mandatory; middleware redirects must read `x-forwarded-host` or users bounce to `*.up.railway.app`.
- **Secrets server-side only** — never `NEXT_PUBLIC_*`, never in client bundles.
- **Headers** in `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Validate every boundary input** with Zod (see `stack-zod-boundary`).
- **Never log** secrets, PII, or document contents — redact in error reports.

## Anti-patterns banned

- NextAuth without `trustHost` behind a proxy
- Redirects using the internal host instead of `x-forwarded-host`
- Secrets in `NEXT_PUBLIC_*`
- Logging PII / document contents
- Missing security headers in `next.config.ts`

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `stack` | Boundary validation via `stack-zod-boundary` |
| `quality` | `security-review` is one dimension of `quality-final-review` |
| `infra` | Header config ships in the deployed app (`infra-railway-deploy`) |
