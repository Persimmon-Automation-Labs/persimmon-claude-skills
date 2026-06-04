---
name: backend
description: Index of Persimmon backend feature skills — server-side patterns for webhooks, payments, notifications, admin panels, editable settings, content management, and commerce concurrency on the Next.js 16 + Prisma + Postgres stack. Use when building webhook receivers, Stripe checkout/refunds, email/SMS notifications, CRUD admin pages, admin-editable integration settings, a content/CMS layer, or oversell/double-booking prevention. Routes to the right specialist child. Trigger keywords: backend, webhook, Stripe, payment, checkout, refund, notification, email, SMS, admin panel, CRUD, settings, secrets, CMS, content, concurrency, oversell, double-booking, idempotency.
---

# Backend — Index

Persimmon backend features = Server Actions and Route Handlers over Prisma/Postgres, Zod at every boundary, secrets server-side only, persist everything. This mother is a map; follow the child for the actual work.

## Trigger

- "Receive a webhook" / "verify a Stripe signature"
- "Take payments / issue refunds"
- "Send an email or SMS notification"
- "Build a CRUD admin panel / dashboard"
- "Let the admin edit integration credentials"
- "Add a content/CMS layer with publishing"
- "Stop overselling / double-booking"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `backend-webhook-handler` | Any inbound webhook | Raw-body signature verify, idempotency, event logging, retry semantics (Route Handler) |
| `backend-stripe` | Payments | Order lifecycle (PENDING → webhook-confirm PAID), PaymentIntent, Stripe.js Elements, refunds, SAQ-A, go-live checklist |
| `backend-notifications` | Email/SMS | One `notify()` over Resend + Twilio, post-commit + graceful degradation, A2P 10DLC trap |
| `backend-admin-panel` | Internal CRUD admin | NextAuth-guarded RSC pages, server-side pagination/search, Server Action CRUD, recharts dashboard |
| `backend-settings-admin` | Editable config/secrets | AES-256-GCM-encrypted `Setting` table, env fallback, per-integration test-connection |
| `backend-content-management` | CMS / editable content | Typed content blocks, sanitize-on-write, media library w/ required alt, slug→301, `revalidateTag` on publish |
| `backend-commerce-concurrency` | Limited inventory/slots | Atomic conditional claims, `FOR UPDATE`, advisory locks, checkout-start holds |

## How to route

1. **Money flows** → `backend-stripe` (+ `backend-webhook-handler` for the receiver, + `backend-commerce-concurrency` if inventory is limited).
2. **Admin surface** → `backend-admin-panel` (+ `backend-settings-admin` for editable integration config).
3. **Editable content** → `backend-content-management`.
4. **Outbound comms** → `backend-notifications`.

## Persimmon backend defaults — one-screen summary

- **Zod at every trust boundary** — Server Actions, Route Handlers, webhook payloads, `searchParams`.
- **Webhooks**: `runtime = "nodejs"`, read the **raw body**, verify the signature, dedupe by a unique event id, return 2xx fast.
- **Secrets server-side only** (`import "server-only"`); never `NEXT_PUBLIC_*`.
- **Idempotency** = Prisma unique constraint + `upsert`/`P2002` catch, not application guards alone.
- **Notifications fire post-commit** and must never fail the originating action.
- **Concurrency** uses DB-level guarantees (`$transaction` + `FOR UPDATE` / advisory locks), never read-then-write in app code.
- **Persist every record**; any page reading DB/`auth()` exports `const dynamic = "force-dynamic"`.

## Anti-patterns banned

- Parsing a webhook body before verifying its signature, or verifying against a JSON-reserialized body
- Trusting client-sent prices/amounts instead of recomputing server-side
- Letting a failed email/SMS roll back or block the business transaction
- Storing integration secrets in plaintext columns
- Read-then-write inventory checks (the classic oversell race)
- Secrets in client bundles / `NEXT_PUBLIC_*`

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `stack` | `stack-server-actions` / `stack-zod-boundary` are the substrate for every child here |
| `data` | `data-prisma-pgvector` owns schema; `data-schema-design` owns modeling rigor; `data-booking-availability` pairs with concurrency |
| `security` | `security-nextauth` guards admin; `security-review` audits the boundaries |
| `infra` | `infra-background-jobs` runs retries/queues; `infra-s3-uploads` backs the media library |
| `frontend` | `backend-admin-panel` composes `frontend-*` children into screens |
