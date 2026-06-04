---
name: frontend-file-upload
description: React drop-zone file-upload UX for Persimmon — drag-and-drop with overlaid native input, instant image preview via URL.createObjectURL, client-side UX validation, accessible remove buttons, and upload progress. Built on top of the presigned-S3-PUT flow (the bucket/CORS/presign/confirm mechanics live in infra-s3-uploads). Use when adding any file input beyond a bare browser default, building a drag-and-drop zone, previewing images before upload, or wiring the client UX onto a presigned upload. Trigger keywords — drop zone, drag and drop, file upload UI, image preview, createObjectURL, dropzone, upload progress bar.
---

# File Upload — Persimmon Patterns

This skill owns the **React client UX** of file upload: the drop zone, preview, validation feedback, and progress bar. It sits on top of the presigned-PUT flow — **the bucket, CORS, presigned URL generation, the `requestUploadUrl`/`confirmUpload` Server Actions, and the XHR-with-progress upload all live in `infra-s3-uploads`**. Read that first; this skill is the front end that calls it. Tailwind tokens come from `stack-tailwind-tokens`; server-side content-type/size validation is enforced server-side per `infra-s3-uploads` + `stack-zod-boundary`.

## Where the boundary is

| Concern | Owned by |
|---|---|
| Drop zone, drag-over states, preview, remove button, client UX validation | **this skill** |
| Presigned PUT URL, bucket CORS, key format, `confirmUpload` HEAD check, server content-type validation | `infra-s3-uploads` |
| The XHR upload call with `onprogress` | `infra-s3-uploads` (this skill renders the bar it drives) |

Never proxy upload bytes through Next — the client PUTs directly to the bucket. That rule is `infra-s3-uploads`'s; this skill assumes it.

## The drop-zone pattern — overlaid native input

The whole component is `"use client"`. The native `<input type="file">` is positioned absolutely over the zone at `opacity-0`, full-bleed — this gives native click, keyboard activation, and screen-reader semantics for free (and satisfies WCAG 2.5.7 Dragging Movements: there's always a click/keyboard alternative). The visible content is `pointer-events-none` so clicks pass through to the input.

```tsx
// src/components/upload-dropzone.tsx
"use client";
import { useRef, useState, useCallback } from "react";
import { UploadCloud } from "lucide-react";

export function UploadDropzone({ onFile, accept = "application/pdf", hint = "PDF, máx. 10 MB" }: {
  onFile: (file: File) => void;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback((file: File | undefined) => {
    if (!file) return;
    // Client validation is UX-only — the server re-validates (infra-s3-uploads).
    if (file.size > 10 * 1024 * 1024) { setError("Arquivo muito grande (máx. 10 MB)."); return; }
    if (accept === "application/pdf" && file.type !== "application/pdf") { setError("Apenas PDF."); return; }
    setError(null);
    setName(file.name);
    onFile(file);
  }, [accept, onFile]);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}   // #1 bug: without preventDefault, drop never fires
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files[0]); }}
      className={`relative flex min-h-32 items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors focus-within:border-stone-900 ${
        dragOver ? "border-stone-900 bg-stone-50" : "border-stone-300 bg-stone-50/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        required
        aria-describedby="upload-hint"
        onChange={(e) => handle(e.target.files?.[0])}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <div className="pointer-events-none text-center">
        <UploadCloud aria-hidden className="mx-auto mb-3 size-10 text-stone-400" />
        <p className="font-medium">Arraste um PDF aqui ou clique para selecionar</p>
        <p id="upload-hint" className="text-sm text-stone-500">{hint}</p>
        {name && <p role="status" aria-live="polite" className="mt-3 font-medium">{name}</p>}
        {error && <p role="alert" className="mt-3 font-medium text-oxblood">{error}</p>}
      </div>
    </div>
  );
}
```

Notes vs the legacy vanilla version:
- React event handlers replace `addEventListener`. `e.preventDefault()` on `onDragOver` is still the #1 bug to avoid — without it the browser navigates and `onDrop` never fires.
- No `DataTransfer` round-trip is needed when uploading via presigned PUT — you hold the `File` object in state and hand it straight to the XHR. (The `DataTransfer`-into-`<input>.files` trick is only needed if you submit a real multipart `<form>`.)

## Wiring to the presigned upload

Pass the `File` to the `infra-s3-uploads` flow. That skill exposes the Server Actions and the XHR helper; this component owns the progress bar UI it drives.

```tsx
"use client";
import { useState } from "react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { uploadViaPresignedUrl } from "@/lib/upload-client"; // from infra-s3-uploads
import { toast } from "sonner";

