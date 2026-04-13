---
name: railway-deploy
description: Deploy Persimmon Next.js 16 projects to Railway. Use when setting up a new Railway project, linking a GitHub repo, provisioning Postgres or a managed Tigris bucket, configuring env vars, wiring a custom domain, recovering from staged-config drift, or debugging a failed Railway build or deploy. Trigger keywords — railway, deploy, PORT 8080, force-dynamic, railway.toml, railway variables, custom domain, Tigris bucket, managed bucket, serviceConnect, staged config, deployment trigger, prisma db push on deploy.
---

# Railway Deployment for Persimmon Projects

## CRITICAL — Read Before Touching Railway

1. **Next 16 prerenders by default.** Any page that reads the DB or `auth()` MUST export `const dynamic = "force-dynamic"`. Otherwise the build container has no DB network path and the build crashes.
2. **Default container port is 8080**, not 3000. The custom domain `targetPort` must match.
3. **Railway writes config into per-environment drafts.** Older drafts can revert newer mutations if committed. When automation silently stops, `Settings → Source → Disconnect → Reconnect` drains the draft.
4. **Managed buckets stay staged** after API creation until the dashboard "Deploy" is clicked once. After the first manual deploy, automation works.
5. **NextAuth v5 behind Railway's edge requires `trustHost: true`** in `auth.ts` and `x-forwarded-host` in middleware redirects. Otherwise prod users bounce to `*.up.railway.app`.

If any of these surprise you, stop and re-read them before continuing.

---

## 0. Prerequisites

```bash
# Install CLI
npm i -g @railway/cli

# Authenticate (opens browser)
railway login

# Verify
railway whoami
```

You must be a member of the Persimmon-Automation-Labs team in Railway. Ask the project lead to invite you if `railway list` doesn't show the team's projects.

---

## 1. Create a Railway Project

Do this from the local repo root.

```bash
cd <repo-root>
railway init
```

Prompts:
- **Team**: `Persimmon Automation Labs`
- **Project name**: `<client>-web` (e.g., `piccino-web`, `aslan-web`). Never generic names.
- **Environment**: `production` (default). Staging is added later as needed.

This writes `.railway/project.json` — commit this to git. Subsequent CLI calls auto-resolve the project from it.

Verify:
```bash
railway status
```

---

## 2. Link GitHub Repo for Auto-Deploy

Do this in the Railway dashboard the first time. CLI alone doesn't wire webhooks reliably.

1. Open the Railway project in the dashboard.
2. Click the service → **Settings → Source → Connect Repo**.
3. Select the Persimmon-Automation-Labs GitHub org and the repo.
4. **Production branch**: `main`.
5. **Root directory**: leave blank unless the repo is a monorepo.
6. **PR previews**: enable (creates an ephemeral environment per PR, inherits production env vars by default — override sensitive ones).

Verify the webhook by pushing a trivial commit to main and watching the **Deployments** tab pick it up within ~30 seconds.

### If auto-deploy silently stops after a repo transfer

This is the `serviceConnect` / `deploymentTriggerUpdate` drift bug. Fix:

1. **Settings → Source → Disconnect**.
2. Click **Deploy** on the dashboard to flush the staged draft.
3. **Settings → Source → Connect Repo** again, pointing to the new location.
4. Push a commit to main, confirm a new deploy triggers.

Do NOT just update the trigger via API — the draft baseline will revert your live config the next time it commits.

---

## 3. Provision Postgres

```bash
railway add
```
Select **PostgreSQL**. Railway spins up the DB and auto-injects `DATABASE_URL` into every service in the same environment via reference variables.

**DO NOT copy the literal URL into `.env.production`.** Use Railway's service reference so password rotation is transparent:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Add the `pgvector` extension (required for any RAG project):

```bash
railway connect Postgres
```
Inside the psql session:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

Then push the Prisma schema:
```bash
railway run npx prisma db push
```
`railway run` executes locally but injects the service's env vars, so `DATABASE_URL` resolves to the Railway Postgres.

---

## 4. Provision a Tigris Managed Bucket

Railway's managed Tigris integration is S3-compatible. Creation order matters:

1. Dashboard → **+ New → Database → Tigris** (or `railway add` if the CLI exposes it — as of writing, use the dashboard).
2. **Click Deploy once in the dashboard.** The bucket will not provision until this manual deploy commits the staged config. Skipping this step means every `@aws-sdk/client-s3` call will `NoSuchBucket` for hours with no obvious cause.
3. Railway injects these into the app service:
   - `TIGRIS_ACCESS_KEY_ID`
   - `TIGRIS_SECRET_ACCESS_KEY`
   - `TIGRIS_ENDPOINT_URL_S3` (e.g., `https://fly.storage.tigris.dev`)
   - `BUCKET_NAME`
4. Configure CORS on the bucket via the `tigris-s3-uploads` skill — Railway does NOT do this for you.

---

## 5. Env Vars — File-Based Sync

Manage env vars via a committed-but-gitignored `.env.railway` file so the state is reproducible.

