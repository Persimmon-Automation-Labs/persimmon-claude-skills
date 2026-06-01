---
name: infra
description: Index of Persimmon infrastructure skills — Railway deploy and custom domains, S3-compatible presigned uploads, background-job orchestration, and GitHub Actions CI. Use when deploying, configuring hosting, wiring uploads, running long jobs, or setting up CI. Routes to the right specialist child skill. Trigger keywords: Railway, deploy, custom domain, upload, presigned URL, S3, bucket, CORS, background job, queue, cron, CI, GitHub Actions, workflow.
---

# Infra — Index

Persimmon infra = Railway (app + DB + bucket in one project), S3-compatible storage with presigned uploads, resumable background jobs, and a minimal GitHub Actions CI. This mother is a map; follow the child for the actual work.

## Trigger

- "Deploy this" / "custom domain" / "env vars"
- "File upload" / "presigned URL" / "bucket CORS"
- "Background job" / "long-running task" / "queue / cron"
- "Set up CI"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `infra-railway-deploy` | Project creation, deploy, domains | Railway project setup, env vars, custom domain, container port (8080), staged-config drift recovery |
| `infra-s3-uploads` | Any file upload flow | Presigned PUT flow, bucket CORS, multipart, content-type validation (Tigris/R2/S3) |
| `infra-background-jobs` | Work that can't finish in a request | Idempotent resumable pipelines on Railway (pg-boss / Inngest / cron) |
| `infra-github-ci` | CI pipeline | Minimal Next.js CI — lint, typecheck, `prisma validate`, build |

## How to route

1. **Deploying / hosting?** → `infra-railway-deploy`.
2. **Uploads?** → `infra-s3-uploads` (presigned PUT — never proxy bytes through Next).
3. **Long job?** → `infra-background-jobs` (idempotent + resumable).
4. **CI?** → `infra-github-ci`.

## Persimmon infra defaults — one-screen summary

- **Railway container port is `8080`** (from `PORT`). Public domain `targetPort` must match — not 3000.
- **Uploads**: server issues presigned URL → client PUTs directly to the bucket.
- **Bucket CORS** must include every uploading origin (`http://localhost:3000`, preview URLs, prod domains) via `PutBucketCorsCommand`, or uploads fail silently with `net::ERR_FAILED`.
- **Railway managed bucket** stays staged until the dashboard "Deploy" is committed once.
- **Staged-config drift**: committing an older draft reverts live mutations; Settings → Source → Disconnect → Reconnect drains the draft.
- **CD**: Railway auto-deploys on push to `main`. **CI**: lint, typecheck, `prisma validate`, build.

## Anti-patterns banned

- Public domain `targetPort` mismatched with `8080`
- Proxying upload bytes through Next instead of presigned PUT
- Missing CORS origins on the bucket
- Non-idempotent background jobs that can't resume
- Committing secrets — use Railway/GitHub env, never code

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `stack` | Deployed app code follows `stack` conventions |
| `data` | Railway hosts Postgres + pgvector |
| `security` | `infra-github-ci` runs the checks `security-review` relies on |
