---
name: frontend-print-pdf
description: Print and PDF generation for Persimmon Next.js 16 apps — invoices, receipts, contracts, legal filings, reports. Covers browser print (@media print + window.print() in a "use client" component), Tailwind v4 print: variants plus a dedicated print stylesheet, page-break utilities, repeating table headers, and when to escalate to true server-side PDF via @react-pdf/renderer or Playwright-rendered Route Handlers (for batch jobs, email attachments, archival). Use when adding "print this page", "save as PDF", "download PDF", a print stylesheet, page breaks, or server-generated PDF documents.
---

# Frontend Print / PDF — Persimmon Patterns

For invoices, receipts, contracts, legal filings, and reports. Two distinct mechanisms — pick by where the PDF is consumed:

1. **Browser print** — user clicks a button, the browser print dialog opens, they choose "Save as PDF". Zero server cost, zero new dependencies. Covers 95% of "let the user print/save this page" needs.
2. **Server-side PDF** — the server produces a `.pdf` byte stream. Required for email attachments, batch generation, archival to a bucket, or any flow where no human is at a browser.

Default to browser print. Escalate to server-side only when the consumer is a machine, a mailbox, or an archive.

## Core Rules

1. The page being printed is a normal RSC route. Only the **print trigger** (`window.print()`) needs a `"use client"` component — keep it a small leaf, not the whole page.
2. Print styles live in two places: Tailwind `print:` variants for per-element tweaks, and one dedicated `print.css` (imported once) for `@page`, table-header-group, and color-adjust rules that have no clean Tailwind variant.
3. Every interactive/chrome element gets `print:hidden`. Every print-only element gets `hidden print:block`.
4. Status badges and brand colors that must survive print get `print-color-adjust: exact` — Chrome strips backgrounds otherwise.
5. Multi-page tables get `thead { display: table-header-group }` so headers repeat. There is no Tailwind variant for this; it lives in `print.css`.
6. Server-side PDFs are **persisted, never regenerated on page load** — store the bytes in the bucket (see `infra-s3-uploads`) and serve a presigned URL. Regenerating an invoice PDF on every view is expensive and non-deterministic.
7. Never put PII or document contents in logs when generating server-side PDFs.

## Mechanism 1 — Browser print

### The print trigger (client component)

`window` is browser-only, so the button is the one `"use client"` island. The document itself stays an RSC.

```tsx
// src/components/PrintButton.tsx
"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm text-paper"
      >
        <Printer className="size-4" aria-hidden />
        Imprimir / Salvar PDF
      </button>
      <p className="mt-1 text-sm text-muted">
        Na caixa de impressão, escolha &ldquo;Salvar como PDF&rdquo; como destino.
      </p>
    </div>
  );
}
```

Safari hides the PDF option under a "PDF" dropdown bottom-left; the hint copy above is mandatory so those users find it.

### The printable page (RSC)

```tsx
// src/app/processes/[id]/invoice/page.tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/PrintButton";

// Reads DB + auth at request time — MANDATORY or the Railway build prerenders and fails.
export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();

  const invoice = await db.invoice.findFirst({
    where: { id, ownerId: session.user.id },
    include: { items: true, client: true },
  });
  if (!invoice) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <PrintButton />
      <article className="print-doc mt-6">{/* invoice markup, see skeleton */}</article>
    </main>
  );
}
```

### Tailwind v4 print layer + `print.css`

Tailwind's `print:` variant maps to `@media print`. Use it for per-element visibility and spacing. Put the rules that have no variant (`@page`, `table-header-group`, `print-color-adjust`) into a dedicated stylesheet imported once in the root layout.

```css
/* src/app/print.css — imported once in app/layout.tsx */
@media print {
  @page {
    size: A4;            /* or letter — override per document */
    margin: 15mm 12mm;
  }
  @page :first { margin-top: 8mm; }

  /* Kill UI noise the print: variant can't reach generically */
  * { box-shadow: none !important; text-shadow: none !important; }
  body { color: #000; }

  /* Preserve intentional color — Chrome strips backgrounds without this */
  .keep-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Repeat table headers across pages — no Tailwind variant exists */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  table { border-collapse: collapse; width: 100%; page-break-inside: auto; }
  tr, td, th { page-break-inside: avoid; }

  /* Don't orphan headings; keep blocks intact */
  h1, h2, h3 { page-break-after: avoid; }
  .signature-block, .totals-row, figure { page-break-inside: avoid; }

  /* Reveal an href after opt-in external links */
  a.print-url::after { content: " (" attr(href) ")"; font-size: 9pt; color: #555; }

  /* Page-break utilities */
  .page-break-before { page-break-before: always; }
  .page-break-after  { page-break-after: always; }
}
```

