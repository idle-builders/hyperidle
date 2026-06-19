#!/bin/bash
# PostToolUse hook for Codex Bash calls. Logs command analytics to
# .pipeline/bash-audit.jsonl without depending on Claude hook wrappers.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .input.command // .command // empty')
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_output.exit_code // .output.exit_code // .exit_code // 0')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // .conversation_id // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

CMD_FIRST=$(echo "$COMMAND" | head -1 | awk '{print $1}')
case "$CMD_FIRST" in
	tsc | npm | npx)
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
			"tsx scripts/"*) CATEGORY="script" ;;
			*) CATEGORY="npm-other" ;;
		esac
		;;
	git) CATEGORY="git" ;;
	gh) CATEGORY="github-cli" ;;
	grep | find | ls | cat | wc | head | tail) CATEGORY="file-search" ;;
	mkdir | rm | cp | mv | touch) CATEGORY="file-ops" ;;
	curl | wget) CATEGORY="http" ;;
	*) CATEGORY="other" ;;
esac

AUDIT_FILE="$ROOT/.pipeline/bash-audit.jsonl"
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
