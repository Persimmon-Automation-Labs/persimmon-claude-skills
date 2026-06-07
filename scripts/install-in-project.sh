#!/usr/bin/env bash
# Wire the Persimmon skills into a client project so every Claude Code session there
# has all Persimmon skills (via the plugin) and gets the workflow gate (via a SessionStart
# hook). See docs/decisions/0002-distribute-as-plugin-marketplace.md for why this uses
# the plugin/marketplace model rather than a (non-existent) "skillSources" setting.
#
# Usage:
#   ./install-in-project.sh /path/to/client-project [--type internal-tool|marketing-site] \
#                           [--stage prototype|mvp|demo|production|maintenance]
#
# What it does (idempotent — safe to re-run):
#   1. Registers this repo as a marketplace and installs the `persimmon` plugin at
#      project scope (writes a valid enabledPlugins entry to the project .claude/settings.json)
#   2. Writes .claude/project-type
#   2b. Writes .claude/project-stage (defaults to mvp; meta-lifecycle-stage applies the rules)
#   3. Copies templates/persimmon-bootstrap.txt -> project .claude/persimmon-bootstrap.txt
#      (with __PROJECT_TYPE__ and __PROJECT_STAGE__ substituted)
#   3b. Seeds .claude/project-rules.md (project source-of-truth: deploy/DB/repo facts) if absent
#   3c. Scaffolds docs/{requirements,decisions,context}/ + docs/README.md (never clobbers)
#   3d. Copies scripts/db.mjs (read-only Postgres CLI) + adds the "db" npm script
#   4. Merges SessionStart hooks into .claude/settings.json that cat the bootstrap AND
#      project-rules.md on every session (verified-valid hook shape)
#   5. Appends a skill-routing note to the project's CLAUDE.md

set -euo pipefail

PROJECT_DIR=""
PROJECT_TYPE=""
PROJECT_STAGE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --type) PROJECT_TYPE="${2:-}"; shift 2 ;;
    --type=*) PROJECT_TYPE="${1#*=}"; shift ;;
    --stage) PROJECT_STAGE="${2:-}"; shift 2 ;;
    --stage=*) PROJECT_STAGE="${1#*=}"; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) if [ -z "$PROJECT_DIR" ]; then PROJECT_DIR="$1"; else echo "Error: unexpected arg $1" >&2; exit 1; fi; shift ;;
  esac
done

[ -n "$PROJECT_DIR" ] || { echo "Usage: $0 /path/to/client-project [--type internal-tool|marketing-site] [--stage prototype|mvp|demo|production|maintenance]" >&2; exit 1; }
[ -d "$PROJECT_DIR" ] || { echo "Error: $PROJECT_DIR is not a directory" >&2; exit 1; }
case "$PROJECT_TYPE" in
  ""|internal-tool|marketing-site) ;;
  *) echo "Error: --type must be 'internal-tool' or 'marketing-site' (got: $PROJECT_TYPE)" >&2; exit 1 ;;
esac
case "$PROJECT_STAGE" in
  ""|prototype|mvp|demo|production|maintenance) ;;
  *) echo "Error: --stage must be one of prototype|mvp|demo|production|maintenance (got: $PROJECT_STAGE)" >&2; exit 1 ;;
esac

PERSIMMON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOOTSTRAP_TEMPLATE="$PERSIMMON_DIR/templates/persimmon-bootstrap.txt"
RULES_TEMPLATE="$PERSIMMON_DIR/templates/project-rules.md"
DB_TEMPLATE="$PERSIMMON_DIR/templates/db.mjs"
[ -f "$BOOTSTRAP_TEMPLATE" ] || { echo "Error: missing template at $BOOTSTRAP_TEMPLATE" >&2; exit 1; }

cd "$PROJECT_DIR"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
mkdir -p .claude

