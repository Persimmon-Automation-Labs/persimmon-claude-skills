---
name: backend-settings-admin
description: "Self-service settings & integration-credentials manager for the Persimmon stack — every integration's API keys/IDs/config (Stripe, Twilio, Resend, Google, social) is editable by the client (Owner) through the admin UI. DB-backed via Prisma, secrets encrypted at rest with Node crypto AES-256-GCM, env fallback, per-integration test-connection. Use whenever a build adds any third-party integration. Trigger keywords: settings, integration credentials, API keys, encrypted at rest, env fallback, test connection, self-service config."
---

# Backend — Settings & Integration Credentials — Persimmon Patterns

The rule: **the client (Owner) must be able to configure every integration themselves through the admin portal** — rotate a Stripe key, paste a Twilio token, change the Resend sender — without emailing a developer to edit env vars on Railway. Any integration a build adds (payments, SMS, email, maps, analytics, social) exposes its keys/config in an admin Settings screen. Hard-coding integration creds as env-only is a defect on client work.

## env vs DB — the split

Persimmon's "secrets server-side only" rule still holds for **bootstrap** secrets. The distinction:

| Lives in Railway env (dev-managed) | Lives in DB `Setting` (client-managed via admin, encrypted) |
|---|---|
| `DATABASE_URL`, `NEXTAUTH_SECRET`, base URL | Stripe keys + webhook secret |
| **`SETTINGS_ENCRYPTION_KEY`** (encrypts the DB secrets) | Twilio SID / token / from-number |
| Anything needed *before* the DB is reachable | Resend key + sender, Google/Maps keys, social tokens, feature toggles |

Code reads a setting with an **env fallback**: use the DB value if set, else the env value (handy for local/staging and as a migration path). The client's admin edits always win in production.

## Schema

```prisma
model Setting {
  key       String      @id              // "stripe.secretKey", "twilio.authToken"
  value     String?     @db.Text         // plaintext OR base64 ciphertext (see isSecret)
  isSecret  Boolean     @default(false)  // true = value encrypted at rest
  group     String                       // "stripe" | "twilio" | "resend" (UI grouping)
  label     String
  type      SettingType @default(TEXT)
  updatedBy String?
  updatedAt DateTime    @updatedAt
  @@index([group])
}

enum SettingType { TEXT PASSWORD BOOL NUMBER SELECT }
```

## Encrypt secrets at rest — Node crypto AES-256-GCM

Secret values are encrypted with a 32-byte key from env (`SETTINGS_ENCRYPTION_KEY`, base64), never stored plaintext. GCM gives authenticated encryption — tampering fails the auth tag on decrypt.

```ts
// src/lib/settings/secrets.ts
import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const KEY = Buffer.from(process.env.SETTINGS_ENCRYPTION_KEY!, "base64"); // 32 bytes

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // GCM standard nonce
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64"); // store this
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"); // throws if tampered
}
```

