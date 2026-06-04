---
name: meta-skill-sync
description: Install or update the Persimmon Automation Labs skills in a client project. Use when setting up a new client repo, when skills aren't activating, after the skills repo releases a new version, or when onboarding a developer. Primary path is the Persimmon plugin (marketplace); a clone/copy fallback is documented for offline/air-gapped use. Triggers — "setup skills", "sync skills", "install skills", "onboard", "skills missing", "skills not activating", "update skills".
---

# Skill Sync — Install Persimmon Skills Into a Project

Persimmon skills are distributed as a Claude Code **plugin** (`persimmon`) published through a marketplace (`persimmon-labs`) defined in the `persimmon-claude-skills` repo. See `docs/decisions/0002-distribute-as-plugin-marketplace.md` for why. There is **no `skillSources` setting** in Claude Code — do not try to wire skills that way.

## Primary path — the install script (recommended)

From a checkout of `persimmon-claude-skills`:

```bash
./scripts/install-in-project.sh /path/to/client-project --type internal-tool
# or --type marketing-site
```

It registers the marketplace, installs the `persimmon` plugin at **project scope** (writes a valid `enabledPlugins` entry to the project's `.claude/settings.json`, committed so teammates inherit it), writes `.claude/project-type`, installs the SessionStart bootstrap hook, and appends a routing note to the project's `CLAUDE.md`. Idempotent.

## Manual plugin install

If you'd rather run it by hand inside the project's Claude session (or the `claude` CLI isn't on PATH):

```bash
# CLI form (writes enabledPlugins to .claude/settings.json at project scope)
claude plugin marketplace add Persimmon-Automation-Labs/persimmon-claude-skills
claude plugin install persimmon@persimmon-labs --scope project
```

Or the in-session slash-command form:

```
/plugin marketplace add Persimmon-Automation-Labs/persimmon-claude-skills
/plugin install persimmon@persimmon-labs
```

## Updating

The plugin is versioned via `.claude-plugin/plugin.json`. To pick up a new release:

```bash
claude plugin marketplace update persimmon-labs
# pinned consumers (e.g. the live Piccino project) update only when ready
```

Bump `version` in `plugin.json` + `marketplace.json` on every release so consumers update intentionally.

## Fallback — clone/copy (offline / air-gapped / contract handoff)

When a plugin install isn't viable (no network, client wants skills vendored into their repo), copy the skills into the project's project-scope skills directory:

```bash
# Vendor a snapshot into the project (skills load from .claude/skills/<name>/SKILL.md)
cp -r /path/to/persimmon-claude-skills/skills /path/to/client-project/.claude/skills
```

Project-scope skills under `.claude/skills/` load after the workspace trust dialog and walk up to the repo root. This loses versioning and the `persimmon:` namespace — prefer the plugin where possible. If vendoring into git, commit `.claude/skills/` (no nested `.git`).

## Verify activation

```bash
# Plugin install:
claude plugin list   # expect: persimmon (enabled, project scope)

# Either path — confirm the master skill is discoverable:
#   start a session and run:  /persimmon   (or ask "invoke the persimmon skill")
```

Then sanity-check routing:

| User says | Skill loaded |
|---|---|
| "new client", "onboard", "SOW" | `meta-new-client-project` |
| "walk me through this project" | `meta-project-xray` |
| "write an ADR for X" | `meta-adr-authoring` |
| "deploy to Railway", "custom domain" | `infra-railway-deploy` |
| "RAG", "embeddings", "pgvector" | `ai-rag-retrieval` |
| "security review", "audit" | `security-review` |

If nothing activates: confirm the plugin is enabled (`claude plugin list`) or, for the fallback, that `.claude/skills/<name>/SKILL.md` files exist with valid `name`/`description` frontmatter (malformed frontmatter is silently skipped).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Skills not activating | Plugin not enabled at this scope | `claude plugin enable persimmon --scope project` |
| `plugin not found` | Marketplace not registered | `claude plugin marketplace add Persimmon-Automation-Labs/persimmon-claude-skills` |
| Old skill version loading | Plugin cache stale | `claude plugin marketplace update persimmon-labs` |
| A referenced skill seems "missing" / nonexistent | Plugin pinned to an older version — the skill was added upstream since | `claude plugin marketplace update persimmon-labs`; re-verify. **Never** conclude the skill doesn't exist and relabel it "inline methodology" — that's a stale-install signal, not a missing skill. |
| Two skills fighting | Same name in `~/.claude/skills/` and the plugin | Remove the personal copy; the plugin is authoritative |
| `gh`/git auth error | Repo requires org access | `gh auth switch --user renatodap`, verify org membership |

## Anti-patterns

- Reintroducing a `skillSources` settings key (it does not exist).
- Editing skills inside a consuming project — edit in `persimmon-claude-skills` and release a new plugin version. Intentional per-project overrides go in `.claude/skills/` and must be called out in the project's `CLAUDE.md`.
- Symlinking `.claude/` to the source repo (breaks on Windows and for teammates without the repo).
- Copy-pasting skill bodies between projects — shared content belongs upstream.
- Treating a skill that isn't in the available list as nonexistent and routing around it with "inline methodology" — it's a stale/disabled plugin; update and re-verify instead.

## Done

```
SKILLS INSTALLED — {project_name}
============================================
Method:     plugin (persimmon@persimmon-labs)  |  fallback: vendored
Scope:      project (.claude/settings.json enabledPlugins)
Project type: {internal-tool | marketing-site}
============================================
Verify:  invoke `persimmon`, then try "walk me through this project"
```
