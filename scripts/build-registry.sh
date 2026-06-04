#!/usr/bin/env bash
# Generate skills.json — the versioned catalog of every skill in the repo.
# Run from repo root: ./scripts/build-registry.sh > skills.json
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="2.0.0"
GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Derive a mother for each skill from its directory-name prefix.
# Mother list is hard-coded so it stays authoritative.
mother_for() {
  case "$1" in
    persimmon) echo "" ;;                                   # master
    workflow|stack|ai|data|infra|security|quality|domain-legal|project-meta|frontend|backend|client-lifecycle) echo "" ;;  # mothers
    workflow-*) echo "workflow" ;;
    stack-*)    echo "stack" ;;
    ai-*)       echo "ai" ;;
    data-*)     echo "data" ;;
    infra-*)    echo "infra" ;;
    security-*) echo "security" ;;
    quality-*)  echo "quality" ;;
    legal-*)    echo "domain-legal" ;;
    meta-*)     echo "project-meta" ;;
    frontend-*) echo "frontend" ;;
    backend-*)  echo "backend" ;;
    client-*)   echo "client-lifecycle" ;;
    *)          echo "" ;;
  esac
}

skills_json=""
first=true
for dir in skills/*/; do
  [ -f "${dir}SKILL.md" ] || continue
  name=$(basename "$dir")
  mother=$(mother_for "$name")
  description=$(awk '
    /^---$/ { if (in_fm) exit; in_fm=1; next }
    in_fm && /^description:/ {
      sub(/^description: */, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "${dir}SKILL.md")
  description_escaped=$(printf '%s' "$description" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g')
  lines=$(wc -l < "${dir}SKILL.md" | tr -d ' ')

  if [ "$first" = false ]; then skills_json="${skills_json},"; fi
  first=false
  skills_json="${skills_json}
    {\"name\": \"${name}\", \"mother\": \"${mother}\", \"lines\": ${lines}, \"description\": \"${description_escaped}\"}"
done

cat <<EOF
{
  "name": "persimmon-skills",
  "version": "${VERSION}",
  "generated_at": "${GENERATED_AT}",
  "description": "Persimmon Automation Labs Claude Code skills — master, 12 mothers (workflow forces brainstorm-before-code), specialists. Next.js 16 / TypeScript / Prisma+pgvector / Anthropic SDK / NextAuth v5 / Tailwind v4 / Railway stack.",
  "repo": "https://github.com/Persimmon-Automation-Labs/persimmon-claude-skills",
  "structure": {
    "master": "persimmon",
    "mothers": ["workflow", "stack", "ai", "data", "infra", "security", "quality", "domain-legal", "project-meta", "frontend", "backend", "client-lifecycle"]
  },
  "tooling": {
    "install_script": "scripts/install-in-project.sh",
    "registry_script": "scripts/build-registry.sh",
    "plugin": ".claude-plugin/plugin.json",
    "marketplace": ".claude-plugin/marketplace.json"
  },
  "skills": [${skills_json}
  ]
}
EOF
