# ADR-0005: Tier traceability rigor by project-type × project-stage

## Status

Accepted (2026-06-07)

## Context

`workflow-traceability` defines a provenance chain — every line of work resolves upward to a source. Applied uniformly, that chain is aerospace-grade overkill on a brochure marketing site and exactly right on a payments-handling admin tool. The goal is the leanest thing that is 100% traceable for *this* project, not gapless rigor everywhere. Gapless-everywhere is itself a defect: ceremony nobody maintains rots into stale links that lie.

The repo already carries two markers that encode "how much rigor is warranted": `.claude/project-type` (`internal-tool` | `marketing-site`) sets the ceiling, and `meta-lifecycle-stage` reads `.claude/project-stage` (`prototype` | `mvp` | `demo` | `production` | `maintenance`) for how far up that ceiling we climb. Inventing a third rigor axis would duplicate signal these two already carry.

## Decision

Tier `workflow-traceability` rigor across three tiers:

- **T0 Light** — REQ IDs + a flow list; no RTM, no audit gate.
- **T1 Standard** — full ID namespace, generated RTM, audit-as-report.
- **T2 Full** — T1 plus hard audit gates at demo/handoff transitions.

`project-type` sets the ceiling; `project-stage` sets how far up it climbs. A `marketing-site` caps low; an `internal-tool` can reach T2 by `production`. **Hybrid is handled per-surface**, not as a third type: operated surfaces — admin, anything touching money/auth/PII — take the `internal-tool` row regardless of the site's overall type. The full type × stage matrix lives in the `workflow-traceability` skill, not here.

## Alternatives Considered

- **Uniform full rigor on every project** — rejected: imposes aerospace ceremony on a brochure site; the unused links go stale and become noise.
- **A dedicated new "rigor level" config axis** — rejected: `project-type` + `project-stage` already encode the warranted rigor; a third axis is redundant signal to keep in sync.
- **Per-obligation manual opt-in per project** — rejected: pushes a fresh decision onto the dev every project. Sensible defaults derived from markers that already exist *is* the point.

## Consequences

- **Positive**: Lean projects pay near-zero traceability tax; high-stakes surfaces get full rigor automatically.
- **Negative**: A mis-set `project-type` or `project-stage` mis-tiers the project; correctness now depends on those markers being honest.
- **Neutral**: The matrix is one more thing to maintain, but it lives in a single skill and reuses existing axes.

Design spec: [../specs/2026-06-07-requirements-traceability-design.md](../specs/2026-06-07-requirements-traceability-design.md)
