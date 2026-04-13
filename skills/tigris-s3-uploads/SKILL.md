---
name: tigris-s3-uploads
description: Implement presigned-URL direct browser uploads to Tigris or any S3-compatible bucket for Persimmon projects. Use when adding file upload, PDF upload, image upload, configuring bucket CORS, handling ERR_FAILED upload errors, building presigned PUT or GET URLs, multipart upload for large files, or wiring the server-side storage.ts module. Trigger keywords — tigris, s3, presigned, bucket, CORS, PutBucketCorsCommand, upload, multipart, ERR_FAILED, @aws-sdk/client-s3, presigned url, direct upload, browser upload.
---

# Tigris / S3 Presigned-URL Upload Flow

## Design Rule (Non-Negotiable)

**The Next.js server NEVER proxies upload bytes.** Server issues a presigned PUT URL, client PUTs directly to the bucket. Proxying bytes through Next kills upload throughput, bursts memory, and hits serverless body-size limits.

Canonical flow:
1. Client calls Server Action `requestUploadUrl({ fileName, contentType, size })`.
2. Server validates (Zod), auth-checks, generates presigned PUT URL, records a pending DB row.
3. Client PUTs the file directly to the URL via **XHR** (need `onprogress`; fetch can't).
4. Client calls Server Action `confirmUpload({ key, dbRowId })`.
5. Server HEADs the object to verify size + contentType, marks DB row ready.

---

## 1. Bucket Creation

### Option A — Railway Managed Tigris (default for Persimmon)
See `railway-deploy` skill §4. Key gotcha: **click "Deploy" in the dashboard once** after creation, or the bucket stays staged and returns `NoSuchBucket` for hours.

### Option B — AWS CLI against Tigris or real S3
```bash
# Tigris
aws s3api create-bucket \
  --bucket <client>-prod \
  --endpoint-url https://fly.storage.tigris.dev \
  --region auto

# Verify
aws s3api head-bucket --bucket <client>-prod \
  --endpoint-url https://fly.storage.tigris.dev
```

Name convention: `<client>-<env>` (e.g., `piccino-prod`, `piccino-preview`). Never reuse prod buckets for previews.

---

## 2. CORS Configuration — THE #1 FAILURE MODE

If CORS is wrong, the browser fails the upload with `net::ERR_FAILED` and **zero server logs**. No 400, no 403. Just a dead XHR. Every Persimmon project has hit this. Configure CORS up front.

### Required origins
- `http://localhost:3000` (and `:3001` if that's the fallback port)
- Every Railway PR preview URL that uploads (wildcard where supported)
- Every production custom domain
- The `*.up.railway.app` URL (some clients bookmark it)

### Apply via `PutBucketCorsCommand`

Write a one-off script at `scripts/apply-cors.ts` and run with `tsx`:

```ts
// scripts/apply-cors.ts
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.TIGRIS_ENDPOINT_URL_S3!,
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  },
});

const origins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://<client>-web-production.up.railway.app",
  "https://sistema.<client>.com.br",
  // Add every preview URL that needs uploads, or accept per-preview CORS updates.
];

await s3.send(
  new PutBucketCorsCommand({
    Bucket: process.env.BUCKET_NAME!,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedOrigins: origins,
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "x-amz-version-id"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
);

console.log("CORS applied to", process.env.BUCKET_NAME, "for", origins.length, "origins");
```

Run:
```bash
railway run npx tsx scripts/apply-cors.ts
```

Re-run any time a new origin (new preview URL, new domain) needs uploads.

### Verify CORS

```bash
curl -v -X OPTIONS https://<endpoint>/<bucket>/test-key \
  -H "Origin: https://sistema.client.com.br" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
```
Expect `Access-Control-Allow-Origin` matching your origin. If the header is absent, CORS didn't apply.

---

## 3. `src/lib/storage.ts` — Canonical Module

All storage operations in the project go through this file. Never instantiate an S3 client anywhere else.

```ts
// src/lib/storage.ts
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.BUCKET_NAME!;
const ENDPOINT = process.env.TIGRIS_ENDPOINT_URL_S3!;

export const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  },
});

// Lazy bootstrap — useful for dev. Idempotent.
let bucketEnsured = false;
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  bucketEnsured = true;
}

export function buildKey(params: {
  userId: string;
  scope: string; // e.g., "processes", "avatars"
  fileName: string;
}): string {
  const safe = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${params.scope}/${params.userId}/${randomUUID()}/${safe}`;
}

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export function validateUploadRequest(input: {
  contentType: string;
  size: number;
}): void {
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new Error(`Unsupported content type: ${input.contentType}`);
  }
  if (input.size <= 0 || input.size > MAX_SIZE_BYTES) {
    throw new Error(`File size out of range: ${input.size}`);
  }
}

