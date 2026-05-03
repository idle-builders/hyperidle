---
name: security-review
description: "Read-only security review. Run by the reviewer agent (security lens)."
argument-hint: "[file paths or story-id]"
user-invocable: true
min_tool_calls: 12
---

# Security Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading

1. `plans/<workpackage-id>/architecture.md` — the technical plan, especially its "Security & abuse cases" block
2. The specific authoritative files named in the plan's **Required reading** section that cover trust boundaries and agent permissions (typically a `docs/architecture/<file>.md` and a `docs/agent-layer/<file>.md`)
3. The relevant track file in `plans/work-packages/TRACK-*.md` for the workpackage being reviewed

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

## Absence checks (what SHOULD exist but doesn't)

The above checks find bad patterns that exist. These checks find good patterns that are missing — equally critical:

- **Human-text → agent-context sanitization** — Trace every path where user-supplied text (form fields, message bodies, "reason" strings) reaches agent context, LLM prompts, or is stored for agent consumption. Each path MUST have sanitization (unicode normalization, control char stripping, format char removal). Missing sanitization on any human→agent text path is CRITICAL.
- **Rate limiting on new action endpoints** — Any new endpoint that accepts user-initiated actions (POST/PUT/DELETE) must have per-identity rate limiting. If the story introduces a new user action and no rate limiter is present, that is a CRITICAL finding.
- **Scoped authorization on new resources** — If the story introduces access to resources (threads, tasks, artifacts), verify authorization is scoped to the actor's team/workspace. A missing authz check that defaults to "anyone with a valid session" is CRITICAL.
- **Concurrent-write handling** — If the story introduces a create-or-update pattern (e.g., "ensure thread exists, then post to it"), check for race conditions. Two simultaneous requests must not create duplicate resources or corrupt state.

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.

## Target

$ARGUMENTS
