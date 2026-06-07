---
name: backend-account-management
description: "Full user-account + role lifecycle for Persimmon internal tools — individual role-based login (NextAuth credentials, DB-backed with demo fallback), self-signup → pending → admin role approval, invite links, forgot/set/change password via single-use SHA-256 tokens, and an admin Accounts panel. Enforces the server-side invariants: always ≥1 active admin, admins can promote but not edit/demote other admins, no self-lockout. Use when a tool needs real per-person accounts instead of a shared login. Trigger keywords: user accounts, account management, roles, signup, invite, forgot password, reset password, approve role, admin user panel."
---

# Account Management & Role Administration — Persimmon Patterns

The reusable auth/account lifecycle for a Persimmon internal tool: layer individual, role-based accounts on top of `security-nextauth`, and give admins a panel to manage them. Covers create-account, forgot/change password, invites, and role approval — with the dangerous parts (admin invariants, token handling) enforced in **Server Actions + Prisma**, never UI-only.

## Trigger

- "Add real logins / individual accounts"
- "Auth and roles", "user management", "account management"
- "Create account / forgot password / change password / reset password"
- "Admin panel to manage users and permissions"
- "Let users request a role; admin approves"

## When to use this vs neighbours

| Concern | Skill |
|---|---|
| The user-account lifecycle: signup, invite, reset, role request, approval, admin invariants | **this skill** |
| NextAuth wiring: `authorize()`, sessions, `trustHost`, `x-forwarded-host`, bcryptjs seed | `security-nextauth` |
| Generic CRUD scaffold for *any* entity + the Accounts panel chrome | `backend-admin-panel` |
| The two standardized demo accounts shown on the login page (+ the env+host gate) | `security-demo-credentials` |
| Rate-limiting login / forgot-password against bots | `security-hardening` |

This skill builds **on top of** all of these. The Accounts panel itself is rendered with `backend-admin-panel` + the `frontend` children; this skill owns only the account/role logic behind it.

## 1. Roles & status model

Two orthogonal axes — keep them separate:

