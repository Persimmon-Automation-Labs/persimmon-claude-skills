---
name: backend-notifications
description: "Unified transactional notification layer for the Persimmon stack — one notify() abstraction over email (Resend) and SMS (Twilio) with graceful degradation when a channel isn't live yet. Use for order confirmations, pickup-ready alerts, reservation reminders, low-score alerts, and any 'email + SMS' requirement. Handles the Twilio A2P 10DLC lead-time trap and post-commit, never-fail-the-action discipline. Trigger keywords: notification, send email, send SMS, Resend, Twilio, confirmation, reminder, alert, A2P 10DLC."
---

# Backend — Notifications (email + SMS) — Persimmon Patterns

The trap this skill prevents: a spec says "send email + SMS confirmation," the build hard-codes both, and at launch SMS isn't live because **Twilio A2P 10DLC sender registration takes days-to-weeks** to approve. An acceptance criterion can't pass and the launch is "blocked" on a carrier queue. The fix is an abstraction that treats channels as independently-enableable, so email ships day one and SMS lights up when registration clears — no code change.

## Core contract

Code calls **one** `notify()` with a message key, recipient, and desired channels. The notifier sends on each channel that is *enabled and configured*, and silently skips (logging) the rest. Features NEVER call Resend or Twilio directly. Every send:

1. Fires **post-commit** — after the DB `$transaction` succeeds, never inside it or inside a capacity lock.
2. **Never rolls back** the user action if a channel fails. The order succeeded even if the SMS didn't.
3. Returns a per-channel outcome map for logging/staff visibility.
4. Validates phone numbers to **E.164** before calling Twilio (→ `stack-zod-boundary`).

## The notifier

```ts
// src/lib/notify/notifier.ts
import "server-only";
import { sendEmail } from "./email";   // Resend wrapper
import { sendSms } from "./sms";       // Twilio wrapper
import { resolveChannelConfig } from "./config"; // DB settings, env fallback → backend-settings-admin

export type Channel = "email" | "sms";
export type Recipient = { email?: string; phoneE164?: string };
export type NotifyOutcome = Record<Channel, "sent" | `skipped:${string}` | `failed:${string}`>;

export async function notify(
  messageKey: string,
  to: Recipient,
  channels: Channel[],
): Promise<Partial<NotifyOutcome>> {
  const cfg = await resolveChannelConfig();
  const out: Partial<NotifyOutcome> = {};

  for (const ch of channels) {
    if (!cfg[ch]?.enabled) { out[ch] = "skipped:channel-disabled"; continue; }
    try {
      if (ch === "email") {
        if (!to.email) { out[ch] = "skipped:no-address"; continue; }
        await sendEmail(messageKey, to.email);
      } else {
        if (!to.phoneE164) { out[ch] = "skipped:no-number"; continue; }
        await sendSms(messageKey, to.phoneE164);
      }
      out[ch] = "sent";
    } catch (err) {
      // Log only the channel + error class — never recipient PII or body.
      console.error(`[notify] ${ch} failed for ${messageKey}`, { name: (err as Error).name });
      out[ch] = `failed:${(err as Error).name}`;
    }
  }
  return out;
}
```

Channel enablement and the Resend/Twilio credentials are **admin-editable settings** (→ `backend-settings-admin`) — the client flips SMS on and pastes their Twilio token; env is the fallback. Flipping it on is a config change, not a deploy.

## Email channel — Resend

```ts
// src/lib/notify/email.ts
import "server-only";
import { Resend } from "resend";
import { renderMessage } from "./catalog";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendEmail(messageKey: string, to: string): Promise<void> {
  const { subject, html, from } = renderMessage(messageKey);
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(`resend:${error.name}`); // surfaces as failed:Error in outcome
}
```

## SMS channel — Twilio (official node SDK)

