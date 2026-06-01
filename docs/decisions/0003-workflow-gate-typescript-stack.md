# ADR-0003: Workflow gate adapted to the TypeScript/Prisma stack

## Status

Accepted (2026-06-01)

## Context

Persimmon work risks the same two failure modes that motivated aslan's workflow layer: (a) Claude one-shots features that drift from what the client agreed to, and (b) code ships without anyone internalizing the business consequence for the client's operators. obra/superpowers is the most credible community framework for AI-coding workflow discipline and has been in Anthropic's official plugin marketplace since 2026-01-15 ([obra/superpowers](https://github.com/obra/superpowers), [Anthropic plugin page](https://claude.com/plugins/superpowers)). A peer-reviewed registered report on specification-driven LLM code generation was accepted at **SANER 2026** ([arXiv 2601.03878](https://arxiv.org/html/2601.03878v1)), and GitHub's Spec Kit reflects the same industry direction; the evidence that spec-first improves output quality is directional but credible.

aslan's workflow `verify` step relies on a PHP audit script + Playwright — neither fits Persimmon's stack.

## Decision

Add a `workflow` mother (the gate) with 7 children: `workflow-brainstorm`, `-plan`, `-execute`, `-verify`, `-debug`, `-code-review`, `-finish`. Adaptations:

- **Spec template requires a `## Business meaning` section** (operator impact); approval blocks without it.
- **Plan requires `**Why this matters:**` per task** + EARS acceptance criteria + a `human-blocked` state for client-dependent tasks.
- **`workflow-verify` replaces PHP-audit + Playwright with the Persimmon toolchain:** `tsc --noEmit`, `eslint`, `prisma validate`/`migrate diff`, `vitest`/Playwright, Zod-boundary presence, and a `npm run build` + `force-dynamic` sanity check.
- **Specs/plans live in the CLIENT repo** under `docs/specs/` and `docs/plans/`, never in the skills repo.
- **Gate strength is tiered** by `.claude/project-type` (`internal-tool` strict / `marketing-site` light), with a `skip workflow:` user override logged in the commit footer.

Deliberately not ported as separate skills: `using-superpowers` (the `persimmon` master plays that role), `writing-skills` (CLAUDE.md covers it). `using-git-worktrees` and parallel-agent dispatch are folded into `workflow-execute` as opt-in notes.

## Consequences

- Every non-trivial change ships with an approved spec + plan tied to a client outcome.
- Verification is evidence-based and stack-native.
- Adds friction to fast fixes — mitigated by the trivial-bypass list and `skip workflow:` override; revisit the bypass list if override fires on >20% of tasks.
- The `## Business meaning` gate can invite placeholder text on mechanical work — the documented escape hatch keeps it honest.
