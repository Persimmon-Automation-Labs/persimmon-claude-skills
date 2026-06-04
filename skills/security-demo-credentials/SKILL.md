---
name: security-demo-credentials
description: Standardized demo/staging login credentials for Persimmon internal tools, with defense-in-depth so they can never render in production — a server-only env+hostname gate (process.env + host check), a two-role default (admin + user), and copy-to-clipboard UX (never autofill). Use when building a new tool's login page, adding a staging/demo mode, pre-flighting a client demo, or migrating an existing project to the credentials standard. Complements security-nextauth (auth) and security-hardening (demo-login rate limiting). Trigger keywords: demo credentials, staging login, demo mode, copy-to-clipboard, env gate, hostname allowlist, noindex, seed admin.
---

# Demo Credentials — Persimmon Patterns

Every Persimmon internal tool with auth ships the same two demo accounts on its **staging/demo** login page, in the same format, gated so they physically cannot appear in production. Goal: no one has to remember which login belongs to which client, and a misconfigured env var still can't leak creds to a live client domain.

Scope boundary:
- **Auth wiring / `authorize()` / sessions** → `security-nextauth`.
- **Rate-limiting the demo login** (bots scrape demo creds) → `security-hardening`.
- **The demo-creds standard + the env+host gate + the login-page UI** → here.

## The Persimmon standard (defaults)

| Role  | Email                | Password      |
|-------|----------------------|---------------|
| Admin | `admin@persimmon.local` | `password`    |
| User  | `user@persimmon.local`  | `password123` |

Persimmon login forms take **email** (NextAuth credentials provider keys on email). Use the `.local` TLD — RFC 6762 reserved, guaranteed never to resolve to a real mailbox.

- **Two roles only** (admin + user) — "the boss + the employee." A third role adds cognitive load without clarifying anything.
- **Simple memorable values** — chosen for demo speed. Security comes from the env+host gate below, **not** password complexity. These never render in production.
- **Never `admin/admin`** — identical strings for both fields read as "default never changed" and erode client trust.

Override per project only on client request; document overrides in the project's `README.md`.

## When to display — defense in depth (env AND host)

The credentials block renders **only when BOTH are true**:

1. A non-production app env (`APP_ENV` is `demo` or `staging`).
2. The request hostname is on the Persimmon demo allowlist.

**AND, not OR.** A production deploy accidentally carrying `APP_ENV=demo` still won't leak, because a real client domain (`sistema.piccino.com.br`) isn't on the allowlist. Two independent failures required to leak.

### Server-only gate

```ts
// src/lib/demo.ts  — server module; never imported into a client component
import "server-only";
import { headers } from "next/headers";

const DEMO_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "staging.persimmon.dev",
  // add the project's Railway preview/staging host here
]);

export async function isDemo(): Promise<boolean> {
  const env = process.env.APP_ENV ?? "production";
  if (env !== "demo" && env !== "staging") return false;

  // Behind Railway's edge, the real host is x-forwarded-host (see security-nextauth).
  const h = await headers();
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const host = raw.split(":")[0].toLowerCase();
  return DEMO_HOSTS.has(host);
}

export function demoCredentials() {
  return [
    { role: "Admin", email: "admin@persimmon.local", password: "password" },
    { role: "User",  email: "user@persimmon.local",  password: "password123" },
  ] as const;
}
```

`import "server-only"` makes the build fail loudly if this module is ever pulled into a client bundle — so the hostname allowlist and gate logic can never ship to the browser.

### Login page — gate on the server, pass to a client component

```tsx
// src/app/login/page.tsx  (Server Component)
import { isDemo, demoCredentials } from "@/lib/demo";
import { DemoCreds } from "./demo-creds";
import { LoginForm } from "./login-form"; // from security-nextauth

export const dynamic = "force-dynamic"; // reads headers() at request time

export default async function LoginPage() {
  const showDemo = await isDemo();
  return (
    <main>
      {showDemo && <DemoCreds creds={demoCredentials()} />}
      <LoginForm />
    </main>
  );
}
```

### Copy-to-clipboard client component — NOT autofill

Render **above** the form (Filament/AdminLTE consensus — never below, never beside):

```tsx
// src/app/login/demo-creds.tsx
"use client";
import { useState } from "react";

type Cred = { role: string; email: string; password: string };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // older-browser fallback: select so the user can Cmd/Ctrl+C
      const r = document.createRange();
      r.selectNodeContents(document.getElementById(`v-${value}`)!);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="relative inline-flex items-center gap-2 rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm hover:border-zinc-500"
    >
      <span id={`v-${value}`}>{value}</span>
      {copied && (
        <span className="absolute inset-0 flex items-center justify-center rounded bg-green-600 font-sans font-semibold text-white">
          Copiado
        </span>
      )}
    </button>
  );
}

export function DemoCreds({ creds }: { creds: readonly Cred[] }) {
  return (
    <aside
      role="region"
      aria-label="Credenciais de demonstração"
      className="mb-5 rounded-md border border-amber-300 bg-amber-50 p-4"
    >
      <p className="mb-3 text-sm">
        <strong>Ambiente de demonstração</strong> — qualquer pessoa pode entrar. Não insira dados reais.
      </p>
      {creds.map((c) => (
        <div key={c.role} className="mb-2 grid grid-cols-[60px_1fr_1fr] items-center gap-2">
          <span className="text-sm font-semibold">{c.role}</span>
          <CopyButton value={c.email} />
          <CopyButton value={c.password} />
        </div>
      ))}
    </aside>
  );
}
```

