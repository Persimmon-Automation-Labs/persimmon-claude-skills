---
name: github-actions-ci
description: Minimal GitHub Actions CI for Persimmon Next.js 16 projects. Use when setting up CI for a new client repo, adding lint/typecheck/build checks, configuring Dependabot, wiring branch protection, caching .next between runs, adding CodeQL, or debugging a red CI check. Trigger keywords — github actions, ci, workflow, ci.yml, dependabot, codeql, branch protection, prisma validate, tsc noemit, npm ci, cache, concurrency, DATABASE_URL in CI, lint typecheck build.
---

# GitHub Actions CI for Persimmon Projects

## Philosophy

CI proves the code builds and passes static checks. It does NOT deploy — Railway does that on push to `main`. Keep CI fast, deterministic, and secret-free.

**CI responsibilities:**
- Lint (ESLint).
- Typecheck (`tsc --noEmit`).
- Validate Prisma schema (`prisma validate`).
- Build (`next build`).

**CI non-responsibilities:**
- Deploying anything.
- Running migrations.
- Talking to the real DB or Anthropic API.
- Running E2E tests against prod.

If a Persimmon CI check needs real secrets, you've either added the wrong check or you should move it to a post-deploy smoke test running on Railway itself.

---

## 1. Canonical `.github/workflows/ci.yml`

Commit this at the repo root. Works as-is for any Persimmon Next.js 16 + Prisma project.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

# Cancel stale PR runs when a new commit is pushed to the same PR.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    name: Lint / Typecheck / Build
    runs-on: ubuntu-latest
    timeout-minutes: 15

    # Dummy env vars so next build + prisma generate don't complain.
    # CI never connects to real services.
    env:
      # Prisma requires a URL to generate, but not to connect.
      DATABASE_URL: "postgresql://noop:noop@localhost:5432/noop?schema=public"
      # NextAuth requires these at build time even if not exercised.
      NEXTAUTH_SECRET: "ci-dummy-secret-do-not-use-in-prod-ci-dummy-secret"
      NEXTAUTH_URL: "http://localhost:3000"
      NEXTAUTH_TRUST_HOST: "true"
      # Anthropic — never called during build, dummy is fine.
      ANTHROPIC_API_KEY: "sk-ant-ci-dummy"
      # S3/Tigris — never called during build.
      TIGRIS_ACCESS_KEY_ID: "ci-dummy"
      TIGRIS_SECRET_ACCESS_KEY: "ci-dummy"
      TIGRIS_ENDPOINT_URL_S3: "https://ci-dummy.invalid"
      BUCKET_NAME: "ci-dummy"
      NODE_ENV: "production"

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Prisma generate
        run: npx prisma generate

      - name: Prisma validate
        run: npx prisma validate

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Cache .next
        uses: actions/cache@v4
        with:
          path: |
            ${{ github.workspace }}/.next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-

      - name: Build
        run: npm run build
```

### Why each piece

- **`concurrency.cancel-in-progress` on PRs only** — kills obsolete PR runs when you push new commits, but never cancels `main` runs (those are load-bearing for branch protection).
- **`timeout-minutes: 15`** — default is 6 hours. 15 is generous for a Next 16 build and catches runaway jobs.
- **`DATABASE_URL="postgresql://noop..."`** — Prisma needs a parseable URL to generate the client. It does NOT connect during `prisma generate` or `prisma validate` or `next build` (as long as every DB-reading page has `export const dynamic = "force-dynamic"` — see `railway-deploy` skill §9).
- **Cache key includes source file hashes** — tighter invalidation than lockfile-only. The cache is a performance optimization; correctness doesn't depend on it.
- **`npm ci` not `npm install`** — deterministic, fails on lockfile drift, cache-friendly.
- **No secrets** — every env var is dummy. If a build needs a real secret, you've wired something wrong (likely missing `force-dynamic`).

---

## 2. `prisma validate` — Catch Schema Drift Early

`prisma validate` parses `schema.prisma` and fails on syntax errors, invalid relations, or unknown types. Cheap and fast. Run it before `lint` so schema breakage surfaces before TS complains about missing types.

If your project uses `prisma db push` (no migrations), that's fine — `validate` doesn't require migrations. If you use `prisma migrate`, also add:

```yaml
      - name: Check for pending migrations
        run: |
          if ! git diff --name-only HEAD~1 HEAD | grep -q "prisma/migrations/"; then
            echo "No new migrations."
          else
            echo "New migrations detected — ensure prisma migrate deploy runs on Railway."
          fi
