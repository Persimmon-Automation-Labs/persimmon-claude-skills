---
name: adr-authoring
description: Write MADR-lite Architecture Decision Records in docs/decisions/ for any Persimmon client project. Use when a non-obvious architecture choice is made, when the stack deviates from Persimmon defaults, when a tradeoff was weighed, or when future maintainers will ask "why did we do it this way?" Triggers — "write an ADR", "decision record", "architecture decision", "document this decision", "ADR for X", "record the choice", "why did we pick X".
---

# ADR Authoring — MADR-lite for Persimmon Projects

## Overview

ADRs (Architecture Decision Records) capture non-obvious architecture choices in one short markdown file per decision. Persimmon uses **MADR-lite**: Title, Status, Context, Decision, Consequences, Alternatives Considered — under 40 lines, always.

**When to write an ADR**:
- Stack deviation from Persimmon defaults (e.g., Clerk instead of NextAuth, Supabase instead of Railway Postgres)
- Model routing decision (Sonnet vs. Opus for a specific task)
- Non-obvious data model choice (denormalization, JSONB over relational, vector index type)
- Tradeoff where two options both work (sync vs. queued processing, server actions vs. API routes for a feature)
- Any choice a new developer will question within their first week

**When NOT to write one**:
- Default Persimmon stack choices (Next 16, Prisma, Tailwind v4) — already documented in `persimmon-claude-skills/CLAUDE.md`
- Formatting / linter rules — enforced by tooling
- Temporary workarounds that will be replaced — use a `// TODO` instead
- Individual bugfixes — use git history

**Rule of thumb**: if the answer to "why did you do it this way?" takes more than one sentence, it's probably an ADR.

---

## Step 1: Confirm the Decision Is Ready

Before writing, confirm:

1. **The decision has been made.** ADRs record decisions, not debates. If it's still being debated, document the debate in `notes/` first.
2. **The decision is non-obvious.** "We chose TypeScript" isn't an ADR — it's a Persimmon default.
3. **There's at least one real alternative.** If the only alternative is "don't do it," reconsider whether this needs an ADR.
4. **Someone will question it later.** The test: imagine a new dev asking "why?" in three months. If the answer isn't obvious from the codebase, ADR it.

If any of these fail, stop. Do not write an ADR.

---

## Step 2: Determine the Next Number

```bash
cd docs/decisions
# Find the highest existing number
ls *.md 2>/dev/null | grep -oE '^[0-9]{3}' | sort -n | tail -1
```

Start at `001`. Never reuse numbers. Never renumber — even if an ADR is superseded.

If superseding an old ADR, reference it in the new one's `Status` field:

```markdown
## Status
Accepted — supersedes [ADR-003](./003-sonnet-vs-opus-routing.md)
```

And update the old ADR's status:

```markdown
## Status
Superseded by [ADR-012](./012-per-task-model-routing.md) on 2026-05-14
```

---

## Step 3: Pick a Filename

Format: `NNN-kebab-name.md`. The name should make the decision guessable without opening the file.

Good: `003-sonnet-vs-opus-routing.md`, `005-cicd-github-actions-railway.md`, `008-pgvector-hnsw-not-ivfflat.md`
Bad: `003-ai-stuff.md`, `005-deployment.md`, `008-vector-index.md` (too vague)

Name the decision, not the topic area.

---

## Step 4: Write the ADR

### Template

```markdown
# ADR-NNN: {Title — imperative mood, states the decision}

## Status
Accepted — {YYYY-MM-DD}

## Context

{2-4 sentences. What situation triggered this decision? Value-neutral.
Include constraints (SLA, budget, deadlines, existing integrations).
No speculation, no marketing copy.}

## Decision

{1-3 sentences in active voice. State what we're doing.}

## Consequences

**Positive**:
- {What this buys us}

**Negative**:
- {What we give up / what this costs}

**Neutral**:
- {Changes that are not strictly better or worse}

## Alternatives Considered

- **{Alternative 1}** — rejected because {specific reason}
- **{Alternative 2}** — rejected because {specific reason}
```

### Rules

- **Under 40 lines total.** If it's longer, you're explaining too much. Link out to docs or a spec.
- **Imperative-mood title.** "Use HNSW index" not "Using HNSW index" or "HNSW Index Decision."
- **Active voice in Decision.** "We route per-page classification to Sonnet" not "Sonnet will be used for classification."
- **Be honest in Consequences.** If the negative column is empty, you haven't thought hard enough.
- **Alternatives must have been real.** "We considered writing our own database" is not a real alternative for a Next.js app. List what was actually on the table.
- **No financials in ADRs.** Cost tradeoffs are fine ("Opus is ~5x more expensive per token"), but specific contract dollar amounts go in `docs/reference/scope-of-work.md`.

---

## Step 5: Example ADRs

### Example 1: `003-sonnet-vs-opus-routing.md`

