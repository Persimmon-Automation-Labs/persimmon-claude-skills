---
name: frontend-page-templates
description: Canonical page scaffolds for Persimmon internal tools (admin/CRM/ops) built as Next.js 16 Server Components + Server Actions. Catalogs 8 page types — List/Index, Detail/Read, Edit, Create, Dashboard, Wizard, Settings, Empty State — each with anatomy, an RSC + Server Action scaffold, and the sticky action-bar rule. Use when building or reviewing an admin page, deciding where the Save button goes, scaffolding a list/detail/edit flow, or laying out a dashboard or multi-step wizard. Trigger keywords: admin page layout, list page, detail page, edit page, create form, dashboard, wizard, settings page, empty state, sticky action bar, where does Save go.
---

# Internal Tool Page Templates — Persimmon Patterns

Persimmon ships internal tools fast because the page *types* repeat across every client. Pick the matching template, customize content, leave structure alone. Visual choices live in `frontend-internal-tool-conventions`; tokens in `stack-tailwind-tokens`; data flow in `stack-server-actions`.

Every page is a **Server Component by default**. Any page that reads the DB or `auth()` at request time exports `const dynamic = "force-dynamic"` (see `stack-server-actions` — skipping this breaks the Railway build). Mark a component `"use client"` only for state/effects/browser APIs (edit-mode toggle, dirty tracking, date pickers).

## The universal rule: Save in a sticky top action bar

**Never make the user scroll to find Save.** On any page with editable fields, Save and Cancel live in a sticky action bar pinned to the top of the viewport. Optional duplicate at the bottom of long forms — both submit the *same* form via one Server Action, so there is no double-submit.

```tsx
// src/components/page-action-bar.tsx
export function PageActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-bone px-6 py-3">
      {children}
    </div>
  );
}
```

```tsx
<PageActionBar>
  <a href="/processes" className="text-sm text-ink/70 hover:text-ink">← Processes</a>
  <div className="flex items-center gap-3">
    <button type="button" className="text-sm" formMethod="dialog">Cancel</button>
    <button type="submit" form="process-form" className="bg-oxblood px-4 py-2 text-sm text-bone">
      Save
    </button>
  </div>
</PageActionBar>
```

Ordering: back link far left; Cancel + Save right-aligned with Cancel left of Save (see `frontend-interaction-patterns`).

## Universal page anatomy

Every page = sidebar (`frontend-responsive`) · sticky-top action bar (back + Save/Cancel) · page header (title, optional subtitle) · content · optional duplicate action bar at the bottom of long forms.

## Template 1: List / Index

Browse many records (Processes, Clients, Documents, Users). RSC reads the DB; filters come from `searchParams`.

**Anatomy:** action bar with "New X" CTA top-right · filter/search row · data table · pagination.

```tsx
// src/app/processes/page.tsx
import { db } from "@/lib/db";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const rows = await db.process.findMany({
    where: {
      title: sp.q ? { contains: sp.q, mode: "insensitive" } : undefined,
      status: sp.status as never,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageActionBar>
        <h1 className="font-serif text-2xl">Processes</h1>
        <a href="/processes/new" className="inline-flex items-center gap-2 bg-oxblood px-4 py-2 text-sm text-bone">
          <Plus className="h-4 w-4" aria-hidden /> New process
        </a>
      </PageActionBar>

      {/* GET form so filters live in the URL (shareable, back-button safe) */}
      <form method="get" className="flex flex-wrap gap-3 px-6 py-4">
        <input name="q" defaultValue={sp.q} placeholder="Search processes…" className="min-h-11 border border-rule px-3" />
        <select name="status" defaultValue={sp.status} className="min-h-11 border border-rule px-3">{/* … */}</select>
      </form>

      {rows.length === 0 ? <EmptyProcesses /> : <ProcessTable rows={rows} />}
    </>
  );
}
```

