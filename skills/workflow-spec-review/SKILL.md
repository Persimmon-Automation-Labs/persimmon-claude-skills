---
name: workflow-spec-review
description: "Adversarial red-team of an approved-draft spec, between workflow-brainstorm and workflow-plan, on the Persimmon stack. Hunts the failure modes that pass a happy-path read but blow up in production — concurrency/oversell under Server Actions, money-state timing across Stripe webhooks, unverifiable acceptance criteria, Railway/NextAuth cutover landmines, and jurisdiction-specific tax/legal rules. Builds a requirements-traceability matrix (forward + backward) and a short client-question list. Use after workflow-brainstorm writes a spec, before workflow-plan. Trigger keywords: spec review, red-team the spec, is this spec ready, RTM, traceability, oversell, money timing, cutover."
---

# Workflow — Spec Review (adversarial) — Persimmon Patterns

Step 2 of the Persimmon workflow: `workflow-brainstorm` → **workflow-spec-review** → `workflow-plan`. A spec can read perfectly and still contain production-grade landmines. This skill is the repeatable version of a senior engineer red-teaming the draft: it runs a checklist of the failure modes that *don't* surface in a happy-path read, so they're caught before the client approves and before code is planned — not by an angry customer at the counter.

It exists because these issues recur across builds. Catching them once is luck; catching them every time is a skill.

## Trigger

- After `workflow-brainstorm` produces a spec, **before** `workflow-plan`
- "Review this spec" / "Is this spec ready?"
- Any spec touching payments, inventory, bookings, multi-channel notifications, tax, auth, or a migration off an incumbent system

## How to run it

1. Read the spec end to end once for intent.
2. Run **Pass 1 (completeness/RTM)** then **Pass 2 (adversarial checklist)** below. For every hit, write a finding: *what's wrong, why it bites in production, and the concrete fix* — tagged with its bucket (engineering / domain-general / client-specific).
3. Apply fixes that are unambiguous directly to the spec (new acceptance criteria, new Risk-register rows). For anything the client must decide, log it to `docs/client-context/open-questions.md`.
4. Re-run the brainstorm self-review (placeholder/consistency/scope/ambiguity).
5. Only then hand off to `workflow-plan`.

Findings are not optional polish — a spec with an open concurrency or money-timing hole is **not ready** regardless of how complete it looks.

## Pass 1 — completeness (traceability / RTM): nothing missing, nothing extra

Build a lightweight **Requirements Traceability Matrix** — left column = every requirement (each SOW item, each screen, each EARS criterion); right column = the spec elements (Prisma models, fields, components, Server Actions, flows) that satisfy it. Then check **both directions**:

- **Forward** — every requirement has a home. A SOW item / screen field / EARS line with nothing satisfying it → **missing** model/field/section. Does every SOW bullet map to a spec section? Anything in the spec *beyond* the SOW (added scope) → flag and client-confirm.
- **Backward** — every spec element earns its place. A model, field, or feature that no requirement needs → **extra** (cut it or justify it). An orphan is as much a finding as a gap.

For the **data model specifically**, run the validation lenses in `data-schema-design` (replay every screen as Prisma queries, trace every entity lifecycle as enum members, snapshot check, cardinality/join-model check, reconcile vs the real business, write the reports as queries). The blanks in the matrix are the findings.

**Classify every decision with the discriminator** — *would two competent teams, building independently, reach the same answer?*

| Answer | Owner | Resolve | Goes to |
|---|---|---|---|
| Yes, by correctness | **Engineering** (snapshot, enum, join model, FK, idempotency) | you, now | fix the spec |
| Yes, if both knew the domain | **Industry** (no-shows, comps, tips, time-gating) | you + `/deep-research` | fix the spec |
| No — they'd diverge | **Client** | depends on cost-to-undo ↓ | ↓ |

For **client-owned** decisions, apply the second axis — *is a wrong guess cheap and reversible?*

