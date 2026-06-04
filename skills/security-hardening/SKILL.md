---
name: security-hardening
description: Active runtime security protections for the Persimmon Next.js 16 stack — login brute-force throttle + account lockout, IP/route rate limiting (Upstash Redis or Postgres-backed), Content-Security-Policy with per-request nonce, Subresource Integrity on third-party scripts, and NextAuth v5 JWT session hardening (cookie flags, short maxAge, rotation). Use when adding rate limiting, defending a login form against credential stuffing, building a CSP, pinning CDN scripts with SRI, or tightening session cookies. Complements security-nextauth (auth setup) and security-review (audit). Trigger keywords: rate limit, brute force, account lockout, CSP, nonce, Subresource Integrity, SRI, session hardening, credential stuffing, Upstash, ratelimit.
---

# Security Hardening — Persimmon Patterns

Active runtime defenses layered on top of a working auth setup. `security-nextauth` gets you a correct login; `security-review` audits it; **this skill makes it resist attack** — rate limiting, brute-force throttle, CSP construction, SRI, and session cookie hardening.

Scope boundary:
- **Auth wiring** (providers, `trustHost`, callbacks, middleware redirect) → `security-nextauth`.
- **Audit / pass-fail header checklist** → `security-review`.
- **Header *construction* + runtime throttling + session cookie hardening** → here.

## Core rules

1. Every public POST that touches auth or money gets a rate limit. No exceptions.
2. Brute-force throttle is **per-email AND per-IP**, fail-open on store errors (never lock out all users because Redis blipped).
3. CSP ships a **per-request nonce** — never `'unsafe-inline'` on `script-src` in production.
4. Every third-party `<script>` carries `integrity` + `crossorigin`, pinned to an exact version.
5. Session JWT: `httpOnly`, `secure`, `sameSite: "lax"`, short `maxAge`, `__Secure-` cookie prefix.

## 1. Rate limiting — Upstash (preferred) or Postgres (zero-dependency)

### Option A — Upstash Redis (use when traffic > ~10 concurrent users)

```ts
// src/lib/ratelimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL + _TOKEN (server-only)

export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),   // 5 per email/IP per 15 min
  analytics: true,
  prefix: "rl:login",
});

export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),    // general API
  prefix: "rl:api",
});

// fail-open helper: a Redis outage must not 500 every request
export async function allow(
  limiter: Ratelimit,
  key: string,
): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    const { success, reset } = await limiter.limit(key);
    return { ok: success, retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)) };
  } catch {
    return { ok: true, retryAfter: 0 }; // fail open — availability over strictness on infra error
  }
}
```

### Option B — Postgres-backed (no extra service; fine for internal tools)

```prisma
// schema.prisma
model RateHit {
  id        String   @id @default(cuid())
  bucket    String   // e.g. "login:email:foo@x.com" or "login:ip:1.2.3.4"
  createdAt DateTime @default(now())
  @@index([bucket, createdAt])
}
```

```ts
// src/lib/ratelimit-pg.ts
import { db } from "@/lib/db";

export async function allowPg(
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean }> {
  try {
    const since = new Date(Date.now() - windowSec * 1000);
    const count = await db.rateHit.count({ where: { bucket, createdAt: { gte: since } } });
    if (count >= limit) return { ok: false };
    await db.rateHit.create({ data: { bucket } });
    return { ok: true };
  } catch {
    return { ok: true }; // fail open
  }
}
```

Prune in a Railway cron job (see `infra-railway-deploy`):

```ts
// scripts/prune-ratehits.ts — run daily
import { db } from "@/lib/db";
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
await db.rateHit.deleteMany({ where: { createdAt: { lt: cutoff } } });
```

### Wiring the limiter into middleware (edge, before the request hits a route)

```ts
// middleware.ts — extend the auth middleware from security-nextauth
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiLimiter, allow } from "@/lib/ratelimit";

export default auth(async (req) => {
  // Real client IP behind Railway's edge: first hop of x-forwarded-for.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const { ok, retryAfter } = await allow(apiLimiter, `api:${ip}`);
    if (!ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  }
  // ...auth redirect logic from security-nextauth follows
  return NextResponse.next();
});
```

> Upstash works on the edge runtime; Prisma does **not**. Use Option A in middleware, or run Option B inside a Node route handler / Server Action instead of middleware.

## 2. Brute-force throttle on the login itself

The credentials provider's `authorize()` is the real choke point — middleware sees `/api/auth/callback/credentials` but not the email. Throttle inside `authorize()`, **before** the bcrypt compare:

```ts
// inside Credentials({ authorize }) in src/lib/auth.ts
import { headers } from "next/headers";
import { loginLimiter, allow } from "@/lib/ratelimit"; // or allowPg

async authorize(raw) {
  const parsed = LoginInput.safeParse(raw);       // Zod — see stack-zod-boundary
  if (!parsed.success) return null;
  const email = parsed.data.email;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  // Per-email AND per-IP. Either tripping = reject. Fail-open inside allow().
  const [byEmail, byIp] = await Promise.all([
    allow(loginLimiter, `login:email:${email}`),
    allow(loginLimiter, `login:ip:${ip}`),
  ]);
  if (!byEmail.ok || !byIp.ok) return null; // generic null — no "locked out" enumeration signal

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  // Constant-ish branch: still run a compare on a dummy hash when user is missing,
  // so response time doesn't leak whether the email exists.
  const hash = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const ok = await bcrypt.compare(parsed.data.password, hash);
  if (!user || !ok) return null;

  return { id: user.id, email: user.email, role: user.role };
}
```

