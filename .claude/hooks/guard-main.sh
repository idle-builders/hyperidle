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
# Strip any "<remote>/main" occurrences (e.g. "origin/main") before checking for a
# bare "main" token, so `git worktree add <path> -b <branch> origin/main` — the
# mandated base-ref pattern — isn't false-flagged by the word-boundary match on
# "main" inside "origin/main". BSD sed (macOS default) has no \b in -E mode, so
# use bracket-expression boundaries instead: strip "<remote>/main" only when
# followed by a non-word char or end-of-string, preserving that trailing char.
if echo "$LEAD" | grep -qE '^\s*git\s+worktree\s+add\b'; then
  LEAD_NO_REMOTE_MAIN=$(echo "$LEAD" | sed -E 's#[A-Za-z0-9_.-]+/main([^A-Za-z0-9_]|$)#\1#g')
  if echo "$LEAD_NO_REMOTE_MAIN" | grep -qE '^\s*git\s+worktree\s+add\s+.*\bmain\b'; then
    echo "BLOCKED: cannot check out 'main' in a worktree. Create a feature branch instead: git worktree add <path> -b <type>/<id>-<desc> origin/main"
    exit 2
  fi
fi

# --- Guard 2: no commits on main (worktree-aware) ---
# Block only when the commit actually TARGETS a checkout that is on 'main'.
# Resolve the repo the commit runs against from the command itself, not from
# CLAUDE_PROJECT_DIR — otherwise a worktree commit (on a feature branch) gets
# blocked just because the primary checkout happens to be on main, which is the
# bug that forced the "detach main during pipeline" workaround. Precedence:
#   1. explicit `git -C <dir>` in the command
#   2. the tool's working directory (`.cwd` from the hook payload)
#   3. CLAUDE_PROJECT_DIR / cwd as a last resort
if echo "$LEAD" | grep -qE '^[[:space:]]*git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit\b'; then
  TARGET_DIR=$(echo "$LEAD" | grep -oE '[[:space:]]-C[[:space:]]+[^[:space:]]+' | head -1 | sed -E 's/^.*-C[[:space:]]+//' || true)
  if [ -z "$TARGET_DIR" ]; then
    TARGET_DIR=$(echo "$INPUT" | jq -r '.cwd // empty')
  fi
  CURRENT_BRANCH=$(git -C "${TARGET_DIR:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
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
