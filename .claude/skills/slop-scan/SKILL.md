---
name: slop-scan
description: "Detect and fix AI-specific code anti-patterns that linters miss."
argument-hint: "[file paths or 'all' for recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Slop Scan

**Why:** AI code has predictable failure modes that linters can't catch — verbose names, restating comments, defensive checks for impossible states. These patterns make code harder to read and maintain. Catching them now prevents them from becoming the "style" of the codebase.

Find recently changed files via git (or use `$ARGUMENTS`).

Scan for AI anti-patterns and fix them:
- **Verbose naming** — shorten when context is clear
- **Unnecessary comments** — delete comments that restate the code
- **Over-abstraction** — inline single-use helpers, remove trivial wrappers
- **Defensive over-engineering** — remove null checks for non-nullable types, try-catch around non-throwing code, validation of internal args
- **Unnecessary async** — remove async from functions that never await
- **Filler** — remove empty catch blocks, `=== true`, redundant else-return
- **AI tell-tales** — remove "TODO: implement" on implemented code, "simplified version", "for now", "in production"

Run `bun run check && bun run lint && bun run test` after. Revert anything that breaks.