**Rules:** New-X CTA top-right. Row click → Detail page. Filters in a **GET** form so state lives in the URL. Empty state replaces the table at zero rows (Template 8). See `frontend-data-tables` for the responsive filter-bar (inline → wrap → bottom-sheet) and table mechanics.

## Template 2: Detail / Read

View one record read-only.

**Anatomy:** action bar with back link + "Edit" CTA · page header · field groups as `<dl>` · meta row of badges + secondary actions.

```tsx
// src/app/processes/[id]/page.tsx
export const dynamic = "force-dynamic";

export default async function ProcessDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proc = await db.process.findUniqueOrThrow({ where: { id } });

  return (
    <>
      <PageActionBar>
        <a href="/processes" className="text-sm text-ink/70">← Processes</a>
        <a href={`/processes/${id}/edit`} className="inline-flex items-center gap-2 bg-oxblood px-4 py-2 text-sm text-bone">
          <Pencil className="h-4 w-4" aria-hidden /> Edit
        </a>
      </PageActionBar>

      <header className="px-6 pt-6">
        <h1 className="font-serif text-2xl">{proc.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="info">{proc.status}</Badge>
          <a href={`/processes/${id}?print=1`} className="text-sm">Print</a>
        </div>
      </header>

      <dl className="px-6 py-4">
        <div className="grid grid-cols-[140px_1fr] gap-3 py-2">
          <dt className="text-sm text-ink/60">Client</dt>
          <dd>{proc.clientName}</dd>
        </div>
        {/* more field rows */}
      </dl>
    </>
  );
}
```

**Rules:** No Save in this state. **All primary actions (Edit, Approve, Print, Archive) live in the sticky action bar** — never buried at the bottom. Use `<dl>` for screen readers. Email/phone/URL clickable. The back link belongs in the sticky bar only — do **not** duplicate it in the header.

### Edit mode: two valid approaches

- **Route-based (default, simplest, RSC-friendly):** "Edit" is a link to `/processes/[id]/edit` (Template 3). No client JS needed; the edit page renders inputs server-side. Preferred for Persimmon.
- **In-place toggle (`"use client"`):** if the team wants no navigation, a client wrapper swaps read fields for inputs without a reload, preserving scroll. Only reach for this when navigation genuinely hurts — it adds client state and dirty tracking.

### Settings cluster (grouped inline-editable settings)

When a Detail page has several related settings (Assignee, Status, Priority, Owner, Labels — the "CRM right rail"), **group them into ONE card with labeled rows. Never one card per setting** — per-setting cards stack header padding + borders + gaps into an enormous column for the same logical content. GitHub PR sidebar, Linear issue sidebar, Stripe customer Details all use one container with `label-left / value-right` rows.

```tsx
<aside className="border border-rule p-6">
  <h3 className="mb-4 text-sm uppercase tracking-wide text-ink/60">Process settings</h3>
  <dl className="grid gap-3">
    <div className="grid grid-cols-[100px_1fr] items-center gap-3">
      <dt className="text-sm text-ink/60">Assigned to</dt>
      <dd><InlineEdit field="assignee" value="Bob Jones" /></dd>
    </div>
    <div className="grid grid-cols-[100px_1fr] items-center gap-3">
      <dt className="text-sm text-ink/60">Stage</dt>
      <dd><InlineEdit field="stage"><Badge variant="info">Negotiation</Badge></InlineEdit></dd>
    </div>
  </dl>
</aside>
```

`InlineEdit` is a small `"use client"` control that fires a Server Action (`useOptimistic` for instant feedback — see `stack-server-actions`). The rule: 2+ settings in the same logical cluster share ONE card.

## Template 3: Edit

Dedicated edit route, or the toggled state of Detail. The canonical Persimmon edit pattern is a route that renders a form posting to a Server Action.

```tsx
// src/app/processes/[id]/edit/page.tsx
export const dynamic = "force-dynamic";

export default async function EditProcess({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proc = await db.process.findUniqueOrThrow({ where: { id } });
  return <EditProcessForm process={proc} />; // "use client", calls updateProcess action
}
```

