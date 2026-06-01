# ADR-0002: Distribute skills as a plugin + marketplace (not `skillSources`)

## Status

Accepted (2026-06-01)

## Context

We needed one central skills repo usable across many client projects. The `aslan-skills` `install-in-project.sh` wired projects by writing a `"skillSources"` array into `.claude/settings.json`. Research against current Claude Code documentation found **no `skillSources` setting exists** — the documented skill scopes are personal (`~/.claude/skills/`), project (`.claude/skills/`), plugin (`<plugin>/skills/`, namespaced), and `--add-dir` ([Extend Claude with skills](https://code.claude.com/docs/en/skills)). The `permissions.additionalDirectories` setting grants file access only and does **not** load skills. So aslan's wiring key is effectively a no-op and must not be copied.

Available real mechanisms to share one repo across projects:
- **Plugin + marketplace** — versioned, namespaced, updatable ([Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [Plugins reference](https://code.claude.com/docs/en/plugins-reference)).
- Clone/copy into each project's `.claude/skills/` — simple, but unversioned and not namespaced.
- `--add-dir` flag — loads skills from the added directory, but is per-invocation, not committed config.

## Decision

Distribute the repo as a single Claude Code **plugin** published through a **marketplace** both defined in this repo:

- `.claude-plugin/plugin.json` (plugin `persimmon`, versioned) at repo root; the existing `skills/` and `hooks/` are the plugin's components.
- `.claude-plugin/marketplace.json` (marketplace `persimmon-labs`) listing the `persimmon` plugin.
- Client projects install with `claude plugin marketplace add <repo>` then `claude plugin install persimmon@persimmon-labs --scope project`, which writes a valid `enabledPlugins` entry to the project's `.claude/settings.json` (committed → every collaborator gets it).
- `scripts/install-in-project.sh` automates this and additionally: writes `.claude/project-type`, copies the bootstrap text into the project, **merges a SessionStart hook into the project's own `.claude/settings.json`** (verified-valid hook shape — the workflow-gate reminder; the plugin itself carries only skills), and appends a CLAUDE.md routing note.

Skills become namespaced `persimmon:<skill>` and auto-route by description as normal. Versioning via `plugin.json` `version` (bump per release) lets us pin the live Piccino project to a known-good version.

## Consequences

- **Positive:** versioned, updatable (`/plugin marketplace update`), namespaced (no collisions), and the SessionStart workflow hook ships in the same package.
- **Cost:** a one-time `/plugin` setup per project; skills carry a `persimmon:` prefix on explicit `/` invocation.
- **Migration safety:** Piccino stays on its pinned version until the renamed/restructured set is verified, then we bump.
- The clone/sync path remains available as a low-tech fallback via `meta-skill-sync`.