```markdown
# ADR-003: Route per-page classification to Sonnet, brief composition to Opus

## Status
Accepted — 2026-04-02

## Context

Piccino Legal ingests multi-hundred-page petition PDFs. Every page gets classified (petição, sentença, intimação, etc.), and selected pages feed a brief composer. At ingestion volume (~300 pages per doc, ~50 docs per week), per-page Opus calls would cost ~$40/doc. Brief composition runs once per doc and needs multi-page reasoning.

## Decision

Route per-page classification to `claude-sonnet-4-5`. Route brief composition to `claude-opus-4-6`. Selection lives in `src/lib/ai/claude.ts::routeModel(task)`.

## Consequences

**Positive**:
- Ingestion cost drops ~5x (~$8/doc vs ~$40/doc at current volume)
- Classification latency improves (Sonnet ~2x faster for this prompt)

**Negative**:
- Two models to maintain prompts and evals for
- Sonnet misclassifies ~3% of pages; we accept this and flag low-confidence pages for review

**Neutral**:
- Prompt caching applies to both models; the shared system prompt is cache-hit across tasks

## Alternatives Considered

- **Opus for both** — rejected on cost (5x) without meaningful accuracy gain for classification
- **Sonnet for both** — rejected on brief quality; Sonnet drops multi-document citation precision below acceptable threshold in our eval set
- **Haiku for classification** — rejected; eval accuracy dropped to 89% vs. Sonnet's 97% on the same 200-page test set
```

### Example 2: `005-cicd-github-actions-railway.md`

```markdown
# ADR-005: Use GitHub Actions for CI and Railway auto-deploy for CD

## Status
Accepted — 2026-04-08

## Context

Persimmon projects deploy to Railway. Railway offers auto-deploy on push to `main` out of the box. We need separate verification (lint, typecheck, prisma validate, build) gated before merge, and we want merge-blocking checks in GitHub.

## Decision

Run `lint`, `typecheck`, `prisma validate`, and `build` as a GitHub Actions workflow on every push and PR. Merging to `main` triggers Railway auto-deploy. No separate CD pipeline.

## Consequences

**Positive**:
- Zero custom deploy scripts. Railway owns build+deploy.
- Merge protection enforced via GitHub branch rules
- Same CI runs for all Persimmon projects (shared template in `persimmon-claude-skills/templates/ci.yml`)

**Negative**:
- Railway's build container lacks DB network — pages that hit DB at build time must export `dynamic = "force-dynamic"` (also documented in project CLAUDE.md)
- No staging environment by default; added per-project when needed

**Neutral**:
- Rollback is manual via Railway dashboard (redeploy previous commit)

## Alternatives Considered

- **GitHub Actions for CD too** — rejected; would duplicate Railway's build step and require managing Railway API tokens in GitHub secrets
- **Vercel instead of Railway** — rejected at stack-level; Railway colocates DB + app + bucket which Vercel doesn't
- **Custom deploy script via SSH** — rejected; no gain over Railway auto-deploy and more to maintain
```

---

## Step 6: Link From CLAUDE.md

After writing the ADR, reference it from `CLAUDE.md` if the decision affects day-to-day dev work.

Example edit to `CLAUDE.md`:

```markdown
## Tech Stack

- **AI**: Anthropic Claude SDK — Sonnet for per-page classification, Opus for brief composition. See [ADR-003](docs/decisions/003-sonnet-vs-opus-routing.md).
```

Do not summarize the ADR in CLAUDE.md — link to it.

---

## Step 7: Commit

```bash
git add docs/decisions/NNN-*.md CLAUDE.md
git commit -m "docs(adr): record decision NNN — {short title}"
```

Keep the commit scoped — ADRs + any CLAUDE.md link. Don't bundle with unrelated changes.

---

## Anti-Patterns

- Do not write ADRs retroactively for obvious choices (e.g., "use TypeScript"). Document only the non-obvious.
- Do not rewrite history. If a decision is reversed, write a new ADR that supersedes the old one. Do not edit the old one except to mark status.
- Do not treat ADRs as design docs. Design docs describe proposed architecture; ADRs record decided architecture. If it's still being debated, it's a design doc, which lives in `notes/`.
- Do not write ADRs that exceed 40 lines. If the decision needs more space, link to a reference doc and keep the ADR a pointer.
- Do not invent alternatives that were never considered just to fill the section. "We considered writing our own ORM" is noise if it was never on the table.
- Do not put client contact info, deliverables, or financial terms in ADRs. ADRs are engineering artifacts.
- Do not mark an ADR `Proposed` and forget about it. Either accept, reject, or delete.

---

## Summary Output

After creating an ADR, show:

```
ADR CREATED
============================================
File:      docs/decisions/NNN-{slug}.md
Title:     {Title}
Status:    Accepted — {date}
Lines:     {count} / 40
============================================
Linked from CLAUDE.md: {yes/no}
```