```tsx
// edit-process-form.tsx — "use client"
const [state, formAction, pending] = useActionState(updateProcess, null);
// form id="process-form"; Save button in the sticky bar targets it via form="process-form"
```

**Rules:** Sticky top action bar required. Bottom duplicate action bar optional when the form exceeds ~1.5 viewport heights. Cancel returns to Detail. Save calls the update action (`stack-server-actions`); disable Save while `pending`. Render `state.fieldErrors` inline (`aria-invalid` on inputs). Warn on navigation only if the form is dirty (a `useState` dirty flag + `beforeunload`).

## Template 4: Create

New empty form. Same layout as Edit, defaults pre-filled, back link returns to List.

```tsx
// src/app/processes/new/page.tsx
import { NewProcessForm } from "./new-process-form";
export const dynamic = "force-dynamic";
export default function NewProcessPage() {
  return (
    <>
      <PageActionBar>
        <a href="/processes" className="text-sm text-ink/70">← Processes</a>
        <button type="submit" form="process-form" className="bg-oxblood px-4 py-2 text-sm text-bone">
          Create process
        </button>
      </PageActionBar>
      <NewProcessForm />
    </>
  );
}
```

**Rules:** Save label is the **verb**: "Create process", not "Save". Cancel returns to List. On success, the action returns `{ ok:true, data:{ id } }` and the client `router.push`es to the new Detail page (or the action `redirect()`s) — see `stack-server-actions`. Required fields use native `required` + a visible asterisk. Validate with Zod (`stack-zod-boundary`).

## Template 5: Dashboard

The operator's first screen — KPI cards, charts, recent activity. Read-only.

**Anatomy:** action bar with optional global date-range filter · KPI row · chart area · activity feed.

```tsx
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = "30d" } = await searchParams;
  const stats = await getStats(period); // server fn, persisted/cached results — never regenerate on load
  return (
    <>
      <PageActionBar>
        <h1 className="font-serif text-2xl">Dashboard</h1>
        <form method="get">
          <select name="period" defaultValue={period} className="min-h-11 border border-rule px-3">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </form>
      </PageActionBar>

      <section className="grid gap-5 px-6 py-4 @md:grid-cols-3 @container">
        <div className="border border-rule p-4">
          <p className="text-sm text-ink/60">Revenue</p>
          <p className="font-serif text-3xl tabular-nums">$48,213</p>
          <p className="text-sm text-moss tabular-nums">▲ 12.4%</p>
        </div>
      </section>

      <RevenueChart period={period} /> {/* "use client", recharts */}
    </>
  );
}
```

**Rules:** No "Save" — dashboards are read-only; actions live per-widget. KPI cards use `tabular-nums` (`frontend-internal-tool-conventions`). Global date filter via GET form at top; per-card filters inside the card. Empty/error states per widget, never page-wide. Charts are `"use client"` (recharts/Chart.js).

## Template 6: Wizard / Multi-step

Guided creation across 3–7 steps. **Exception to the sticky-top rule: wizards use a sticky BOTTOM bar** with Back/Next — that's the expected multi-step affordance.

**Anatomy:** progress indicator at top · step content · sticky bottom action bar.

```tsx
// each step is a real URL: /onboarding?step=2  (refresh + back-button safe)
<nav aria-label="Setup progress" className="px-6 pt-6">
  <ol className="flex gap-4 text-sm">
    <li className="text-moss">1. Company info</li>
    <li aria-current="step" className="font-medium">2. Address</li>
    <li className="text-ink/40">3. Confirm</li>
  </ol>
</nav>

<form id="wizard-form" action={saveStep}>{/* step fields */}</form>

<div className="sticky bottom-0 flex justify-between border-t border-rule bg-bone px-6 py-3">
  <a href="?step=1" className="text-sm">← Back</a>
  <button type="submit" form="wizard-form" className="bg-oxblood px-4 py-2 text-sm text-bone">Next →</button>
</div>
```