# ── 1. project-type ────────────────────────────────────────────────
PT_FILE=".claude/project-type"
if [ -f "$PT_FILE" ]; then
  PROJECT_TYPE="$(tr -d '[:space:]' < "$PT_FILE")"
  echo "✓ $PT_FILE already set to '$PROJECT_TYPE' (no change)"
else
  if [ -z "$PROJECT_TYPE" ]; then
    if [ -t 0 ]; then
      echo ""; echo "Project type for $PROJECT_NAME?"
      echo "  1) internal-tool  (admin / ops — full workflow gate)"
      echo "  2) marketing-site (public lead-gen — light gate)"
      read -r -p "Choose [1/2] (default 1): " choice
      case "${choice:-1}" in 2) PROJECT_TYPE="marketing-site" ;; *) PROJECT_TYPE="internal-tool" ;; esac
    else
      PROJECT_TYPE="internal-tool"; echo "⚠ Non-interactive; defaulting to internal-tool."
    fi
  fi
  echo "$PROJECT_TYPE" > "$PT_FILE"
  echo "✓ Wrote $PT_FILE → $PROJECT_TYPE"
fi

# ── 1b. project-stage ──────────────────────────────────────────────
# Lifecycle stage governs commit/push/branch/deploy rigor (meta-lifecycle-stage skill).
# Rigor ratchets up: prototype → mvp → demo → production → maintenance.
PS_FILE=".claude/project-stage"
if [ -f "$PS_FILE" ]; then
  PROJECT_STAGE="$(tr -d '[:space:]' < "$PS_FILE")"
  echo "✓ $PS_FILE already set to '$PROJECT_STAGE' (no change)"
else
  [ -z "$PROJECT_STAGE" ] && PROJECT_STAGE="mvp"   # new engagement default
  echo "$PROJECT_STAGE" > "$PS_FILE"
  echo "✓ Wrote $PS_FILE → $PROJECT_STAGE (meta-lifecycle-stage rules apply)"
fi

# ── 2. Install the plugin at project scope ─────────────────────────
# Registers this repo as a marketplace and installs the persimmon plugin. Writes a valid
# enabledPlugins entry to .claude/settings.json. For a GitHub-hosted client setup, replace
# the local path with: claude plugin marketplace add Persimmon-Automation-Labs/persimmon-claude-skills
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add "$PERSIMMON_DIR" 2>/dev/null || echo "  (marketplace already registered)"
  claude plugin install persimmon@persimmon-labs --scope project 2>/dev/null || echo "  (plugin already installed at project scope)"
  echo "✓ persimmon plugin installed at project scope"
else
  echo "⚠ 'claude' CLI not found on PATH. Run these once inside the project:"
  echo "    /plugin marketplace add $PERSIMMON_DIR"
  echo "    /plugin install persimmon@persimmon-labs"
fi

# ── 3. Bootstrap file ──────────────────────────────────────────────
BOOTSTRAP_FILE=".claude/persimmon-bootstrap.txt"
sed -e "s|__PROJECT_TYPE__|$PROJECT_TYPE|g" \
    -e "s|__PROJECT_STAGE__|$PROJECT_STAGE|g" \
    "$BOOTSTRAP_TEMPLATE" > "$BOOTSTRAP_FILE"
echo "✓ Wrote $BOOTSTRAP_FILE (type: $PROJECT_TYPE, stage: $PROJECT_STAGE)"

# ── 3b. project-rules.md (project source-of-truth memory) ──────────
# Seeded once from the template with light substitution; the project then maintains it.
# Auto-loaded each session via the SessionStart hook below.
RULES_FILE=".claude/project-rules.md"
if [ -f "$RULES_FILE" ]; then
  echo "✓ $RULES_FILE already present (no change — project maintains it)"
elif [ -f "$RULES_TEMPLATE" ]; then
  sed -e "s|__PROJECT_NAME__|$PROJECT_NAME|g" \
      -e "s|__PROJECT_TYPE__|$PROJECT_TYPE|g" \
      -e "s|__PROJECT_STAGE__|$PROJECT_STAGE|g" \
      "$RULES_TEMPLATE" > "$RULES_FILE"
  echo "✓ Seeded $RULES_FILE — fill in deploy/DB/repo specifics (placeholders remain for __GITHUB_REPO__, __DB_NAME__, etc.)"