`DUMMY_BCRYPT_HASH` is a precomputed `bcrypt.hash("x", 12)` constant. This is timing-attack and enumeration defense in one. Keep error messaging generic in the form (`security-nextauth` covers the UI side).

## 3. Content-Security-Policy with a per-request nonce

CSP is set in **middleware** (needs a fresh nonce per request), not `next.config.ts` (static). The static `headers()` block in `security-review` covers HSTS/X-Frame/etc.; CSP graduates to middleware here.

```ts
// middleware.ts (CSP portion)
export default auth(async (req) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,            // Tailwind injects inline styles; acceptable
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self' https://api.anthropic.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce); // read in the layout to tag scripts

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});
```

Consume the nonce in the root layout (Next reads it for its own inline runtime scripts automatically when present on `x-nonce`):

```tsx
// src/app/layout.tsx
import { headers } from "next/headers";
import Script from "next/script";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html>
      <body>
        {children}
        {/* any inline/third-party script must carry the nonce */}
        <Script id="analytics" nonce={nonce} strategy="afterInteractive" src="..." />
      </body>
    </html>
  );
}
```

`'strict-dynamic'` lets a nonce'd loader pull its own dependencies without you allowlisting every CDN host — the modern, maintainable CSP. Report-only first if unsure: ship `Content-Security-Policy-Report-Only` for a week, watch console violations, then enforce.

## 4. Subresource Integrity on third-party scripts

Any script not served from your own origin gets `integrity` + `crossOrigin`, pinned to an exact version.

```tsx
import Script from "next/script";

<Script
  src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
  integrity="sha384-<base64-hash>"
  crossOrigin="anonymous"
  strategy="afterInteractive"
  nonce={nonce}
/>
```

Generate the hash:

```bash
curl -s https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

Rules: **pin exact versions** (never `@latest` — the hash won't match), regenerate the hash on every version bump, and prefer self-hosting the asset (`/public`) over a CDN when feasible — then SRI and the CDN host allowlist both become moot.

## 5. Session hardening (NextAuth v5 JWT)

`security-nextauth` sets up the session; harden the cookie + lifetime here:

```ts
// src/lib/auth.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8, updateAge: 60 * 60 }, // 8h, refresh hourly
  cookies: {
    sessionToken: {
      name: "__Secure-authjs.session-token",   // __Secure- prefix → HTTPS-only enforced by browser
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    },
  },
  jwt: { maxAge: 60 * 60 * 8 },
  // ...
});
```

| Setting | Value | Why |
|---|---|---|
| `httpOnly` | `true` | JS can't read the token → XSS can't exfiltrate the session |
| `secure` | `true` | cookie only over HTTPS (Railway terminates TLS at edge) |
| `sameSite` | `"lax"` | blocks CSRF on cross-site POST while allowing top-level nav |
| cookie prefix | `__Secure-` | browser refuses the cookie if `secure` is absent — belt and suspenders |
| `maxAge` | 8h | short-lived; JWT can't be server-revoked, so don't make it long-lived |

JWT can't be revoked server-side. For forced logout / revocation, either keep `maxAge` short (preferred for internal tools) or switch to `strategy: "database"` (DB round-trip per request — only if you genuinely need revocation). Rotate `AUTH_SECRET` to invalidate *all* sessions on compromise.

## One-screen defaults

| Concern | Persimmon default |
|---|---|
| Login throttle | 5 / email / 15 min **and** 5 / IP / 15 min, inside `authorize()` |
| API rate limit | 60 / IP / min in middleware |
| Sensitive (password reset, checkout) | 3–10 / IP / min |
| Store | Upstash `slidingWindow` (>10 users) or Postgres `RateHit` (small) |
| Fail mode | **fail-open** on store errors |
| CSP | nonce + `'strict-dynamic'` in middleware; report-only → enforce |
| Inline styles | `'unsafe-inline'` on `style-src` only (Tailwind), never `script-src` |
| SRI | every third-party script, exact version pinned |
| Session | `__Secure-` cookie, httpOnly+secure+lax, 8h maxAge |
| Client IP | first hop of `x-forwarded-for` (Railway edge) |

## Anti-patterns banned

- **Fail-closed rate limiting** — a Redis/DB outage that 429s or 500s every user is a self-inflicted DoS. Always `try/catch → allow`.
- **`'unsafe-inline'` on `script-src`** in production — defeats the entire point of CSP. Use a nonce.
- **CSP in `next.config.ts`** — it's static, so the nonce is reused across all requests → useless. CSP belongs in middleware.
- **Throttling only by IP** — shared NATs and corporate proxies make one IP many users; credential stuffing rotates IPs. Throttle by email too.
- **Returning "account locked" / "too many attempts for this email"** — leaks which emails exist. Return generic `null`.
- **`@latest` on a CDN script with SRI** — the hash breaks on the next publish; the script silently fails to load.
- **Long-lived JWT sessions** (days/weeks) — can't be revoked; a stolen token stays valid. Keep maxAge short.
- **Reading `req.ip` or `nextUrl.host` for the client IP** behind Railway — it's the edge/internal host. Use `x-forwarded-for`.
- **Skipping the dummy-hash compare** when the user is missing — response timing leaks email existence.

## Cross-references

- `security-nextauth` — auth setup, `authorize()`, middleware redirect, `x-forwarded-host`
- `security-review` — static header checklist (HSTS, X-Frame, nosniff) + audit pass/fail
- `security-demo-credentials` — demo login pattern; pairs its own rate-limit note with this skill's limiter
- `stack-zod-boundary` — validating `authorize()` input and rate-limit route bodies
- `infra-railway-deploy` — Upstash env vars, the prune cron job, edge vs Node runtime
