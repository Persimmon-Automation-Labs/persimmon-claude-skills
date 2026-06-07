<!-- persimmon-skills:project-rules -->
# __PROJECT_NAME__ — Project Rules & Memory

**This file is the project's source of truth for facts Claude keeps re-deriving.**
It is auto-loaded every session (SessionStart hook). Keep it current: when a fact
changes (deploy target, a credential's location, a new convention), update it here
so no future session has to ask. Facts live here; *decisions* (with rationale)
live in `docs/context/decisions.md` or `docs/decisions/` (ADRs).

> Secrets rule: this file records **where** credentials live and their **names**,
> never their **values**. Real secrets live in Railway env vars + GitHub Actions Secrets.

## Stage & type

- **Stage:** `__PROJECT_STAGE__` (see `.claude/project-stage`; rules → `meta-lifecycle-stage` skill)
- **Type:** `__PROJECT_TYPE__` (see `.claude/project-type`; gate strength → `persimmon` / `workflow`)

## Deploy

- **Host:** Railway (app + Postgres + bucket in one project). Dashboard: https://railway.app
- **Production URL:** `__PROD_URL__` (custom domain) · **Staging URL:** `__STAGING_URL__` (`*.up.railway.app`)
- **Pipeline:** Railway **auto-deploys on push to `main`**. GitHub Actions CI (`.github/workflows/ci.yml`) runs lint / `tsc --noEmit` / `prisma validate` / build on every push + PR. Deploy cadence + backup-gating follow the project's `meta-lifecycle-stage`.
- **Container port:** `8080` (from `PORT`). The public domain `targetPort` must match — not 3000.
- **Build gotcha:** any page reading the DB or `auth()` at request time must `export const dynamic = "force-dynamic"`, or the Railway build prerenders and crashes (no DB on the build container).
- **Credentials live in:** Railway env vars (`DATABASE_URL`, `NEXTAUTH_SECRET`, `ANTHROPIC_API_KEY`, S3/Tigris keys, `APP_ENV`); CI dummies in `.github/workflows/ci.yml`. Never in the repo.
- **GitHub repo:** `__GITHUB_REPO__`

## Database

- **Engine:** PostgreSQL + `pgvector` on Railway. ORM: Prisma (one client in `src/lib/db.ts`).
- **Naming:** `__DB_NAME__` (convention: `{project}_prod` / `{project}_dev`).
- **Schema/migrations:** `prisma/schema.prisma`; apply via `__MIGRATE_STRATEGY__` (`prisma migrate deploy` OR `prisma db push` — pick one and stick with it).
- **Credentials live in:** Railway env var `DATABASE_URL` (+ `DIRECT_URL` if pooling); locally in `.env` (gitignored).
- **After `db push` with enum/model changes:** restart `npm run dev` — the running Prisma client is stale.

## Where things are

- **Specs:** `docs/specs/YYYY-MM-DD-{topic}.md` (+ optional rendered `.html`)
- **Mockups:** `docs/specs/{topic}/mockups/` (interactive HTML — the design target)
- **Plans:** `docs/plans/YYYY-MM-DD-{topic}.md`
- **Requirements:** `docs/requirements/` (`personas.md` · `requirements.md` · `flows.md` + RTM)
- **Decisions:** `docs/context/decisions.md` (append-only) + `docs/decisions/` (ADRs)
- **Open client questions:** `docs/context/open-questions.md`
- **Gaps backlog (if used):** `docs/specs/__GAPS_BACKLOG__`

## Conventions established on THIS project

<!-- Append project-specific conventions, overrides, and gotchas as they're set.
     Each entry = one line: what + why. Examples:
     - Demo creds overridden to client-requested values (see README).
     - Push to main is desired at this stage; no PR required (solo dev, mvp). -->

- _(none yet — add as decisions land)_

## Known gotchas

<!-- Things that wasted time once. Record so they never do again. -->

- DB/`auth()`-reading pages need `export const dynamic = "force-dynamic"` or the Railway build crashes.
- NextAuth v5 behind Railway's edge: `trustHost: true`, and middleware redirects must read `x-forwarded-host` (or users bounce to `*.up.railway.app`).
- Tigris/S3 browser uploads need bucket CORS for every uploading origin (localhost, preview, prod) or they silently fail with `net::ERR_FAILED`.
- Container `targetPort` must be `8080`, not 3000.
