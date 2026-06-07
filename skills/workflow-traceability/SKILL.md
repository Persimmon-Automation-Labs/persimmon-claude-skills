---
name: workflow-traceability
description: "The lean, tiered provenance system for Persimmon projects — every requirement, screen, flow, and decision resolves upward to a source (the SOW, an ADR, or the standing constitution), with rigor scaled by project-type × project-stage. Defines the ID namespace, the spine, the tiering matrix, the docs/ homes, and the traceability-audit (detection, not enforcement). Invoke when speccing/planning a non-trivial feature, when asked 'is this traceable / are all flows covered', or at a demo/handoff gate. Trigger keywords: traceability, RTM, requirements matrix, orphan, are all flows covered, REQ ID, provenance."
---

# Requirements Traceability — lean, tiered, 100% — without the spreadsheet

The goal is the **leanest** system that is **100% traceable**, not "gapless everywhere." Aerospace-grade traceability on a marketing site is a defect, not diligence. The trick (Gojko Adzic's *Specification by Example*): **the artifacts you already write ARE the trace links — you never keep a separate matrix.** The only "extra" you maintain is an ID and a link; the RTM is *generated*, never hand-kept.

This skill is the single home for the model. `workflow-flow-review` applies it to flows; `meta-adr-authoring` owns the ADR half; `meta-lifecycle-stage` supplies the tier.

## Trigger

- "Is this traceable?" / "Are all the user flows covered?" / "Why is this the right set of flows?"
- Speccing or planning a non-trivial feature (the IDs + footer come from here).
- A demo or handoff gate (run the audit with `--gate`; emit the RTM as a deliverable).
- "Where does this decision live?" / "The client changed their mind — how do I record it?"

## Two homes, four sources (every line resolves to exactly one)

| Decision source | Home | Artifact |
|---|---|---|
| The SOW / client | `docs/requirements/` | a **requirement** (EARS, stable ID) |
| Engineering / industry / dev preference (one-off) | `docs/decisions/` | an **ADR** (immutable, numbered) — see `meta-adr-authoring` |
| Standing engineering rules | the **constitution** = the `persimmon-claude-skills` repo + the project's `.claude/project-rules.md` | the skill name / rule itself |
| Client-confirmed over time | `docs/context/` | a dated entry + the changelog |

A line that resolves to **none** of these is an **orphan** — the thing the audit detects. This is the rule that forbids "I improvised": a design decision tracing to neither a skill you read nor a SOW/REQ line has no home but an ADR (write one — see `meta-adr-authoring`).

## The ID namespace (project-scoped to avoid cross-repo collision)

- `REQ-<PROJ>-<AREA>-<NNN>` — requirement (EARS). e.g. `REQ-PIC-AUTH-001`.
- `ADR-<NNNN>` — decision record (immutable, numbered).
- `PERSONA-<slug>` — a persona in the registry.
- `FLOW-<NN>` — a user flow.
- `SCREEN-<slug>` — **= the mockup filename** (`mockups/login.html` → `SCREEN-login`). This is the free join between flows and views.
- `Q-<NNN>` — a client question (only-the-client-can-answer, costly/irreversible).

## The spine (orphan-free in both directions)

```
SOW§ / ADR / constitution
   └─→ REQ-id (EARS)  ──story──  PERSONA + FLOW
         └─→ SCREEN (mockup file)
               └─→ plan task (cites REQ + SCREEN)
                     └─→ test (tagged REQ)  →  commit (cites REQ/ADR)
                           └─→ usability task (FLOW + persona goal)
```

Forward: every REQ has a source; every SOW capability has a covering REQ. Backward: every spec element earns its place. Down: every flow step names a SCREEN. The `**Implements:**` line in `workflow-plan` is the REQ→task link; a test tagged with a REQ is the verify link.

## The tiering matrix — lean where it can be, rigorous where it must be

Rigor is keyed to two markers: **`.claude/project-type` sets the ceiling; `.claude/project-stage` sets how far up you climb.** Persimmon's two project types are `internal-tool` and `marketing-site`; **hybrid is handled per-surface** — an operated surface (admin, payments, dashboards, **anything touching money/auth/PII regardless of where it sits in the nav**) takes the internal-tool row; public marketing pages take the marketing-site row.

| | prototype | mvp | demo | production | maintenance |
|---|---|---|---|---|---|
| **marketing-site** | T0 Light | T0 Light | T1 Standard | T1 Standard | T1 Standard |
| **internal-tool** | T1 Standard | T1 Standard | T2 Full | T2 Full | T2 Full |
| **operated surface (within either)** | take the internal-tool cell for that surface | | | | |

| Obligation | T0 Light | T1 Standard | T2 Full |
|---|---|---|---|
| Stable REQ IDs (EARS) | only money/auth/data criteria | every criterion | every criterion (EARS mandatory) |
| Persona registry | OFF | named roles only | rich personas drive flow enumeration |
| Flow registry + flow-review | OFF | operated surfaces, list only | RTM + human walkthrough, all (actor×goal) |
| ADRs | append-only `context/decisions.md` only | log + ADRs for irreversible calls (schema/money/auth) | numbered immutable ADRs, every engineering decision |
| RTM: covered | OFF | operated surfaces | full |
| RTM: built | OFF | full (`Implements:` per task) | full |
| RTM: verified | manual checklist on money/auth | checklist + tagged tests where they exist | tagged test OR dated manual checklist on every flow |
| RTM: usable | OFF | operated surfaces | full |
| `Skills applied:` footer | OFF | full | full |
| traceability-audit | report-only | report-only; **gate at demo/handoff** | report-only mid-build; **gate at demo + production/handoff** |
| Client-facing RTM at handoff | OFF (unless SOW names it) | full at handoff | full at handoff (headline deliverable) |
| Changelog (supersede-don't-delete) | dated `context/decisions.md` entries | full | full + spec version bump + ADR supersession chain |

Two rules baked into every cell: **(a)** `verified` = a tagged automated test (`vitest`/Playwright) **OR** a dated manual user-workflow checklist item (never force E2E on a site that doesn't warrant it); **(b)** the audit **never blocks mid-build** — it gates only at demo/handoff, and `skip workflow:` always exists. The audit *detects*; the human chooses not to bypass. Don't tell yourself a script "forces" anything.

**The payout is at handoff.** Under Persimmon's "client keeps the code and the keys, no subscription lock-in" model the RTM is a *deliverable feature*. Emit the full RTM at handoff; don't tax prototype code that may be cut.

## The audit (`scripts/traceability-audit.mjs`) — detection, not enforcement

```
node <persimmon-skills>/scripts/traceability-audit.mjs <project-docs-root> [--gate] [--json]
```
Dependency-free Node, **docs-only** (no DB, no creds, no schema coupling). It is a **link-checker**: it reads `requirements.md` / `personas.md` / `flows.md` + the `mockups/` and `decisions/` dirs, reports **orphans** (REQ w/o source, FLOW w/o persona/source, FLOW→missing persona/screen/ADR, uncovered screens), and **generates the RTM as a view**. Default exits 0 (a report); `--gate` exits 1 on orphans — use only at the demo/handoff transition (see `meta-lifecycle-stage`). See ADR-0006.

**What it cannot do, by construction:** find a flow nobody authored. A missing user journey (a forgotten password-reset, an unspecified empty/error state) is caught by the human **four-source method** in `workflow-flow-review`, not here. **A green audit is NOT a completeness proof** (ADR-0008). Keep the two claims separate: the audit proves links among authored nodes; the signed four-source method argues the node set is complete.

Doc conventions the audit parses (one `### <ID>` block each) are documented in the script header — keep `requirements.md`, `personas.md`, `flows.md` in that shape.

## The docs/ homes

```
docs/
  README.md            ← the map (the thin index .claude/project-rules.md points at)
  requirements/  personas.md · requirements.md (EARS+IDs) · flows.md (registry+RTM)
  decisions/     NNNN-{slug}.md (immutable ADRs) · README.md (index) — see meta-adr-authoring
  specs/         YYYY-MM-DD-{topic}.md (+ optional .html) · mockups/{screen}.html
  plans/         YYYY-MM-DD-{topic}.md
  context/       decisions.md · open-questions.md · changelog.md · meetings/YYYY-MM-DD-{topic}.md
```

Persimmon client repos already use `docs/specs/`, `docs/plans/`, `docs/decisions/`; this adds `docs/requirements/` and `docs/context/` (ADR-0007). `install-in-project.sh` scaffolds them idempotently. The design spec is **not split** — its EARS criteria carry `REQ-` IDs that live in `requirements.md`; IDs do the linking.

## Point-in-time vs living; supersede, never delete

- **Immutable, filename-identified:** ADRs (`docs/decisions/0007-{slug}.md`), dated specs. Never edited after acceptance — superseding writes a *new* record and adds a `Superseded by:` header to the old. See `meta-adr-authoring`.
- **Living, in-file status:** `requirements.md`, `personas.md`, `flows.md` evolve in place; each REQ carries `status: active|changed|removed` + a `changed: <date> — <meeting>` trailer.
- **Client contradicts a prior decision:** capture the meeting (`context/meetings/`), record it (`context/decisions.md`), supersede the ADR or flip the REQ status, and log one line in `context/changelog.md` — **what / why / who decided / which meeting / which REQ-ADR.** A ledger without an author is half a record.

## Relationship to other skills

| Skill | Relationship |
|---|---|
| `meta-lifecycle-stage` | Supplies `project-stage`; the matrix keys off it × `project-type`; owns the demo/handoff gate |
| `workflow-flow-review` | Applies the four-source method + the RTM columns; the signed completeness half the audit can't do |
| `meta-adr-authoring` | Owns the ADR format, trigger, immutability, supersede chain (the second of the two homes) |
| `workflow-brainstorm` | Assigns REQ IDs to EARS, builds the persona registry + screen IDs, adds the `Skills applied:` footer (tiered) |
| `workflow-spec-review` | Pass 1 (the existing RTM pass) verifies IDs + orphans + the footer |
| `workflow-plan` | The `**Implements:**` line is the REQ→task (built) link |
| `persimmon` | Routes here; the decision-ownership test feeds the two-homes rule |
