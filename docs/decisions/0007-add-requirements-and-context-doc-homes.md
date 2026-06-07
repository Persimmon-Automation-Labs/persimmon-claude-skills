# ADR-0007: Add requirements/ and context/ homes to the docs layout

## Status

Accepted (2026-06-07)

## Context

Persimmon client repos already use a lean `docs/` layout: `docs/specs/` (the HOW), `docs/plans/` (task breakdowns), `docs/decisions/` (ADRs via `meta-adr-authoring`). `workflow-traceability` needs durable homes for its four decision sources, and two of them have nowhere to live:

| Source | Becomes | Home |
|---|---|---|
| SOW / client ask | a requirement (EARS + stable ID) | `docs/requirements/` *(new)* |
| engineering / industry / preference | an ADR or standing rule | `docs/decisions/` + the constitution |
| client-confirmed over time | log / open question / changelog | `docs/context/` *(new)* |
| design / mockups | screens, flows | `docs/specs/` *(existing)* |

The "standing constitution" is the `persimmon-claude-skills` repo plus the project's `.claude/project-rules.md`. This is an **addition** to the existing lean layout, not a migration — there is no legacy folder to move from.

## Decision

Add `docs/requirements/` (EARS-form requirements with stable `REQ-` IDs) and `docs/context/` (decisions log, open questions, changelog, meeting notes) to the layout. `install-in-project.sh` scaffolds both **idempotently** and **never clobbers existing docs**.

Keep the design spec as **ONE file**. Its EARS acceptance criteria carry `REQ-` IDs that resolve to entries in `docs/requirements/` — the IDs do the linking, so no file split is needed. The WHAT (requirements) and the HOW (design) stay distinct by *folder*, not by fragmenting the spec.

## Alternatives Considered

- **Put requirements inside `docs/specs/`** — rejected: muddles the WHAT source-of-truth with the HOW design; provenance gets buried in design prose.
- **A separate top-level requirements repo** — rejected: the client owns one repo and keeps the code; provenance must travel *with* the code, not in a second repo.
- **Split the design spec into requirements vs design files** — rejected per the lean thesis: `REQ-` IDs already link spec criteria to `docs/requirements/`. The split adds files without adding traceability.

## Consequences

- **Positive**: Every decision source has an obvious, conventional home; new client repos get both folders for free.
- **Negative**: Two more directories to keep tidy; an empty `docs/requirements/` on a T0 project is mild clutter.
- **Neutral**: The spec stays single-file; the linking burden moves entirely onto ID discipline.

Design spec: [../specs/2026-06-07-requirements-traceability-design.md](../specs/2026-06-07-requirements-traceability-design.md)
