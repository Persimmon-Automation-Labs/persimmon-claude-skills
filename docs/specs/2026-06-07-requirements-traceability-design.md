# Requirements Traceability — Design Spec

**Date:** 2026-06-07
**Status:** Accepted (built)
**Topic:** A lean, dogfoodable provenance chain for Persimmon projects — every line of work resolves upward to a source.

## Summary

Every recurring Persimmon failure traces to one missing thing. Re-deriving the deploy/DB facts each session (`force-dynamic`, the Railway port, `trustHost`). Specs that silently drop a user flow. Decisions whose rationale was never written down. The common cause: **no provenance chain** — no path from a line of code back up to the source that justifies it. The fix is to make that chain explicit and keep it lean enough that a solo dev maintains it.

The thesis is Gojko Adzic's *Specification by Example*: **the artifacts you already write ARE the trace links.** A requirement, an ADR, a flow, a plan task, a test — each already references the next. The requirements-traceability matrix (RTM) is therefore *generated*, never hand-kept. You don't add a tracking document; you make the documents you already have point at each other with stable IDs.

## The problem it solves

The first draft of this system optimized for **gapless** — trace everything, everywhere, always. Adversarial review corrected the goal to **the leanest thing that is 100% traceable**, and changed four things:

1. **Tier by markers the repo already has** — `project-type` × `project-stage`, not a new rigor axis (ADR-0005).
2. **The audit detects, it does not enforce** — report always, gate only at demo/handoff (ADR-0006).
3. **The RTM is a handoff deliverable** — generated, not a daily chore.
4. **Parallel/incremental rollout** — the audit no-ops cleanly on absent files, so projects adopt piecewise.

Those corrections are recorded as ADRs 0005–0008.

## The model

**Two homes, four sources.** Sources: SOW/client → a **requirement** (`docs/requirements/`, EARS + stable ID); engineering/industry/preference → an **ADR** (`docs/decisions/`) or the **standing constitution** (this skills repo + the project's `.claude/project-rules.md`); client-confirmed-over-time → `docs/context/` (decisions log, open questions, changelog, meeting notes); design → `docs/specs/`.

**ID namespace:** `REQ-<PROJ>-<AREA>-<NNN>`, `ADR-<NNNN>`, `PERSONA-<slug>`, `FLOW-<NN>`, `SCREEN-<slug>` (= the mockup filename), `Q-<NNN>`.

**The spine:**
`SOW / ADR / constitution → REQ → PERSONA + FLOW → SCREEN → plan task (Implements: REQ + SCREEN) → test (tagged REQ) → commit → usability task`

**Tiering:** `project-type` × `project-stage`, three tiers (T0 Light / T1 Standard / T2 Full); hybrid handled per-surface. The full matrix lives in the `workflow-traceability` skill.

## Components built

| Artifact | Role |
|---|---|
| `scripts/traceability-audit.mjs` | Keystone: docs/config/git-only orphan detector; report always, `--gate` at demo/handoff. |
| `skills/workflow-traceability` | The model + the full type × stage tier matrix. |
| `meta-adr-authoring` (extended) | ADR format + the orphan rule (an engineering decision must become an ADR). |
| `workflow-spec-review` | Pass 1: REQ-ID / orphan / audit checks + a "Skills applied" footer. |
| `workflow-brainstorm` | Emits REQ IDs, the persona registry, SCREEN IDs, and a provenance footer. |
| `workflow-flow-review` | Four-source flow derivation + generated RTM; signed-not-proven (ADR-0008). |
| `workflow-plan` | Plan tasks cite `Implements: REQ + SCREEN`. |
| `meta-lifecycle-stage` | Fires the demo/handoff `audit --gate` at transitions. |
| `scripts/mockup-token-lint.mjs` | Tailwind-v4 design-token lint for mockups. |
| `install-in-project.sh` | Idempotently scaffolds `docs/{requirements,context}/`. |

## Decisions (recorded as ADRs)

- **[ADR-0005](../decisions/0005-tier-traceability-by-type-and-stage.md)** — tier rigor by `project-type` × `project-stage`; three tiers; hybrid per-surface.
- **[ADR-0006](../decisions/0006-traceability-audit-detects-not-enforces.md)** — the audit detects, does not enforce; docs-only; gates only at demo/handoff.
- **[ADR-0007](../decisions/0007-add-requirements-and-context-doc-homes.md)** — add `docs/requirements/` and `docs/context/`; spec stays one file, IDs link.
- **[ADR-0008](../decisions/0008-flow-completeness-is-signed-not-proven.md)** — flow completeness is signed by a human, not proven; a green audit ≠ completeness.

## Status & what's deferred

**Done:** the keystone audit, the new skills, the workflow wiring, the lifecycle gate, the install scaffold, and this dogfood spec.

**Deferred:** proving the four-source method on a real client project (out of scope for this skills-repo meta-work); stage-drift detection (a future ADR-gated, docs-signal-only feature — never live-DB introspection); a tier-aware audit script (optional — the audit already no-ops cleanly on absent files).

## Skills applied

Authoring traced to: `workflow-traceability` (the model + matrix), `meta-adr-authoring` (ADR format), `meta-lifecycle-stage` (the tiering axes), and the repo's existing ADR house style ([docs/decisions/0001](../decisions/0001-master-mother-child-structure.md)). Research: the EARS / RTM / ADR / spec-driven-development synthesis — *Specification by Example*, EARS, ADR practice — supplied in-conversation.
