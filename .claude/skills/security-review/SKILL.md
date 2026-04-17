---
name: security-review
description: "Read-only security review. Run by the security-researcher agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Security Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading

1. `docs/ARCHITECTURE.md` — trust boundaries, layer separation, deployment model
2. `docs/AGENT_LAYER.md` — agent permissions, workspace isolation, tool restrictions
3. The relevant track file in `docs/work-packages/TRACK-*.md` for the story being reviewed

Then read ALL changed files (via `$ARGUMENTS` or `git diff --name-only`). Focus on new trust boundaries.

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
