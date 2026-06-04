---
name: backend-admin-panel
description: "Scaffolds the admin CRUD layer for the Persimmon stack — NextAuth v5 session + middleware route guard, role model, list/detail/edit/create/delete via Server Components + Server Actions, server-side pagination/search/filter, and dashboard KPI cards + recharts. Use when building an admin panel, internal tool, back-office, or CRUD section for an entity. Trigger keywords: admin panel, CRUD, back-office, dashboard, internal tool, role guard, pagination, recharts."
---

# Admin Panel — Persimmon Patterns

The data/auth layer for an admin panel: route guarding, role checks, paginated lists, and Server-Action mutations. Page chrome (layout, tables, forms, toasts, confirm modals) follows the `stack-tailwind-tokens` conventions — this skill owns the server side.

## Core contract

1. Every admin route is guarded **twice**: middleware (cheap redirect for unauthenticated) + `auth()` in the page/action (authoritative, role-aware). Defense in depth.
2. Every admin page that reads the DB or `auth()` exports `const dynamic = "force-dynamic"` (Next 16 prerender / Railway build rule).
3. Lists paginate/search/filter **server-side** — never `findMany()` everything and slice in JS.
4. Mutations are Server Actions returning `ActionResult<T>` (→ `stack-server-actions`), Zod-validated, revalidated after write.
5. Role checks gate destructive and privileged actions. Role is a Prisma enum, never a free string.
6. CSRF is handled by Server Actions automatically — do not hand-roll tokens.

## 1. Role model & guard

```prisma
model User {
  id    String   @id @default(cuid())
  email String   @unique
  role  UserRole @default(STAFF)
  // ...NextAuth fields
}

enum UserRole {
  OWNER   // sees secrets/settings, can delete
  MANAGER
  STAFF
}
```

```ts
// src/lib/admin-guard.ts
import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

export async function requireRole(min: UserRole = "STAFF") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const rank: Record<UserRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };
  if (rank[session.user.role] < rank[min]) redirect("/admin?error=forbidden");
  return session.user;
}
```

```ts
// middleware.ts — cheap first gate (full check still happens in the page)
export { auth as middleware } from "@/lib/auth";
export const config = { matcher: ["/admin/:path*"] };
```

The middleware redirect is a fast path only; the page's `requireRole()` is authoritative. Read `x-forwarded-host` for redirects behind Railway's edge (→ `security-nextauth`).

## 2. List page (RSC, server-side pagination + search + filter)

```tsx
// src/app/admin/customers/page.tsx
import { db } from "@/lib/db";
import { requireRole } from "@/lib/admin-guard";
import { z } from "zod";

export const dynamic = "force-dynamic"; // reads DB + auth

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(100).default(""),
  status: z.enum(["", "ACTIVE", "INACTIVE"]).default(""),
});

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("STAFF");
  const { page, q, status } = Query.parse(await searchParams); // validate the URL too

  const perPage = 25;
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } },
                    { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(status ? { status } : {}),
  };

  const [total, rows] = await db.$transaction([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
      select: { id: true, name: true, email: true, status: true, createdAt: true },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / perPage));
  return <CustomerTable rows={rows} page={page} pages={pages} q={q} status={status} />;
}
```

Always `select` explicit columns — never return whole rows (the Prisma equivalent of `SELECT *`). Validate `searchParams` with Zod; a hostile `?page=-1` or `?status=DROP` must not reach Prisma unchecked.

## 3. Create / edit (Server Action)

```ts
// src/lib/customer-actions.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/admin-guard";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

const UpsertCustomer = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
});

export async function upsertCustomer(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("MANAGER");
  const parsed = UpsertCustomer.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return actionErr("Invalid.", parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  try {
    const row = id
      ? await db.customer.update({ where: { id }, data, select: { id: true } })
      : await db.customer.create({ data, select: { id: true } });
    revalidatePath("/admin/customers");
    return actionOk({ id: row.id });
  } catch (err) {
    console.error("[upsertCustomer]", { code: (err as { code?: string }).code });
    return actionErr("Could not save customer.");
  }
}
```

