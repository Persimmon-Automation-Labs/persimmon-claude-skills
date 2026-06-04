---
name: client-seo
description: SEO and Search Agent Optimization (SAO) for Persimmon client public sites built on Next.js 16 — the Metadata API (generateMetadata, Open Graph, Twitter cards, canonical), JSON-LD via a script tag in an RSC, app/sitemap.ts, app/robots.ts, and llms.txt. Use when prepping a public marketing site for launch or improving discoverability and AI-search citation. Internal tools should noindex. Trigger keywords: SEO, metadata, JSON-LD, schema markup, sitemap, robots.txt, Open Graph, canonical, llms.txt, rank, search agent optimization.
---

# SEO + SAO — Persimmon Patterns

For public-facing client marketing sites at launch. Internal tools and admin panels do NOT get this — they `noindex` (see Anti-patterns). Performance/CWV defers to `quality-performance`; image work to `client-image-optimization`.

## Core Rules

1. **Metadata via the Next 16 Metadata API**, not hand-written `<head>` tags. Export `metadata` (static) or `generateMetadata` (dynamic) from each route.
2. **One canonical per page, always set.** Use `metadataBase` + per-route `alternates.canonical`.
3. **JSON-LD via a `<script type="application/ld+json">` rendered in a Server Component** — never `dangerouslySetInnerHTML` on the client, never a third-party lib.
4. **`app/sitemap.ts` and `app/robots.ts`**, not static XML files. Next generates `/sitemap.xml` and `/robots.txt`.
5. **Demo/staging sites must `noindex`** at the metadata layer AND via `X-Robots-Tag` header.

## Metadata API

### Root layout — set `metadataBase` + defaults

```ts
// src/app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://clientdomain.com"),
  title: { default: "Brand Name", template: "%s | Brand Name" },
  description: "Default 150–160 char description with a CTA verb.",
  openGraph: { type: "website", siteName: "Brand Name", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};
```

### Per-page — static

```ts
// src/app/about/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",                       // → "About | Brand Name"
  description: "Unique 150–160 chars, CTA included.",
  alternates: { canonical: "/about" },  // resolved against metadataBase
  openGraph: { url: "/about", title: "About | Brand Name", images: ["/og/about.jpg"] },
};
```

### Per-page — dynamic (`generateMetadata`)

```ts
// src/app/blog/[slug]/page.tsx
import type { Metadata } from "next";
import { db } from "@/lib/db";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const post = await db.post.findUnique({ where: { slug } });
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${slug}`,
      title: post.title,
      images: [post.heroImage],
      publishedTime: post.publishedAt.toISOString(),
    },
  };
}
```

**Title:** 50–60 chars, keyword near the start, brand via the `template`.
**Description:** 150–160 chars, include a CTA verb, unique per page.
**Never set `keywords`** — deprecated, counterproductive.

## JSON-LD (Server Component)

Render structured data as a script tag inside an RSC. Build the object in JS and `JSON.stringify` it. Validate with Google Rich Results Test + Schema.org Validator.

```tsx
// src/components/JsonLd.tsx  (Server Component — no "use client")
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

`dangerouslySetInnerHTML` here is safe and standard: the input is your own structured object, not user HTML. Drop `<JsonLd data={...} />` into the page body.

### LocalBusiness (most clients — homepage)

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Business Name",
  url: "https://clientdomain.com",
  telephone: "+1-555-555-5555",
  email: "contact@clientdomain.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "123 Main Street",
    addressLocality: "City", addressRegion: "ST",
    postalCode: "00000", addressCountry: "US",
  },
  openingHoursSpecification: [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday"],
    opens: "09:00", closes: "17:00",
  }],
  image: "https://clientdomain.com/images/business.jpg",
  priceRange: "$$",
}} />
```

### FAQPage (high SAO leverage)

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "What services do you offer?",
      acceptedAnswer: { "@type": "Answer", text: "Plain-language answer." } },
  ],
}} />
```

Ship FAQPage on any page with a Q&A section — Google surfaces rich results and AI agents (ChatGPT, Perplexity) cite them directly.

