---
name: frontend-interaction-patterns
description: Persimmon conventions for action placement, buttons, dialogs, and navigation in Next.js 16 React apps. Owns where actions go on screen — back/cancel LEFT, primary RIGHT — plus modal vs page actions, the back-arrow link pattern, multi-step wizard actions, destructive-action isolation, and section navigation (segmented control vs tabs vs dropdown vs in-page sidebar). Use when designing or reviewing any interactive component: form action rows, modals, wizards, page-level CTAs, destructive buttons, or tab/section navigation.
---

# Interaction Patterns — Persimmon Patterns

How action buttons are placed, ordered, and built across every Persimmon app. Universal rules. Tailwind tokens from `stack-tailwind-tokens`; the dialog primitives themselves from `frontend-feedback-system` (Radix); button visual style from `frontend-internal-tool-conventions`.

## Action placement — the universal rule

LTR reading direction determines action direction:

| Direction | Button | Position |
|---|---|---|
| Back / Cancel / Secondary | undoes or steps away | **LEFT** |
| Forward / Confirm / Primary | advances or commits | **RIGHT** |

Why: LTR eye flow lands left, moves right; the right thumb falls on the right edge on mobile; Apple HIG, Material 3, Stripe, Linear, Vercel all follow it. Windows' "OK, Cancel" is the outlier — never on web.

**Hard rule**: a primary action never sits to the left of a secondary/cancel on the same row.

## Standard form actions

Cancel far LEFT (or omitted when a page-level back link suffices), Save/Submit far RIGHT. The `mr-auto` (auto-margin) trick enforces "secondary left, primary right" regardless of DOM order — keep Cancel first in source for accessibility, push it left visually.

```tsx
<div className="flex justify-end gap-3 pt-6">
  <button type="button" className="mr-auto rounded px-4 py-2 text-stone-600">Cancelar</button>
  <SubmitButton />  {/* loading state from frontend-feedback-system */}
</div>
```

Keeping Cancel before the primary in the DOM means tab order hits Cancel first; `mr-auto` shoves it to the far left visually. Both correct.

## Modal and dialog actions

Both buttons at the bottom, **right-aligned together**, Cancel still left-of-primary within that group. Destructive primary uses the danger color. This matches the Radix `AlertDialog`/`Dialog` layouts in `frontend-feedback-system` — Cancel is also the autofocused control on a destructive dialog so Enter never fires it.

```tsx
<div className="flex justify-end gap-3 pt-5">
  <AlertDialog.Cancel className="rounded px-3 py-1.5" autoFocus>Cancelar</AlertDialog.Cancel>
  <AlertDialog.Action className="rounded bg-oxblood px-3 py-1.5 text-white">Excluir cliente</AlertDialog.Action>
</div>
```

## Multi-step form / wizard actions

`Voltar` far LEFT, `Próximo`/`Continuar`/`Submit` far RIGHT, spanning the row with `justify-between`. On the **final step**, the right button becomes the commit verb (`Criar conta`, `Finalizar`) — never `Próximo` on the last step.

```tsx
<div className="flex items-center justify-between gap-3 border-t pt-6">
  <button type="button" className="inline-flex items-center gap-2 rounded px-4 py-2 text-stone-600">
    <ArrowLeft aria-hidden className="size-4" /> Voltar
  </button>
  <button type="submit" className="inline-flex items-center gap-2 rounded bg-stone-900 px-4 py-2 text-white">
    Próximo <ArrowRight aria-hidden className="size-4" />
  </button>
</div>
```

Persist step state in the URL (`?step=2`) or `useState` in a parent client component — never reload the page between steps.

## Page-level actions

For a non-modal edit/settings page:
- **Back link** top-left of the page header (in the breadcrumb area, not in the form actions).
- **Primary** top-right of the header AND bottom-right of the form — two buttons that submit the same form, so users can save without scrolling.

```
┌─────────────────────────────────────┐
│  ← Clientes        [Salvar]         │  ← page header
│  Editar cliente                     │
│  [campos…]                          │
│  [Cancelar]            [Salvar]     │  ← form actions
└─────────────────────────────────────┘
```

## Destructive actions

The most accident-prone control on the page:

1. **Never adjacent to Save.** Put it in a kebab/overflow menu, or a separate "Zona de perigo" section at the page bottom with extra padding.
2. **Fill the danger color** (red background, white text) — outline-only isn't enough.
3. **Confirm with an AlertDialog** if irreversible (see `frontend-feedback-system`); its primary is the destructive button, Cancel autofocused.
4. **Word it precisely**: "Excluir cliente", not "Excluir" alone.

```tsx
<section className="mt-10 rounded border border-oxblood/30 p-4">
  <h3 className="font-semibold">Zona de perigo</h3>
  <p className="text-sm text-stone-600">Exclui permanentemente este cliente e todos os registros associados.</p>
  <DeleteClientButton id={id} name={name} orderCount={count} /> {/* AlertDialog from frontend-feedback-system */}
</section>
```

## Back arrow — a link, not a button

A back affordance navigates, so it's a **text link with an arrow icon**, never a button shape. Use `next/link` for a real destination (works without JS, shareable); use `router.back()` only when the destination depends on the referrer.

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

<Link href="/clients" className="inline-flex items-center gap-2 p-2 font-medium text-stone-700 hover:underline">
  <ArrowLeft aria-hidden className="size-4" /> Clientes
