---
name: slop-scan
description: "Read-only scan for AI-specific code anti-patterns. Run by the adversary agent."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
min_tool_calls: 8
---

# Slop Scan

Read-only scan. Produce findings — do NOT make code changes.

Find recently changed files via git (or use `$ARGUMENTS`).

Flag AI anti-patterns:
- **Verbose naming** — shorten when context is clear
- **Unnecessary comments** — comments that restate the code
- **Over-abstraction** — single-use helpers, trivial wrappers
- **Defensive over-engineering** — null checks for non-nullable types, try-catch around non-throwing code, validation of internal args
- **Unnecessary async** — async on functions that never await
- **Filler** — empty catch blocks, `=== true`, redundant else-return
- **AI tell-tales** — "TODO: implement" on implemented code, "simplified version", "for now", "in production"

Output a list of findings with file paths, line numbers, and what to fix.
