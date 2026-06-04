---
name: client-analytics
description: Adds web analytics and conversion tracking to a Persimmon Next.js 16 client site — GA4 and Google Tag Manager via @next/third-parties/google, Meta Pixel via a gated client script, ecommerce events (add_to_cart, purchase) through the dataLayer, and a consent-gated cookie banner for GDPR/CCPA. Tracking IDs are public by design; everything else stays server-side. Use when wiring up analytics, tag manager, pixels, conversion tracking, or a cookie consent banner. Trigger keywords: analytics, GA4, Google Analytics, GTM, tag manager, Meta Pixel, conversion tracking, cookie consent, ecommerce events, dataLayer.
---

# Analytics — Persimmon Patterns

Wire GA4 / GTM / Meta Pixel and conversion tracking into a Persimmon Next.js 16 site, gated behind cookie consent. Tracking IDs (`G-…`, `GTM-…`, pixel id) are **public by design** — they ship in the client bundle, so `NEXT_PUBLIC_*` env vars are correct here. This is the one exception to the "no secrets in NEXT_PUBLIC_" rule. No actual secrets belong in analytics config.

## Core Rules

1. **Consent gates loading.** No GA4/GTM/Pixel script loads until the user accepts. Default state = denied. This is legally required for EU visitors and any ecommerce.
2. **Use `@next/third-parties/google`** for GA4/GTM — it loads them with the right strategy and avoids hand-rolled script tags. Pixel uses a gated `next/script`.
3. **IDs are public env (`NEXT_PUBLIC_*`)**; nothing sensitive lives in analytics. Real keys never go here.
4. **Fire events through the `dataLayer`** (`sendGAEvent`) so GTM and GA4 both see them; mirror purchase/cart events to the Pixel.
5. **Persist consent in a cookie**, read it in a Server Component to decide whether to render trackers.

## Step 1 — Public Env

```
NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX          # preferred over direct GA4
NEXT_PUBLIC_META_PIXEL_ID=XXXXXXXXXXXXXXXXX
```

## Step 2 — Consent Cookie Helper

```ts
// src/lib/consent.ts
import { cookies } from "next/headers";

export type Consent = "accepted" | "declined" | "pending";

export async function getConsent(): Promise<Consent> {
  const c = (await cookies()).get("cookie_consent")?.value;
  return c === "accepted" ? "accepted" : c === "declined" ? "declined" : "pending";
}
```

## Step 3 — Consent Banner (client)

Sets the cookie and reloads so the layout can render trackers on the next request.

```tsx
// src/components/ConsentBanner.tsx
"use client";
import { useState } from "react";

export function ConsentBanner({ initial }: { initial: "accepted" | "declined" | "pending" }) {
  const [hidden, setHidden] = useState(initial !== "pending");
  if (hidden) return null;

  function choose(value: "accepted" | "declined") {
    document.cookie = `cookie_consent=${value};max-age=31536000;path=/;SameSite=Lax`;
    setHidden(true);
    if (value === "accepted") location.reload(); // re-render layout with trackers
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-4 bg-neutral-900 px-6 py-4 text-sm text-white">
      <p className="flex-1">
        We use cookies to analyze traffic and improve your experience.{" "}
        <a href="/privacy-policy" className="underline">Privacy Policy</a>
      </p>
      <div className="flex gap-2">
        <button onClick={() => choose("declined")} className="rounded border border-neutral-500 px-4 py-2">Decline</button>
        <button onClick={() => choose("accepted")} className="rounded bg-blue-600 px-4 py-2">Accept</button>
      </div>
    </div>
  );
}
```

## Step 4 — Gate Trackers in the Layout (Server Component)

```tsx
// src/app/layout.tsx
import { GoogleTagManager, GoogleAnalytics } from "@next/third-parties/google";
import { getConsent } from "@/lib/consent";
import { ConsentBanner } from "@/components/ConsentBanner";
import { MetaPixel } from "@/components/MetaPixel";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const consent = await getConsent();
  const enabled = consent === "accepted";

  const gtm = process.env.NEXT_PUBLIC_GTM_ID;
  const ga4 = process.env.NEXT_PUBLIC_GA4_ID;
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <html lang="en">
      <body>
        {/* Prefer GTM; fall back to direct GA4. Only when consent is given. */}
        {enabled && gtm && <GoogleTagManager gtmId={gtm} />}
        {enabled && !gtm && ga4 && <GoogleAnalytics gaId={ga4} />}
        {enabled && pixel && <MetaPixel pixelId={pixel} />}

        {children}
        <ConsentBanner initial={consent} />
      </body>
    </html>
  );
}
```

