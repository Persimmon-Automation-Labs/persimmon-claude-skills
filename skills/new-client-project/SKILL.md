---
name: new-client-project
description: Set up a new Persimmon Automation Labs client project end-to-end. Use when onboarding a new client, creating a project from a signed SOW, or when Renato says "we got a new client." Creates GitHub repo in Persimmon-Automation-Labs org, clones locally, scaffolds docs via document-project, writes initial commit, registers in the Persimmon clients index. Triggers — "new client", "onboard client", "create project", "scaffold new project", "signed SOW".
---

# New Client Project — Full Onboarding Pipeline

## Overview

Automates the full pipeline from signed SOW to a tracked, documented, repo-backed project folder. Handles GitHub repo creation under `Persimmon-Automation-Labs`, local clone, doc scaffolding (via `document-project`), initial commit, and registration in the Persimmon clients index.

**This skill handles setup only.** Architecture decisions, MVP scoping, and stack scaffolding (Next.js 16 skeleton, Prisma, auth, etc.) happen via separate skills — `nextjs-project-scaffolding`, `prisma-pgvector`, `nextauth-credentials`, etc.

---

## Step 0: Collect Required Inputs Up-Front

Before running anything, gather ALL of these. If any are missing, ask the user — don't guess.

| Field | Required | Example |
|---|---|---|
| **Client name** | Yes | Almeida Prado e Piccino Advogados |
| **Project slug** | Yes (derived) | `piccino-legal` |
| **Domain** | Yes | Legal process analysis (Brazilian law) |
| **Project summary** | Yes (1-3 sentences) | AI-powered petition analysis for a São Paulo litigation firm |
| **Client contact** | Yes (name + email) | Dr. X Piccino, x@piccino.com.br |
| **Contact title** | If available | Senior Partner |
| **Deliverables** | Yes (bullet list from SOW) | Doc ingestion, per-page classification, brief composer, auth |
| **Timeline** | Yes | 60 days — MVP by 2026-05-15 |
| **Proposal number** | If available | PROP-2026-004 |
| **Stack deltas** | If any | "Uses Clerk instead of NextAuth — client has Clerk org already" |
| **Live URL / domain** | If reserved | sistema.piccino.com.br |

**Slug rules**: lowercase, hyphenated, short. "Almeida Prado e Piccino Advogados" → `piccino-legal`. "Garrido USA Industries" → `garrido`. Ask to confirm the slug before creating the repo — the name is hard to change later.

---

## Step 1: Preflight Checks

Run all checks in parallel. Stop on any failure and tell the user how to fix.

### 1a. `gh` CLI installed

```bash
gh --version
```

**If missing**:
> `gh` CLI not installed. Install with `brew install gh` (Mac) or `winget install GitHub.cli` (Windows), then `gh auth login`.

### 1b. Authenticated as `renatodap`

```bash
gh auth status 2>&1
```

Persimmon projects require the `renatodap` account (org admin for `Persimmon-Automation-Labs`). If the output shows a different active user:

```bash
gh auth switch --user renatodap
```

Re-run `gh auth status` to confirm.

### 1c. `Persimmon-Automation-Labs` org access

```bash
gh api orgs/Persimmon-Automation-Labs --jq '.login'
```

Must return `Persimmon-Automation-Labs`. If 404, the user is not a member of the org — stop and tell them.

### 1d. git installed

```bash
git --version
```

### 1e. Locate Persimmon parent directory

Persimmon client repos live under `~/Documents/Projects/` (or equivalent — the active `{PROJECTS}` base). No parent monorepo — each client is standalone.

```bash
# Mac default
PROJECTS_ROOT="$HOME/Documents/Projects"
ls "$PROJECTS_ROOT" >/dev/null 2>&1 || { echo "ERR: Projects dir missing"; exit 1; }
```

### 1f. Source skills repo is available

```bash
SKILLS_REPO="$HOME/Documents/Projects/persimmon-claude-skills"
ls "$SKILLS_REPO/skills/document-project/SKILL.md" >/dev/null 2>&1
```

If missing, the user should clone `persimmon-claude-skills` first — we need it for Step 5.

---

## Step 2: Check for Existing Repo / Folder

### 2a. Does the repo already exist on GitHub?

```bash
gh repo view "Persimmon-Automation-Labs/$SLUG" --json name,url 2>/dev/null
```

If it exists:
> Repo `Persimmon-Automation-Labs/$SLUG` already exists at {url}. Want to clone it locally and scaffold docs, or pick a different slug?

### 2b. Does a local folder already exist?

```bash
ls -la "$PROJECTS_ROOT/$SLUG/.git" 2>/dev/null
```

| State | Action |
|---|---|
| Folder + `.git` exists | Ask: update docs instead of re-scaffolding? |
| Folder exists, no `.git` | Ask: init git here and connect to the new repo? |
| Folder missing | Continue to Step 3 |

---

## Step 3: Create GitHub Repo

```bash
gh repo create "Persimmon-Automation-Labs/$SLUG" \
  --private \
  --description "$CLIENT_NAME — $DOMAIN" \
  --clone=false \
  --add-readme=false
```

Do not add a README via `gh` — `document-project` generates a better one.

Verify:

```bash
gh repo view "Persimmon-Automation-Labs/$SLUG" --json url
```

---

## Step 4: Clone Locally

