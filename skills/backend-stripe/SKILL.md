---
name: backend-stripe
description: "Complete Stripe payment flow for the Persimmon stack — order lifecycle (pending at checkout-start → webhook-confirmed), PaymentIntent creation via the `stripe` SDK in a Server Action, Stripe.js Elements checkout with @stripe/react-stripe-js, idempotent webhook confirmation, refunds, SAQ-A PCI scope, and a go-live checklist. Use when adding Stripe payments, checkout, billing, or e-commerce to a Next.js project. Trigger keywords: Stripe, PaymentIntent, checkout, Elements, refund, payment webhook, order lifecycle, SAQ-A."
---

# Stripe Payments — Persimmon Patterns

## 0. Order lifecycle & PCI scope (read first — money bugs live here)

Four rules prevent the most common production failures:

**A. Create the order `PENDING` at checkout *start*, not in the webhook.** The webhook *confirms* an order that already exists; it never creates one. Webhooks lag and retry — creating the order on `payment_intent.succeeded` leaves a window where the customer paid but the confirmation page is empty, and (if anything is finite) two people pay for the same unit. Flow: (1) checkout-start Server Action → one `db.$transaction` inserts the order `PENDING`, claims finite capacity, and places a short-lived hold (→ `backend-commerce-concurrency`); pass the order id as `metadata.orderId`. (2) customer pays. (3) `succeeded` webhook → `PAID` + confirm hold, idempotently. (4) `payment_failed`/abandonment → release the hold.

**B. The webhook is idempotent.** Stripe redelivers events. The `WebhookEvent` unique constraint (→ `backend-webhook-handler`) makes replays no-ops, AND every order update is guarded `where: { id, status: "PENDING" }` so a double-delivery never double-fulfills.

**C. PCI scope = SAQ-A. Keep card data out of your server entirely.** Use Stripe.js Elements so the PAN is captured in Stripe-hosted iframes and never touches your Next server, logs, or DB. Never receive, store, or log card numbers. Confirm payment client-side with `stripe.confirmPayment` — the secret key only creates the intent and reads status.

**D. Notifications fire post-commit, conditionally.** Send confirmations only after the `$transaction` commits, via `backend-notifications` — and never roll back a paid order because an email/SMS failed.

## 1. SDK setup & keys

```bash
npm i stripe @stripe/stripe-js @stripe/react-stripe-js
```

Secrets are **server-side only**. The publishable key may be `NEXT_PUBLIC_` (it is designed to be public); the secret key and webhook secret must NOT.

```ts
// src/lib/stripe/server.ts  — the ONLY place the secret key is read
import "server-only";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 2, // SDK-level retry for transient errors
});
```

```ts
// src/lib/stripe/client.ts — browser
import { loadStripe } from "@stripe/stripe-js";
export const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
```

## 2. Order schema (cents, never floats)

```prisma
model Order {
  id           String      @id @default(cuid())
  orderNumber  String      @unique
  status       OrderStatus @default(PENDING)
  subtotalCents Int        @default(0)
  taxCents      Int        @default(0)
  shippingCents Int        @default(0)
  totalCents    Int        @default(0)
  currency      String     @default("usd")
  stripePaymentIntentId String? @unique
  customerEmail String
  customerName  String
  items         OrderItem[]
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  @@index([status])
}

enum OrderStatus {
  PENDING
  PAID
  PAYMENT_FAILED
  SHIPPED
  DELIVERED
  REFUNDED
  CANCELLED
}

model OrderItem {
  id            String @id @default(cuid())
  orderId       String
  order         Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId     String
  productName   String
  quantity      Int    @default(1)
  unitPriceCents Int
  totalCents    Int
}
```

Store money as integer **cents**. `$50.00` = `5000`. Never a float column.

## 3. Checkout-start Server Action (creates the PENDING order + intent)

```ts
// src/lib/checkout-actions.ts
"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe/server";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

const StartCheckout = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(200),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
});

export async function startCheckout(
  input: z.input<typeof StartCheckout>,
): Promise<ActionResult<{ orderId: string; clientSecret: string }>> {
  const parsed = StartCheckout.safeParse(input);
  if (!parsed.success) return actionErr("Invalid checkout.", parsed.error.flatten().fieldErrors);

  // One transaction: price server-side, claim capacity, place holds, insert PENDING order.
  // Prices come from the DB — NEVER trust client-sent amounts.
  const order = await db.$transaction(async (tx) => {
    const totalCents = await priceAndClaim(tx, parsed.data.items); // → backend-commerce-concurrency
    return tx.order.create({
      data: {
        orderNumber: crypto.randomUUID().slice(0, 8).toUpperCase(),
        status: "PENDING",
        totalCents,
        customerEmail: parsed.data.email,
        customerName: parsed.data.name,
      },
      select: { id: true, totalCents: true },
    });
  });

  const intent = await stripe.paymentIntents.create(
    {
      amount: order.totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: order.id }, // the link the webhook reads back
    },
    { idempotencyKey: `order_${order.id}` }, // safe to retry creation
  );

  await db.order.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return actionOk({ orderId: order.id, clientSecret: intent.client_secret! });
}
```

