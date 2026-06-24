---
name: workflow-feedback-loop
description: "Use between client review meetings — turn a meeting's mixed punch list into tracked items, triage fix vs design-call vs feature, and close each to verified-on-staging so you walk into the next review with everything in place."
---

# Workflow — the between-meetings feedback loop

After the initial build (`workflow-brainstorm` → `-plan` → `-execute` → `-verify`), an engagement runs on **review meetings**. Each meeting hands back a jumbled punch list — bugs, "is this the best UX?", "now build X" — all mixed together. This skill is the discipline for closing one meeting's list and arriving at the next able to say, item by item, **"in place — here's where."** It is `workflow-verify`'s done-gate applied per punch-list item, in a client-review cadence.

## Trigger

- The client / Renato pasted a list of change requests, bugs, or questions
- "go through this list", "prep for the demo/review", "make sure everything's in place for the meeting"
- Any steady-state iteration cycle between review meetings on a live project

## 1. Capture the punch list — one item, one tracked line

Atomize the raw feedback into a numbered list (TodoWrite, or `docs/client-context/punch-list-YYYY-MM-DD.md`). Mixed feedback arrives as one paragraph; split it so **one fix = one line** — nothing drops, and each can be marked closed. A vague item ("scheduling is confusing") becomes a tracked question, not a silent guess.

## 2. Triage every item into one of three lanes

The pivotal move — a meeting list mixes three kinds of work that need *different* handling:

| Lane | What it is | How to handle |
|---|---|---|
| **Fix** | concrete defect / clear ask ("buttons stacked", "remove this copy", "title shouldn't wrap") | just do it → §4 |
| **Design call** | "is this the best UI/UX?" / "what's senior best-practice for X?" | answer with a recommendation **first** (§3), then build it |
| **Scoped feature** | a real multi-file build ("archive + bulk-select", "scheduling timeline") | scope it, confirm the sequence, then build (`workflow-execute`; dispatch subagents if parallelizable) |

Never collapse a *design call* into a blind fix — that throws away the consulting value the client is paying for.

## 3. Answer design questions like a senior, not an order-taker

When the item is "is this the best way?": give a **short verdict** (often "no — here's better"), the **reasoning**, and the **named best-practice pattern**, *then* build the recommendation. Record the resulting call in `docs/client-context/decisions.md` or an ADR via `meta-adr-authoring` if it's load-bearing, so the next meeting doesn't re-litigate it.

## 4. Close each item to *verified-on-staging* — the unit of done

An item is **not done when the code is written.** The loop, per item (or per safe batch):

1. Implement — apply the owning domain skill, never improvise.
2. Lint-gate locally — `tsc`, `eslint`, `prisma validate`, `node scripts/ai-tell-lint.mjs` for public-site changes.
3. Commit + push per `meta-lifecycle-stage` cadence.
4. Wait for **Railway deploy: success**.
5. **Verify the change on staging** — load the page / navigate the flow / DOM-measure. "Item updated" in the diff ≠ visible on the client's URL.

A ticked item whose change you haven't *seen live* is a lie.

## 5. Serialize the deploy gate

On an auto-deploy-on-push Railway repo, **commit only complete items** — never let a half-built fix ride a push to the client's staging URL. When fanning out background agents, partition by disjoint files and route the deploy through yourself (see `workflow-execute` → "Background agents on an auto-deploy repo").

## 6. Arrive at the next meeting review-ready

The output of a close-out cycle is a status you can *walk*: each item → **"shipped & verified · &lt;where to look&gt;."** Then:

- Update the **demo-walkthrough script** (`client-handoff`) so the client can re-explore in demo order.
- Confirm **every flow is demoable** — idempotent seed data so no screen lands empty.
- Carry forward: items you couldn't close because they need the client go to `docs/client-context/open-questions.md` as the **next meeting's agenda**; new settled design calls go to `docs/client-context/decisions.md`.

## Anti-patterns

- Treating a "is this best?" question as a blind fix — you skip the senior recommendation.
- Marking an item done from the diff without seeing it on staging.
- Letting the punch list live only in chat — untracked items drop.
- Re-litigating a decision already recorded in `decisions.md`.
- Pushing a half-built item to an auto-deploy Railway repo.
- Walking into the meeting with an empty-data screen on a flow you "finished."

## Relationship to Other Skills

| Skill | Relationship |
|---|---|
| `workflow-verify` | The done-gate battery; this applies it per punch-list item, in a review cadence |
| `workflow-execute` | How to build each scoped-feature item (+ background-agent orchestration on auto-deploy repos) |
| `client-handoff` | The demo-walkthrough script + demoable-seed-data the review-ready state depends on |
| `meta-adr-authoring` | Where load-bearing design calls land so they aren't re-litigated |
| `meta-lifecycle-stage` | Commit/push/deploy rigor per project stage |