export async function presignedPutUrl(params: {
  key: string;
  contentType: string;
  size: number;
  expiresSeconds?: number;
}): Promise<string> {
  await ensureBucket();
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.size,
  });
  return getSignedUrl(s3, cmd, { expiresIn: params.expiresSeconds ?? 900 });
}

export async function presignedGetUrl(params: {
  key: string;
  expiresSeconds?: number;
  filename?: string; // triggers Content-Disposition: attachment
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    ResponseContentDisposition: params.filename
      ? `attachment; filename="${params.filename}"`
      : undefined,
  });
  // Short TTL — enough to hand to the browser.
  return getSignedUrl(s3, cmd, { expiresIn: params.expiresSeconds ?? 300 });
}

export async function verifyObject(key: string): Promise<{
  size: number;
  contentType: string;
}> {
  const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return {
    size: res.ContentLength ?? 0,
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

---

## 4. Server Action — `requestUploadUrl`

```ts
// src/lib/process-actions.ts
"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildKey, presignedPutUrl, validateUploadRequest } from "@/lib/storage";

const RequestUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function requestUploadUrl(
  input: z.infer<typeof RequestUploadSchema>
): Promise<{ uploadUrl: string; key: string; fileId: string }> {
  const parsed = RequestUploadSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthenticated");

  validateUploadRequest({ contentType: parsed.contentType, size: parsed.size });

  const key = buildKey({
    userId: session.user.id,
    scope: "processes",
    fileName: parsed.fileName,
  });

  const file = await db.processFile.create({
    data: {
      userId: session.user.id,
      key,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      size: parsed.size,
      status: "PENDING",
    },
  });

  const uploadUrl = await presignedPutUrl({
    key,
    contentType: parsed.contentType,
    size: parsed.size,
    expiresSeconds: 900, // 15 min — enough for a large PDF
  });

  return { uploadUrl, key, fileId: file.id };
}

const ConfirmUploadSchema = z.object({
  fileId: z.string().uuid(),
  key: z.string().min(1),
});

export async function confirmUpload(
  input: z.infer<typeof ConfirmUploadSchema>
): Promise<{ ok: true }> {
  const parsed = ConfirmUploadSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthenticated");

  const file = await db.processFile.findFirst({
    where: { id: parsed.fileId, userId: session.user.id, key: parsed.key },
  });
  if (!file) throw new Error("File not found");

  const { size, contentType } = await verifyObject(parsed.key);
  if (size !== file.size) throw new Error("Size mismatch");
  if (contentType !== file.contentType) throw new Error("Content type mismatch");

  await db.processFile.update({
    where: { id: file.id },
    data: { status: "READY" },
  });
  return { ok: true };
}
```

---

## 5. Client Uploader Component — XHR, NOT fetch

**fetch has no `onprogress`.** For any upload > a few MB, progress UX is non-negotiable. Use XHR.

```tsx
// src/components/uploader.tsx
"use client";

import { useState } from "react";
import { requestUploadUrl, confirmUpload } from "@/lib/process-actions";

export function Uploader({ onUploaded }: { onUploaded: (fileId: string) => void }) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setProgress(0);

    try {
      const { uploadUrl, key, fileId } = await requestUploadUrl({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      await putViaXhr(uploadUrl, file, (pct) => setProgress(pct));

      await confirmUpload({ fileId, key });
      onUploaded(fileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div>
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {progress > 0 && progress < 100 && <progress value={progress} max={100} />}
      {error && <p className="text-oxblood">{error}</p>}
    </div>
  );
}

function putViaXhr(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed (network / CORS). Check bucket CORS config."));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(file);
  });
}
```

---

## 6. Multipart Uploads (> 100 MB)

For files over ~100 MB, use multipart so a mid-upload network blip doesn't nuke the whole transfer.

### Server — initiate, sign per-part, complete

```ts
// src/lib/storage-multipart.ts
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./storage";

const BUCKET = process.env.BUCKET_NAME!;
const PART_SIZE = 10 * 1024 * 1024; // 10 MB

export async function initiateMultipart(params: {
  key: string;
  contentType: string;
}): Promise<{ uploadId: string; partCount: number; partSize: number; size?: never }> {
  const res = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: params.key,
      ContentType: params.contentType,
    })
  );
  return { uploadId: res.UploadId!, partCount: 0, partSize: PART_SIZE };
}

export async function signPart(params: {
  key: string;
  uploadId: string;
  partNumber: number;
}): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: BUCKET,
    Key: params.key,
    UploadId: params.uploadId,
    PartNumber: params.partNumber,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 900 });
}

export async function completeMultipart(params: {
  key: string;
  uploadId: string;
  parts: { PartNumber: number; ETag: string }[];
}): Promise<void> {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: { Parts: params.parts },
    })
  );
}

export async function abortMultipart(params: {
  key: string;
  uploadId: string;
}): Promise<void> {
  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: params.key,
      UploadId: params.uploadId,
    })
  );
}
```

Client slices the File with `file.slice(start, end)`, PUTs each slice to its presigned URL, collects ETags from `xhr.getResponseHeader("ETag")`, then calls complete. ALWAYS wrap in try/finally that calls `abortMultipart` on failure — unterminated multipart uploads bill for storage until manually aborted.

---

## 7. Presigned Downloads

For private files, generate a short-TTL GET URL at request time. Never store presigned URLs in the DB.

```ts
// src/app/(authed)/processes/[id]/page.tsx
import { presignedGetUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ProcessPage({ params }: { params: { id: string } }) {
  // ... auth + ownership check
  const file = await db.processFile.findFirstOrThrow({ where: { id: params.id } });
  const downloadUrl = await presignedGetUrl({
    key: file.key,
    expiresSeconds: 300,
    filename: file.fileName,
  });
  return <a href={downloadUrl}>Download {file.fileName}</a>;
}
```

Refresh on every page load (the URL expires). Do NOT ship the URL to the client as a stable ID.

---

## 8. Troubleshooting

### `net::ERR_FAILED` with no server log
- CORS missing for the current origin. Re-run `apply-cors.ts` with the new origin added.
- Verify with `curl -v -X OPTIONS ...` from §2.

### `NoSuchBucket` on first request
- Railway managed bucket staged but not deployed. Click **Deploy** in dashboard.
- Or run `ensureBucket()` once from a Server Action to bootstrap.

### `SignatureDoesNotMatch` on PUT
- Content-Type on the XHR doesn't match the Content-Type used to sign the URL.
- Fix: pass the exact same `contentType` to `requestUploadUrl` and `xhr.setRequestHeader`.

### `EntityTooLarge`
- File exceeds `MAX_SIZE_BYTES` or exceeds Tigris's hard multipart limit (5 TB per object, 5 GB per single-part PUT).
- Fix: enforce `MAX_SIZE_BYTES` server-side; switch to multipart above 100 MB.

### HEAD returns size 0 after successful PUT
- Eventual consistency window (rare on Tigris, common on some S3-compatibles).
- Fix: retry the HEAD with 1s backoff, up to 3 times.

### `AccessDenied` on GET with valid presigned URL
- Clock skew between server and Tigris. Check server time.
- Or the object was written to a different bucket (e.g., dev accidentally wrote to prod).

### Upload succeeds but confirmUpload mismatches
- Browser coerced the Content-Type (e.g., `application/pdf` → `application/x-pdf`).
- Fix: accept a small allow-list in `validateUploadRequest` and normalize before storing.

### Stale multipart uploads billing you
- `aws s3api list-multipart-uploads --bucket <bucket>` then abort each.
- Add a lifecycle rule to auto-abort incomplete multipart > 7 days.

---

## 9. Checklist Before Shipping

- [ ] `src/lib/storage.ts` is the only place that imports `@aws-sdk/client-s3`.
- [ ] CORS applied and verified via `curl -X OPTIONS`.
- [ ] `requestUploadUrl` validates via Zod and auth-checks.
- [ ] `confirmUpload` HEAD-verifies size + contentType before marking READY.
- [ ] Uploader uses XHR (not fetch) for progress UX.
- [ ] Max file size enforced server-side.
- [ ] Content-type allow-list enforced server-side.
- [ ] Presigned GET TTL ≤ 5 min.
- [ ] Every preview + custom domain origin added to CORS.
- [ ] Multipart lifecycle rule configured (auto-abort > 7 days).