</Link>
```

```tsx
// Referrer-dependent back — client component
"use client";
import { useRouter } from "next/navigation";
const router = useRouter();
<button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 p-2 font-medium text-stone-700 hover:underline">
  <ArrowLeft aria-hidden className="size-4" /> Voltar
</button>
```

Prefer the `<Link>` version. Rules: `lucide-react` arrow (never an emoji); label with text when the destination is named; 44×44 tap target via padding (not a bigger icon); no border/fill/button shape — a bordered "[← Clientes]" rectangle is the most common anti-pattern.

## Section navigation — segmented vs tabs vs dropdown vs sidebar

Decisive variables: **section count** and **relationship**.

| Sections | Pattern | When |
|---|---|---|
| 2-4 | **Segmented control** | Compact mutually-exclusive choice, single line (Todos / Ativos / Arquivados) |
| 3-7 | **Tabs** | Parallel content, equal weight (Perfil / Notificações / Cobrança) |
| 7-12 | **Dropdown** or scrollable single-row tabs | Tab strip starts wrapping |
| 12+ | **In-page left sidebar** | Tab strip has crashed; group into 4-5 categories |
| Hierarchical | **Accordion** or grouped sidebar | Sections nest |
| Sequential | **Wizard** | Order matters; progress is meaningful |

**The tab cliff**: tabs break around 7-8 sections; by 15+ the strip wraps and active state is lost. Past the cliff → dropdown or sidebar.

### Tabs — Radix Tabs, state in URL

Use Radix `Tabs` for built-in roving-tabindex keyboard nav. Drive selection from the URL so the active tab survives refresh and is shareable.

```tsx
"use client";
import * as Tabs from "@radix-ui/react-tabs";
import { useRouter, useSearchParams } from "next/navigation";

export function SectionTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const value = params.get("tab") ?? "info";
  return (
    <Tabs.Root value={value} onValueChange={(v) => router.replace(`?tab=${v}`)}>
      <Tabs.List aria-label="Seções" className="flex gap-1 border-b">
        <Tabs.Trigger value="info" className="px-3 py-2 data-[state=active]:border-b-2 data-[state=active]:border-stone-900">Cliente</Tabs.Trigger>
        <Tabs.Trigger value="request" className="px-3 py-2 data-[state=active]:border-b-2 data-[state=active]:border-stone-900">Pedido</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="info">…</Tabs.Content>
      <Tabs.Content value="request">…</Tabs.Content>
    </Tabs.Root>
  );
}
```

Single line only. If triggers wrap, you have too many — switch patterns.

### Dropdown for 7-12 sections

Native `<select>` navigating on change — keyboard, screen reader, mobile-friendly out of the box.

```tsx
"use client";
import { useRouter } from "next/navigation";
const router = useRouter();
<select aria-label="Seção" onChange={(e) => router.push(e.target.value)} className="rounded border px-3 py-2">
  <option value="/credit-memo/3/info">Cliente</option>
  <option value="/credit-memo/3/request">Pedido</option>
</select>
```

### Sidebar for 12+ sections

In-page left sidebar (`next/link` items, active state highlighted) grouped into 4-5 categories; scrolls independently of main content. See `frontend-page-templates` for the settings layout.

### Section-nav anti-patterns

- Tabs wrapping to 2+ rows (switch patterns).
- Custom dropdown when native `<select>` would work.
- Tab switch doing a full page reload (drive via URL/state).

## One-screen defaults

- Cancel/back LEFT, primary RIGHT — enforced by `mr-auto` on the secondary.
- Page edit: back link top-left, Save top-right + bottom-right (same form).
- Destructive isolated (kebab or danger zone), filled red, AlertDialog-confirmed.
- Back = `next/link` text+arrow link, never a button shape.
- Section nav by count: 2-4 segmented, 3-7 Radix tabs, 7-12 select, 12+ sidebar — always URL-driven.

## Anti-patterns banned

- Primary to the LEFT of secondary on the same row.
- "OK, Cancel" ordering (Windows convention).
- Destructive action adjacent to Save.
- Back arrow without a clear destination or label.
- `<div>` / `<a href="#">` for buttons that need a `<button>`.
- Two primary-styled buttons on one row.
- Icon-only back arrow when text would fit.
- Modal primary placed far left (it still goes right within the dialog group).
- `Submit`/`Próximo` as the final wizard step label (use the commit verb).
- Tab switch reloading the page.

## When NOT to use this skill

- Button visual styling (color, radius, hover) → `frontend-internal-tool-conventions`.
- The dialog primitives themselves → `frontend-feedback-system`.
- Top nav / hamburger / responsive reflow → `frontend-responsive` siblings.
- Color token wiring → `stack-tailwind-tokens`.

## Relationship to other skills

| Skill | What it owns |
|---|---|
| `frontend-feedback-system` | The Radix Dialog/AlertDialog primitives; Cancel-autofocus rule |
| `frontend-internal-tool-conventions` | Button visual style |
| `frontend-page-templates` | Sticky action bar, settings sidebar layout |
| `stack-tailwind-tokens` | Button color + spacing tokens |
| `stack-server-actions` | The action a submit button triggers |

Sources: [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Material 3 — Dialogs](https://m3.material.io/components/dialogs/guidelines), [NN/g — OK/Cancel Button Order](https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/), [Radix Tabs](https://www.radix-ui.com/primitives/docs/components/tabs), [WCAG 2.5.5 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).
