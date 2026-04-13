---
name: nextauth-credentials
description: NextAuth.js v5 credentials-provider setup with Prisma adapter for the Persimmon stack. Use when scaffolding auth, configuring `auth.ts`, writing login forms, setting up middleware route protection, debugging `UntrustedHost`, handling `x-forwarded-host` on Railway, typing the session object, or migrating from NextAuth v4 `getServerSession` to v5 `auth()`. Covers bcryptjs password hashing, JWT session strategy, callbacks, rate limiting, and the `trustHost: true` rule behind Railway's edge.
---

# NextAuth v5 Credentials — Persimmon Patterns

NextAuth v5 (sometimes called Auth.js) replaces the v4 `getServerSession` API with a universal `auth()` function that works in Server Components, Server Actions, middleware, and route handlers. Persimmon projects use the credentials provider with Prisma adapter + JWT sessions for internal tools where self-hosting the identity is the point.

## The `trustHost: true` Rule — Non-Negotiable Behind Railway

Every Persimmon production deploy sits behind Railway's edge proxy. The browser hits `sistema.client.com.br`, Railway's edge terminates TLS, and forwards to the container on `*.up.railway.app`. By default NextAuth rejects this as a potential host header attack and throws `UntrustedHost` on every request.

**Fix (mandatory):**

```ts
// src/lib/auth.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,   // MANDATORY behind Railway / any reverse proxy
  // ...
});
```

Omitting this causes 100% of prod requests to fail with no useful error in logs. If you see `UntrustedHost` once, the entire app is broken for everyone.

## Minimum Viable `auth.ts`

```ts
// src/lib/auth.ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8-hour sessions
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(raw) {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, passwordHash: true, role: true },
        });

        // Generic error path — don't disclose whether the email exists.
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, `user` is populated from authorize().
      if (user) {
        token.sub = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
}
```

### What to put in the JWT — and what NOT to

The JWT travels in a cookie on every request. Keep it small:

- ✅ `sub` (user id), `role`, `exp`, `iat` — always
- ✅ A small set of flags that drive UI (e.g. `isAdmin`) — if they rarely change
- ❌ Full user object (name, email, profile image) — re-fetch from DB in the page when needed
- ❌ Arrays (permissions, feature flags) — put on a `db.user.findUnique` behind `auth()`
- ❌ Anything PII beyond email — unnecessary exposure

If the JWT exceeds 4KB, browsers start rejecting the cookie. Seen it, debugged it, not fun.

## Route Handler — The `[...nextauth]` Catch-All

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

One line. Do not customize. Do not add middleware to this route — NextAuth handles its own.

## Middleware — Route Protection + `x-forwarded-host`

```ts
// middleware.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export default auth((req) => {
  const { nextUrl } = req;
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    // Build the callback URL using x-forwarded-host so the redirect lands
    // on the custom domain, not the internal *.up.railway.app host.
    const host = req.headers.get("x-forwarded-host") ?? nextUrl.host;
    const proto = req.headers.get("x-forwarded-proto") ?? nextUrl.protocol.replace(":", "");
    const origin = `${proto}://${host}`;
    const callbackUrl = encodeURIComponent(`${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(`${origin}/login?callbackUrl=${callbackUrl}`);
  }

  return NextResponse.next();
});

export const config = {
  // Protect everything except static, images, favicon, and auth itself.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|public).*)"],
};
```

**Why `x-forwarded-host`**: behind Railway's edge, `req.nextUrl.host` is the internal `abc-production.up.railway.app`. If you redirect to that, the user lands on the Railway-issued URL instead of the client's custom domain, and the session cookie (scoped to the custom domain) doesn't apply. Result: infinite redirect loop.

## Calling `auth()` in Server Components & Actions

```tsx
// src/app/processes/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic"; // mandatory — reads auth() at request time

export default async function ProcessesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const processes = await db.process.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return <ProcessList processes={processes} />;
}
```

```ts
// Inside a Server Action
"use server";
import { auth } from "@/lib/auth";

export async function deleteProcess(id: string) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Não autenticado." };
  // ...
}
```

### v4 → v5 migration cheat sheet

| v4 | v5 |
|---|---|
| `getServerSession(authOptions)` | `await auth()` |
| `import { authOptions }` + `NextAuth(authOptions)` in `/api/auth/[...nextauth]/route.ts` | `export const { handlers } = NextAuth({...})` in `src/lib/auth.ts` |
| `useSession()` (client) | Same — still works |
| `signIn("credentials", { email, password, redirect: false })` | Same on client; on server use `signIn` from `@/lib/auth` |

## Session Type Augmentation

```ts
// src/types/next-auth.d.ts
import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    role?: string;
  }
}
```

Include this file in `tsconfig.json` `"include"` (it usually is by default via `**/*.d.ts`). Without it, `session.user.id` is `any`.

## Login Form Pattern

```tsx
// src/app/login/login-form.tsx
"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        redirect: false,
      });
      if (res?.error) {
        // ALWAYS generic. Never "email not found" or "wrong password".
        setError("E-mail ou senha incorretos.");
        return;
      }
      router.push(params.get("callbackUrl") ?? "/");
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="email" type="email" required autoComplete="email" />
      <input name="password" type="password" required autoComplete="current-password" />
      {error && <p className="text-oxblood text-sm">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
```

## Password Hashing — bcryptjs

Use `bcryptjs` (pure JS), not `bcrypt` (native bindings). Railway build containers can't compile native modules reliably.

```ts
import bcrypt from "bcryptjs";
const passwordHash = await bcrypt.hash(plaintext, 12);
const ok = await bcrypt.compare(plaintext, user.passwordHash);
```

Cost 12 is the current sane default (100–300ms on a modern CPU). 10 is too fast, 14 is too slow for interactive login.

## Seeding the First User

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD required");

  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.SEED_ADMIN_NAME ?? "Admin",
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
    },
  });
}

