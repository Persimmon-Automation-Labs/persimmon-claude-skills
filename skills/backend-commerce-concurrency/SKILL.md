---
name: backend-commerce-concurrency
description: "Prevents oversell and double-booking under concurrent checkout on the Persimmon stack — atomic conditional capacity claims via Prisma updateMany, Postgres SELECT ... FOR UPDATE inside $transaction (Serializable where needed), advisory locks, and short-lived holds placed at checkout-start. Use for any finite resource — limited inventory, pickup/time slots, reservation tables, event seats/tickets. Trigger keywords: oversell, double-booking, race condition, inventory, capacity, FOR UPDATE, advisory lock, hold, concurrent checkout."
---

# Backend — Commerce Concurrency — Persimmon Patterns

The bug that bites every commerce build and never shows up in single-user testing: two guests both see the last item / the last 12:30 pickup slot / the last table, both check out, both pay, both succeed — and capacity goes negative. This only bites **finite** resources: limited inventory, 86'd items, pickup-slot throughput, reservation tables, event seats. Those produce an angry customer at the counter.

The fix lives in **Postgres**, not in your TypeScript. Prisma `updateMany` + a conditional `where`, or `$transaction` with row/advisory locks.

## Core contract (the two-line rule)

1. **Claim capacity with an atomic conditional write, never read-then-write.** The check and the decrement are one statement (`updateMany` with the limit in `where`) or one locked transaction — the database, not your app, enforces the limit.
2. **Place a short-lived hold at checkout *start*, not at payment success.** The customer pays against a hold they already own; the webhook just confirms it (→ `backend-stripe`). This closes the gap where two people pay for one unit.

## Pattern 1 — atomic conditional claim (preferred)

For a counter column, put the capacity test in the `where` and trust the affected-row count. No value is ever read into JS and written back.

```ts
// src/lib/commerce/claim.ts
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Claim `qty` of a finite slot. Returns true only if capacity remained. */
export async function claimSlot(tx: Prisma.TransactionClient, slotId: string, qty = 1): Promise<boolean> {
  const res = await tx.pickupSlot.updateMany({
    where: { id: slotId, booked: { lte: /* capacity - qty */ undefined } }, // see raw form below
    data: { booked: { increment: qty } },
  });
  return res.count === 1;
}
```

Prisma can't compare two columns (`booked + qty <= capacity`) in a typed `where`, so use a guarded raw `UPDATE` — the canonical form:

```ts
export async function claimSlotRaw(tx: Prisma.TransactionClient, slotId: string, qty = 1): Promise<boolean> {
  // The capacity test is INSIDE the UPDATE; affected-row count is the verdict.
  const count = await tx.$executeRaw`
    UPDATE "PickupSlot"
       SET booked = booked + ${qty}
     WHERE id = ${slotId}
       AND booked + ${qty} <= capacity`;
  return count === 1; // 0 = someone took the last unit first → handle gracefully
}
```

Same shape for product stock: `SET stock = stock - ${qty} WHERE id = ${id} AND stock >= ${qty}`. **This is the single most important pattern** — most oversell bugs vanish by moving the test into the `WHERE`.

## Pattern 2 — SELECT ... FOR UPDATE (multi-row decisions)

When claiming requires reading related rows (summing seats across a party, checking several cart products), wrap in `$transaction` and lock the rows you read. Postgres `FOR UPDATE` via `$queryRaw`.

```ts
export async function claimWithLock(slotId: string, qty: number): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const [slot] = await tx.$queryRaw<{ booked: number; capacity: number }[]>`
      SELECT booked, capacity FROM "PickupSlot" WHERE id = ${slotId} FOR UPDATE`;
    if (!slot || slot.booked + qty > slot.capacity) return false; // no capacity → tx rolls back
    await tx.$executeRaw`UPDATE "PickupSlot" SET booked = booked + ${qty} WHERE id = ${slotId}`;
    return true;
  });
}
```

`FOR UPDATE` needs an index on the lookup column. Keep the transaction **short** — lock, decide, write, commit. **Never call Stripe or send email inside the lock.** For genuinely conflicting writes that must serialize, use `db.$transaction(fn, { isolationLevel: "Serializable" })` and retry on `40001` (serialization failure).

## Pattern 2b — advisory locks (serialize a logical resource, no row to lock)

When there's no single row to lock (e.g. cross-table booking math), take a Postgres **advisory lock** keyed by the resource id for the duration of the transaction.

