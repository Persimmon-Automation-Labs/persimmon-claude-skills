---
name: frontend-form-patterns
description: Form UX conventions for Persimmon internal tools beyond the input baseline — required-field marking, inline field errors, form-level error summary (GOV.UK pattern), character counters, live-search with debounce, and the four empty-state types. Built on Next.js 16 Server Actions + Zod + React (useActionState, useDeferredValue, useTransition, AbortController in useEffect). Use when building any form or a list with search, wiring server-validation errors back to fields, or rendering empty/no-results/error/permission states.
---

# Form Patterns — Persimmon Patterns

Beyond input styling (which lives in `frontend-internal-tool-conventions`), every form needs validation feedback, required marking, and surrounding patterns: error summaries, counters, live search, empty states. Mutations go through Server Actions validated with Zod — see `stack-server-actions` and `stack-zod-boundary` for the action contract this skill consumes. Tailwind tokens come from `stack-tailwind-tokens`.

The form is a `"use client"` component that calls a Server Action via `useActionState`. The action returns the `ActionResult<T>` union with `fieldErrors` — this skill is how those errors reach the UI.

## Required-field marking

Red asterisk after the label via a small abbreviation. Native `required` is sufficient for screen readers in 2026 — no `aria-required`.

```tsx
<label htmlFor="email" className="block text-sm font-medium">
  Email <abbr title="obrigatório" className="text-oxblood no-underline">*</abbr>
</label>
<input id="email" name="email" type="email" required autoComplete="email" className="..." />
```

For optional fields in an otherwise-required form, append a muted `(opcional)` to the label instead. Pick one strategy per form — never mix asterisks and "(opcional)".

## Inline field errors — wired from the action result

Errors come from `state.fieldErrors` on the `ActionResult`. **"Reward early, punish late"**: validate on submit always; clear an existing error on input as soon as the field is valid. Native attributes (`required`, `minLength`, `type="email"`) are the first line; the server is the source of truth.