`SETTINGS_ENCRYPTION_KEY` lives in env, NEVER in the DB (it's what protects the DB secrets). Generate once: `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`.

## Settings service (get/set + env fallback + request cache)

```ts
// src/lib/settings/settings.ts
import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "./secrets";

// React cache() dedupes reads within a single request.
export const getSetting = cache(async (key: string): Promise<string | null> => {
  const row = await db.setting.findUnique({ where: { key }, select: { value: true, isSecret: true } });
  if (!row?.value) {
    const envKey = key.toUpperCase().replace(/\./g, "_"); // stripe.secretKey → STRIPE_SECRETKEY
    return process.env[envKey] ?? null;
  }
  return row.isSecret ? decryptSecret(row.value) : row.value;
});

export async function setSetting(key: string, value: string, isSecret: boolean, userId: string): Promise<void> {
  await db.setting.update({
    where: { key },
    data: { value: isSecret ? encryptSecret(value) : value, isSecret, updatedBy: userId },
  });
}
```

Integrations resolve creds through `getSetting` — e.g. `new Stripe((await getSetting("stripe.secretKey"))!)`. (When perf-critical, the env value can still seed the SDK singleton; the DB value wins for client-rotated keys.)

## Admin UI — Settings screen

- One panel per integration `group`, built on `backend-admin-panel`.
- Secret fields are `type=PASSWORD`; render **masked** (`••••••1234`, last 4) and only overwrite when a new value is submitted — never send the stored secret back into the DOM/RSC payload.
- **Per-integration "Test connection" Server Action** → one cheap authenticated call (Stripe `balance.retrieve`, Twilio fetch account, Resend domains list) reporting success/failure inline. This is what makes it true self-service.
- Saves are Server Actions (CSRF built-in), Owner-gated, and write an audit row (who, which key, when — never the value).

```ts
// src/lib/settings/test-actions.ts
"use server";
import { requireRole } from "@/lib/admin-guard";
import { getSetting } from "./settings";
import Stripe from "stripe";
import { actionOk, actionErr, type ActionResult } from "@/lib/action-result";

export async function testStripe(): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const key = await getSetting("stripe.secretKey");
    if (!key) return actionErr("No Stripe key set.");
    await new Stripe(key).balance.retrieve(); // cheap authenticated probe
    return actionOk(undefined);
  } catch {
    return actionErr("Stripe credentials rejected.");
  }
}
```

## Access control

- **Owner role only** can view/edit credentials (→ `backend-admin-panel` role model). Managers/Staff never see secrets.
- Log every change (who, which key, when — not the value) to an audit table.
- Never write secret values to logs or error output. The `getSetting` reader returns the decrypted value only to server code, never to a client payload.

## One-screen defaults

| Concern | Default |
|---|---|
| Storage | `Setting` table, key = `group.camelCaseKey` |
| Secrets | AES-256-GCM via Node `crypto`, base64(iv+tag+ct) |
| Master key | `SETTINGS_ENCRYPTION_KEY` in env, never in DB |
| Read | `getSetting()` (React `cache`) with env fallback |
| Masking | last-4 only; overwrite-on-submit; never echo stored secret |
| Test | per-integration Server Action, Owner-gated |
| Audit | who/key/when on every save, never the value |

## Integrating a 3rd-party system you lack credentials for yet

When a build adds a 3rd-party integration (payment processor, KDS, POS, accounting) and credentials aren't available until client go-live:

- **Adapter pattern (anti-corruption layer).** Wrap the 3rd-party call behind a `PaymentProvider` / `KDSAdapter` interface. The implementation is selected by a `PAYMENT_PROVIDER` setting (`mock` → `sandbox` → `prod`), not by if/else littered through the codebase.
- **A local mock of the service** (same HTTP contract, realistic UI) so you can build, demo, and verify with zero credentials. The mock runs **in-process** — server-to-self HTTP loopback is fragile on Railway; use a direct function call with the same interface.
- **Demo/mock bypass MUST fail-closed + be hard-gated to non-prod.** `if (process.env.NODE_ENV === "production" && provider === "mock") throw new Error(...)` — a mock that can reach production is a security hole. Gate it, test that the gate holds, document it in an ADR.
- **The Settings admin screen** (`group: "payments"`, etc.) lets the client flip from `mock` → `sandbox` → `prod` and enter their credentials without a redeploy.

## Anti-patterns banned

- Integration keys available only in env / hard-coded — not client-editable.
- Storing API secrets plaintext in the DB.
- Echoing a stored secret back into an admin form or RSC payload.
- Letting non-Owner roles see credentials.
- Logging secret values or passing them to a Client Component.
- Putting `SETTINGS_ENCRYPTION_KEY` itself in the DB.
- AES-CBC without an auth tag (use GCM — detects tampering).
- Reusing a GCM nonce/IV across encryptions (always `randomBytes(12)`).

## Cross-references

- **backend-admin-panel** — CRUD scaffold + Owner role model the Settings screen is built on
- **backend-stripe** / **backend-notifications** — consume credentials via `getSetting`, env fallback
- **security-nextauth** — Owner-role gate, session
- **security-review** — encryption-at-rest, key handling, audit logging as a review gate
- **backend-content-management** — sibling self-service surface (content vs. credentials)
