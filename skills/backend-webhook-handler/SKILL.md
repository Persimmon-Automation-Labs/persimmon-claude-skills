---
name: backend-webhook-handler
description: "Standardized webhook receiver for the Persimmon stack — a Next.js Route Handler that reads the raw body, verifies the provider signature, enforces idempotency via a Prisma unique constraint, logs every event, and signals retry vs. permanent-failure with the right HTTP status. Use when receiving callbacks from Stripe, Twilio, shipping/inventory providers, or any external service. Covers raw-body access, signature verify, the WebhookEvent table, replay no-ops, and failure alerting. Trigger keywords: webhook, callback, signature verification, idempotency, Stripe events, raw body, route handler POST."
---

# Webhook Handler — Persimmon Patterns

## Core Contract

Every webhook endpoint is a **Route Handler** (`app/api/webhooks/<source>/route.ts`), never a Server Action (actions can't read raw bytes or custom headers reliably). Each MUST:

1. Read the **raw request body** as text — `await req.text()` — BEFORE any JSON parse. Signature verification hashes the exact bytes; `req.json()` destroys them.
2. Verify the provider signature against the raw body. Reject with `400` on failure. Never trust an unverified payload.
3. Enforce **idempotency**: record each provider `event.id` in a `WebhookEvent` row with a unique constraint. A replay is a no-op that returns `200`.
4. Persist the event (source, type, id, status) before processing. Every webhook leaves a row.
5. Distinguish **retryable** (return `5xx` → provider retries) from **permanent** (return `200` → stop retries) failures.
6. Validate the decoded payload with Zod before acting on it (→ `stack-zod-boundary`).
7. Never log secrets, PII, or full payloads. Log source, type, event id, error code only.

```
raw body → verify signature → upsert WebhookEvent (idempotency) → if replay: 200
        → Zod-parse → process → mark processed/failed → 200 | 5xx
   ↓ bad sig                                              ↓ retryable error
  400                                                    500 (provider retries)
```

## The route MUST opt out of body parsing & caching

```ts
// app/api/webhooks/stripe/route.ts
export const runtime = "nodejs";        // crypto + raw body need Node, not Edge
export const dynamic = "force-dynamic"; // never cache or prerender a webhook
```

## Idempotency table (Prisma)

```prisma
// prisma/schema.prisma
model WebhookEvent {
  id          String              @id @default(cuid())
  source      String              // "stripe" | "twilio" | "shipping"
  eventId     String              // provider's event id (evt_...)
  type        String
  status      WebhookEventStatus  @default(RECEIVED)
  error       String?
  receivedAt  DateTime            @default(now())
  processedAt DateTime?

  @@unique([source, eventId])     // the idempotency guarantee
  @@index([status])
}

enum WebhookEventStatus {
  RECEIVED
  PROCESSING
  PROCESSED
  FAILED
  SKIPPED
}
```

The `@@unique([source, eventId])` is the whole game: a duplicate delivery violates it, `create` throws `P2002`, and you treat that as "already seen → 200".

## Reusable handler core

```ts
// src/lib/webhooks/handle-webhook.ts
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type WebhookOutcome = { status: number; body: unknown };

type Spec<E> = {
  source: string;
  verify: (rawBody: string, headers: Headers) => E;        // throws on bad signature
  eventId: (e: E) => string;
  eventType: (e: E) => string;
  process: (type: string, e: E) => Promise<void>;          // throws on failure
  isRetryable?: (err: unknown) => boolean;
};

export async function handleWebhook<E>(
  req: Request,
  spec: Spec<E>,
): Promise<WebhookOutcome> {
  const rawBody = await req.text(); // RAW — must come first

  let event: E;
  try {
    event = spec.verify(rawBody, req.headers);
  } catch (err) {
    console.error(`[webhook:${spec.source}] bad signature`, {
      code: (err as { code?: string }).code,
    });
    return { status: 400, body: { error: "invalid signature" } };
  }

  const eventId = spec.eventId(event);
  const type = spec.eventType(event);

  // Idempotency: the unique constraint is the lock.
  try {
    await db.webhookEvent.create({
      data: { source: spec.source, eventId, type, status: "PROCESSING" },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: 200, body: { received: true, replay: true } }; // already handled
    }
    throw err;
  }

  try {
    await spec.process(type, event);
    await db.webhookEvent.update({
      where: { source_eventId: { source: spec.source, eventId } },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return { status: 200, body: { received: true } };
  } catch (err) {
    await db.webhookEvent.update({
      where: { source_eventId: { source: spec.source, eventId } },
      data: { status: "FAILED", error: (err as Error).message?.slice(0, 500) },
    });
    console.error(`[webhook:${spec.source}] processing failed`, { type, eventId });
    alertOnFailure(spec.source, type, eventId);

    if (spec.isRetryable?.(err)) {
      return { status: 500, body: { error: "temporary error" } }; // provider retries
    }
    return { status: 200, body: { received: true, handled: false } }; // permanent → stop retries
  }
}

function alertOnFailure(source: string, type: string, eventId: string): void {
  // Route to an always-on channel (→ backend-notifications). Never include payload/PII.
  console.error(`[webhook ALERT] ${source}:${type} ${eventId} failed`);
}
```

**Retry semantics matter.** A `5xx` tells the provider to redeliver. Return it only for transient causes (DB unreachable, downstream timeout) where a retry would succeed. For a malformed-but-verified event or a business rejection, return `200` — otherwise the provider hammers you forever. When `process` is heavy, push the work to a queued job and return `200` fast (→ `infra-background-jobs`).

## Stripe route (signature verify with the SDK)

Use the `stripe` SDK's `constructEvent` — it does the HMAC + timestamp-tolerance check for you. Full payment flow lives in `backend-stripe`; this is just the receiver shape.

```ts
// app/api/webhooks/stripe/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { handleWebhook } from "@/lib/webhooks/handle-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { status, body } = await handleWebhook<Stripe.Event>(req, {
    source: "stripe",
    verify: (raw, headers) => {
      const sig = headers.get("stripe-signature");
      if (!sig) throw new Error("missing stripe-signature");
      // constructEvent verifies HMAC + 5-min timestamp tolerance, throws on mismatch.
      return stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    },
    eventId: (e) => e.id,
    eventType: (e) => e.type,
    isRetryable: (err) => err instanceof Prisma.PrismaClientInitializationError,
    process: async (type, e) => {
      switch (type) {
        case "payment_intent.succeeded":
          // confirm the PENDING order created at checkout-start (→ backend-stripe)
          break;
        case "payment_intent.payment_failed":
          // release the capacity hold (→ backend-commerce-concurrency)
          break;
        case "charge.refunded":
          break;
        default:
          break; // recorded, not acted on
      }
    },
  });
  return NextResponse.json(body, { status });
}
```

## Generic provider (manual HMAC)

Providers without an SDK ship a hex/base64 HMAC of the raw body. Verify with Node `crypto`, constant-time.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyHmac(raw: string, header: string | null, secret: string): void {
  if (!header) throw new Error("missing signature header");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("signature mismatch");
}
```

Same `handleWebhook` spec: `verify` calls `verifyHmac` then `JSON.parse(raw)`; `eventId`/`eventType` pull from the parsed object; Zod-validate inside `process`.

## One-screen defaults

| Concern | Default |
|---|---|
| Endpoint type | Route Handler at `app/api/webhooks/<source>/route.ts` |
| Runtime | `runtime = "nodejs"`, `dynamic = "force-dynamic"` |
| Body | `await req.text()` first; never `req.json()` before verify |
| Signature | SDK helper (Stripe) or `crypto.timingSafeEqual` HMAC |
| Idempotency | `@@unique([source, eventId])` + `P2002` → 200 replay |
| Retry | transient → `5xx`; permanent → `200` |
| Heavy work | enqueue, return 200 fast (→ infra-background-jobs) |

## Testing

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET (.env.local)
```

## Anti-patterns banned

- Calling `req.json()` before verifying the signature — corrupts the bytes the HMAC covers.
- Implementing a webhook as a Server Action (no raw-body / header access; CSRF model assumes a form).
- Trusting the payload before signature verification, or skipping the timestamp tolerance (replay-attack window).
- Idempotency by `findFirst`-then-`create` (TOCTOU race) instead of a unique constraint + `P2002`.
- Returning `5xx` on a permanent failure — the provider retries forever; return `200`.
- Returning `200` on a transient DB outage — the event is lost; return `5xx` so it redelivers.
- Logging the full payload, card data, phone numbers, or secrets.
- Running on the Edge runtime (Node `crypto` + Prisma need `runtime = "nodejs"`).

## Cross-references

- **backend-stripe** — full payment state machine; this is the receiver it plugs into
- **backend-notifications** — alert channel for failed webhooks; fired post-commit
- **backend-commerce-concurrency** — holds the webhook confirms/releases
- **infra-background-jobs** — enqueue heavy processing, return 200 fast
- **stack-zod-boundary** — validate the decoded payload shape
- **security-review** — signature/raw-body discipline as a review gate
