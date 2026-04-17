---
name: security-review
description: "Read-only security review. Run by the security-researcher agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Security Review

Read-only review. Produce findings — do NOT make code changes.

Read the changed files (via `$ARGUMENTS` or `git diff --name-only`). Focus on new trust boundaries.

Review for:
- **STRIDE** — Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege
- **Input validation** — unsanitized user input, missing schema validation at boundaries
- **Auth** — missing authorization checks, leaked internal state, privilege escalation
- **OWASP top 10** — injection, broken access control, cryptographic failures, SSRF
- **Agent-specific** — prompt injection, workspace escape, knowledge poisoning, tool misuse

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.