### Pattern

```bash
# .env.railway (gitignored)
# Server-side only. Never prefix with NEXT_PUBLIC_.
ANTHROPIC_API_KEY=sk-ant-xxx
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://sistema.client.com.br
NEXTAUTH_TRUST_HOST=true
NODE_ENV=production

# Reference variables (do NOT hardcode — Railway resolves these)
DATABASE_URL=${{Postgres.DATABASE_URL}}
TIGRIS_ACCESS_KEY_ID=${{Tigris.TIGRIS_ACCESS_KEY_ID}}
TIGRIS_SECRET_ACCESS_KEY=${{Tigris.TIGRIS_SECRET_ACCESS_KEY}}
TIGRIS_ENDPOINT_URL_S3=${{Tigris.TIGRIS_ENDPOINT_URL_S3}}
BUCKET_NAME=${{Tigris.BUCKET_NAME}}
```

### Sync to Railway

```bash
# Set one at a time
railway variables --set "ANTHROPIC_API_KEY=sk-ant-xxx"

# Bulk load from file (recommended)
set -a; source .env.railway; set +a
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  railway variables --set "$key=$value"
done < .env.railway
```

### Copy between environments (prod → preview)

```bash
railway variables --environment production --kv > prod.env
railway variables --environment preview --set-from-file prod.env
# Then manually override sensitive vars for preview (e.g., ANTHROPIC_API_KEY with a separate dev key)
```

### Gitignore rule

Add to `.gitignore`:
```
.env.railway
.env.railway.*
```

---

## 6. Build & Start Commands

Set these in the service **Settings → Build** and **Settings → Deploy**. Or commit them in `railway.toml` (preferred).

### Build command
```
npx prisma generate && npm run build
```
`prisma generate` MUST run before `next build`. Otherwise Next's typecheck fails on missing `@prisma/client` types.

If you use `prisma db push` on deploy (for small projects without proper migrations):
```
npx prisma generate && npx prisma db push --accept-data-loss && npm run build
```
`--accept-data-loss` is required for non-interactive runs. Only use this pattern if you've decided per-project that migrations are overkill. Otherwise run `prisma migrate deploy` in a separate Railway one-off job.

### Start command
```
npx next start -p $PORT
```

**`$PORT` is 8080 on Railway, not 3000.** Hardcoding `-p 3000` makes the container healthcheck fail and Railway marks the deploy as "Crashed" within 2 minutes.

---

## 7. `railway.toml` Template

Commit this at the repo root. Settings here override the dashboard on every deploy, so the dashboard and the file must not drift.

```toml
# railway.toml — Persimmon Next.js 16 default

[build]
builder = "NIXPACKS"
buildCommand = "npx prisma generate && npm run build"
watchPatterns = ["**/*.ts", "**/*.tsx", "prisma/schema.prisma"]

[deploy]
startCommand = "npx next start -p $PORT"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
numReplicas = 1

[deploy.multiRegionConfig]
# Single-region until client needs otherwise. us-east4 is cheapest latency for Brazilian clients on Railway.
"us-east4-eqdc4a" = { numReplicas = 1 }
```

Add a `/api/health` route that returns 200 without touching the DB:

```ts
// src/app/api/health/route.ts
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ ok: true, ts: Date.now() });
}
```

Health checks that hit the DB will create a thundering herd on cold start — keep them dumb.

---

## 8. Custom Domain

```bash
railway domain
```
Prompt: **Add custom domain** → enter e.g. `sistema.client.com.br`. Railway gives you a CNAME target like `hdg8e7wz.up.railway.app`.

At the DNS provider (usually Registro.br or the client's DNS panel):
```
sistema.client.com.br  CNAME  hdg8e7wz.up.railway.app.  300
```

Railway provisions a Let's Encrypt cert within ~2 minutes of CNAME propagation. Verify with:
```bash
curl -I https://sistema.client.com.br
# Expect HTTP/2 200 and valid cert chain
```

### If the domain shows `*.up.railway.app` instead of itself

Check middleware — the redirect URL must use `x-forwarded-host`:

```ts
// middleware.ts
const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
const proto = req.headers.get("x-forwarded-proto") ?? "https";
return NextResponse.redirect(new URL("/login", `${proto}://${host}`));
```

Also check `auth.ts`:
```ts
export const authConfig = {
  trustHost: true,  // REQUIRED on Railway
  // ...
};
```

And `NEXTAUTH_URL` must be the custom domain, not the Railway internal URL.

---

## 9. `dynamic = "force-dynamic"` Rule

This is the single biggest cause of Railway build failures on Next 16 projects.

**Every page or route handler that reads the DB or session at request time needs:**

```ts
// src/app/(authed)/dashboard/page.tsx
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const stats = await db.process.count({ where: { userId: session.user.id } });
  return <Dashboard stats={stats} />;
}
```

Pages that are safe WITHOUT `force-dynamic`:
- `/login` — static, no auth call
- `/api/health` — but still add it for safety
- Purely presentational pages with no `auth()` or `db.*`

### Audit command
Before pushing, run this grep to find unprotected DB/auth pages:

```bash
grep -rL 'dynamic = "force-dynamic"' src/app \
  | xargs grep -l 'from "@/lib/db"\|from "@/lib/auth"' \
  | grep -v node_modules