```ts
// src/lib/notify/sms.ts
import "server-only";
import twilio from "twilio";
import { renderMessage } from "./catalog";

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

export async function sendSms(messageKey: string, toE164: string): Promise<void> {
  const { smsText } = renderMessage(messageKey); // keep < 160 chars to avoid multi-segment cost
  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER!,
    to: toE164, // MUST be validated E.164 before this call
    body: smsText,
  });
}
```

## Graceful degradation — never fail the user action

A failed or skipped notification must not roll back the order/reservation it confirms. Send notifications *after* the transaction commits, log channel outcomes, and surface failures to **staff** (via the always-on email channel or the admin dashboard), not to the customer.

```ts
// in a Stripe webhook / Server Action, AFTER db.$transaction() resolves:
const outcome = await notify("order.confirmed", { email, phoneE164 }, ["email", "sms"]);
// fire-and-forget logging; do NOT await-throw into the payment path
if (Object.values(outcome).some((o) => o?.startsWith("failed"))) {
  console.warn("[notify] partial delivery", { messageKey: "order.confirmed", outcome });
}
```

## The A2P 10DLC trap (US SMS)

US application-to-person SMS requires brand + campaign registration (A2P 10DLC) before carriers deliver reliably. This has real lead time and is **outside your control**.

- Treat 10DLC registration as a **human-blocked, lead-time item** — start it at project kickoff, log it in the project's open-questions, and put it in the spec's risk register (high likelihood of launch delay).
- Build SMS behind this abstraction so email carries launch and SMS activates on approval.
- Write acceptance criteria **conditionally**: *"When the SMS channel is enabled, a pickup-ready SMS shall be sent."* — so verification passes at launch with email-only, and again later with SMS on.

## Message catalog

Define each notification once (key → subject, email HTML, SMS text, default channels) so triggers reference a key, not inline copy.

| Key | Trigger | Default channels |
|---|---|---|
| `order.confirmed` | Payment succeeded (Stripe webhook, post-commit) | email (+ sms when enabled) |
| `order.pickup_ready` | Staff marks ready | sms (+ email fallback) |
| `reservation.confirmed` | Booking made | email (+ sms when enabled) |
| `reservation.reminder` | T-2h before slot | sms (+ email) |
| `feedback.low_score_alert` | Low rating | email/SMS to staff |

## One-screen defaults

| Concern | Default |
|---|---|
| Entry point | `notify(key, to, channels)` — never call Resend/Twilio directly |
| Email transport | Resend, `src/lib/notify/email.ts` |
| SMS transport | Twilio node SDK, `src/lib/notify/sms.ts` |
| Timing | post-commit only; outside any `$transaction`/lock |
| Failure | log + surface to staff; never roll back the action |
| Credentials | DB settings (admin-editable) → env fallback |
| Phone format | E.164, validated before send |

## Anti-patterns banned

- Features importing `resend`/`twilio` directly instead of calling `notify()`.
- Hard "email + SMS" acceptance criteria that can't pass before 10DLC clears (make them conditional).
- Rolling back a committed order because a notification failed.
- Sending notifications inside a `db.$transaction` or a capacity lock.
- Storing Twilio/Resend secrets in `NEXT_PUBLIC_*` or anywhere client-reachable.
- Unvalidated phone numbers (validate/normalize to E.164 first).
- Logging recipient addresses, numbers, or message bodies.
- Importing the notifier into a Client Component (missing `import "server-only"`).

## Cross-references

- **backend-settings-admin** — admin-editable Resend/Twilio credentials + channel toggles, env fallback
- **backend-stripe** — calls `notify("order.confirmed")` from the idempotent webhook, post-commit
- **backend-webhook-handler** — verifies Twilio delivery-status callbacks if tracked
- **infra-background-jobs** — enqueue notifications when send latency must stay off the request path
- **stack-zod-boundary** — E.164 phone validation
- **ai-sdk-wrapper** — if message bodies are AI-composed, persist them; never regenerate per send