```ts
await db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`slot:${slotId}`}))`;
  // ...read across tables, decide, write... lock auto-releases at commit/rollback
});
```

## Pattern 3 — holds at checkout-start (the timing fix)

Creating the claim only when the webhook lands leaves a window where a guest paid but owns nothing, and two guests pay for one unit. Instead:

1. **Checkout start** → one `$transaction`: insert the order `PENDING`, claim capacity (Pattern 1/2), write a `CapacityHold` with `expiresAt = now + 15 min`. The customer owns the unit before paying.
2. **Payment** → Stripe charges against an order that already holds its capacity.
3. **Webhook `succeeded`** → flip hold `CONFIRMED`, order `PAID`, idempotently (→ `backend-stripe`).
4. **Webhook `failed` / abandonment** → release the hold; capacity returns.

```prisma
model CapacityHold {
  id           String       @id @default(cuid())
  resourceType ResourceType
  resourceId   String
  qty          Int          @default(1)
  orderId      String?
  status       HoldStatus   @default(HELD)
  expiresAt    DateTime
  createdAt    DateTime     @default(now())
  @@index([resourceType, resourceId])
  @@index([status, expiresAt])
}
enum ResourceType { PRODUCT PICKUP_SLOT TABLE EVENT_SEAT }
enum HoldStatus { HELD CONFIRMED RELEASED EXPIRED }
```

```ts
// confirm / release helpers used by the Stripe webhook
export async function confirmHold(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.capacityHold.updateMany({ where: { orderId, status: "HELD" }, data: { status: "CONFIRMED" } });
}
export async function releaseHold(orderId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const holds = await tx.capacityHold.findMany({ where: { orderId, status: "HELD" } });
    for (const h of holds) {
      await tx.$executeRaw`UPDATE "PickupSlot" SET booked = booked - ${h.qty} WHERE id = ${h.resourceId}`;
    }
    await tx.capacityHold.updateMany({ where: { orderId, status: "HELD" }, data: { status: "RELEASED" } });
  });
}
```

## Reaping expired holds (belt-and-suspenders)

A guest who abandons leaves a `HELD` row. Reclaim two ways:

- **Lazy reap on read**: when showing availability, treat `HELD` rows past `expiresAt` as free (`AND (status <> 'HELD' OR expiresAt > now())`), or sweep them in the claiming transaction.
- **Scheduled sweep** (→ `infra-background-jobs`): every few minutes, expire stale holds and return qty to the counter.

```ts
export async function reapExpiredHolds(): Promise<void> {
  await db.$transaction(async (tx) => {
    const stale = await tx.capacityHold.findMany({ where: { status: "HELD", expiresAt: { lt: new Date() } } });
    for (const h of stale) {
      await tx.$executeRaw`UPDATE "PickupSlot" SET booked = booked - ${h.qty} WHERE id = ${h.resourceId}`;
    }
    await tx.capacityHold.updateMany({
      where: { status: "HELD", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
  });
}
```

Don't rely on the scheduler alone — the lazy path keeps availability honest between sweeps.

## One-screen defaults

| Concern | Default |
|---|---|
| Claim | guarded raw `UPDATE` with capacity test in `WHERE`; `count === 1` |
| Multi-row | `$transaction` + `FOR UPDATE` on an indexed column |
| No-row lock | `pg_advisory_xact_lock` keyed by resource id |
| Hard conflicts | `isolationLevel: "Serializable"` + retry on `40001` |
| Timing | claim + hold at checkout-START, confirm in webhook |
| Hold TTL | 15 min; lazy reap on read + scheduled sweep |
| In-lock work | none — no Stripe/email inside a transaction |

## Acceptance criteria (for the spec)

- *Event-driven*: When two checkouts claim the last unit simultaneously, exactly one succeeds; the other gets a clear "no longer available" (never negative capacity).
- *Ubiquitous*: The order is created and capacity claimed at checkout-start, not at webhook time.
- *State-driven*: While a hold is unexpired and unconfirmed, that capacity is unavailable to others.

Verify with a **concurrency test**, not a click-through: fire 2+ simultaneous claims at a capacity-1 resource (e.g. `Promise.all` of N Server Action calls in a test) and assert exactly one wins.

## Anti-patterns banned

- **Read-then-write capacity** (`findUnique` then `update`) without a lock — the classic race.
- **Claiming capacity in the webhook** instead of at checkout-start — the paid-but-no-record gap.
- **Long transactions** holding row locks across a Stripe call or email send.
- **Trusting the scheduler alone** to free abandoned holds (add the lazy path).
- **No index on the locked/claimed column** — turns `FOR UPDATE` into a near-table lock.
- Comparing two columns in a Prisma typed `where` (it can't) instead of a guarded raw `UPDATE`.

## Cross-references

- **backend-stripe** — payment state machine + idempotent webhook that confirms/releases holds
- **backend-webhook-handler** — the idempotent receiver the confirm/release runs in
- **infra-background-jobs** — runs the expired-hold reaper on a schedule
- **data-prisma-pgvector** — the `db` client, `$transaction`, isolation levels
- **security-review** — flags missing oversell handling as a required finding