```
Any file printed is a build-failure risk.

---

## 10. PR Previews

With PR previews enabled (step 2), every PR gets its own ephemeral environment at `https://<pr-hash>-<service>-pr-preview.up.railway.app`.

### Env var inheritance
- Non-sensitive vars inherit from production by default.
- Sensitive vars (`ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, DB URLs to prod DB) — **override in the preview environment** so PRs don't hit prod data.

### Shared preview DB pattern
Provision a second Postgres named `Postgres-Preview`. In the preview environment, set:
```
DATABASE_URL=${{Postgres-Preview.DATABASE_URL}}
```
This isolates preview writes from production.

### CORS for previews
Every preview URL that uploads files must be added to the Tigris bucket CORS list. See `tigris-s3-uploads` skill — use a wildcard like `https://*-pr-preview.up.railway.app` where supported, or accept the cost of updating CORS per long-lived preview.

---

## 11. Logs

```bash
# Tail app service logs
railway logs

# Specific service
railway logs --service piccino-web

# Build logs from last deployment
railway logs --deployment
```

Filter locally:
```bash
railway logs | grep -i "error\|prisma\|anthropic"
```

For persistent log inspection, use Railway's **Observability** tab — it retains 7 days on the Team plan.

---

## 12. Troubleshooting

### Build fails: `PrismaClientInitializationError: Can't reach database server`
- **Cause**: A page is prerendering during build and trying to hit the DB.
- **Fix**: Add `export const dynamic = "force-dynamic"` to the offending file. The build log names the file. Audit with the grep in §9.

### Container crashes: `Error: listen EADDRINUSE: address already in use :::3000`
- **Cause**: Start command hardcoded `-p 3000`. Railway already bound 8080 to the edge.
- **Fix**: Change to `npx next start -p $PORT`.

### Container crashes: `healthcheck failed after 30s`
- **Cause**: `/api/health` does a DB roundtrip and the DB is warming up, OR the health path doesn't exist.
- **Fix**: Make `/api/health` return 200 without external calls. Or raise `healthcheckTimeout` to 60 in `railway.toml`.

### Custom domain serves the `*.up.railway.app` cert
- **Cause**: DNS hasn't propagated, or the CNAME points to the wrong Railway target.
- **Fix**: `dig sistema.client.com.br CNAME` and verify it matches Railway's target exactly. Wait 10 minutes after a DNS change. Force re-issuance by removing and re-adding the domain.

### Managed bucket returns `NoSuchBucket`
- **Cause**: Bucket was created via API but the dashboard "Deploy" was never clicked, so it's stuck in staged state.
- **Fix**: Open the dashboard, click **Deploy** on the bucket service, wait 1 minute, retry.

### Browser upload fails `net::ERR_FAILED` with no server log
- **Cause**: Tigris CORS doesn't include the origin.
- **Fix**: See `tigris-s3-uploads` skill. Add the origin and re-run `PutBucketCorsCommand`.

### Auto-deploy stopped working after repo transfer
- **Cause**: `serviceConnect` / `deploymentTriggerUpdate` draft drift.
- **Fix**: **Settings → Source → Disconnect → Reconnect**. Do not try to API-patch it.

### Env vars reverted after a bucket creation
- **Cause**: A stale draft was committed, reverting your live var edits to the draft baseline.
- **Fix**: Disconnect/Reconnect to drain the draft, re-sync vars from `.env.railway`.

### Prisma client cache stale after `db push`
- **Cause**: The running container has the pre-push generated client.
- **Fix**: Redeploy. Locally: restart `npm run dev`.

### `UntrustedHost` error in prod logs
- **Cause**: NextAuth v5 without `trustHost: true`.
- **Fix**: Set `trustHost: true` in `auth.ts` config, also set `NEXTAUTH_URL` to the custom domain.

### `next start` exits immediately on deploy
- **Cause**: `.next/` wasn't produced — build silently skipped. Usually the build command is wrong or `next build` errored earlier.
- **Fix**: Read the full build log, confirm `✓ Compiled successfully` appears, confirm the build command includes `npm run build` (or `next build`).

---

## 13. Post-Deploy Verification Checklist

- [ ] `curl -I https://<custom-domain>` → HTTP/2 200, valid cert
- [ ] `/api/health` → 200 JSON
- [ ] `/login` renders
- [ ] Signed-in user can reach a DB-reading page without 500
- [ ] File upload works end-to-end (if storage wired)
- [ ] `railway logs` shows no recurring errors
- [ ] Auto-deploy: push a trivial commit, confirm new deploy within 30s
- [ ] PR preview: open a PR, confirm preview env spins up
- [ ] Custom domain redirects preserve host (no `*.up.railway.app` leaks)

Only mark the project "deployed" when every box is checked.