```tsx
"use client";
import { useActionState } from "react";
import { createClient } from "@/lib/client-actions";

export function ClientForm() {
  const [state, formAction, pending] = useActionState(createClient, null);
  const errs = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email <abbr title="obrigatório" className="text-oxblood no-underline">*</abbr>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={!!errs?.email}
          aria-describedby={errs?.email ? "email-error" : undefined}
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errs?.email ? "border-oxblood shadow-[inset_3px_0_0] shadow-oxblood" : "border-stone-300"
          }`}
        />
        {errs?.email && (
          <p id="email-error" className="mt-2 text-sm font-medium text-oxblood">
            <span className="sr-only">Erro:</span> {errs.email[0]}
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className="...">
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
```

The visually-hidden "Erro:" prefix (GOV.UK convention) gives screen-reader context. Max one visible error per field. `aria-describedby` only points at the error node when it exists.

## Form-level error summary (GOV.UK pattern)

Use when the action returns a top-level `error` or 2+ field errors. Render above the form, `role="alert"`, `tabIndex={-1}`, and focus it on render via a ref + effect. Link each item to its field.

```tsx
"use client";
import { useEffect, useRef } from "react";

export function ErrorSummary({ fieldErrors }: { fieldErrors: Record<string, string[]> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mb-5 rounded border border-oxblood bg-oxblood/5 p-4"
    >
      <h2 className="font-semibold">Há um problema</h2>
      <ul className="mt-2 list-inside list-disc">
        {entries.map(([field, msgs]) => (
          <li key={field}>
            <a href={`#${field}`} className="underline">{msgs[0]}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`role="alert"` announces on render; `tabIndex={-1}` allows programmatic focus. **Match error wording exactly** between summary and inline message — same text, two places. The summary's anchor `href="#email"` jumps to the field whose `id` matches.

## Character counters

Use for fields with a hard limit (SEO meta 60/160, SMS 160, bios). A tiny controlled `"use client"` component; announce via `aria-live="polite"` but throttle so screen readers aren't spammed on every keystroke.

```tsx
"use client";
import { useState, useId } from "react";

export function CountedTextarea({ name, max, label }: { name: string; max: number; label: string }) {
  const [value, setValue] = useState("");
  const id = useId();
  const left = max - value.length;
  const tone = left < 0 ? "text-oxblood font-semibold" : left <= max * 0.2 ? "text-amber-600" : "text-stone-500";

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <textarea
        id={id}
        name={name}
        maxLength={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={`${id}-counter`}
        className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
      />
      <div id={`${id}-counter`} aria-live="polite" aria-atomic className={`mt-1 text-right text-sm ${tone}`}>
        {left} caracteres restantes
      </div>
    </div>
  );
}
```

Soft-warn at 80% used (amber), hard-warn past the limit (red) but don't block typing — let the user overshoot and see they must trim.

## Live search with debounce — React hooks

Replace vanilla `setTimeout` + manual `AbortController` with React idioms. Two flavors:

**Filtering server data via URL** (preferred for list pages): update searchParams with `useTransition` so the URL drives the RSC query (see `frontend-data-tables`). `useDeferredValue` keeps typing responsive.

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";

export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [isPending, startTransition] = useTransition();

  function onChange(q: string) {
    setValue(q);
    startTransition(() => {
      const next = new URLSearchParams(params);
      if (q.trim().length >= 2) next.set("q", q.trim());
      else next.delete("q");
      next.delete("page"); // reset paging on new query
      router.replace(`?${next.toString()}`);
    });
  }

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      placeholder="Buscar…"
      aria-busy={isPending}
      className="w-full rounded border border-stone-300 px-3 py-2"
    />
  );
}
```

**Async fetch to an API route** (typeahead that doesn't navigate): debounce in `useEffect`, cancel with `AbortController` in the cleanup. Min query length 2; debounce ~250ms.

```tsx
"use client";
import { useEffect, useState } from "react";

export function Typeahead({ url }: { url: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${url}?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal });
        setResults(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, url]);

  return (
    <>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className="..." />
      <div role="status" aria-live="polite">
        {results.map((r) => <a key={r.id} href={`/clients/${r.id}`} className="block">{r.label}</a>)}
      </div>
    </>
  );
}
```

`AbortController` in the cleanup guarantees a slow earlier response can't clobber a faster newer one. Skip the full ARIA combobox pattern unless the field auto-fills its own value — a plain `<input type="search">` + `role="status"` region is enough.

## Empty states — four types

| Type | When | Treatment |
|---|---|---|
| **First-use** | List never had data | Icon + title + 1-2 sentences + primary CTA ("Criar o primeiro…") |
| **No-results** | Search/filter returned nothing | Smaller icon + "Nenhum resultado para '{q}'" + secondary "Limpar filtros" |
| **Error** | DB/API failed | Warning icon + "Não foi possível carregar…" + "Tentar novamente" |
| **Permission** | User lacks access | Lock icon + "Você não tem acesso…" + link to admin |

```tsx
import { Users } from "lucide-react";

export function EmptyState() {
  return (
    <div className="px-5 py-14 text-center text-stone-500">
      <Users aria-hidden className="mx-auto mb-4 size-12 opacity-50" />
      <h3 className="text-lg font-semibold text-stone-900">Nenhum cliente ainda</h3>
      <p className="mx-auto mb-5 max-w-[32ch]">Adicione o primeiro cliente para começar a acompanhar processos.</p>
      <a href="/clients/new" className="inline-flex rounded bg-stone-900 px-4 py-2 text-white">Adicionar cliente</a>
    </div>
  );
}
```

Copy rule: explain WHY it's empty + WHAT the user can do. "Sem dados" alone is banned.

## Field-level affordances

| Attribute | Use |
|---|---|
| `autoComplete` | Always set. `email`, `name`, `given-name`, `tel`, `street-address`, `postal-code`, `new-password`, `one-time-code`, `off` |
| `inputMode` | `numeric`, `decimal`, `tel`, `email`, `url`, `search` — controls mobile keyboard |
| `<input type="date">` | Native is fine for admin tools in 2026 — skip custom pickers unless you need range selection |
| `<select>` vs combobox | Native `<select>` for ≤15 options; searchable combobox for 15+ |

Password show/hide: a toggle button inside the input, `aria-pressed`, label swapped "Mostrar senha" / "Ocultar senha".

## Server-validation flow (replaces PHP PRG)

PHP's Post-Redirect-Get + `$_SESSION['form_errors']` is replaced entirely by the Server Action return shape. The action runs `safeParse`, and on failure returns `{ ok: false, fieldErrors }` (see `stack-server-actions`). `useActionState` hands that result straight back to the same rendered form — no redirect, no session stash, no double-submit warning. Server Actions also carry CSRF protection built in (no manual token).

```ts
// In the action (stack-server-actions): on validation failure
if (!parsed.success) {
  return actionErr("Dados inválidos.", parsed.error.flatten().fieldErrors);
}
```

For progressive enhancement without JS, the same action works via `<form action={fn}>`; native `required`/`minLength` attributes catch the obvious cases pre-submit.

## One-screen defaults

- Form is `"use client"` calling a Server Action through `useActionState`.
- Required = asterisk; validate on submit, clear on valid input.
- Field errors come from `state.fieldErrors`; wire `aria-invalid` + `aria-describedby`.
- Error summary on 2+ errors, `role="alert"` + autofocus, wording matches inline.
- Live search filters via searchParams + `useTransition`; typeahead debounces in `useEffect` with `AbortController`.
- Empty states: choose one of four; never "Sem dados" alone.

## Anti-patterns banned

- Validating empty fields on focus (premature).
- `aria-required` without `required`.
- Mixing required-marking strategies in one form.
- Error summary without `tabIndex={-1}` / no autofocus.
- Different wording in summary vs inline message.
- Counter announcing on every keystroke unthrottled (screen-reader spam).
- Live search without `AbortController` cleanup (stale responses clobber fresh).
- Custom dropdown when native `<select>` would do.
- Empty-state copy "Sem dados" alone.
- Re-implementing PHP PRG / session error stash — use the Server Action result + `useActionState`.

## When NOT to use this skill

- Input baseline styling (height, focus ring) → `frontend-internal-tool-conventions`.
- Save/Cancel button placement → `frontend-interaction-patterns`.
- Toast / post-submit success feedback → `frontend-feedback-system`.
- The action contract + Zod schema → `stack-server-actions`, `stack-zod-boundary`.

## Relationship to other skills

| Skill | Connection |
|---|---|
| `stack-server-actions` | The `ActionResult` + `useActionState` this skill renders |
| `stack-zod-boundary` | Schema producing `fieldErrors` |
| `stack-tailwind-tokens` | Spacing/color tokens |
| `frontend-feedback-system` | Toast/flash after submit; loading button |
| `frontend-interaction-patterns` | Submit button placement |
| `frontend-internal-tool-conventions` | Input baseline styling |
| `frontend-page-templates` | Empty-state template variants |

Sources: [GOV.UK Error message](https://design-system.service.gov.uk/components/error-message/), [GOV.UK Error summary](https://design-system.service.gov.uk/components/error-summary/), [NN/g — Marking Required Fields](https://www.nngroup.com/articles/required-fields/), [NN/g — Empty State Design](https://www.nngroup.com/articles/empty-state-interface-design/), [web.dev — Form validation](https://web.dev/learn/forms/validation), [React — useActionState](https://react.dev/reference/react/useActionState), [React — useDeferredValue](https://react.dev/reference/react/useDeferredValue).