```

---

## 3. The `force-dynamic` Audit as a CI Check (Optional)

The single biggest Railway build failure on Persimmon projects is a page that reads the DB without `export const dynamic = "force-dynamic"`. Add a CI check that greps for it:

```yaml
      - name: Audit force-dynamic
        run: |
          set -e
          OFFENDERS=$(grep -rL 'dynamic = "force-dynamic"' src/app \
            | xargs -r grep -l 'from "@/lib/db"\|from "@/lib/auth"' \
            | grep -v node_modules || true)
          if [ -n "$OFFENDERS" ]; then
            echo "::error::Files read db/auth but missing force-dynamic:"
            echo "$OFFENDERS"
            exit 1
          fi
          echo "force-dynamic audit passed."
```

Add this before `Build`. It fails fast with a clear error instead of a 3-minute Next build that dies mid-prerender.

---

## 4. Branch Protection on `main`

Configure once in the GitHub repo settings:

1. **Settings → Branches → Branch protection rules → Add rule**
2. **Branch name pattern**: `main`
3. **Require a pull request before merging** → on.
4. **Require status checks to pass before merging** → on. Select:
   - `Lint / Typecheck / Build` (exact name of the job from `ci.yml`).
5. **Require branches to be up to date** → on.
6. **Do not allow bypassing** for admins (optional but recommended).
7. **Restrict force pushes** → on.
8. **Restrict deletions** → on.

Once branch protection is live, `main` is gated by CI passing. Railway deploys only after merge, so a green CI is the deploy gate.

---

## 5. `dependabot.yml` — npm + Actions Updates

Commit at `.github/dependabot.yml`:

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm deps — weekly batch.
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "America/Sao_Paulo"
    open-pull-requests-limit: 5
    labels:
      - "deps"
      - "npm"
    commit-message:
      prefix: "chore(deps)"
    groups:
      # Group patch updates to reduce PR noise.
      patch-updates:
        update-types:
          - "patch"
      # Keep Next.js, Prisma, and Anthropic SDK pinned for manual review.
      next-prisma-ai:
        patterns:
          - "next"
          - "@prisma/*"
          - "prisma"
          - "@anthropic-ai/*"
        update-types:
          - "minor"
          - "major"
    ignore:
      # Example: if a lib has a known breaking major, pin major.
      # - dependency-name: "some-lib"
      #   update-types: ["version-update:semver-major"]

  # GitHub Actions — weekly.
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    labels:
      - "deps"
      - "actions"
    commit-message:
      prefix: "chore(ci)"
```

Dependabot opens PRs; CI validates them; you merge. Zero manual version chasing.

### Auto-merge for low-risk updates (optional)

Add `.github/workflows/dependabot-auto-merge.yml`:

```yaml
name: Dependabot auto-merge
on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - name: Fetch metadata
        id: meta
        uses: dependabot/fetch-metadata@v2
      - name: Enable auto-merge (patch + dev-deps only)
        if: |
          steps.meta.outputs.update-type == 'version-update:semver-patch' ||
          steps.meta.outputs.dependency-type == 'direct:development'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Only patch updates and dev-dep updates auto-merge. Minor/major need human review.

---

## 6. CodeQL (Optional)

Worth adding for client projects handling PII. Copy-paste, zero config:

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"  # Mondays 06:00 UTC

jobs:
  analyze:
    name: Analyze (${{ matrix.language }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      actions: read
      contents: read
      security-events: write

    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          queries: security-and-quality

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Analyze
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:${{ matrix.language }}
```

