---
name: data-schema-design
description: "Design and review Prisma/Postgres schemas with rigor — independent of domain. Snapshot mutable values onto historical records, complete lifecycle/state enums (Postgres enums, not string constants), join tables for hidden many-to-many, FK/cardinality integrity, money-as-integer-cents, createdAt/updatedAt on every model, and a per-field rationale. Includes the validation 'lenses' to review an existing data model in a spec for missing/extra models and fields, plus gap-bucket classification. Use when designing a Prisma schema or reviewing one. Trigger keywords: schema design, data model, Prisma model, review schema, missing table, enum, snapshot price, join table, cardinality."
---

# Data — Schema Design & Review — Persimmon Patterns

A data model is **a theory about the business written in tables.** You design it well by applying a few domain-independent rules, and you review it by checking it can reproduce everything the requirements already describe — not by being a domain expert. This skill owns schema *design rigor* and *review method*; `data-prisma-pgvector` owns the Prisma/Postgres mechanics (client singleton, migrations, pgvector, HNSW).

## Trigger

- "Design the schema / data model for…"
- "Review this data model / is anything missing or extra?"
- A spec with a data-model section to validate
- Any new Prisma models, or a migration that changes meaning

## Design rules (apply to every schema)

1. **Snapshot mutable values onto historical records.** Anything that records *what happened* (an order line, invoice, receipt, booking) must **freeze** the values that can change later — price, tax rate/treatment, product name, address — at the moment of the event. The classic bug: `OrderItem` stores only `productId`, so when the price changes next week every past order silently re-totals and reconciliation against Stripe breaks. Store `unitPriceCents`, `taxCents`, `taxTreatment`, and modifier deltas **on the line**. Rule: **a historical row must never read a live, mutable value.** (See `backend-stripe`.)

   ```prisma
   model OrderItem {
     id              String      @id @default(cuid())
     orderId         String
     order           Order       @relation(fields: [orderId], references: [id])
     productId       String      // reference to the live product…
     product         Product     @relation(fields: [productId], references: [id])
     // …but SNAPSHOT the mutable values at order time:
     nameSnapshot    String      // product name when ordered
     unitPriceCents  Int         // price when ordered — never re-read from Product
     taxCents        Int
     taxTreatment    TaxTreatment
     quantity        Int
     createdAt       DateTime    @default(now())
     updatedAt       DateTime    @updatedAt
     @@index([orderId])
   }
   ```

2. **Enumerate the COMPLETE lifecycle, not the happy path — as a Postgres enum.** For every entity, list *every* state it can reach (terminal, partial, unwanted) before fixing the enum. A missing state = a thing the business does that the system can't represent. Persimmon standard: **enums in Postgres, never string constants.**

   ```prisma
   enum OrderStatus {
     PENDING
     PAID
     FULFILLED
     CANCELLED
     REFUNDED
     PARTIALLY_REFUNDED
     COMPED
     VOIDED
     EXPIRED
   }
   // Reservations: BOOKED / SEATED / COMPLETED / CANCELLED / NO_SHOW
   ```

3. **Interrogate every relationship's cardinality.** For each foreign key ask "is this really one-to-many, or secretly many-to-many?" A hidden many-to-many (a product in many categories; an order with many tax lines; a customer across many channels) needs an **explicit join model**. A missing join model is the most common structural gap. Prefer an explicit join model over an implicit `@relation` m-n table whenever the link itself carries data (assignedAt, role, sortOrder).

   ```prisma
   model ProductCategory {
     productId  String
     categoryId String
     product    Product  @relation(fields: [productId], references: [id])
     category   Category @relation(fields: [categoryId], references: [id])
     sortOrder  Int      @default(0)
     createdAt  DateTime @default(now())
     @@id([productId, categoryId])
     @@index([categoryId])
   }
   ```

4. **Reference, don't duplicate.** Point at a row by id (media, customer, product) instead of copying its data. Change once, propagate everywhere. The exceptions are the deliberate snapshots in rule 1.

5. **Persimmon stack invariants** (consistent with `data-prisma-pgvector`):
   - PK: `String @id @default(cuid())` (or `uuid()`); models `PascalCase`, singular.
   - **Money in integer cents** (`Int` / `BigInt`) — never `Float`/`Decimal` for currency math.
   - `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` on **every** model.
   - Timestamps are `DateTime` (Postgres `timestamptz`, UTC) — never store naive local time.
   - Enums in Postgres via Prisma `enum`. Declare FKs via `@relation`. Add `@@index`/`@@unique` for every lookup path and every uniqueness rule.

