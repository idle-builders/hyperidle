#!/bin/bash
# PostToolUse hook: logs every Bash command for analytics.
# Output goes to .pipeline/bash-audit.jsonl — queryable via obs:report bash.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_output.exit_code // 0')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Classify command into a category for rollup reporting
CMD_FIRST=$(echo "$COMMAND" | head -1 | awk '{print $1}')
case "$CMD_FIRST" in
  tsc|npm|npx)
    CMD_SECOND=$(echo "$COMMAND" | head -1 | awk '{print $2" "$3}')
    case "$CMD_SECOND" in
      "run check"*) CATEGORY="typecheck" ;;
      "run lint"*) CATEGORY="lint" ;;
      "run test"*) CATEGORY="test" ;;
      "run verify"*) CATEGORY="verify" ;;
      "run dev"*) CATEGORY="dev-server" ;;
      "run build"*) CATEGORY="build" ;;
      "run db"*) CATEGORY="database" ;;
      "install"*) CATEGORY="install" ;;
      "tsx tools/"*) CATEGORY="script" ;;
      *) CATEGORY="npm-other" ;;
    esac
    ;;
  git) CATEGORY="git" ;;
  gh) CATEGORY="github-cli" ;;
  grep|find|ls|cat|wc|head|tail) CATEGORY="file-search" ;;
  mkdir|rm|cp|mv|touch) CATEGORY="file-ops" ;;
  curl|wget) CATEGORY="http" ;;
  *) CATEGORY="other" ;;
esac

AUDIT_FILE="${CLAUDE_PROJECT_DIR:-.}/.pipeline/bash-audit.jsonl"
mkdir -p "$(dirname "$AUDIT_FILE")"

jq -n -c \
  --arg ts "$TIMESTAMP" \
  --arg sid "$SESSION_ID" \
  --arg cmd "$COMMAND" \
  --arg code "$EXIT_CODE" \
  --arg cat "$CATEGORY" \
  '{ts: $ts, session_id: $sid, command: $cmd, exit_code: ($code | tonumber), category: $cat}' \
  >> "$AUDIT_FILE"

exit 0
