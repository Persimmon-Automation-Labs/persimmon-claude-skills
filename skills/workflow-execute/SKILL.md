---
name: workflow-execute
description: Execute an approved Persimmon plan task-by-task. Use as step 3 of the workflow, after a plan exists. Implements one task at a time, verifies each before moving on, and parks client-blocked tasks. Trigger keywords: execute the plan, implement, build the tasks, work through the plan, start coding.
---

# Workflow — Execute

Step 3 of the Persimmon workflow. Implement the plan one task at a time.

## Prerequisites

An approved plan exists in `docs/plans/`. If not, go to `workflow-plan`.

## Process

1. **Work tasks in order.** For each `ready` task:
   - Implement only what the task scopes — YAGNI. Don't pull future tasks forward.
   - Follow the relevant domain mother's child skill for patterns (`stack-*`, `ai-*`, `data-*`, etc.).
   - Run the task's verification (the EARS criteria) before marking it done — see `workflow-verify`.
2. **Park `human-blocked` tasks.** Note what's needed from the client; continue with unblocked tasks. Never fabricate a client decision to unblock yourself.
3. **Keep the plan updated.** Check off tasks; record any scope change back into the spec (and re-confirm if Business meaning shifts).
4. **Commit per task** with a business-framed message: what changed for the operator first, technical detail second.

## Commit message convention

```
{operator-facing summary}

{technical detail}

Plan: docs/plans/YYYY-MM-DD-{topic}.md (Task N)
```

## Parallelism (opt-in)

For genuinely independent tasks, you may dispatch parallel subagents — but only when tasks don't share files and each has clear, self-contained acceptance criteria. Default to sequential.

## When NOT to use

If there's no plan, or the work is trivial, this skill doesn't apply.

## Relationship to other skills

Preceded by `workflow-plan`; each task gated by `workflow-verify`; failures handed to `workflow-debug`; finished via `workflow-code-review` → `workflow-finish`.
