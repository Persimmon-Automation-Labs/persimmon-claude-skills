# ADR-0006: The traceability audit detects, it does not enforce

## Status

Accepted (2026-06-07)

## Context

`scripts/traceability-audit.mjs` walks the provenance chain and reports orphans — a REQ with no plan task, a SCREEN with no flow, a test tagged to a REQ that no longer exists. The open question was whether it should *block* (fail CI, refuse the commit) or *report*. A hard gate on every commit feels like enforcement, but a solo dev under a deadline bypasses it, and gating prototype code that may be cut entirely is pure tax. The audit also must not become a database client — that would couple a docs-reader to a schema and creds it has no business holding.

## Decision

The audit **detects, it does not enforce**, and stays **docs/config/git-only**.

- It runs as a **report (exit 0) always** — the mechanical orphan-catch on every run.
- It **hard-gates (`--gate`, exit 1) ONLY at the demo and production/handoff transitions** — and the trigger is the *action* (cutting a demo build, finishing a branch, emitting a handoff), not trusting the `project-stage` label. This gate is wired through `meta-lifecycle-stage`'s transition guidance.
- It **never opens a database, holds no creds, couples to no schema.** It reads docs, config, and git.

A green audit is **NOT a completeness proof** — it cannot find a flow nobody authored (see ADR-0008). It proves links among artifacts that exist; it cannot prove the artifact set is complete.

Stage-drift detection (e.g. "stage=prototype but the live DB has real tenants") is **deferred** to a later, ADR-gated, docs-signal-only feature — never live-DB introspection.

## Alternatives Considered

- **Hard CI gate on every commit/PR** — rejected: a false sense of "forced"; the solo dev bypasses under deadline anyway, and gating prototype code that may be cut is pure tax.
- **Live-DB stage-drift introspection in the audit** — rejected: turns a docs-reader into a DB client (creds, schema coupling, env-specific breakage). Scope creep dressed as formalization.
- **No audit at all** — rejected: the mechanical orphan-catch is cheap and real; dropping it loses the one thing the system can actually prove.

## Consequences

- **Positive**: The audit is safe to run anywhere — no creds, no schema, no env-specific failure. Gates land only where the cost of a broken chain is real.
- **Negative**: Between transitions, orphans accumulate silently unless someone reads the report; the audit can't catch un-authored work.
- **Neutral**: Stage-drift remains a known gap, parked behind a future ADR rather than smuggled in now.

Design spec: [../specs/2026-06-07-requirements-traceability-design.md](../specs/2026-06-07-requirements-traceability-design.md)
