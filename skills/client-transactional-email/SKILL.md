---
name: client-transactional-email
description: Implements transactional email for a Persimmon Next.js app via Resend (primary) or the SendGrid SDK (alternative), wrapped in src/lib/email/. Covers order/process confirmations, password resets, notifications, contact-form delivery, HTML+plaintext bodies, domain verification (SPF/DKIM/DMARC), and deliverability. Use when an app needs to send transactional email, set up Resend, verify a sending domain, or improve inbox placement. Trigger keywords: send email, transactional email, Resend, SendGrid, password reset email, order confirmation, deliverability, DKIM, SPF, domain verification.
---

# Transactional Email — Persimmon Patterns

Send transactional email from a Persimmon app through **Resend** (default) or the **SendGrid SDK** (alternative). All sending goes through one wrapper in `src/lib/email/`. Never call a provider SDK directly from business logic.

## Core Rules

1. **One wrapper, server-only.** All sends go through `src/lib/email/send.ts`. The API key is server-side only — never `NEXT_PUBLIC_*`, never in a client bundle.
2. **Validate the boundary with Zod.** Any send triggered by user input (contact form, etc.) validates the payload before sending. See `stack-zod-boundary`.
3. **Always include a plaintext part.** HTML-only mail scores worse on spam filters. Provide both.
4. **From address must be on a verified domain.** Resend/SendGrid reject sends from unverified senders.
5. **Never log PII or message bodies.** Log the provider error code and a redacted recipient hash only.
6. **Retry transient failures.** Wrap sends in exponential backoff (network / 429 / 5xx).
7. **Persist what matters.** If an email is part of a workflow (password reset, order confirmation), record that it was sent (timestamp + type) so you don't double-send.

## Setup — Resend

1. Create an account at https://resend.com.
2. **Domains → Add Domain** for the client's sending domain. Add the SPF + DKIM (and optionally DMARC) DNS records Resend gives you. Wait for verification.
3. **API Keys → Create** with send-only scope. Store as `RESEND_API_KEY` in Railway env (server-side).
4. `npm i resend`.

Env (server-side only):

```
RESEND_API_KEY=re_xxx
EMAIL_FROM="Client Name <noreply@clientdomain.com>"
EMAIL_REPLY_TO=support@clientdomain.com
```

## The Wrapper (Resend)

```ts
// src/lib/email/send.ts
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM!;
const REPLY_TO = process.env.EMAIL_REPLY_TO;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string; // falls back to stripped HTML
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function toPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let delay = 1000;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 4; // 1s → 4s → 16s
    }
  }
  throw new Error("unreachable");
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  try {
    const { data, error } = await withRetry(() =>
      resend.emails.send({
        from: FROM,
        to: input.to,
        ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
        subject: input.subject,
        html: input.html,
        text: input.text ?? toPlainText(input.html),
      }),
    );

    if (error) {
      // Redact: never log the recipient or body.
      console.error("[email] provider error", { name: error.name });
      return { ok: false, error: "Email could not be sent." };
    }
    return { ok: true, id: data!.id };
  } catch (err) {
    console.error("[email] send failed", { code: (err as { name?: string }).name });
    return { ok: false, error: "Email could not be sent." };
  }
}
```

## Alternative — SendGrid SDK

Same wrapper shape, swap the body. Use when a client already standardizes on SendGrid.

```ts
// src/lib/email/send.ts  (SendGrid variant)
import "server-only";
import sgMail from "@sendgrid/mail";
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  try {
    const [res] = await withRetry(() =>
      sgMail.send({
        to: input.to,
        from: process.env.EMAIL_FROM!,
        replyTo: process.env.EMAIL_REPLY_TO,
        subject: input.subject,
        html: input.html,
        text: input.text ?? toPlainText(input.html),
      }),
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, id: res.headers["x-message-id"] ?? "" };
    }
    return { ok: false, error: "Email could not be sent." };
  } catch (err) {
    console.error("[email] sendgrid error", { code: (err as { code?: number }).code });
    return { ok: false, error: "Email could not be sent." };
  }
}
```

