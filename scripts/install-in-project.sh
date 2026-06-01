#!/usr/bin/env bash
# Wire the Persimmon skills into a client project so every Claude Code session there
# has all Persimmon skills (via the plugin) and gets the workflow gate (via a SessionStart
# hook). See docs/decisions/0002-distribute-as-plugin-marketplace.md for why this uses
# the plugin/marketplace model rather than a (non-existent) "skillSources" setting.
#
# Usage:
#   ./install-in-project.sh /path/to/client-project [--type internal-tool|marketing-site]
#
# What it does (idempotent — safe to re-run):
#   1. Registers this repo as a marketplace and installs the `persimmon` plugin at
#      project scope (writes a valid enabledPlugins entry to the project .claude/settings.json)
#   2. Writes .claude/project-type
#   3. Copies templates/persimmon-bootstrap.txt -> project .claude/persimmon-bootstrap.txt
#      (with __PROJECT_TYPE__ substituted)
#   4. Merges a SessionStart hook into the project .claude/settings.json that cats the
#      bootstrap on every session (verified-valid hook shape)
#   5. Appends a skill-routing note to the project's CLAUDE.md

set -euo pipefail

PROJECT_DIR=""
PROJECT_TYPE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --type) PROJECT_TYPE="${2:-}"; shift 2 ;;
    --type=*) PROJECT_TYPE="${1#*=}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) if [ -z "$PROJECT_DIR" ]; then PROJECT_DIR="$1"; else echo "Error: unexpected arg $1" >&2; exit 1; fi; shift ;;
  esac
done

[ -n "$PROJECT_DIR" ] || { echo "Usage: $0 /path/to/client-project [--type internal-tool|marketing-site]" >&2; exit 1; }
[ -d "$PROJECT_DIR" ] || { echo "Error: $PROJECT_DIR is not a directory" >&2; exit 1; }
case "$PROJECT_TYPE" in
  ""|internal-tool|marketing-site) ;;
  *) echo "Error: --type must be 'internal-tool' or 'marketing-site' (got: $PROJECT_TYPE)" >&2; exit 1 ;;
esac

PERSIMMON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOOTSTRAP_TEMPLATE="$PERSIMMON_DIR/templates/persimmon-bootstrap.txt"
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
sed "s|__PROJECT_TYPE__|$PROJECT_TYPE|g" "$BOOTSTRAP_TEMPLATE" > "$BOOTSTRAP_FILE"
echo "✓ Wrote $BOOTSTRAP_FILE"

# ── 4. SessionStart hook in project settings ───────────────────────
SETTINGS_FILE=".claude/settings.json"
TARGET_CMD='cat "$CLAUDE_PROJECT_DIR/.claude/persimmon-bootstrap.txt"'
if [ ! -f "$SETTINGS_FILE" ]; then
  cat > "$SETTINGS_FILE" <<EOF
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "$TARGET_CMD" } ] }
    ]
  }
}
EOF
  echo "✓ Created $SETTINGS_FILE with SessionStart bootstrap hook"
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$SETTINGS_FILE" "$TARGET_CMD" <<'PYEOF'
import json, sys
path, cmd = sys.argv[1], sys.argv[2]
with open(path) as f: data = json.load(f)
hooks = data.setdefault("hooks", {})
ss = hooks.setdefault("SessionStart", [])
present = any(h.get("command") == cmd for g in ss for h in g.get("hooks", []))
if not present:
    ss.append({"hooks": [{"type": "command", "command": cmd}]})
    with open(path, "w") as f: json.dump(data, f, indent=2); f.write("\n")
    print(f"✓ Updated {path} (SessionStart hook)")
else:
    print(f"✓ {path} already has the SessionStart hook (no change)")
PYEOF
else
  echo "⚠ $SETTINGS_FILE exists and python3 is unavailable — add the SessionStart hook manually:"
  echo "    \"SessionStart\": [ { \"hooks\": [ { \"type\": \"command\", \"command\": \"$TARGET_CMD\" } ] } ]"
fi

# ── 5. CLAUDE.md routing note ──────────────────────────────────────
CLAUDE_FILE="CLAUDE.md"
MARKER="<!-- persimmon-skills:install -->"
NOTE=$(cat <<EOF

## Skill routing
$MARKER

**Project type:** \`$PROJECT_TYPE\` (see \`.claude/project-type\`).

For any work in this repo, invoke the \`persimmon\` master skill first. On non-trivial
tasks it routes to the \`workflow\` mother for brainstorm-before-code discipline. To
bypass on a legitimate fast-fix moment, type \`skip workflow:\` followed by what you want.
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
