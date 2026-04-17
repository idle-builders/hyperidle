---
name: architecture-review
description: "Read-only architectural review. Run by the architect agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Architecture Review

Read-only review. Produce findings — do NOT make code changes.

Read the relevant architecture docs (`docs/ARCHITECTURE.md`, `docs/PROCESS_LAYER.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`) and the changed files (via `$ARGUMENTS` or `git diff --name-only`).

Review for:
- **Layer violations** — does any layer reach past its neighbor?
- **API contracts** — do routes, methods, request/response shapes match architecture docs?
- **Data model alignment** — do fields, types, constraints match schema requirements?
- **Naming** — do names honestly describe what things do?
- **Component boundaries** — is responsibility correctly assigned across packages?

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.