```bash
cd "$PROJECTS_ROOT"
git clone "https://github.com/Persimmon-Automation-Labs/$SLUG.git"
cd "$SLUG"

# Create skeleton directories
mkdir -p docs/{decisions,reference} notes src .github/workflows

# Set up .claude/ skills via skill-sync skill (Mode A)
git clone https://github.com/Persimmon-Automation-Labs/persimmon-claude-skills.git .claude
echo ".claude/" >> .gitignore
```

Do this cleanly — no stray files yet.

---

## Step 5: Scaffold Documentation

Delegate to the `document-project` skill in SCAFFOLD mode. Pass the collected inputs:

- `client_name` — $CLIENT_NAME
- `domain` — $DOMAIN
- `summary` — $PROJECT_SUMMARY
- `contact` — $CONTACT_NAME, $CONTACT_EMAIL, $CONTACT_TITLE
- `deliverables` — parsed bullet list
- `timeline` — $TIMELINE
- `proposal_number` — $PROPOSAL_NUMBER
- `stack_deltas` — $STACK_DELTAS (if any)

`document-project` creates:
- `CLAUDE.md` (dev context, Persimmon stack conventions)
- `README.md` (status, team, setup, doc links — ≤ 80 lines)
- `docs/reference/scope-of-work.md` (financials, deliverables — only place for $)
- `.github/workflows/ci.yml` (lint, typecheck, prisma validate, build)

Review generated files before committing — make sure client name, contact, and deliverables are accurate.

---

## Step 6: Register in Persimmon Clients Index

Persimmon maintains a `clients.json` index at the root of `persimmon-claude-skills`. Add this project.

Check for the index:

```bash
INDEX="$SKILLS_REPO/clients.json"
if [ ! -f "$INDEX" ]; then
  echo '{"clients": []}' > "$INDEX"
fi
```

Append the new client (use `jq` for safe JSON edit):

```bash
jq --arg slug "$SLUG" \
   --arg name "$CLIENT_NAME" \
   --arg domain "$DOMAIN" \
   --arg repo "https://github.com/Persimmon-Automation-Labs/$SLUG" \
   --arg started "$(date +%Y-%m-%d)" \
   '.clients += [{
      slug: $slug,
      name: $name,
      domain: $domain,
      repo: $repo,
      started: $started,
      status: "active"
    }]' "$INDEX" > "$INDEX.tmp" && mv "$INDEX.tmp" "$INDEX"
```

Also update the `Client Projects` table in `persimmon-claude-skills/CLAUDE.md`:

```
| {Client Name} | {Domain} | `{slug}` (private) | {URL or TBD} |
```

Commit these changes in the skills repo:

```bash
cd "$SKILLS_REPO"
git add clients.json CLAUDE.md
git commit -m "Register $SLUG — $CLIENT_NAME"
git push
```

---

## Step 7: Initial Commit and Push

```bash
cd "$PROJECTS_ROOT/$SLUG"
git add -A
git commit -m "Initial scaffold: docs, CI, lean structure

- CLAUDE.md (Persimmon stack context)
- README.md (status, team, setup)
- docs/reference/scope-of-work.md
- docs/decisions/ (ready for ADRs)
- .github/workflows/ci.yml
- .claude/ skills (gitignored)
"
git branch -M main
git push -u origin main
```

Verify CI runs green — watch the Actions tab. If it fails, it's almost always because a prisma schema or `pnpm install` step was expected but scaffolding only covered docs. That's fine at this stage; the next skill (`nextjs-project-scaffolding`) will flesh out the project.

---

## Step 8: Summary

```
NEW CLIENT PROJECT — {Client Name}
============================================
Slug:       {slug}
GitHub:     https://github.com/Persimmon-Automation-Labs/{slug}
Local:      {PROJECTS_ROOT}/{slug}/
Status:     Registered in Persimmon clients index

FILES CREATED:
  CLAUDE.md                          — Dev context (Persimmon stack)
  README.md                          — Human onboarding
  docs/reference/scope-of-work.md    — Contract + financials
  docs/decisions/                    — Ready for ADRs
  docs/reference/                    — Ready for client materials
  notes/                             — Ready for meeting notes
  .github/workflows/ci.yml           — Lint/typecheck/build
  .claude/                           — Persimmon skills (gitignored)

NEXT STEPS:
  1. Review generated docs for accuracy (client name, contact, deliverables)
  2. Run `nextjs-project-scaffolding` to lay down the Next.js 16 skeleton
  3. Run `prisma-pgvector` for schema + pgvector + HNSW
  4. Run `nextauth-credentials` for auth
  5. Run `railway-deploy` to provision the Railway project
============================================
```

---

## Error Recovery

| Error | Cause | Fix |
|---|---|---|
| `gh: command not found` | gh CLI missing | Step 1a |
| `HTTP 404` on `orgs/Persimmon-Automation-Labs` | No org access | Ask an org admin to invite |
| `HTTP 422` on repo create | Slug taken | Step 2a detected it — offer to clone or rename |
| `Permission denied` on push | Wrong auth account | `gh auth switch --user renatodap` |
| `fatal: refusing to merge unrelated histories` | GitHub auto-added a README | Recreate repo with `--add-readme=false` |
| `.claude/` clone auth fails | Persimmon skills repo requires org access | Verify Step 1c |

---

## What This Skill Does NOT Do

- Architecture decisions — separate conversation, captured later via `adr-authoring`
- MVP scoping — that's a product conversation, not automation
- Next.js / Prisma / auth / Claude SDK scaffolding — separate skills in the pipeline
- Railway project creation — `railway-deploy` skill
- Domain purchase / DNS — manual
- Client onboarding call / kickoff — manual