**Never autofill.** Copy-only because:
1. **Training** — forces a conscious "log in", building muscle memory for real creds.
2. **Hygiene** — teaches that auto-fill-on-click is *not* normal (phishing defense).
3. **Clarity** — the button shows which string maps to which field, no mangling surprises.

## Seeding the demo users — hashes only, never plaintext in code

Reuse the `security-nextauth` seed shape. Passwords are documented in `README.md`; the seed stores **bcryptjs hashes**, never plaintext.

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO = [
  { email: "admin@persimmon.local", name: "Admin", role: "admin", password: "password" },
  { email: "user@persimmon.local",  name: "User",  role: "user",  password: "password123" },
];

async function main() {
  // Guard: never seed demo accounts into a production database.
  if ((process.env.APP_ENV ?? "production") === "production") {
    throw new Error("Refusing to seed demo users with APP_ENV=production");
  }
  for (const u of DEMO) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 12),
      },
    });
  }
}

main().finally(() => db.$disconnect());
```

Run with `APP_ENV=demo npx tsx prisma/seed.ts`. Idempotent. The `APP_ENV=production` guard is a third independent safeguard — even the data layer refuses demo accounts in prod.

## Production safety layers (in addition to the env+host gate)

1. **`robots: { index: false, follow: false }`** via Next metadata on demo deploys (robots.txt must NOT block — crawlers need to read the noindex tag).
2. **`X-Robots-Tag: noindex`** header on staging, set in middleware when `APP_ENV !== "production"`.
3. **Rate-limit demo logins** — bots scrape demo creds; apply the login limiter from `security-hardening` (5/IP/15 min).
4. **Visible banner** on every demo page: *"DEMO — não usar com dados reais."*
5. **Nightly demo reset** — a Railway cron re-running `prisma/seed.ts` (or a reset script) at 03:00 so demo data never accumulates. Seed lives in the repo; never hand-edit the demo DB.
6. **Staging behind Railway access control or a separate Railway environment** — keep the demo project off the production domain entirely.

## README pattern

```markdown
## Credenciais de demonstração (somente staging)

Exibidas na página de login em modo demo/staging. NUNCA em produção.

| Função | E-mail                  | Senha       |
|--------|-------------------------|-------------|
| Admin  | admin@persimmon.local   | password    |
| User   | user@persimmon.local    | password123 |

Rodar localmente: `APP_ENV=demo npm run dev`
```

Plaintext demo passwords live **only** in `README.md`. The seed stores hashes; the DB stores hashes.

## Environment variables

```
APP_ENV=production   # .env.example default — MUST be production
# Staging/demo deploys override to APP_ENV=demo in Railway env vars only
```

`.env.example` ships `APP_ENV=production`. Only a deliberate Railway env override flips a deploy to demo mode.

## Anti-patterns banned

- **Demo creds in JSX without the `isDemo()` gate** — production leak risk.
- **Gate on env OR host (instead of AND)** — single misconfig leaks. Require both.
- **Importing `src/lib/demo.ts` into a client component** — leaks the allowlist; the `server-only` guard exists to prevent exactly this.
- **Autofill instead of copy** — breaks the training + hygiene rationale.
- **Plaintext passwords in `seed.ts` / migration comments** — they live forever in git history. Hashes only; plaintext only in README.
- **`.env.example` shipping `APP_ENV=demo`** — default must be `production`.
- **A hardcoded `DEMO_MODE = true` constant** — no environment safety; ships to prod by accident.
- **`admin/admin`** — reads as "never configured", erodes trust.
- **More than 2 demo roles** — cognitive load with no clarification.
- **Reading `host` instead of `x-forwarded-host`** behind Railway — the gate checks the wrong (internal) hostname and misfires.

## When NOT to use this skill

- Public marketing sites with no auth.
- Production user logins — real users go through the normal `authorize()` flow with no demo display.

## Cross-references

- `security-nextauth` — the `authorize()` flow, login form, `x-forwarded-host`, bcryptjs seed shape
- `security-hardening` — rate-limit the demo login against scraping bots; session hardening
- `security-review` — audit catches demo creds shipped without the gate, and `APP_ENV=demo` in `.env.example`
- `stack-zod-boundary` — login input validation
- `infra-railway-deploy` — staging env var (`APP_ENV=demo`), the nightly reset cron, separate demo environment

Sources: [Filament demo-credentials tutorial](https://filamentexamples.com/tutorial/filament-demo-credentials-on-login-page-with-autofill), [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [web.dev — Sign-in form best practices](https://web.dev/articles/sign-in-form-best-practices), [Google: Block Search Indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [RFC 6762 — .local TLD](https://datatracker.ietf.org/doc/html/rfc6762).