else
  echo "⚠ Rules template missing at $RULES_TEMPLATE — skipped project-rules.md"
fi

# ── 3c. docs/ knowledge base (lean homes; never clobbers) ──────────
# The workflow-traceability convention. Persimmon client repos already use docs/specs,
# docs/plans, docs/decisions; this adds requirements/ + context/ + stubs only where absent.
seed() { [ -f "$1" ] || { printf '%s\n' "$2" > "$1"; echo "✓ seeded $1"; }; }
mkdir -p docs/requirements docs/decisions docs/context/meetings docs/specs docs/plans
seed docs/README.md "# ${PROJECT_NAME} — docs map

- \`requirements/\` — personas, EARS requirements (REQ-*), flow registry + RTM (the WHAT, traces to SOW)
- \`decisions/\` — ADRs (immutable, numbered; engineering/industry/preference calls — see \`meta-adr-authoring\`)
- \`specs/\` — design specs + mockups (the HOW)
- \`plans/\` — implementation plans (tasks cite REQ + SCREEN)
- \`context/\` — client decisions log, open questions, changelog, meeting notes

Traceability model + tiering matrix: the \`workflow-traceability\` skill.
Audit (report): \`node <persimmon-skills>/scripts/traceability-audit.mjs docs\`"
seed docs/requirements/requirements.md "# Requirements (EARS, REQ-*)
<!-- ### REQ-${PROJECT_NAME}-<AREA>-001
     - **Source:** SOW §<x> | ADR-NNNN | constitution:<skill>
     - **EARS:** <criterion>   - **Status:** active -->"
seed docs/requirements/personas.md "# Personas (PERSONA-*)
<!-- ### PERSONA-<slug>
     - Context / Goals / Constraints / Measured-on -->"
seed docs/requirements/flows.md "# Flows + RTM (FLOW-*)
<!-- ### FLOW-01 — <title>
     - **Personas:** PERSONA-<slug>   - **Source:** SOW §<x> | REQ-...
     - **Screens:** SCREEN-<slug>   - **Covered/Built/Verified/Usable:** ... -->"
seed docs/decisions/README.md "# ADR index
<!-- id · title · status — one line per NNNN-<slug>.md -->"
seed docs/context/decisions.md "# Confirmed client decisions (dated, append-only)"
seed docs/context/open-questions.md "# Open client questions (Q-*)"
seed docs/context/changelog.md "# Change log — what / why / who decided / which meeting / which REQ-ADR (supersede, never delete)"

# ── 3d. db CLI (read-only-by-default Postgres CLI) ─────────────────
# Copies scripts/db.mjs so Claude can query the DB without writing throwaway
# scripts. Never clobbers an existing one. See the data-db-cli skill.
if [ -f "$DB_TEMPLATE" ]; then
  mkdir -p scripts
  if [ -f scripts/db.mjs ]; then
    echo "✓ scripts/db.mjs already present (no change)"
  else
    cp "$DB_TEMPLATE" scripts/db.mjs
    echo "✓ Copied scripts/db.mjs (run \`npm i -D pg\` once; then \`npm run db tables\`)"
  fi
  # Add the "db" npm script if package.json exists and lacks it.
  if [ -f package.json ] && PYBIN="$(command -v python3 || command -v python || command -v py || true)"; [ -n "${PYBIN:-}" ]; then
    "$PYBIN" - package.json <<'PYEOF'
import json, sys
p = sys.argv[1]
with open(p) as f: data = json.load(f)
scripts = data.setdefault("scripts", {})
if "db" not in scripts:
    scripts["db"] = "node scripts/db.mjs"
    with open(p, "w") as f: json.dump(data, f, indent=2); f.write("\n")
    print('✓ Added "db" script to package.json (npm run db …)')
else:
    print('✓ package.json already has a "db" script (no change)')
PYEOF
  fi
fi

# ── 4. SessionStart hooks in project settings ──────────────────────
SETTINGS_FILE=".claude/settings.json"
TARGET_CMD='cat "$CLAUDE_PROJECT_DIR/.claude/persimmon-bootstrap.txt"'
RULES_CMD='cat "$CLAUDE_PROJECT_DIR/.claude/project-rules.md" 2>/dev/null'
if [ ! -f "$SETTINGS_FILE" ]; then
  cat > "$SETTINGS_FILE" <<EOF
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "$TARGET_CMD" } ] },
      { "hooks": [ { "type": "command", "command": "$RULES_CMD" } ] }
    ]
  }
}
EOF
  echo "✓ Created $SETTINGS_FILE with SessionStart hooks (bootstrap + project-rules)"
elif PYTHON="$(command -v python3 || command -v python || command -v py || true)"; [ -n "$PYTHON" ]; then
  # Windows often ships `python`/`py` rather than `python3`.
  "$PYTHON" - "$SETTINGS_FILE" "$TARGET_CMD" "$RULES_CMD" <<'PYEOF'
import json, sys
path, cmd, rules_cmd = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: data = json.load(f)
hooks = data.setdefault("hooks", {})
ss = hooks.setdefault("SessionStart", [])
def has_cmd(c): return any(h.get("command") == c for g in ss for h in g.get("hooks", []))
changed = False
for c in (cmd, rules_cmd):
    if not has_cmd(c):
        ss.append({"hooks": [{"type": "command", "command": c}]}); changed = True
if changed:
    with open(path, "w") as f: json.dump(data, f, indent=2); f.write("\n")
    print(f"✓ Updated {path} (SessionStart hooks)")
else:
    print(f"✓ {path} already has the SessionStart hooks (no change)")
PYEOF
else
  echo "⚠ $SETTINGS_FILE exists and no Python (python3/python/py) is available — add the SessionStart hooks manually:"
  echo "    \"SessionStart\": [ { \"hooks\": [ { \"type\": \"command\", \"command\": \"$TARGET_CMD\" } ] }, { \"hooks\": [ { \"type\": \"command\", \"command\": \"$RULES_CMD\" } ] } ]"
fi

# ── 5. CLAUDE.md routing note ──────────────────────────────────────
CLAUDE_FILE="CLAUDE.md"
MARKER="<!-- persimmon-skills:install -->"
NOTE=$(cat <<EOF

## Skill routing
$MARKER

**Project type:** \`$PROJECT_TYPE\` (see \`.claude/project-type\`) · **Stage:** \`$PROJECT_STAGE\` (see \`.claude/project-stage\`; rules → \`meta-lifecycle-stage\`).

For any work in this repo, invoke the \`persimmon\` master skill first. On non-trivial
tasks it routes to the \`workflow\` mother for brainstorm-before-code discipline. Project
facts (deploy, DB, repo) live in \`.claude/project-rules.md\`. To bypass the gate on a
legitimate fast-fix moment, type \`skip workflow:\` followed by what you want.
EOF
)
if [ ! -f "$CLAUDE_FILE" ]; then
  printf '# %s — Claude Code Context\n%s\n' "$PROJECT_NAME" "$NOTE" > "$CLAUDE_FILE"
  echo "✓ Created $CLAUDE_FILE with skill-routing note"
elif ! grep -q "$MARKER" "$CLAUDE_FILE"; then
  printf '%s\n' "$NOTE" >> "$CLAUDE_FILE"
  echo "✓ Appended skill-routing note to $CLAUDE_FILE"
else
  echo "✓ $CLAUDE_FILE already has the routing note (no change)"
fi

echo ""
echo "Done. $PROJECT_NAME is wired to Persimmon skills (plugin: persimmon@persimmon-labs)."
echo "Next session: invoke the \`persimmon\` skill to orient."
