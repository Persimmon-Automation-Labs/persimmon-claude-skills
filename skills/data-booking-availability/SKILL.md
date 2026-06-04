---
name: data-booking-availability
description: "Schema and availability engine for reservations and time-slot bookings on the Persimmon stack (Prisma + Postgres) — configurable slots, party-size/seat capacity, blackout dates, lead time, booking horizon, waitlist, and deposit-gated bookings. Use for restaurant table reservations, event/ticket bookings, appointments, pickup windows, or any 'pick a time, limited capacity' feature. Pairs with backend-commerce-concurrency for the atomic claim. Trigger keywords: reservation, booking, time slot, availability, capacity, waitlist, deposit, appointment, blackout, lead time."
---

# Data — Booking & Availability — Persimmon Patterns

Reservations, pickup windows, ticketed events, and appointments are all the same problem: a calendar of finite slots that customers compete for. This skill owns the **Prisma schema and the availability query**; the **atomic claim** (so two guests can't take the last table) lives in `backend-commerce-concurrency`. Use them together.

## Trigger

- "Reservation / table booking" / "book a time"
- "Pickup time slots" / "appointment scheduling"
- "Event tickets" / "limited seats"
- "Waitlist" / "real-time availability"
- "Private party / large party with a deposit"

## The model — capacity per slot, not per booking

A booking system is a set of **slots**, each with a capacity, and **bookings** that consume capacity. Capacity is measured in covers (seats), tables, or units depending on the domain. Enums in Postgres; money in integer cents; `createdAt`/`updatedAt` on every model (see `data-schema-design`).

```prisma
enum BookingResourceType { TABLE PICKUP_WINDOW EVENT APPOINTMENT }
enum SlotStatus          { OPEN BLACKOUT CLOSED }
enum BookingStatus       { HELD CONFIRMED SEATED COMPLETED CANCELLED NO_SHOW }
enum WaitlistStatus      { WAITING OFFERED CONVERTED EXPIRED }

model BookingResource {
  id              String              @id @default(cuid())
  type            BookingResourceType
  name            String
  capacity        Int                 // covers / seats / units per slot (default for new slots)
  minParty        Int                 @default(1)
  maxParty        Int                 @default(0)   // 0 = no cap
  depositRequired Boolean             @default(false)
  depositCents    Int                 @default(0)
  active          Boolean             @default(true)
  slots           BookingSlot[]
  waitlist        WaitlistEntry[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model BookingSlot {
  id          String          @id @default(cuid())
  resourceId  String
  resource    BookingResource @relation(fields: [resourceId], references: [id])
  startsAt    DateTime
  durationMin Int             @default(90)
  capacity    Int             // copied from resource; allows per-slot overrides
  booked      Int             @default(0)   // the counter claimed atomically
  status      SlotStatus      @default(OPEN)
  bookings    Booking[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  @@unique([resourceId, startsAt])          // one slot per resource per start time
  @@index([resourceId, startsAt, status])   // the availability query path
}

model Booking {
  id                   String        @id @default(cuid())
  slotId               String
  slot                 BookingSlot   @relation(fields: [slotId], references: [id])
  customerId           String?       // guest bookings allowed (contact-only)
  partySize            Int           @default(1)
  status               BookingStatus @default(HELD)
  depositPaymentIntent String?       // Stripe PI id for deposit-gated bookings
  holdExpiresAt        DateTime?     // when an unconfirmed HELD booking releases
  contactName          String
  contactEmail         String
  contactPhone         String
  notes                String?
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  @@index([slotId])
  @@index([status, holdExpiresAt])  // hold-reaper scan path
}

model WaitlistEntry {
  id           String          @id @default(cuid())
  resourceId   String
  resource     BookingResource @relation(fields: [resourceId], references: [id])
  desiredAt    DateTime
  partySize    Int
  contactName  String
  contactPhone String
  status       WaitlistStatus  @default(WAITING)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  @@index([resourceId, desiredAt, status])
}
```

## Generating slots

Generate slots ahead of time from a schedule (open hours per weekday) rather than computing on the fly — it makes availability a simple indexed query and lets staff blackout specific slots. Generate a rolling window (e.g. next 60 days) from a background job triggered by an API route + cron (Railway scheduler or QStash); regenerate when hours change. Compute slot start times with `date-fns` / `date-fns-tz` (or `Temporal`), keeping everything in UTC and converting only at the display edge. Respect:

- **Open hours per weekday** (and per resource — brunch vs dinner tables differ). Store hours in a schedule model, never hard-coded in TypeScript.
- **Blackout dates** (holidays, private buyouts) → set slot `status = BLACKOUT`.
- **Lead time** — don't offer slots starting sooner than N minutes from now.
- **Booking horizon** — don't offer slots more than N days out.

## The availability query

A slot is bookable when it's open, in the allowed time window, fits the party size, and has remaining capacity. Prisma can't compare two columns (`booked + party <= capacity`) in a typed `where`, so compute the lead-time/horizon bounds in TypeScript and either fetch open slots then filter, or use a guarded raw query for the column comparison:

```ts
// src/lib/booking/availability.ts
import { db } from "@/lib/db";
import { addMinutes } from "date-fns";

export type SlotOption = { id: string; startsAt: Date; remaining: number };

export async function findAvailableSlots(args: {
  type: "TABLE" | "PICKUP_WINDOW" | "EVENT" | "APPOINTMENT";
  party: number;
  from: Date;
  to: Date;
  leadMinutes: number;
}): Promise<SlotOption[]> {
  const earliest = addMinutes(new Date(), args.leadMinutes);
  const lowerBound = args.from > earliest ? args.from : earliest;

  // Column-vs-column comparison (capacity - booked >= party) lives in SQL.
  return db.$queryRaw<SlotOption[]>`
    SELECT s.id, s."startsAt", (s.capacity - s.booked) AS remaining
    FROM "BookingSlot" s
    JOIN "BookingResource" r ON r.id = s."resourceId"
    WHERE r.type = ${args.type}::"BookingResourceType"
      AND r.active = true
      AND s.status = 'OPEN'
      AND s."startsAt" BETWEEN ${lowerBound} AND ${args.to}
      AND ${args.party} BETWEEN r."minParty"
            AND (CASE WHEN r."maxParty" = 0 THEN ${args.party} ELSE r."maxParty" END)
      AND (s.capacity - s.booked) >= ${args.party}
    ORDER BY s."startsAt"`;
}
```

## Claiming a slot — defer to the concurrency skill

Booking a slot is an atomic capacity claim. **Do not** read `booked`, add, and write back — that races into double-booking. Use the guarded conditional `UPDATE` / `FOR UPDATE` patterns from `backend-commerce-concurrency`:

```ts
// The capacity test is INSIDE the UPDATE; affected-row count is the verdict.
const count = await tx.$executeRaw`
  UPDATE "BookingSlot"
     SET booked = booked + ${party}
   WHERE id = ${slotId}
     AND booked + ${party} <= capacity`;
const claimed = count === 1; // 0 ⇒ someone took the last seats first → offer waitlist
```

Wrap the claim and the `Booking` row creation in a single `db.$transaction` so a successful claim always has a matching booking row.

## Deposit-gated bookings

Standard tables: free, instant confirm. Large parties / private events / ticketed suppers: require a Stripe deposit to cut no-shows. Flow:

1. Place the slot **hold** in `$transaction` (`Booking.status = HELD`, set `holdExpiresAt`) at booking-start — claim capacity atomically (concurrency skill).
2. Take the deposit via `backend-stripe` (store the deposit `paymentIntent` id on the booking). Create the `Booking` row as `HELD` **before** redirecting to payment — never let the webhook create it.
3. On the `payment_intent.succeeded` webhook (idempotent — see `backend-webhook-handler`) → `CONFIRMED`; on failure/abandon/expiry → release the hold so capacity returns (decrement `booked`).

Whether a resource needs a deposit and how much is a **client decision** — log thresholds to `docs/client-context/open-questions.md` if unspecified.

## Waitlist

When a desired window is full, offer the waitlist. On a cancellation that frees capacity, the next matching `WAITING` entry becomes `OFFERED` (notify via `backend-notifications`) with a short claim window before moving to the next. Drive expiry of stale `OFFERED` entries from the same hold-reaper job.

## One-screen defaults

- Slots are pre-generated (rolling 60-day window), never computed per request.
- All slot times stored UTC (`timestamptz`); convert at display only.
- Lead time + booking horizon always enforced.
- Claim via guarded raw `UPDATE` inside `$transaction`; never read-then-write.
- Deposit bookings: `Booking` row exists as `HELD` before payment; webhook confirms.
- Hold-reaper background job releases expired `HELD` bookings and stale `OFFERED` waitlist entries.

## Acceptance criteria (for the spec)

- *Event-driven*: When a customer books a slot with remaining capacity, the system shall confirm (or hold for deposit) and decrement remaining capacity atomically in one transaction.
- *State-driven*: While a slot is at capacity, it shall not be offered; the waitlist shall be offered instead.
- *Event-driven*: When a deposit-gated booking's deposit fails, is abandoned, or its hold expires, the held capacity shall be released.

## Anti-patterns banned

- Computing availability by scanning all bookings at request time (generate slots; query the counter)
- Read-then-write on `booked` (race → double-booking) — use `backend-commerce-concurrency`
- Confirming a deposit-gated booking before the deposit clears, or letting the webhook create the booking row
- Hard-coding open hours in TypeScript instead of a schedule model
- No lead-time / horizon limits (lets guests book a table for 2 minutes from now, or next year)
- Storing slot times in local time / `Date` strings instead of UTC `timestamptz`
- String status constants instead of Postgres enums

## Relationship to other skills

| Skill | Connection |
|---|---|
| `backend-commerce-concurrency` | The atomic claim + checkout-start hold for slots |
| `backend-stripe` | Deposit `paymentIntent` for large-party/event bookings |
| `backend-webhook-handler` | Idempotent deposit-confirmation webhook |
| `backend-notifications` | Confirmations, reminders, waitlist offers |
| `data-schema-design` | The lenses these models are designed/reviewed with |
| `data-prisma-pgvector` | Prisma client, migration, and index mechanics for these models |
| `stack-zod-boundary` | Validates booking input (party size, contact, desired time) at the action boundary |
