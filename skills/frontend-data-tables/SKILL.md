---
name: frontend-data-tables
description: Responsive data table conventions for Persimmon internal tools, built with React Server Components, Tailwind v4, and Prisma. Owns the two table patterns (list tables that card-stack on phone, matrix tables that always scroll with a sticky first column), column-priority utilities, row-click → detail via Next Link, kebab overflow actions, wrap-vs-truncate rules, scroll affordances, accessibility, and server-side pagination via searchParams + Prisma skip/take. Use when building or reviewing any tabular list, fixing a table cut off on mobile, deciding sticky columns, or paginating a list page.
---

# Data Tables — Persimmon Patterns

How Persimmon renders tabular data across every viewport. Two distinct patterns — pick the right one for the data, then layer on the same chrome (sticky last column, row-click → detail, kebab actions, scroll affordances).

Tables are **Server Components by default**: fetch with Prisma in the page, render plain `<table>`. Only the kebab menu and any client interactivity become `"use client"` islands. Tailwind v4 tokens come from `stack-tailwind-tokens` — never re-specify them here.

## The two table patterns

| Pattern | Use for | Mobile behavior |
|---|---|---|
| **List table** | One row = one record with a single subject (clients, processes, invoices) | **Card-stack** — each row becomes a labeled card |
| **Matrix table** | Cross-tabulated data where row and column both carry meaning (rate sheets, comparison grids) | **Always horizontal scroll** with sticky first column; never card-stack |

Most Persimmon tables are list tables. Matrix tables are the rare exception.

## Server-rendered list table (RSC + Prisma)

The page is async, reads searchParams (validated with Zod — see `stack-zod-boundary`), queries Prisma, and passes rows to a presentational table. Pages that read the DB MUST `export const dynamic = "force-dynamic"` (see `stack-server-actions`).

```tsx
// src/app/processes/page.tsx
import { z } from "zod";
import { db } from "@/lib/db";
import { ProcessTable } from "./process-table";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;
const SearchParams = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, page } = SearchParams.parse(await searchParams);
  const where = q
    ? { title: { contains: q, mode: "insensitive" as const } }
    : {};

  const [rows, total] = await Promise.all([
    db.process.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, title: true, clientName: true, status: true, updatedAt: true },
    }),
    db.process.count({ where }),
  ]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Processos</h1>
      <ProcessTable rows={rows} />
      <Pagination page={page} perPage={PER_PAGE} total={total} />
    </main>
  );
}
```

## List table markup — Tailwind, card-stack on phone

Wrap in a scroll region (`role="region"`, `aria-labelledby`, `tabIndex={0}`). Use a real `<table>` with `<caption>`, `<thead>`, `<th scope="col">`. On phone, switch `<tr>`/`<td>` to `grid` — `grid` (not `block`) preserves table semantics for screen readers in modern browsers (2024+).