```tsx
// src/app/layout.tsx
import "./globals.css";
import "./print.css";
```

Per-element, prefer Tailwind variants over expanding `print.css`:

```tsx
<nav className="print:hidden">…</nav>
<aside className="print:hidden">…</aside>
<p className="hidden print:block">Confidential — generated {date}</p>
<span className="keep-color rounded-full bg-emerald-100 px-2 text-emerald-800">Pago</span>
<table className="print:text-[10pt]">…</table>
```

Color tokens (`bg-ink`, `text-paper`, badge colors) come from `stack-tailwind-tokens`. Print styles use absolute units (`pt`, `mm`) — tokens are for screen.

### Invoice / report skeleton

```tsx
<article className="print-doc">
  <header className="flex items-start justify-between">
    <img src="/logo.svg" alt="" width={160} className="h-12 w-auto" />
    <div className="text-right">
      <h1 className="text-xl">Fatura #INV-2026-0042</h1>
      <p className="text-sm">Emitida: 25/05/2026<br />Vencimento: 25/06/2026</p>
    </div>
  </header>

  <section className="mt-8 grid grid-cols-2 gap-6">
    <div><h2 className="text-sm font-semibold">Para</h2><p>Acme Ltda…</p></div>
    <div><h2 className="text-sm font-semibold">De</h2><p>Persimmon…</p></div>
  </section>

  <table className="mt-6">
    <thead>
      <tr><th>Descrição</th><th>Qtd</th><th>Valor</th><th className="text-right">Total</th></tr>
    </thead>
    <tbody>
      <tr><td>Análise processual</td><td>40</td><td>R$ 150</td><td className="text-right tabular-nums">R$ 6.000,00</td></tr>
    </tbody>
    <tfoot>
      <tr className="totals-row font-bold"><th colSpan={3}>Total</th><td className="text-right">R$ 6.000,00</td></tr>
    </tfoot>
  </table>

  <section className="signature-block mt-12">
    <p>Condições: 30 dias. Multa após o vencimento.</p>
    <div className="mt-8 flex gap-12">
      <p>Assinatura: ________________________</p>
      <p>Data: ___________</p>
    </div>
  </section>
</article>
```

The same markup is the screen view and the print view — one source of truth. Give `.print-doc` a `max-w-3xl mx-auto bg-white` on screen so the preview matches the printed page.

### Page-break decision tree

| Element | Rule | How |
|---|---|---|
| Section heading at page bottom | Don't orphan | `print.css` `h2,h3 { page-break-after: avoid }` |
| Totals row | Don't split from rows above | `.totals-row { page-break-inside: avoid }` |
| Signature block | Stay together | `.signature-block { page-break-inside: avoid }` |
| Table longer than a page | Repeat header | `thead { display: table-header-group }` |
| Cover page / appendix | Force a break | `.page-break-after` / `.page-break-before` |

## Mechanism 2 — Server-side PDF

Escalate only when no human is at a browser. Two Persimmon-fit options:

### Option A — `@react-pdf/renderer` (structured documents)

Build the PDF from React primitives (`Document`, `Page`, `View`, `Text`). Best when the layout is data-driven and tabular (invoices, statements, scorecards) and you don't need pixel parity with your web CSS. No headless browser, lower memory, runs in a Route Handler.

```tsx
// src/lib/pdf/invoice-pdf.tsx
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10 },
  row: { flexDirection: "row", justifyContent: "space-between" },
});

export async function renderInvoicePdf(invoice: {
  number: string;
  total: string;
}): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <Text>Fatura #{invoice.number}</Text>
          <Text>{invoice.total}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
```