**Rules:** Each step = a real `?step=N` URL so refresh/back work; persist step data via a Server Action between steps. Final step uses a commit verb ("Create account", "Submit application") — never bare "Next" or "Submit". Always show the progress indicator.

## Template 7: Settings

Grouped form sections (Profile, Notifications, Billing, API keys).

**Anatomy:** section nav (anchors or tabs) + per-section form, each with its own Save and its own Server Action.

```tsx
<div className="grid grid-cols-[200px_1fr] gap-8 px-6 py-4">
  <nav className="flex flex-col gap-1 text-sm">
    <a href="#profile" className="font-medium">Profile</a>
    <a href="#notifications">Notifications</a>
  </nav>
  <div>
    <section id="profile" className="border-b border-rule pb-8">
      <h2 className="font-serif text-xl">Profile</h2>
      <form action={saveProfile}>
        {/* fields */}
        <button type="submit" className="mt-4 bg-oxblood px-4 py-2 text-sm text-bone">Save profile</button>
      </form>
    </section>
  </div>
</div>
```

**Rules:** **Per-section Save** (not "Save all") keeps the blast radius small — each section is its own Server Action. Save label names the section ("Save profile"). Pick anchors OR tabs per project, not both. Destructive actions go in a "Danger zone" section at the bottom, guarded by a Radix AlertDialog confirm (`frontend-feedback-system`).

## Template 8: Empty state

First-use of an empty list.

**Anatomy:** centered icon · headline · specific primary CTA.

```tsx
function EmptyProcesses() {
  return (
    <div className="grid place-items-center gap-3 py-20 text-center">
      <FolderOpen className="h-12 w-12 text-ink/40" aria-hidden />
      <h2 className="font-serif text-xl">No processes yet</h2>
      <p className="text-ink/60">Processes you create will show here.</p>
      <a href="/processes/new" className="inline-flex items-center gap-2 bg-oxblood px-4 py-2 text-sm text-bone">
        <Plus className="h-4 w-4" aria-hidden /> Create your first process
      </a>
    </div>
  );
}
```

**Rules:** Real lucide icon, not a Spline blob or unDraw illustration. CTA label is specific ("Create your first process"). For a filtered-but-empty result use a different message ("No processes match the filter. Clear filters?"), not the first-use empty state.

## Customization model

**Templates are structure contracts.** Per client: brand color, font, logo, section names, field labels, copy, which templates apply. Stays the same: page anatomy, sticky action bar, button ordering, the verb-labeled create button. Structural deviation gets documented in an ADR (`docs/decisions/`), not silently diverged.

## Anti-patterns banned

- Save only at the bottom of a form (forces scrolling)
- Edit-mode toggle that reloads and loses scroll position
- "Save all" across unrelated settings sections
- Empty state with a Spline blob or unDraw illustration
- "Next" as the label on a wizard's final step (use a commit verb)
- Non-sticky action bar on a long form
- A dashboard with a "Save" button
- A modal for editing a single field where a Detail/Edit page is cleaner
- A page that reads the DB but forgets `export const dynamic = "force-dynamic"`

## Cross-references

- `stack-server-actions` — the action wiring, `ActionResult`, `force-dynamic`, redirects, `useActionState`
- `stack-zod-boundary` — input validation for every form
- `frontend-internal-tool-conventions` — visual styling of components inside these templates
- `frontend-interaction-patterns` — Save/Cancel ordering, back-arrow, dirty-state warnings
- `frontend-responsive` — how sidebar + action bar adapt across breakpoints
- `frontend-data-tables` — list-page table + filter-bar mechanics
- `frontend-feedback-system` — toasts, destructive-confirm dialogs
- `stack-tailwind-tokens` — the tokens these scaffolds reference
