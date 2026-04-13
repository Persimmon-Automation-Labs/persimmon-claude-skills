---
name: skill-sync
description: Sync Persimmon Automation Labs skills into a project's .claude/ directory. Use after cloning persimmon-claude-skills, after pulling updates, when setting up a new client repo, when skills aren't activating, or when onboarding a developer. Triggers — "setup skills", "sync skills", "install skills", "onboard", ".claude not working", "skills missing".
---

# Skill Sync — Install Persimmon Skills Into a Project

## Overview

Persimmon skills live in a central repo (`persimmon-claude-skills`). Each client project consumes them via its own `.claude/` directory. Claude Code auto-activates skills based on trigger keywords in the `description:` frontmatter field of every `SKILL.md` under `.claude/skills/`.

This skill handles three distinct modes:

| Mode | When to use |
|---|---|
| **A. First-time setup** | Project has no `.claude/` — fresh clone into place |
| **B. Update existing** | Project already has `.claude/` — pull latest skills |
| **C. Selective sync** | Pull new skills only, preserve project customizations |

Ask the user which mode before running anything if it isn't obvious from context.

---

## Step 1: Detect State

Run all checks in parallel. Do not skip — the wrong mode overwrites work.

```bash
# Are we at the project root?
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
echo "Project root: $PROJECT_ROOT"

# Does .claude already exist?
if [ -d "$PROJECT_ROOT/.claude" ]; then
  echo "STATE: .claude exists"
  ls "$PROJECT_ROOT/.claude/skills/" 2>/dev/null | head -20
  # Is it a git clone of persimmon-claude-skills?
  git -C "$PROJECT_ROOT/.claude" remote get-url origin 2>/dev/null
else
  echo "STATE: .claude missing — first-time setup"
fi

# Locate the source repo (for Mode C)
for dir in \
  ~/Documents/Projects/persimmon-claude-skills \
  ~/Projects/persimmon-claude-skills \
  ~/persimmon-claude-skills; do
  if [ -d "$dir/skills" ]; then
    echo "SOURCE_REPO=$dir"
    break
  fi
done
```

Decision table:

| Detected | Mode |
|---|---|
| `.claude/` missing | A (first-time setup) |
| `.claude/` present, is a git clone of persimmon-claude-skills | B (update existing) |
| `.claude/` present, not a git clone, has custom skills | C (selective sync) |
| `.claude/` present, git clone, user wants to keep custom skills | C |

---

## Step 2A: First-Time Setup (Mode A)

Clone the skills repo directly into `.claude/`. This is the cleanest approach — `.claude/` becomes a git submodule-ish clone that you can `git pull` to update.

```bash
cd "$PROJECT_ROOT"

# Clone skills repo as .claude
git clone https://github.com/Persimmon-Automation-Labs/persimmon-claude-skills.git .claude

# Add to project .gitignore — the skills repo tracks itself
echo ".claude/" >> .gitignore

# Verify
ls .claude/skills/ | wc -l
echo "Skills installed."
```

**Why `.gitignore`?** The project doesn't need to vendor a copy of skills into its own git history. Each developer clones `.claude/` independently. Skills are versioned in their own repo.

**Exception**: If the client explicitly wants skills frozen into the repo (contract handoff, air-gapped environments), do not gitignore — commit the `.claude/` folder with `.claude/.git/` removed:

```bash
# Only if client wants skills vendored into their repo
rm -rf .claude/.git
git add .claude/
git commit -m "Vendor Persimmon skills snapshot"
```

---

## Step 2B: Update Existing (Mode B)

Project already has `.claude/` as a clone. Just pull.

```bash
cd "$PROJECT_ROOT/.claude"
git fetch origin
git status

# If clean:
git pull origin main

# If you have local commits (don't — skills should be edited in the source repo):
git stash
git pull --rebase origin main
git stash pop
```

**If conflicts**: stop. Local edits mean someone customized skills inside a project's `.claude/`. That's Mode C territory — do not force-merge.

---

## Step 2C: Selective Sync (Mode C)

Pull new skills from the source repo without touching customized ones.

```bash
SOURCE_REPO=~/Documents/Projects/persimmon-claude-skills
TARGET="$PROJECT_ROOT/.claude/skills"

# First, update the source
(cd "$SOURCE_REPO" && git pull origin main)

# List skills that exist in source but not in target
for skill in "$SOURCE_REPO/skills/"*/; do
  name=$(basename "$skill")
  if [ ! -d "$TARGET/$name" ]; then
    echo "NEW: $name (will copy)"
  else
    # Compare — are there upstream changes worth showing?
    if ! diff -rq "$skill" "$TARGET/$name" > /dev/null 2>&1; then
      echo "DIVERGED: $name (skipping — review manually)"
    fi
  fi
done
```