```tsx
// src/app/processes/process-table.tsx — Server Component (no "use client")
import Link from "next/link";
import { RowActions } from "./row-actions"; // client island

type Row = { id: string; title: string; clientName: string; status: string; updatedAt: Date };

export function ProcessTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState />; // see frontend-form-patterns for the 4 empty-state types
  }
  return (
    <div
      role="region"
      aria-labelledby="proc-caption"
      tabIndex={0}
      className="relative overflow-auto"
    >
      <table className="w-full border-collapse [&_td]:align-middle">
        <caption id="proc-caption" className="sr-only">Processos</caption>
        <thead>
          <tr className="max-sm:hidden">
            <th scope="col" className="text-left font-semibold px-4 py-3">Processo</th>
            <th scope="col" className="text-left font-semibold px-4 py-3 max-lg:hidden">Cliente</th>
            <th scope="col" className="text-left font-semibold px-4 py-3">Status</th>
            <th scope="col" className="text-left font-semibold px-4 py-3 max-md:hidden">Atualizado</th>
            <th scope="col" className="w-px whitespace-nowrap px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="relative border-b hover:bg-stone-50 max-sm:grid max-sm:gap-2 max-sm:rounded-md max-sm:border max-sm:p-4"
            >
              <td className="px-4 py-3 max-sm:px-0 font-medium">
                <Link
                  href={`/processes/${r.id}`}
                  className="text-inherit no-underline after:absolute after:inset-0 after:content-['']"
                >
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-3 max-sm:px-0 max-lg:hidden" data-label="Cliente">
                {r.clientName}
              </td>
              <td className="px-4 py-3 max-sm:px-0" data-label="Status">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 max-sm:px-0 whitespace-nowrap max-md:hidden" data-label="Atualizado">
                {r.updatedAt.toLocaleDateString("pt-BR")}
              </td>
              <td className="w-px whitespace-nowrap px-4 py-3 max-sm:px-0">
                <RowActions id={r.id} title={r.title} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### The row-click overlay trick (keyboard + screen-reader safe)

The primary cell wraps a real `next/link` `<Link>`. Its `after:absolute after:inset-0` pseudo-element stretches over the whole row so a click anywhere navigates, while the anchor stays the focusable, announced element. **Never** put `onClick` on `<tr>` — no keyboard, no semantics. This is the Linear/GitHub pattern.

### Card-stack labels on phone

In card mode, each `<td>` should show a label. Two ways:

- **Static labels** — render the label inside the cell, hidden on desktop: `<span className="sr-only sm:not-sr-only ...">`. Simplest and SSR-friendly.
- **`data-label` + CSS `::before`** — set `data-label="Cliente"` on each `<td>` and emit the label via a `::before` content rule in `globals.css`. Preferred when you don't want extra DOM:

```css
/* globals.css — emit card-mode labels from data-label */
@media (max-width: 639px) {
  .card-table td[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: theme(colors.stone.500);
  }
}
```

Because Next renders server-side, prefer setting `data-label` directly in JSX — no client script needed (unlike the legacy DOM-injection helper).

## Sticky last column (Actions)

The kebab/actions cell must stay reachable when the table scrolls horizontally. Make it `sticky right-0` on desktop; release it in card mode.

```tsx
<td className="sticky right-0 z-10 bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] max-sm:static max-sm:shadow-none">
  <RowActions id={r.id} title={r.title} />
</td>
```

In card mode, render Actions as a full-width footer button row, not a cramped right-aligned cell.

## Matrix table — always scroll, sticky first column

For cross-tabulated data (rate sheets, comparison grids) card-stacking destroys the comparison both axes carry. Keep horizontal scroll at every width; make the first column sticky-left with `<th scope="row">` so screen readers announce both axes.

```tsx
<div role="region" aria-labelledby="rates-cap" tabIndex={0} className="overflow-auto">
  <table className="min-w-full border-collapse">
    <caption id="rates-cap" className="sr-only">Taxas por prazo e faixa</caption>
    <thead>
      <tr>
        <th scope="col" className="sticky left-0 z-30 bg-white px-3 py-2">Prazo</th>
        <th scope="col" className="px-3 py-2">740+</th>
        <th scope="col" className="px-3 py-2">700-739</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 shadow-[8px_0_8px_-8px_rgba(0,0,0,0.15)]">
          30 anos
        </th>
        <td className="px-3 py-2 tabular-nums">6,125%</td>
        <td className="px-3 py-2 tabular-nums">6,375%</td>
      </tr>
    </tbody>
  </table>