6. **Every non-obvious model/field carries a rationale** — trace it to its driver (a SOW item, an EARS criterion, a domain reality, a client fact, or an engineering principle). A field no requirement needs is as much a defect as a missing one. Every decision is derived, never improvised.

## Review method — the validation lenses

To review an existing model (e.g. a spec's data-model section), don't read it top-to-bottom and nod. Run these lenses; each surfaces a concrete, defensible finding:

1. **Replay every screen.** For each screen in the spec, ask "can a Prisma query `select` everything it displays, and a Server Action `create`/`update` everything it writes?" A field shown with no column behind it → missing field/model.
2. **Trace every entity's lifecycle** (rule 2). A state the enum can't represent → missing enum member.
3. **Snapshot check** (rule 1). Any historical row pointing at a mutable value → bug.
4. **Cardinality check** (rule 3). Any FK that's secretly many-to-many → missing join model.
5. **Reconcile against the real business.** Enumerate the client's actual observable operations (from onboarding/research) and find where each lives in the schema. A real operation with no home → gap.
6. **Write the owner's reports as queries in your head.** If a promised report ("revenue across all channels", "tax by category") can't be expressed as a Prisma `groupBy`/aggregate or raw SQL over the models, a field is missing.

Run both directions of traceability (the RTM in `workflow-spec-review`): **forward** — every requirement has a model/field (catches *missing*); **backward** — every model/field has a requirement (catches *extra*).

## Classify every gap you find (this is the real output)

Tag each finding so it goes to the right owner — this is the highest-value product of a model review:

| Bucket | Who resolves | Where it goes |
|---|---|---|
| **Engineering** (snapshot, enum, join model, FK, index) | you, now | fix in the schema |
| **Domain-general** (no-shows, comps, tips, time-gated pricing) | you + `/deep-research` | fix in the schema |
| **Client-specific** (their tax categories, membership cadence, suite number) | only the client | the Client Questions log (`docs/client-context/open-questions.md`) |

The client-specific list is the deliverable that prevents a week-6 stall — surface it early.

## Acceptance criteria (for a schema in a spec)

- *Ubiquitous*: Every historical record snapshots the mutable values (price, tax, name) it depends on.
- *Ubiquitous*: Every entity's status is a Postgres enum covering all reachable states (refunded/partial/comped/no-show/expired as applicable).
- *Ubiquitous*: Every screen and EARS criterion maps to a model/field (forward traceability); every model/field maps to a requirement (backward).
- *Ubiquitous*: Money is integer cents; timestamps are `timestamptz`; FKs declared; `createdAt`/`updatedAt` on every model; every lookup path indexed.

## Anti-patterns banned

- Historical rows reading live/mutable values (un-snapshotted price/tax) — breaks reconciliation retroactively
- Status enums that cover only the happy path
- String constants where a Postgres enum belongs (violates the Persimmon enum standard)
- A `categoryId` scalar where a join model is needed (hidden many-to-many)
- `Float`/`Decimal` for money math; naive local-time timestamps
- Models missing `createdAt`/`updatedAt`
- Fields with no requirement behind them (orphans) — delete or justify
- Reviewing a model by reading it, instead of replaying screens/flows against it
- Treating a client-specific unknown as an engineering default instead of logging it as a question

## Relationship to other skills

| Skill | Connection |
|---|---|
| `data-prisma-pgvector` | Prisma/Postgres mechanics — client singleton, migrations, pgvector, HNSW |
| `stack-zod-boundary` | Zod schemas that validate writes into these models at every boundary |
| `quality-review-data-layer` | The review lens applied as a QA gate on the data layer |
| `backend-stripe` | Order/line snapshot of price & tax; reconciliation depends on it |
| `backend-commerce-concurrency` | Capacity/holds models this skill helps shape |
| `data-booking-availability` | Slot/capacity schema reviewed with these lenses |
| `workflow-spec-review` | The RTM/traceability pass that drives this review; bucket classification |
| `workflow-brainstorm` / `workflow-plan` | The spec's screens/EARS are the requirements you trace against |
