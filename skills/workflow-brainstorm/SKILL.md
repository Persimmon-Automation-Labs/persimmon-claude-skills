---
name: workflow-brainstorm
description: Brainstorm-before-code design dialogue for Persimmon work. Use as step 1 of the workflow on any non-trivial feature, page, integration, or schema change — BEFORE writing code. Produces an approved spec with a required Business meaning section. Trigger keywords: brainstorm, design this, spec, what should we build, scope this feature, requirements.
---

# Workflow — Brainstorm

Step 1 of the Persimmon workflow. Turn a rough request into an approved spec **before** any code. Adapted from obra/superpowers `brainstorming`.

## Trigger

- Any non-trivial new feature, page, integration, or schema change
- Routed here by the `workflow` mother / `persimmon` gate

## Process

1. **Ask one question at a time.** Refine the rough idea through a dialogue — do not dump a list of 10 questions. Cover: who operates this, what problem it solves, what success looks like, what's explicitly out of scope, and what data/integrations it touches.
2. **Surface alternatives.** Present 2–3 viable approaches with trade-offs (effort, risk, fit to the Persimmon stack). Recommend one.
3. **Present the design in sections** short enough to read. Get explicit sign-off per section before moving on.
4. **Write the spec** to the CLIENT repo at `docs/specs/YYYY-MM-DD-{topic}.md` using the template below.
5. **Block approval** if the `## Business meaning` section is missing or empty.

## Spec template

```markdown
# {Title}

## Business meaning
What this change means for the client's operators (not the code). Who does what
differently, and why it matters to the firm. (REQUIRED — approval blocks without it.)

## Problem
The concrete problem, in the operator's words.

## Goals / Non-goals
- Goal: …
- Non-goal: … (what we are deliberately NOT doing)

## Approach
Chosen approach + why, with the alternatives considered and rejected.

## Stack impact
New routes / Server Actions / Prisma models / migrations / prompts / env vars / deps.
Flag anything that needs `force-dynamic`, a new bucket/CORS origin, or a new secret.

## Risks & open questions
Anything still unknown or client-blocked.

## Acceptance (high level)
Bullet outcomes a human can verify. (Detailed EARS criteria come in `workflow-plan`.)
```

## Output

An approved spec at `docs/specs/YYYY-MM-DD-{topic}.md` in the client repo. On approval, hand off to `workflow-plan`.

## When NOT to use

Trivial edits (copy, one-line Tailwind, dependency bumps, typos) bypass — go straight to the relevant domain mother.

## Relationship to other skills

Followed by `workflow-plan`. The spec is the source of truth `workflow-code-review` checks against.