</div>
```

## Kebab actions (client island)

3+ actions, or actions that vary by row state → a kebab overflow menu. Build with Radix `DropdownMenu` + `lucide-react`. Destructive items route through the AlertDialog from `frontend-feedback-system`.

```tsx
// src/app/processes/row-actions.tsx
"use client";
import { MoreVertical } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function RowActions({ id, title }: { id: string; title: string }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={`Ações para ${title}`}
        className="grid size-11 place-items-center rounded hover:bg-stone-100"
      >
        <MoreVertical aria-hidden className="size-4" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={4} className="min-w-40 rounded-md border bg-white p-1 shadow-lg">
          <Dropdown.Item asChild>
            <a href={`/processes/${id}`} className="block rounded px-2 py-1.5 text-sm hover:bg-stone-100">Ver</a>
          </Dropdown.Item>
          <Dropdown.Item asChild>
            <a href={`/processes/${id}/edit`} className="block rounded px-2 py-1.5 text-sm hover:bg-stone-100">Editar</a>
          </Dropdown.Item>
          {/* Delete opens an AlertDialog — see frontend-feedback-system */}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
```

Kebab `aria-label` always names the row (`Ações para ${title}`), never bare `⋮`. Touch target ≥ 44×44 (`size-11`).

## Column-priority utilities (Tailwind responsive hides)

Drop low-value columns at narrow widths with `max-*:hidden` modifiers — no custom classes needed:

| Priority | Tailwind on `<th>` AND `<td>` | Hides below |
|---|---|---|
| Low (Owner, Created) | `max-lg:hidden` | 1024px |
| Medium (secondary data) | `max-md:hidden` | 768px |
| High (always shown) | *(no modifier)* | — |

Apply the same modifier to the header and its body cells.

## Wrapping vs truncating

| Column type | Behavior | Tailwind |
|---|---|---|
| Names, descriptions | Wrap to 2 lines then ellipsis | `line-clamp-2` |
| IDs, record numbers | Never wrap | `whitespace-nowrap` |
| Dates | Never wrap; shorten on mobile | `whitespace-nowrap` |
| Status badges | Never wrap (pill stays intact) | `whitespace-nowrap` |
| Email / URL | Truncate; full value in `title` | `truncate` + `title={value}` |
| Currency / numbers | Right-align, tabular figures | `text-right tabular-nums whitespace-nowrap` |

## Scroll affordance (edge shadow, no JS)

Add a background-gradient hint on the scroll wrapper so users know there's more horizontally. Keep it as a small utility in `globals.css`:

```css
.scroll-shadow {
  background:
    linear-gradient(90deg, white 30%, transparent) 0 0,
    linear-gradient(90deg, transparent, white 70%) 100% 0,
    radial-gradient(farthest-side at 0 50%, rgba(0,0,0,.2), transparent) 0 0,
    radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,.2), transparent) 100% 0;
  background-repeat: no-repeat;
  background-size: 40px 100%, 40px 100%, 14px 100%, 14px 100%;
  background-attachment: local, local, scroll, scroll;
}
```

## Server-side pagination

Pagination is server-driven via `?page=N`. Query with `skip`/`take`, count in parallel (shown above). The `<Pagination>` is a small Server Component rendering `next/link` anchors that preserve existing searchParams.

```tsx
// src/components/pagination.tsx — Server Component
import Link from "next/link";

export function Pagination({ page, perPage, total }: { page: number; perPage: number; total: number }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
      <PageLink page={page - 1} disabled={page <= 1}>Anterior</PageLink>
      <span aria-current="page">Página {page} de {pages}</span>
      <PageLink page={page + 1} disabled={page >= pages}>Próxima</PageLink>
    </nav>
  );
}

