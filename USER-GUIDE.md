# Persimmon Skills — User Guide

A scenario-based guide for actually using the skills. Organized by **what you're trying to do**, not by skill name. For the catalog, see [README.md](README.md). For the master routing skill, invoke `persimmon`.

## Setup — wire skills into a project

Once per project. Publishes the Persimmon plugin into the project so every Claude session there sees all skills and gets the workflow gate.

```bash
cd /path/to/persimmon-claude-skills
./scripts/install-in-project.sh /path/to/client-project --type internal-tool
# or --type marketing-site for public lead-gen sites
```

What it does (idempotent — safe to re-run):
- `claude plugin marketplace add` this repo, then `claude plugin install persimmon@persimmon-labs --scope project` → writes a valid `enabledPlugins` entry to the project's `.claude/settings.json` (committed, so every collaborator who clones inherits it)
- Writes `.claude/project-type` (`internal-tool` or `marketing-site`)
- Appends a skill-routing note to the project's `CLAUDE.md`

The bundled SessionStart hook then loads the routing/gate context on every session, and skills are available as `persimmon:<skill>` (Claude also auto-routes them by description).

> Low-tech fallback: `meta-skill-sync` documents cloning the `skills/` folder into a project's `.claude/skills/` if you don't want the plugin flow.

## How Claude knows what to use (the loading model)

1. **Project `CLAUDE.md`** says: *"For any work in this repo, invoke the `persimmon` skill first."*
2. **SessionStart hook** (from the plugin) injects the routing + workflow-gate reminder.
3. **`persimmon` master** loads — routes to one of 9 domain mothers, enforcing the workflow gate on non-trivial work.
4. **Domain mother** routes to the right child.
5. **Child** loads the actual instructions.

New devs and new Claude sessions orient within ~3 reads.

## Scenarios

### Starting a new client project

1. **Wire skills:** `./scripts/install-in-project.sh /path/to/new-client --type internal-tool`
2. **Invoke `persimmon`** in the new project's Claude session
3. **Follow the master lifecycle:**
   - `meta-new-client-project` — repo in the org, scaffold docs, register
   - Scoping conversation — narrow SOW to MVP
   - `stack` conventions for the Next.js skeleton
   - `data-prisma-pgvector` — schema, pgvector, HNSW
   - `security-nextauth` — auth, `trustHost`, middleware
   - `ai-sdk-wrapper` + `ai-prompt-library` — `src/lib/ai/` baseline
   - `infra-s3-uploads` → `infra-railway-deploy` → `infra-github-ci`
   - `quality-final-review` before first client delivery

### Building a non-trivial feature

1. **Invoke `persimmon`** — the gate routes you to `workflow`
2. `workflow-brainstorm` → approved spec in `docs/specs/` (must have `## Business meaning`)
3. `workflow-plan` → plan in `docs/plans/` (EARS criteria + Why-this-matters)
4. `workflow-execute` → build task by task
5. `workflow-verify` → `tsc --noEmit`, `eslint`, `prisma validate`, tests, user-workflow checklist
6. `workflow-code-review` → spec compliance + `quality`/`security` dimensions
7. `workflow-finish` → CI green, deploy, branch cleanup

### Fixing something trivial

Copy change, one-line Tailwind, README edit, dependency bump, typo? Skip the gate — go straight to the relevant domain mother (`stack`, `infra`, etc.). If the gate fires unnecessarily, type `skip workflow:` followed by what you want.

### Adding AI to a feature

1. `ai-sdk-wrapper` — route the call through `src/lib/ai/claude.ts` (never import the SDK directly)
2. `ai-prompt-library` — put the prompt in `src/lib/ai/prompts.ts`
3. `ai-rag-retrieval` — if it needs grounded context (stores embeddings via `data-prisma-pgvector`)
4. Persist the output; never regenerate on reload

### Legal (Piccino) work

1. `domain-legal` to orient
2. `legal-pdf-classifier` to index documents; `legal-brief-composer` to generate (cites-only); `legal-pt-prompting` + `legal-glossary` for prompt craft
3. `quality-review-prompt-output` to confirm grounding

### Pre-delivery QA

1. `quality-final-review` — orchestrates performance, type-safety, data-layer, prompt-output, and `security-review`
2. Address findings; produce a `meta-deployment-plan` for client sign-off

### Recovering from a broken Railway deploy

1. Don't panic.
2. `workflow-debug` — check the gotcha table first (force-dynamic, UntrustedHost, CORS, port 8080, staged-config drift)
3. Re-run `workflow-verify`; redeploy via `infra-railway-deploy`

## Onboarding a new contributor (human or AI)

Reading order:
1. `README.md` (catalog overview)
2. `USER-GUIDE.md` (this file — scenarios)
3. `CLAUDE.md` (stack conventions)
4. `skills/persimmon/SKILL.md` (master routing)
5. `docs/decisions/` (ADRs — why things are structured this way)

Under 30 minutes to orient. Then pick a scenario above and follow the routing.