Findings land in **Security → Code scanning alerts**. Review weekly.

---

## 7. Matrix — Don't Use It Unless You Need To

Resist the urge to matrix Node versions (18, 20, 22) for Persimmon projects. Railway runs a specific Node version; CI should match it. Matrix is for libraries, not apps.

Valid uses of matrix in Persimmon CI:
- Multi-OS smoke test for a CLI tool (rare).
- Checking behavior across Prisma versions during an upgrade (temporary branch-local workflow).

If you're about to matrix Node for a client app, don't — pin `20` and move on.

---

## 8. Secrets — When You Actually Need Them

You don't, for CI. But if a future workflow needs one (e.g., uploading build artifacts to S3 for a release pipeline):

1. **Repo Settings → Secrets and variables → Actions → New repository secret**.
2. Reference as `${{ secrets.NAME }}` in the workflow.
3. **Never** log secret values. GitHub masks known secret values in logs, but format tricks (base64, concat) leak them.
4. **Never** give secrets to PR runs from forks. Use `pull_request_target` with extreme care, or just don't — Persimmon projects are private anyway.

For Persimmon, the Anthropic key, Tigris creds, and `DATABASE_URL` live in Railway, not GitHub. CI has no reason to hold them.

---

## 9. Debugging a Red CI

### `npm ci` fails with lockfile mismatch
- Someone edited `package.json` without running `npm install`.
- Fix: run `npm install` locally, commit the updated `package-lock.json`.

### `prisma generate` fails: `Environment variable not found: DATABASE_URL`
- The workflow `env:` block is missing `DATABASE_URL`. Add the dummy URL from §1.

### `tsc --noEmit` fails with `Cannot find module '@prisma/client'`
- `prisma generate` wasn't run before typecheck. Move the `Prisma generate` step above `Typecheck`.

### `next build` fails with `PrismaClientInitializationError`
- A page is prerendering and hitting the dummy DB URL. Add `force-dynamic` to the offending page (build log names it).

### Cache restore takes longer than the build
- Cache key too loose (every change invalidates), or cache size > 5GB and GitHub evicts fast.
- Narrow the cache path to `.next/cache` only (never cache `.next/server`).

### Concurrency cancels `main` runs
- `cancel-in-progress: true` without the `github.event_name == 'pull_request'` guard.
- Use the conditional form from §1.

### Dependabot PR red, but main green
- Dependabot bumped a minor that broke a type. Merge after fixing, or pin the version in `ignore`.

### CodeQL timing out
- Default is 6 hours; `autobuild` can stall. Drop to `timeout-minutes: 30` and if it still fails, specify a manual build step.

### `npm run lint` fails only on CI, passes locally
- `.eslintrc` relies on a globally installed package, or IDE has lenient rules. Verify `npm run lint` works in a fresh clone. Add `--max-warnings 0` to fail on warnings too.

---

## 10. Checklist

- [ ] `.github/workflows/ci.yml` committed and passing on `main`.
- [ ] Dummy env vars in workflow — no real secrets.
- [ ] `prisma generate` runs before `tsc` and `next build`.
- [ ] `concurrency` cancels stale PR runs (and ONLY PR runs).
- [ ] `timeout-minutes` ≤ 15 on the verify job.
- [ ] `.next/cache` cached between runs.
- [ ] Branch protection on `main` requires the CI job.
- [ ] `.github/dependabot.yml` covers npm + actions.
- [ ] (Optional) auto-merge workflow for patch + dev-deps.
- [ ] (Optional) CodeQL workflow for security scanning.
- [ ] (Optional) force-dynamic audit step before build.
- [ ] No secrets referenced unless genuinely needed (Persimmon default: zero).
