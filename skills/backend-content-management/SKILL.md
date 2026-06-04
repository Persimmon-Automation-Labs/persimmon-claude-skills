---
name: backend-content-management
description: "The content layer for Persimmon sites — lets clients edit their own content (team, images, copy, menus, hours) safely. Structured content modeling (typed Prisma collections + blocks, references, taxonomy), constrained editor with preview, a reusable media library with enforced alt text, allowlist-sanitized rich text (isomorphic-dompurify), per-page SEO + slug redirects, and revalidateTag cache-busting on publish. Use when clients need to edit site content without a developer. Trigger keywords: CMS, content management, editable content, media library, rich text sanitize, slug redirect, SEO meta, revalidateTag."
---

# Backend — Content Management — Persimmon Patterns

Lets non-technical clients edit their own site content — team, images, copy, hours, menus — without a developer. This skill owns **how content is modeled, edited safely, and rendered** on the Next.js + Prisma stack.

**Pick the right level** (most SMB sites need the middle):

| Level | When | What |
|---|---|---|
| **Blocks-only** | Brochure site, a few editable spots | Content blocks + one collection, sanitized output |
| **CMS-lite** (default) | SMB with team, menu, gallery, hours | This skill in full + draft/publish flag + roles |
| **Full CMS** | Multi-author, editorial calendar, many types | Add versioning/approvals/scheduling/audit tables |

If the client needs arbitrary page-building or true multi-author editorial ops, flag it — that may exceed what a hand-built layer should do.

## Core contract

1. Model content as **typed Prisma records and fields**, never one HTML blob (reuse, consistency, multi-surface delivery).
2. Rich-text (`html`) fields are **allowlist-sanitized on input** with `isomorphic-dompurify`; `text` fields are escaped by React on render. Client HTML is NEVER rendered raw.
3. Media is a **reusable library** referenced by id; **alt text is required** at upload (Zod-enforced).
4. Changing a published slug **auto-creates a 301 redirect** — the single most damaging SEO mistake is renaming a URL with no redirect.
5. On publish, **`revalidateTag`** busts the affected cached pages — don't rely on TTL for freshness.
6. Every editable area is admin-editable with no code change; built on `backend-admin-panel`.

## 1. Content modeling — structured, not blobs

**Two shapes:**

- **Content blocks** — keyed singular spots (hero headline, hours, announcement). One row per spot, typed.
- **Structured collections** — repeating typed records (team, menu items, FAQs). A real model per type with typed fields, `sortOrder`, `published`, timestamps.

```prisma
model ContentBlock {
  key       String      @id            // "home.hero.headline"
  type      BlockType   @default(TEXT) // TEXT | HTML | IMAGE | JSON
  value     String?     @db.Text
  label     String
  updatedAt DateTime    @updatedAt
}
enum BlockType { TEXT HTML IMAGE JSON }

model TeamMember {
  id        String   @id @default(cuid())
  name      String
  role      String
  bio       String?  @db.Text
  photoId   String?                     // reference into Media — not a copied path
  photo     Media?   @relation(fields: [photoId], references: [id])
  sortOrder Int      @default(0)
  published Boolean  @default(true)
  updatedAt DateTime @updatedAt
  @@index([published, sortOrder])
}
```

- **References, not duplication:** point at a `Media` row or another record by id — change once, propagate everywhere.
- **Taxonomy:** for cross-cutting grouping (menu categories, dietary tags), a `Term` + `TermRelation` pair, not a free-text column.
- **Content as data:** the public site reads these and renders through brand templates; the same records can feed JSON later (COPE).

## 2. Editor experience

- **Constrained rich text, never a raw-HTML box.** Offer a small set (bold/italic/lists/links/H2–H3). Free HTML is stored-XSS + layout breakage.
- **Preview before publish** — with a `published` (or `draft`) flag, preview the draft on the real template before it goes live.
- **Validation + required fields + help text** — Zod-enforced (a team member needs a name; an image needs alt).
- **Warn on unsaved navigation**; autosave drafts where feasible.
- **Bulk ops** — reorder (`sortOrder`), bulk publish/unpublish.

Build screens on `backend-admin-panel` + `stack-server-actions`.

## 3. Media — a reusable library, alt required

```prisma
model Media {
  id        String   @id @default(cuid())
  key       String                       // S3 object key (→ infra-s3-uploads)
  alt       String                       // REQUIRED — enforce on save
  width     Int?
  height    Int?
  mime      String
  createdAt DateTime @default(now())
}
```