- **status** (`pending` | `active` | `disabled`) — can this person sign in and do anything?
- **role** (`admin` + the project's functional roles, e.g. `lawyer`, `manager`, `viewer`) — what may they do?

A self-signed-up user is `status=pending` with **no role** until an admin approves one. `admin` is the only role this skill hard-codes; the rest are project-defined. Model role + status as **Postgres enums** (Prisma `enum`), never free strings.

## 2. Prisma schema

```prisma
enum AccountStatus { pending active disabled }

model User {
  id           String        @id @default(cuid())
  email        String        @unique
  name         String        @default("")
  passwordHash String
  role         String?                          // null until an admin grants one
  status       AccountStatus @default(pending)
  lastLogin    DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  @@index([status])
}

model Invite {
  id         String    @id @default(cuid())
  email      String
  role       String
  tokenHash  String    @unique                  // SHA-256 of the raw token
  invitedBy  String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
}

model PasswordReset {
  id          String    @id @default(cuid())
  email       String
  tokenHash   String?   @unique                 // set when a reset link is issued
  requestedAt DateTime  @default(now())
  expiresAt   DateTime?
  consumedAt  DateTime?
}

model RoleRequest {
  id            String   @id @default(cuid())
  userId        String
  requestedRole String
  status        String   @default("pending")    // pending | approved | denied
  decidedBy     String?
  decidedAt     DateTime?
  createdAt     DateTime @default(now())
  @@index([userId, status])
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  action    String                              // 'role.approve', 'user.disable', ...
  targetId  String?
  detail    String   @default("")
  createdAt DateTime @default(now())
}
```

Ship via `prisma migrate` (see `data-prisma-pgvector`). Seed admin #1 with the bcryptjs seed shape from `security-nextauth` (hashes only — never plaintext in code).

## 3. DB-backed auth, with demo fallback (NextAuth credentials)

`authorize()` checks the real `User` table first; the standardized demo accounts (`security-demo-credentials`) remain as a fallback **only** under `isDemo()`, so a staging fixture keeps working before real accounts exist. NextAuth owns the session — there is no manual `session_regenerate_id`.

```ts
// auth.ts — NextAuth v5 credentials provider (see security-nextauth for the full config)
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isDemo, demoCredentials } from "@/lib/demo"; // security-demo-credentials

async function authorize(creds: { email: string; password: string }) {
  const email = creds.email.trim().toLowerCase();

  // 1) Real DB-backed accounts.
  const u = await db.user.findUnique({ where: { email } });
  if (u && u.status !== "disabled" && (await bcrypt.compare(creds.password, u.passwordHash))) {
    await db.user.update({ where: { id: u.id }, data: { lastLogin: new Date() } });
    // pending users authenticate but carry no role — the middleware (§7) pins them.
    return { id: u.id, name: u.name || u.email, email: u.email, role: u.role ?? "pending", status: u.status };
  }

  // 2) Demo fallback — staging/demo only (env + host gated).
  if (await isDemo()) {
    const hit = demoCredentials().find((c) => c.email === email && c.password === creds.password);
    if (hit) return { id: `demo-${hit.role}`, name: hit.role, email, role: hit.role, status: "active" };
  }
  return null;
}
```

Persist `role` + `status` into the JWT/session in the NextAuth `jwt`/`session` callbacks (see `security-nextauth`) so middleware and Server Actions can read them without a DB hit.

### Demo logins per role coexist with real signups

Real DB-backed accounts and the demo logins are **not** mutually exclusive — both live on the login page at once:

- **Real users** sign in with email/password (the DB branch), and anyone can self-register via **Create account** (§5).
- **Demo logins stay** for fast walkthroughs — but a multi-role tool ships **one demo account per role** (see the multi-role note in `security-demo-credentials`), each a copy-to-clipboard chip, all wrapped in the `isDemo()` env+host gate so they vanish in production while real signup and login remain.

## 4. Single-use link tokens (invites + resets)

Delivery default is **copy-link in the admin panel** (no SMTP needed): the admin clicks "Invite" / "Send reset," the panel shows a copy-able link (`frontend-feedback-system` flash), and they relay it. To switch to real email later, hand the link to `client-transactional-email` / `backend-notifications` — nothing else changes.

The raw token lives **only** in the link; the DB stores its SHA-256 hash, so a DB leak can't be replayed.

```ts
// src/lib/account/tokens.ts
import "server-only";
import { randomBytes, createHash } from "node:crypto";

export const newRawToken = () => randomBytes(32).toString("hex");
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
// Verify: hash the incoming raw token, match tokenHash, reject if consumedAt != null
// or expiresAt < now(). Set consumedAt in the SAME transaction that sets the password.
```

`set-password` is the single route that serves both **invite accept** and **password reset** — both arrive as `?token=…`, both end by setting `passwordHash` and marking the token consumed (atomically, in one `$transaction`).

## 5. The flows

| Flow | Entry | Result |
|---|---|---|
| **Create account** (open self-signup) | login page → "Create account" | `User` row as `pending`, no role; user is sent to **request-access** |
| **Request access** | the only page a `pending` user can see | `RoleRequest` row `pending`; waits for admin |
| **Invite** (admin-initiated) | Accounts panel → Invite | `Invite` row + copy-link; link → `set-password` → `active` with the invited role |
| **Forgot password** | login page → "Forgot password?" | `PasswordReset` request row; admin is notified to issue a link |
| **Set / reset password** | `set-password?token=…` | validates token, sets new `passwordHash`, marks consumed (one transaction) |
| **Change password** | profile page (signed-in) | verify current password, then re-hash the new one |
| **Role change request** | profile page (signed-in non-admin) | `RoleRequest` row `pending` |
| **Approve / deny role** | Accounts panel (admin) | sets `User.role` + `status=active`, or denies; writes `AuditLog` |

The **forgot-password** response must be identical whether or not the email exists ("If that account exists, an administrator has been notified") — no account-enumeration oracle.

## 6. Admin invariants — enforce server-side, always

These live in `src/lib/account/users.ts` (server-only) and are checked on every mutation, never trusted from the UI. The Persimmon default rule set:

- **Always ≥ 1 active admin.** Any demote/disable/role-change that would drop the active-admin count to zero is rejected.
- **Promote yes, edit/demote no.** An admin may *promote* a non-admin to `admin`, but may **not** edit, demote, or disable **another** existing admin. (This is how a second admin is born without admins dethroning each other.)
- **No self-lockout.** You can't disable your own account, and can't demote yourself if you're the last admin.

```ts
// src/lib/account/users.ts
import "server-only";
import { db } from "@/lib/db";

type Result = { ok: true } | { ok: false; error: string };

export async function setRole(actorId: string, targetId: string, newRole: string): Promise<Result> {
  const [actor, target] = await Promise.all([
    db.user.findUnique({ where: { id: actorId } }),
    db.user.findUnique({ where: { id: targetId } }),
  ]);
  if (!actor || actor.role !== "admin") return { ok: false, error: "Not authorized." };
  if (!target) return { ok: false, error: "Not found." };

  // Can't touch another existing admin (promote-only rule).
  if (target.role === "admin" && targetId !== actorId)
    return { ok: false, error: "Admins cannot edit other admins." };

  // Last-admin protection on any demotion away from admin.
  if (target.role === "admin" && newRole !== "admin" && (await countActiveAdmins()) <= 1)
    return { ok: false, error: "There must always be at least one admin." };

  await db.$transaction([
    db.user.update({ where: { id: targetId }, data: { role: newRole, status: "active" } }),
    db.auditLog.create({ data: { actorId, action: "role.set", targetId, detail: newRole } }),
  ]);
  return { ok: true };
}

export const countActiveAdmins = () =>
  db.user.count({ where: { role: "admin", status: "active" } });
```

`disableUser()` and `approveRole()` apply the same guards (last-admin + can't-touch-other-admin + can't-disable-self) before writing. The count check and the write **must be in one `$transaction`** — a read-then-write that's only "atomic" in TypeScript can race two concurrent admins to zero (see `backend-commerce-concurrency`).

## 7. Confine pending users in middleware

A signed-in `pending` user has no role, so the role-guarded routes would bounce them everywhere. Intercept in `middleware.ts` (reads the NextAuth session token) and pin them to the request-access page:

```ts
// middleware.ts (excerpt — see security-nextauth for the auth() wiring)
export default auth((req) => {
  const { auth: session, nextUrl } = req;
  if (!session) return NextResponse.redirect(new URL("/login", nextUrl));

  const isPending = session.user.status === "pending" || !session.user.role || session.user.role === "pending";
  const allowed = ["/request-access", "/api/auth"];
  if (isPending && !allowed.some((p) => nextUrl.pathname.startsWith(p)))
    return NextResponse.redirect(new URL("/request-access", nextUrl));
  // ...normal role guard runs only for active users
});
```

`/request-access` and `/profile` are allowed for any signed-in user; `/accounts` (the admin panel) is `admin` only.

## 8. Account-action Server Actions — Zod, typed result, revalidate

Every mutation (invite, reset, approve, deny, set-role, disable, change-password, request-role) is a **Server Action**: it re-checks auth + role on the server (never trust the client), validates input through a **Zod boundary** (`stack-zod-boundary`), returns the typed `ActionResult` union rather than throwing (`stack-server-actions`), and `revalidatePath`s the Accounts panel. Server Actions are POST-only and same-origin, so they don't need a hand-rolled CSRF token — but they **do** need the explicit server-side role check (the action is a public endpoint).

```ts
"use server";
import { z } from "zod";
import { auth } from "@/auth";
import { setRole } from "@/lib/account/users";
import { revalidatePath } from "next/cache";

const SetRole = z.object({ targetId: z.string().min(1), role: z.string().min(1) });

export async function setRoleAction(input: unknown) {
  const session = await auth();
  if (session?.user.role !== "admin") return { ok: false as const, error: "Not authorized." };
  const parsed = SetRole.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };

  const res = await setRole(session.user.id, parsed.data.targetId, parsed.data.role);
  if (res.ok) revalidatePath("/accounts");
  return res;
}
```

Copy-links (invite/reset) come back in the result as a read-only field + "Copy link" button — see `frontend-feedback-system`.

## Anti-patterns banned

- Enforcing the admin invariants in client code / hidden form fields only — they must hold in the Server Action + `src/lib/account/users.ts`.
- A non-transactional `countActiveAdmins()` + update — two concurrent admins can race the count to zero.
- Storing the raw reset/invite token in the DB (store the SHA-256 hash; raw only in the link).
- Account-enumeration: different responses for "email exists" vs not on forgot-password.
- Letting a `pending` (no-role) user reach any route except request-access.
- A reachable state with zero active admins (always guard `countActiveAdmins()`).
- Self-lockout (disabling your own account, or demoting the last admin — yourself).
- A Server Action that trusts the client's claimed role instead of re-reading `auth()` server-side.
- Reusing demo accounts as real accounts in production — the demo path is gated by `isDemo()` and must never be primary auth.

## Relationship to other skills

| Skill | Connection |
|---|---|
| `security-nextauth` | The `authorize()` flow, session/JWT callbacks, `trustHost`, `x-forwarded-host`, bcryptjs seed |
| `backend-admin-panel` | Renders the Accounts panel CRUD chrome; this skill is the account/role logic behind it |
| `security-demo-credentials` | The `isDemo()` env+host gate + the demo accounts used as pre-real-account fallback (one per role for multi-role tools) |
| `data-prisma-pgvector` | Migrations for the five models above |
| `stack-zod-boundary` / `stack-server-actions` | Input validation + the typed `ActionResult` shape for every account mutation |
| `frontend-feedback-system` | Flash component for the copy-link + success/error messages |
| `client-transactional-email` / `backend-notifications` | Drop-in replacement for copy-link delivery when email is available |
| `security-hardening` | Rate-limit the login + forgot-password endpoints (brute force / enumeration) |

Sources: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