```ts
// src/app/api/invoices/[id]/pdf/route.ts  — API route is correct here: byte stream, not a mutation
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const invoice = await db.invoice.findFirst({ where: { id, ownerId: session.user.id } });
  if (!invoice) return new Response("Not found", { status: 404 });

  const pdf = await renderInvoicePdf({ number: invoice.number, total: "R$ 6.000,00" });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fatura-${invoice.number}.pdf"`,
    },
  });
}
```

A Route Handler is the right home for PDF bytes — it's a non-mutation read returning a binary stream, exactly the carve-out from the Server-Actions rule.

### Option B — Playwright headless render (reuse your web CSS)

Render an existing print route to PDF with headless Chromium. Best when you want the PDF to look *exactly* like the browser-print output — same Tailwind, same `print.css`, one layout for screen + browser-print + server-PDF.

```ts
// src/lib/pdf/render-route.ts — runs on the Node runtime, NOT edge
import { chromium } from "playwright";

export async function renderRouteToPdf(url: string, cookie: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.context().addCookies([{ name: "next-auth.session-token", value: cookie, url }]);
    await page.goto(url, { waitUntil: "networkidle" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "15mm", bottom: "15mm" } });
  } finally {
    await browser.close();
  }
}
```

Railway caveats: Playwright needs the Chromium binary + system libs in the image (`npx playwright install --with-deps chromium` in the build) and meaningfully more memory than `@react-pdf/renderer`. Use the **Node** runtime, never edge. For batch jobs, run it from a queue worker, not inside a request that a user is waiting on.

### Picking A vs B

| Need | Pick |
|---|---|
| Data-driven invoice/statement, no CSS parity needed | A — `@react-pdf/renderer` |
| Must match the on-screen/browser-print layout exactly | B — Playwright |
| Lowest memory / no browser binary on Railway | A |
| Charts, complex CSS, web fonts already styled | B |
| One-off "print this page" for a logged-in user | Neither — browser print |

### Persist, don't regenerate

For anything emailed or archived: generate once, `PutObject` to the bucket, store the key, serve a presigned URL on subsequent views. See `infra-s3-uploads` for the bucket + presigned-URL flow. Regenerating on every request burns CPU and (for Playwright) a browser launch per view.

## One-Screen Defaults

- Default to **browser print** (`window.print()` in a tiny `"use client"` button).
- Printable page is a normal RSC with `export const dynamic = "force-dynamic"` if it reads DB/auth.
- Per-element print tweaks → Tailwind `print:` variants. `@page` / `table-header-group` / `print-color-adjust` → one imported `print.css`.
- `print:hidden` on chrome; `hidden print:block` on print-only; `.keep-color` + `print-color-adjust: exact` on badges.
- Server-side only when the consumer is a mailbox, a batch, or an archive. `@react-pdf/renderer` for structured docs; Playwright when you must match web CSS.
- Server-side PDFs: serve from a Route Handler, persist to the bucket, never regenerate on load, never log document contents.

## Anti-patterns banned

- Marking the whole printable page `"use client"` just to call `window.print()` — only the button needs it.
- Reaching for server-side PDF for a single per-user "print this page" — browser print is enough.
- A print stylesheet with no `@page { margin }` — default browser margins are too generous.
- Forgetting `thead { display: table-header-group }` — multi-page tables lose their headers.
- Forgetting `print-color-adjust: exact` on badges / brand bars — Chrome strips the backgrounds.
- Print button with no "Save as PDF" hint — Safari users can't find the option.
- Hardcoding `width: 210mm` on the document body — let `@page` own the sizing.
- Missing `page-break-inside: avoid` on totals rows / signature blocks — they split across pages.
- Generating a server-side PDF on every page view instead of persisting it to the bucket.
- Running Playwright on the edge runtime, or inside a request a user is waiting on for batch work.
- Using a Server Action to return PDF bytes — byte streams belong in a Route Handler.

## Cross-References

- `stack-tailwind-tokens` — color/spacing tokens used in the screen view; print uses absolute units.
- `frontend-page-templates` — the page shell the printable document lives inside.
- `infra-s3-uploads` — bucket + presigned-URL flow for storing generated server-side PDFs.
- `stack-server-actions` — why PDF byte streams use a Route Handler, not an action.

Sources: [MDN — page-break-inside](https://developer.mozilla.org/en-US/docs/Web/CSS/page-break-inside), [MDN — print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust), [Tailwind v4 — print variant](https://tailwindcss.com/docs/responsive-design#print-styles), [@react-pdf/renderer docs](https://react-pdf.org/), [Playwright — page.pdf()](https://playwright.dev/docs/api/class-page#page-pdf).