For each NEW skill, copy it over:

```bash
cp -r "$SOURCE_REPO/skills/NEW_SKILL_NAME" "$TARGET/"
```

For each DIVERGED skill, show the user a diff and let them decide:

```bash
diff -u "$TARGET/$name/SKILL.md" "$SOURCE_REPO/skills/$name/SKILL.md"
```

**Never auto-merge diverged skills.** Customizations exist for a reason — ask the user which version wins.

---

## Step 3: Verify

Claude Code discovers skills by walking `.claude/skills/*/SKILL.md`. Confirm the install:

```bash
ls -d "$PROJECT_ROOT/.claude/skills/"*/ | wc -l
# Expect: 25-30 skills (catalog in README.md)

# Spot-check a few have valid frontmatter
for skill in skill-sync document-project new-client-project project-xray adr-authoring; do
  path="$PROJECT_ROOT/.claude/skills/$skill/SKILL.md"
  if [ -f "$path" ]; then
    head -5 "$path"
    echo "---"
  else
    echo "MISSING: $skill"
  fi
done
```

Every `SKILL.md` must have:

```yaml
---
name: skill-kebab-name
description: One-sentence description with trigger keywords.
---
```

If frontmatter is malformed, Claude Code silently skips the skill. Fix by re-running Mode B pull or editing the frontmatter.

---

## Step 4: How Skills Activate

Claude Code scans every `SKILL.md` description at session start. When a user message matches trigger keywords, the skill body is loaded into context. There is no explicit `/skill-name` invocation required — it's pattern-matched.

Example triggers (from the Persimmon catalog):

| User says | Skill loaded |
|---|---|
| "new client", "onboard", "SOW" | `new-client-project` |
| "audit docs", "update README", "add ADR" | `document-project` |
| "walk me through this project" | `project-xray` |
| "write an ADR for X" | `adr-authoring` |
| "deploy to Railway", "custom domain" | `railway-deploy` |
| "RAG", "embeddings", "pgvector" | `rag-retrieval` |
| "security review", "audit" | `review-security` |

**To force-load a skill**, mention its exact name ("invoke `document-project`") or the user runs `/document-project` if a matching slash command exists.

**Per-project override**: if a project ships its own `.claude/skills/foo/` with the same name as an upstream skill, the project version wins. This is the supported customization path.

---

## Step 5: Commit (If Applicable)

If you vendored skills (Mode A without `.gitignore`, or Mode C):

```bash
cd "$PROJECT_ROOT"
git add .claude/ .gitignore
git commit -m "chore: sync Persimmon skills"
```

Do not commit if `.claude/` is gitignored — nothing to commit.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Skills not activating | Typo in `name:` frontmatter, or missing `---` delimiters | Validate frontmatter with `head -5 SKILL.md` |
| "skill not found" | `.claude/skills/` directory doesn't exist at project root | Rerun Mode A |
| Old skill version loading | `.claude/` is a stale copy, not a clone | `rm -rf .claude && rerun Mode A` |
| Two skills fighting | Same skill name in both `~/.claude/skills/` and project `.claude/skills/` | Project wins — if wrong, delete the global one |
| `gh` or git auth error | Persimmon repo requires org access | `gh auth switch --user renatodap`, then verify org membership |
| Merge conflict on pull | Someone edited a skill inside the project `.claude/` | Move that edit to the source repo, revert local, pull again |

---

## Anti-Patterns

- Do not edit skills inside a project's `.claude/skills/` — edit in `persimmon-claude-skills` and re-sync. Exception: intentional per-project overrides, which should be called out in the project's `CLAUDE.md`.
- Do not symlink `.claude/` to the source repo — breaks on Windows, breaks for teammates who don't have the repo cloned.
- Do not copy-paste skill bodies between projects. If two skills are shared, they belong upstream.
- Do not commit `.claude/.git/` to the project repo — vendor by removing it first.

---

## Done

Show the user:

```
SKILLS SYNCED — {project_name}
============================================
Mode:       {A/B/C}
Location:   {PROJECT_ROOT}/.claude/skills
Skills:     {count}
Source:     persimmon-claude-skills @ {commit_sha_short}
============================================

Try one of these to verify:
  "audit docs"         -> document-project activates
  "walk me through"    -> project-xray activates
  "write an ADR"       -> adr-authoring activates
```
