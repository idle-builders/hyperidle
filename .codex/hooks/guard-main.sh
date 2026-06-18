#!/bin/bash
# PreToolUse hook for Codex Bash calls. Blocks dangerous git branch patterns
# without depending on Claude-specific env vars or hook scripts.
# Exit 2 = block the tool call with a reason message.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .input.command // .command // empty')

# Extract the leading command (first line, before any pipe/redirect/subshell).
# This avoids false positives from "git commit" appearing inside quoted strings.
LEAD=$(echo "$COMMAND" | head -1 | sed 's/[|;&].*//')

# --- Guard 1: no worktree checkouts of main ---
if echo "$LEAD" | grep -qE '^\s*git\s+worktree\s+add\b'; then
	if echo "$LEAD" | grep -qE '^\s*git\s+worktree\s+add\s+.*\bmain\b'; then
		echo "BLOCKED: cannot check out 'main' in a worktree. Create a feature branch instead: git worktree add <path> -b <type>/<id>-<desc> origin/main"
		exit 2
	fi
fi

# --- Guard 2: no commits on main (worktree-aware) ---
if echo "$LEAD" | grep -qE '^[[:space:]]*git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit\b'; then
	TARGET_DIR=$(echo "$LEAD" | grep -oE '[[:space:]]-C[[:space:]]+[^[:space:]]+' | head -1 | sed -E 's/^.*-C[[:space:]]+//' || true)
	if [ -z "$TARGET_DIR" ]; then
		TARGET_DIR=$(echo "$INPUT" | jq -r '.cwd // .tool_input.cwd // empty')
	fi
	CURRENT_BRANCH=$(git -C "${TARGET_DIR:-$ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
	if [ "$CURRENT_BRANCH" = "main" ]; then
		echo "BLOCKED: cannot commit to 'main'. You are on branch 'main' — switch to a feature branch first: git checkout -b <type>/<id>-<desc> then commit there. All work must go through a PR."
		exit 2
	fi
fi

# --- Guard 3: no checkout/switch to main inside a worktree ---
if echo "$LEAD" | grep -qE '^\s*git\s+(checkout|switch)\s+main\b'; then
	if git -C "$ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
		GIT_DIR=$(git -C "$ROOT" rev-parse --git-dir 2>/dev/null || true)
		if echo "$GIT_DIR" | grep -q '/worktrees/'; then
			echo "BLOCKED: cannot switch to 'main' inside a worktree. Stay on your feature branch. If you need the latest main, use: git fetch origin && git rebase origin/main"
			exit 2
		fi
	fi
fi

exit 0