Create the SendGrid API key with **Mail Send** permission only.

## Contact Form → Server Action + Zod + Resend

Replaces Formspree. The form posts to a Server Action that validates and sends.

```ts
// src/lib/contact-actions.ts
"use server";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

const ContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  message: z.string().trim().min(1).max(5000),
  // Honeypot: must be empty. Bots fill it.
  company: z.string().max(0).optional().or(z.literal("")),
});

export async function submitContact(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ContactInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
    company: formData.get("company"),
  });
  if (!parsed.success) {
    return actionErr("Please check the form.", parsed.error.flatten().fieldErrors);
  }
  const { name, email, message } = parsed.data;

  const res = await sendEmail({
    to: process.env.CONTACT_INBOX!, // client's inbox, server-side env
    subject: `New inquiry from ${name}`,
    html: `<p><strong>${name}</strong> (${email}) wrote:</p><p>${message.replace(/</g, "&lt;")}</p>`,
  });

  if (!res.ok) return actionErr("We couldn't send your message. Try again.");
  return actionOk(undefined);
}
```

Always set `replyTo` to the visitor's address (or include it in the body) so the client can reply directly.

## Typed Email Functions

Wrap each email type in a named function so business logic never builds raw payloads:

```ts
// src/lib/email/messages.ts
import { sendEmail } from "./send";

export const sendPasswordReset = (to: string, resetUrl: string) =>
  sendEmail({
    to,
    subject: "Reset your password",
    html: `<p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });

export const sendOrderConfirmation = (to: string, orderNumber: string, html: string) =>
  sendEmail({ to, subject: `Order confirmed — #${orderNumber}`, html });
```

HTML body composition (DOCTYPE, viewport, dark-mode, bulletproof button, CAN-SPAM footer) belongs to **`client-email-templates`** — use that for the `html` strings. This skill owns the sending side.

## Domain Verification & Deliverability

- **SPF + DKIM are mandatory.** Add the records the provider gives you; verify before going live.
- **DMARC** (`_dmarc` TXT, start at `p=none`) improves placement and gives you reports.
- **Plaintext part always.** Improves spam score.
- **HTML email = table layout + inline styles.** No flex/grid; Outlook ignores them. (See `client-email-templates`.)
- **Images need absolute HTTPS URLs** — host them (e.g. S3, see `infra-s3-uploads`), never relative paths.
- **Unsubscribe link** required by CAN-SPAM for *marketing* email; not required for transactional (reset, confirmation).
- **Test in real inboxes** — Gmail, Outlook, Apple Mail render differently.

## One-Screen Defaults

- Resend by default; SendGrid SDK only if the client already uses it.
- One wrapper, `src/lib/email/send.ts`, `import "server-only"`.
- HTML + plaintext, every send.
- API key server-side env; never `NEXT_PUBLIC_*`.
- Zod-validate any user-triggered send; honeypot on public contact forms.
- 3-retry exponential backoff (1s → 4s → 16s).

## Anti-patterns banned

- Importing `resend` / `@sendgrid/mail` outside `src/lib/email/`.
- Exposing the API key via `NEXT_PUBLIC_*` or a client component.
- HTML-only sends with no plaintext part.
- Logging recipient addresses, names, or message bodies.
- Sending from an unverified domain/sender.
- A public contact endpoint with no Zod validation and no honeypot/rate limit.
- Proxying marketing blasts through this transactional path (use a broadcast tool).

## Cross-references

- **client-email-templates** — HTML body composition (layout, dark mode, footer).
- **stack-server-actions** — the `ActionResult` shape + form wiring.
- **stack-zod-boundary** — boundary validation for the contact form.
- **infra-s3-uploads** — hosting email images at absolute HTTPS URLs.
- **security-nextauth** — the password-reset flow that calls `sendPasswordReset`.
