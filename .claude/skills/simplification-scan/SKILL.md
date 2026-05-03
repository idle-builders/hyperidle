---
name: simplification-scan
description: "Read-only scan for over-abstraction and dead code. Run by the adversary agent."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
min_tool_calls: 8
---

# Simplification Scan

Read-only scan. Produce findings — do NOT make code changes.

Find recently changed files via `git diff --name-only HEAD~1` (or use `<target>`).

Flag: helpers used only once (inline them), premature generics, dead code, unused exports, commented-out code, error handling for impossible scenarios, unnecessary async, wrapper types adding no value — generally anything where the same result could be achieved with simpler means.

Output a list of findings with file paths, line numbers, and what to simplify.

## Target

$ARGUMENTS
