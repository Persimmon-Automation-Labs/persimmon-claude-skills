---
name: frontend
description: Index of Persimmon frontend/UI skills — visual, UX, and structural conventions for any Next.js 16 + React + Tailwind v4 interface work. Covers internal-tool vs public-site conventions, page-template scaffolds, CSS/theme architecture, responsive layout, data tables, forms, feedback (toasts/dialogs), file-upload UX, interaction patterns, and print/PDF. Use when building or reviewing any UI, choosing a page layout, styling, making something responsive, or wiring form/table/feedback components. Routes to the right specialist child. Trigger keywords: frontend, UI, UX, layout, component, Tailwind, responsive, table, form, toast, dialog, modal, upload, print, page template, dashboard, admin UI, marketing site.
---

# Frontend — Index

Persimmon frontend = Next.js 16 Server Components by default, Tailwind v4 tokens, headless Radix primitives or plain Tailwind, `lucide-react` icons, `sonner` toasts. This mother is a map; follow the child for the actual work.

## Trigger

- "Build / style / lay out this screen"
- "Make this responsive" / "which page template fits?"
- "Add a table / form / toast / confirm dialog / file upload"
- "How should this internal tool (or marketing site) look?"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `frontend-internal-tool-conventions` | Admin / CRM / ops UIs | Typography (tabular figures), color, density, status badges, anti-AI-look |
| `frontend-public-site-conventions` | Marketing / lead-gen sites | Font pairings, 60-30-10 color, editorial type scale, anti-AI-look, craft layer |
| `premium-web-method` | Resisting AI generic look | Diverge→select→converge pipeline; ai-tell-lint gate; the 5 tests |
| `public-website-creative-direction` | Design direction for a public site | 8-question intake → 5 distinct concept briefs → signature element → translation table |
| `frontend-page-templates` | Starting any page | 8 canonical RSC + Server Action scaffolds (List, Detail, Edit, Create, Dashboard, Wizard, Settings, Empty State); sticky action bar |
| `frontend-css-architecture` | Theme/CSS setup | `globals.css` + `@layer` order, `next/font` loading, dark mode (defers token scale to `stack-tailwind-tokens`) |
| `frontend-responsive` | Layout across breakpoints | Sidebar (internal) vs top nav (public), hamburger, mobile-first, container queries |
| `frontend-data-tables` | Showing tabular data | Scroll wrapper, sticky last column, row-click → detail, kebab actions, pagination |
| `frontend-form-patterns` | Building forms | Required marking, inline errors, error summary, char counter, live search, empty states |
| `frontend-feedback-system` | User feedback | Toast + PRG flash + AlertDialog (destructive) + Dialog (content) + button loading |
| `frontend-file-upload` | Upload UX | Drop-zone, drag-drop, image preview — the React client on top of `infra-s3-uploads` |
| `frontend-interaction-patterns` | Buttons/nav/actions | Back/cancel LEFT, primary RIGHT; modal vs page actions; section nav (tabs/dropdown/sidebar) |
| `frontend-print-pdf` | Print / PDF output | `@media print` + `window.print()`; server-side PDF via `@react-pdf/renderer` or Playwright |

## How to route

1. **Setting up a project's look?** → `frontend-css-architecture` + (`frontend-internal-tool-conventions` OR `frontend-public-site-conventions`) by `.claude/project-type`.
2. **Building a screen?** → `frontend-page-templates` to pick the scaffold, then component children as needed.
3. **One component?** → invoke the matching child directly (`frontend-data-tables`, `frontend-form-patterns`, etc.).

## Persimmon frontend defaults — one-screen summary

- **Server Components by default**; `"use client"` only for state/effects/browser APIs.
- **Any page reading DB or `auth()` exports `const dynamic = "force-dynamic"`** (or the Railway build prerender crashes).
- **Tailwind v4 tokens** — never hardcode hex/spacing; use the scale from `stack-tailwind-tokens`.
- **Forms = Server Actions + Zod** — see `stack-server-actions`, `stack-zod-boundary`. Never trust raw `FormData`.
- **Icons** `lucide-react`; **toasts** `sonner`; **destructive confirm** Radix `AlertDialog`.
- **Internal tools**: one type family, tabular figures, dense; **public sites**: editorial pairing, generous whitespace.

## Anti-patterns banned

- Hardcoded colors/spacing instead of Tailwind tokens
- `"use client"` on a whole page when a leaf component would do
- Reading DB/`auth()` in a page without `force-dynamic`
- Building a form without Zod validation in the action
- The "AI default look" (Inter + violet gradient + glassmorphism + emoji headings)
- Re-implementing presigned-upload mechanics instead of using `infra-s3-uploads`

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `stack` | `stack-tailwind-tokens` owns the token scale; `stack-server-actions`/`stack-zod-boundary` own form wiring |
| `infra` | `frontend-file-upload` is the client UX on top of `infra-s3-uploads` |
| `backend` | `backend-admin-panel` composes these children into CRUD admin screens |
| `quality` | `quality-review-performance` audits RSC boundaries and bundle size of this UI |