`@next/third-parties` injects the GTM noscript iframe and the GA4 loader correctly — no manual `<noscript>` needed.

## Step 5 — Meta Pixel (gated client script)

```tsx
// src/components/MetaPixel.tsx
"use client";
import Script from "next/script";

export function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`} alt="" />
      </noscript>
    </>
  );
}
```

## Step 6 — Ecommerce Events

Fire through the GA4/GTM `dataLayer` with `sendGAEvent`, then mirror to the Pixel. Call these in client components on the cart / order-confirmation flows.

```tsx
// src/lib/track.ts
"use client";
import { sendGAEvent } from "@next/third-parties/google";

type Item = { id: string; name: string; price: number; quantity?: number };

export function trackAddToCart(item: Item) {
  sendGAEvent("event", "add_to_cart", {
    currency: "USD", value: item.price,
    items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity ?? 1 }],
  });
  window.fbq?.("track", "AddToCart", {
    content_ids: [item.id], content_name: item.name, content_type: "product",
    value: item.price, currency: "USD",
  });
}

export function trackPurchase(order: { id: string; total: number; tax: number; shipping: number; items: Item[] }) {
  sendGAEvent("event", "purchase", {
    transaction_id: order.id, value: order.total, tax: order.tax,
    shipping: order.shipping, currency: "USD",
    items: order.items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  window.fbq?.("track", "Purchase", {
    content_ids: order.items.map((i) => i.id), content_type: "product",
    value: order.total, currency: "USD", num_items: order.items.length,
  });
}
```

On the order-confirmation page (a Server Component), pass the persisted order into a small client component that calls `trackPurchase` once in an effect. Read the order from the DB — never trust client-supplied amounts for the value.

```ts
// minimal global typing for fbq
declare global {
  interface Window { fbq?: (...args: unknown[]) => void }
}
```

## Step 7 — Privacy Policy

A `/privacy-policy` page is required when running analytics. It must state: what's collected (cookies, IP, behavior), which third parties process it (Google, Meta), how to opt out (the consent banner), retention period, and a privacy contact. Generate it as part of the site build.

## One-Screen Defaults

- Consent denied by default; trackers load only after Accept.
- GTM preferred; direct GA4 fallback; both via `@next/third-parties`.
- IDs in `NEXT_PUBLIC_*` (public by design) — nothing secret in analytics.
- Events through `sendGAEvent` (dataLayer), mirrored to the Pixel.
- Purchase value sourced from the persisted DB order, not the client.

## Setup Checklist

- [ ] GA4 / GTM / Pixel IDs in `NEXT_PUBLIC_*` env
- [ ] `@next/third-parties` installed
- [ ] Consent banner renders only when consent is pending
- [ ] Trackers render only when consent === accepted
- [ ] Verified: declining loads zero tracking scripts (Network tab)
- [ ] `add_to_cart` + `purchase` events fire
- [ ] Verified in GA4 DebugView + Meta Events Manager Test Events
- [ ] `/privacy-policy` page exists and is linked from the banner
- [ ] Mobile: banner doesn't block content

## Anti-patterns banned

- Loading any tracker before consent is granted.
- Hand-rolled GA/GTM `<script>` tags instead of `@next/third-parties`.
- Putting a real secret in a `NEXT_PUBLIC_*` var (only public tracking IDs belong there).
- Trusting client-supplied order totals for the `purchase` value — read from the DB.
- A consent banner with no working "Decline" that actually suppresses tracking.
- Shipping analytics with no linked privacy policy.

## Cross-references

- **client-seo** — pairs with analytics at launch; both touch the root layout.
- **stack-server-actions** — the order data feeding `trackPurchase` is persisted via actions.
- **security-nextauth** — admin analytics dashboards live behind auth.
- **quality-final-review** — launch QA includes consent + event verification.