- **Alt text required** at upload — Zod `.min(1)`, never optional.
- **Upload via presigned URL** (→ `infra-s3-uploads`): server issues a presigned PUT, client uploads directly to the bucket, then a Server Action records the `Media` row with alt. Never proxy bytes through Next.
- Validate MIME server-side from the recorded metadata; enforce an extension/type allowlist and max size before issuing the presign.

## 4. Security — sanitize rich text on input

`text` fields are safe — React escapes on render. `html` fields hold real tags; escaping isn't enough. **Allowlist-sanitize on input** so the DB only ever holds clean HTML.

```ts
// src/lib/content/sanitize.ts
import "server-only";
import DOMPurify from "isomorphic-dompurify";

const CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "a", "h2", "h3"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}
```

```tsx
// render — value is already sanitized at write time, so this is safe:
<div dangerouslySetInnerHTML={{ __html: block.value ?? "" }} />
// text blocks: just render — React escapes
<p>{block.value}</p>
```

Sanitize in the Server Action **before** the DB write (store clean), and keep the allowlist fixed. Plus Zod on every save, role/auth on every edit action (→ `security-review`).

## 5. SEO — editable meta + 301 on slug change

- **Per-page editable** title, meta description, OG image, canonical — stored with the content.
- **Slugs are content.** Changing a *published* slug REQUIRES a 301. Keep a `Redirect` table; on slug change auto-insert old→new (301) and refresh the sitemap.

```prisma
model Redirect {
  fromPath  String   @id
  toPath    String
  code      Int      @default(301)
  createdAt DateTime @default(now())
}
```

Serve redirects from `middleware.ts` (or `next.config` `redirects()` for static ones). Avoid chains — point old→final, not old→mid→final.

```ts
// in the slug-update Server Action, when oldSlug !== newSlug and the page is published:
await db.redirect.upsert({
  where: { fromPath: `/${oldSlug}` },
  update: { toPath: `/${newSlug}` },
  create: { fromPath: `/${oldSlug}`, toPath: `/${newSlug}`, code: 301 },
});
```

## 6. Accessibility authoring

- **Require alt text** on every image (block save without it) — highest leverage.
- **Constrain headings** to H2/H3 within a section so editors can't break hierarchy.
- Accessible-by-default templates (contrast, focus, semantics) from `stack-tailwind-tokens`.

## 7. Performance — cache + revalidate on publish

Tag cached content reads, then **`revalidateTag` on publish** — event-based invalidation, not TTL guessing.

```tsx
// read path — tag the cache
const team = await db.teamMember.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
// (wrap fetches with unstable_cache + tags, or tag route segments; team list page is force-dynamic if it reads auth)
```

```ts
// publish Server Action
import { revalidateTag } from "next/cache";
export async function publishTeam(): Promise<void> {
  // ...write...
  revalidateTag("content:team"); // busts every page tagged with it
}
```

Avoid N+1: fetch a collection in one query with `include`/`select`, not one query per item.

## One-screen defaults

| Concern | Default |
|---|---|
| Model | typed Prisma blocks + collections; references by id |
| Rich text | `isomorphic-dompurify` allowlist, sanitize on write |
| Text | render via React (auto-escaped) |
| Media | reusable `Media` table, alt required, presigned upload |
| Slug change | auto 301 in `Redirect` table |
| SEO | per-page meta/OG/canonical stored with content |
| Cache | tag reads, `revalidateTag` on publish |
| Editor | constrained toolbar + preview + Zod validation |

## Anti-patterns banned

- One HTML blob per page instead of typed, structured content.
- A raw-HTML editor box / `dangerouslySetInnerHTML` on un-sanitized client HTML (stored XSS).
- Sanitizing only on render instead of on write (dirty data persists).
- Re-uploading the same asset per record instead of referencing `Media`.
- Changing a published slug with no 301 redirect.
- Images saved with no alt text (Zod must require it).
- Proxying upload bytes through Next instead of presigned direct-to-bucket.
- Serving content with no `revalidateTag` on publish (stale pages).

## Cross-references

- **backend-admin-panel** — CRUD scaffold + role model for editing screens
- **infra-s3-uploads** — presigned-URL media upload, CORS, direct-to-bucket
- **stack-server-actions** — publish/save actions, `revalidateTag`
- **stack-zod-boundary** — required alt, field validation
- **security-review** — sanitize/authz/upload-safety review gate
- **stack-tailwind-tokens** — accessible default rendering