function PageLink({ page, disabled, children }: { page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="text-stone-400">{children}</span>;
  return <Link href={`?page=${page}`} className="rounded px-3 py-1.5 hover:bg-stone-100">{children}</Link>;
}
```

**Defaults**: 25–50 rows/page; reduce to 10 below 600px. No infinite scroll on admin tables (breaks keyboard nav, back button, total count). No virtualization for typical Persimmon datasets (<10k rows).

## One component for sort / filter / select — never per-page

When a client says *"why does the work-orders search behave differently from the items search?"* the answer is almost always **duplication**: someone reimplemented list behavior per page instead of reusing one component. Every list table behavior lives in a **shared `DataTable` component** driven by typed column definitions — add a page, get the behaviors for free:

- **Click-to-sort via searchParams:** the `DataTable` renders `<Link>` sort-toggle headers that update `?sort=col&dir=asc|desc`; the RSC page reads those params and passes them to Prisma. Zero per-page sort code.
- **Live filter via searchParams:** the filter bar updates `?q=…&status=…` on change; one server roundtrip, no client state. The `DataTable` receives the filter row as a prop slot — per-page filters differ, the *mechanism* does not.
- **Row selection + bulk actions:** a `useRowSelection` hook (or a `"use client"` wrapper component) maintains selected ids in local state, reveals a live count + bulk-action bar, and exposes the ids via a hidden form input for the Server Action. One reusable implementation across every list.
- **The display/sort split (the `data-val` equivalent):** a column that shows a *pretty label* but must sort/filter by a *coded value* defines both — `{ key: "status", getDisplayValue: statusLabel, getSortValue: (r) => r.status }`. The sort URL param carries the coded value; the rendered cell shows the label. This is what lets status enums sort and filter correctly while still reading nicely.

If you find yourself writing sort/filter logic twice for different pages, stop — extend the shared `DataTable`'s column definition API instead.

## Accessibility non-negotiables

- Real `<table>` + `<caption>` + `<thead>` + `<th scope="col">`. Never `<div role="table">`.
- Wrapper: `role="region"` + `aria-labelledby` (caption) + `tabIndex={0}` so keyboard users can scroll horizontally.
- Matrix first column: `<th scope="row">`.
- Kebab buttons: `aria-label` naming the row; touch target ≥ 44×44.
- Row-click via `<Link>` + stretched `after:inset-0` overlay — never `onClick` on `<tr>`.
- `grid` (not `block`) for card-mode reflow preserves table semantics.

## One-screen defaults

- List table → card-stack `<640px`; matrix table → always scroll.
- Actions cell sticky-right on desktop; full-width footer in card mode.
- 25/page, server-paginated via `?page=`; reduce to 10 below 600px.
- Row-click navigates via overlay anchor; kebab for 3+ actions.
- Fetch in the RSC page with Prisma; presentational table stays a Server Component; only the kebab is `"use client"`.

## Anti-patterns banned

- Actions column without `sticky right-0` (the cut-off bug).
- `<div role="table">` for tabular data.
- Matrix data card-stacked at phone (destroys both-axes comparison).
- `onClick` on `<tr>` (no keyboard, no screen reader) — use the overlay `<Link>`.
- Kebab labeled only `⋮` with no `aria-label`.
- Marking the whole table `"use client"` just to render rows — fetch + render in the RSC.
- Passing raw `searchParams` to a Prisma `where` without Zod validation.
- Infinite scroll on admin tables.
- Wrapping a status badge to 2 lines.
- "Ver" button as the only action in an Actions column (drop the column, click the row).

## Relationship to other skills

| Skill | Connection |
|---|---|
| `stack-tailwind-tokens` | All spacing/color tokens used here |
| `stack-server-actions` | `force-dynamic` rule, mutations behind kebab actions |
| `stack-zod-boundary` | Validating `searchParams` before the Prisma query |
| `frontend-feedback-system` | Destructive kebab action → AlertDialog + toast |
| `frontend-form-patterns` | Empty-state component when `rows.length === 0` |
| `frontend-interaction-patterns` | Kebab ordering, row-click vs visible action button |
| `frontend-internal-tool-conventions` | Typography (tabular figures), badges, color |
| `frontend-page-templates` | The list/index template embeds this table |

Sources: [Adrian Roselli — Responsive Tables as CSS Grid (2024)](https://adrianroselli.com/2024/01/wrapping-tables-into-responsive-css-grids.html), [Roselli — Under-Engineered Responsive Tables](https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html), [CSS-Tricks — Sticky Header + First Column](https://css-tricks.com/a-table-with-both-a-sticky-header-and-a-sticky-first-column/).