- **Cheap/reversible** (taste, defaults, copy) → **decide provisionally, log as "assumed — pending client reaction." Don't add it to the question list.**
- **Costly/irreversible** (money, law, live customer data, schema, auth) → **ask before building** → Client Questions log, tagged **Fact** (blocks building) or **Policy** (blocks acceptance). Legal/regulatory → always ask.

**The decision log (sibling to the RTM).** The RTM proves *coverage*; the decision log proves *justification*. One row per non-obvious decision: `Decision | Owner (SOW §ref / ENG / IND / Client-Q#) | reversible|costly + fact|policy (if client) | Status | Rationale`. Two checks: a row with **no assignable owner** = a decision made for no reason → cut or justify (the backward pass); a row owned by an **open, costly Client-Q** = a blocker.

The **headline deliverable** is the resulting **short, high-value client-question list** — only the costly/irreversible items, each tagged Fact/Policy — surfaced now to prevent a week-6 stall, kept short so the client actually answers it.

## Pass 2 — adversarial (each row is a real failure mode)

### Concurrency & finite resources
- [ ] Does anything finite (stock, pickup/time slots, tables, tickets) get claimed under concurrent checkout? Is there an **atomic conditional claim + hold at checkout-start** (Prisma guarded `updateMany`/raw `UPDATE`, or `$transaction` + `FOR UPDATE`/advisory lock), or can two users oversell the last unit? → `backend-commerce-concurrency`, `data-booking-availability`. Add an explicit acceptance criterion + Risk row.
- [ ] Is capacity claimed at *checkout-start* or only at *webhook/payment success*? Webhook-time claiming leaves the paid-but-no-record gap. Webhooks lag.
- [ ] Server Actions run concurrently per user/tab — is any read-then-write (counter, balance, slot) actually atomic in Postgres, or only "atomic" in TypeScript?

### Money-state timing & integrity
- [ ] **When is the order/booking row created?** It must exist as `PENDING`/`HELD` at checkout-initiation (so the success page has something to show and a hold can be placed), with the webhook *confirming* — not the webhook *creating* it.
- [ ] Is the Stripe webhook **idempotent**? Webhooks fire more than once; is there an event-id table / unique constraint so a double-delivery doesn't double-charge/double-fulfill? → `backend-webhook-handler`.
- [ ] Is money computed in **integer cents** (never `Float`/`Decimal` math), and is tax/refund/adjustment handled? Are mutable values **snapshotted** onto historical rows? → `data-schema-design`.

### Acceptance criteria that can't pass
- [ ] Does any acceptance criterion depend on a capability that **won't be live at launch** (e.g. SMS before A2P 10DLC clears, a custom domain before DNS/SSL propagates)? Reword as **conditional** ("…when the SMS channel is enabled") so verification can pass at launch and again later.
- [ ] Is every criterion **verifiable as a user workflow**, not a unit-test name or a vague aspiration?

### Cutover & migration landmines
- [ ] Are there **money-touching balances on the incumbent system** (gift cards, store credit, deposits, subscriptions)? These are **cutover blockers**, not "open items" — promote to the Risk register with an explicit honor / parallel-run / hard-cut decision.
- [ ] Will any existing customer-facing URL/channel disappear at cutover without a redirect or comms?
- [ ] **Railway/Next 16 build-time traps in the cutover plan**: does any DB/`auth()`-reading page lack `export const dynamic = "force-dynamic"` (build prerenders → Railway build fails)? Is `prisma migrate deploy` vs `db push` chosen and consistent? Is the container `targetPort` aligned with `PORT` (8080)? → CLAUDE.md gotchas.
- [ ] **NextAuth v5 behind Railway's proxy**: is `trustHost: true` set, and do middleware redirects read `x-forwarded-host`? A miss bounces users to `*.up.railway.app` and breaks auth at cutover. → `security-nextauth`.

