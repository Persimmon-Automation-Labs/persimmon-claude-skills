---
name: project-meta
description: Index of Persimmon repo-lifecycle and documentation skills — new client project setup, doc audit/scaffold, guided project walk-through, ADR authoring, deployment-plan documents, and skill installation. Use when starting/onboarding a project, maintaining docs, recording decisions, or wiring the skills into a project. Routes to the right specialist child skill. Trigger keywords: new client, onboard, SOW, audit docs, update README, ADR, decision record, walk me through, where does X come from, deployment plan, go-live, setup skills, sync, install skills.
---

# Project-Meta — Index

Repo lifecycle, documentation, and onboarding for Persimmon projects. This mother is a map; follow the child for the actual work.

## Trigger

- "Start a new client project" / "onboard" / "SOW"
- "Audit the docs" / "update README" / "add an ADR"
- "Walk me through this project" / "where does X come from?"
- "Write the deployment plan / go-live doc"
- "Set up / sync the Persimmon skills"

## The child skills

| Skill | When to use | Owns |
|---|---|---|
| `meta-new-client-project` | New engagement | GitHub repo in the org, clone, scaffold docs, register in CLAUDE.md/README |
| `meta-document-project` | Doc maintenance | Lean doc audit/scaffold/update — enforces Persimmon doc conventions |
| `meta-project-xray` | Understanding a codebase | Interactive guided walk-through of pages, data flows, integrations |
| `meta-adr-authoring` | Recording a decision | MADR-lite ADRs in `docs/decisions/` for non-obvious choices |
| `meta-deployment-plan` | Go-live | Client-facing deployment plan document with sign-off |
| `meta-skill-sync` | Wiring skills into a project | Install the Persimmon plugin (marketplace), verify activation, onboard a dev |

## How to route

1. **Brand-new project?** → `meta-new-client-project`, then the master `persimmon` lifecycle tree.
2. **Docs drifting / missing?** → `meta-document-project`.
3. **Need to understand the code?** → `meta-project-xray`.
4. **Non-obvious decision?** → `meta-adr-authoring`.
5. **Shipping to the client?** → `meta-deployment-plan` (+ `quality-final-review`).
6. **Skills not active in a repo?** → `meta-skill-sync`.

## Doc conventions — one-screen summary (every client folder gets exactly)

- `CLAUDE.md` — dev context (starts with a "What This File Is" preamble)
- `README.md` — human onboarding (status table, team, docs table)
- `docs/reference/scope-of-work.md` — signed SOW (ONLY place for financials)
- `docs/decisions/` — ADRs (MADR-lite)
- `docs/specs/` & `docs/plans/` — workflow artifacts (see `workflow`)
- `notes/` — meeting notes, requirements
- `.github/workflows/ci.yml` — lint, typecheck, `prisma validate`, build

**Never put** payment terms in README, architecture in README (link to CLAUDE.md), or client contact info in CLAUDE.md.

## Anti-patterns banned

- Financials anywhere but `docs/reference/scope-of-work.md`
- Architecture in README instead of CLAUDE.md
- Undocumented non-obvious decisions (write an ADR)
- Hand-wiring skills via invalid settings keys — use `meta-skill-sync` (plugin install)

## Relationship to other mothers

| Mother | Connection |
|---|---|
| `workflow` | Specs/plans live alongside the docs this mother manages |
| `quality` | `meta-deployment-plan` pairs with `quality-final-review` |
| all | `meta-new-client-project` kicks off the full master lifecycle |