The edit/create form is a Client Component using `useActionState` and rendering `fieldErrors` (→ `stack-server-actions`).

## 4. Delete (owner/manager-gated, confirm in UI)

```ts
// src/lib/customer-actions.ts (continued)
export async function deleteCustomer(id: string): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    await db.customer.delete({ where: { id } });
    revalidatePath("/admin/customers");
    return actionOk(undefined);
  } catch (err) {
    console.error("[deleteCustomer]", { code: (err as { code?: string }).code });
    return actionErr("Could not delete.");
  }
}
```

The confirmation dialog lives in the Client Component that calls this — a real modal, never the browser's `confirm()`. For irreversible / bulk (>100 rows) ops, require type-to-confirm.

## 5. Dashboard — KPI cards + recharts

Aggregate in the RSC (server-side), pass plain numbers/arrays to a thin `"use client"` chart. recharts needs a client boundary; keep queries on the server.

```tsx
// src/app/admin/page.tsx
import { db } from "@/lib/db";
import { requireRole } from "@/lib/admin-guard";
import { RevenueChart } from "./revenue-chart";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireRole("STAFF");
  const [orders, revenue, daily] = await db.$transaction([
    db.order.count({ where: { status: "PAID" } }),
    db.order.aggregate({ _sum: { totalCents: true }, where: { status: "PAID" } }),
    db.$queryRaw<{ day: string; cents: number }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             SUM("totalCents")::int AS cents
      FROM "Order" WHERE status = 'PAID'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
  ]);
  return (
    <div className="grid gap-4">
      <KpiCard label="Paid orders" value={orders} />
      <KpiCard label="Revenue" value={`$${((revenue._sum.totalCents ?? 0) / 100).toFixed(2)}`} />
      <RevenueChart data={daily.reverse()} />
    </div>
  );
}
```

```tsx
// src/app/admin/revenue-chart.tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function RevenueChart({ data }: { data: { day: string; cents: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <XAxis dataKey="day" /><YAxis tickFormatter={(c) => `$${(c / 100).toFixed(0)}`} />
        <Tooltip formatter={(c: number) => `$${(c / 100).toFixed(2)}`} />
        <Line type="monotone" dataKey="cents" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

## One-screen defaults

| Concern | Default |
|---|---|
| Guard | middleware matcher + `requireRole()` in page/action |
| Page type | RSC for read, Server Action for write |
| `dynamic` | `"force-dynamic"` on every DB/auth page |
| Pagination | server-side `take`/`skip` + `count` in one `$transaction` |
| Search | `contains` + `mode: "insensitive"` |
| Columns | explicit `select`, never whole rows |
| Roles | Prisma enum (`OWNER`/`MANAGER`/`STAFF`) |
| Charts | aggregate server-side → thin `"use client"` recharts |
| searchParams | Zod-parsed before reaching Prisma |

## Anti-patterns banned

- Guarding only in middleware (spoofable / bypassable) without `auth()` in the page/action.
- Page reading DB/auth without `export const dynamic = "force-dynamic"` → Railway build fails.
- `findMany()` everything then paginating in JS.
- Returning whole rows instead of explicit `select` (over-fetch, leaks columns).
- Passing raw `searchParams` to Prisma without Zod validation.
- Native `confirm()` for delete; missing type-to-confirm on irreversible/bulk ops.
- Role as a free-string column instead of a Prisma enum.
- Hand-rolling CSRF tokens (Server Actions handle it).
- Querying the DB from inside a Client Component.

## Cross-references

- **security-nextauth** — `auth()`, `trustHost`, `x-forwarded-host` middleware redirects
- **stack-server-actions** — `ActionResult<T>`, `useActionState`, revalidation, `force-dynamic`
- **stack-zod-boundary** — validating `searchParams` and form input
- **backend-settings-admin** — the Settings/Integrations area built on this scaffold
- **data-prisma-pgvector** — the `db` client and schema conventions
- **stack-tailwind-tokens** — table/form/modal chrome
