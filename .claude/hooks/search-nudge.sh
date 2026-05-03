#!/usr/bin/env bash
# PreToolUse hook on Bash. When the model reaches for raw grep/find/git-grep
# to search code, allow the call but inject a context note pointing it at
# the right tool — `bun run search` (ripgrep + ast-grep dispatch) for text
# and structural matches, the language-server MCP tools for symbol queries.
#
# Why a hook and not just doc: the model already knows the docs. The trap
# is reflex — it types `grep -r` before reading CLAUDE.md. The hook is a
# situational nudge fired at exactly the moment the wrong choice happens.
#
# Allowlist (no nudge):
#   - bun run search ...        (the dispatcher itself)
#   - rg ...                    (already the right tool, just direct)
#   - grep used in pipes after a known-good source (heuristic: stdin pipe)
#   - grep against a single file path the model already opened
#   - vendored / generated paths the model is sanity-checking

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

# Strip leading "cd ... && " to look at the real command.
trimmed="${cmd#cd *&& }"

# Allowlist — let these through silently.
case "$trimmed" in
	"bun run search"*|"bun scripts/search.ts"*) exit 0 ;;
	"rg "*|"rg") exit 0 ;;
esac

# Detect the offending invocation. We only nudge on commands that look like
# code search across many files — not single-file grepping, not piped
# filtering, not log scraping.
nudge=""
case "$trimmed" in
	*"grep -r"*|*"grep --recursive"*|*"grep -R"*) nudge="grep -r" ;;
	*"git grep"*) nudge="git grep" ;;
	"find "*-name*|"find "*-iname*|"find "*-regex*) nudge="find" ;;
esac

# `grep ... <glob>` across many files — also a likely code search.
if [[ -z "$nudge" ]] && [[ "$trimmed" =~ ^grep[[:space:]] ]]; then
	# Heuristic: arguments contain a path with a wildcard, or two-or-more file args.
	if [[ "$trimmed" == *"*"* ]] || [[ "$trimmed" == *" packages/"* ]] || [[ "$trimmed" == *" .claude/"* ]]; then
		nudge="grep"
	fi
fi

if [[ -z "$nudge" ]]; then
	exit 0
fi

# Emit allow + additionalContext so the model sees the suggestion and learns
# the lane the next time. permissionDecisionReason is shown to the user.
python3 - <<PY
import json
print(json.dumps({
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "search-nudge: '${nudge}' is a code-search reflex; CLAUDE.md > Code Search lists better lanes.",
    "additionalContext": (
      "search-nudge: you ran '${nudge}' for code search. For TypeScript, prefer:\n"
      "  - MCP tools 'references' / 'definition' / 'diagnostics' (mcp-language-server) for symbol queries\n"
      "  - bun run search '<pattern>' [path]  — auto-dispatches regex→ripgrep, structural \$METAVAR→ast-grep\n"
      "Use raw grep/find only for non-code text or single-file inspection."
    ),
  }
}))
PY
