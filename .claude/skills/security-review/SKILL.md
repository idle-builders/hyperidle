---
name: security-review
description: "Read-only security review. Run by the security-researcher agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
min_tool_calls: 12
---

# Security Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading

1. `plans/architecture/<story-id>.md` — the technical plan, especially its "Security & abuse cases" block
2. The specific authoritative files named in the plan's **Required reading** section that cover trust boundaries and agent permissions (typically a `docs/architecture/<file>.md` and a `docs/agent-layer/<file>.md`)
3. The relevant track file in `plans/work-packages/TRACK-*.md` for the story being reviewed

Then read ALL changed files (via `<target>` or `git diff --name-only`). Focus on new trust boundaries.

## Be thorough

Check every endpoint for input validation. Check every use of `dangerouslySetInnerHTML`. Check every `eval`, `new Function`, template literal in SQL/HTML. Check that agent-authored content is never rendered unsanitized. Grep for known dangerous patterns — don't rely on just reading the changed files.

## Review for:
- **STRIDE** — Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege
- **Input validation** — unsanitized user input, missing schema validation at boundaries
- **Auth** — missing authorization checks, leaked internal state, privilege escalation
- **OWASP top 10** — injection, broken access control, cryptographic failures, SSRF
- **Agent-specific** — prompt injection, workspace escape, knowledge poisoning, tool misuse
- **XSS** — `dangerouslySetInnerHTML`, unescaped template literals, innerHTML assignments
- **Dangerous patterns** — grep for `eval`, `Function(`, `innerHTML`, `dangerouslySetInnerHTML`, `child_process`, `exec(` across the codebase, not just changed files

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.

## Target

$ARGUMENTS
