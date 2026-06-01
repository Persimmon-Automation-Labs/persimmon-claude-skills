# ADR-0001: Master → mother → child skill structure

## Status

Accepted (2026-06-01)

## Context

The repo had 29 flat skills under `skills/<name>/SKILL.md` with grouping that existed only as headings in `README.md`. There was no single entry point, no enforced routing, and skill descriptions competed in a flat namespace. A new Claude session (or developer) had no "where do I start?" answer, and related skills cross-referenced each other inconsistently.

The sibling repo `aslan-skills` had already proven a three-level **master → mother → child** routing structure across 14 client projects. Anthropic's own skill guidance confirms the mechanics that make this work: only skill `name`+`description` metadata is preloaded, the body loads on trigger, and Claude routes purely on the `description` ([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).

## Decision

Adopt three levels:

1. **`persimmon` (master)** — invoked first on any Persimmon work; enforces the workflow gate, then routes to a domain mother.
2. **9 domain mothers** — `workflow`, `stack`, `ai`, `data`, `infra`, `security`, `quality`, `domain-legal`, `project-meta`. Each is a brief index (<100 lines): trigger, a child routing table, one-screen defaults, banned anti-patterns, relationships.
3. **Specialist children** — the implementation skills, renamed with a mother prefix (`stack-*`, `ai-*`, `infra-*`, `quality-*`, `legal-*`, `meta-*`, `security-*`, `data-*`, `workflow-*`).

Children stay focused (<500 lines per Anthropic guidance); mothers stay brief. Prefix grouping is a filesystem/readability convenience only — Claude routes on descriptions, not directory names — but it keeps the registry and catalog legible.

## Consequences

- New sessions orient within ~3 reads (master → mother → child).
- Adding a child = one row in the mother's routing table + the skill. No restructuring.
- Mothers become cross-cutting: a default that spans children must be updated in the mother too.
- Renaming the 29 children to prefixes is a one-time breaking change (see ADR-0003 for safety).
- Distribution as a plugin namespaces everything `persimmon:*`, eliminating description collisions with a client project's own skills (see ADR-0002).
