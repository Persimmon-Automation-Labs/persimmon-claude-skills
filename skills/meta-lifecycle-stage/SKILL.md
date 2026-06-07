---
name: meta-lifecycle-stage
description: "Reads .claude/project-stage and applies the right rigor for where a Persimmon project is in its life — prototype, mvp, demo, production, maintenance. Governs how to commit/branch/push, when CI must pass, whether deploys are backup-gated, and the testing bar. Rigor ratchets up as the project matures. Invoke at session start (alongside the persimmon orientation) and before any commit, push, or deploy decision. Trigger keywords: project stage, lifecycle stage, can I push to main, do I need a PR, promote to production, this is live now, deploy rigor."
---

# Lifecycle Stage — graduated rigor

`.claude/project-type` answers *what kind of rigor* (internal-tool vs marketing-site). **This skill answers *how much rigor, right now*.** A prototype and a live production app are the same project type but demand opposite discipline. The rule is **ratcheting quality gates**: rigor increases monotonically as the project matures — you never impose production gates on a prototype, and you never allow prototype looseness once real users depend on it.

This is the same idea as `project-type`: a one-word file (`.claude/project-stage`) that every session reads and applies without being told.

## Trigger

- Session start, immediately after the `persimmon` orientation — announce the active stage and its rules.
- Before any **commit, push, branch, or deploy** decision — the stage decides the procedure.
- "What stage is this project?" / "Can I push straight to main?" / "Do I need a PR / backup / tag?"
- "Promote this to production" / "This is live now" — a stage transition (see below).

## Read the stage (do this first)

Read `.claude/project-stage`. If it is missing, **infer and write it** (don't ask unless genuinely ambiguous):

- No client has seen it, you're still standing up the skeleton → `mvp`
- A spike/experiment that may be thrown away → `prototype`
- It's on a Railway staging/preview URL and the client is reviewing → `demo`
- It's serving the client's real users / on their custom domain / formally handed off → `production`
- A second engagement on an already-live app (a "phase II") → `maintenance`

Announce it: *"Stage: **mvp** → push to main freely, CI must stay green, Railway auto-deploys staging. Promote to `demo` before the client review."*

## The stage ladder

Persimmon deploys via **Railway auto-deploy on push to `main`**, with GitHub Actions CI (lint / typecheck / `prisma validate` / build) running on every push and PR. Pushing to `main` directly is acceptable for solo work at early stages; what ratchets is the **gates around the push**: backups, the full CI + E2E suite, the production-readiness check, and tagging.

| Axis | `prototype` | `mvp` | `demo` | `production` | `maintenance` |
|---|---|---|---|---|---|
| **Goal** | prove/explore; throwaway OK | build toward first client demo | client reviewing on Railway staging | live for real users / handed off | post-handoff / phase-II on a live app |
| **Branch** | main direct | main direct | main direct | short branch + PR for risky work | **short branch + self-review for anything non-trivial** |
| **Commit/push** | freely, sloppy OK | **per-task, push often** | per-task, push often | per change, clean messages | small, isolated, reversible |
| **CI gate** | lint only (informational) | **CI must pass** (lint, `tsc --noEmit`, `prisma validate`, build) | CI must pass | CI **+ Playwright smoke** on critical flows | CI + smoke on touched flows |
| **Deploy** | optional, ad-hoc | **Railway auto-deploy on push (staging)** | auto to staging; demo creds verified | **backup-gated**; deliberate promote | **backup-first, always**; off-peak |
| **DB backup before deploy** | no | best-effort | best-effort | **required (Railway DB snapshot), restorable, tested** | **required** |
| **Tests/quality bar** | none | smoke on critical paths | critical paths green | **full `quality-production-readiness`** before first prod deploy | regression-check the touched area |
| **Release marker** | none | none | none | **git tag + note** | tag patch releases |
| **Decision posture** | decide everything, move fast | default-and-present | default-and-present; log client Qs | careful on money/data/schema; ask when costly | **conservative — assume live data; ask before destructive** |
| **Set when** | spike begins | scaffold done (repo+CI+DB up) | feature-complete enough to show | client sign-off / cutover | after handoff |

### Reading the ladder

- **Left of `production`, optimize for speed**: push to main, let Railway redeploy staging on every push, don't gold-plate. The cost of a broken staging deploy is near zero; the cost of slowing the build is real.
- **At `production`, optimize for safety**: every deploy is backup-gated and preceded by green CI + a Playwright smoke; the first prod deploy clears the full `quality-production-readiness` check; cut a git tag so you can roll back to a known-good (Railway redeploys a previous commit).
- **`maintenance` is the most cautious stage**, not the least: the client is live, so assume real data, prefer a short branch + self-review (`workflow-code-review`), snapshot the DB before touching anything, and ask before destructive changes. A "small" change on a live app is never trivial.

## Stage transitions (record them)

A transition is a real event — announce it and note it in the project's `docs/context/decisions.md` (or `CLAUDE.md` if no decisions log):

- **`mvp` → `demo`**: feature-complete enough to show. Verify demo credentials (`security-demo-credentials`), confirm `APP_ENV=demo|staging` on the Railway staging service, run a Playwright smoke of the critical flows, and **run the traceability audit as a gate**: `node <persimmon-skills>/scripts/traceability-audit.mjs <docs-root> --gate` — zero orphans before the demo build is cut (`workflow-traceability`). The audit is report-only mid-build; **this transition is where it gates** (ADR-0006).
- **`demo` → `production`**: client sign-off. Run the full `quality-production-readiness` check, the **traceability audit `--gate` again**, confirm the Railway DB backup + restore work, rotate any demo/leaked credentials, **tag the release**, then promote.
- **`production` → `maintenance`** / **handoff**: after `client-handoff`. **Emit the full RTM as a client-facing deliverable** (the headline traceability payout under "client keeps the code and the keys"). From here, every change is backup-first and self-reviewed.

Update `.claude/project-stage` on transition. The next session reads the new rules automatically.

## How this composes with the other gates

- **The workflow gate (`persimmon` master / `workflow` mother) is orthogonal and still applies.** Stage governs *commit/push/deploy procedure*; workflow governs *spec-before-code*. A `production` change still needs a spec+plan if it's non-trivial; an `mvp` typo fix still bypasses workflow. Don't let a loose stage become an excuse to skip the spec on a real feature.
- **`infra-railway-deploy`** owns the deploy mechanics + the DB-backup/restore the production/maintenance gate requires.
- **`quality-production-readiness`** is the `demo → production` gate.
- **The CI cadence** (auto-deploy on push below `production`; backup-gated at/after) reads from the stage.

## Anti-patterns

- Treating `maintenance` as "low stakes" — it's the highest-stakes stage (live client data).
- Carrying `mvp` deploy-on-every-push habits into `production` without the backup gate.
- Imposing PR/branch ceremony on a solo `prototype`/`mvp` — it just slows you down with no safety gain.
- Skipping the `demo → production` production-readiness check because "it already works on staging."
- Leaving `.claude/project-stage` stale after a cutover — the rules silently stay too loose.

## Relationship to other skills

| Skill | Relationship |
|---|---|
| `persimmon` | Master router; its session orientation announces the stage via this skill |
| `meta-new-client-project` | Sets `mvp` and stands up repo+CI+DB at the start |
| `infra-railway-deploy` | Deploy mechanics + DB backup/restore; the production/maintenance gate requires it |
| `quality-production-readiness` | The `demo → production` gate |
| `workflow-traceability` | Supplies the tiering matrix keyed on `project-stage`; the demo/handoff audit gate |
| `client-handoff` | The `production → maintenance` transition (emits the client-facing RTM) |
