---
name: frontend-feedback-system
description: Unified Persimmon pattern for UI feedback — toast notifications via sonner, inline flash messages after a Server Action redirect, destructive confirmation via Radix AlertDialog, content/form modals via Radix Dialog, and button loading states with useActionState/useTransition. Use when adding any post-action feedback, confirm-before-delete flow, async button, or modal in a Next.js 16 React app. Covers ARIA live-region behavior (sonner handles it), focus management, and the toast-vs-flash-vs-dialog decision.
---

# Feedback System — Persimmon Patterns

One feedback vocabulary for every Persimmon app: `sonner` for toasts, Radix `AlertDialog` for destructive confirms, Radix `Dialog` for content/forms, and React pending state for buttons. Tailwind tokens come from `stack-tailwind-tokens`; Server Action mechanics from `stack-server-actions`.

## When toast vs inline flash vs AlertDialog vs Dialog

| Pattern | Use when | Persists | Primitive |
|---|---|---|---|
| **Toast** | Confirmation after an action, user stays on page | Auto-dismiss (4-6s) | `sonner` |
| **Inline flash** | Message must survive a Server Action `redirect()` | Until next navigation / dismiss | `searchParams` or sonner-on-mount |
| **AlertDialog** | Destructive / irreversible confirmation | Until Confirm or Cancel | Radix `AlertDialog` |
| **Dialog** | Form / detail / multi-field that doesn't warrant a page | Until dismissed | Radix `Dialog` |

## Setup — `sonner` mounted once

