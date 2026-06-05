#!/bin/bash
# PreToolUse hook: blocks two dangerous patterns:
# 1. `git worktree add` that checks out main
# 2. `git commit` while on the main branch
#
# Exit 2 = block the tool call with a reason message.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Extract the leading command (first line, before any pipe/redirect/subshell).
# This avoids false positives from "git commit" appearing inside quoted strings,
# PR bodies, printf args, etc.
LEAD=$(echo "$COMMAND" | head -1 | sed 's/[|;&].*//')

# --- Guard 1: no worktree checkouts of main ---
if echo "$LEAD" | grep -qE '^\s*git\s+worktree\s+add\b'; then
  if echo "$LEAD" | grep -qE '^\s*git\s+worktree\s+add\s+.*\bmain\b'; then
    echo "BLOCKED: cannot check out 'main' in a worktree. Create a feature branch instead: git worktree add <path> -b <type>/<id>-<desc> origin/main"
    exit 2
  fi
fi

# --- Guard 2: no commits on main ---
if echo "$LEAD" | grep -qE '^\s*git\s+commit\b'; then
  CURRENT_BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "BLOCKED: cannot commit to 'main'. You are on branch 'main' — switch to a feature branch first: git checkout -b <type>/<id>-<desc> then commit there. All work must go through a PR."
    exit 2
  fi
fi

# --- Guard 3: no checkout/switch to main inside a worktree ---
if echo "$LEAD" | grep -qE '^\s*git\s+(checkout|switch)\s+main\b'; then
  if git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --is-inside-work-tree &>/dev/null; then
    GIT_DIR=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --git-dir 2>/dev/null || true)
    if echo "$GIT_DIR" | grep -q '/worktrees/'; then
      echo "BLOCKED: cannot switch to 'main' inside a worktree. Stay on your feature branch. If you need the latest main, use: git fetch origin && git rebase origin/main"
      exit 2
    fi
  fi
fi

exit 0
