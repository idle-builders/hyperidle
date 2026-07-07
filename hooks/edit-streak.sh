#!/bin/bash
# Post-edit hook — nudge the orchestrator to delegate after THRESHOLD edits.
# Format arg: claude|cursor|gemini|codex|copilot  (controls the output JSON shape).
#
# The per-tool config matcher restricts this to edit tools; the script also
# self-guards (only counts edit-like tool names) so a loose matcher can't make it
# count reads. Subagent edits are skipped where the tool exposes them (Claude:
# agent_id) — the builder doing edits is its job. Other tools don't surface the
# orchestrator/subagent distinction at the tool level, so there the nudge is
# best-effort and may also fire inside a subagent.
THRESHOLD=5
fmt="${1:-claude}"

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)

# Claude: skip edits made inside a subagent.
agent_id=$(printf '%s' "$input" | jq -r '.agent_id // empty')
[ -n "$agent_id" ] && exit 0

# Only count edit-like tools (field name varies: tool_name / toolName).
tool=$(printf '%s' "$input" | jq -r '.tool_name // .toolName // empty')
if [ -n "$tool" ] && ! printf '%s' "$tool" | grep -qiE 'edit|write|patch|replace|notebook'; then
  exit 0
fi

sid=$(printf '%s' "$input" | jq -r '.session_id // .sessionId // .conversation_id // "default"')
dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}"
file="$dir/agent-pipeline-edit-streak.$sid"

n=$(cat "$file" 2>/dev/null || echo 0); n=$((n + 1))
if [ "$n" -lt "$THRESHOLD" ]; then
  echo "$n" > "$file" 2>/dev/null
  exit 0
fi
echo 0 > "$file" 2>/dev/null

msg="You've made $THRESHOLD direct code edits in a row. You're the orchestrator — delegate to your team instead of doing the heavy lifting yourself: the builder implements & ships, the planner plans & structures, the reviewer reviews & critiques. Hand structured work to a subagent."

case "$fmt" in
  cursor)  jq -cn --arg m "$msg" '{additional_context:$m}' ;;
  gemini)  jq -cn --arg m "$msg" '{hookSpecificOutput:{additionalContext:$m}}' ;;
  codex)   jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}' ;;
  copilot) jq -cn --arg m "$msg" '{additionalContext:$m}' ;;
  *)       jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}' ;;  # claude
esac