### Article (blog posts)

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "Article",
  headline: post.title,
  image: post.heroImage,
  datePublished: post.publishedAt.toISOString(),
  dateModified: post.updatedAt.toISOString(),
  author: { "@type": "Person", name: post.authorName },
  publisher: { "@type": "Organization", name: "Brand Name",
    logo: { "@type": "ImageObject", url: "https://clientdomain.com/logo.png" } },
}} />
```

Also useful: **Service** (`@type: "Service"` with `hasOfferCatalog`) for service pages.

## app/sitemap.ts

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic"; // it reads the DB

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://clientdomain.com";
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`,         changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/about`,    changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/services`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/contact`,  changeFrequency: "monthly", priority: 0.7 },
  ];
  const posts = await db.post.findMany({
    where: { published: true },
    select: { slug: true, updatedAt: true },
  });
  return [
    ...staticRoutes,
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
```

Next serves this at `/sitemap.xml` automatically — no `.htaccess` rewrite needed.

## app/robots.ts

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] },
    sitemap: "https://clientdomain.com/sitemap.xml",
  };
}
```

For a **staging/demo** deployment, block everything and also send the header:

```ts
// staging robots.ts
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
// + next.config.ts: add header X-Robots-Tag: noindex, nofollow on staging
```

## Search Agent Optimization (SAO)

Getting cited by ChatGPT, Perplexity, Google AI Overviews, Claude:

1. **Answerable content.** Lead each page with a clear factual answer to a likely question, not a hero pitch — AI agents quote you standalone.
2. **Schema matters more.** FAQPage, HowTo, Article get cited disproportionately.
3. **Stable, descriptive URLs.** Don't change them.
4. **H2s phrased as questions** ("How long does the process take?"); include data, dates, numbers; cite sources.

### llms.txt

A markdown index AI agents read — `robots.txt` for LLMs. Serve it as a static file or a route handler at `/llms.txt`.

```ts
// src/app/llms.txt/route.ts
export function GET(): Response {
  const body = `# Brand Name

> One-sentence company description.

## About
- [About us](https://clientdomain.com/about): History and mission.

## Services
- [Service A](https://clientdomain.com/services/a): What it does.

## Contact
- [Contact](https://clientdomain.com/contact): How to reach us.

## Key Pages
- [Pricing](https://clientdomain.com/pricing): Pricing structure.
- [FAQ](https://clientdomain.com/faq): Common questions.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

Ship on every public marketing site — ~10 minutes, upside is Perplexity/ChatGPT citations.

## Per-page Checklist

- [ ] Unique `title` (50–60 chars) via Metadata API
- [ ] Unique `description` (150–160 chars, CTA)
- [ ] `alternates.canonical` set
- [ ] Open Graph + Twitter card (inherited from layout, overridden per page)
- [ ] Relevant JSON-LD (LocalBusiness home; FAQPage on Q&A; Article on blog)
- [ ] One H1; H2/H3 hierarchy
- [ ] Alt text on every image (`client-image-optimization`)

## Launch Checklist

- [ ] `/sitemap.xml` resolves (from `app/sitemap.ts`)
- [ ] `/robots.txt` resolves (from `app/robots.ts`)
- [ ] `/llms.txt` resolves
- [ ] `metadataBase` is the production https origin (no http, no www mismatch)
- [ ] Google Search Console verified + sitemap submitted
- [ ] HTTPS enforced; LCP < 2.5s (see `quality-performance`)
- [ ] No broken links

## Anti-patterns banned

- Hand-written `<head>` meta tags instead of the Metadata API.
- `keywords` meta (deprecated, counterproductive).
- Duplicate titles/descriptions across pages.
- JSON-LD with unfilled placeholder text (Google flags as spammy).
- Missing canonical (duplicate-content penalty).
- `noindex` on a production marketing page (kills SEO).
- Indexing internal tools / admin / staging — those must `noindex`.
- One sitemap shared across multiple client sites — each site gets its own.
- Forgetting the `sitemap` line in `robots.ts`.

## Cross-references

- **client-analytics** — pairs with SEO at launch (both touch `<head>` / layout).
- **client-image-optimization** — alt text, `next/image`, WebP affect SEO.
- **quality-performance** — CWV/LCP that SEO scoring depends on.
- **quality-final-review** — launch checklist includes these SEO items.