### Jurisdiction, legal & compliance
- [ ] Is **tax** modeled per category (prepared food vs retail vs gift card), with the right local rules, or a single global rate? Gift cards taxed at purchase = wrong. For Brazilian-jurisdiction clients, confirm the correct regime (ISS vs ICMS, NF-e obligations) before assuming a flat rate.
- [ ] Any regulated flow modeled compliantly? (e.g. Google's **review-gating prohibition** — you may not route only happy guests to public reviews.)
- [ ] Payment data: does the design keep card data **out of scope** (Stripe-hosted fields / Elements, SAQ-A), never touching PANs? → `backend-stripe` / `security`.
- [ ] **Regulated products** — does any feature ship/sell something governed by law (alcohol, tobacco, supplements, firearms)? This can make a feature *illegal*, not just wrong. Flag as a costly/legal Client+legal question; never assume.
- [ ] **Marketing consent / privacy** — does a `marketingOptIn` imply email/SMS marketing? Then consent/unsubscribe + privacy-policy obligations apply (LGPD for BR clients, CAN-SPAM/GDPR as applicable). Policy + legal.
- [ ] **PII handling** — does the spec log document contents, names, or secrets anywhere? Persimmon rule: redact PII before logging; keys server-side only, never `NEXT_PUBLIC_*`. → `security`.
- [ ] Anything that could be **illegal rather than merely wrong** is a blocker, not an "open item."

### Self-service (client autonomy)
- [ ] Does every integration the spec adds expose its **credentials/config in the admin** (editable by the client), or are keys dev-only in env? → `backend-settings-admin`.
- [ ] Is the content the client will change post-launch (team, images, hours, copy) **admin-editable**, or hard-coded in markup/JSX? → `backend-content-management`.

### Scope, dependencies & operability
- [ ] Does any feature add **operational burden** the client must staff (in-house delivery, manual moderation)? Flag as a deliberate client decision, not a default.
- [ ] Are external dependencies with **lead time** (carrier registration, domain/SSL, third-party API approval, merchant onboarding) called out as human-blocked with the clock started?
- [ ] Is the spec scoped to a single coherent implementation, or should it split into phases?

### Process integrity (was this applied, or improvised?)
- [ ] Does **every design/IA/architecture decision trace to a skill that was read or research that was run** — not improvisation? Spot-check the nav/IA, the visual decisions, and any "best practice" claim.
- [ ] Were the aspects needing **deep-research** flagged and actually researched (industry IA, pricing, regulatory, unfamiliar APIs), with findings cited?

### Data & failure handling
- [ ] What happens on the **unhappy paths** — payment failure, abandonment, partial cart, expired hold, declined card, webhook never arrives? Are they specified?
- [ ] Are empty/error/loading **states** specified for each screen (ties to the `## Screens` section)?
- [ ] Does every Server Action input cross a **Zod boundary**, and does every action return the typed `ActionResult` union rather than throwing? → `stack-zod-boundary`, `stack-server-actions`.

## Output

A short findings list appended to the spec (or as review comments), each with severity:

- **Blocker** — wrong money, oversell, compliance miss, unverifiable launch criteria, build-breaking Railway/Next config. Fix or log before plan.
- **Risk** — real but mitigable; ensure it's in the Risk register.
- **Nit** — clarity/consistency; fix inline.

Then either fixes-applied + handoff to `workflow-plan`, or a clear "blocked pending client answers (Q-NNN…)".

## Anti-patterns banned

- Treating a clean happy-path read as "spec approved"
- Leaving money/legal/ops questions as quiet "open items" instead of Risk rows + Client Questions
- Writing acceptance criteria that are guaranteed to fail at verification time
- Skipping straight from brainstorm to plan on a commerce/payments/auth spec
- Approving a spec whose pages read the DB/`auth()` without `force-dynamic` (Railway build will fail)

## Related

- `workflow-brainstorm` — produces the spec reviewed here (step 1)
- `workflow-plan` — runs only after findings are resolved/logged (step 3)
- `data-schema-design` — the data-model lenses + bucket classification used in Pass 1
- `backend-commerce-concurrency`, `data-booking-availability`, `backend-stripe`, `backend-webhook-handler`, `backend-notifications`, `backend-settings-admin`, `backend-content-management` — domain skills that fix findings
- `stack-server-actions`, `stack-zod-boundary`, `security-nextauth`, `security` — boundary, auth, and config checks referenced above