main().finally(() => db.$disconnect());
```

Run with `npx tsx prisma/seed.ts` locally and once on Railway after deploy. Idempotent.

## Rate Limiting Login Attempts

The credentials provider is a public endpoint. Add rate limiting. Minimum viable — per-email + per-IP, stored in a small table:

```prisma
model LoginAttempt {
  id        String   @id @default(cuid())
  email     String
  ip        String
  createdAt DateTime @default(now())
  @@index([email, createdAt])
  @@index([ip, createdAt])
}
```

In `authorize()`, BEFORE the bcrypt compare, count attempts in the last 15 minutes and reject if over threshold (5 per email, 20 per IP). On failed compare, insert a row. On success, delete old rows for that email.

Upgrade to Upstash Ratelimit + Redis when the client has traffic > 10 concurrent users.

## Environment Variables

```
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://sistema.client.com.br   # optional in v5 when trustHost: true
DATABASE_URL=postgresql://...
```

`AUTH_SECRET` is the only required var (v5 renamed from `NEXTAUTH_SECRET`). Missing = runtime crash.

## Anti-Patterns

### Disclosing which field failed

```ts
// WRONG — tells attackers which emails are registered
if (!user) return null;          // "email not found"
if (!ok) throw new Error("wrong password");
```

Return `null` in both cases. Client shows one generic message.

### Storing the role in the client

```ts
// WRONG — user can set their own cookie in devtools
document.cookie = "role=admin";
```

Role comes from the JWT, which is signed with `AUTH_SECRET`. Server re-reads it every request via `auth()`.

### Not rotating AUTH_SECRET on compromise

Treat it like a DB password. Leaked secret = all sessions forgeable.

### Using session strategy `database` with credentials provider

Works but adds a DB round trip per request. For Persimmon internal tools, JWT is simpler and faster. Only switch to `database` if you need server-side session revocation.

### Skipping `trustHost` "because it works locally"

It works locally because `localhost:3000` is the host in dev. Production breaks. Set it on day 1.

## Checklist for a New Persimmon Auth Setup

- [ ] `src/lib/auth.ts` exports `{ handlers, auth, signIn, signOut }`
- [ ] `trustHost: true` is set
- [ ] `session.strategy = "jwt"`, maxAge chosen
- [ ] `authorize()` validates input with Zod, uses bcryptjs, returns `null` on any failure
- [ ] `jwt` and `session` callbacks add `user.id` and `role` to the session
- [ ] `src/types/next-auth.d.ts` augments `Session` and `JWT`
- [ ] `middleware.ts` reads `x-forwarded-host` when redirecting
- [ ] `/api/auth/[...nextauth]/route.ts` re-exports handlers
- [ ] Seed script creates first admin
- [ ] `AUTH_SECRET` set in Railway env
- [ ] Login form shows generic errors only
- [ ] Rate limiting on `authorize()` or planned in the backlog

## Cross-References

- **nextjs-server-actions** — calls `auth()` inside actions
- **zod-boundary-validation** — schema for `authorize()` input
- **prisma-pgvector** — the `db` instance this skill uses
- **typescript-strict-patterns** — session type augmentation