**Amount comes from the DB, computed server-side.** A client that POSTs its own `amount` can pay `$0.01` for a `$500` order.

## 4. Checkout form (Stripe.js Elements — card data never hits your server)

```tsx
// src/app/checkout/checkout-form.tsx
"use client";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe/client";
import { useState } from "react";

export function Checkout({ clientSecret, orderId }: { clientSecret: string; orderId: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PayForm orderId={orderId} />
    </Elements>
  );
}

function PayForm({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}/confirm` },
    });
    if (error) { setError(error.message ?? "Payment failed."); setPending(false); }
    // on success Stripe redirects to return_url; the WEBHOOK marks the order PAID, not this page.
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-oxblood">{error}</p>}
      <button type="submit" disabled={!stripe || pending}>{pending ? "Processing…" : "Pay"}</button>
    </form>
  );
}
```

The confirmation page must read order status from the DB and tolerate `PENDING` (webhook may not have landed yet) — show "confirming…" and poll, never assume `PAID` from the redirect.

## 5. Webhook — confirm the order (idempotent)

Wire the receiver via `backend-webhook-handler`; the `process` switch does the state transition. Every update is guarded by `status: "PENDING"` so replays are inert.

```ts
// inside the Stripe webhook handler's process()
case "payment_intent.succeeded": {
  const pi = e.data.object as Stripe.PaymentIntent;
  const orderId = pi.metadata.orderId;
  if (!orderId) break;
  await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING" }, // guard: no double-fulfill
      data: { status: "PAID" },
    });
    if (res.count === 1) await confirmHold(tx, orderId); // → backend-commerce-concurrency
  });
  // AFTER commit, conditionally: notify("order.confirmed") → backend-notifications
  break;
}
case "payment_intent.payment_failed": {
  const pi = e.data.object as Stripe.PaymentIntent;
  const orderId = pi.metadata.orderId;
  if (orderId) {
    await db.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "PAYMENT_FAILED" } });
    await releaseHold(orderId); // capacity returns to availability
  }
  break;
}
case "charge.refunded": {
  const charge = e.data.object as Stripe.Charge;
  if (charge.payment_intent) {
    await db.order.updateMany({
      where: { stripePaymentIntentId: String(charge.payment_intent) },
      data: { status: "REFUNDED" },
    });
  }
  break;
}
```

## 6. Refunds (Server Action, owner-gated)

```ts
// src/lib/refund-actions.ts
"use server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe/server";
import { db } from "@/lib/db";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

export async function refundOrder(orderId: string, amountCents?: number): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "OWNER") return actionErr("Not authorized.");
  const order = await db.order.findUnique({ where: { id: orderId }, select: { stripePaymentIntentId: true } });
  if (!order?.stripePaymentIntentId) return actionErr("Order has no payment.");
  await stripe.refunds.create(
    { payment_intent: order.stripePaymentIntentId, ...(amountCents ? { amount: amountCents } : {}) },
    { idempotencyKey: `refund_${orderId}_${amountCents ?? "full"}` },
  );
  // Don't set REFUNDED here — let the charge.refunded webhook be the single source of truth.
  return actionOk(undefined);
}
```

## 7. Test cards & go-live checklist

Test cards: success `4242 4242 4242 4242`, decline `4000 0000 0000 0002`, 3DS `4000 0025 0000 3155`, insufficient funds `4000 0000 0000 9995` (any future expiry, any CVC).

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger payment_intent.succeeded
```

Going live:
- [ ] Swap `sk_test_`/`pk_test_` → `sk_live_`/`pk_live_` in Railway env (secret key NOT `NEXT_PUBLIC_`).
- [ ] Register the live webhook endpoint in Stripe Dashboard → set `STRIPE_WEBHOOK_SECRET` to its `whsec_`.
- [ ] Enable only needed events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
- [ ] Custom domain has valid TLS; webhook URL uses it (not `*.up.railway.app`).
- [ ] Run a real $1.00 charge end-to-end and refund it; confirm the order reaches `PAID` then `REFUNDED` via webhook only.
- [ ] Confirm no card data appears in any log.

## Anti-patterns banned

- Creating the order in the webhook instead of at checkout-start (paid-but-empty window, oversell).
- Trusting a client-sent `amount` — price server-side from the DB.
- Marking the order `PAID` from the browser redirect instead of the webhook.
- Order updates without a `status: "PENDING"` guard (double-fulfill on replay).
- Reading `STRIPE_SECRET_KEY` outside `src/lib/stripe/server.ts`, or exposing it as `NEXT_PUBLIC_`.
- Storing or logging card numbers / `client_secret` server-side beyond the single response.
- Floats for money — use integer cents.
- Setting `REFUNDED` directly instead of via the `charge.refunded` webhook (two sources of truth diverge).
- `import Stripe` in a Client Component or without `import "server-only"`.

## Cross-references

- **backend-webhook-handler** — the receiver shape, raw body, idempotency, retry semantics
- **backend-commerce-concurrency** — capacity claims + holds the lifecycle depends on
- **backend-notifications** — `order.confirmed` post-commit, conditional
- **security-nextauth** — owner-role gate on refunds
- **stack-server-actions** / **stack-zod-boundary** — action shape + input validation
- **security-review** — payment-flow review gate