Mount `<Toaster>` once in the root layout (it's a client component). It owns the ARIA live regions internally — you never hand-write `role="alert"`/`aria-live`.

```tsx
// src/app/layout.tsx
import { Toaster } from "sonner";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
```

## Toast notifications

Call `toast` from any client component — typically in the effect that reads a Server Action result.

```tsx
"use client";
import { toast } from "sonner";

toast.success("Salvo.");
toast.error("Não foi possível salvar.");           // errors: persist until dismissed
toast.success("Excluído.", {
  action: { label: "Desfazer", onClick: () => undo() },
  duration: 8000,                                    // action toasts: ≥8s
});
```

Durations (Material 3 / sonner consensus): success/info **4s**, warning **6s**, error **never auto-dismiss**, action toast **≥8s**. `richColors` gives semantic backgrounds; sonner routes errors to an assertive region and the rest to polite — don't override that.

### Toast after a Server Action

The action returns `ActionResult` (see `stack-server-actions`); the form reads `state` and toasts in an effect.

```tsx
"use client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client-actions";

export function ClientForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createClient, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Cliente criado.");
      router.push(`/clients/${state.data.id}`);
    } else if (state?.ok === false && !state.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  return <form action={formAction}>{/* … */}<SubmitButton pending={pending} /></form>;
}
```

## Inline flash that survives a redirect

When a destructive action ends in `redirect()` (see `stack-server-actions`), the rendered form is gone, so toast-in-effect can't fire. Carry the message in searchParams and toast it on the destination mount.

```ts
// action: after delete
revalidatePath("/clients");
redirect("/clients?flash=deleted");
```

```tsx
// src/app/clients/flash.tsx — rendered on the list page
"use client";
import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = { deleted: "Cliente excluído." };

export function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const key = params.get("flash");
    if (key && MESSAGES[key]) {
      toast.success(MESSAGES[key]);
      router.replace("/clients"); // strip the param so refresh won't re-toast
    }
  }, [params, router]);
  return null;
}
```

For a persistent banner (user must read/copy something), render a Tailwind alert block at the top of `<main>` keyed off the searchParam instead of a toast.

## AlertDialog — destructive confirmation (Radix)

`window.confirm()` is **banned** (unstyled, blocks the thread, no branding). Use Radix `AlertDialog`: it traps focus, defaults focus to **Cancel**, and disables backdrop-dismiss — so Enter never fires the destructive action.

```tsx
"use client";
import { useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { toast } from "sonner";
import { deleteClient } from "@/lib/client-actions";

export function DeleteClientButton({ id, name, orderCount }: { id: string; name: string; orderCount: number }) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteClient(id);
      if (!res.ok) toast.error(res.error);
      // success path redirects from the action; flash handles the toast
    });
  }

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger className="rounded bg-oxblood px-3 py-1.5 text-sm text-white">
        Excluir cliente
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold">Excluir {name}?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-stone-600">
            Isso remove permanentemente o cliente e os {orderCount} processos associados. Não pode ser desfeito.
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-3">
            <AlertDialog.Cancel className="rounded px-3 py-1.5 text-sm" autoFocus>Cancelar</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={confirm}
              disabled={pending}
              className="rounded bg-oxblood px-3 py-1.5 text-sm text-white"
            >
              {pending ? "Excluindo…" : "Excluir cliente"}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
```

Rules: **Cancel autofocused** (per the button order in `frontend-interaction-patterns`, Cancel left, destructive primary right). Restate the consequence with specifics ("remove os 47 processos"). Skip "Tem certeza?". Button label = the verb ("Excluir cliente"), never "OK".

**Type-to-confirm** (GitHub-style) for catastrophic actions: same `AlertDialog` with a controlled text input; enable Action only when the typed value matches the required phrase.

## Dialog — content / forms (Radix)

Same family, looser rules: backdrop click DOES dismiss; first field / `autoFocus` gets focus. Embed a form whose submit calls a Server Action.

```tsx
"use client";
import * as Dialog from "@radix-ui/react-dialog";

export function EditNoteDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(90vw,40rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Editar nota</Dialog.Title>
          {/* form calling a Server Action via useActionState */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**Stacked modals are banned.** Need a second step → a wizard inside one Dialog.

## Button loading states

Disable the button, swap to a present-continuous verb, set `aria-busy`. With `<form action={fn}>` use `useFormStatus`; with imperative calls use `useTransition`.

```tsx
"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ idle = "Salvar", busy = "Salvando…" }: { idle?: string; busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-60">
      {pending ? busy : idle}
    </button>
  );
}
```

Copy: Salvar→Salvando…, Enviar→Enviando…, Excluir→Excluindo…. Thresholds: <300ms no loading state (flicker); 300ms-3s button state; 3s-10s button + skeleton; >10s progress modal or "avisaremos por email".

## Accessibility cross-cutting

| Pattern | Focus on open | Restore focus | Notes |
|---|---|---|---|
| Toast | n/a | n/a | sonner owns live regions; don't add `role` |
| AlertDialog | **Cancel** | Trigger | Radix traps focus; backdrop-dismiss off |
| Dialog | First field / `autoFocus` | Trigger | Radix traps focus; backdrop-dismiss on |
| Loading button | n/a | n/a | `aria-busy` + label swap |

Radix handles focus trap, restore, and `Esc` automatically — don't reimplement.

## One-screen defaults

- `<Toaster richColors />` mounted once in root layout.
- Toast on stay-on-page success; flash via searchParam when the action redirects.
- Destructive → Radix `AlertDialog`, Cancel autofocused, no backdrop-dismiss.
- Content/forms → Radix `Dialog`, backdrop-dismiss on, no stacking.
- Buttons: `useFormStatus` (form) or `useTransition` (imperative); present-continuous verb + `aria-busy`.

## Anti-patterns banned

- `window.confirm()` / `alert()` / `prompt()` — use Radix dialogs + sonner.
- Hand-writing `role="alert"`/`aria-live` on toasts — sonner owns it.
- Destructive action autofocused (Enter fires the irreversible action).
- Backdrop click dismissing an AlertDialog.
- Stacked modals (use a wizard).
- Per-project reinvention of alert colors — `richColors` + Tailwind tokens.
- Disabled loading button with no `aria-busy` / no label change.
- Toast-in-effect after a redirect (the form unmounted — use the flash pattern).

## When NOT to use this skill

- Inline form-field validation errors → `frontend-form-patterns`.
- Page-level Save/Cancel placement → `frontend-interaction-patterns`.
- The action result shape → `stack-server-actions`.

## Relationship to other skills

| Skill | Connection |
|---|---|
| `stack-server-actions` | `ActionResult` + `redirect()` this skill reacts to |
| `stack-tailwind-tokens` | Dialog/flash color + spacing tokens |
| `frontend-interaction-patterns` | Cancel-left / destructive-right ordering inside dialogs |
| `frontend-form-patterns` | Field-level errors (this skill handles the post-submit *result*) |
| `frontend-page-templates` | Sticky Save bar; this skill handles the result of clicking Save |

Sources: [sonner](https://sonner.emilkowal.ski/), [Radix AlertDialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Material 3 Snackbar](https://m3.material.io/components/snackbar/guidelines), [Sara Soueidan — Accessible Notifications](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/), [W3C APG AlertDialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/), [React — useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus).