export function ProcessUpload({ processId }: { processId: string }) {
  const [pct, setPct] = useState<number | null>(null);

  async function onFile(file: File) {
    setPct(0);
    try {
      await uploadViaPresignedUrl(file, { processId, onProgress: setPct }); // XHR + confirmUpload inside
      toast.success("Upload concluído.");
    } catch {
      toast.error("Falha no upload.");
    } finally {
      setPct(null);
    }
  }

  return (
    <div className="space-y-3">
      <UploadDropzone onFile={onFile} />
      {pct !== null && (
        <div className="h-2 w-full overflow-hidden rounded bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-stone-900 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
```

`fetch` cannot report upload progress — `uploadViaPresignedUrl` uses XHR (see `infra-s3-uploads`). Multi-file uploads run **sequentially** by default.

## Image preview — `URL.createObjectURL`, always revoke

`createObjectURL` is far faster than `FileReader.readAsDataURL` (no base64 inflation). In React, revoke in an effect cleanup so you never leak object URLs.

```tsx
"use client";
import { useEffect, useState } from "react";

export function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl); // cleanup = revoke
  }, [file]);

  if (!url) return null;
  return <img src={url} alt={file.name} className="size-20 rounded object-cover" />;
}
```

- Thumbnail: 80×80 (`size-20`), `object-cover`.
- Multi-file grid: `grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3`.
- Non-image preview: filename + size + an extension badge (PDF/DOC/XLS) on a neutral tile — skip generic file icons.
- Remove button: small `×`, `aria-label={`Remover ${file.name}`}` — always include the filename.

## Multi-file vs single-file

- `multiple` on the input for multi; render a thumbnail grid instead of one filename.
- Cap visible thumbnails at ~12; collapse the rest behind "+N mais".
- Folder upload (`webkitdirectory`) only on explicit bulk-import flows, behind a secondary link.
- Mobile camera: a separate `capture="environment"` input (iOS strips `multiple` for camera anyway).

## Validation — client is UX, server is truth

Client checks (`accept`, `file.size`, image dimensions) exist **only to give fast feedback** — they're trivially bypassed. The real gate is server-side in `infra-s3-uploads`: the `confirmUpload` action HEADs the object and validates true content-type and size against a Zod schema, and the storage key is validated against the exact presigned-key regex so a malicious client can't point a DB row at someone else's object. Never treat the client `file.type` as security.

```tsx
// Optional: image dimension check, client-side UX only
const img = new Image();
img.onload = () => { if (img.naturalWidth < 200) setError("Imagem muito pequena."); URL.revokeObjectURL(img.src); };
img.src = URL.createObjectURL(file);
```

## Accessibility — non-negotiable

- Real `<input type="file">` — never a fake styled `<div>`.
- `opacity-0` overlay, **not** `display:none` / `hidden` (those kill keyboard access).
- Visible focus ring via `focus-within:` on the zone.
- Constraints linked with `aria-describedby="upload-hint"`.
- `role="status"` announces the selected file; errors via `role="alert"` AND text (never color/icon alone).
- Remove buttons name the file (`Remover invoice.pdf`).
- Progress bar: `role="progressbar"` + `aria-valuenow/min/max`.

## One-screen defaults

- One `"use client"` `UploadDropzone` with overlaid native input.
- Hold the `File` in state; hand to `infra-s3-uploads`' presigned flow.
- Preview via `createObjectURL` + revoke in effect cleanup.
- Progress bar driven by XHR `onProgress`; sequential for multi-file.
- Client validation = UX hint; server re-validates content-type + size + key.

## Anti-patterns banned

- Missing `e.preventDefault()` on `onDragOver` (drop silently fails — the #1 bug).
- `display:none` / `hidden` on the file input (kills keyboard accessibility — use `opacity-0`).
- Fake drop zone (`<div>`) with no overlaid input.
- Trusting client `file.type` for security (server HEAD-validates — `infra-s3-uploads`).
- Leaking object URLs (every `createObjectURL` needs a `revokeObjectURL` in cleanup).
- Loading a 50 MB image into a preview (check `file.size` first; show a file tile).
- Proxying upload bytes through a Next API route (presigned PUT direct to bucket).
- Color/icon-only error feedback (must include text + live region).
- Remove button labeled "Remover" alone (name the file).

## When NOT to use this skill

- A plain picker with no preview/drag-drop → a styled `<input type="file">` from `frontend-internal-tool-conventions` is enough.
- Bucket setup, CORS, presigned URLs, the upload mechanics → `infra-s3-uploads`.

## Relationship to other skills

| Skill | Connection |
|---|---|
| `infra-s3-uploads` | Owns the presigned PUT flow, CORS, `confirmUpload`, server validation this UX rides on |
| `stack-tailwind-tokens` | Drop-zone color/spacing tokens |
| `stack-zod-boundary` | Server-side file-metadata validation schema |
| `frontend-feedback-system` | Toast for upload success/error |
| `frontend-internal-tool-conventions` | Input baseline for non-upload inputs |

Sources: [MDN File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications), [USWDS file input accessibility](https://designsystem.digital.gov/components/file-input/accessibility-tests/), [createObjectURL vs FileReader](https://www.andygup.net/performance-comparison-between-readasdataurl-and-createobjecturl/), [WCAG 2.2 Drag-and-Drop](https://orases.com/blog/wcag-2-2-drag-and-drop-accessibility/), [React — Synchronizing with Effects (cleanup)](https://react.dev/learn/synchronizing-with-effects).
