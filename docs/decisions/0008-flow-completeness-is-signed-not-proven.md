# ADR-0008: Flow completeness is signed, not proven

## Status

Accepted (2026-06-07)

## Context

`workflow-flow-review` derives the user-flow set as the closure of `{personas} × {goals}`, with goals enumerated from four sources: SOW capabilities, entity lifecycles, persona job-to-be-done (JTBD), and cross-cutting unhappy paths. This four-source method is what re-finds real gaps — a missing password-reset flow, an unhandled refund path. But two of the four sources (persona-JTBD, unhappy paths) are open-ended judgment spaces. A missed persona is a *silent* gap: the derivation produces flows for the personas it knows about and says nothing about the one it never named.

The temptation is to call a fully-derived flow set "complete" and let the audit assert it. That is the exact false-confidence failure this whole system exists to prevent.

## Decision

Flow completeness is **coverage-by-construction, signed by a human — NOT a proof.** The four-source method is a strong heuristic; the **human signature is the load-bearing part.** A reviewer signs that the flow set matches reality, accepting that the method narrows but does not eliminate judgment.

Keep two claims separate and **never conflate** them:

- **(a)** The audit proves *links among artifacts that exist* — it catches orphans.
- **(b)** The four-source method plus a human signature *argues* the artifact set is complete against reality — it is an argument, not a proof.

Both the `workflow-flow-review` and audit docs state plainly: **a green audit is not completeness.**

## Alternatives Considered

- **Call it a proof / let the audit assert completeness** — rejected: false confidence is the precise failure mode the system is built to prevent.
- **Attempt formal exhaustive enumeration of flows** — rejected: persona-JTBD and unhappy-path sets are open-ended; "exhaustive" enumeration over a judgment space is theater.
- **Drop the four-source method for ad-hoc enumeration** — rejected: the method is exactly what re-finds real gaps like a missing password-reset flow; ad-hoc enumeration misses them silently.

## Consequences

- **Positive**: The system never overclaims; the human reviewer stays accountable for completeness, which is where that judgment belongs.
- **Negative**: A missed persona still slips through silently — the heuristic narrows the risk, it does not close it.
- **Neutral**: Two distinct claims (links vs. completeness) must be stated separately everywhere, which is more wording but prevents conflation.

Design spec: [../specs/2026-06-07-requirements-traceability-design.md](../specs/2026-06-07-requirements-traceability-design.md)
